// ---------------------------------------------------------------------------
// ISLAND — procedural audio engine.
// Everything is synthesized live in Web Audio: ambient beds per scene type
// (surf, wind, forest, interior, cavern, water, hum), UI sounds, transitions,
// and dialogue blips. No audio files.
// ---------------------------------------------------------------------------

const IslandAudio = (() => {
  let ctx = null;
  let master = null;
  let ambienceBus = null;
  let current = null; // { stop() }

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    ambienceBus = ctx.createGain();
    ambienceBus.gain.value = 0.55;
    ambienceBus.connect(master);
  }

  function noiseBuffer(seconds = 2) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function noiseSource() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    return src;
  }

  // slow random LFO wandering between lo..hi
  function wander(param, lo, hi, rate = 0.1) {
    let alive = true;
    (function step() {
      if (!alive) return;
      const t = ctx.currentTime;
      param.linearRampToValueAtTime(lo + Math.random() * (hi - lo), t + 1 / rate);
      setTimeout(step, (1000 / rate) * (0.7 + Math.random() * 0.6));
    })();
    return () => { alive = false; };
  }

  // ---------------- ambient beds ----------------

  function bedSurf(out) {
    const stops = [];
    const n = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    n.connect(f).connect(g).connect(out);
    n.start();
    stops.push(wander(f.frequency, 220, 900, 0.12)); // wave swell
    stops.push(wander(g.gain, 0.25, 0.75, 0.12));
    return () => { stops.forEach((s) => s()); n.stop(); };
  }

  function bedWind(out) {
    const stops = [];
    const n = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500;
    f.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    n.connect(f).connect(g).connect(out);
    n.start();
    stops.push(wander(f.frequency, 300, 1400, 0.2));
    stops.push(wander(g.gain, 0.15, 0.5, 0.15));
    return () => { stops.forEach((s) => s()); n.stop(); };
  }

  function bedForest(out) {
    const stopWind = bedWind(out);
    // sparse birdsong chirps
    let alive = true;
    (function chirp() {
      if (!alive) return;
      const t = ctx.currentTime + 0.05;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const base = 2100 + Math.random() * 1600;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (1.15 + Math.random() * 0.35), t + 0.09);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.18);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.25);
      setTimeout(chirp, 1500 + Math.random() * 6000);
    })();
    return () => { alive = false; stopWind(); };
  }

  function bedHum(out) {
    // the island's mysterious resonance: detuned low sines + slow shimmer
    const stops = [];
    const oscs = [55, 55.7, 110.3, 164.8].map((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = i < 2 ? 0.09 : 0.035;
      o.connect(g).connect(out);
      o.start();
      stops.push(wander(g.gain, 0.015, i < 2 ? 0.11 : 0.05, 0.08));
      return o;
    });
    return () => { stops.forEach((s) => s()); oscs.forEach((o) => o.stop()); };
  }

  function bedCavern(out) {
    const stops = [];
    const n = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    n.connect(f).connect(g).connect(out);
    n.start();
    // echoing drips
    let alive = true;
    (function drip() {
      if (!alive) return;
      const t = ctx.currentTime + 0.05;
      const o = ctx.createOscillator();
      const dg = ctx.createGain();
      const dl = ctx.createDelay();
      dl.delayTime.value = 0.28;
      const fb = ctx.createGain();
      fb.gain.value = 0.4;
      o.frequency.setValueAtTime(900 + Math.random() * 700, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.12);
      dg.gain.setValueAtTime(0.12, t);
      dg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(dg);
      dg.connect(out);
      dg.connect(dl);
      dl.connect(fb).connect(dl);
      dl.connect(out);
      o.start(t);
      o.stop(t + 0.2);
      setTimeout(() => { dl.disconnect(); fb.disconnect(); }, 3000);
      setTimeout(drip, 2500 + Math.random() * 7000);
    })();
    return () => { alive = false; stops.forEach((s) => s()); n.stop(); };
  }

  function bedWater(out) {
    const stops = [];
    const n = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 800;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    n.connect(f).connect(g).connect(out);
    n.start();
    stops.push(wander(f.frequency, 500, 1600, 0.35)); // lapping
    stops.push(wander(g.gain, 0.1, 0.3, 0.3));
    const stopHum = bedHum(out);
    return () => { stops.forEach((s) => s()); n.stop(); stopHum(); };
  }

  function bedInterior(out) {
    // near-silence with room tone + occasional creak
    const n = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 120;
    const g = ctx.createGain();
    g.gain.value = 0.16;
    n.connect(f).connect(g).connect(out);
    n.start();
    let alive = true;
    (function creak() {
      if (!alive) return;
      const t = ctx.currentTime + 0.05;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const cg = ctx.createGain();
      const cf = ctx.createBiquadFilter();
      cf.type = 'lowpass';
      cf.frequency.value = 300;
      o.frequency.setValueAtTime(60 + Math.random() * 50, t);
      o.frequency.linearRampToValueAtTime(45 + Math.random() * 40, t + 0.5);
      cg.gain.setValueAtTime(0, t);
      cg.gain.linearRampToValueAtTime(0.025, t + 0.15);
      cg.gain.linearRampToValueAtTime(0, t + 0.6);
      o.connect(cf).connect(cg).connect(out);
      o.start(t);
      o.stop(t + 0.7);
      setTimeout(creak, 6000 + Math.random() * 12000);
    })();
    return () => { alive = false; n.stop(); };
  }

  const BEDS = {
    surf: (out) => { const a = bedSurf(out); const b = bedWind(out); return () => { a(); b(); }; },
    wind: bedWind,
    forest: bedForest,
    interior: bedInterior,
    cavern: bedCavern,
    water: bedWater,
    hum: (out) => { const a = bedHum(out); const b = bedWind(out); return () => { a(); b(); }; },
  };

  function setAmbience(kind) {
    ensure();
    if (current && current.kind === kind) return;
    const old = current;
    // crossfade: new bed on a fresh gain ramped up, old ramped down then stopped
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
    g.connect(ambienceBus);
    const stop = (BEDS[kind] || BEDS.wind)(g);
    current = { kind, stop: () => { stop(); g.disconnect(); }, gain: g };
    if (old) {
      old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.2);
      setTimeout(() => old.stop(), 2500);
    }
  }

  // ---------------- one-shot sounds ----------------

  function click() {
    ensure();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(990, t + 0.06);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.2);
  }

  function whoosh(descending = false) {
    ensure();
    const t = ctx.currentTime;
    const n = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    const g = ctx.createGain();
    f.frequency.setValueAtTime(descending ? 1800 : 200, t);
    f.frequency.exponentialRampToValueAtTime(descending ? 200 : 1800, t + 1.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.35);
    g.gain.linearRampToValueAtTime(0, t + 1.6);
    n.connect(f).connect(g).connect(master);
    n.start(t);
    n.stop(t + 1.7);
    // low chime underneath
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(descending ? 392 : 262, t);
    og.gain.setValueAtTime(0.001, t);
    og.gain.exponentialRampToValueAtTime(0.08, t + 0.4);
    og.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    o.connect(og).connect(master);
    o.start(t);
    o.stop(t + 1.7);
  }

  function chime() {
    // scene-arrival: soft bell arpeggio in a pentatonic cluster
    ensure();
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      const at = t + i * 0.14;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.06, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, at + 1.4);
      o.connect(g).connect(master);
      o.start(at);
      o.stop(at + 1.5);
    });
  }

  function pickup() {
    ensure();
    const t = ctx.currentTime;
    [660, 880, 1320].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      const at = t + i * 0.07;
      g.gain.setValueAtTime(0.09, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
      o.connect(g).connect(master);
      o.start(at);
      o.stop(at + 0.45);
    });
  }

  function blip() {
    // dialogue typing blip
    ensure();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 480 + Math.random() * 240;
    g.gain.setValueAtTime(0.035, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.08);
  }

  function denied() {
    ensure();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(240, t);
    o.frequency.linearRampToValueAtTime(180, t + 0.25);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.35);
  }

  function begin() {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
  }

  return { begin, setAmbience, click, whoosh, chime, pickup, blip, denied };
})();
