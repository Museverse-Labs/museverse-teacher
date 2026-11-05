











(() => {
  'use strict';
  const N = 72, HOLD_S = 0.12;
  const cache = new WeakMap();          

  function gapOf(T) {
    if (T.length < 2) return 0.5;
    const d = [];
    for (let k = 1; k < Math.min(T.length, 50); k++) d.push(T[k] - T[k - 1]);
    d.sort((a, b) => a - b);
    return Math.max(0.3, 1.5 * d[d.length >> 1]);
  }
  
  function resample(pts) {
    const P = pts.filter((p) => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])).map((p) => [+p[0], +p[1]]);
    if (P.length < 3) return null;
    let area = 0;
    for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) P.reverse();
    const seg = [], n = P.length;
    let total = 0;
    for (let k = 0; k < n; k++) { const a = P[k], b = P[(k + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(l); total += l; }
    if (!(total > 0)) return null;
    const out = new Float64Array(N * 2);
    let k = 0, acc = 0;
    for (let j = 0; j < N; j++) {
      const want = (j / N) * total;
      while (k < n - 1 && acc + seg[k] < want) { acc += seg[k]; k++; }
      const a = P[k], b = P[(k + 1) % n], f = seg[k] ? (want - acc) / seg[k] : 0;
      out[2 * j] = a[0] + (b[0] - a[0]) * f;
      out[2 * j + 1] = a[1] + (b[1] - a[1]) * f;
    }
    return out;
  }
  function sampled(res, i, lab) {
    let m = cache.get(res);
    if (!m) { m = new Map(); cache.set(res, m); }
    const key = `${i}${lab}`;
    if (m.has(key)) return m.get(key);
    const h = res.hands && res.hands[i] && res.hands[i][lab];
    const v = h && Array.isArray(h.poly) ? resample(h.poly) : null;
    m.set(key, v);
    return v;
  }
  
  function morph(a, b, f) {
    let best = 0, bestD = Infinity;
    for (let s = 0; s < N; s++) {
      let d = 0;
      for (let j = 0; j < N; j++) {
        const q = (j + s) % N, dx = a[2 * j] - b[2 * q], dy = a[2 * j + 1] - b[2 * q + 1];
        d += dx * dx + dy * dy;
        if (d >= bestD) break;
      }
      if (d < bestD) { bestD = d; best = s; }
    }
    const out = [];
    for (let j = 0; j < N; j++) {
      const q = (j + best) % N;
      out.push([a[2 * j] + (b[2 * q] - a[2 * j]) * f, a[2 * j + 1] + (b[2 * q + 1] - a[2 * j + 1]) * f]);
    }
    return out;
  }
  const asPts = (v) => { const out = []; for (let j = 0; j < N; j++) out.push([v[2 * j], v[2 * j + 1]]); return out; };

  function at(res, t) {
    const T = (res && res.media && res.media.frameTimes) || [];
    const none = { keyboard: null, hands: { L: null, R: null }, i: -1, near: false };
    if (!T.length || !Number.isFinite(t)) return none;
    
    let lo = 0, hi = T.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] < t) lo = m + 1; else hi = m; }
    const b = lo, a = T[b] > t && b > 0 ? b - 1 : b;
    const nearest = Math.abs(T[a] - t) <= Math.abs(T[b] - t) ? a : b;
    if (Math.abs(T[nearest] - t) > gapOf(T)) return none;
    const span = T[b] - T[a], f = a !== b && span > 0 ? Math.min(1, Math.max(0, (t - T[a]) / span)) : 0;
    const out = { keyboard: null, hands: { L: null, R: null }, i: nearest, near: true };
    
    const ka = res.keyboard && res.keyboard.outline ? res.keyboard.outline[a] : null;
    const kb = res.keyboard && res.keyboard.outline ? res.keyboard.outline[b] : null;
    if (ka && kb && ka.length === kb.length && a !== b) out.keyboard = ka.map((p, k) => [p[0] + (kb[k][0] - p[0]) * f, p[1] + (kb[k][1] - p[1]) * f]);
    else out.keyboard = (nearest === a ? ka : kb) || null;
    for (const lab of ['L', 'R']) {
      const ha = res.hands && res.hands[a] && res.hands[a][lab], hb = res.hands && res.hands[b] && res.hands[b][lab];
      const pa = ha ? sampled(res, a, lab) : null, pb = hb ? sampled(res, b, lab) : null;
      if (pa && pb && a !== b) out.hands[lab] = { poly: morph(pa, pb, f), raised: !!(f < 0.5 ? ha.raised : hb.raised) };
      else if (pa && t - T[a] <= HOLD_S) out.hands[lab] = { poly: asPts(pa), raised: !!ha.raised };
      else if (pb && T[b] - t <= HOLD_S) out.hands[lab] = { poly: asPts(pb), raised: !!hb.raised };
    }
    return out;
  }

  function follow(video, draw) {
    let on = true, id = 0;
    if (typeof video.requestVideoFrameCallback === 'function') {
      const tick = (now, md) => {
        if (!on) return;
        try { draw(md && Number.isFinite(md.mediaTime) ? md.mediaTime : video.currentTime); } catch (e) { console.warn('MVOutlines:', e); }
        id = video.requestVideoFrameCallback(tick);
      };
      id = video.requestVideoFrameCallback(tick);
      return () => { on = false; try { video.cancelVideoFrameCallback(id); } catch {   } };
    }
    const tick = () => {
      if (!on) return;
      try { draw(video.currentTime); } catch (e) { console.warn('MVOutlines:', e); }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => { on = false; cancelAnimationFrame(id); };
  }

  window.MVOutlines = { at, follow, _resample: resample, _morph: morph };
})();
