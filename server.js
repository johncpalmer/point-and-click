// ---------------------------------------------------------------------------
// ISLAND — game server (authored-world edition)
// The world is a fixed graph (lib/world.js). The AI does three jobs:
//   (a) paint each node's scene once, lazily, cached;
//   (b) locate visible features in the painting so hotspots sit on real pixels;
//   (c) play the caretakers in chat.
// Clicks resolve ONLY to authored destinations of the current node, or are
// "blocked" — the AI never invents scenes. Falls back to a fully playable mock
// mode when OPENROUTER_API_KEY is unset.
// ---------------------------------------------------------------------------

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import sharp from 'sharp';

import * as or from './lib/openrouter.js';
import * as store from './lib/store.js';
import * as mock from './lib/mock.js';
import {
  getNode,
  castAt,
  objectsAt,
  destinationsFrom,
  MAX_DEPTH,
  CAST,
  OBJECTS,
  CLUES,
} from './lib/world.js';
import {
  buildImagePrompt,
  locateSystemPrompt,
  locateUserPrompt,
  clickSystemPrompt,
  clickUserPrompt,
  chatSystemPrompt,
  blockedLines,
} from './lib/prompts.js';

const PORT = process.env.PORT || 3000;
const LIVE = or.hasKey();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.resolve('public')));
app.use('/images', express.static(store.imagesDir(), { maxAge: '1y', immutable: true }));

const clamp = (v) => Math.min(0.97, Math.max(0.03, v));
const blockedLine = () => blockedLines[Math.floor(Math.random() * blockedLines.length)];

// --- Scene realization pipeline ---------------------------------------------
// Paint an authored node once (cached), then locate its features so hotspots
// land on real pixels. Idempotent: returns cached overlay if it exists.

