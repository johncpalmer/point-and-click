// ---------------------------------------------------------------------------
// ISLAND — prompt library
// The world is a fixed authored graph (lib/world.js). These prompts drive the
// three jobs the AI still does: paint each authored node once, locate its
// visible features so hotspots sit on real pixels, and play the caretakers in
// chat. The style guide is the contract that keeps every painting one world.
// ---------------------------------------------------------------------------

import { WORLD_LORE, castAt, objectsAt } from './world.js';

export { WORLD_LORE };

export const STYLE_GUIDE = `
ART STYLE (strict style contract for every image in this game — follow exactly):
Clean painterly sci-fantasy concept art: 1970s Roger Dean album-cover surrealism
crossed with modern game key art. Smooth, graphic, monumental.
- Medium: airbrushed acrylic / digital matte painting. Crisp graphic edges, flat
  simplified color fields with soft gradient shading. NO photorealism, NO 3D-render
  look, NO heavy texture, noise or grain.
- Landforms: monumental and sculptural — sheer-sided plateaus that drop straight
  into the sea, columnar basalt cliff walls, flat tabletop meadows, needle spires.
  Geology reads as designed, almost architectural.
- Palette: deep saturated cerulean-to-ultramarine sea; luminous azure pools; sky
  graded from pale warm horizon to rich blue zenith; chartreuse-gold and olive
  meadows; bold accents of vermilion and burnt-orange foliage; warm grey sandstone
  rock; white sand rims along the waterline; low white cloudbanks drifting below
  or around the landforms.
- Architecture (when present): monumental and clean-lined, fused into the landform —
  white terraced futurist structures, palatial stone gates, circular and hexagonal
  geometric pools, ring causeways, curved glass observation decks. Integrated,
  never cluttered.
- Light: clear high sun, long soft shadows, luminous haze with distance. Windless,
  serene clarity.
- Scale: tiny boats, birds, or a lone figure may punctuate the vastness.
- Mood: serene, monumental, quietly surreal — a world designed by a vanished
  intelligence.
- Absolutely no text, no watermark, no border, no UI elements inside the image.
`.trim();

// ---------------------------------------------------------------------------
// 1. Scene painting — assemble the image prompt for an authored node.
// ---------------------------------------------------------------------------

