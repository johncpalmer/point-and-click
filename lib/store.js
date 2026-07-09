// ---------------------------------------------------------------------------
// Persistent store — the authored world (lib/world.js) is fixed, but the
// *generated overlay* for each node (its painting + located hotspots) and the
// *player's progress* (inventory, journal, chats, visited) are persisted here
// under data/ so revisits are instant and a play-through is durable.
//
//   data/images/<slug>/<nodeId>.jpg — the painting per image-model slug
//   data/nodes.json            — per-node overlay keyed "<slug>:<nodeId>"
//   data/state.json            — player state { inventory, journal, chats, visited, settings }
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const NODES_FILE = path.join(DATA_DIR, 'nodes.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

fs.mkdirSync(IMAGES_DIR, { recursive: true });

// --- Node overlays -----------------------------------------------------------

let nodes = {};
if (fs.existsSync(NODES_FILE)) {
  try {
    nodes = JSON.parse(fs.readFileSync(NODES_FILE, 'utf8'));
  } catch {
    nodes = {};
  }
}

function persistNodes() {
  fs.writeFileSync(NODES_FILE, JSON.stringify(nodes, null, 2));
}

// Overlays are keyed per image-model slug so switching models does not reuse
// another model's located hotspots.
export function getNodeData(slug, id) {
  return nodes[`${slug}:${id}`] || null;
}

export function saveNodeData(slug, id, data) {
  nodes[`${slug}:${id}`] = data;
  persistNodes();
  return data;
}

export function imagePath(slug, id) {
  return path.join(IMAGES_DIR, slug, `${id}.jpg`);
}

export function imagesDir() {
  return IMAGES_DIR;
}

export function saveImage(slug, id, buffer) {
  const dir = path.join(IMAGES_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(imagePath(slug, id), buffer);
  return `/images/${slug}/${id}.jpg`;
}

// --- Player state ------------------------------------------------------------

// Deep-copy the defaults so live state never shares array/object references
// with DEFAULT_STATE (a shared reference would let mutations pollute the
// defaults, breaking resetState).
const freshDefaults = () => JSON.parse(JSON.stringify(DEFAULT_STATE));

const DEFAULT_STATE = {
  inventory: [], // objectId[]
  journal: [],   // clueId[] in the order found
  chats: {},     // { [characterId]: { messages: [{role,content}], clueGiven } }
  visited: [],   // nodeId[]
  worldStates: {}, // { [nodeId]: stateName } — persistent world reactions to item uses
  ended: false,  // whether the Answering (finale) has been played
  settings: { imageModel: null }, // player-chosen image model (null = server default)
};

let state;
if (fs.existsSync(STATE_FILE)) {
  try {
    state = { ...freshDefaults(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
  } catch {
    state = freshDefaults();
  }
} else {
  state = freshDefaults();
}

function persistState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function getState() {
  return state;
}

export function takeObject(objectId) {
  if (!state.inventory.includes(objectId)) {
    state.inventory.push(objectId);
    persistState();
  }
  return state.inventory;
}

export function removeObject(objectId) {
  const i = state.inventory.indexOf(objectId);
  if (i !== -1) {
    state.inventory.splice(i, 1);
    persistState();
  }
  return state.inventory;
}

// --- World states (per-node reactions to item uses) --------------------------

export function getWorldState(nodeId) {
  return (state.worldStates && state.worldStates[nodeId]) || null;
}

export function setWorldState(nodeId, stateName) {
  if (!state.worldStates || typeof state.worldStates !== 'object') state.worldStates = {};
  state.worldStates[nodeId] = stateName;
  persistState();
  return state.worldStates;
}

export function addClue(clueId) {
  if (!state.journal.includes(clueId)) {
    state.journal.push(clueId);
    persistState();
  }
  return state.journal;
}

export function addVisited(nodeId) {
  if (!state.visited.includes(nodeId)) {
    state.visited.push(nodeId);
    persistState();
  }
  return state.visited;
}

export function getChat(characterId) {
  if (!state.chats[characterId]) {
    state.chats[characterId] = { messages: [], clueGiven: false };
    persistState();
  }
  return state.chats[characterId];
}

export function appendChat(characterId, role, content) {
  const chat = getChat(characterId);
  chat.messages.push({ role, content });
  // Cap stored history; drop the oldest first.
  if (chat.messages.length > 40) {
    chat.messages = chat.messages.slice(chat.messages.length - 40);
  }
  persistState();
  return chat;
}

export function markClueGiven(characterId) {
  const chat = getChat(characterId);
  chat.clueGiven = true;
  persistState();
  return chat;
}

export function setEnded() {
  state.ended = true;
  persistState();
  return state.ended;
}

// --- Player settings ---------------------------------------------------------

export function getSetting(key) {
  return state.settings ? state.settings[key] : undefined;
}

export function setSetting(key, value) {
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  state.settings[key] = value;
  persistState();
  return state.settings;
}

// --- Admin / debug: player-state only (never the cached paintings/nodes) ------

export function exportState() {
  return JSON.parse(JSON.stringify(state));
}

export function importState(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const merged = freshDefaults();
  for (const key of Object.keys(DEFAULT_STATE)) {
    if (key in obj) merged[key] = obj[key];
  }
  state = merged;
  persistState();
  return true;
}

export function resetState() {
  // Progress is wiped, but the player's chosen image model is preserved.
  const keepSettings =
    state && state.settings && typeof state.settings === 'object'
      ? JSON.parse(JSON.stringify(state.settings))
      : freshDefaults().settings;
  state = freshDefaults();
  state.settings = keepSettings;
  persistState();
  return state;
}
