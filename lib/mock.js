// ---------------------------------------------------------------------------
// Mock mode — lets the whole game loop run with no API key. Generates
// painterly-ish procedural SVG scenes rendered to JPEG via sharp, plus canned
// world data. Real mode swaps these calls for OpenRouter without touching the
// rest of the pipeline.
// ---------------------------------------------------------------------------

import sharp from 'sharp';

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

const MOCK_CHARACTERS = [
  {
    name: 'Maren the Tide-Keeper',
    appearance: 'a weathered woman in an oilskin coat the color of kelp, silver hair braided with cord',
    personality: 'Dry, patient, speaks in short tidal metaphors. Warms slowly to strangers.',
    knowledge: 'She tends the last working listening-pool and remembers the night the Tidewrights sailed.',
    agenda: 'Wants the player to find the brass tuning key lost somewhere on the north shore.',
    position: 'standing at the edge of the scene, small in frame',
  },
  {
    name: 'Odo',
    appearance: 'a round moss-covered creature with lantern eyes, no taller than a barrel',
    personality: 'Cheerful, forgetful, hums between sentences. Collects smooth stones.',
    knowledge: 'Knows every tunnel under the island but cannot remember why they were dug.',
    agenda: 'Wants to trade a smooth stone for any object the player carries.',
    position: 'perched on a rock in the middle distance',
  },
];

const MOCK_OBJECTS = [
  { name: 'sea-glass lens', description: 'A palm-sized disc of frosted green glass; things look older through it.', position: 'half-buried in the foreground' },
  { name: 'knotted signal cord', description: 'Seven knots, each a different word in a language of ropes.', position: 'hanging from a post at the left' },
  { name: 'brass tuning key', description: 'Heavy, cold, and faintly humming — it wants to be turned.', position: 'resting on a flat stone, catching the light' },
];

const PLACES = [
  ['Shattered Pier', 'A stone pier reaches into green water, its far half collapsed into weed-wrapped blocks. Gulls have made parliament on the pilings.'],
  ['The Whistling Terraces', 'Grass terraces climb the hillside, each edged with hollow pipes that moan in the wind. Something metallic glints two levels up.'],
  ['Hollow of Blue Pines', 'You stand beneath pines with bark like verdigris. The light comes down in shafts, and the air smells of resin and salt.'],
  ['The Listening Pool', 'A perfectly circular pool of black water sits in a ring of carved stone. Ripples cross it though there is no wind.'],
  ['Horn Cliff', 'A great brass horn, green with age, juts from the cliff face out over the sea. A ladder of iron staples climbs to its mouth.'],
  ['The Cartographer’s Ruin', 'Low walls trace the rooms of a fallen house. On the one standing wall, a faded painted map of the island peels in the sun.'],
];

export function mockClickResult(depth, maxDepth, x, y) {
  const rand = hashSeed(`${depth}:${x.toFixed(2)}:${y.toFixed(2)}`);
  const place = PLACES[Math.floor(rand() * PLACES.length)];
  let direction = 'deeper';
  if (y < 0.14 && depth > 0) direction = 'up';
  else if (depth >= maxDepth) direction = 'lateral';
  else if (depth > 0 && rand() > 0.8) direction = 'lateral';
  return {
    target: place[0].toLowerCase(),
    description: place[1].split('.')[0] + '.',
    direction,
    reason: 'mock mode',
  };
}

export function mockScene({ target, depth }) {
  const rand = hashSeed(`scene:${target}:${depth}`);
  const place = PLACES[Math.floor(rand() * PLACES.length)];
  const withChar = rand() > 0.6;
  const withObj = rand() > 0.45;
  return {
    name: depth === 0 ? 'The Island' : place[0],
    description:
      depth === 0
        ? 'The island lies below you like an instrument left on a table: a ring of green heights around a still blue eye of water, beaches like worn brass fittings.'
        : place[1],
    imagePrompt: `${place[0]}: ${place[1]}`,
    ambience: depth === 0 ? 'wind' : ['surf', 'wind', 'forest', 'hum', 'water', 'cavern'][Math.floor(rand() * 6)],
    character: depth > 0 && withChar ? MOCK_CHARACTERS[Math.floor(rand() * MOCK_CHARACTERS.length)] : null,
    objects: depth > 0 && withObj ? [MOCK_OBJECTS[Math.floor(rand() * MOCK_OBJECTS.length)]] : [],
  };
}

export function mockLocate(names) {
  const rand = hashSeed(`locate:${names.join()}`);
  return {
    features: names.map((name) => ({
      name,
      found: true,
      x: 0.2 + rand() * 0.6,
      y: 0.45 + rand() * 0.35,
      radius: 0.05,
    })),
  };
}

export function mockChatReply(character, messages) {
  const turns = messages.filter((m) => m.role === 'assistant').length;
  const lines = [
    `Hm. Another walker. The tide said you'd come.`,
    `${character.agenda} That's all I'll say plainly.`,
    `Ask the island, not me. It answers slower but it never lies.`,
    `You've the look of someone who opens doors just to hear the hinge.`,
    `Enough now. The water wants listening to. Walk well. [FAREWELL]`,
  ];
  return lines[Math.min(turns, lines.length - 1)];
}
