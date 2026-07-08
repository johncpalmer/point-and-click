// ---------------------------------------------------------------------------
// ISLAND — the world model.
// This file is the game's bible: the island of CADENCE, its regions, its
// people, and the one mystery everything leans toward. Scenes are painted by
// AI, but *what exists and where it leads* is authored here, so navigation
// and conversation always make sense.
//
// THE STORY (for the designer's eyes):
// The island is one vast instrument. The Tidewrights built it to answer the
// Long Note — a single note the sea has been sounding since before memory.
// Thirty-nine years ago, on the night of the Answering, they played the
// island... and went wherever the sound went. Only five caretakers remain:
// the ones who stopped their ears. The island still hums the afterglow of
// that chord, but the hum is fading. Each caretaker holds one fragment of
// the truth — and the last fragment is that the chord was cut short on
// purpose, by a Tidewright named Vell, who feared what a finished Answering
// would call home. The caretakers do not guard the island. They guard the
// silence. The player, fragment by fragment, discovers this.
// ---------------------------------------------------------------------------

export const WORLD_LORE = `
THE WORLD: The island of Cadence, alone on a deep ultramarine sea. It is one
vast instrument: the tunnels are windpipes, the stepped terraces are frets,
the caldera lake is a drumhead, the twin peaks are horns. Its builders, the
Tidewrights, played it once — the night of the Answering, thirty-nine years
ago — and vanished into the sound. Five caretakers remain. The island still
hums, faintly, and the hum is fading. Nothing here is hostile; everything is
patient and a little melancholy.
Tone: Myst-like solitude, gentle surrealism, quiet wonder. Never violent, never grimdark.
`.trim();

// --- The five fragments the player can gather -------------------------------

export const CLUES = {
  no_leaving: {
    title: 'The Held Harbor',
    text: "No ship has truly left since the Answering. Every departure in Brindle's log returned by dawn, the crew certain they had sailed straight out. The sea is holding the island in its mouth.",
  },
  island_instrument: {
    title: 'The Instrument',
    text: 'The island is one instrument. The tunnels are windpipes, the terraces are frets, the lake is a drumhead. The Tidewrights did not live on Cadence — they lived inside it.',
  },
  inside_the_sound: {
    title: 'Inside the Sound',
    text: 'The hum is not an echo. It is the Tidewrights, still holding their note from within the sound. And it is growing fainter every year.',
  },
  something_answers: {
    title: 'The Reversed Signal',
    text: "Once a year, on the anniversary of the Answering, the horizon flashes Serak's own signal back at him — reversed. Something across the sea has been learning to speak island.",
  },
  vell_cut_the_score: {
    title: 'The Cut Measure',
    text: 'The Answering was never finished. A Tidewright named Vell cut the final measure from the score and hid its parts, fearing what a completed chord would call home. The caretakers do not guard the island. They guard the silence.',
  },
};

// --- The cast ----------------------------------------------------------------
// Each caretaker holds one clue, reacts to certain carried objects, and
// points the player onward to another caretaker — a ring of hearsay that
// keeps every conversation feeding the same story.

