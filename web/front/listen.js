

















(() => {
  'use strict';
  const NAMES = ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G', 'G sharp', 'A', 'B flat', 'B'];
  const nameOf = (m) => NAMES[((m % 12) + 12) % 12];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const W = [1, 0.8, 0.6, 0.45, 0.35];

  function align(E, H) {
    
    
    const n = E.length, m = H.length, D = [];
    for (let i = 0; i <= n; i++) { D.push(new Float64Array(m + 1)); D[i][0] = i; }
    for (let j = 0; j <= m; j++) D[0][j] = j * 0.6;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const c = E[i - 1] === H[j - 1] ? 0 : (E[i - 1] % 12 === H[j - 1] % 12 ? 0.4 : 1);
        D[i][j] = Math.min(D[i - 1][j - 1] + c, D[i - 1][j] + 1, D[i][j - 1] + 0.6);
      }
    }
    const at = new Array(n).fill(-1), exact = new Array(n).fill(false);
    let i = n, j = m;
    while (i > 0 && j > 0) {
      const c = E[i - 1] === H[j - 1] ? 0 : (E[i - 1] % 12 === H[j - 1] % 12 ? 0.4 : 1);
      if (Math.abs(D[i][j] - (D[i - 1][j - 1] + c)) < 1e-9) { at[i - 1] = j - 1; exact[i - 1] = c < 0.5; i--; j--; }
      else if (Math.abs(D[i][j] - (D[i - 1][j] + 1)) < 1e-9) i--;
      else j--;
    }
    return { at, exact };
  }

  function judge(expect, focus, heard) {
    const E = expect.map((e) => +e[1]), H = heard.map((h) => +h[1]);
    const total = E.length;
    if (H.length < Math.max(2, Math.ceil(total * 0.4))) return { ok: true, heard, verdict: 'quiet', matched: 0, total, focus: [] };
    const { at, exact } = align(E, H);
    const matched = exact.filter(Boolean).length;
    const fs = (focus || []).filter((i) => i >= 0 && i < total).map((i) => ({ want: nameOf(E[i]), got: at[i] >= 0 && !exact[i] ? nameOf(H[at[i]]) : (exact[i] ? nameOf(E[i]) : null), right: exact[i] }));
    let verdict;
    if (fs.length && fs.some((f) => !f.right)) verdict = 'focus';
    else verdict = matched >= Math.ceil(total * 0.75) ? 'right' : 'some';
    return { ok: true, heard, verdict, matched, total, focus: fs.map(({ want, got }) => ({ want, got })) };
  }

  async function start(opts = {}) {
    const expect = Array.isArray(opts.expect) ? opts.expect : [];
    const pitches = expect.map((e) => +e[1]).filter(Number.isFinite);
    if (!pitches.length) return { stop: async () => ({ ok: false, why: 'none' }), done: Promise.resolve({ ok: false, why: 'none' }) };
    let stream;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('no microphone API here'), { name: 'NotSupportedError' });
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      const r = { ok: false, why: e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'NotSupportedError') ? 'blocked' : 'failed', error: String((e && e.message) || e) };
      return { stop: async () => r, done: Promise.resolve(r) };
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch {   } }
    const src = ctx.createMediaStreamSource(stream);
    const fast = ctx.createAnalyser(), slow = ctx.createAnalyser();
    fast.fftSize = 1024; fast.smoothingTimeConstant = 0;
    slow.fftSize = 4096; slow.smoothingTimeConstant = 0;
    src.connect(fast); src.connect(slow);
    const fBins = new Float32Array(fast.frequencyBinCount), sBins = new Float32Array(slow.frequencyBinCount);
    const binHz = ctx.sampleRate / slow.fftSize;
    const lo = Math.min(...pitches) - 4, hi = Math.max(...pitches) + 4;
    const cands = [];
    for (let m = lo; m <= hi; m++) cands.push(m);
    const lin = (db) => (db > -160 ? Math.pow(10, db / 20) : 0);
    const prevF = new Float32Array(220), fluxes = [], heard = [];
    let primed = false;
    const t0 = performance.now();
    const expectS = expect.length ? +expect[expect.length - 1][0] + 0.8 : 4;
    const maxS = Math.min(40, expectS * 2.5 + 4);
    let lastOnset = -1e9, lastHeard = -1, timer = 0, stopped = false, finish;
    const done = new Promise((r) => { finish = r; });
    const peak = (spec, f) => {
      const k = Math.round(f / binHz);
      if (k + 1 >= spec.length) return 0;
      return Math.max(spec[k - 1] || 0, spec[k], spec[k + 1]);
    };
    const snap = () => { slow.getFloatFrequencyData(sBins); return Float32Array.from(sBins, lin); };
    
    function readPitch(at, before) {
      const after = snap(), add = new Float32Array(after.length);
      for (let k = 0; k < add.length; k++) add[k] = Math.max(0, after[k] - before[k]);
      const f0s = cands.map((m) => peak(add, hz(m))), top = Math.max(...f0s, 1e-12);
      const score = cands.map((m, i) => {
        let s = 0;
        for (let h = 1; h <= W.length; h++) s += W[h - 1] * peak(add, hz(m) * h);
        return f0s[i] > 0.15 * top ? s : s * 0.3;          
      });
      let b = 0;
      for (let i = 1; i < score.length; i++) if (score[i] > score[b]) b = i;
      if (score[b] < 1e-6) return;
      const t = +((at - t0) / 1000).toFixed(3);
      heard.push([t, cands[b]]);
      if (opts.onNote) try { opts.onNote([t, cands[b]]); } catch {   }
      let b2 = -1;
      for (let i = 0; i < score.length; i++) {
        const iv = Math.abs(cands[i] - cands[b]);
        if (i === b || iv === 12 || iv === 19 || iv === 24 || iv <= 2) continue;   
        if (score[i] >= 0.75 * score[b] && (b2 < 0 || score[i] > score[b2])) b2 = i;
      }
      if (b2 >= 0) heard.push([t, cands[b2]]);
      lastHeard = performance.now();
    }
    function tick() {
      if (stopped) return;
      fast.getFloatFrequencyData(fBins);
      let flux = 0, energy = 0;
      for (let k = 2; k < 220; k++) {
        const v = lin(fBins[k]), c = Math.log1p(1000 * v);
        energy += v * v;
        if (primed) flux += Math.max(0, c - prevF[k]);
        prevF[k] = c;
      }
      primed = true;
      if (opts.onLevel) try { opts.onLevel(Math.min(1, Math.sqrt(energy) * 12)); } catch {   }
      const prev3 = fluxes.slice(-3);
      fluxes.push(flux);
      if (fluxes.length > 50) fluxes.shift();
      const sorted = [...fluxes].sort((x, y) => x - y), floor = sorted[sorted.length >> 1] || 0;
      const now = performance.now();
      if (fluxes.length > 4 && flux > floor * 2 + 0.5 && flux >= Math.max(...prev3) && now - lastOnset > 90) {
        lastOnset = now;
        const before = snap();
        setTimeout(() => { if (!stopped) readPitch(now, before); }, 90);
      }
      const el = (now - t0) / 1000;
      if (el > maxS || heard.length >= pitches.length + 4 || (heard.length && now - lastHeard > 2500 && heard.length >= Math.ceil(pitches.length * 0.5))) stop();
    }
    timer = setInterval(tick, 11);
    async function stop() {
      if (stopped) return done;
      stopped = true;
      clearInterval(timer);
      try { stream.getTracks().forEach((tr) => tr.stop()); } catch {   }
      try { await ctx.close(); } catch {   }
      finish(judge(expect, opts.focus, heard));
      return done;
    }
    return { stop, done };
  }

  window.MVListen = { start, _judge: judge, _align: align };
})();