async function realizeNode(nodeId) {
  const cached = store.getNodeData(nodeId);
  if (cached) return cached;

  const node = getNode(nodeId);
  if (!node) throw new Error(`unknown node: ${nodeId}`);
  console.log(`[realize] ${nodeId} — painting scene`);

  // 1. Paint the scene.
  let imgBuffer;
  if (LIVE) {
    imgBuffer = await or.generateImage(buildImagePrompt(node));
    imgBuffer = await sharp(imgBuffer).resize(1600, 1000, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
  } else {
    imgBuffer = await mock.mockImage(nodeId, node.name);
  }
  const image = store.saveImage(nodeId, imgBuffer);

  // 2. Build the feature list to locate: nav destinations (children + laterals,
  //    NOT parent) + the resident character + visible objects.
  const cast = castAt(nodeId);
  const objs = objectsAt(nodeId);
  const navDests = destinationsFrom(nodeId).filter((d) => d.kind !== 'up');

  const features = [];
  for (const d of navDests) {
    features.push({
      key: `nav:${d.id}`,
      kind: d.kind,
      destId: d.id,
      name: d.name,
      ask: `the visible feature of this scene that a player would click to travel to "${d.name}" (${d.desc}). If that feature is off-frame or not visible, set found:false.`,
    });
  }
  if (cast) features.push({ key: 'character', ask: cast.appearance });
  for (const o of objs) features.push({ key: `obj:${o.id}`, ask: `${o.name} — ${o.position}` });

  // 3. One vision pass.
  console.log(`[realize] ${nodeId} — locating ${features.length} feature(s)`);
  let located = {};
  if (features.length) {
    let result;
    try {
      result = LIVE
        ? or.parseJson(await or.chatWithImage(locateSystemPrompt(), locateUserPrompt(features), imgBuffer))
        : mock.mockLocate(features);
    } catch (err) {
      console.error(`[realize] ${nodeId} — locate failed, using fallbacks:`, err.message);
      result = { features: [] };
    }
    for (const f of result.features || []) located[f.key] = f;
  }

  const usable = (f) => f && f.found !== false && typeof f.x === 'number' && typeof f.y === 'number';

  // 4. Nav points, with authored fallbacks for anything not confidently found.
  const navPoints = [];
  let childIdx = 0;
  let latIdx = 0;
  const childXs = [0.25, 0.5, 0.75];
  for (const d of navDests) {
    const f = located[`nav:${d.id}`];
    let pos;
    if (usable(f)) {
      pos = { x: f.x, y: f.y, radius: f.radius || 0.07 };
    } else if (d.kind === 'lateral') {
      pos = { x: latIdx % 2 === 0 ? 0.06 : 0.94, y: 0.55, radius: 0.07 };
      latIdx++;
    } else {
      pos = { x: childXs[childIdx % childXs.length], y: 0.6, radius: 0.07 };
      childIdx++;
    }
    navPoints.push({
      nodeId: d.id,
      name: d.name,
      kind: d.kind,
      x: clamp(pos.x),
      y: clamp(pos.y),
      radius: pos.radius,
    });
  }

  // 5. Character hotspot.
  let characterHotspot = null;
  if (cast) {
    const f = located.character;
    characterHotspot = usable(f)
      ? { x: clamp(f.x), y: clamp(f.y), radius: f.radius || 0.06 }
      : { x: 0.5, y: 0.62, radius: 0.06 };
  }

  // 6. Object hotspots.
  const objectHotspots = {};
  objs.forEach((o, i) => {
    const f = located[`obj:${o.id}`];
    objectHotspots[o.id] = usable(f)
      ? { x: clamp(f.x), y: clamp(f.y), radius: f.radius || 0.05 }
      : { x: clamp(0.35 + i * 0.3), y: 0.72, radius: 0.05 };
  });

  const data = { image, navPoints, characterHotspot, objectHotspots };
  store.saveNodeData(nodeId, data);
  console.log(`[realize] ${nodeId} — done (${navPoints.length} navPoints)`);
  return data;
}

// --- Public view of a node (assumes it has been realized) -------------------

function publicScene(nodeId) {
  const node = getNode(nodeId);
  const data = store.getNodeData(nodeId);
  const state = store.getState();
  const cast = castAt(nodeId);

  store.addVisited(nodeId);

  return {
    id: node.id,
    name: node.name,
    depth: node.depth,
    parentId: node.parent,
    desc: node.desc,
    ambience: node.ambience,
    image: data.image,
    maxDepth: MAX_DEPTH,
    navPoints: data.navPoints,
    character: cast ? { id: cast.id, name: cast.name, hotspot: data.characterHotspot } : null,
    objects: objectsAt(nodeId)
      .filter((o) => !state.inventory.includes(o.id))
      .map((o) => ({
        id: o.id,
        name: o.name,
        description: o.description,
        hotspot: data.objectHotspots[o.id],
      })),
  };
}

// --- Shared views ------------------------------------------------------------

function inventoryView() {
  return store.getState().inventory.map((id) => {
    const o = OBJECTS[id];
    return { id, name: o.name, description: o.description };
  });
}

function journalView() {
  return store.getState().journal.map((id) => {
    const c = CLUES[id];
    return { id, title: c.title, text: c.text };
  });
}

// --- Chat token handling -----------------------------------------------------
// [CLUE] (first reveal only) → record the fragment. [FAREWELL] → end. Strip
// both from the visible reply, and persist the assistant turn to memory.

function finishReply(characterId, character, raw) {
  const text = String(raw || '');
  const ended = /\[FAREWELL\]\s*$/.test(text.trim());

  const chat = store.getChat(characterId);
  let newClue = null;
  if (text.includes('[CLUE]') && !chat.clueGiven) {
    store.markClueGiven(characterId);
    store.addClue(character.clue);
    const c = CLUES[character.clue];
    newClue = { id: character.clue, title: c.title, text: c.text };
  }

  const reply = text.replace(/\[CLUE\]/g, '').replace(/\[FAREWELL\]/g, '').trim();
  store.appendChat(characterId, 'assistant', reply);
  return { reply, ended, newClue };
}

function buildCtx(characterId) {
  const chat = store.getChat(characterId);
  return {
    inventory: store.getState().inventory.map((id) => OBJECTS[id]),
    journalTitles: store.getState().journal.map((id) => CLUES[id].title),
    clueGiven: chat.clueGiven,
    cluesFound: store.getState().journal.length,
  };
}

// --- Routes ------------------------------------------------------------------

app.get('/api/status', (req, res) => {
  res.json({ live: LIVE, maxDepth: MAX_DEPTH, title: 'CADENCE' });
});

app.get('/api/state', (req, res) => {
  res.json({
    inventory: inventoryView(),
    journal: journalView(),
    cluesTotal: Object.keys(CLUES).length,
  });
});

app.post('/api/root', async (req, res) => {
  try {
    await realizeNode('island');
    res.json({ scene: publicScene('island') });
  } catch (err) {
    console.error('root failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ascend', async (req, res) => {
  try {
    const { nodeId } = req.body;
    const node = getNode(nodeId);
    if (!node) return res.status(404).json({ error: 'unknown node' });
    if (!node.parent) return res.json({ result: 'blocked', message: blockedLine() });
    await realizeNode(node.parent);
    res.json({ result: 'moved', direction: 'up', scene: publicScene(node.parent) });
  } catch (err) {
    console.error('ascend failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/click', async (req, res) => {
  try {
    const { nodeId, x, y } = req.body;
    const node = getNode(nodeId);
    if (!node) return res.status(404).json({ error: 'unknown node' });

    const data = await realizeNode(nodeId);

    // Move helper.
    const move = async (destId, direction) => {
      await realizeNode(destId);
      console.log(`[click] ${nodeId} -> ${destId} (${direction})`);
      res.json({ result: 'moved', direction, target: getNode(destId).name, scene: publicScene(destId) });
    };

    // (1) Top-edge click while a parent exists → ascend.
    if (y < 0.07 && node.parent) {
      return move(node.parent, 'up');
    }

    // (2) Nearest precomputed navPoint within reach.
    let best = null;
    let bestDist = Infinity;
    for (const np of data.navPoints) {
      const dist = Math.hypot(np.x - x, np.y - y);
      if (dist <= Math.max(np.radius * 1.7, 0.09) && dist < bestDist) {
        bestDist = dist;
        best = np;
      }
    }
    if (best) return move(best.nodeId, best.kind);

    // (3) Vision (or mock) fallback — validated against authored destinations.
    const dests = destinationsFrom(nodeId); // includes parent (kind 'up')
    let choice = 'none';
    if (LIVE) {
      try {
        const marked = await markClick(store.imagePath(nodeId), x, y);
        const raw = await or.chatWithImage(clickSystemPrompt(dests), clickUserPrompt(node), marked);
        choice = or.parseJson(raw).choice || 'none';
      } catch (err) {
        console.error('[click] vision fallback failed:', err.message);
        choice = 'none';
      }
    } else {
      choice = mock.mockClickChoice(node, x, y);
    }

    const chosen = dests.find((d) => d.id === choice);
    if (chosen) return move(chosen.id, chosen.kind);

    // (4) Nothing there.
    console.log(`[click] ${nodeId} — blocked`);
    return res.json({ result: 'blocked', message: blockedLine() });
  } catch (err) {
    console.error('click failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/take', (req, res) => {
  try {
    const { nodeId, objectId } = req.body;
    const obj = OBJECTS[objectId];
    if (!obj || obj.node !== nodeId) return res.status(400).json({ error: 'no such object here' });
    if (store.getState().inventory.includes(objectId)) {
      return res.status(400).json({ error: 'already taken' });
    }
    store.takeObject(objectId);
    console.log(`[take] ${objectId} from ${nodeId}`);
    res.json({ ok: true, inventory: inventoryView() });
  } catch (err) {
    console.error('take failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat/greet', async (req, res) => {
  try {
    const { characterId } = req.body;
    const character = CAST[characterId];
    if (!character) return res.status(404).json({ error: 'no such character' });
    const node = getNode(character.node);

    const ctx = buildCtx(characterId);
    const chat = store.getChat(characterId);
    const returning = chat.messages.length > 0;
    const greetTurn = {
      role: 'user',
      content: returning
        ? '(The traveler returns to you. Greet them briefly, in character, remembering your last exchange.)'
        : '(The traveler approaches you for the first time. Greet them in one or two sentences, in character.)',
    };

    let raw;
    if (LIVE) {
      raw = await or.chat(
        chatSystemPrompt(character, node, ctx),
        [...chat.messages.slice(-12), greetTurn],
        { maxTokens: 200, temperature: 0.9 }
      );
    } else {
      raw = mock.mockChatReply(character, chat);
    }

    const { reply, ended, newClue } = finishReply(characterId, character, raw);
    console.log(`[greet] ${characterId}`);
    res.json({ reply, ended, character: character.name, characterId, newClue: newClue || null });
  } catch (err) {
    console.error('greet failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { characterId, message } = req.body;
    const character = CAST[characterId];
    if (!character) return res.status(404).json({ error: 'no such character' });
    const node = getNode(character.node);

    store.appendChat(characterId, 'user', String(message || '').slice(0, 600));
    const ctx = buildCtx(characterId);
    const chat = store.getChat(characterId);

    let raw;
    if (LIVE) {
      raw = await or.chat(chatSystemPrompt(character, node, ctx), chat.messages.slice(-12), {
        temperature: 0.9,
        maxTokens: 300,
      });
    } else {
      raw = mock.mockChatReply(character, chat);
    }

    const { reply, ended, newClue } = finishReply(characterId, character, raw);
    console.log(`[chat] ${characterId}${newClue ? ' (+clue)' : ''}${ended ? ' (end)' : ''}`);
    res.json({ reply, ended, character: character.name, characterId, newClue: newClue || null });
  } catch (err) {
    console.error('chat failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Helpers -----------------------------------------------------------------

/** Composite a crosshair marker onto the scene image at the click point. */
async function markClick(imageFile, x, y) {
  const img = sharp(imageFile);
  const meta = await img.metadata();
  const cx = Math.round(x * meta.width);
  const cy = Math.round(y * meta.height);
  const r = Math.round(meta.width * 0.02);
  const marker = Buffer.from(
    `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ff2020" stroke-width="${Math.max(3, r / 4)}"/>
      <circle cx="${cx}" cy="${cy}" r="${Math.max(2, r / 6)}" fill="#ff2020"/>
      <line x1="${cx - r * 1.8}" y1="${cy}" x2="${cx - r * 1.1}" y2="${cy}" stroke="#ff2020" stroke-width="${Math.max(3, r / 4)}"/>
      <line x1="${cx + r * 1.1}" y1="${cy}" x2="${cx + r * 1.8}" y2="${cy}" stroke="#ff2020" stroke-width="${Math.max(3, r / 4)}"/>
      <line x1="${cx}" y1="${cy - r * 1.8}" x2="${cx}" y2="${cy - r * 1.1}" stroke="#ff2020" stroke-width="${Math.max(3, r / 4)}"/>
      <line x1="${cx}" y1="${cy + r * 1.1}" x2="${cx}" y2="${cy + r * 1.8}" stroke="#ff2020" stroke-width="${Math.max(3, r / 4)}"/>
    </svg>`
  );
  return img.composite([{ input: marker }]).jpeg({ quality: 85 }).toBuffer();
}

app.listen(PORT, () => {
  console.log(
    `ISLAND ready on http://localhost:${PORT} — mode: ${LIVE ? 'LIVE (OpenRouter)' : 'MOCK (no OPENROUTER_API_KEY; placeholder art)'}`
  );
});
