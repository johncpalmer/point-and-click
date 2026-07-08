// ---------------------------------------------------------------------------
// Persistent store — the authored world (lib/world.js) is fixed, but the
// *generated overlay* for each node (its painting + located hotspots) and the
// *player's progress* (inventory, journal, chats, visited) are persisted here
// under data/ so revisits are instant and a play-through is durable.
//
//   data/images/<nodeId>.jpg   — the painting for each realized node
//   data/nodes.json            — per-node overlay { image, navPoints, ... }
//   data/state.json            — player state { inventory, journal, chats, visited }
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

export function getNodeData(id) {
  return nodes[id] || null;
}

export function saveNodeData(id, data) {
  nodes[id] = data;
  persistNodes();
  return data;
}

export function imagePath(id) {
  return path.join(IMAGES_DIR, `${id}.jpg`);
}

export function imagesDir() {
  return IMAGES_DIR;
}

export function saveImage(id, buffer) {
  fs.writeFileSync(imagePath(id), buffer);
  return `/images/${id}.jpg`;
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
  ended: false,  // whether the Answering (finale) has been played
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
  state = freshDefaults();
  persistState();
  return state;
}
