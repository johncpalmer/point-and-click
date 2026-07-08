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
    begin: $('begin-btn'),
    game: $('game'),
    stage: $('stage'),
    img: $('scene-img'),
    imgOld: $('scene-img-old'),
    hotspots: $('hotspots'),
    navDots: $('nav-dots'),
    veil: $('veil'),
    veilText: $('veil-text'),
    sceneName: $('scene-name'),
    sceneDesc: $('scene-desc'),
    depthPips: $('depth-pips'),
    ascend: $('ascend-btn'),
    toast: $('toast'),
    ripple: $('ripple'),
    cursor: $('cursor-ring'),
    cursorLabel: $('cursor-label'),
    invItems: $('inv-items'),
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
  };

  const OBJECT_GLYPHS = ['🗝', '🔮', '🐚', '🪶', '🧭', '📜', '🫙', '🪨', '🔔', '🕯'];

  const VEIL_TEXTS = {
    deeper: ['Drawing closer…', 'The mist parts…', 'Following the path down…', 'The island admits you…'],
    lateral: ['Walking on…', 'Following the shoreline of this place…', 'Crossing over…'],
    up: ['Pulling back…', 'The world widens…', 'Rising on the wind…'],
    root: ['The sea remembers an island…', 'Far below, something waits…'],
  };

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

  function veilOn(direction) {
    const texts = VEIL_TEXTS[direction] || VEIL_TEXTS.deeper;
    let i = Math.floor(Math.random() * texts.length);
    el.veilText.textContent = texts[i];
    el.veil.classList.add('on');
    veilTimer = setInterval(() => {
      i = (i + 1) % texts.length;
      el.veilText.textContent = texts[i];
    }, 2600);
  }

  function veilOff() {
    clearInterval(veilTimer);
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

  async function showScene(scene, { direction = 'deeper' } = {}) {
    await preload(scene.image);

    // crossfade: freeze old frame on the overlay img, swap main, fade overlay out
    if (el.img.src) {
      el.imgOld.src = el.img.src;
      el.imgOld.classList.add('showing');
      requestAnimationFrame(() =>
        requestAnimationFrame(() => el.imgOld.classList.remove('showing'))
      );
    }
    el.img.src = scene.image;

    state.scene = scene;
    el.sceneName.textContent = scene.name;
    el.sceneDesc.textContent = scene.desc;
    el.sceneDesc.classList.remove('showing');
    setTimeout(() => el.sceneDesc.classList.add('showing'), 250);
    setTimeout(() => el.sceneDesc.classList.remove('showing'), 9000);

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
    closeChat(true);
    closeObjectCard();
    hideLabel();
    el.cursor.classList.remove('hot');

    IslandAudio.setAmbience(scene.ambience);
    IslandAudio.chime();
    veilOff();
  }

  function renderHotspots(scene) {
    el.hotspots.innerHTML = '';
    const stageW = el.stage.clientWidth;

    function spot(kind, hs, title, onClick) {
      if (!hs) return;
      const d = document.createElement('div');
      d.className = `hotspot ${kind}`;
      const size = Math.max(hs.radius * 2 * stageW, 56);
      d.style.width = `${size}px`;
      d.style.height = `${size}px`;
      d.style.left = `${hs.x * 100}%`;
      d.style.top = `${hs.y * 100}%`;
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
    return !el.chat.hidden || !el.objCard.hidden || !el.journal.hidden;
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

    let found = null;
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
    const slowReveal = setTimeout(() => veilOn('deeper'), 550);

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
        toast(out.message || 'Nothing draws you there.');
        return;
      }

      clearTimeout(slowReveal);
      veilOn(out.direction);
      IslandAudio.whoosh(out.direction === 'up');
      await showScene(out.scene, { direction: out.direction });
    } catch (err) {
      clearTimeout(slowReveal);
      veilOff();
      IslandAudio.denied();
      toast('The way blurs for a moment. Try again.');
      console.error(err);
    } finally {
      state.busy = false;
    }
  }

  async function ascend() {
    if (state.busy || !state.scene || !state.scene.parentId) return;
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
    el.objName.textContent = obj.name;
    el.objDesc.textContent = obj.description;
    el.objCard.hidden = false;
    IslandAudio.blip();
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
      toast(`The ${obj.name} settles into your satchel.`);
    } catch (err) {
      toast('It will not come free just now.');
      console.error(err);
    }
  }

  function renderInventory() {
    el.invItems.innerHTML = '';
    state.inventory.forEach((item, i) => {
      const d = document.createElement('div');
      d.className = 'inv-item';
      d.dataset.name = `${item.name} — ${item.description}`;
      d.textContent = OBJECT_GLYPHS[i % OBJECT_GLYPHS.length];
      el.invItems.appendChild(d);
    });
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
    el.begin.textContent = 'the sea rises…';
    try {
      const [rootOut, stateOut] = await Promise.all([
        api('/api/root', {}),
        apiGet('/api/state'),
      ]);
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
      IslandAudio.whoosh(false);
      await showScene(rootOut.scene, { direction: 'root' });
    } catch (err) {
      el.begin.disabled = false;
      el.begin.textContent = 'Begin';
      alert(`The island could not be reached: ${err.message}`);
    }
  }

  fetch('/api/status')
    .then((r) => r.json())
    .then((s) => {
      el.titleMode.textContent = s.live
        ? 'live world generation · openrouter'
        : 'mock mode — set OPENROUTER_API_KEY in .env for live AI generation';
    })
    .catch(() => {});

  el.begin.addEventListener('click', begin);
  el.stage.addEventListener('click', handleStageClick);
  el.stage.addEventListener('mousemove', trackCursor);
  el.ascend.addEventListener('click', (e) => {
    e.stopPropagation();
    ascend();
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeObjectCard();
      closeChat();
      closeJournal();
    }
  });
})();
