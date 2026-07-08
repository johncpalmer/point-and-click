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
import fs from 'node:fs';
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
  INTERACTION_RESULTS,
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

// --- Image-model picker ------------------------------------------------------
// Curated default list, env-overridable via ISLAND_IMAGE_MODELS="id|Label,id|Label".
// The player's choice is persisted in state; the first entry (or ISLAND_IMAGE_MODEL)
// is the default. Each model gets its own cache slug so switching repaints.

const DEFAULT_IMAGE_MODELS = [
  { id: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
  { id: 'google/gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image' },
  { id: 'openai/gpt-image-1', label: 'GPT Image 1' },
];

function parseImageModelsEnv(raw) {
  const out = [];
  for (const chunk of String(raw).split(',')) {
    const s = chunk.trim();
    if (!s) continue;
    const [id, label] = s.split('|');
    if (id && id.trim()) out.push({ id: id.trim(), label: (label || id).trim() });
  }
  return out;
}

const IMAGE_MODELS = process.env.ISLAND_IMAGE_MODELS
  ? parseImageModelsEnv(process.env.ISLAND_IMAGE_MODELS)
  : DEFAULT_IMAGE_MODELS;
const DEFAULT_IMAGE_MODEL =
  process.env.ISLAND_IMAGE_MODEL || (IMAGE_MODELS[0] && IMAGE_MODELS[0].id) || 'google/gemini-2.5-flash-image';

/** The image model currently in effect (player setting if valid, else default). */
function currentImageModel() {
  const sel = store.getSetting('imageModel');
  if (sel && IMAGE_MODELS.some((m) => m.id === sel)) return sel;
  return DEFAULT_IMAGE_MODEL;
}

/** Cache slug for a model: lowercased, every non-alphanumeric -> '-'. Mock = 'mock'. */
function modelSlug(model) {
  if (!LIVE) return 'mock';
  return String(model).toLowerCase().replace(/[^a-z0-9]/g, '-');
}

/** The cache slug currently in effect. */
function currentSlug() {
  return modelSlug(currentImageModel());
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.resolve('public')));
app.use('/images', express.static(store.imagesDir(), { maxAge: '1y', immutable: true }));

const clamp = (v) => Math.min(0.97, Math.max(0.03, v));
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const blockedLine = () => blockedLines[Math.floor(Math.random() * blockedLines.length)];

// Synthesize a bounding box from a center + radius (fallback shape): wider than
// tall, hugging roughly the visible extent of a point feature.
function synthBox(cx, cy, radius) {
  const r = radius || 0.07;
  return {
    x0: clamp01(cx - r * 1.6),
    y0: clamp01(cy - r * 2),
    x1: clamp01(cx + r * 1.6),
    y1: clamp01(cy + r * 2),
  };
}

// Validate/repair a raw box against a center. Requires four numbers; clamps to
// [0,1], orders the corners, and expands to a minimum 0.03x0.03 around the
// center if degenerate. Returns null if the raw box is not four numbers.
function validateBox(b, cx, cy) {
  if (
    !b ||
    typeof b.x0 !== 'number' || typeof b.y0 !== 'number' ||
    typeof b.x1 !== 'number' || typeof b.y1 !== 'number'
  ) {
    return null;
  }
  let x0 = clamp01(Math.min(b.x0, b.x1));
  let x1 = clamp01(Math.max(b.x0, b.x1));
  let y0 = clamp01(Math.min(b.y0, b.y1));
  let y1 = clamp01(Math.max(b.y0, b.y1));
  const mx = typeof cx === 'number' ? cx : (x0 + x1) / 2;
  const my = typeof cy === 'number' ? cy : (y0 + y1) / 2;
  if (x1 - x0 < 0.03) { x0 = clamp01(mx - 0.015); x1 = clamp01(mx + 0.015); }
  if (y1 - y0 < 0.03) { y0 = clamp01(my - 0.015); y1 = clamp01(my + 0.015); }
  return { x0, y0, x1, y1 };
}

// Validate/repair a located box against its center. Falls back to a synthesized
// box if no valid box given.
function makeBox(f, cx, cy, radius) {
  return validateBox(f && f.box, cx, cy) || synthBox(cx, cy, radius);
}

