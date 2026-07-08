// ---------------------------------------------------------------------------
// ISLAND — client game logic.
// One image is the world. Clicks are interpreted by the server's vision model;
// hotspots (characters, objects) glow; the veil covers scene generation.
// ---------------------------------------------------------------------------

(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    title: $('title-screen'),
    titleMode: $('title-mode'),
    painterPick: $('painter-pick'),
    painterSelect: $('painter-select'),
    painterStatus: $('painter-status'),
    begin: $('begin-btn'),
    game: $('game'),
    stage: $('stage'),
    img: $('scene-img'),
    imgOld: $('scene-img-old'),
    hotspots: $('hotspots'),
    navDots: $('nav-dots'),
    veil: $('veil'),
    veilWord: $('veil-word'),
    veilLines: $('veil-lines'),
    sceneName: $('scene-name'),
    depthPips: $('depth-pips'),
    ascend: $('ascend-btn'),
    toast: $('toast'),
    ripple: $('ripple'),
    cursor: $('cursor-ring'),
    cursorLabel: $('cursor-label'),
    scan: $('scan-btn'),
    scanPins: $('scan-pins'),
    inventoryBtn: $('inventory-btn'),
    invCount: $('inv-count'),
    satchel: $('satchel'),
    satchelList: $('satchel-list'),
    satchelClose: $('satchel-close'),
    objCard: $('object-card'),
    objName: $('obj-name'),
    objDesc: $('obj-desc'),
    objTake: $('obj-take'),
    objLeave: $('obj-leave'),
    chat: $('chat'),
    chatName: $('chat-name'),
    chatLog: $('chat-log'),
    chatForm: $('chat-form'),
    chatInput: $('chat-input'),
    chatClose: $('chat-close'),
    journalBtn: $('journal-btn'),
    journalCount: $('journal-count'),
    journal: $('journal'),
    journalList: $('journal-list'),
    journalClose: $('journal-close'),
    ending: $('ending'),
    endingTitle: $('ending-title'),
    endingText: $('ending-text'),
    endingClose: $('ending-close'),
    oracle: $('oracle'),
    oracleLog: $('oracle-log'),
    oracleForm: $('oracle-form'),
    oracleInput: $('oracle-input'),
    oracleClose: $('oracle-close'),
    adminSave: $('admin-save'),
    adminOracle: $('admin-oracle'),
    adminReset: $('admin-reset'),
  };

  const state = {
    scene: null,
    busy: false,
    inventory: [],
    journal: [],
    cluesTotal: 0,
    chat: null, // { characterId, ended }
    pendingObject: null,
    overHotspot: false,
    live: false,
    lastClick: null, // normalized {x,y} of the click that started a travel
  };

  const OBJECT_GLYPHS = ['🗝', '🔮', '🐚', '🪶', '🧭', '📜', '🫙', '🪨', '🔔', '🕯'];

  const VEIL_WORDS = {
    deeper: 'DESCENDING',
    lateral: 'TRAVERSING',
    up: 'ASCENDING',
    root: 'LANDFALL',
  };

  const VEIL_LINES = [
    'SCANNING TERRAIN GEOMETRY',
    'RESOLVING FEATURE UNDER CURSOR',
    'CHARTING UNMAPPED SECTOR',
    'SYNTHESIZING ATMOSPHERE',
    'COMPOSITING PAINT LAYERS',
    'CALIBRATING LIGHTFIELD',
    'BINDING AMBIENT CHANNEL',
    'INDEXING LANDMARKS',
    'WAKING THE PAINTER',
    'LISTENING FOR THE ISLAND',
    'PLOTTING ROUTE',
    'DEVELOPING PLATES',
    'READING THE TIDE LEDGER',
    'ALIGNING HORIZON',
  ];

  // ------------------------------------------------------------------ API

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  }

  async function apiGet(path) {
    const res = await fetch(path);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  }

  // ------------------------------------------------------------------ veil

  let veilTimer = null;

  function addVeilLine(text) {
    const d = document.createElement('div');
    d.textContent = text;
    el.veilLines.appendChild(d);
    while (el.veilLines.children.length > 5) el.veilLines.firstChild.remove();
  }

  // expedition telemetry: rotating reticle, direction word, mono readout lines.
  // `fix` (optional) is the normalized click coordinate that started the travel.
  function veilOn(direction, fix) {
    el.veilWord.textContent = VEIL_WORDS[direction] || VEIL_WORDS.deeper;
    if (el.veil.classList.contains('on')) return; // already running — just retitle
    el.veilLines.innerHTML = '';
    if (fix) addVeilLine(`FIX ${fix.x.toFixed(3)} · ${fix.y.toFixed(3)}`);
    const pool = [...VEIL_LINES].sort(() => Math.random() - 0.5);
    let i = 0;
    addVeilLine(pool[i++]);
    veilTimer = setInterval(() => {
      const tag = Math.random() < 0.4
        ? ` · ${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0').toUpperCase()}`
        : '…';
      addVeilLine(pool[i++ % pool.length] + tag);
    }, 1500);
    el.veil.classList.add('on');
  }

  function veilOff() {
    clearInterval(veilTimer);
    veilTimer = null;
    el.veil.classList.remove('on');
  }

  // ------------------------------------------------------------------ scene

  function preload(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(src);
      im.onerror = () => resolve(src);
      im.src = src;
    });
  }

  // Zoom-into-the-click transition. Freezes the outgoing frame on the overlay
  // img and animates it over the already-swapped incoming frame so travel feels
  // physically continuous:
  //   deeper  → push into the clicked point (origin = click), incoming settles in
  //   up      → shrink toward center, incoming settles out
  //   lateral → crossfade + a slight slide toward the clicked side
  const OUT_CLASSES = ['zoom-out-deeper', 'zoom-out-up', 'zoom-out-lateral'];
  const IN_CLASSES = ['zoom-in-deeper', 'zoom-in-up'];

  function runTransition(direction, fix) {
    const out = el.imgOld;
    const inc = el.img;

    // clear any prior transition state, then freeze the current frame
    OUT_CLASSES.forEach((c) => out.classList.remove(c));
    IN_CLASSES.forEach((c) => inc.classList.remove(c));
    out.style.removeProperty('--slide');
    out.style.removeProperty('transform-origin');
    out.src = inc.src;

    // reflow so re-added animation classes restart from the first keyframe
    void out.offsetWidth;

    if (direction === 'up') {
      out.classList.add('zoom-out-up');
      inc.classList.add('zoom-in-up');
    } else if (direction === 'deeper') {
      const fx = fix ? fix.x : 0.5;
      const fy = fix ? fix.y : 0.5;
      out.style.transformOrigin = `${fx * 100}% ${fy * 100}%`;
      out.classList.add('zoom-out-deeper');
      inc.classList.add('zoom-in-deeper');
    } else {
      // lateral / root: plain crossfade, nudged toward the clicked side
      const slide = fix && fix.x < 0.5 ? -4 : 4;
      out.style.setProperty('--slide', `${slide}%`);
      out.classList.add('zoom-out-lateral');
    }
  }

  async function showScene(scene, { direction = 'deeper' } = {}) {
    await preload(scene.image);

    // freeze old frame + animate the swap (skipped on the very first scene)
    if (el.img.src) {
      runTransition(direction, state.lastClick);
    }
    el.img.src = scene.image;

    state.scene = scene;
    el.sceneName.textContent = scene.name;

    // depth pips
    el.depthPips.innerHTML = '';
    for (let d = 0; d <= scene.maxDepth; d++) {
      const pip = document.createElement('i');
      if (d <= scene.depth) pip.classList.add('lit');
      el.depthPips.appendChild(pip);
    }
    el.ascend.hidden = !scene.parentId;

    renderHotspots(scene);
    renderNavDots(scene);
    el.scanPins.innerHTML = '';
    clearTimeout(scanTimer);
    closeChat(true);
    closeObjectCard();
    closeSatchel();
    hideLabel();
    el.cursor.classList.remove('hot');

    IslandAudio.setAmbience(scene.ambience);
    IslandAudio.chime();
    veilOff();

    // dead-end rescue: nowhere to go, nothing to touch — nudge the player up
    const noRoutes = !(scene.navPoints && scene.navPoints.length);
    if (noRoutes && !scene.character && !(scene.objects && scene.objects.length) && !scene.interactable) {
      toast('DEAD END — ASCEND TO RETURN.');
    }
  }

  function renderHotspots(scene) {
    el.hotspots.innerHTML = '';
    const stageW = el.stage.clientWidth;
    const stageH = el.stage.clientHeight;

    function spot(kind, hs, title, onClick) {
      if (!hs) return;
      const d = document.createElement('div');
      d.className = `hotspot ${kind}`;
      if (hs.box) {
        // fit an ellipse to the tight bounding box (min 44px so tiny things stay clickable)
        const w = Math.max((hs.box.x1 - hs.box.x0) * stageW, 44);
        const h = Math.max((hs.box.y1 - hs.box.y0) * stageH, 44);
        d.style.width = `${w}px`;
        d.style.height = `${h}px`;
        d.style.left = `${((hs.box.x0 + hs.box.x1) / 2) * 100}%`;
        d.style.top = `${((hs.box.y0 + hs.box.y1) / 2) * 100}%`;
      } else {
        const size = Math.max(hs.radius * 2 * stageW, 56);
        d.style.width = `${size}px`;
        d.style.height = `${size}px`;
        d.style.left = `${hs.x * 100}%`;
        d.style.top = `${hs.y * 100}%`;
      }
      d.title = '';
      d.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      d.addEventListener('mouseenter', () => {
        state.overHotspot = true;
        el.cursor.classList.add('hot');
        hideLabel();
      });
      d.addEventListener('mouseleave', () => {
        state.overHotspot = false;
        el.cursor.classList.remove('hot');
      });
      el.hotspots.appendChild(d);
    }

    if (scene.character) {
      spot('character', scene.character.hotspot, scene.character.name, () => openChat());
    }
    for (const obj of scene.objects || []) {
      spot('object', obj.hotspot, obj.name, () => openObjectCard(obj));
    }
    if (scene.interactable) {
      spot('use', scene.interactable.hotspot, scene.interactable.name, () => useInteractable(scene));
    }
  }

  // decorative dots marking where you can go, right after a scene loads
  function renderNavDots(scene) {
    el.navDots.innerHTML = '';
    for (const np of scene.navPoints || []) {
      const d = document.createElement('div');
      d.className = 'nav-dot';
      d.style.left = `${np.x * 100}%`;
      d.style.top = `${np.y * 100}%`;
      el.navDots.appendChild(d);
      setTimeout(() => d.remove(), 3600);
    }
  }

  // ------------------------------------------------------------------ cursor / nav affordance

  function showLabel(text) {
    el.cursorLabel.textContent = text;
    el.cursorLabel.classList.add('show');
  }

  function hideLabel() {
    el.cursorLabel.classList.remove('show');
  }

  function panelsOpen() {
    return !el.chat.hidden || !el.objCard.hidden || !el.journal.hidden ||
      !el.satchel.hidden || !el.oracle.hidden || !el.ending.hidden;
  }

  function updateHover(nx, ny) {
    const scene = state.scene;
    if (!scene || state.overHotspot || state.busy || panelsOpen()) {
      hideLabel();
      return;
    }

    // top strip: ascend hint
    if (scene.parentId && ny < 0.07) {
      showLabel('▴ ascend');
      el.cursor.classList.add('hot');
      return;
    }

    // bbox-first: if the cursor sits inside one or more navPoint boxes, the
    // smallest-area box wins (so a steeple beats the lake painted behind it).
    // Each navPoint may carry several alias boxes (boxes[0] === the primary
    // box); any of them can claim the cursor.
    let found = null;
    let bestArea = Infinity;
    for (const np of scene.navPoints || []) {
      const boxes = np.boxes || (np.box ? [np.box] : []);
      for (const b of boxes) {
        if (b && nx >= b.x0 && nx <= b.x1 && ny >= b.y0 && ny <= b.y1) {
          const area = (b.x1 - b.x0) * (b.y1 - b.y0);
          if (area < bestArea) {
            bestArea = area;
            found = np;
          }
        }
      }
    }

    // fall back to nearest-center-within-threshold when no box contains the cursor
    if (!found) {
      for (const np of scene.navPoints || []) {
        let dx = nx - np.x;
        const dy = ny - np.y;
        dx *= 1.6; // scale x by stage aspect so distance feels circular
        const dist = Math.sqrt(dx * dx + dy * dy);
        const threshold = Math.max(np.radius * 1.7, 0.09);
        if (dist <= threshold) {
          found = np;
          break;
        }
      }
    }

    if (found) {
      const glyph = found.kind === 'deeper' ? '▾ ' : '▸ ';
      showLabel(glyph + found.name);
      el.cursor.classList.add('hot');
    } else {
      hideLabel();
      el.cursor.classList.remove('hot');
    }
  }

  function trackCursor(e) {
    const rect = el.stage.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    el.cursor.style.left = `${px}px`;
    el.cursor.style.top = `${py}px`;
    el.cursorLabel.style.left = `${px + 14}px`;
    el.cursorLabel.style.top = `${py + 18}px`;
    updateHover(px / rect.width, py / rect.height);
  }

  // ------------------------------------------------------------------ click → travel

  async function handleStageClick(e) {
    if (state.busy || !state.scene) return;
    if (panelsOpen()) return;

    const rect = el.stage.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // remember where the player pointed so the zoom transition can survive
    // the async round-trip and push into that exact point.
    state.lastClick = { x, y };

    // ripple + sound
    el.ripple.style.left = `${x * 100}%`;
    el.ripple.style.top = `${y * 100}%`;
    el.ripple.classList.remove('go');
    void el.ripple.offsetWidth;
    el.ripple.classList.add('go');
    IslandAudio.click();

    state.busy = true;
    hideLabel();
    el.cursor.classList.remove('hot');
    const slowReveal = setTimeout(() => veilOn('deeper', { x, y }), 550);

    try {
      const out = await api('/api/click', {
        nodeId: state.scene.id,
        x,
        y,
      });

      if (out.result === 'blocked') {
        clearTimeout(slowReveal);
        veilOff();
        IslandAudio.denied();
        // prefer the server's blocked flavor line; fall back to terse system copy
        toast(out.message || 'NO ROUTE');
        return;
      }

      clearTimeout(slowReveal);
      veilOn(out.direction, { x, y });
      IslandAudio.whoosh(out.direction === 'up');
      await showScene(out.scene, { direction: out.direction });
    } catch (err) {
      clearTimeout(slowReveal);
      veilOff();
      IslandAudio.denied();
      toast('SIGNAL LOST — TRY AGAIN');
      console.error(err);
    } finally {
      state.busy = false;
    }
  }

  async function ascend() {
    if (state.busy || !state.scene || !state.scene.parentId) return;
    state.lastClick = null; // button ascend has no click point → center origin
    state.busy = true;
    hideLabel();
    el.cursor.classList.remove('hot');
    veilOn('up');
    IslandAudio.whoosh(true);
    try {
      const out = await api('/api/ascend', { nodeId: state.scene.id });
      if (out.result === 'blocked') {
        veilOff();
        IslandAudio.denied();
        toast(out.message || 'The wind refuses, for now.');
        return;
      }
      await showScene(out.scene, { direction: 'up' });
    } catch (err) {
      veilOff();
      toast('The wind refuses, for now.');
      console.error(err);
    } finally {
      state.busy = false;
    }
  }

  // ------------------------------------------------------------------ toast

  let toastTimer = null;
  function toast(text) {
    el.toast.textContent = text;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.toast.hidden = true), 3400);
  }

  // ------------------------------------------------------------------ objects / inventory

  function openObjectCard(obj) {
    state.pendingObject = obj;
    el.objCard.classList.remove('inspect');
    el.objLeave.textContent = 'LEAVE';
    el.objName.textContent = obj.name;
    el.objDesc.textContent = obj.description;
    el.objCard.hidden = false;
    IslandAudio.blip();
  }

  // Read-only object card (no TAKE): satchel inspection + interactable results.
  function showReadOnlyCard(title, text) {
    state.pendingObject = null;
    el.objCard.classList.add('inspect');
    el.objLeave.textContent = 'CLOSE';
    el.objName.textContent = title;
    el.objDesc.textContent = text;
    el.objCard.hidden = false;
    IslandAudio.blip();
  }

  // Inspect an item already in the satchel: same card, read-only (no TAKE).
  function openInventoryItem(item) {
    showReadOnlyCard(item.name, item.description);
  }

  function closeObjectCard() {
    state.pendingObject = null;
    el.objCard.hidden = true;
  }

  async function takeObject() {
    const obj = state.pendingObject;
    if (!obj || !state.scene) return;
    try {
      const out = await api('/api/take', { nodeId: state.scene.id, objectId: obj.id });
      state.inventory = out.inventory || state.inventory;
      state.scene.objects = state.scene.objects.filter((o) => o.id !== obj.id);
      renderHotspots(state.scene);
      renderInventory();
      closeObjectCard();
      IslandAudio.pickup();
      toast(`${obj.name.toUpperCase()} → SATCHEL`);
    } catch (err) {
      toast('It will not come free just now.');
      console.error(err);
    }
  }

  function renderInventory() {
    el.invCount.textContent = String(state.inventory.length);
    el.satchelList.innerHTML = '';

    if (!state.inventory.length) {
      const d = document.createElement('div');
      d.className = 'satchel-empty';
      d.textContent = 'EMPTY — small things worth keeping glint gold, deep in the island.';
      el.satchelList.appendChild(d);
      return;
    }

    state.inventory.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'satchel-item';
      const g = document.createElement('span');
      g.className = 'satchel-glyph';
      g.textContent = OBJECT_GLYPHS[i % OBJECT_GLYPHS.length];
      const name = document.createElement('span');
      name.className = 'satchel-name';
      name.textContent = item.name;
      const desc = document.createElement('span');
      desc.className = 'satchel-desc';
      desc.textContent = item.description;
      row.appendChild(g);
      row.appendChild(name);
      row.appendChild(desc);
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        openInventoryItem(item);
      });
      el.satchelList.appendChild(row);
    });
  }

  function openSatchel() {
    el.satchel.hidden = false;
    IslandAudio.blip();
  }

  function closeSatchel() {
    el.satchel.hidden = true;
  }

  // ------------------------------------------------------------------ interactable / ending

  async function useInteractable(node) {
    if (state.busy || !node) return;
    try {
      const out = await api('/api/interact', { nodeId: node.id });
      if (out.ending) {
        showEnding(out.title, out.text);
      } else {
        showReadOnlyCard(out.title, out.text);
      }
    } catch (err) {
      toast('It does not answer, not yet.');
      console.error(err);
    }
  }

  function showEnding(title, text) {
    el.endingTitle.textContent = title || '';
    el.endingText.textContent = text || '';
    el.ending.hidden = false;
    // let [hidden] release before adding .on so the ~1.2s opacity fade runs
    requestAnimationFrame(() =>
      requestAnimationFrame(() => el.ending.classList.add('on'))
    );
    IslandAudio.chime();
    setTimeout(() => IslandAudio.chime(), 1000);
  }

  function closeEnding() {
    el.ending.classList.remove('on');
    el.ending.hidden = true;
  }

  // ------------------------------------------------------------------ scan (route discovery)

  let scanTimer = null;

  function scan() {
    if (!state.scene || state.busy || panelsOpen()) return;
    const scene = state.scene;
    IslandAudio.blip();
    renderNavDots(scene); // re-play the arrival pulse

    el.scanPins.innerHTML = '';
    for (const np of scene.navPoints || []) {
      const pin = document.createElement('div');
      pin.className = 'scan-pin';
      pin.textContent = (np.kind === 'deeper' ? '▾ ' : '▸ ') + np.name;
      pin.style.left = `${np.x * 100}%`;
      pin.style.top = `${np.y * 100}%`;
      el.scanPins.appendChild(pin);
    }
    if (scene.parentId) {
      const pin = document.createElement('div');
      pin.className = 'scan-pin ascend';
      pin.textContent = '▴ ASCEND';
      pin.style.left = '50%';
      pin.style.top = '4%';
      el.scanPins.appendChild(pin);
    }

    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { el.scanPins.innerHTML = ''; }, 3000);
  }

  // ------------------------------------------------------------------ admin / oracle (debug)

  async function adminSave() {
    try {
      const out = await apiGet('/api/admin/export');
      localStorage.setItem('island.save', JSON.stringify(out.state));
      toast('PROGRESS SAVED (LOCAL)');
    } catch (err) {
      toast('SAVE FAILED');
      console.error(err);
    }
  }

  async function adminReset() {
    if (!confirm('Erase all progress and start over?')) return;
    try {
      await api('/api/admin/reset', {});
    } catch (err) {
      console.error(err);
    }
    localStorage.removeItem('island.save');
    location.reload();
  }

  function addOracleMsg(kind, text) {
    const p = document.createElement('p');
    p.className = `omsg ${kind}`;
    p.textContent = text;
    el.oracleLog.appendChild(p);
    el.oracleLog.scrollTop = el.oracleLog.scrollHeight;
  }

  async function askOracle(message) {
    try {
      const out = await api('/api/admin/oracle', { message });
      addOracleMsg('reply', out.reply || '(no reply)');
    } catch (err) {
      addOracleMsg('reply', 'ORACLE UNREACHABLE');
      console.error(err);
    }
  }

  function openOracle() {
    el.oracle.hidden = false;
    IslandAudio.blip();
    askOracle('Where am I and what should I do next?');
    el.oracleInput.focus();
  }

  function closeOracle() {
    el.oracle.hidden = true;
  }

  function sendOracle(e) {
    e.preventDefault();
    const text = el.oracleInput.value.trim();
    if (!text) return;
    el.oracleInput.value = '';
    addOracleMsg('you', text);
    askOracle(text);
  }

  // ------------------------------------------------------------------ journal

  function renderJournal() {
    el.journalCount.textContent = `${state.journal.length}/${state.cluesTotal}`;
    el.journalList.innerHTML = '';
    for (const entry of state.journal) {
      const d = document.createElement('div');
      d.className = 'journal-entry';
      const h = document.createElement('h4');
      h.textContent = entry.title;
      const p = document.createElement('p');
      p.textContent = entry.text;
      d.appendChild(h);
      d.appendChild(p);
      el.journalList.appendChild(d);
    }
    const unfound = Math.max(state.cluesTotal - state.journal.length, 0);
    for (let i = 0; i < unfound; i++) {
      const d = document.createElement('div');
      d.className = 'journal-entry placeholder';
      d.textContent = '— an unheard fragment —';
      el.journalList.appendChild(d);
    }
  }

  function openJournal() {
    el.journal.hidden = false;
    IslandAudio.blip();
  }

  function closeJournal() {
    el.journal.hidden = true;
  }

  function pulseJournalBtn() {
    el.journalBtn.classList.remove('pulse');
    void el.journalBtn.offsetWidth;
    el.journalBtn.classList.add('pulse');
    setTimeout(() => el.journalBtn.classList.remove('pulse'), 1500);
  }

  function handleNewClue(clue) {
    if (!clue) return;
    state.journal.push(clue);
    renderJournal();
    toast(`A fragment settles into your journal — ${clue.title}`);
    IslandAudio.pickup();
    pulseJournalBtn();
  }

  // ------------------------------------------------------------------ chat

  function addMsg(kind, text, name) {
    const p = document.createElement('p');
    p.className = `msg ${kind}`;
    if (kind === 'them') {
      const b = document.createElement('b');
      b.textContent = `${name} — `;
      p.appendChild(b);
      p.appendChild(document.createTextNode(''));
    } else {
      p.textContent = text;
    }
    el.chatLog.appendChild(p);
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
    return p;
  }

  function typewrite(p, text) {
    return new Promise((resolve) => {
      const node = p.lastChild;
      let i = 0;
      (function tick() {
        node.textContent = text.slice(0, ++i);
        el.chatLog.scrollTop = el.chatLog.scrollHeight;
        if (i % 3 === 0) IslandAudio.blip();
        if (i < text.length) setTimeout(tick, 18 + Math.random() * 22);
        else resolve();
      })();
    });
  }

  async function openChat() {
    const scene = state.scene;
    if (!scene || !scene.character) return;
    el.chat.hidden = false;
    el.chat.classList.remove('ended');
    el.chatName.textContent = scene.character.name;
    el.chatLog.innerHTML = '';
    el.chatInput.value = '';
    state.chat = { characterId: scene.character.id, ended: false };
    try {
      const out = await api('/api/chat/greet', { characterId: scene.character.id });
      const p = addMsg('them', '', out.character);
      await typewrite(p, out.reply);
      if (out.ended) {
        state.chat.ended = true;
        el.chat.classList.add('ended');
        addMsg('sys', 'The conversation has ended. They return to their thoughts.');
      }
      handleNewClue(out.newClue);
      el.chatInput.focus();
    } catch (err) {
      addMsg('sys', 'They regard you in silence.');
      console.error(err);
    }
  }

  async function sendChat(e) {
    e.preventDefault();
    const text = el.chatInput.value.trim();
    if (!text || !state.chat || state.chat.ended) return;
    el.chatInput.value = '';
    addMsg('you', text);
    try {
      const out = await api('/api/chat', {
        characterId: state.chat.characterId,
        message: text,
      });
      const p = addMsg('them', '', out.character);
      await typewrite(p, out.reply);
      if (out.ended) {
        state.chat.ended = true;
        el.chat.classList.add('ended');
        addMsg('sys', 'The conversation has ended. They return to their thoughts.');
      }
      handleNewClue(out.newClue);
    } catch (err) {
      addMsg('sys', 'The wind swallows your words. Try again.');
      console.error(err);
    }
  }

  function closeChat(silent) {
    if (!el.chat.hidden && !silent) IslandAudio.blip();
    el.chat.hidden = true;
    state.chat = null;
  }

  // ------------------------------------------------------------------ boot

  async function begin() {
    IslandAudio.begin();
    el.begin.disabled = true;
    el.begin.textContent = 'ESTABLISHING LINK…';
    try {
      let stateOut = await apiGet('/api/state');

      // auto-restore: fresh server + a local save present → push the save back
      const empty = !(stateOut.inventory && stateOut.inventory.length)
        && !(stateOut.journal && stateOut.journal.length)
        && (!stateOut.visited || stateOut.visited.length <= 1);
      const saved = localStorage.getItem('island.save');
      let restored = false;
      if (empty && saved) {
        try {
          await api('/api/admin/import', { state: JSON.parse(saved) });
          stateOut = await apiGet('/api/state');
          restored = true;
        } catch (err) {
          console.error(err);
        }
      }

      const rootOut = await api('/api/root', {});
      state.inventory = stateOut.inventory || [];
      state.journal = stateOut.journal || [];
      state.cluesTotal = stateOut.cluesTotal || 0;

      el.title.style.transition = 'opacity 1.6s ease';
      el.title.style.opacity = '0';
      el.title.style.pointerEvents = 'none';
      setTimeout(() => (el.title.hidden = true), 1700);
      el.game.hidden = false;
      renderInventory();
      renderJournal();
      if (restored) toast('PROGRESS RESTORED');
      IslandAudio.whoosh(false);
      await showScene(rootOut.scene, { direction: 'root' });
    } catch (err) {
      el.begin.disabled = false;
      el.begin.textContent = 'BEGIN';
      alert(`The island could not be reached: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------ painter picker

  function setupPainter(status) {
    const models = status.imageModels || [];
    if (!models.length) return; // backend offers no choice — leave picker hidden
    el.painterSelect.innerHTML = '';
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      if (m.id === status.imageModel) opt.selected = true;
      el.painterSelect.appendChild(opt);
    }
    el.painterPick.hidden = false;
    if (!status.live) {
      el.painterStatus.textContent = '(mock mode — art is placeholder)';
    }
  }

  async function changePainter() {
    const sel = el.painterSelect;
    const id = sel.value;
    const label = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : id;
    try {
      await api('/api/settings', { imageModel: id });
      let msg = `PAINTER SET — NEW SCENES USE ${label.toUpperCase()}`;
      if (!state.live) msg += ' (MOCK MODE — ART IS PLACEHOLDER)';
      el.painterStatus.textContent = msg;
    } catch (err) {
      el.painterStatus.textContent = 'PAINTER CHANGE FAILED';
      console.error(err);
    }
  }

  fetch('/api/status')
    .then((r) => r.json())
    .then((s) => {
      state.live = !!s.live;
      el.titleMode.textContent = s.live
        ? 'LIVE WORLD GENERATION · OPENROUTER'
        : 'MOCK MODE — SET OPENROUTER_API_KEY IN .ENV FOR LIVE GENERATION';
      setupPainter(s);
    })
    .catch(() => {});

  el.begin.addEventListener('click', begin);
  el.painterSelect.addEventListener('change', changePainter);
  el.stage.addEventListener('click', handleStageClick);
  el.stage.addEventListener('mousemove', trackCursor);
  el.ascend.addEventListener('click', (e) => {
    e.stopPropagation();
    ascend();
  });
  el.scan.addEventListener('click', (e) => {
    e.stopPropagation();
    scan();
  });
  el.objTake.addEventListener('click', (e) => {
    e.stopPropagation();
    takeObject();
  });
  el.objLeave.addEventListener('click', (e) => {
    e.stopPropagation();
    closeObjectCard();
  });
  el.objCard.addEventListener('click', (e) => e.stopPropagation());
  el.chat.addEventListener('click', (e) => e.stopPropagation());
  el.chatForm.addEventListener('submit', sendChat);
  el.chatClose.addEventListener('click', () => closeChat());
  el.journalBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openJournal();
  });
  el.journalClose.addEventListener('click', (e) => {
    e.stopPropagation();
    closeJournal();
  });
  el.journal.addEventListener('click', (e) => e.stopPropagation());

  // satchel
  el.inventoryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openSatchel();
  });
  el.satchelClose.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSatchel();
  });
  el.satchel.addEventListener('click', (e) => e.stopPropagation());

  // ending overlay
  el.endingClose.addEventListener('click', (e) => {
    e.stopPropagation();
    closeEnding();
  });

  // admin / oracle
  el.adminSave.addEventListener('click', (e) => { e.stopPropagation(); adminSave(); });
  el.adminReset.addEventListener('click', (e) => { e.stopPropagation(); adminReset(); });
  el.adminOracle.addEventListener('click', (e) => { e.stopPropagation(); openOracle(); });
  el.oracleForm.addEventListener('submit', sendOracle);
  el.oracleClose.addEventListener('click', (e) => { e.stopPropagation(); closeOracle(); });
  el.oracle.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeObjectCard();
      closeChat();
      closeJournal();
      closeSatchel();
      closeOracle();
      closeEnding();
    } else if ((e.key === 's' || e.key === 'S') && !panelsOpen()) {
      // scan — only when no panel is open and we're not typing in a field
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (el.game.hidden) return;
      scan();
    }
  });
})();
