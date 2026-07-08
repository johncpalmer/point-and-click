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
    ambienceBus.gain.value = 0.4; // leave headroom for the theme underneath
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
    musicDuck();
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

  // ---------------- generative theme music ----------------
  // A quiet "Life Sim"-flavoured bed of music that lives UNDER the ambience:
  // glassy detuned-saw pad, FM bell arps through a ping-pong delay, a round
  // sub, and occasional sparkles. 76 BPM, key of A major, an 8-bar loop of
  // four 2-bar chords: Amaj9 -> F#m11 -> Dmaj9 -> Esus4(add9).

  const M_TEMPO = 76;
  const M_BEAT = 60 / M_TEMPO;       // 0.78947 s
  const M_8TH = M_BEAT / 2;          // 0.39474 s (scheduler grid)
  const M_BAR = M_BEAT * 4;          // 3.15789 s
  const M_CHORD = M_BAR * 2;         // 6.31579 s (2 bars per chord)
  const M_LOOP_STEPS = 64;           // 8 bars * 8 eighth-notes
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // MIDI note numbers. pad = sustained voices, sub = round bass root,
  // arp = pentatonic-safe pool the pluck draws from.
  const PROG = [
    { // Amaj9 :  A3 E4 G#4 B4  /  A2  /  A4 C#5 E5 F#5 A5
      pad: [57, 64, 68, 71], sub: 45, arp: [69, 73, 76, 78, 81] },
    { // F#m11 : F#3 C#4 E4 A4  /  F#2 /  F#4 A4 B4 C#5 E5
      pad: [54, 61, 64, 69], sub: 42, arp: [66, 69, 71, 73, 76] },
    { // Dmaj9 :  D3 A3 C#4 F#4 /  D2  /  D5 E5 F#5 A5 C#6
      pad: [50, 57, 61, 66], sub: 38, arp: [74, 76, 78, 81, 85] },
    { // Esus4(add9) : E3 A3 B3 F#4 / E2 / E5 F#5 A5 B5 C#6
      pad: [52, 57, 59, 66], sub: 40, arp: [76, 78, 81, 83, 85] },
  ];

  let musicRunning = false;
  let musicBus = null, duckGain = null;
  let padFilter = null, padGain = null, subGain = null;
  let arpGain = null, arpSend = null, wetGain = null;
  let delayL = null, delayR = null, mLfo = null;
  let schedulerTimer = null, sparkleAlive = false;
  let nextStepTime = 0, mStep = 0;
  let restProb = 0.35, currentChord = PROG[0];

  // glassy sustained pad: two slightly detuned saws per chord tone.
  function padChord(chord, t) {
    const dur = M_CHORD;
    chord.pad.forEach((m) => {
      const f = mtof(m);
      [-7, 7].forEach((cents) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cents;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.06, t + 2.2);    // long attack
        g.gain.setValueAtTime(0.06, t + dur - 0.3);        // hold
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.8); // long release, overlaps next chord
        o.connect(g).connect(padFilter);
        o.start(t);
        o.stop(t + dur + 2);
      });
    });
  }

  // soft round sub sine on the chord root.
  function subNote(chord, t) {
    const dur = M_CHORD;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = mtof(chord.sub);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.25, t + 1.4);
    g.gain.setValueAtTime(0.25, t + dur - 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
    o.connect(g).connect(subGain);
    o.start(t);
    o.stop(t + dur + 1);
  }

  // FM-ish bell pluck: sine carrier, sine modulator with fast-decaying index.
  function pluck(freq, t, vel, decay) {
    decay = decay || 0.45;
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * 2;               // bell-ish 2:1 ratio
    const modDepth = ctx.createGain();
    modDepth.gain.setValueAtTime(freq * 2.5, t);  // bright transient
    modDepth.gain.exponentialRampToValueAtTime(freq * 0.05, t + decay);
    mod.connect(modDepth).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    car.connect(g);
    g.connect(arpGain);   // dry
    g.connect(arpSend);   // into ping-pong delay
    car.start(t); mod.start(t);
    car.stop(t + decay + 0.05);
    mod.stop(t + decay + 0.05);
  }

  // adjust density + pad brightness to match the room. Applied on bar lines,
  // eased in (setTargetAtTime) so it is never an abrupt jump.
  function applyVariation(t) {
    const kind = current && current.kind;
    let base = 1200, rest = 0.35;
    if (kind === 'cavern' || kind === 'interior') { base = 780; rest = 0.55; } // sparser, darker
    else if (kind === 'hum') { base = 1000; rest = 0.62; }                     // half-density, pad+sub carry
    restProb = rest;
    if (padFilter) {
      padFilter.frequency.cancelScheduledValues(t);
      padFilter.frequency.setTargetAtTime(base, t, 2.5); // intrinsic base; LFO adds on top
    }
  }

  function scheduleStep(s, t) {
    currentChord = PROG[Math.floor(s / 16)];
    if (s % 8 === 0) applyVariation(t);                       // bar boundary
    if (s % 16 === 0) { padChord(currentChord, t); subNote(currentChord, t); } // chord boundary
    if (Math.random() > restProb) {                          // ~35%+ rests -> it breathes
      let m = currentChord.arp[Math.floor(Math.random() * currentChord.arp.length)];
      if (Math.random() < 0.14) m += 12;                     // occasional octave jump
      pluck(mtof(m), t, 0.1 + Math.random() * 0.05);
    }
  }

  // lookahead scheduler (same setTimeout + AudioContext.currentTime pattern
  // the beds use). nextStepTime advances by a fixed increment so it never drifts.
  function scheduler() {
    while (nextStepTime < ctx.currentTime + 0.12) {
      scheduleStep(mStep, nextStepTime);
      nextStepTime += M_8TH;
      mStep = (mStep + 1) % M_LOOP_STEPS;
    }
    schedulerTimer = setTimeout(scheduler, 25);
  }

  function startSparkle() {
    sparkleAlive = true;
    (function spark() {
      if (!sparkleAlive) return;
      const chord = currentChord || PROG[0];
      const m = chord.arp[Math.floor(Math.random() * chord.arp.length)] + 24; // 2 octaves up
      pluck(mtof(m), ctx.currentTime + 0.05, 0.04 + Math.random() * 0.02, 1.6); // long tail via delay
      setTimeout(spark, 4000 + Math.random() * 6000); // every 4-10s
    })();
  }

  function musicStart() {
    ensure();
    if (musicRunning) return; // idempotent
    musicRunning = true;
    const now = ctx.currentTime;

    // bus: musicBus (quiet) -> duckGain -> master. duckGain is separate so
    // dialogue ducking never fights the stop fade on musicBus.
    duckGain = ctx.createGain();
    duckGain.gain.value = 1;
    duckGain.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.3; // present under the beds — the plucks must read through the noise
    musicBus.connect(duckGain);

    // pad chain + slow filter sweep
    padGain = ctx.createGain();
    padGain.gain.value = 0.5;
    padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1200;
    padFilter.Q.value = 0.7;
    padFilter.connect(padGain).connect(musicBus);
    mLfo = ctx.createOscillator();
    mLfo.type = 'sine';
    mLfo.frequency.value = 1 / 30; // one sweep per ~30s
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 400;      // +/-400 Hz around the base cutoff
    mLfo.connect(lfoGain).connect(padFilter.frequency);
    mLfo.start(now);

    // sub
    subGain = ctx.createGain();
    subGain.gain.value = 0.6;
    subGain.connect(musicBus);

    // arp dry + ping-pong feedback delay (0.375s, fb 0.35, low wet)
    arpGain = ctx.createGain();
    arpGain.gain.value = 0.5;
    arpGain.connect(musicBus);
    delayL = ctx.createDelay(1);
    delayR = ctx.createDelay(1);
    delayL.delayTime.value = 0.375;
    delayR.delayTime.value = 0.375;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();
    panL.pan.value = -0.5;
    panR.pan.value = 0.5;
    wetGain = ctx.createGain();
    wetGain.gain.value = 0.25;
    delayL.connect(panL).connect(wetGain);
    delayL.connect(delayR);
    delayR.connect(panR).connect(wetGain);
    delayR.connect(fb).connect(delayL);
    wetGain.connect(musicBus);
    arpSend = ctx.createGain();
    arpSend.gain.value = 1;
    arpSend.connect(delayL);

    restProb = 0.35;
    currentChord = PROG[0];
    mStep = 0;
    nextStepTime = now + 0.15;
    scheduler();
    startSparkle();
  }

  function musicStop() {
    if (!musicRunning) return;
    musicRunning = false;
    sparkleAlive = false;
    if (schedulerTimer) { clearTimeout(schedulerTimer); schedulerTimer = null; }
    const t = ctx.currentTime;
    if (musicBus) {
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(musicBus.gain.value, t);
      musicBus.gain.linearRampToValueAtTime(0, t + 1); // fade out over 1s
    }
    const toKill = [musicBus, duckGain, padFilter, padGain, subGain, arpGain, wetGain, delayL, delayR, arpSend];
    const lfoRef = mLfo;
    setTimeout(() => {
      try { if (lfoRef) lfoRef.stop(); } catch (e) { /* already stopped */ }
      toKill.forEach((n) => { try { if (n) n.disconnect(); } catch (e) { /* ignore */ } });
    }, 1500); // after the fade + delay tails
    musicBus = duckGain = padFilter = padGain = subGain = arpGain = wetGain = delayL = delayR = arpSend = mLfo = null;
  }

  // gentle -30% dip while dialogue blips fire; recovers quickly.
  function musicDuck() {
    if (!musicRunning || !duckGain) return;
    const t = ctx.currentTime;
    duckGain.gain.cancelScheduledValues(t);
    duckGain.gain.setValueAtTime(duckGain.gain.value, t);
    duckGain.gain.linearRampToValueAtTime(0.7, t + 0.05);
    duckGain.gain.linearRampToValueAtTime(1.0, t + 0.4);
  }

  function begin() {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
    musicStart();
  }

  return { begin, setAmbience, click, whoosh, chime, pickup, blip, denied, musicStart, musicStop };
})();
