# ISLAND

*A next-generation point-and-click exploration game.* One painting is the whole
interface. The world — **the island of Cadence** — is a hand-authored world
model that AI renders: an image model paints each place under a strict style
guide, a vision model finds the clickable features in each painting, and an
LLM plays the island's five caretakers in character.

The vibe: **Myst** solitude, **Psygnosis / Roger Dean** box-cover surrealism,
90s CD-ROM adventure pacing, with an ambient soundscape synthesized live in
Web Audio (no audio files).

## The world

Cadence is one vast instrument. Its builders, the Tidewrights, played it once —
the night of the Answering, thirty-nine years ago — and vanished into the
sound. Five caretakers remain, and each holds one **fragment** of why. The
player explores ~32 authored locations across six regions (the Harbor of
Returned Ships, the Ringwood, the Basin, the Twin Horns, the Chancel, the
Whistling Terraces), talks to the caretakers, gathers fragments into a
**journal**, and pieces together what was cut short — and what is still
waiting to be finished in the Tuning Room beneath the lake.

Everything that exists is authored in `lib/world.js`: the location tree
(depth 0 aerial view → depth 4 innermost rooms), lateral connections, the
cast (personality, knowledge, agenda, who they point you toward, how they
react to objects you carry), six story objects, and the five journal
fragments. The AI renders this world; it never invents geography.

## How navigation works (and why it feels right)

- When a scene is first visited, the server paints it (the authored
  `imagePrompt` explicitly includes every navigable feature, so what you can
  click is literally in the painting), then runs **one vision pass** to locate
  each destination, the resident character, and any objects — hotspots land on
  real pixels, and are cached forever in `data/`.
- Hovering near a destination swells the cursor ring and shows a floating
  label ("▾ The Swallowed Tower" / "▸ The Long Pier"); brief glints mark the
  ways forward when a scene loads; the top edge always means **▴ ascend**.
- A click near a located destination travels there instantly. A click on
  anything else goes to a vision fallback that must map it to one of the
  scene's *authored* destinations — or answer "none", which gets a quiet
  refusal line. You can never click a random wall and end up somewhere random.

## Characters that build one story

Each caretaker is played by the LLM from their authored card, with
**persistent memory** across conversations (server-side). They steer toward
their agenda, reveal their fragment when you earn it (`[CLUE]` → journal, with
a toast and a pulse on the journal button), then point you to the next
caretaker — a ring of hearsay that keeps every conversation feeding the same
mystery. They react to objects in your satchel (bring Maren the sea-glass
lens), Sister Lys won't open up until you carry at least two other fragments,
and they end conversations themselves (`[FAREWELL]`).

## Running it

```bash
npm install
cp .env.example .env   # put your OpenRouter key in .env
npm start              # http://localhost:3000
```

No key? It runs in **mock mode** — procedural placeholder paintings and
scripted caretaker lines — so the full loop (navigate → chat → fragment →
journal → take → satchel) works for free. Delete `data/` to repaint the world
and reset progress.

## Architecture

```
Browser (public/)                        Server (server.js)
┌──────────────────────────┐            ┌────────────────────────────────────┐
│ one <img> = the world    │   click    │ /api/click:                        │
│ nav labels + glint dots  │ ─────────► │  1 top edge → ascend               │
│ character/object glows   │            │  2 nearest located navPoint        │
│ veil transition          │ ◄───────── │  3 vision fallback vs authored     │
│ journal + satchel        │  new scene │    destinations only, else blocked │
│ Web Audio ambience       │            │ realizeNode: paint once → locate   │
└──────────────────────────┘            │ features once → cache in data/     │
                                        └────────────────────────────────────┘
lib/world.js  — the world bible: nodes, cast, objects, fragments, lore
lib/prompts.js — style guide + paint/locate/click/chat prompt builders
lib/store.js  — cached paintings & hotspots; player state (journal, satchel,
                chat memories, visited)
```

All AI calls go through **OpenRouter** (`lib/openrouter.js`):

| Role | Default model | Override env var |
|---|---|---|
| Caretaker chat | `anthropic/claude-sonnet-4.5` | `ISLAND_TEXT_MODEL` |
| Feature location & click fallback | `anthropic/claude-sonnet-4.5` | `ISLAND_VISION_MODEL` |
| Painting | `google/gemini-2.5-flash-image` | `ISLAND_IMAGE_MODEL` |

The style contract lives in `lib/prompts.js` (`STYLE_GUIDE`) — appended to
every image prompt so all ~32 paintings read as one artist's world.

## Sound

`public/js/audio.js` synthesizes everything: seven ambient beds (surf, wind,
forest, interior, cavern, water, and the island's low *hum*) crossfaded per
scene, plus click ripples, travel whooshes, arrival chimes, pickup arpeggios,
and dialogue blips.
