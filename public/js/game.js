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
    veil: $('veil'),
    veilWord: $('veil-word'),
    veilLines: $('veil-lines'),
    sceneName: $('scene-name'),
    depthPips: $('depth-pips'),
    ascend: $('ascend-btn'),
    toast: $('toast'),
    ripple: $('ripple'),
    cursor: $('cursor-ring'),
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
  };

  const state = {
    scene: null,
    busy: false,
    inventory: JSON.parse(localStorage.getItem('island.inventory') || '[]'),
    chat: null, // { messages: [], ended: false }
    pendingObject: null,
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

  function takenIds() {
    return state.inventory.map((i) => i.id);
  }

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

  // ------------------------------------------------------------------ veil

  let veilTimer = null;

  function addVeilLine(text) {
    const d = document.createElement('div');
    d.textContent = text;
    el.veilLines.appendChild(d);
    while (el.veilLines.children.length > 5) el.veilLines.firstChild.remove();
  }

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

    // depth pips
    el.depthPips.innerHTML = '';
    for (let d = 0; d <= scene.maxDepth; d++) {
      const pip = document.createElement('i');
      if (d <= scene.depth) pip.classList.add('lit');
      el.depthPips.appendChild(pip);
    }
    el.ascend.hidden = !scene.parentId;

    renderHotspots(scene);
    closeChat(true);
    closeObjectCard();

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
      d.addEventListener('mouseenter', () => el.cursor.classList.add('hot'));
      d.addEventListener('mouseleave', () => el.cursor.classList.remove('hot'));
      el.hotspots.appendChild(d);
    }

    if (scene.character) {
      spot('character', scene.character.hotspot, scene.character.name, () => openChat());
    }
    for (const obj of scene.objects || []) {
      spot('object', obj.hotspot, obj.name, () => openObjectCard(obj));
    }
  }

  // ------------------------------------------------------------------ click → travel

  async function handleStageClick(e) {
    if (state.busy || !state.scene) return;
    if (!el.chat.hidden || !el.objCard.hidden) return;

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
    const slowReveal = setTimeout(() => veilOn('deeper', { x, y }), 550);

    try {
      const out = await api('/api/click', {
        sceneId: state.scene.id,
        x,
        y,
        takenObjects: takenIds(),
      });

      if (out.result === 'blocked') {
        clearTimeout(slowReveal);
        veilOff();
        IslandAudio.denied();
        toast(out.target ? `NO ROUTE — ${out.target.toUpperCase()}` : 'NO ROUTE');
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
      toast('SIGNAL LOST — TRY AGAIN');
      console.error(err);
    } finally {
      state.busy = false;
    }
  }

  async function ascend() {
    if (state.busy || !state.scene || !state.scene.parentId) return;
    state.busy = true;
    veilOn('up');
    IslandAudio.whoosh(true);
    try {
      const out = await api(`/api/scene/${state.scene.parentId}`, { takenObjects: takenIds() });
      await showScene(out.scene, { direction: 'up' });
    } catch (err) {
      veilOff();
      toast('ASCENT UNAVAILABLE — TRY AGAIN');
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

  function takeObject() {
    const obj = state.pendingObject;
    if (!obj) return;
    state.inventory.push({
      id: obj.id,
      name: obj.name,
      description: obj.description,
      glyph: OBJECT_GLYPHS[state.inventory.length % OBJECT_GLYPHS.length],
    });
    localStorage.setItem('island.inventory', JSON.stringify(state.inventory));
    state.scene.objects = state.scene.objects.filter((o) => o.id !== obj.id);
    renderHotspots(state.scene);
    renderInventory();
    closeObjectCard();
    IslandAudio.pickup();
    toast(`${obj.name.toUpperCase()} → SATCHEL`);
  }

  function renderInventory() {
    el.invItems.innerHTML = '';
    for (const item of state.inventory) {
      const d = document.createElement('div');
      d.className = 'inv-item';
      d.dataset.name = `${item.name} — ${item.description}`;
      d.textContent = item.glyph;
      el.invItems.appendChild(d);
    }
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
    state.chat = { messages: [], ended: false };
    try {
      const out = await api('/api/chat/greet', { sceneId: scene.id });
      state.chat.messages.push({ role: 'assistant', content: out.reply });
      const p = addMsg('them', '', out.character);
      await typewrite(p, out.reply);
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
    state.chat.messages.push({ role: 'user', content: text });
    try {
      const out = await api('/api/chat', {
        sceneId: state.scene.id,
        messages: state.chat.messages,
      });
      state.chat.messages.push({ role: 'assistant', content: out.reply });
      const p = addMsg('them', '', out.character);
      await typewrite(p, out.reply);
      if (out.ended) {
        state.chat.ended = true;
        el.chat.classList.add('ended');
        addMsg('sys', 'CHANNEL CLOSED — they return to their thoughts.');
      }
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

  // ------------------------------------------------------------------ cursor

  function trackCursor(e) {
    const rect = el.stage.getBoundingClientRect();
    el.cursor.style.left = `${e.clientX - rect.left}px`;
    el.cursor.style.top = `${e.clientY - rect.top}px`;
  }

  // ------------------------------------------------------------------ boot

  async function begin() {
    IslandAudio.begin();
    el.begin.disabled = true;
    el.begin.textContent = 'ESTABLISHING LINK…';
    try {
      const out = await api('/api/root', { takenObjects: takenIds() });
      el.title.style.transition = 'opacity 1.6s ease';
      el.title.style.opacity = '0';
      el.title.style.pointerEvents = 'none';
      setTimeout(() => (el.title.hidden = true), 1700);
      el.game.hidden = false;
      renderInventory();
      IslandAudio.whoosh(false);
      await showScene(out.scene, { direction: 'root' });
    } catch (err) {
      el.begin.disabled = false;
      el.begin.textContent = 'BEGIN';
      alert(`The island could not be reached: ${err.message}`);
    }
  }

  fetch('/api/status')
    .then((r) => r.json())
    .then((s) => {
      el.titleMode.textContent = s.live
        ? 'LIVE WORLD GENERATION · OPENROUTER'
        : 'MOCK MODE — SET OPENROUTER_API_KEY IN .ENV FOR LIVE GENERATION';
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeObjectCard();
      closeChat();
    }
  });
})();