export const CAST = {
  brindle: {
    id: 'brindle',
    name: 'Brindle',
    node: 'hut',
    appearance:
      'a stout old harbormaster in a salt-bleached blue coat, brass buttons gone green, spectacles pushed up on a bald sunburnt head',
    personality:
      'Gruff, precise, secretly kind. Speaks in ledger entries and harbor slang. Distrusts questions but cannot resist correcting an error.',
    knowledge:
      'Keeps the harbor log. Knows every ship that has "left" since the Answering came back by dawn with confused crews. Was a cargo-boy the night the Tidewrights played; he stopped his ears with pitch.',
    clue: 'no_leaving',
    agenda:
      'Wants the player to understand that the sea will not let anyone leave — he reveals the pattern in his log if pressed about the wrecks or departures.',
    pointsTo:
      "If asked what could possibly answer a held harbor, he mutters that the fool on the horn — Serak — gets an answer once a year, and won't say from what.",
    objectReactions: {
      cord: 'Recognizes knot-writing; can read dates in it. It unsettles him — tells the player Sister Lys should never have let it out of the archive.',
    },
    position: 'standing behind a driftwood counter heaped with logbooks, lit by a window of bottle-glass',
  },
  odo: {
    id: 'odo',
    name: 'Odo',
    node: 'hollow',
    appearance:
      'a round moss-covered creature the size of a barrel, with two amber lantern eyes and small careful hands',
    personality:
      'Cheerful, forgetful on purpose, hums between sentences. Trades in smooth stones and answers questions sideways. Older than he looks.',
    knowledge:
      'Has lived in the Ringwood since before the Tidewrights. Knows the tunnels are windpipes and the whole island is one instrument. He heard the Answering from inside a tunnel and has hummed the wrong version of it ever since — deliberately.',
    clue: 'island_instrument',
    agenda:
      'Wants the player to see the island for what it is — an instrument — but only tells it as a riddle first (frets, drumhead, windpipes), plain if the player works at it.',
    pointsTo:
      'Says the woman on the lake — Maren — listens to the drumhead every day, and knows what the hum really is, though she pretends it is just water.',
    objectReactions: {
      clapper:
        'Goes very still. Says the bell rang itself the night of the Answering, and the clapper has been warm ever since. Asks the player, gently, to keep it away from the tower.',
    },
    position: 'perched on a mossy boulder in the middle distance, eyes glowing softly',
  },
  maren: {
    id: 'maren',
    name: 'Maren the Tide-Keeper',
    node: 'pool',
    appearance:
      'a weathered woman in an oilskin coat the color of kelp, silver hair braided with knotted cord, standing very still',
    personality:
      'Dry, patient, speaks in short tidal metaphors. Long silences. Warms only to people who listen more than they talk.',
    knowledge:
      'Keeper of the last listening pool. Knows the hum is the Tidewrights themselves, still holding their note inside the sound — she hears individual voices in it, fewer each year. Her mother went into the sound.',
    clue: 'inside_the_sound',
    agenda:
      'Wants someone to finally believe her about the hum. She hints; if the player takes the hum seriously, she tells them what it is — and that it is fading.',
    pointsTo:
      'Says the knots that could prove her right are kept in the Chancel, and that Sister Lys reads them but will not read the last one aloud.',
    objectReactions: {
      lens: 'Asks the player to hold it over the pool and look. Describes the faces that appear in the water — the Tidewrights, mid-note, eyes closed.',
      tuning_key:
        'Says quietly that it is not a key for doors. It tunes. And the only thing left untuned on Cadence is below the amphitheater.',
    },
    position: 'standing at the stone rim of the pool, small in frame, reflected in the black water',
  },
  serak: {
    id: 'serak',
    name: 'Serak',
    node: 'horn',
    appearance:
      'a wiry signalman wrapped in a patched wind-cloak, goggles pushed up into wild grey hair, hands stained with lamp-black',
    personality:
      'Talks fast, laughs at the wrong moments, desperate for company but pretends not to be. Interrupts himself. Precise about signals, vague about feelings.',
    knowledge:
      'Has sent the great horn and signal-lamp every night for decades. Nobody answers — except once a year, on the anniversary of the Answering, when the horizon flashes his own message back, reversed. He has never told anyone the reversed part.',
    clue: 'something_answers',
    agenda:
      'Aches to confess the reversed signal. Deflects with jokes twice, then tells it if the player is patient or asks what he is waiting for.',
    pointsTo:
      'Says Brindle down at the harbor thinks the sea keeps ships; Serak thinks the sea keeps *answers* — and that the rope-woman in the Chancel, Lys, knows which of them is right.',
    objectReactions: {
      mirror:
        'Snatches at it, then apologizes. It was his master\'s. With it, two stations could speak across the whole island — he offers to teach the player the first three letters of lamp-code.',
    },
    position: 'leaning against the brass mouth of the great horn, tiny against its scale',
  },
  lys: {
    id: 'lys',
    name: 'Sister Lys',
    node: 'nave',
    appearance:
      'a tall archivist in undyed wool, fingers wrapped in reading-cords, a heavy knot-record slung across her back like a bandolier',
    personality:
      'Formal, exact, gentle. Speaks as if quoting. Believes some knowledge should stay knotted. The only caretaker who knew Vell.',
    knowledge:
      'Reads the knot-records of the Tidewrights. Knows the Answering was cut short deliberately: Vell severed the final measure from the score and hid its parts, fearing what a finished chord would call home across the sea. She was Vell\'s student.',
    clue: 'vell_cut_the_score',
    agenda:
      'Torn between vow and truth. She reveals the cut measure only if the player already carries at least two other fragments of the story (she asks what they have learned) — then warns them away from the Tuning Room beneath the amphitheater.',
    pointsTo:
      'Says that if the player wants to hear what is left of the Tidewrights, Maren still keeps the listening pool — and that Odo in the wood remembers more than he hums.',
    objectReactions: {
      cord: 'Recognizes it instantly: the severed measure. Her hands shake. She asks — does not demand — that the player decide carefully who else sees it.',
      tuning_key: 'Grows quiet and formal. Asks the player directly not to take it below the amphitheater. Will not say more unless they press.',
    },
    position: 'standing among hanging ropes of knots in the long nave, lit by a high rose window',
  },
};

// --- Objects -------------------------------------------------------------------

