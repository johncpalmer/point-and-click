// ---------------------------------------------------------------------------
// ISLAND — game server
// Orchestrates: click interpretation (vision) → scene invention (LLM) →
// image generation → hotspot location (vision) → character chat (LLM).
// Falls back to a fully playable mock mode when OPENROUTER_API_KEY is unset.
// ---------------------------------------------------------------------------

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';

import * as or from './lib/openrouter.js';
import * as store from './lib/store.js';
import * as mock from './lib/mock.js';
import {
  clickSystemPrompt,
  clickUserPrompt,
  sceneSystemPrompt,
  sceneUserPrompt,
  locateSystemPrompt,
  locateUserPrompt,
  chatSystemPrompt,
  buildImagePrompt,
} from './lib/prompts.js';

const PORT = process.env.PORT || 3000;
const MAX_DEPTH = 4;
const LIVE = or.hasKey();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.resolve('public')));
app.use('/images', express.static(store.imagesDir(), { maxAge: '1y', immutable: true }));

// In-memory registry of characters by scene, for chat context.
function characterFor(scene) {
  return scene.character || null;
}

// --- Scene creation pipeline ------------------------------------------------

async function inventScene({ parent, target, targetDescription, direction, depth }) {
  let data;
  if (LIVE) {
    const raw = await or.chat(
      sceneSystemPrompt(),
      [{ role: 'user', content: sceneUserPrompt({ parent, target, targetDescription, direction, depth }) }],
      { maxTokens: 1400, temperature: 1.0 }
    );
    data = or.parseJson(raw);
  } else {
    data = mock.mockScene({ target: target || 'root', depth });
  }

  const id = store.newId();
  const scene = {
    id,
    depth,
    parentId: parent ? parent.id : null,
    clickTarget: target || null,
    name: data.name,
    description: data.description,
    imagePrompt: data.imagePrompt,
    ambience: data.ambience || 'wind',
    character: data.character || null,
    objects: (data.objects || []).map((o) => ({ ...o, id: store.newId() })),
    hotspots: [],
    createdAt: Date.now(),
  };

  // Generate the painting.
  let imgBuffer;
  if (LIVE) {
    imgBuffer = await or.generateImage(buildImagePrompt(scene));
    imgBuffer = await sharp(imgBuffer).resize(1600, 1000, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
  } else {
    imgBuffer = await mock.mockImage(id, scene.name);
  }
  scene.image = store.saveImage(id, imgBuffer);

  // Locate interactables in the generated painting so glows sit on the right pixels.
  const names = [
    ...(scene.character ? [`the figure: ${scene.character.appearance}`] : []),
    ...scene.objects.map((o) => o.name),
  ];
  if (names.length) {
    try {
      const loc = LIVE
        ? or.parseJson(await or.chatWithImage(locateSystemPrompt(), locateUserPrompt(names), imgBuffer))
        : mock.mockLocate(names);
      const feats = loc.features || [];
      let fi = 0;
      if (scene.character) {
        const f = feats[fi++];
        scene.character.hotspot = f && f.found !== false
          ? { x: f.x, y: f.y, radius: Math.max(f.radius || 0.05, 0.035) }
          : { x: 0.5, y: 0.62, radius: 0.06 };
      }
      for (const obj of scene.objects) {
        const f = feats[fi++];
        obj.hotspot = f && f.found !== false
          ? { x: f.x, y: f.y, radius: Math.max(f.radius || 0.04, 0.03) }
          : { x: 0.35 + 0.3 * Math.random(), y: 0.7, radius: 0.05 };
      }
    } catch (err) {
      console.error('locate failed, using fallback hotspots:', err.message);
      if (scene.character) scene.character.hotspot = { x: 0.5, y: 0.62, radius: 0.06 };
      scene.objects.forEach((o, i) => (o.hotspot = { x: 0.3 + i * 0.35, y: 0.7, radius: 0.05 }));
    }
  }

  store.saveScene(scene);
  return scene;
}

function publicScene(scene, { takenObjects = [] } = {}) {
  return {
    id: scene.id,
    depth: scene.depth,
    parentId: scene.parentId,
    name: scene.name,
    description: scene.description,
    ambience: scene.ambience,
    image: scene.image,
    maxDepth: MAX_DEPTH,
    character: scene.character
      ? { name: scene.character.name, hotspot: scene.character.hotspot }
      : null,
    objects: scene.objects
      .filter((o) => !takenObjects.includes(o.id))
      .map((o) => ({ id: o.id, name: o.name, description: o.description, hotspot: o.hotspot })),
  };
}

// --- Routes -------------------------------------------------------------------

app.get('/api/status', (req, res) => {
  res.json({ live: LIVE, maxDepth: MAX_DEPTH });
});

/** Get (or lazily create) the root aerial view. */
app.post('/api/root', async (req, res) => {
  try {
    let root = store.getRootScene();
    if (!root) {
      root = await inventScene({ parent: null, target: null, targetDescription: null, direction: 'root', depth: 0 });
    }
    res.json({ scene: publicScene(root, req.body || {}) });
  } catch (err) {
    console.error('root failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scene/:id', (req, res) => {
  const scene = store.getScene(req.params.id);
  if (!scene) return res.status(404).json({ error: 'unknown scene' });
  res.json({ scene: publicScene(scene, req.body || {}) });
});

/**
 * The core loop. Body: { sceneId, x, y (normalized 0-1), takenObjects[] }
 * Interprets the click, then either returns the parent (up), an existing
 * child (cache hit), or invents a brand-new scene.
 */
app.post('/api/click', async (req, res) => {
  try {
    const { sceneId, x, y, takenObjects = [] } = req.body;
    const scene = store.getScene(sceneId);
    if (!scene) return res.status(404).json({ error: 'unknown scene' });

    // 1. What did they click?
    let verdict;
    if (LIVE) {
      const marked = await markClick(store.imagePath(scene.id), x, y);
      const raw = await or.chatWithImage(
        clickSystemPrompt(),
        clickUserPrompt(scene, scene.depth, MAX_DEPTH),
        marked
      );
      verdict = or.parseJson(raw);
    } else {
      verdict = mock.mockClickResult(scene.depth, MAX_DEPTH, x, y);
    }

    if (verdict.direction === 'blocked') {
      return res.json({ result: 'blocked', target: verdict.target, description: verdict.description });
    }

    if (verdict.direction === 'up') {
      if (!scene.parentId) {
        return res.json({ result: 'blocked', target: verdict.target, description: 'There is nothing above the sky.' });
      }
      const parent = store.getScene(scene.parentId);
      return res.json({ result: 'moved', direction: 'up', target: verdict.target, scene: publicScene(parent, { takenObjects }) });
    }

    // Depth guard: at the bottom of the world, deeper becomes lateral.
    let direction = verdict.direction;
    let depth = direction === 'deeper' ? scene.depth + 1 : scene.depth;
    if (depth > MAX_DEPTH) {
      direction = 'lateral';
      depth = scene.depth;
    }

    // 2. Reuse a scene if this click matches something already explored.
    const existing = store.findChildByTarget(scene.id, verdict.target);
    if (existing) {
      return res.json({ result: 'moved', direction, target: verdict.target, scene: publicScene(existing, { takenObjects }) });
    }

    // 3. Invent the new place.
    const next = await inventScene({
      parent: scene,
      target: verdict.target,
      targetDescription: verdict.description,
      direction,
      depth,
    });
    res.json({ result: 'moved', direction, target: verdict.target, scene: publicScene(next, { takenObjects }) });
  } catch (err) {
    console.error('click failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Character chat. Body: { sceneId, messages: [{role, content}...] } */
app.post('/api/chat', async (req, res) => {
  try {
    const { sceneId, messages = [] } = req.body;
    const scene = store.getScene(sceneId);
    const character = scene && characterFor(scene);
    if (!character) return res.status(404).json({ error: 'no one here to talk to' });

    const trimmed = messages.slice(-16).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 600),
    }));

    let reply;
    if (LIVE) {
      reply = await or.chat(chatSystemPrompt(character, scene), trimmed, { maxTokens: 300, temperature: 0.95 });
    } else {
      reply = mock.mockChatReply(character, trimmed);
    }

    const ended = /\[FAREWELL\]\s*$/.test(reply.trim());
    reply = reply.replace(/\[FAREWELL\]\s*$/, '').trim();
    res.json({ reply, ended, character: character.name });
  } catch (err) {
    console.error('chat failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Opening line when the player first approaches a character. */
app.post('/api/chat/greet', async (req, res) => {
  try {
    const { sceneId } = req.body;
    const scene = store.getScene(sceneId);
    const character = scene && characterFor(scene);
    if (!character) return res.status(404).json({ error: 'no one here to talk to' });
    let reply;
    if (LIVE) {
      reply = await or.chat(
        chatSystemPrompt(character, scene),
        [{ role: 'user', content: '(The traveler approaches you for the first time. Greet them in one or two sentences, in character.)' }],
        { maxTokens: 200, temperature: 0.95 }
      );
    } else {
      reply = mock.mockChatReply(character, []);
    }
    res.json({ reply: reply.replace(/\[FAREWELL\]\s*$/, '').trim(), ended: false, character: character.name });
  } catch (err) {
    console.error('greet failed:', err);
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
  console.log(`ISLAND ready on http://localhost:${PORT} — mode: ${LIVE ? 'LIVE (OpenRouter)' : 'MOCK (no OPENROUTER_API_KEY; placeholder art)'}`);
});
