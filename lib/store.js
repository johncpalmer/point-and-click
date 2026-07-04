// ---------------------------------------------------------------------------
// Scene store — scenes persist as JSON + image files under data/ so revisits
// are instant and a play-through builds up a permanent, explorable world.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SCENES_FILE = path.join(DATA_DIR, 'scenes.json');
const IMAGES_DIR = path.join(DATA_DIR, 'images');

fs.mkdirSync(IMAGES_DIR, { recursive: true });

let scenes = {};
if (fs.existsSync(SCENES_FILE)) {
  try {
    scenes = JSON.parse(fs.readFileSync(SCENES_FILE, 'utf8'));
  } catch {
    scenes = {};
  }
}

function persist() {
  fs.writeFileSync(SCENES_FILE, JSON.stringify(scenes, null, 2));
}

export function newId() {
  return crypto.randomBytes(8).toString('hex');
}

export function getScene(id) {
  return scenes[id] || null;
}

export function getRootScene() {
  return Object.values(scenes).find((s) => s.depth === 0) || null;
}

export function saveScene(scene) {
  scenes[scene.id] = scene;
  persist();
  return scene;
}

export function saveImage(id, buffer) {
  const file = path.join(IMAGES_DIR, `${id}.jpg`);
  fs.writeFileSync(file, buffer);
  return `/images/${id}.jpg`;
}

export function imagePath(id) {
  return path.join(IMAGES_DIR, `${id}.jpg`);
}

export function imagesDir() {
  return IMAGES_DIR;
}

/** Find an existing child of `parentId` generated for a similar click target. */
export function findChildByTarget(parentId, target) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  return (
    Object.values(scenes).find(
      (s) => s.parentId === parentId && s.clickTarget && norm(s.clickTarget) === norm(target)
    ) || null
  );
}
