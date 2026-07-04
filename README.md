# ISLAND

*A next-generation point-and-click exploration game.* One painting is the whole
interface. Click anywhere; an AI figures out **what** you clicked, invents the
place it leads to, paints it in a consistent style, and drops you there — up to
four levels deep into an island that did not exist a moment ago.

The vibe: **Myst** solitude, **Psygnosis / Roger Dean** box-cover surrealism,
90s CD-ROM adventure pacing, with an ambient soundscape synthesized live in
Web Audio (no audio files).

## How it plays

- **Begin** on a bird's-eye painting of the island.
- **Click anything** — a forest, a pier, a glinting roof. A vision model reads
  the exact pixel you clicked (a crosshair is composited onto the image
  server-side), names the feature, and decides whether the click goes
  **deeper**, **lateral** (sideways at the same scale), **up** (back toward the
  aerial view), or is **blocked**.
- A world-builder model invents the next scene — name, description, image
  prompt, ambience — keeping continuity with where you came from, then an image
  model paints it under a strict style guide so the whole island feels like one
  artist made it.
- **Characters** (glowing blue) appear where a lone caretaker plausibly lives.
  Each has a generated personality, knowledge, and a hidden *agenda* that
  steers the conversation; they speak in short in-character lines and will end
  the chat themselves with a farewell.
- **Objects** (glowing gold) can be examined and taken into your satchel.
  Taken objects stay gone from the scene.
- Scenes are cached on disk (`data/`) — revisiting a click is instant, and your
  island persists across restarts. Delete `data/` to be dealt a new island.

## Running it

```bash
npm install
cp .env.example .env   # put your OpenRouter key in .env
npm start              # http://localhost:3000
```

No key? It still runs in **mock mode** — procedural placeholder paintings and
canned characters — so the full loop (click → interpret → travel → chat →
inventory) can be exercised for free.

## Architecture

```
Browser (public/)                       Server (server.js)
┌───────────────────────┐   click x,y   ┌──────────────────────────────┐
│ one <img> = the world │ ────────────► │ 1 sharp: stamp crosshair     │
│ glow hotspots overlay │               │ 2 vision: "what is this?"    │
│ veil transition       │ ◄──────────── │ 3 LLM: invent next scene     │
│ Web Audio ambience    │   new scene   │ 4 image model: paint it      │
│ chat / satchel UI     │               │ 5 vision: locate hotspots    │
└───────────────────────┘               │ 6 cache to data/             │
                                        └──────────────────────────────┘
```

All AI calls go through **OpenRouter** (`lib/openrouter.js`):

| Role | Default model | Override env var |
|---|---|---|
| World-building & chat | `anthropic/claude-sonnet-4.5` | `ISLAND_TEXT_MODEL` |
| Click & hotspot vision | `anthropic/claude-sonnet-4.5` | `ISLAND_VISION_MODEL` |
| Painting | `google/gemini-2.5-flash-image` | `ISLAND_IMAGE_MODEL` |

The style contract lives in `lib/prompts.js` (`STYLE_GUIDE`) — every image
prompt gets it appended, which is what keeps a hundred generated scenes looking
like one world. World tone lives beside it in `WORLD_LORE`.

## Sound

`public/js/audio.js` synthesizes everything: seven ambient beds (surf, wind,
forest, interior, cavern, water, and the island's low *hum*) crossfaded per
scene, plus click ripples, travel whooshes, arrival chimes, pickup arpeggios,
and dialogue blips.