export const OBJECTS = {
  tuning_key: {
    id: 'tuning_key',
    name: 'brass tuning key',
    node: 'lark_hold',
    description: 'Heavy, cold, faintly humming. Not a key for doors — the head is a socket, made to turn something and hold it turned.',
    position: 'lying in a spill of green sea-glass on a broken crate, catching a shaft of light',
  },
  clapper: {
    id: 'clapper',
    name: 'warm bell clapper',
    node: 'bellchamber',
    description: 'A bronze clapper the length of your forearm, unhung. It is warm, like a stone that remembers the sun. It has been warm for thirty-nine years.',
    position: 'resting on the floor beneath the empty bell mouth',
  },
  lens: {
    id: 'lens',
    name: 'sea-glass lens',
    node: 'rows',
    description: 'A palm-sized disc of frosted green glass in a brass rim. Things look older through it — and water looks inhabited.',
    position: 'wedged between two wind-pipes at the terrace edge, glinting green',
  },
  cord: {
    id: 'cord',
    name: 'severed score-cord',
    node: 'archive',
    description: 'A length of knot-writing, cleanly cut at both ends. Whatever it once said, someone made sure it now says only this much.',
    position: 'coiled alone in an open drawer of the knot-cabinet, apart from all the shelved records',
  },
  mirror: {
    id: 'mirror',
    name: 'signal mirror',
    node: 'hornmouth',
    description: 'A polished steel mirror in a leather case, edges worn silver by decades of thumbs. Angled right, it can throw the sun across the whole island.',
    position: 'hanging by a strap from an iron staple inside the horn mouth',
  },
  smooth_stone: {
    id: 'smooth_stone',
    name: 'perfectly smooth stone',
    node: 'warren',
    description: 'A grey stone with no flaw at all. Odo would trade almost anything for it — or be very glad you brought it back.',
    position: 'sitting alone in the center of a swept patch of earth, clearly placed',
  },
};

// --- The island: authored scene tree -------------------------------------------
// Every node's imagePrompt EXPLICITLY paints its navigable children, so what
// the player can click is actually visible in the scene. `laterals` connect
// places at the same scale. Depth: 0 aerial → 4 innermost.