// Center + radius derived from a final box: center of the box, radius = half the
// box's larger dimension. Keeps nav dots, scan pins, and distance checks agreeing
// with the corrected box.
function boxCenter(box) {
  const x = clamp((box.x0 + box.x1) / 2);
  const y = clamp((box.y0 + box.y1) / 2);
  const radius = Math.max(box.x1 - box.x0, box.y1 - box.y0) / 2;
  return { x, y, radius: radius || 0.05 };
}

// --- Locate-accuracy compositing helpers ------------------------------------
// A red coordinate grid (and optionally numbered feature boxes) composited onto
// a COPY of a scene image so the vision model can read normalized coordinates
// straight off it. These overlays are never saved as the scene art.

const BOX_HUES = ['#ff3b30', '#34c759', '#0a84ff', '#ffcc00', '#ff2d95', '#00c7be', '#ff9500', '#bf5af2'];

/** SVG for a 10x10 red grid with margin coordinate labels, plus optional boxes. */
function overlaySvg(w, h, boxes) {
  let s = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  for (let i = 1; i < 10; i++) {
    const gx = (i / 10) * w;
    const gy = (i / 10) * h;
    s += `<line x1="${gx.toFixed(1)}" y1="0" x2="${gx.toFixed(1)}" y2="${h}" stroke="rgba(255,0,0,0.55)" stroke-width="1"/>`;
    s += `<line x1="0" y1="${gy.toFixed(1)}" x2="${w}" y2="${gy.toFixed(1)}" stroke="rgba(255,0,0,0.55)" stroke-width="1"/>`;
  }
  for (let i = 1; i < 10; i++) {
    const label = `0.${i}`;
    const gx = (i / 10) * w;
    const gy = (i / 10) * h;
    // top margin (x labels)
    s += `<rect x="${(gx - 15).toFixed(1)}" y="1" width="30" height="20" fill="rgba(255,255,255,0.75)"/>`;
    s += `<text x="${gx.toFixed(1)}" y="16" font-family="monospace" font-size="18" fill="#cc0000" text-anchor="middle">${label}</text>`;
    // left margin (y labels)
    s += `<rect x="1" y="${(gy - 11).toFixed(1)}" width="36" height="20" fill="rgba(255,255,255,0.75)"/>`;
    s += `<text x="4" y="${(gy + 5).toFixed(1)}" font-family="monospace" font-size="18" fill="#cc0000">${label}</text>`;
  }
  if (boxes) {
    for (const b of boxes) {
      const x0 = b.box.x0 * w, y0 = b.box.y0 * h;
      const bw = (b.box.x1 - b.box.x0) * w, bh = (b.box.y1 - b.box.y0) * h;
      s += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="none" stroke="${b.hue}" stroke-width="3"/>`;
      s += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="24" height="21" fill="${b.hue}"/>`;
      s += `<text x="${(x0 + 12).toFixed(1)}" y="${(y0 + 16).toFixed(1)}" font-family="monospace" font-size="16" fill="#ffffff" text-anchor="middle">${b.n}</text>`;
    }
  }
  return Buffer.from(s + '</svg>');
}

/** Composite the grid (and optional numbered boxes) onto a copy of an image. */
async function compositeOverlay(imgBuffer, boxes = null) {
  const meta = await sharp(imgBuffer).metadata();
  const svg = overlaySvg(meta.width || 1600, meta.height || 1000, boxes);
  return sharp(imgBuffer).composite([{ input: svg }]).jpeg({ quality: 88 }).toBuffer();
}

/**
 * Crop a feature out of a (parent) image at a normalized box, padded 25% each
 * side, with a minimum crop of 30% of image width/height, clamped to bounds.
 * Returns an ~800px-wide jpeg Buffer, or null on failure.
 */
