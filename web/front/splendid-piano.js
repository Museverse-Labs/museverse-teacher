































































(() => {
  'use strict';
  if (window.MVPiano && window.MVPiano.splendid) return;
  const me = document.currentScript;
  const BASE = window.MVSPLENDID_BASE || new URL('splendid/', (me && me.src) || location.href).href;
  const DEFAULT_VEL = 80, RELEASE_TAU_S = 0.1, RELEASE_S = 0.5, END_FADE_S = 0.25, STOP_FADE_S = 0.08, FETCHES = 4;
  const LIMIT_DB = -2, LIMIT_RATIO = 20;     
  const SIDE = 0.2;                          
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let man = null, manP = null, format = null;
  const bufs = new Map();        
  const loads = new Map();       
  const failed = new Set();
  const regionCache = new Map();
  const live = new Set();        
  const st = { bytes: 0, decodeMs: 0, fallbacks: 0, standIns: 0, played: 0, missed: 0 };
  let AC = null, BUS = null, dec = null;

  

  
  
  
  const embedded = () => (window.MVSPLENDID_B64 && typeof window.MVSPLENDID_B64 === 'object' ? window.MVSPLENDID_B64 : null);
  function fromB64(b64) {
    const bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  function manifest() {
    if (man) return Promise.resolve(man);
    if (manP) return manP;
    const em = window.MVSPLENDID_MANIFEST;
    if (em && Array.isArray(em.layers) && em.files) { man = em; return Promise.resolve(man); }
    manP = fetch(BASE + 'manifest.json').then((r) => { if (!r.ok) throw new Error(`the piano's manifest answered ${r.status}`); return r.json(); })
      .then((m) => { if (!m || !Array.isArray(m.layers) || !m.files) throw new Error("the piano's manifest is not one"); man = m; return m; })
      .catch((e) => { manP = null; throw e; });
    return manP;
  }
  function canOpus() {
    try { return !!new Audio().canPlayType('audio/ogg; codecs=opus'); } catch { return false; }
  }
  function decoder() {
    if (dec) return dec;
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Off) return null;
    try { dec = new Off(2, 1, 48000); } catch { dec = null; }   
    return dec;
  }
  function decode(buf) {
    return new Promise((resolve, reject) => {
      let p;
      try { p = decoder().decodeAudioData(buf, resolve, reject); } catch (e) { reject(e); return; }
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  }
  async function fetchDecode(stem, fmt) {
    const em = embedded(), b64 = em && typeof em[`${stem}.${fmt}`] === 'string' ? em[`${stem}.${fmt}`] : null;
    let raw;
    if (b64) raw = fromB64(b64);
    else {
      const r = await fetch(`${BASE}${stem}.${fmt}`);
      if (!r.ok) throw new Error(`${stem}.${fmt} answered ${r.status}`);
      raw = await r.arrayBuffer();
    }
    const n = raw.byteLength;                                  
    const t0 = performance.now();
    const b = await decode(raw);
    st.decodeMs += performance.now() - t0;
    st.bytes += n;
    return b;
  }
  
  const queue = [];
  let running = 0;
  function pump() {
    while (running < FETCHES && queue.length) {
      const job = queue.shift();
      running++;
      job().finally(() => { running--; pump(); });
    }
  }
  function load(stem) {
    if (bufs.has(stem)) return Promise.resolve(true);
    if (loads.has(stem)) return loads.get(stem);
    const p = new Promise((resolve) => {
      queue.push(async () => {
        if (!format) format = canOpus() ? 'opus' : 'm4a';
        try {
          bufs.set(stem, await fetchDecode(stem, format));
          resolve(true);
        } catch (e) {
          
          if (format === 'opus') {
            try { const b = await fetchDecode(stem, 'm4a'); format = 'm4a'; bufs.set(stem, b); resolve(true); return; } catch {   }
          }
          failed.add(stem); loads.delete(stem);
          console.info(`MVPiano: the piano's sample ${stem} did not load (${(e && e.message) || e}).`);
          resolve(false);
        }
      });
      pump();
    });
    loads.set(stem, p);
    return p;
  }

  

  const velOf = (v) => clamp(Math.round(Number.isFinite(+v) ? +v : DEFAULT_VEL), 1, 127);
  function layerOf(v) {
    const vel = velOf(v);
    return man.layers.findIndex((l) => l.velRange[0] <= vel && vel <= l.velRange[1]);
  }
  
  function region(m, v) {
    if (!man) return null;
    return regionIn(clamp(Math.round(+m), 0, 127), layerOf(v));
  }
  
  function regionIn(key, li) {
    if (!man || li < 0 || li >= man.layers.length) return null;
    const ck = key * 8 + li;
    if (regionCache.has(ck)) return regionCache.get(ck);
    const regs = man.layers[li].regions;
    const r = regs.find((x) => x[0] <= key && key <= x[1]);
    let got = r && r[3] ? { stem: r[3], pitch: r[2], fallback: false } : null;
    if (!got) {
      let best = null;
      for (const x of regs) {
        if (!x[3]) continue;
        const d = Math.abs(x[2] - key);
        if (!best || d < best.d || (d === best.d && x[2] < best.pitch)) best = { d, stem: x[3], pitch: x[2] };
      }
      got = best ? { stem: best.stem, pitch: best.pitch, fallback: true } : null;
    }
    regionCache.set(ck, got);
    return got;
  }
  
  
  
  
  function standIn(m, v) {
    if (!man) return null;
    const key = clamp(Math.round(+m), 0, 127), vel = velOf(v), own = layerOf(vel);
    const far = (l) => (vel < l.velRange[0] ? l.velRange[0] - vel : vel > l.velRange[1] ? vel - l.velRange[1] : 0);
    const order = man.layers.map((l, li) => ({ li, d: far(l), lo: l.velRange[0] })).filter((x) => x.li !== own)
      .sort((a, b) => a.d - b.d || a.lo - b.lo);
    for (const { li } of order) {
      const r = regionIn(key, li), buf = r && bufs.get(r.stem);
      if (buf) return { stem: r.stem, pitch: r.pitch, buf };
    }
    return null;
  }
  function noteOf(n) {
    if (Array.isArray(n)) return { m: +n[0], v: n.length > 1 ? +n[1] : DEFAULT_VEL };
    if (n && typeof n === 'object') return { m: +(n.m ?? n.midi ?? n.pitch), v: +(n.v ?? n.vel ?? n.velocity ?? DEFAULT_VEL) };
    return { m: +n, v: DEFAULT_VEL };
  }

  async function ready(notes) {
    if (!decoder()) return false;
    calibrate();
    try { await manifest(); } catch (e) { console.info(`MVPiano: the piano did not load (${(e && e.message) || e}).`); return false; }
    const stems = new Set();
    for (const raw of Array.isArray(notes) ? notes : []) {
      const n = noteOf(raw);
      if (!Number.isFinite(n.m)) continue;
      const r = region(n.m, n.v);
      if (!r) continue;
      if (r.fallback) st.fallbacks++;
      stems.add(r.stem);
    }
    const got = await Promise.all([...stems].map(load));
    await calibrate();
    return got.every(Boolean);
  }
  function has(m, v) {
    const r = region(m, v);
    return !!(r && bufs.has(r.stem));
  }

  

  
  function context() {
    if (AC) return AC;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { AC = new C({ latencyHint: 'interactive' }); } catch { try { AC = new C(); } catch { return null; } }
    try { BUS = pageBus(AC); } catch { BUS = null; }
    return AC;
  }
  
  function pageBus(c) {
    const b = bus(c);
    b.volGain.gain.value = masterVol;
    return b;
  }
  
  
  
  
  const LIMIT_RELEASE_S = 0.15, WARM_S = 0.03;
  function limiter(c) {
    const lim = c.createDynamicsCompressor(), t = c.currentTime;
    lim.threshold.value = LIMIT_DB; lim.knee.value = 0; lim.ratio.value = LIMIT_RATIO; lim.attack.value = 0.002;
    lim.release.setValueAtTime(0.001, t); lim.release.setValueAtTime(LIMIT_RELEASE_S, t + WARM_S);
    return lim;
  }
  
  
  
  let trimGain = null, trimP = null;
  function calibrate() {
    if (trimP) return trimP;
    trimP = new Promise((resolve) => {
      const done = (g) => { trimGain = Number.isFinite(g) && g > 0.5 && g < 2 ? g : 1; resolve(trimGain); };
      try {
        const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext, SR = 48000, n = 12000;
        const c = new Off(1, n, SR), b = c.createBuffer(1, n, SR), x = b.getChannelData(0);
        for (let i = 0; i < n; i++) x[i] = 0.1 * Math.sin((2 * Math.PI * 440 * i) / SR);
        const src = c.createBufferSource(), lim = limiter(c);
        src.buffer = b; src.connect(lim); lim.connect(c.destination); src.start(0);
        const got = (out) => {
          const y = out.getChannelData(0);
          let a = 0, z = 0;
          for (let i = n / 2; i < n; i++) { a += y[i] * y[i]; z += x[i] * x[i]; }
          done(a > 0 ? Math.sqrt(z / a) : 1);
        };
        const p = c.startRendering();
        if (p && typeof p.then === 'function') p.then(got, () => done(1));
        else c.oncomplete = (e) => got(e.renderedBuffer);
      } catch { done(1); }
    });
    return trimP;
  }
  
  
  
  function bus(c) {
    const inp = c.createGain(), duck = c.createGain(), fx = c.createGain();
    inp.channelCount = 2; inp.channelCountMode = 'explicit'; inp.channelInterpretation = 'speakers';
    const split = c.createChannelSplitter(2), merge = c.createChannelMerger(2);
    inp.connect(duck); duck.connect(split);
    const near = (1 + SIDE) / 2, far = (1 - SIDE) / 2;
    for (const [from, to, g] of [[0, 0, near], [1, 0, far], [0, 1, far], [1, 1, near]]) {
      const n = c.createGain(); n.gain.value = g;
      split.connect(n, from); n.connect(merge, 0, to);
    }
    const lim = limiter(c), trim = c.createGain(), vol = c.createGain();
    trim.gain.value = trimGain || 1;
    if (!trimGain) calibrate().then((g) => { trim.gain.value = g; });
    merge.connect(lim); fx.connect(lim); lim.connect(trim); trim.connect(vol); vol.connect(c.destination);
    inp.duckGain = duck; inp.volGain = vol; inp.fx = fx; inp.spans = []; inp.lifts = []; inp.born = c.currentTime;
    return inp;
  }
  function output() {
    if (BUS) return BUS;
    const c = context();
    if (!c) return null;
    if (!BUS) BUS = pageBus(c);
    return BUS;
  }
  function now() { const c = context(); return c ? c.currentTime : 0; }

  
  
  
  
  let masterVol = 1;
  const VOLUME_TAU_S = 0.01;
  function setVolume(v, on) {
    const x = clamp(Number.isFinite(+v) ? +v : 1, 0, 1), b = on || BUS;
    if (!on) masterVol = x;
    if (b && b.volGain) {
      const g = b.volGain.gain, t = b.context.currentTime;
      try { g.cancelScheduledValues(t); g.setTargetAtTime(x, t, VOLUME_TAU_S); } catch { g.value = x; }
    }
    return x;
  }
  const volume = () => masterVol;

  

  const HOLD = Object.freeze({ velocity: 92, floorDb: 3, hopS: 0.01, winS: 0.05, maxDb: 24 });
  const powers = new Map();      
  function powerSums(stem, buf) {
    const got = powers.get(stem);
    if (got && got.buf === buf) return got.sum;
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
    const near = (1 + SIDE) / 2, far = (1 - SIDE) / 2, sum = new Float64Array(L.length + 1);
    for (let i = 0; i < L.length; i++) {
      const a = near * L[i] + far * R[i], b = far * L[i] + near * R[i];
      sum[i + 1] = sum[i] + (a * a + b * b) / 2;
    }
    powers.set(stem, { buf, sum });
    return sum;
  }
  
  
  
  function floorGains(stem, buf, rate, fromS, holdS) {
    const sum = powerSums(stem, buf), n = sum.length - 1, sr = buf.sampleRate, hop = HOLD.hopS;
    const nf = Math.max(1, Math.ceil(holdS / hop) + 1), p2 = new Float64Array(nf);
    for (let k = 0; k < nf; k++) {
      const i0 = Math.min(n, Math.floor(k * hop * rate * sr)), i1 = Math.min(n, Math.max(i0 + 1, Math.floor((k + 1) * hop * rate * sr)));
      p2[k] = i1 > i0 ? (sum[i1] - sum[i0]) / (i1 - i0) : 0;
    }
    const w = Math.max(1, Math.round(HOLD.winS / hop)), lo = Math.floor(w / 2), sm = new Float64Array(nf);
    for (let k = 0; k < nf; k++) {                          
      let q = 0;
      for (let j = k - lo; j < k - lo + w; j++) q += p2[clamp(j, 0, nf - 1)];
      sm[k] = Math.sqrt(Math.max(q / w, 1e-24));
    }
    const ia = Math.min(nf - 1, Math.round(fromS / hop)), top = 10 ** (HOLD.maxDb / 20), want = sm[ia] * 10 ** (-HOLD.floorDb / 20);
    const g = new Float32Array(nf).fill(1);
    for (let k = ia; k < nf; k++) g[k] = clamp(want / sm[k], 1, top);
    return { g, ia };
  }

  function voice(c, dest, when, off, m, v, opts) {
    const r = region(m, v);
    let use = r && bufs.has(r.stem) ? { stem: r.stem, pitch: r.pitch, buf: bufs.get(r.stem), standIn: false } : null;
    if (!use) {
      if (r && !failed.has(r.stem)) load(r.stem);          
      const s = standIn(m, v);
      if (!s) { st.missed++; return null; }
      use = { ...s, standIn: true };
      st.fallbacks++; st.standIns++;
    }
    const buf = use.buf;
    const rate = 2 ** ((Math.round(+m) - use.pitch) / 12), g = clamp(Math.round(+v || DEFAULT_VEL), 1, 127) / 127;
    const offS = Math.max(+off || 0, when + 0.005), runsOut = when + buf.duration / rate;
    const end = Math.min(offS + RELEASE_S, runsOut);
    const src = c.createBufferSource(), amp = c.createGain(), tail = c.createGain();
    src.buffer = buf; src.playbackRate.value = rate;
    amp.gain.setValueAtTime(g, when);
    amp.gain.setTargetAtTime(0, offS, RELEASE_TAU_S);
    if (runsOut < offS + RELEASE_S) {                      
      const from = Math.max(when, runsOut - END_FADE_S);
      tail.gain.setValueAtTime(1, from);
      tail.gain.linearRampToValueAtTime(0, runsOut);
    }
    let into = tail;
    const hf = opts && Number.isFinite(+opts.holdFloorS) ? Math.max(0, +opts.holdFloorS) : null;
    if (hf != null && when + hf < offS) {                   
      const { g: fg, ia } = floorGains(use.stem, buf, rate, hf, offS - when), hop = HOLD.hopS;
      const k1 = Math.min(fg.length - 1, Math.round((offS - when) / hop));
      if (k1 > ia) {
        const floor = c.createGain();
        try { floor.gain.setValueCurveAtTime(fg.slice(ia, k1 + 1), when + (ia + 0.5) * hop, (k1 - ia) * hop); } catch {   }
        floor.connect(tail);
        into = floor;
      }
    }
    src.connect(amp); amp.connect(into); tail.connect(dest);
    src.start(when); src.stop(end + 0.01);
    src.onended = () => { try { tail.disconnect(); } catch {   } };
    st.played++;
    return { out: amp, oscs: [src], start: when, end: end + 0.01, stem: use.stem, standIn: use.standIn };
  }

  function fadeOut(vc, fade) {
    const c = AC, t = c.currentTime, g = vc.out.gain, tau = Math.max(STOP_FADE_S, +fade || 0) / 3;
    if (vc.start > t) { try { vc.oscs[0].stop(t); } catch {   } return; }
    try {
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
      else { const val = g.value; g.cancelScheduledValues(t); g.setValueAtTime(val, t); }
      g.setTargetAtTime(0, t, tau);
    } catch {   }
    try { vc.oscs[0].stop(t + tau * 6); } catch {   }
  }
  function play(m, v, whenS, durS, opts) {
    const c = context(), dest = output();
    if (!c || !dest) { st.missed++; return null; }
    if (c.state !== 'running') c.resume().catch(() => {});
    const when = Math.max(c.currentTime, dest.born + WARM_S, Number.isFinite(+whenS) ? +whenS : 0);
    const vc = voice(c, dest, when, when + Math.max(0.005, +durS || 0.5), m, v, opts);
    if (!vc) return null;
    live.add(vc);
    vc.oscs[0].addEventListener('ended', () => live.delete(vc));
    return { stop: (fade) => { if (live.has(vc)) { live.delete(vc); fadeOut(vc, fade); } } };
  }
  function stopAll(fade) {
    if (!AC) return;
    for (const vc of live) fadeOut(vc, Math.max(0.25, +fade || 0.25));
    live.clear();
  }
  

  
  
  
  
  
  
  
  const DUCK = Object.freeze({ you: 0.3, reference: 0.5, rampS: 0.15, leadS: 0.3 });
  function duckAt(b, t) {
    let g = 1;
    for (const s of b.spans) {
      const down = clamp((t - (s.a - DUCK.leadS)) / DUCK.rampS, 0, 1), up = clamp((s.b + DUCK.rampS - t) / DUCK.rampS, 0, 1);
      let d = s.depth;
      for (const l of b.lifts) {
        const w = clamp((t - (l.a - DUCK.rampS)) / DUCK.rampS, 0, 1) * clamp((l.b - t) / DUCK.rampS, 0, 1);
        d = Math.max(d, s.depth + (Math.max(s.depth, l.g) - s.depth) * w);
      }
      g = Math.min(g, 1 - (1 - d) * Math.min(down, up));
    }
    return g;
  }
  function reduck(b) {
    const c = b.context, g = b.duckGain.gain, t = c.currentTime;
    b.spans = b.spans.filter((s) => s.b + DUCK.rampS > t);
    b.lifts = b.lifts.filter((l) => l.b > t);
    const at = [t];
    for (const s of b.spans) at.push(s.a - DUCK.leadS, s.a - DUCK.leadS + DUCK.rampS, s.b, s.b + DUCK.rampS);
    for (const l of b.lifts) at.push(l.a - DUCK.rampS, l.a - DUCK.rampS / 2, l.a, l.b - DUCK.rampS, l.b - DUCK.rampS / 2, l.b);
    const times = [...new Set(at.filter((x) => x >= t))].sort((x, y) => x - y);
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(duckAt(b, t), t);
      for (const x of times.slice(1)) g.linearRampToValueAtTime(duckAt(b, x), x);
    } catch {   }
  }
  
  
  
  function duckUnder(startS, endS, depth, on) {
    const b = on || output();
    if (!b || !b.duckGain || !Number.isFinite(+startS) || !Number.isFinite(+endS) || +endS <= +startS) return false;
    const d = typeof depth === 'number' ? clamp(depth, 0, 1) : DUCK[depth === 'reference' ? 'reference' : 'you'];
    b.spans.push({ a: +startS, b: +endS, depth: d });
    reduck(b);
    return true;
  }
  
  
  function duckLift(fromS, toS, gain, on) {
    const b = on || output();
    if (!b || !b.duckGain || !Number.isFinite(+fromS) || !Number.isFinite(+toS) || +toS <= +fromS) return false;
    b.lifts.push({ a: +fromS, b: +toS, g: gain == null || !Number.isFinite(+gain) ? 1 : clamp(+gain, 0, 1) });
    reduck(b);
    return true;
  }
  function unduck(on) {
    const b = on || BUS;
    if (!b || !b.duckGain) return;
    const t = b.context.currentTime, now = duckAt(b, t);
    b.spans = []; b.lifts = [];
    try {
      const g = b.duckGain.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(now, t); g.linearRampToValueAtTime(1, t + DUCK.rampS);
    } catch {   }
  }

  
  
  
  const CLICK = Object.freeze({ hz: [1500, 2200], level: [0.22, 0.34], decayS: 0.008, lenS: 0.06, preRollDb: -12 });
  const clickBufs = new Map();
  function clickBuf(c, accent, db) {
    const lvl = db == null || !Number.isFinite(+db) ? CLICK.level[accent ? 1 : 0] : CLICK.level[1] * 10 ** (+db / 20);
    const k = `${c.sampleRate}:${accent ? 1 : 0}:${lvl}`;
    if (clickBufs.has(k) && clickBufs.get(k).ctx === c) return clickBufs.get(k).buf;
    const n = Math.round(CLICK.lenS * c.sampleRate), b = c.createBuffer(1, n, c.sampleRate), x = b.getChannelData(0), f = CLICK.hz[accent ? 1 : 0];
    for (let i = 0; i < n; i++) {
      const t = i / c.sampleRate;
      x[i] = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * 2.71 * f * t)) * Math.exp(-t / CLICK.decayS) * lvl;
    }
    clickBufs.set(k, { ctx: c, buf: b });
    return b;
  }
  function click(whenS, accent, db, on) {
    const b = on || output();
    if (!b || !b.fx) return false;
    const c = b.context, src = c.createBufferSource();
    src.buffer = clickBuf(c, !!accent, db);
    src.connect(b.fx);
    src.start(Math.max(c.currentTime, Number.isFinite(+whenS) ? +whenS : 0));
    return true;
  }

  
  
  
  
  const STING = Object.freeze({ whooshS: 0.42, whooshDbfs: -30, bellHz: 880, bellDbfs: -24, bellTauS: 0.9, partial2: 0.18, lenS: 3.5, fadeS: 0.04 });
  function sting(whenS, on) {
    const b = on || output();
    if (!b) return false;
    const c = b.context, SR = c.sampleRate, n = Math.round(STING.lenS * SR), w = Math.round(STING.whooshS * SR);
    const buf = c.createBuffer(1, n, SR), x = buf.getChannelData(0);
    let seed = 626, acc = 0, top = 1e-9;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < w; i++) {                           
      const g = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
      acc += 0.06 * (g - acc); x[i] = acc; top = Math.max(top, Math.abs(acc));
    }
    const wl = 10 ** (STING.whooshDbfs / 20), bl = 10 ** (STING.bellDbfs / 20);
    for (let i = 0; i < w; i++) x[i] = (x[i] / top) * ((1 - Math.cos((Math.PI * i) / Math.max(1, w - 1))) / 2) * wl;
    for (let i = w; i < n; i++) {
      const t = (i - w) / SR;
      x[i] += (Math.sin(2 * Math.PI * STING.bellHz * t) + STING.partial2 * Math.sin(4 * Math.PI * STING.bellHz * t))
        * Math.exp(-t / STING.bellTauS) * Math.min(1, t / 0.005) * bl;
    }
    const k = Math.round(STING.fadeS * SR);
    for (let i = 0; i < k; i++) x[n - k + i] *= 1 - i / k;
    const src = c.createBufferSource();
    src.buffer = buf; src.connect(b);
    src.start(Math.max(c.currentTime, Number.isFinite(+whenS) ? +whenS : 0));
    return true;
  }

  function stats() {
    return { ready: !!man && running === 0 && !queue.length, format: format || (canOpus() ? 'opus' : 'm4a'), files: bufs.size, bytes: st.bytes,
      decodeMs: Math.round(st.decodeMs), fallbacks: st.fallbacks, standIns: st.standIns, played: st.played, missed: st.missed, failed: failed.size };
  }

  
  const sampleFor = (m, v) => { const r = region(m, v); return r ? { ...r } : null; };
  window.MVPiano = { splendid: true, ready, preload: ready, play, stopAll, now, context, output, bus, has, voice, stats, sampleFor,
    setVolume, volume, duckUnder, duckLift, unduck, click, sting, DUCK, CLICK, STING, HOLD, SIDE, WARM_S };
  try { window.dispatchEvent(new Event('mvpiano')); } catch {   }
})();