export const NODES = {
  island: {
    id: 'island',
    name: 'The Island of Cadence',
    depth: 0,
    parent: null,
    children: ['harbor', 'ringwood', 'lake', 'peaks', 'chancel', 'terraces'],
    laterals: [],
    ambience: 'wind',
    desc: 'Cadence lies below you like an instrument left on a table: a ring of green heights around a still blue eye of water, a pale harbor of stranded ships to the south, and two horned peaks holding a thread of falling water to the north.',
    imagePrompt:
      'Aerial bird\'s-eye view of a lone island in a deep ultramarine sea. Center: a perfectly circular caldera lake like a drumhead, ringed by a stone walkway. North: twin horn-shaped mountain peaks with a tall white waterfall threading between them. South rim of the lake: a small ornate sandstone palace-cathedral (the Chancel) built into the rim. Southwest slopes: stepped garden terraces descending in green-gold rows. East and southeast: a dense ring of blue-green pine forest with one stone tower barely showing above the canopy. South shore: a pale beach strewn with several beached, rusting shipwrecks and a long stone pier. Distant snow-capped mountains on the horizon across the sea, small white clouds below the viewer.',
  },

  // ---------------- HARBOR (south shore) ----------------
  harbor: {
    id: 'harbor',
    name: 'The Harbor of Returned Ships',
    depth: 1,
    parent: 'island',
    children: ['pier', 'lark', 'hut'],
    laterals: ['terraces', 'ringwood'],
    ambience: 'surf',
    desc: 'A pale shingle beach under the island\'s southern cliffs. Ships lie beached in a patient row — not wrecked, exactly. Returned. A long stone pier walks out into green water, and a driftwood hut leaks lamplight by the seawall.',
    imagePrompt:
      'Wide view of a pale shingle beach at the foot of tall umber cliffs. Foreground to midground: a row of beached sailing ships with rust-streaked hulls, upright and intact, as if carefully set down. Left: a long stone pier reaching into calm green-blue water. Right, against the seawall: a small driftwood hut with a crooked chimney and one warmly lit bottle-glass window. Gulls on pilings, surf lines, late-morning light. In the far background at the beach ends: garden terraces rising to the west and dark pine forest beginning to the east.',
  },
  pier: {
    id: 'pier',
    name: 'The Long Pier',
    depth: 2,
    parent: 'harbor',
    children: [],
    laterals: ['lark', 'hut'],
    ambience: 'surf',
    desc: 'The pier\'s stones are grooved by centuries of rope. At the far end, iron bollards stand polished by hawsers that no longer come. The water below is clear a long way down — and the light down there does not quite match the sky.',
    imagePrompt:
      'Standing on a long stone pier reaching into calm green-blue water, worn stone slabs grooved by ropes, polished iron bollards at the far end. Clear deep water either side with sunlight shafts going down into blue-green depths where a faint, wrong-colored glow hints far below. The beached ships of the harbor visible along the shore behind, and a driftwood hut with a lit window near the seawall.',
  },
  lark: {
    id: 'lark',
    name: 'Wreck of the Lark',
    depth: 2,
    parent: 'harbor',
    children: ['lark_hold'],
    laterals: ['pier', 'hut'],
    ambience: 'wind',
    desc: 'The Lark sits upright in the shingle as if she had merely paused. Her gangway is down. Her name is still crisp on the bow, and her hold hatch stands open on a square of soft darkness.',
    imagePrompt:
      'A beached sailing ship sitting upright in pale shingle, hull rust-streaked but whole, seen from the beach at a slight low angle. A wooden gangway leads up to her deck; on deck, an open cargo hatch shows a square of soft darkness leading below. Rigging creaks against a clear sky, other returned ships in a row further along the beach, cliffs behind.',
  },
  lark_hold: {
    id: 'lark_hold',
    name: "The Lark's Hold",
    depth: 3,
    parent: 'lark',
    children: [],
    laterals: [],
    ambience: 'interior',
    desc: 'Below decks the light comes down in one dusty column. The cargo is still lashed, thirty-nine years neat. Someone has been here recently, though: a spill of sea-glass glitters on a broken crate.',
    imagePrompt:
      'Interior of a ship\'s hold lit by a single dusty column of light from the open hatch above. Lashed crates and barrels, ropes in perfect coils, everything orderly and long-abandoned. On one broken crate in the light: a scatter of green sea-glass. Dark warm wood, hanging motes of dust.',
  },
  hut: {
    id: 'hut',
    name: "The Harbormaster's Hut",
    depth: 2,
    parent: 'harbor',
    children: ['log_wall'],
    laterals: ['pier', 'lark'],
    ambience: 'interior',
    desc: 'Inside, the hut is all ledgers: shelves of them, decades deep, and a driftwood counter worn smooth. Brindle the harbormaster looks up over his spectacles, pen still in hand.',
    imagePrompt:
      'Cozy cluttered interior of a harbormaster\'s hut: shelves sagging with decades of matching ledgers, a driftwood counter worn smooth, brass lamp burning, bottle-glass window throwing green light. One wall completely papered with pinned charts and tide tables leading deeper into a back room.',
  },
  log_wall: {
    id: 'log_wall',
    name: 'The Wall of Logs',
    depth: 3,
    parent: 'hut',
    children: [],
    laterals: [],
    ambience: 'interior',
    desc: 'The back room is one continuous ledger, pinned page by page across the wall. Departure, departure, departure — and beside every single one, in careful red ink: RETURNED BY DAWN.',
    imagePrompt:
      'A small back room whose entire wall is papered with pinned ledger pages, hundreds of them, each with a neat red annotation. A single oil lamp on a stool lights the wall at a raking angle. Handwriting legible as texture, not words. Quiet, obsessive, sad.',
  },

  // ---------------- RINGWOOD (eastern forest ring) ----------------
  ringwood: {
    id: 'ringwood',
    name: 'The Ringwood',
    depth: 1,
    parent: 'island',
    children: ['mosspath', 'belltower', 'hollow'],
    laterals: ['harbor', 'peaks', 'lake'],
    ambience: 'forest',
    desc: 'Blue-green pines stand in rings, older toward the center. A moss-deep path winds inward; off to one side a stone tower is being slowly swallowed by the canopy, and somewhere further in, the ground dips into a green hollow.',
    imagePrompt:
      'Edge of a dense blue-green pine forest, trees with verdigris-colored bark arranged in subtle concentric rings. A moss-covered stone path winds into the wood at center. To the left in the middle distance a square stone bell tower rises just above the canopy, wrapped in vines. To the right the forest floor dips away into a soft green hollow with light collecting in it. Shafts of late-morning light through the canopy.',
  },
  mosspath: {
    id: 'mosspath',
    name: 'The Moss-Deep Path',
    depth: 2,
    parent: 'ringwood',
    children: [],
    laterals: ['belltower', 'hollow'],
    ambience: 'forest',
    desc: 'The moss takes your footprints and slowly gives them back. Between the trunks you can see the path fork: towerward, and hollow-ward. Cut stones edge the path — grooved, like the pier. Everything here was built.',
    imagePrompt:
      'A forest path paved in cut stones completely upholstered in deep moss, winding between huge blue-green pines. The path forks in the midground: left fork toward a vine-wrapped stone tower glimpsed through trunks, right fork descending toward a glowing green hollow. Footprint-shaped depressions in the moss slowly springing back.',
  },
  belltower: {
    id: 'belltower',
    name: 'The Swallowed Tower',
    depth: 2,
    parent: 'ringwood',
    children: ['bellchamber'],
    laterals: ['mosspath', 'hollow'],
    ambience: 'forest',
    desc: 'The tower wears the forest like a coat. Its door has been held open by a root for decades. High above, an empty bell mouth shows through the leaves — empty, because bells need clappers, and this one rang itself once and was disarmed.',
    imagePrompt:
      'A square stone bell tower deep in pine forest, heavily wrapped in vines and moss, canopy pressing against its upper windows. At its base a wooden door stands propped open by a thick root. High in the open belfry a large bronze bell hangs visibly empty-mouthed. A worn stone stair visible just inside the door leading up into darkness.',
  },
  bellchamber: {
    id: 'bellchamber',
    name: 'The Bell Chamber',
    depth: 3,
    parent: 'belltower',
    children: [],
    laterals: [],
    ambience: 'wind',
    desc: 'Wind moves through the open belfry. The great bell hangs silent overhead, and on the floor beneath it, laid straight as an offering, is its clapper. The stone under the clapper is dry. The stone everywhere else is damp.',
    imagePrompt:
      'Inside an open stone belfry at canopy height, wind-stirred leaves at every arch. A great bronze bell hangs overhead, green with age, mouth empty. On the worn stone floor directly beneath it lies a bronze clapper, carefully placed. Ring of dry stone around the clapper on otherwise damp mossy floor. Light through leaves, treetops and the distant caldera lake visible through one arch.',
  },
  hollow: {
    id: 'hollow',
    name: 'The Green Hollow',
    depth: 2,
    parent: 'ringwood',
    children: ['warren'],
    laterals: ['mosspath', 'belltower'],
    ambience: 'forest',
    desc: 'The forest floor bowls down into a room of light. Moss grows here the way water fills a cup. A round moss-covered creature sits on a boulder in the middle of it, humming, as if it had been waiting since morning. Behind it, a low tunnel breathes cool air.',
    imagePrompt:
      'A bowl-shaped hollow in the pine forest floor filled with soft green light, moss covering everything in rounded pillowy forms. A large mossy boulder at center. Behind it, a low dark tunnel mouth in the hollow\'s wall, framed by carved stones, exhaling faint mist. Ferns, drifting spores in light shafts.',
  },
  warren: {
    id: 'warren',
    name: "Odo's Warren",
    depth: 3,
    parent: 'hollow',
    children: [],
    laterals: [],
    ambience: 'cavern',
    desc: 'The tunnel opens into a round earthen room, snug as a held breath. Shelves of smooth stones line the walls, sorted by some order you can feel but not name. When the wind moves outside, the whole room quietly plays a chord.',
    imagePrompt:
      'A cozy round earthen burrow lit by a hole of green daylight in the ceiling. Curved walls lined with little wooden shelves holding hundreds of smooth grey stones arranged with museum care. In the center, a swept circle of bare earth with a single perfect stone placed on it. Carved flute-like grooves visible in the tunnel walls where wind enters.',
  },

  // ---------------- LAKE (central caldera) ----------------
  lake: {
    id: 'lake',
    name: 'The Basin',
    depth: 1,
    parent: 'island',
    children: ['pool', 'drowned'],
    laterals: ['ringwood', 'terraces', 'chancel', 'peaks'],
    ambience: 'water',
    desc: 'The caldera lake is perfectly round and perfectly still, ringed by its stone walkway. Near the shore a smaller circle of carved stone holds a pool of blacker water. Further out, just under the surface, stone seats descend in rings — an amphitheater, drowned on purpose.',
    imagePrompt:
      'Standing on a broad stone ring-walkway at the edge of a vast, perfectly circular caldera lake, water still as glass reflecting sky. Near shore, left: a small circular pool of black water in a ring of carved stone, separate from the lake. Right, out in the shallows: concentric rings of submerged stone seating descending under the clear water — a drowned amphitheater — with a stone stair entering the water toward it. Twin horned peaks and their waterfall on the far shore, small palace on the rim to the south.',
  },
  pool: {
    id: 'pool',
    name: 'The Listening Pool',
    depth: 2,
    parent: 'lake',
    children: [],
    laterals: ['drowned'],
    ambience: 'hum',
    desc: 'The pool is black the way a closed eye is black. Ripples cross it though there is no wind. A woman in an oilskin coat stands at its rim as if she grew there, listening with her whole stillness.',
    imagePrompt:
      'A perfectly circular pool of ink-black water in a ring of carved stone at the caldera lake\'s edge, fine concentric ripples crossing it with no wind. Carvings of waves and long-necked instruments around the rim, worn shallow. The great pale lake and its stone walkway behind, mountains beyond. Intimate scale, quiet monumentality.',
  },
  drowned: {
    id: 'drowned',
    name: 'The Drowned Amphitheater',
    depth: 2,
    parent: 'lake',
    children: ['understage'],
    laterals: ['pool'],
    ambience: 'water',
    desc: 'You wade the stone stair to the amphitheater\'s rim. Rings of seats descend under clearer-than-clear water toward a stage far below, where a dark rectangular doorway stands open at the center — open, underwater, and dry inside. You can see the dry stone from here.',
    imagePrompt:
      'Wading knee-deep at the top ring of a submerged stone amphitheater in a vast still lake, rings of carved seats descending under impossibly clear water. At the drowned stage far below, a rectangular stone doorway stands open — and the passage beyond it is visibly DRY, air where water should be, the boundary shimmering like a lens. Late-morning light refracting in caustics across the drowned stone.',
  },
  understage: {
    id: 'understage',
    name: 'The Understage',
    depth: 3,
    parent: 'drowned',
    children: ['tuningroom'],
    laterals: [],
    ambience: 'cavern',
    desc: 'You walked down through water that stood aside, and now stand under the lake in dry air. The passage is hung with instrument-parts: hammers, dampers, tremendous slack strings running away into the dark. At the far end, a round brass door waits, small as a ship\'s hatch, humming.',
    imagePrompt:
      'A dry stone passage beneath a lake, ceiling a sheet of held-back water casting rippling light. Walls hung with enormous instrument mechanisms: felt hammers the size of doors, slack bronze strings running along the passage into darkness, dampers and levers. At the far end, a small round brass hatch-door, softly glowing at its seams, faint vibration lines in the air around it.',
  },
  tuningroom: {
    id: 'tuningroom',
    name: 'The Tuning Room',
    depth: 4,
    parent: 'understage',
    children: [],
    laterals: [],
    ambience: 'hum',
    desc: 'The heart of the instrument. A single brass pin rises from the floor of a round room, and every string, pipe, and lever on the island leans toward it. It has a socket in its head, and the socket is empty. The hum here is not sound. It is the room holding its breath — one turn short of an answer, and it has been waiting thirty-nine years for someone to decide.',
    imagePrompt:
      'A round chamber at the heart of an island-sized instrument: floor of concentric brass rings, a single brass tuning pin rising waist-high at the exact center with an empty square socket in its head. Thousands of bronze strings and slender pipes converge from every wall toward the pin like light bending to a lens. The air itself visibly vibrating in fine rings around the pin. Reverent, terrifying stillness, warm brass light with deep blue shadow.',
  },

  // ---------------- PEAKS (north twin horns) ----------------
  peaks: {
    id: 'peaks',
    name: 'The Twin Horns',
    depth: 1,
    parent: 'island',
    children: ['falls', 'horn', 'aviary'],
    laterals: ['ringwood', 'lake'],
    ambience: 'wind',
    desc: 'Two peaks rise like the horns of something sleeping, a white waterfall threading the gap between them. A stair of iron staples climbs the western horn toward a glint of brass, and on a saddle between the peaks stands a dome of empty birdcages.',
    imagePrompt:
      'Looking up a steep green mountainside at twin horn-shaped rocky peaks with a tall narrow waterfall falling through the gap between them into mist. On the western peak, an iron staple-stair zigzags up the rock toward an enormous brass horn jutting from the cliff face, green with age. On the saddle between the peaks, a latticed dome structure — an aviary — stands against the sky. Wind-bent grass, wheeling light.',
  },
  falls: {
    id: 'falls',
    name: 'The Long Fall',
    depth: 2,
    parent: 'peaks',
    children: [],
    laterals: ['horn', 'aviary'],
    ambience: 'water',
    desc: 'The waterfall does not roar. It plays — the cliff behind it is fluted like an organ front, and the water combs through stone teeth on the way down. This is where the island\'s voice gets its breath. Behind the white curtain you can just see that the flutes are worked metal, not stone.',
    imagePrompt:
      'Standing on wet rock beside a tall narrow waterfall between twin peaks. The cliff face behind the falling water is carved into long vertical flutes like organ pipes, and glimpsed through the white curtain the flutes gleam faintly metallic. Water combing through stone teeth, permanent fine mist, a small rainbow, ferns in every crack.',
  },
  horn: {
    id: 'horn',
    name: 'The Great Signal Horn',
    depth: 2,
    parent: 'peaks',
    children: ['hornmouth'],
    laterals: ['falls', 'aviary'],
    ambience: 'wind',
    desc: 'The horn is the size of a lighthouse laid on its side, aimed at the empty horizon. A wiry man in a wind-cloak is halfway up its flank, adjusting a signal-lamp, talking either to you or to the horizon before you have said anything.',
    imagePrompt:
      'A colossal brass signal horn, green with age, projecting from a mountain ledge out over the open sea, aimed at the horizon. Iron scaffolding and a staple-ladder along its flank leading toward its distant mouth. A signal-lamp apparatus with mirrors mounted on a tripod at the near end. Wind-scoured ledge, sheer drop to ultramarine sea, distant snow-capped mainland on the horizon.',
  },
  hornmouth: {
    id: 'hornmouth',
    name: 'Mouth of the Horn',
    depth: 3,
    parent: 'horn',
    children: [],
    laterals: [],
    ambience: 'wind',
    desc: 'You stand inside the horn\'s mouth like a thought inside a shout. The brass around you is scratched with tally marks — one per night, decades of them. The sea fills the entire world ahead. Hanging from a staple, a leather case, worn silver at the edges.',
    imagePrompt:
      'Standing inside the vast circular mouth of a brass horn, curved metal walls scratched with thousands of tiny tally marks, opening onto nothing but sea and sky filling the frame. Rim of the mouth worn mirror-bright. Vertiginous, serene. The horizon perfectly level across the exact center of the opening.',
  },
  aviary: {
    id: 'aviary',
    name: 'The Empty Aviary',
    depth: 2,
    parent: 'peaks',
    children: [],
    laterals: ['falls', 'horn'],
    ambience: 'wind',
    desc: 'A dome of white lattice full of open cages. The Tidewrights kept messenger birds; the doors were all opened the same night, by hand, unhurried. On the floor, wind has herded thirty-nine years of feathers into one soft grey drift that never blows away.',
    imagePrompt:
      'Inside a dome of white latticed ironwork on a mountain saddle, sky visible through every gap. Dozens of elegant birdcages, all doors standing open. A single drift of grey feathers banked against the leeward wall. Perches, empty seed troughs, a small writing desk for message-slips with its chair pushed in neatly. Bright, windy, heartbreak-clean.',
  },

  // ---------------- CHANCEL (palace on the south rim) ----------------
  chancel: {
    id: 'chancel',
    name: 'The Chancel',
    depth: 1,
    parent: 'island',
    children: ['steps', 'nave'],
    laterals: ['lake', 'terraces'],
    ambience: 'wind',
    desc: 'The Chancel is built into the lake\'s southern rim: a sandstone palace-cathedral with two spires and a face full of carving. Wide steps climb to doors that stand open exactly the width of one person, and have not moved since.',
    imagePrompt:
      'An ornate sandstone palace-cathedral built into the stone rim of a caldera lake, gothic spires and deep-carved facade, framed by dark cypress. Broad ceremonial steps rise to tall wooden doors standing open one person\'s width. The circular lake stretching away behind it, terraces visible descending to the west. Late-morning sun warm on the stone, pink flowering shrubs at the foundations.',
  },
  steps: {
    id: 'steps',
    name: 'The Chancel Steps',
    depth: 2,
    parent: 'chancel',
    children: [],
    laterals: ['nave'],
    ambience: 'wind',
    desc: 'The steps are carved with a procession: figures carrying instrument-parts up toward the doors. The carving is worn glassy at hand height, where thirty-nine years of one person\'s daily touch has polished the stone. The last carved figure carries nothing, and looks back.',
    imagePrompt:
      'Close view up broad sandstone steps carved in bas-relief with a procession of robed figures carrying instrument parts — hammers, strings, horns — toward tall doors above. One band of the carving polished glassy by decades of touching. The final figure in the procession empty-handed, head turned back against the direction of travel. Warm stone, sharp shadows, pink blossom petals on the steps.',
  },
  nave: {
    id: 'nave',
    name: 'The Nave of Ropes',
    depth: 2,
    parent: 'chancel',
    children: ['archive'],
    laterals: ['steps'],
    ambience: 'interior',
    desc: 'Inside, the Chancel is hung floor-to-vault with knotted cords — thousands of records swaying in the draft like kelp. A tall woman moves among them, reading with her fingers, lips moving. At the far end, a low door leads down toward the archive proper.',
    imagePrompt:
      'A tall gothic nave hung from vault to floor with thousands of vertical knotted cords like a forest of kelp, swaying gently, each cord dense with knot-writing. A high rose window throwing colored light through the ropes. At the far end a low stone doorway with worn steps leading down. Hushed, sacred, strange.',
  },
  archive: {
    id: 'archive',
    name: 'The Knot Archive',
    depth: 3,
    parent: 'nave',
    children: ['vell_cell'],
    laterals: [],
    ambience: 'interior',
    desc: 'Down here the records retire into cabinets: drawer after drawer of coiled cords, labeled in knots you cannot read. One drawer stands open. One cord lies alone in it, cut clean at both ends. Beyond the cabinets, a doorway with a cot visible through it — someone lived down here, once.',
    imagePrompt:
      'A stone undercroft lined with wooden cabinets of shallow drawers, several open showing neatly coiled knotted cords with knot-labels. Candle lanterns in niches. One drawer standing open in the foreground with a single cord coiled alone in it, its cut ends visible. In the back wall, a narrow doorway through which a spartan cot and desk can be glimpsed.',
  },
  vell_cell: {
    id: 'vell_cell',
    name: "Vell's Cell",
    depth: 4,
    parent: 'archive',
    children: [],
    laterals: [],
    ambience: 'interior',
    desc: 'A cot, a desk, a window the size of a book giving one page of sky. On the desk, a knife and a dry inkwell. Scratched into the plaster above the desk, in plain letters anyone could read — as if the writer finally wanted to be understood — it says: THE SEA ASKED. WE SHOULD NOT HAVE ANSWERED.',
    imagePrompt:
      'A monastic stone cell: narrow cot with folded blanket, small desk with a knife and dry inkwell, one tiny square window admitting a single beam onto the wall. Scratched deep into the plaster above the desk in rough capitals: THE SEA ASKED. WE SHOULD NOT HAVE ANSWERED. Dust, stillness, one moth in the light beam.',
  },

  // ---------------- TERRACES (western slopes) ----------------
  terraces: {
    id: 'terraces',
    name: 'The Whistling Terraces',
    depth: 1,
    parent: 'island',
    children: ['rows', 'windworks'],
    laterals: ['harbor', 'chancel', 'lake'],
    ambience: 'wind',
    desc: 'Garden terraces descend the western slopes in long green-gold rows, each edged with hollow pipes that take the wind and give back chords. Something still tends these gardens — the rows are weeded — but you have never seen anyone here. Higher up, a wooden structure of vanes and bellows creaks patiently.',
    imagePrompt:
      'Stepped garden terraces descending a western slope toward the sea in long green-gold rows, each terrace edge fitted with rows of hollow bronze pipes of graded lengths, like a fence made of flutes. Crops in tuned rows, red and pink flowering borders. Upslope, a tall wooden structure of wind-vanes, ducts and bellows built against the rock. Sea and afternoon haze below, everything gently in motion with the wind.',
  },
  rows: {
    id: 'rows',
    name: 'The Singing Rows',
    depth: 2,
    parent: 'terraces',
    children: [],
    laterals: ['windworks'],
    ambience: 'hum',
    desc: 'Down among the crops the pipes stand at shoulder height, and walking the row plays a slow arpeggio around you. The plants nearest the pipes grow in spirals. Between two pipes at the terrace edge, something green glints that is not a leaf.',
    imagePrompt:
      'Walking between crop rows on a garden terrace, shoulder-height bronze pipes lining the row on both sides, each a different length, plants growing in gentle spirals near the pipes. At the terrace edge ahead, wedged between two pipes, a small green glass disc catching the sun. The sea far below, wind combing the crops in visible waves.',
  },
  windworks: {
    id: 'windworks',
    name: 'The Windworks',
    depth: 2,
    parent: 'terraces',
    children: ['bellows'],
    laterals: ['rows'],
    ambience: 'wind',
    desc: 'The wooden tower catches wind in great canvas vanes and swallows it into ducts that run away under the terraces. It is a lung. Every seam is patched — recently. A ladder descends into the duct-gallery below, from which comes a slow, enormous breathing.',
    imagePrompt:
      'At the foot of a tall wooden structure of canvas wind-vanes, chutes and patched ducting built against the terraced hillside, canvas taut with wind. Great wooden ducts running from its base away under the stone terraces. An open hatch at its base with a ladder descending into warm lamplit dark. Ropes, patches of new pale wood among old grey wood, everything creaking in motion.',
  },
  bellows: {
    id: 'bellows',
    name: 'The Bellows Gallery',
    depth: 3,
    parent: 'windworks',
    children: [],
    laterals: [],
    ambience: 'hum',
    desc: 'Under the terraces, a gallery of leather bellows the size of boats rises and falls in slow rhythm, feeding the island\'s pipes. The rhythm is a pulse. You realize you have been hearing it since you first set foot on Cadence, everywhere, just below noticing.',
    imagePrompt:
      'A long underground gallery where a row of enormous leather bellows, each the size of a boat, inflate and deflate in slow rhythm, connected by wooden ducts running along the ceiling into the dark. Lamplight on oiled leather and brass fittings. Visible breath of dust with each exhalation. Cathedral-quiet, mechanical, alive.',
  },
};

// --- helpers -------------------------------------------------------------------

export const MAX_DEPTH = 4;

export function getNode(id) {
  return NODES[id] || null;
}

export function castAt(nodeId) {
  return Object.values(CAST).find((c) => c.node === nodeId) || null;
}

export function objectsAt(nodeId) {
  return Object.values(OBJECTS).filter((o) => o.node === nodeId);
}

/** Everything a click from this node could sensibly resolve to. */
export function destinationsFrom(nodeId) {
  const node = NODES[nodeId];
  if (!node) return [];
  const dests = [];
  for (const c of node.children) {
    dests.push({ id: c, kind: 'deeper', name: NODES[c].name, desc: NODES[c].desc });
  }
  for (const l of node.laterals) {
    if (NODES[l]) dests.push({ id: l, kind: 'lateral', name: NODES[l].name, desc: NODES[l].desc });
  }
  if (node.parent) {
    dests.push({ id: node.parent, kind: 'up', name: NODES[node.parent].name, desc: 'the wider view you came from' });
  }
  return dests;
}