async function cropFeature(imgBuffer, box) {
  try {
    const meta = await sharp(imgBuffer).metadata();
    const W = meta.width || 1600;
    const H = meta.height || 1000;
    const bw = box.x1 - box.x0;
    const bh = box.y1 - box.y0;
    let x0 = box.x0 - bw * 0.25;
    let x1 = box.x1 + bw * 0.25;
    let y0 = box.y0 - bh * 0.25;
    let y1 = box.y1 + bh * 0.25;
    // Enforce a minimum crop of 30% (of the respective axis) around the center.
    const grow = (a, b, min) => {
      if (b - a < min) {
        const c = (a + b) / 2;
        return [c - min / 2, c + min / 2];
      }
      return [a, b];
    };
    [x0, x1] = grow(x0, x1, 0.30);
    [y0, y1] = grow(y0, y1, 0.30);
    x0 = clamp01(x0); y0 = clamp01(y0); x1 = clamp01(x1); y1 = clamp01(y1);
    const left = Math.max(0, Math.round(x0 * W));
    const top = Math.max(0, Math.round(y0 * H));
    const width = Math.max(1, Math.min(W - left, Math.round((x1 - x0) * W)));
    const height = Math.max(1, Math.min(H - top, Math.round((y1 - y0) * H)));
    return await sharp(imgBuffer)
      .extract({ left, top, width, height })
      .resize({ width: 800 })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch (err) {
    console.error('[realize] crop failed:', err.message);
    return null;
  }
}

/**
 * Verify-and-correct second pass (LIVE only). Draws the first-pass boxes on a
 * copy of the image (numbered, colored, over the same grid), asks the model to
 * confirm or correct each, and applies corrections back onto located[key].box.
 * On any failure the first-pass boxes are kept.
 */
async function verifyBoxes(imgBuffer, features, located) {
  const items = [];
  for (const f of features) {
    const lf = located[f.key];
    if (!lf || lf.found === false || typeof lf.x !== 'number' || typeof lf.y !== 'number') continue;
    const box = makeBox(lf, clamp(lf.x), clamp(lf.y), lf.radius || 0.06);
    const n = items.length + 1;
    items.push({ n, key: f.key, box, hue: BOX_HUES[(n - 1) % BOX_HUES.length], desc: f.ask });
  }
  if (!items.length) return;

  const boxed = await compositeOverlay(imgBuffer, items);
  const raw = await or.chatWithImage(verifySystemPrompt(), verifyUserPrompt(items), boxed);
  const parsed = or.parseJson(raw);
  let corrected = 0;
  for (const entry of parsed.boxes || []) {
    if (!entry || typeof entry.n !== 'number' || entry.ok !== false) continue;
    const item = items.find((it) => it.n === entry.n);
    if (!item) continue;
    const vb = validateBox(entry.box, undefined, undefined);
    if (vb) {
      located[item.key].box = vb;
      corrected++;
    }
  }
  console.log(`[realize] verify — ${corrected}/${items.length} box(es) corrected`);
}

// --- Scene realization pipeline ---------------------------------------------
// Paint an authored node once (cached), then locate its features so hotspots
// land on real pixels. Idempotent: returns cached overlay if it exists.

async function realizeNode(nodeId) {
  const model = currentImageModel();
  const slug = modelSlug(model);

  const cached = store.getNodeData(slug, nodeId);
  if (cached) return cached;

  const node = getNode(nodeId);
  if (!node) throw new Error(`unknown node: ${nodeId}`);
  console.log(`[realize] ${nodeId} — painting scene (model ${LIVE ? model : 'mock'})`);

  // 1. Paint the scene. In LIVE mode, if the parent has already been painted,
  //    condition on its image so the child looks like the same physical place.
  //    When the parent overlay has a box for this node, also pass a close crop
  //    of exactly that feature so the child depicts what the player clicked.
  let imgBuffer;
  if (LIVE) {
    const parent = node.parent ? getNode(node.parent) : null;
    const refPath = parent ? store.imagePath(slug, parent.id) : null;
    if (parent && refPath && fs.existsSync(refPath)) {
      const refBuf = fs.readFileSync(refPath);
      const refs = [refBuf];
      const parentData = store.getNodeData(slug, parent.id);
      const np = parentData && (parentData.navPoints || []).find((p) => p.nodeId === nodeId);
      if (np && np.box) {
        const cropBuf = await cropFeature(refBuf, np.box);
        if (cropBuf) refs.push(cropBuf);
      }
      imgBuffer = await or.generateImageWithReference(
        buildImagePrompt(node, { withContinuity: parent.name, withCrop: refs.length > 1 }),
        refs.length > 1 ? refs : refBuf,
        { model }
      );
    } else {
      imgBuffer = await or.generateImage(buildImagePrompt(node), { model });
    }
    imgBuffer = await sharp(imgBuffer).resize(1600, 1000, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
  } else {
    imgBuffer = await mock.mockImage(nodeId, node.name);
  }
  const image = store.saveImage(slug, nodeId, imgBuffer);

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
  if (node.interactable) {
    features.push({
      key: `use:${node.interactable.id}`,
      ask: `${node.interactable.name} — ${node.interactable.position}`,
    });
  }

  // 3. Locate pass. LIVE: composite a red coordinate grid onto a COPY of the
  //    image and read coordinates off it; then a verify-and-correct second pass.
  console.log(`[realize] ${nodeId} — locating ${features.length} feature(s)`);
  let located = {};
  if (features.length) {
    let result;
    try {
      if (LIVE) {
        const gridded = await compositeOverlay(imgBuffer);
        result = or.parseJson(await or.chatWithImage(locateSystemPrompt(), locateUserPrompt(features), gridded));
      } else {
        result = mock.mockLocate(features);
      }
    } catch (err) {
      console.error(`[realize] ${nodeId} — locate failed, using fallbacks:`, err.message);
      result = { features: [] };
    }
    for (const f of result.features || []) located[f.key] = f;

    // Verify-and-correct second pass (LIVE only). Failures keep first-pass boxes.
    if (LIVE) {
      try {
        await verifyBoxes(imgBuffer, features, located);
      } catch (err) {
        console.error(`[realize] ${nodeId} — verify pass failed, keeping first-pass boxes:`, err.message);
      }
    }
  }

  const usable = (f) => f && f.found !== false && typeof f.x === 'number' && typeof f.y === 'number';

  // Collect up to 2 validated alias boxes from a located feature's `extra`.
  const aliasBoxes = (f) => {
    if (!usable(f) || !Array.isArray(f.extra)) return [];
    const out = [];
    for (const raw of f.extra.slice(0, 2)) {
      const vb = validateBox(raw, undefined, undefined);
      if (vb) out.push(vb);
    }
    return out;
  };

  // 4. Nav points, with authored fallbacks for anything not confidently found.
  //    x/y/radius are recentered from the final (possibly corrected) box so nav
  //    dots and distance checks agree with it. navPoints carry every box (the
  //    primary plus alias depictions) as `boxes`, with `box` = boxes[0].
  const navPoints = [];
  let childIdx = 0;
  let latIdx = 0;
  const childXs = [0.25, 0.5, 0.75];
  for (const d of navDests) {
    const f = located[`nav:${d.id}`];
    let box;
    let center;
    if (usable(f)) {
      box = makeBox(f, clamp(f.x), clamp(f.y), f.radius || 0.07);
      center = boxCenter(box);
    } else if (d.kind === 'lateral') {
      const x = latIdx % 2 === 0 ? 0.06 : 0.94;
      latIdx++;
      center = { x: clamp(x), y: clamp(0.55), radius: 0.07 };
      box = synthBox(center.x, center.y, center.radius);
    } else {
      const x = childXs[childIdx % childXs.length];
      childIdx++;
      center = { x: clamp(x), y: clamp(0.6), radius: 0.07 };
      box = synthBox(center.x, center.y, center.radius);
    }
    const boxes = [box, ...aliasBoxes(f)];
    navPoints.push({
      nodeId: d.id,
      name: d.name,
      kind: d.kind,
      x: center.x,
      y: center.y,
      radius: center.radius,
      box,
      boxes,
    });
  }

  // 5. Character hotspot.
  let characterHotspot = null;
  if (cast) {
    const f = located.character;
    if (usable(f)) {
      const box = makeBox(f, clamp(f.x), clamp(f.y), f.radius || 0.06);
      const c = boxCenter(box);
      characterHotspot = { x: c.x, y: c.y, radius: c.radius, box };
    } else {
      characterHotspot = { x: 0.5, y: 0.62, radius: 0.06, box: synthBox(0.5, 0.62, 0.06) };
    }
  }

  // 6. Object hotspots.
  const objectHotspots = {};
  objs.forEach((o, i) => {
    const f = located[`obj:${o.id}`];
    if (usable(f)) {
      const box = makeBox(f, clamp(f.x), clamp(f.y), f.radius || 0.05);
      const c = boxCenter(box);
      objectHotspots[o.id] = { x: c.x, y: c.y, radius: c.radius, box };
    } else {
      const nx = clamp(0.35 + i * 0.3);
      objectHotspots[o.id] = { x: nx, y: 0.72, radius: 0.05, box: synthBox(nx, 0.72, 0.05) };
    }
  });

  // 7. Interactable hotspot (e.g. the finale's tuning pin).
  let interactableHotspot = null;
  if (node.interactable) {
    const f = located[`use:${node.interactable.id}`];
    if (usable(f)) {
      const box = makeBox(f, clamp(f.x), clamp(f.y), f.radius || 0.07);
      const c = boxCenter(box);
      interactableHotspot = { x: c.x, y: c.y, radius: c.radius, box };
    } else {
      interactableHotspot = { x: 0.5, y: 0.55, radius: 0.07, box: synthBox(0.5, 0.55, 0.07) };
    }
  }

  const data = { image, navPoints, characterHotspot, objectHotspots, interactableHotspot };
  store.saveNodeData(slug, nodeId, data);
  console.log(`[realize] ${nodeId} — done (${navPoints.length} navPoints)`);
  return data;
}

// --- Public view of a node (assumes it has been realized) -------------------

function publicScene(nodeId) {
  const node = getNode(nodeId);
  const data = store.getNodeData(currentSlug(), nodeId);
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
    interactable: node.interactable
      ? { id: node.interactable.id, name: node.interactable.name, hotspot: data.interactableHotspot }
      : null,
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
  res.json({
    live: LIVE,
    maxDepth: MAX_DEPTH,
    title: 'CADENCE',
    imageModel: currentImageModel(),
    imageModels: IMAGE_MODELS,
  });
});

app.post('/api/settings', (req, res) => {
  const { imageModel } = req.body || {};
  if (!imageModel || !IMAGE_MODELS.some((m) => m.id === imageModel)) {
    return res.status(400).json({ error: 'unknown image model' });
  }
  store.setSetting('imageModel', imageModel);
  console.log(`[settings] imageModel -> ${imageModel}`);
  res.json({ ok: true, imageModel });
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

    // (2) Containment: test ALL boxes (primary + alias depictions) of ALL
    //     navPoints; the SMALLEST containing box wins (occlusion: the steeple
    //     beats the lake behind it).
    let contained = null;
    let containedArea = Infinity;
    for (const np of data.navPoints) {
      for (const b of np.boxes || (np.box ? [np.box] : [])) {
        if (b && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) {
          const area = (b.x1 - b.x0) * (b.y1 - b.y0);
          if (area < containedArea) {
            containedArea = area;
            contained = np;
          }
        }
      }
    }
    if (contained) return move(contained.nodeId, contained.kind);

    // (3) Nearest precomputed navPoint center within reach.
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

    // (4) Vision (or mock) fallback — validated against authored destinations.
    const dests = destinationsFrom(nodeId); // includes parent (kind 'up')
    let choice = 'none';
    if (LIVE) {
      try {
        const marked = await markClick(store.imagePath(currentSlug(), nodeId), x, y);
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

    // (5) Nothing there.
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

app.post('/api/interact', (req, res) => {
  try {
    const { nodeId } = req.body;
    const node = getNode(nodeId);
    if (!node) return res.status(404).json({ error: 'unknown node' });
    if (!node.interactable) return res.status(400).json({ error: 'nothing to interact with here' });

    const results = INTERACTION_RESULTS[nodeId];
    const state = store.getState();
    const has = state.inventory.includes(node.interactable.requires);

    if (has) {
      const firstTime = !state.ended; // finale plays only the first time
      store.setEnded();
      console.log(`[interact] ${nodeId} — unlocked${firstTime ? ' (THE ANSWERING)' : ''}`);
      return res.json({ title: results.unlocked.title, text: results.unlocked.text, ending: firstTime });
    }
    console.log(`[interact] ${nodeId} — locked`);
    return res.json({ title: results.locked.title, text: results.locked.text, ending: false });
  } catch (err) {
    console.error('interact failed:', err);
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

// --- Admin / debug routes ----------------------------------------------------

app.get('/api/admin/export', (req, res) => {
  res.json({ state: store.exportState() });
});

app.post('/api/admin/import', (req, res) => {
  const s = req.body && req.body.state;
  if (!s || typeof s !== 'object' || Array.isArray(s)) {
    return res.status(400).json({ error: 'state must be an object' });
  }
  store.importState(s);
  res.json({ ok: true });
});

app.post('/api/admin/reset', (req, res) => {
  store.resetState();
  res.json({ ok: true });
});

app.post('/api/admin/oracle', async (req, res) => {
  try {
    const { message } = req.body || {};
    const digest = oracleDigest();
    const nextStep = oracleNextStep();

    let reply;
    if (LIVE) {
      const sys = `You are the ORACLE, an out-of-character debug assistant with full spoilers for the game ISLAND. Below is the complete progress digest and the computed next step. Answer the developer's question directly and concisely. No roleplay, no in-character voice; spoilers are allowed.

${digest}

NEXT STEP: ${nextStep}`;
      reply = await or.chat(sys, [{ role: 'user', content: String(message || '') }], {
        maxTokens: 400,
        temperature: 0.3,
      });
    } else {
      reply = `${digest}\n\nNEXT: ${nextStep}`;
    }
    res.json({ reply });
  } catch (err) {
    console.error('oracle failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Helpers -----------------------------------------------------------------

/** "island → harbor → hut" — the descent path from the root to a node. */
function pathFromIsland(nodeId) {
  const chain = [];
  let cur = getNode(nodeId);
  while (cur) {
    chain.unshift(cur.id);
    cur = cur.parent ? getNode(cur.parent) : null;
  }
  return chain.join(' → ');
}

const caretakerForClue = (clueId) => Object.values(CAST).find((c) => c.clue === clueId) || null;

/** Spoiler-complete progress digest built from world + player state. */
function oracleDigest() {
  const state = store.getState();
  const clueKeys = Object.keys(CLUES);
  const found = state.journal;
  const missing = clueKeys.filter((k) => !found.includes(k));
  const inv = state.inventory;

  const lines = [];
  lines.push('ISLAND — ORACLE PROGRESS DIGEST');
  lines.push(`Journal: ${found.length}/${clueKeys.length} fragments gathered.`);

  if (missing.length) {
    lines.push('Missing fragments:');
    for (const k of missing) {
      const c = caretakerForClue(k);
      const node = c ? getNode(c.node) : null;
      lines.push(
        `  - "${CLUES[k].title}" — held by ${c ? c.name : '?'} at ${node ? node.name : '?'} (${c ? pathFromIsland(c.node) : '?'})`
      );
    }
  } else {
    lines.push('All fragments gathered.');
  }

  lines.push(`Inventory (${inv.length}): ${inv.length ? inv.map((id) => OBJECTS[id].name).join(', ') : 'empty'}.`);
  const untaken = Object.values(OBJECTS).filter((o) => !inv.includes(o.id));
  if (untaken.length) {
    lines.push('Objects not yet taken:');
    for (const o of untaken) {
      const node = getNode(o.node);
      lines.push(`  - ${o.name} in ${node ? node.name : '?'} (${pathFromIsland(o.node)})`);
    }
  }

  lines.push('Caretaker fragment status:');
  for (const c of Object.values(CAST)) {
    const chat = state.chats[c.id];
    const given = Boolean(chat && chat.clueGiven);
    lines.push(`  - ${c.name} (${getNode(c.node).name}): fragment ${given ? 'GIVEN' : 'not yet given'} — "${CLUES[c.clue].title}"`);
  }

  const gateOpen = found.length >= 2;
  lines.push(
    `Lys gate (she reveals "The Cut Measure" only with 2+ other fragments): ${gateOpen ? 'OPEN' : `closed (have ${found.length}/2)`}.`
  );
  lines.push(`Brass tuning key held: ${inv.includes('tuning_key') ? 'yes' : 'no'}.`);
  lines.push(`Answering complete (ended): ${state.ended ? 'yes' : 'no'}.`);

  return lines.join('\n');
}

/** The single most useful next action, spoilers allowed. */
function oracleNextStep() {
  const state = store.getState();
  const found = state.journal;
  const missing = Object.keys(CLUES).filter((k) => !found.includes(k));

  if (missing.length) {
    const gateOpen = found.length >= 2;
    const caretakers = missing.map(caretakerForClue).filter(Boolean);
    let target = caretakers[0];
    if (!gateOpen) {
      const nonLys = caretakers.find((c) => c.id !== 'lys');
      if (nonLys) target = nonLys;
    }
    const node = getNode(target.node);
    let step = `visit ${target.name} at ${node.name} (${pathFromIsland(target.node)}) to gather "${CLUES[target.clue].title}"`;
    if (target.id === 'lys') {
      step += gateOpen
        ? ' (Lys gate is open)'
        : ` (PREREQUISITE: Lys needs 2+ fragments first — currently ${found.length})`;
    }
    return step;
  }
  if (!state.inventory.includes('tuning_key')) {
    return "take the brass tuning key in The Lark's Hold (island → harbor → lark → lark_hold)";
  }
  if (!state.ended) {
    return 'go to the Tuning Room (island → lake → drowned → understage → tuningroom) and use the pin';
  }
  return 'the Answering is complete — free exploration';
}

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
