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

  // ---------------- authored region songs ----------------
  // Seven deterministic, looping songs in the AG Cook "Life Sim" idiom
  // (sincere stepwise hooks, one leap per phrase, phrase-ends on chord tones).
  // One per island region + the title/overworld, each in a DIFFERENT key and
  // tempo so the player recognises a region on return. Production: a bright,
  // soft-clipped square+saw lead with portamento glides + vibrato; pads & sub
  // duck on every beat (sidechain pump); DX plucks for arps through a ping-pong
  // delay; a clean 0.3 music bus into master. Note data is fixed — nothing is
  // randomised. See musicStart / musicStop / setRegion / getLevels.

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // 16th-note grid. Every authored lead duration is a multiple of 0.5 beat, so
  // all events land exactly on this grid (0.25 beat).
  const STEPS_PER_BEAT = 4;
  const STEPS_PER_BAR = 16;

  // Song form. Every song: 8 bars, 2 bars per chord (4 chord slots). `lead`
  // durations are in beats and MUST sum to bars*4. `arp.div` = subdivisions per
  // bar (8 or 16); `arp.seq` indexes into `arpTones[slot]` (-1 = rest).
  const SONGS = {
    // island — title / overworld. A major, 104 BPM. Arrival, open sky.
    island: {
      bpm: 104, bars: 8, barsPerChord: 2,
      chords: [[57, 61, 64, 69], [56, 59, 64, 68], [54, 57, 61, 64], [50, 54, 57, 62]], // A  E/G#  F#m7  D
      sub: [45, 44, 42, 38],                          // A2 G#2 F#2 D2
      arpTones: [[69, 73, 76, 81], [68, 71, 76, 80], [66, 69, 73, 76], [62, 66, 69, 74]],
      arp: { div: 8, seq: [0, 1, 2, 3, 0, 1, 2, 3] }, // 8ths, chord tones low->high
      lead: [
        [76, 1.5], [73, 0.5], [71, 1], [69, 1],       // E5 C#5 B4 A4
        [71, 1], [73, 1], [76, 2],                    // B4 C#5 E5
        [78, 1.5], [76, 0.5], [73, 1], [71, 1],       // F#5 E5 C#5 B4
        [69, 1], [71, 1], [73, 2],                    // A4 B4 C#5
        [73, 1.5], [69, 0.5], [68, 1], [66, 1],       // C#5 A4 G#4 F#4  (phrase a 3rd down)
        [68, 1], [69, 1], [73, 2],                    // G#4 A4 C#5
        [76, 1.5], [74, 0.5], [71, 1], [69, 1],       // E5 D5 B4 A4
        [66, 1], [68, 1], [69, 2],                    // F#4 G#4 A4
      ],
    },
    // harbor — D mixolydian (C naturals in the arp), 92 BPM. Salt, patience, rocking.
    harbor: {
      bpm: 92, bars: 8, barsPerChord: 2, swing: 0.08,
      chords: [[50, 54, 57, 62], [48, 52, 55, 60], [47, 50, 55, 59], [50, 54, 57, 62]], // D  C  G/B  D
      sub: [38, 36, 35, 38],                          // D2 C2 B1 D2
      arpTones: [[62, 66, 69, 72], [60, 64, 67, 72], [59, 62, 67, 71], [62, 66, 69, 72]], // C-naturals = mixolydian color
      arp: { div: 8, seq: [0, 1, 2, 3, 2, 1, 2, 3] }, // swaying
      lead: [
        [69, 2], [67, 1], [66, 1],                    // A4 G4 F#4
        [67, 1.5], [64, 0.5], [62, 2],                // G4 E4 D4
        [null, 1], [66, 1], [67, 1], [69, 1],         // rest F#4 G4 A4
        [72, 1.5], [71, 0.5], [69, 2],                // C5 B4 A4
        [69, 2], [67, 1], [66, 1],
        [67, 1.5], [64, 0.5], [62, 2],
        [null, 1], [66, 1], [67, 1], [69, 1],
        [72, 1.5], [74, 0.5], [76, 2],                // C5 D5 E5  (ending varies upward)
      ],
    },
    // ringwood — F# minor pentatonic, 84 BPM. Music-box: sparse high DX plucks,
    // lots of delay, long rests. No square lead (timbral identity).
    ringwood: {
      bpm: 84, bars: 8, barsPerChord: 2, leadType: 'pluck',
      chords: [[54, 57, 61, 66], [50, 54, 57, 62], [57, 61, 64, 69], [49, 52, 56, 61]], // F#m  D  A  C#m
      sub: [42, 38, 45, 37],                          // F#2 D2 A2 C#2
      arpTones: [[66, 69, 73, 78], [62, 66, 69, 74], [64, 69, 73, 76], [61, 64, 68, 73]],
      arp: { div: 8, seq: [0, -1, 2, -1, 1, -1, 3, -1] }, // sparse
      lead: [
        [78, 1], [null, 1], [81, 1], [null, 1],       // F#5 . A5 .
        [85, 2], [null, 2],                           // C#6 .
        [83, 1], [81, 1], [78, 1], [null, 1],         // B5 A5 F#5 .
        [76, 2], [null, 2],                           // E5 .
        [81, 1], [null, 1], [85, 1], [null, 1],       // A5 . C#6 .
        [88, 2], [85, 1], [81, 1],                    // E6 C#6 A5
        [83, 1], [81, 1], [78, 1], [76, 1],           // B5 A5 F#5 E5
        [78, 2], [null, 2],                           // F#5 .
      ],
    },
    // lake — A maj9 / D maj9, 72 BPM half-time. Dreamy: long 2-3 beat notes so
    // the portamento glides are very audible; sub prominent.
    lake: {
      bpm: 72, bars: 8, barsPerChord: 2,
      chords: [[57, 64, 68, 71], [50, 57, 61, 64], [57, 64, 68, 71], [50, 57, 61, 64]], // Amaj9  Dmaj9
      sub: [45, 38, 45, 38],                          // A2 D2 (prominent)
      arpTones: [[64, 68, 71, 73], [57, 61, 64, 66], [64, 68, 71, 73], [57, 61, 64, 66]],
      arp: { div: 8, seq: [0, -1, 1, -1, 2, -1, 3, -1] },
      lead: [
        [76, 3], [73, 1],                             // E5 (long) C#5
        [74, 2], [71, 2],                             // D5 B4
        [69, 3], [73, 1],                             // A4 (long) C#5
        [76, 4],                                      // E5 (held)
        [78, 2], [76, 2],                             // F#5 E5
        [73, 3], [74, 1],                             // C#5 (long) D5
        [69, 2], [71, 2],                             // A4 B4
        [73, 4],                                      // C#5 (held, chord tone)
      ],
    },
    // peaks — E major, 116 BPM, brightest & fastest. Lead doubled an octave up
    // at low gain; wind-swept upward phrases.
    peaks: {
      bpm: 116, bars: 8, barsPerChord: 2, leadOctaveDouble: true,
      chords: [[52, 56, 59, 64], [47, 51, 54, 59], [49, 52, 56, 61], [45, 49, 52, 57]], // E  B  C#m  A
      sub: [40, 35, 37, 33],                          // E2 B1 C#2 A1
      arpTones: [[64, 68, 71, 76], [59, 63, 66, 71], [61, 64, 68, 73], [57, 61, 64, 69]],
      arp: { div: 16, seq: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3] },
      lead: [
        [64, 1], [66, 1], [68, 1], [71, 1],           // E4 F#4 G#4 B4  (rising)
        [73, 2], [71, 2],                             // C#5 B4
        [68, 1], [71, 1], [73, 1], [76, 1],           // G#4 B4 C#5 E5
        [78, 2], [76, 2],                             // F#5 E5
        [71, 1], [73, 1], [76, 1], [78, 1],           // B4 C#5 E5 F#5
        [80, 2], [78, 2],                             // G#5 F#5
        [76, 1], [78, 1], [80, 1], [83, 1],           // E5 F#5 G#5 B5  (sweep up)
        [88, 2], [76, 2],                             // E6 (peak) E5
      ],
    },
    // chancel — C# minor, 80 BPM. Pad-forward glass choir (stacked detuned
    // triangles); lead sparse & bell-like; a low toll on bar 1 of the loop.
    chancel: {
      bpm: 80, bars: 8, barsPerChord: 2, padType: 'triangle', toll: true,
      chords: [[49, 56, 61, 64], [45, 52, 57, 61], [52, 59, 64, 68], [47, 54, 59, 63]], // C#m  A  E  B
      sub: [37, 33, 40, 35],                          // C#2 A1 E2 B1
      arpTones: [[61, 64, 68, 73], [57, 61, 64, 69], [64, 68, 71, 76], [59, 63, 66, 71]],
      arp: { div: 8, seq: [0, -1, -1, 1, -1, 2, -1, -1] }, // sparse bell
      lead: [
        [73, 2], [null, 2],                           // C#5 .
        [76, 1], [71, 1], [null, 2],                  // E5 B4 .
        [80, 2], [76, 1], [73, 1],                    // G#5 E5 C#5
        [71, 2], [null, 2],                           // B4 .
        [73, 2], [76, 1], [78, 1],                    // C#5 E5 F#5
        [80, 2], [null, 2],                           // G#5 .
        [78, 1], [76, 1], [73, 1], [71, 1],           // F#5 E5 C#5 B4
        [73, 4],                                      // C#5 (held, tonic)
      ],
    },
    // terraces — D lydian (G#), 112 BPM, bounciest. 16th-note arp driving
    // throughout; playful syncopated lead with several portamento leaps.
    terraces: {
      bpm: 112, bars: 8, barsPerChord: 2,
      chords: [[50, 54, 57, 62], [52, 56, 59, 64], [57, 61, 64, 69], [47, 50, 54, 59]], // D  E  A  Bm
      sub: [38, 40, 33, 35],                          // D2 E2 A1 B1
      arpTones: [[62, 66, 69, 74], [64, 68, 71, 76], [69, 73, 76, 81], [59, 62, 66, 71]],
      arp: { div: 16, seq: [0, 1, 2, 3, 2, 3, 0, 1, 0, 1, 2, 3, 2, 3, 1, 0] },
      lead: [
        [66, 1], [69, 0.5], [73, 0.5], [78, 1], [73, 1],       // F#4 A4 C#5 F#5(leap) C#5
        [74, 1.5], [71, 0.5], [69, 2],                         // D5 B4 A4
        [69, 0.5], [73, 0.5], [76, 1], [73, 0.5], [69, 0.5], [66, 1], // A4 C#5 E5 C#5 A4 F#4
        [68, 2], [62, 2],                                      // G#4 (lydian color) D4
        [66, 1], [69, 0.5], [73, 0.5], [80, 1], [73, 1],       // F#4 A4 C#5 G#5(leap) C#5
        [78, 1.5], [76, 0.5], [73, 2],                         // F#5 E5 C#5
        [73, 0.5], [76, 0.5], [78, 1], [76, 0.5], [73, 0.5], [69, 1], // C#5 E5 F#5 E5 C#5 A4
        [74, 2], [62, 2],                                      // D5 D4 (tonic)
      ],
    },
  };

  // Precompute per-song loop length + lead events keyed by their start step.
  function prepareSong(song) {
    if (song._prepared) return song;
    song._loopSteps = song.bars * STEPS_PER_BAR;
    const byStep = {};
    let beat = 0;
    for (const [midi, dur] of song.lead) {
      if (midi !== null) {
        byStep[Math.round(beat * STEPS_PER_BEAT)] = { midi, durSteps: Math.round(dur * STEPS_PER_BEAT) };
      }
      beat += dur;
    }
    song._leadByStep = byStep;
    song._leadBeats = beat; // must equal bars*4
    song._prepared = true;
    return song;
  }

  // gentle tanh soft-clip for the lead — shared, built once.
  let leadCurve = null;
  function tanhCurve() {
    if (leadCurve) return leadCurve;
    const n = 1024;
    leadCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; leadCurve[i] = Math.tanh(2.2 * x); }
    return leadCurve;
  }

  let musicRunning = false;
  let musicBus = null, duckGain = null;
  let analyser = null, analyserData = null;
  let instances = [];            // active song instances (1 normally, 2 mid-crossfade)
  let schedulerTimer = null;
  let currentRegion = 'island';

  // Build the full node graph + scheduler state for one song. Each instance is
  // self-contained so two can play at once during a crossfade.
  function createInstance(name, initialGain) {
    const song = prepareSong(SONGS[name]);
    const g = ctx.createGain();
    g.gain.value = initialGain;
    g.connect(musicBus);

    // pad + sub share the sidechain "pump" gain (ducks -4 dB on every beat)
    const pump = ctx.createGain();
    pump.gain.value = 1;
    pump.connect(g);

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = song.padType === 'triangle' ? 3000 : 2200;
    padFilter.Q.value = 0.6;
    const padGain = ctx.createGain();
    padGain.gain.value = song.padType === 'triangle' ? 0.62 : 0.5; // glass choir sits forward
    padFilter.connect(padGain).connect(pump);

    const subGain = ctx.createGain();
    subGain.gain.value = 0.6;
    subGain.connect(pump);

    // lead: square+saw pair -> tanh waveshaper -> leadGain
    const shaper = ctx.createWaveShaper();
    shaper.curve = tanhCurve();
    const leadGain = ctx.createGain();
    leadGain.gain.value = 0.16;
    shaper.connect(leadGain).connect(g);

    // arp DX plucks: dry + ping-pong feedback delay
    const arpGain = ctx.createGain();
    arpGain.gain.value = 0.4;
    arpGain.connect(g);
    const spb = 60 / song.bpm;
    const delayL = ctx.createDelay(1);
    const delayR = ctx.createDelay(1);
    delayL.delayTime.value = spb * 0.75; // dotted-8th, tempo-locked
    delayR.delayTime.value = spb * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const panL = ctx.createStereoPanner(); panL.pan.value = -0.5;
    const panR = ctx.createStereoPanner(); panR.pan.value = 0.5;
    const wet = ctx.createGain();
    wet.gain.value = song.leadType === 'pluck' ? 0.38 : 0.28; // ringwood wants more delay
    delayL.connect(panL).connect(wet);
    delayL.connect(delayR);
    delayR.connect(panR).connect(wet);
    delayR.connect(fb).connect(delayL);
    wet.connect(g);
    const arpSend = ctx.createGain();
    arpSend.gain.value = 1;
    arpSend.connect(delayL);

    return {
      name, song,
      songGain: g, pump, padFilter, padGain, subGain,
      shaper, leadGain, arpGain, arpSend,
      delayL, delayR, fb, panL, panR, wet,
      step: 0, nextStepTime: 0, prevLeadFreq: 0, alive: true,
    };
  }

  function retireInstance(inst) {
    inst.alive = false;
    instances = instances.filter((x) => x !== inst);
    [inst.songGain, inst.pump, inst.padFilter, inst.padGain, inst.subGain, inst.shaper,
     inst.leadGain, inst.arpGain, inst.arpSend, inst.delayL, inst.delayR, inst.fb,
     inst.panL, inst.panR, inst.wet].forEach((n) => { try { n.disconnect(); } catch (e) { /* ignore */ } });
  }

  // --- voices ---

  function playPad(inst, slot, t) {
    const song = inst.song;
    const dur = (60 / song.bpm) * 4 * song.barsPerChord; // seconds this chord holds
    const triangle = song.padType === 'triangle';
    const detunes = triangle ? [-9, 0, 9] : [-7, 7]; // stacked triangles = glass choir
    const lvl = triangle ? 0.036 : 0.05;
    for (const m of song.chords[slot]) {
      const f = mtof(m);
      for (const cents of detunes) {
        const o = ctx.createOscillator();
        o.type = triangle ? 'triangle' : 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cents;
        const g = ctx.createGain();
        const atk = Math.min(1.8, dur * 0.32);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(lvl, t + atk);
        g.gain.setValueAtTime(lvl, t + dur - 0.2);
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2); // overlaps next chord
        o.connect(g).connect(inst.padFilter);
        o.start(t);
        o.stop(t + dur + 1.4);
      }
    }
  }

  function playSub(inst, slot, t) {
    const song = inst.song;
    const dur = (60 / song.bpm) * 4 * song.barsPerChord;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = mtof(song.sub[slot]);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.26, t + Math.min(1.2, dur * 0.25));
    g.gain.setValueAtTime(0.26, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    o.connect(g).connect(inst.subGain);
    o.start(t);
    o.stop(t + dur + 0.8);
  }

  // FM bell pluck (sine carrier, 2:1 modulator, fast-decaying index) -> arp bus + delay.
  function pluck(inst, freq, t, vel, decay) {
    decay = decay || 0.45;
    const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = freq;
    const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = freq * 2;
    const md = ctx.createGain();
    md.gain.setValueAtTime(freq * 2.5, t);
    md.gain.exponentialRampToValueAtTime(freq * 0.05, t + decay);
    mod.connect(md).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    car.connect(g);
    g.connect(inst.arpGain);
    g.connect(inst.arpSend);
    car.start(t); mod.start(t);
    car.stop(t + decay + 0.05); mod.stop(t + decay + 0.05);
  }

  // detuned square+saw lead with a portamento glide from the previous note and a
  // vibrato that fades in after onset. Returns the note frequency (for glide chaining).
  function leadVoice(inst, midi, t, durSec, glideFrom, gainMul) {
    const f = mtof(midi);
    const peak = 0.5 * (gainMul || 1);
    const sus = Math.max(0.08, durSec * 0.9);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.012);
    env.gain.setValueAtTime(peak, t + sus * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0008, t + sus + 0.12);
    env.connect(inst.shaper);

    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.5;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.setValueAtTime(0, t);
    lfoDepth.gain.linearRampToValueAtTime(4, t + 0.09); // vibrato +/-4 cents, eased in
    lfo.connect(lfoDepth);

    const gf = glideFrom > 0 ? glideFrom : f;
    [['square', -6], ['sawtooth', 6]].forEach(([type, cents]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(gf, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.055); // the rubbery bend
      o.detune.setValueAtTime(cents, t);                      // +/-6 cents spread
      lfoDepth.connect(o.detune);                             // + vibrato on top
      o.connect(env);
      o.start(t);
      o.stop(t + sus + 0.2);
    });
    lfo.start(t); lfo.stop(t + sus + 0.2);
    return f;
  }

  // --- scheduler ---

  function tickInstance(inst, t) {
    const song = inst.song;
    const step = inst.step;
    const barIndex = Math.floor(step / STEPS_PER_BAR);
    const stepInBar = step % STEPS_PER_BAR;
    const slot = Math.floor(barIndex / song.barsPerChord) % song.chords.length;
    const sixteenth = (60 / song.bpm) / 4;

    // swing: nudge the off-beat 8ths later
    let when = t;
    if (song.swing && (stepInBar % 4 === 2)) when = t + sixteenth * 2 * song.swing;

    // new chord every barsPerChord bars
    if (stepInBar === 0 && (barIndex % song.barsPerChord === 0)) {
      playPad(inst, slot, t);
      playSub(inst, slot, t);
    }
    // low toll on bar 1 of the loop (chancel)
    if (song.toll && step === 0) pluck(inst, mtof(song.sub[0] + 12), t, 0.18, 2.4);

    // sidechain pump: pad+sub duck to -4 dB (0.63) each beat, 60ms dip, 200ms recovery
    if (stepInBar % STEPS_PER_BEAT === 0) {
      const p = inst.pump.gain;
      p.setValueAtTime(1, t);
      p.linearRampToValueAtTime(0.63, t + 0.06);
      p.linearRampToValueAtTime(1, t + 0.26);
    }

    // arp
    const arp = song.arp;
    const stepsPerArp = STEPS_PER_BAR / arp.div; // 2 for 8ths, 1 for 16ths
    if (step % stepsPerArp === 0) {
      const idx = arp.seq[(stepInBar / stepsPerArp) % arp.seq.length];
      if (idx >= 0) {
        const pool = song.arpTones[slot];
        pluck(inst, mtof(pool[idx % pool.length]), when, 0.075, 0.4);
      }
    }

    // lead
    const ev = song._leadByStep[step];
    if (ev) {
      const durSec = ev.durSteps * sixteenth;
      if (song.leadType === 'pluck') {                       // ringwood music-box
        pluck(inst, mtof(ev.midi), when, 0.14, Math.min(1.9, durSec * 0.9 + 0.3));
        inst.prevLeadFreq = mtof(ev.midi);
      } else {
        const prev = inst.prevLeadFreq;
        const f = leadVoice(inst, ev.midi, when, durSec, prev, 1);
        if (song.leadOctaveDouble) leadVoice(inst, ev.midi + 12, when, durSec, prev > 0 ? prev * 2 : 0, 0.4);
        inst.prevLeadFreq = f;
      }
    }

    inst.step = (inst.step + 1) % song._loopSteps;
  }

  function scheduler() {
    const horizon = ctx.currentTime + 0.12;
    for (const inst of instances) {
      if (!inst.alive) continue;
      const sixteenth = (60 / inst.song.bpm) / 4;
      while (inst.nextStepTime < horizon) {
        tickInstance(inst, inst.nextStepTime);
        inst.nextStepTime += sixteenth; // fixed increment -> never drifts, loops seamlessly
      }
    }
    schedulerTimer = setTimeout(scheduler, 25);
  }

  // --- public music API ---

  function musicStart(region) {
    ensure();
    if (musicRunning) { if (region) setRegion(region); return; } // idempotent
    musicRunning = true;
    currentRegion = SONGS[region] ? region : 'island';

    // bus: musicBus (0.3) -> duckGain -> master. duckGain is separate so the
    // dialogue duck never fights the stop fade on musicBus.
    duckGain = ctx.createGain();
    duckGain.gain.value = 1;
    duckGain.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.3;
    musicBus.connect(duckGain);

    // analyser tap for the HUD visualiser (no onward output)
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyserData = new Uint8Array(analyser.frequencyBinCount);
    musicBus.connect(analyser);

    const inst = createInstance(currentRegion, 1);
    inst.step = 0;
    inst.nextStepTime = ctx.currentTime + 0.12;
    instances = [inst];

    // dip the ambience a touch further while a song plays
    if (ambienceBus) {
      const t = ctx.currentTime;
      ambienceBus.gain.cancelScheduledValues(t);
      ambienceBus.gain.setValueAtTime(ambienceBus.gain.value, t);
      ambienceBus.gain.linearRampToValueAtTime(0.32, t + 2.5);
    }
    scheduler();
  }

  // crossfade to another region's song over ~2.5s, swapped on a bar boundary.
  function setRegion(region) {
    if (!musicRunning) return;
    if (!region || !SONGS[region]) return;   // undefined / unknown -> keep current
    if (region === currentRegion) return;
    currentRegion = region;

    const outgoing = instances[instances.length - 1];
    const sixteenth = (60 / outgoing.song.bpm) / 4;
    // next bar boundary of the outgoing song, at least ~a beat away so we don't
    // land on a boundary that's already inside the lookahead window.
    let stepsToBar = (STEPS_PER_BAR - (outgoing.step % STEPS_PER_BAR)) % STEPS_PER_BAR;
    if (stepsToBar < 4) stepsToBar += STEPS_PER_BAR;
    const swapTime = outgoing.nextStepTime + stepsToBar * sixteenth;

    const incoming = createInstance(region, 0);
    incoming.step = 0;
    incoming.nextStepTime = swapTime;
    incoming.songGain.gain.setValueAtTime(0.0001, swapTime);
    incoming.songGain.gain.linearRampToValueAtTime(1, swapTime + 2.5);
    outgoing.songGain.gain.cancelScheduledValues(swapTime);
    outgoing.songGain.gain.setValueAtTime(outgoing.songGain.gain.value, swapTime);
    outgoing.songGain.gain.linearRampToValueAtTime(0.0001, swapTime + 2.5);
    instances.push(incoming);

    setTimeout(() => retireInstance(outgoing), (swapTime - ctx.currentTime + 2.8) * 1000);
  }

  // 5 log-spaced levels 0..1 for the HUD visualiser (zeros when not running).
  function getLevels() {
    if (!musicRunning || !analyser || !analyserData) return [0, 0, 0, 0, 0];
    analyser.getByteFrequencyData(analyserData);
    const n = analyserData.length;                 // 128 bins
    const edges = [1, 4, 11, 28, 64, 120];         // bass -> air
    const out = [];
    for (let b = 0; b < 5; b++) {
      const lo = edges[b], hi = Math.min(edges[b + 1], n);
      let sum = 0, cnt = 0;
      for (let i = lo; i < hi; i++) { sum += analyserData[i]; cnt++; }
      out.push(cnt ? Math.min(1, (sum / cnt) / 180) : 0);
    }
    return out;
  }

  function musicStop() {
    if (!musicRunning) return;
    musicRunning = false;
    if (schedulerTimer) { clearTimeout(schedulerTimer); schedulerTimer = null; }
    const t = ctx.currentTime;
    if (musicBus) {
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(musicBus.gain.value, t);
      musicBus.gain.linearRampToValueAtTime(0, t + 1); // fade out over 1s
    }
    if (ambienceBus) {                                 // restore ambience level
      ambienceBus.gain.cancelScheduledValues(t);
      ambienceBus.gain.setValueAtTime(ambienceBus.gain.value, t);
      ambienceBus.gain.linearRampToValueAtTime(0.4, t + 1.5);
    }
    const insts = instances.slice();
    const busRef = musicBus, duckRef = duckGain, anRef = analyser;
    setTimeout(() => {
      insts.forEach(retireInstance);
      [busRef, duckRef, anRef].forEach((n) => { try { if (n) n.disconnect(); } catch (e) { /* ignore */ } });
    }, 2000); // after the fade + delay tails
    instances = [];
    musicBus = duckGain = analyser = analyserData = null;
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

  return { begin, setAmbience, click, whoosh, chime, pickup, blip, denied, musicStart, musicStop, setRegion, getLevels };
})();