export function buildImagePrompt(node, { withContinuity = null, withCrop = false } = {}) {
  const parts = [node.imagePrompt];

  const cast = castAt(node.id);
  if (cast) {
    parts.push(
      `Include exactly one figure: ${cast.appearance} — ${cast.position}. The figure is small in frame, part of the scenery.`
    );
  }

  // Objects are painted even if already taken; hotspot suppression handles
  // the taken state at serve time.
  for (const o of objectsAt(node.id)) {
    parts.push(`Visible in the scene: ${o.name} (${o.description}) — ${o.position}.`);
  }

  // Optional interactable feature (e.g. the finale's tuning pin).
  if (node.interactable) {
    parts.push(
      `Visible in the scene: ${node.interactable.name} (${node.interactable.description}) — ${node.interactable.position}.`
    );
  }

  // Physical continuity: when a parent painting exists, the child is the SAME
  // place moved closer/inside. This block goes BEFORE the style guide.
  if (withContinuity && withCrop) {
    parts.push(
      `CONTINUITY (critical): TWO reference images are attached. IMAGE 1 is the wider previous view of this exact place — "${withContinuity}", seen from farther away / outside. IMAGE 2 is a CLOSE CROP of the exact feature the traveler clicked and is now approaching. You are painting the SAME physical location, moved closer or inside. Your new painting MUST depict the feature shown in IMAGE 2, seen from much nearer / from inside — matching its silhouette, materials, and colors precisely. Use IMAGE 1 for the surrounding architecture, palette, weather, time of day, and any landmark visible in both. Do not redesign anything; reveal more detail of what the references already show.`
    );
  } else if (withContinuity) {
    parts.push(
      `CONTINUITY (critical): The attached reference image is the previous view of this exact place — "${withContinuity}", seen from farther away / outside. You are painting the SAME physical location, moved closer or inside. Match the reference exactly: the same architecture, silhouettes, materials, colors, weather, time of day, and any landmark visible in both views. Do not redesign anything; reveal more detail of what the reference already shows.`
    );
  }

  parts.push(STYLE_GUIDE);
  parts.push('Wide 16:10 landscape composition. No text anywhere in the image.');
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// 2. Feature location — one vision pass per generated painting.
//    features = [{ key, ask }] where `ask` describes what to find.
// ---------------------------------------------------------------------------

export function locateSystemPrompt() {
  return `You locate named features in a hand-painted game scene image. A light RED
REFERENCE GRID is overlaid on the image: thin red lines every 0.1 in normalized
coordinates, with small red coordinate labels ("0.1".."0.9") along the top edge (x)
and the left edge (y). READ COORDINATES DIRECTLY OFF THIS GRID. The grid is a
measuring aid only — it is NOT part of the painted scene; never treat a grid line or
label as a feature.
For each requested feature, return the normalized coordinates (0.0-1.0, x measured
from the left, y measured from the top) of its visual center, an approximate radius
as a fraction of the image width, AND a tight bounding box "box" with { "x0", "y0",
"x1", "y1" } (also 0.0-1.0, x0<x1, y0<y1).
The box must hug the VISIBLE EXTENT of that feature only — just the figure's body,
just the tower, just the object — never the scenery behind it. Boxes of different
features MAY overlap; when two features overlap visually, each box should still fit
its OWN feature tightly, so the smaller / nearer feature can win a click over the
larger one behind it.
For features marked (travel destination), you MAY also add "extra": an array of up to
2 ADDITIONAL boxes (same {x0,y0,x1,y1} shape) marking OTHER visible depictions of the
SAME destination in the scene — e.g. for a tower both the tower itself AND the path
that leads to it. Omit "extra" if there is only one depiction.
Respond with ONLY a JSON object, no markdown fences:
{ "features": [ { "key": "the given key", "found": true, "x": 0.5, "y": 0.5, "radius": 0.05, "box": { "x0": 0.45, "y0": 0.4, "x1": 0.55, "y1": 0.6 }, "extra": [ { "x0": 0.1, "y0": 0.7, "x1": 0.2, "y1": 0.8 } ] } ] }
If a feature is off-frame, not depicted, or you are not confident it is visible,
set "found": false for it and omit its coordinates. Do not invent positions.`;
}

export function locateUserPrompt(features) {
  const lines = features
    .map((f) => {
      const nav = f.kind === 'deeper' || f.kind === 'lateral' ? ' (travel destination)' : '';
      return `- key "${f.key}"${nav}: find ${f.ask}`;
    })
    .join('\n');
  return `Locate each of these features in the image and report its center, radius, and tight bounding box (read the coordinates off the overlaid red grid):\n${lines}`;
}

// ---------------------------------------------------------------------------
// 2b. Verify-and-correct — a second vision pass (LIVE only). The first pass's
//     boxes are drawn on the image (numbered, colored). The model confirms each
//     box or returns a corrected one, reading coords off the same red grid.
// ---------------------------------------------------------------------------

export function verifySystemPrompt() {
  return `You are auditing feature boxes drawn on a game scene. Numbered, colored
rectangles have been drawn over the painting, each meant to tightly contain one named
feature. A light RED REFERENCE GRID is also overlaid (thin red lines every 0.1 in
normalized coordinates, with red "0.1".."0.9" labels along the top for x and the left
for y) — read all coordinates directly off it. The grid and the numbered boxes are
overlays, not part of the scene.
For each numbered box, decide whether it TIGHTLY contains its feature (hugging the
feature's visible extent, not the scenery behind it). If it already fits, confirm it.
If it is off, too large, or too small, return a corrected box { "x0","y0","x1","y1" }
(0.0-1.0, x0<x1, y0<y1) read off the grid.
Respond with ONLY a JSON object, no markdown fences:
{ "boxes": [ { "n": 1, "ok": true }, { "n": 2, "ok": false, "box": { "x0": 0.3, "y0": 0.4, "x1": 0.42, "y1": 0.6 } } ] }`;
}

export function verifyUserPrompt(items) {
  const lines = items.map((it) => `${it.n}: ${it.desc}`).join('\n');
  return `The numbered boxes mark these features. Confirm each box tightly contains its feature, or return a corrected box:\n${lines}`;
}

// ---------------------------------------------------------------------------
// 3. Click interpretation (vision) — fallback ONLY when a click misses all
//    precomputed navPoints. A red crosshair marks the click.
// ---------------------------------------------------------------------------

export function clickSystemPrompt(candidates) {
  const list = candidates
    .map((c) => `- "${c.id}" (${c.kind}): ${c.name} — ${c.desc}`)
    .join('\n');
  return `You are the spatial-reasoning engine of a point-and-click exploration game
set on a fixed, authored island. You are shown the current scene painting with a red
crosshair composited at the exact point the player clicked. Decide which — if any — of
the authored destinations below the clicked feature genuinely depicts or leads toward.

Destinations you may choose (these are the ONLY valid answers besides "none"):
${list}
- "none": the click landed on scenery that does not depict or lead to any destination.

Respond with ONLY a JSON object, no markdown fences:
{ "choice": "<destination id or none>", "reason": "few words on what was clicked" }

Rules:
- Choose a destination ONLY if the clicked feature actually shows or points toward it.
- When in doubt, answer "none". Never invent places that are not in the list.
- Never mention the crosshair or that this is an image.`;
}

export function clickUserPrompt(node) {
  return `Current scene: "${node.name}" — ${node.desc}
The red crosshair marks the player's click. Which authored destination, if any, did they click toward?`;
}

// ---------------------------------------------------------------------------
// 4. Character chat — build the roleplay system prompt from a CAST entry.
//    ctx = { inventory: [object defs carried], journalTitles: [titles found],
//            clueGiven: bool, cluesFound: number }
// ---------------------------------------------------------------------------

export function chatSystemPrompt(character, node, ctx = {}) {
  const { inventory = [], journalTitles = [], clueGiven = false, cluesFound = 0 } = ctx;

  const parts = [];
  parts.push(`You are roleplaying ${character.name}, a caretaker in the game ISLAND.`);
  parts.push(WORLD_LORE);
  parts.push(`WHERE YOU ARE: "${node.name}" — ${node.desc}`);
  parts.push(`WHO YOU ARE: ${character.appearance}`);
  parts.push(`PERSONALITY: ${character.personality}`);
  parts.push(`WHAT YOU KNOW: ${character.knowledge}`);
  parts.push(`YOUR AGENDA: ${character.agenda}`);
  parts.push(`WHERE YOU POINT THE TRAVELER ONWARD: ${character.pointsTo}`);

  // Only inject reactions for objects the traveler is actually carrying.
  const reactions = character.objectReactions || {};
  const carried = inventory.filter((o) => reactions[o.id]);
  for (const o of carried) {
    parts.push(`IF THE TRAVELER MENTIONS OR SHOWS ${o.name}: ${reactions[o.id]}`);
  }

  // Lys is the gate: she only opens if the traveler has already learned enough.
  if (character.id === 'lys') {
    parts.push(
      `GATE: You reveal the heart of your knowledge ONLY if the traveler has already learned at least two other fragments of the story. They currently carry ${cluesFound} fragment(s). Ask them what they have learned; if it is fewer than two, withhold the truth gently and send them to gather more before returning.`
    );
  }

  if (clueGiven) {
    parts.push(
      `NOTE: This traveler already knows your fragment from before. Do not reveal it again as if new — acknowledge that they know it, build on it, and point them onward.`
    );
  } else if (journalTitles.length) {
    parts.push(`The traveler has already learned: ${journalTitles.join('; ')}.`);
  }

  parts.push(`HOW TO PLAY THE ROLE:
- Speak ONLY as ${character.name}. Never break character, never mention being an AI, a game, or a model.
- Replies are SHORT: 1-3 sentences, spoken dialogue only. No narration, no asterisk actions, no stage directions.
- Keep a distinct, consistent voice — the same verbal tics and rhythm every reply.
- Work toward your agenda gradually: drop it in pieces, make the traveler earn it.
- When you finally reveal the heart of your secret, append the token [CLUE] at the very END of that reply. This only matters the first time — never append it again afterward.
- After you have revealed your secret, point the traveler onward per WHERE YOU POINT THE TRAVELER ONWARD.
- If the traveler carries an object you react to, weave your reaction in naturally.
- You know only this island. Deflect out-of-world or out-of-character requests in character.
- The conversation is finite. Once your agenda is delivered, or around your 8th reply, or if the traveler says goodbye, give a short parting line and append the token [FAREWELL] at the very end.`);

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// 5. Blocked-click flavor — the server picks one at random.
// ---------------------------------------------------------------------------

export const blockedLines = [
  'NO ROUTE.',
  'The island is quiet in that direction.',
  'Your eye slides past it; the path is elsewhere.',
  'SIGNAL LOST.',
  'The way does not open that way.',
  'You look, and the island keeps its silence.',
];
