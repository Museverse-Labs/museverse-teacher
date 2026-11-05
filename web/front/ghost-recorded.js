











































(() => {
  'use strict';
  const FPS = 30, PV = 168, RV = 200;
  const b64 = (s) => {
    const bin = atob(String(s || '')), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  };
  const b64any = (s) => {                                
    let t = String(s || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return new Uint8Array(b64(t));
  };
  
  
  
  function resample(H, Q, n, n2, srcAt) {
    const hb = new Int16Array(n2 * PV), rb = Q ? new Int16Array(n2 * RV) : null;
    for (let k = 0; k < n2; k++) {
      const src = Math.min(n - 1, Math.max(0, srcAt(k))), i0 = Math.floor(src), i1 = Math.min(n - 1, i0 + 1), a = src - i0;
      for (let h = 0; h < 2; h++) {
        const p0 = i0 * PV + h * 84, p1 = i1 * PV + h * 84, po = k * PV + h * 84;
        const v0 = H[p0] === 1, v1 = H[p1] === 1;
        if (!v0 && !v1) continue;
        const s0 = v0 ? p0 : p1, s1 = v1 ? p1 : p0, w = v0 && v1 ? a : 0;
        hb[po] = 1;
        for (let c = 1; c < 84; c++) hb[po + c] = Math.round(H[s0 + c] + (H[s1 + c] - H[s0 + c]) * w);
        if (!Q) continue;
        const q0 = (v0 ? i0 : i1) * RV + h * 100, q1 = (v1 ? i1 : i0) * RV + h * 100, qo = k * RV + h * 100;
        for (let j = 0; j < 25; j++) {
          const o0 = q0 + j * 4, o1 = q1 + j * 4;
          const dot = Q[o0] * Q[o1] + Q[o0 + 1] * Q[o1 + 1] + Q[o0 + 2] * Q[o1 + 2] + Q[o0 + 3] * Q[o1 + 3];
          const sg = dot < 0 ? -1 : 1;
          let x = Q[o0] + (sg * Q[o1] - Q[o0]) * w, y = Q[o0 + 1] + (sg * Q[o1 + 1] - Q[o0 + 1]) * w;
          let z = Q[o0 + 2] + (sg * Q[o1 + 2] - Q[o0 + 2]) * w, ww = Q[o0 + 3] + (sg * Q[o1 + 3] - Q[o0 + 3]) * w;
          const l = Math.hypot(x, y, z, ww) || 1;
          if (ww < 0) { x = -x; y = -y; z = -z; ww = -ww; }        
          rb[qo + j * 4] = Math.round((x / l) * 32767); rb[qo + j * 4 + 1] = Math.round((y / l) * 32767);
          rb[qo + j * 4 + 2] = Math.round((z / l) * 32767); rb[qo + j * 4 + 3] = Math.round((ww / l) * 32767);
        }
      }
    }
    return { hb, rb };
  }
  function take(rec, opts = {}) {
    const rate = Number.isFinite(+opts.rate) && +opts.rate > 0.1 ? Math.min(2, +opts.rate) : 1;
    const H = new Int16Array(b64(rec.hands)), Q = new Int16Array(b64(rec.rot));
    const n = Math.min(Math.floor(H.length / PV), Math.floor(Q.length / RV));
    if (!n) throw new Error('the recording has no frames');
    const frames = Math.max(1, Math.ceil(n / rate));
    const { hb, rb } = resample(H, Q, n, frames, (k) => k * rate);
    const notes = (Array.isArray(rec.notes) ? rec.notes : []).filter((r) => Array.isArray(r) && Number.isFinite(+r[0]) && Number.isFinite(+r[2]))
      .map((r) => [+(+r[0] / rate).toFixed(3), +(Math.max(+r[0] + 0.05, +r[1] || 0) / rate).toFixed(3), +r[2], +r[3] || 64, r[4] === 'L' ? 'L' : 'R']);
    const ms = notes.map((r) => r[2]);
    const dur = frames / FPS;
    const result = {
      stage: { fps: FPS, t0: 0, frames, durationS: +dur.toFixed(3), hands: 'rec.bin', handsRot: 'rec-rot.bin',
        whitePitchMm: +rec.whitePitchMm || 23.5, keyRange: ms.length ? [Math.min(...ms) - 3, Math.max(...ms) + 3] : [55, 79] },
      
      notes, phrases: [], findings: [], reference: { digits: (Array.isArray(rec.digits) ? rec.digits : [])
        .filter((d) => Array.isArray(d) && Number.isInteger(+d[0]) && +d[0] >= 0 && +d[0] < notes.length && +d[2] >= 1 && +d[2] <= 5)
        .map((d) => [+d[0], d[1] === 'L' ? 'L' : 'R', +d[2], 'pianist']) },
    };
    return { result, media: { 'rec.bin': hb.buffer, 'rec-rot.bin': rb.buffer }, frames, durationS: dur };
  }

  

  function timeMap(toLearner) {
    const rows = (Array.isArray(toLearner) ? toLearner : [])
      .filter((r) => Array.isArray(r) && Number.isFinite(+r[0]) && Number.isFinite(+r[1])).map((r) => [+r[0], +r[1]])
      .sort((a, b) => a[0] - b[0]);
    
    const R = [];
    for (const r of rows) if (!R.length || (r[0] > R[R.length - 1][0] + 1e-6 && r[1] > R[R.length - 1][1] + 1e-6)) R.push(r);
    if (!R.length) return { known: false, learnerAt: (s) => s, refAt: (s) => s, span: null };
    if (R.length === 1) { const d = R[0][1] - R[0][0]; return { known: true, learnerAt: (s) => s + d, refAt: (s) => s - d, span: [R[0][0], R[0][0]] }; }
    const pace = (R[R.length - 1][1] - R[0][1]) / (R[R.length - 1][0] - R[0][0]);     
    const go = (x, a, b) => {
      if (x <= R[0][a]) return R[0][b] + (x - R[0][a]) * (b ? pace : 1 / pace);
      const last = R[R.length - 1];
      if (x >= last[a]) return last[b] + (x - last[a]) * (b ? pace : 1 / pace);
      let lo = 0, hi = R.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R[m][a] <= x) lo = m; else hi = m; }
      const w = (x - R[lo][a]) / (R[hi][a] - R[lo][a]);
      return R[lo][b] + (R[hi][b] - R[lo][b]) * w;
    };
    return { known: true, learnerAt: (s) => go(s, 0, 1), refAt: (s) => go(s, 1, 0), span: [R[0][0], R[R.length - 1][0]] };
  }

  

  async function decrypt(buf, key, opts = {}) {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle) throw new Error('this browser cannot decrypt here (no WebCrypto: the page must be served over https or from localhost)');
    const raw = b64any(key);
    if (![16, 24, 32].includes(raw.length)) throw new Error('the ghost key is not an AES key');
    const k = await subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
    let bytes = new Uint8Array(buf), iv;
    if (opts.iv) iv = b64any(opts.iv);
    else { iv = bytes.slice(0, 12); bytes = bytes.slice(12); }
    const alg = { name: 'AES-GCM', iv, tagLength: 128 };
    if (opts.aad) alg.additionalData = new TextEncoder().encode(String(opts.aad));
    return new Uint8Array(await subtle.decrypt(alg, k, bytes));
  }
  async function gunzip(bytes) {
    if (!(bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b)) return bytes;
    if (typeof DecompressionStream !== 'function') throw new Error('the ghost came gzipped and this browser cannot unzip it');
    const r = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
    return new Uint8Array(await r.arrayBuffer());
  }

  
  
  const GLOW_MIN_S = 0.15;
  function keyTimeline(notes, end) {
    const keyEvents = [];
    for (const n of notes) { keyEvents.push([n.on, 1, n.m]); keyEvents.push([n.off, 0, n.m]); }
    keyEvents.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const held = new Map(), keyNotes = [];
    for (const [t, on, m] of keyEvents) {
      const h = held.get(m);
      if (on) { if (h != null) keyNotes.push({ on: h, off: t, m }); held.set(m, t); }
      else if (h != null) { keyNotes.push({ on: h, off: t, m }); held.delete(m); }
    }
    for (const [m, h] of held) keyNotes.push({ on: h, off: Math.max(h, end), m });
    keyNotes.sort((a, b) => a.on - b.on || a.m - b.m);
    let keyWindow = 0;
    for (const n of keyNotes) keyWindow = Math.max(keyWindow, Math.max(n.off, n.on + GLOW_MIN_S) - n.on);
    const lower = (t) => { let a = 0, b = keyNotes.length; while (a < b) { const k = (a + b) >> 1; if (keyNotes[k].on < t) a = k + 1; else b = k; } return a; };
    function keyStates(t, lit, glow) {
      lit.fill(0); glow.fill(0);
      if (!Number.isFinite(t)) return;
      for (let k = lower(t - keyWindow); k < keyNotes.length && keyNotes[k].on <= t; k++) {
        const n = keyNotes[k];
        if (n.m < 21 || n.m > 108) continue;
        if (t < n.off) lit[n.m] = 1;
        if (t < Math.max(n.off, n.on + GLOW_MIN_S)) glow[n.m] = 1;
      }
    }
    return { keyEvents, keyNotes, keyWindow, keyStates };
  }

  
  function open(seg, opts = {}) {
    if (!seg || typeof seg !== 'object' || seg.v !== 1) throw new Error('not a recorded segment');
    const fps = +seg.fps || 15, refT0 = +seg.refT0 || 0;
    let H = opts._empty ? new Int16Array(opts._empty * PV) : new Int16Array(b64(seg.hands));
    const n = Math.floor(H.length / PV);
    if (n < 2) throw new Error('the recording has no frames');
    if (H.length !== n * PV) H = H.slice(0, n * PV);
    const W = +seg.whitePitchMm || 23.5;
    const NOTES = (Array.isArray(seg.notes) ? seg.notes : []).filter((r) => Array.isArray(r) && Number.isFinite(+r[0]) && Number.isFinite(+r[2]))
      .map((r) => [+r[0], Math.max(+r[0] + 0.05, Number.isFinite(+r[1]) ? +r[1] : +r[0] + 0.3), +r[2], r[3] === 'L' ? 'L' : 'R']);
    const DIGITS = (Array.isArray(seg.digits) ? seg.digits : [])
      .filter((d) => Array.isArray(d) && Number.isInteger(+d[0]) && +d[0] >= 0 && +d[0] < NOTES.length && +d[2] >= 1 && +d[2] <= 5)
      .map((d) => [+d[0], d[1] === 'L' ? 'L' : 'R', +d[2]]);
    const KEYS = seg.keys && typeof seg.keys === 'object' ? seg.keys : null;
    const map = timeMap(opts.toLearner);
    const ms = NOTES.map((r) => r[2]);
    const range = Array.isArray(seg.keyRange) && seg.keyRange.length === 2 ? seg.keyRange.map(Number)
      : ms.length ? [Math.min(...ms), Math.max(...ms)] : [55, 79];
    const durationS = (n - 1) / fps;
    let disposed = false;
    const live = () => { if (disposed) throw new Error('this ghost was disposed'); };
    
    function stage() {
      live();
      const notes = NOTES.map((r, i) => ({ i, idx: i, on: r[0], off: r[1], m: r[2], v: 72, hand: r[3], digit: null, fing: null }))
        .sort((a, b) => a.on - b.on || a.m - b.m);
      const end = refT0 + durationS;
      const D = {
        stage: { fps, t0: refT0, frames: n, durationS, whitePitchMm: W, keyRange: range, keys: KEYS || undefined },
        notes, maxLen: notes.reduce((a, x) => Math.max(a, x.off - x.on), 0), dur: end, range, judged: { L: true, R: true },
        offs: { L: [0, 0, 0], R: [0, 0, 0] }, findings: [], phrases: [], ...keyTimeline(notes, end), digits: 0, fingering: null,
        fps, t0: refT0, frames: n, W, offsetS: 0, audioName: null, handsName: null, handsRotName: null, audioKind: 'recording',
      };
      const src = { H, frames: n };
      return { D, hands: () => (disposed ? null : src) };
    }
    
    function takeOf(o = {}) {
      live();
      const learner = o.map === 'learner';
      const out = learner ? { fps: FPS, t0: map.learnerAt(refT0), end: map.learnerAt(refT0 + durationS) } : { fps, t0: refT0, end: refT0 + durationS };
      const frames = learner ? Math.max(2, Math.ceil((out.end - out.t0) * FPS) + 1) : n;
      const { hb } = learner ? resample(H, null, n, frames, (k) => (map.refAt(out.t0 + k / FPS) - refT0) * fps) : { hb: H.slice() };
      const at = learner ? map.learnerAt : (s) => s;
      const notes = NOTES.map((r) => [+at(r[0]).toFixed(3), +at(r[1]).toFixed(3), r[2], 72, r[3]]);
      const result = {
        stage: { fps: out.fps, t0: +out.t0.toFixed(4), frames, durationS: +((frames - 1) / out.fps).toFixed(3), hands: 'rec.bin',
          whitePitchMm: W, keyRange: [range[0] - 3, range[1] + 3], keys: KEYS || undefined },
        notes, phrases: [], findings: [], reference: { digits: DIGITS.map((d) => [d[0], d[1], d[2], 'pianist']) },
      };
      return { result, media: { 'rec.bin': hb.buffer }, frames, durationS: (frames - 1) / out.fps };
    }
    return {
      fps, refT0, frames: n, durationS, refEnd: refT0 + durationS, whitePitchMm: W, keyRange: range.slice(), recorded: !opts._empty,
      bars: Array.isArray(seg.bars) ? seg.bars.slice() : null, octave: +seg.octave || 0, keys: !!KEYS,
      clocksKnown: map.known, learnerAt: map.learnerAt, refAt: map.refAt,
      quest: () => (KEYS ? JSON.parse(JSON.stringify(KEYS)) : null),
      stage, take: takeOf,
      notes(fromS = -Infinity, toS = Infinity) { live(); return NOTES.filter((r) => r[0] >= fromS && r[0] < toS).map((r) => r.slice()); },
      digits() { live(); return DIGITS.map((d) => d.slice()); },
      dispose() { disposed = true; H = new Int16Array(0); },
    };
  }

  async function load(ghost, opts = {}) {
    if (!ghost || typeof ghost !== 'object' || !ghost.url || !ghost.key) throw new Error('no recorded ghost for this fix');
    const exp = Number(ghost.exp);
    if (Number.isFinite(exp) && exp > 0 && Date.now() / 1000 > exp) throw new Error('the link to the recorded hands has expired');
    const r = await fetch(ghost.url, { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) throw new Error(`the recorded hands did not load (${r.status})`);
    const plain = await gunzip(await decrypt(await r.arrayBuffer(), ghost.key, { iv: ghost.iv, aad: ghost.aad }));
    const seg = JSON.parse(new TextDecoder().decode(plain));
    return open(seg, opts);
  }

  
  function keysOnly(o = {}) {
    const kr = Array.isArray(o.keyRange) ? o.keyRange.map((x) => Math.round(+x)) : [];
    if (!(kr.length === 2 && kr.every((x) => x >= 21 && x <= 108) && kr[0] <= kr[1])) throw new Error('no keys to show for this fix');
    const refT0 = Number.isFinite(+o.refFromS) && o.refFromS !== null ? +o.refFromS : 0;
    const refEnd = Number.isFinite(+o.refToS) && o.refToS !== null && +o.refToS > refT0 ? +o.refToS : refT0 + 4;
    const fps = 15, n = Math.max(2, Math.ceil((refEnd - refT0) * fps) + 1);
    const notes = (Array.isArray(o.notes) ? o.notes : []).filter((r) => Array.isArray(r) && +r[2] >= kr[0] && +r[2] <= kr[1]);
    return open({ v: 1, fps, refT0, keyRange: kr, notes, bars: Array.isArray(o.bars) ? o.bars : null }, { toLearner: o.toLearner, _empty: n });
  }

  window.MVGhostRecorded = { take, load, open, keysOnly, timeMap, decrypt };
})();
