// ---------------------------------------------------------------------------
// Mock mode — lets the whole game loop run with no API key. Generates
// painterly-ish procedural SVG scenes rendered to JPEG via sharp, plus canned
// world data. Real mode swaps these calls for OpenRouter without touching the
// rest of the pipeline.
// ---------------------------------------------------------------------------

import sharp from 'sharp';
import { destinationsFrom } from './world.js';

const PALETTES = [
  { sky: ['#0e3a5c', '#2e7ea6'], land: ['#8a8a3e', '#5c6e2e'], accent: '#c9622f' },
  { sky: ['#123c63', '#3a86ad'], land: ['#7a6a35', '#4e5e2a'], accent: '#b04861' },
  { sky: ['#0b2f4e', '#256e94'], land: ['#96863f', '#647032'], accent: '#c9812f' },
];

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export async function mockImage(seedText, label) {
  const rand = hashSeed(seedText);
  const p = PALETTES[Math.floor(rand() * PALETTES.length)];
  const W = 1600;
  const H = 1000;
  let hills = '';
  for (let layer = 0; layer < 4; layer++) {
    const baseY = 380 + layer * 150 + rand() * 60;
    let d = `M0 ${H} L0 ${baseY}`;
    for (let x = 0; x <= W; x += 100) {
      d += ` L${x} ${baseY - Math.sin(x / (140 + layer * 40) + rand() * 6) * (90 - layer * 15) - rand() * 40}`;
    }
    d += ` L${W} ${H} Z`;
    const shade = layer / 4;
    hills += `<path d="${d}" fill="${layer % 2 ? p.land[0] : p.land[1]}" opacity="${0.55 + shade * 0.45}"/>`;
  }
  let blobs = '';
  for (let i = 0; i < 10; i++) {
    blobs += `<ellipse cx="${rand() * W}" cy="${560 + rand() * 380}" rx="${30 + rand() * 90}" ry="${14 + rand() * 40}" fill="${rand() > 0.75 ? p.accent : p.land[1]}" opacity="${0.25 + rand() * 0.4}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.72" cy="0.2" r="0.5">
      <stop offset="0" stop-color="#f8ecc9" stop-opacity="0.9"/><stop offset="1" stop-color="#f8ecc9" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#sun)"/>
  ${hills}${blobs}
  <text x="${W / 2}" y="${H - 46}" font-family="Georgia, serif" font-size="34" fill="#f4e8c8" text-anchor="middle" opacity="0.85">${label} — placeholder art (set OPENROUTER_API_KEY for real generation)</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

// --- Deterministic feature positions ----------------------------------------
// Each key maps to a stable position so mockLocate and mockClickChoice agree.

function mockPos(key) {
  const rand = hashSeed(`loc:${key}`);
  return {
    x: 0.15 + rand() * 0.7, // 0.15 - 0.85
    y: 0.4 + rand() * 0.4,  // 0.4 - 0.8
    radius: 0.05 + rand() * 0.02, // 0.05 - 0.07
  };
}

// Set-of-marks grid geometry, mirroring server.js (14 cols x 10 rows = 140).
const GRID_COLS = 14;
const GRID_ROWS = 10;

/**
 * The 4-6 numbered cells (1..140) surrounding a deterministic point, so mock
 * mode exercises the same cells -> box conversion path as LIVE. Cell number =
 * row*14 + col + 1, counting left-to-right then top-to-bottom.
 */
function cellsAround(x, y, r) {
  const c0 = Math.max(0, Math.floor((x - r) * GRID_COLS));
  const c1 = Math.min(GRID_COLS - 1, Math.floor((x + r) * GRID_COLS));
  const r0 = Math.max(0, Math.floor((y - r * 1.4) * GRID_ROWS));
  const r1 = Math.min(GRID_ROWS - 1, Math.floor((y + r * 1.4) * GRID_ROWS));
  const cells = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      cells.push(row * GRID_COLS + col + 1);
    }
  }
  return cells.length ? cells : [Math.floor(y * GRID_ROWS) * GRID_COLS + Math.floor(x * GRID_COLS) + 1];
}

/** features = [{ key, ask }]. Returns selected cells for every key, all found. */
export function mockLocate(features) {
  return {
    features: features.map((f) => {
      const pos = mockPos(f.key);
      return {
        key: f.key,
        found: true,
        cells: cellsAround(pos.x, pos.y, pos.radius),
      };
    }),
  };
}

// --- Scripted chat ----------------------------------------------------------
// Text is derived from the character's authored CAST fields, not hand-authored
// per character. Turn = number of assistant replies already spoken.

function firstSentence(text) {
  if (!text) return '';
  const m = String(text).match(/^[^.!?]*[.!?]/);
  const s = (m ? m[0] : String(text)).trim();
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

export function mockChatReply(character, chat) {
  const turn = (chat.messages || []).filter((m) => m.role === 'assistant').length;
  switch (turn) {
    case 0: // greet
      return `${firstSentence(character.personality)} You've come a long way to reach ${character.name}.`;
    case 1: // deflection / riddle hinting at the agenda
      return firstSentence(character.agenda);
    case 2: // the heart of their knowledge, plainly — earns the clue
      return `${firstSentence(character.knowledge)} [CLUE]`;
    case 3: // point onward
      return firstSentence(character.pointsTo);
    default: // parting
      return `That is all I have to give you. Walk well. [FAREWELL]`;
  }
}

// --- Observations -----------------------------------------------------------
// A dead click becomes a small piece of writing. Deterministic per node+cell so
// repeat clicks read the same line (the server also caches them in the overlay).

const OBSERVATIONS = [
  'Moss has crept over the stone here, soft and unhurried, keeping a slow green time.',
  'The wind moves through and takes nothing, leaving only the memory of a chord.',
  'Bare stone, worn smooth by patient weather and, for years now, no hands at all.',
  'Far off, the sea holds its pale unbroken line, indifferent to whoever watches it.',
  'A cool blue shadow pools in the hollows here, deepening quietly as you look.',
  'Something small has grown in the quiet, green and reaching for a thread of light.',
  'The surface is worn to a dull shine, still holding the shape of an old craft.',
  'Dust drifts through the light, each mote turning slowly, going nowhere at all.',
  'The distance blurs to haze, where the island forgets itself against the sky.',
  'Water has left its mark here, a long stain like a note that was held too long.',
];

export function mockObservation(nodeId, x, y) {
  const cell = `${Math.round(x * 10)},${Math.round(y * 10)}`;
  const rand = hashSeed(`obs:${nodeId}:${cell}`);
  return OBSERVATIONS[Math.floor(rand() * OBSERVATIONS.length)];
}

// --- Click fallback ---------------------------------------------------------
// Nearest authored nav destination (children + laterals) to the click, using
// the same deterministic positions as mockLocate. Beyond 0.3, 'none'.

export function mockClickChoice(node, x, y) {
  const dests = destinationsFrom(node.id).filter((d) => d.kind !== 'up');
  let best = null;
  let bestDist = Infinity;
  for (const d of dests) {
    const p = mockPos(d.id);
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = d.id;
    }
  }
  return bestDist <= 0.3 ? best : 'none';
}
