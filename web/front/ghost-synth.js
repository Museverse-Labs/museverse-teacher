




















(() => {
  'use strict';
  const FPS = 30, W = 23.5;
  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  const BLACK_U = { 1: 0.9, 3: 2.1, 6: 4 - 1 / 7, 8: 5, 10: 6 + 1 / 7 };
  const pcOf = (m) => ((m % 12) + 12) % 12;
  const isBlack = (m) => !WHITE_PCS.includes(pcOf(m));
  const keyU = (m) => { const o = Math.floor((m - 60) / 12), pc = pcOf(m); return WHITE_PCS.includes(pc) ? o * 7 + WHITE_PCS.indexOf(pc) : o * 7 + BLACK_U[pc] - 0.5; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const lerp = (a, b, k) => a + (b - a) * k;

  
  
  
  const TPL = {
    wrist: [6, -94, -2], palm: [1, -30, -3],
    thumbBase: [-24, -61, -13], thumbKnuckle: [-45, -39, -23],
    base: { 2: [-14, -59, -7], 3: [2, -60, -6], 4: [20, -59, -5], 5: [28, -59, -9] },
    knuckle: { 2: [-22, -1, -4], 3: [0, 0, 0], 4: [19, -5, -5], 5: [37, -14, -13] },
  };
  const SEG = { 2: [38, 24, 21], 3: [42, 27, 22], 4: [38, 25, 22], 5: [29, 20, 20] };
  const THUMB_SEG = [34, 25];
  const KNUCKLE_AT = { depth: -58, height: 55 };     
  const REST = { 1: -45, 2: -6, 3: 2, 4: -6, 5: -26 };   
  const BLACK_DEPTH = { 1: 4, 2: 18, 3: 20, 4: 18, 5: 10 }; 
  const HOVER = 11, LIFT = 24, DOWN = -7, BLACK_UP = 12;
  const APPROACH_S = 0.17, PEAK_S = 0.09, RELEASE_S = 0.1, PRESS_S = 0.03;

  
  function chain(L, a, b) {
    const t1 = a, t2 = a + b, t3 = a + b + 0.75 * b;
    const out = [[L[0] * Math.cos(t1), -L[0] * Math.sin(t1)]];
    out.push([out[0][0] + L[1] * Math.cos(t2), out[0][1] - L[1] * Math.sin(t2)]);
    if (L.length > 2) out.push([out[1][0] + L[2] * Math.cos(t3), out[1][1] - L[2] * Math.sin(t3)]);
    return out;
  }
  
  function solve(L, s, z, warm) {
    let a = warm ? warm[0] : 0.4, b = warm ? warm[1] : 0.8;
    const lam = 4;
    for (let it = 0; it < 12; it++) {
      const p = chain(L, a, b), tip = p[p.length - 1];
      const ex = s - tip[0], ez = z - tip[1];
      if (ex * ex + ez * ez < 0.04) break;
      const h = 1e-3;
      const pa = chain(L, a + h, b), pb = chain(L, a, b + h);
      const ta = pa[pa.length - 1], tb = pb[pb.length - 1];
      const j11 = (ta[0] - tip[0]) / h, j21 = (ta[1] - tip[1]) / h, j12 = (tb[0] - tip[0]) / h, j22 = (tb[1] - tip[1]) / h;
      
      const m11 = j11 * j11 + j21 * j21 + lam, m12 = j11 * j12 + j21 * j22, m22 = j12 * j12 + j22 * j22 + lam;
      const r1 = j11 * ex + j21 * ez, r2 = j12 * ex + j22 * ez, det = m11 * m22 - m12 * m12;
      if (Math.abs(det) < 1e-9) break;
      a = clamp(a + (m22 * r1 - m12 * r2) / det, -0.35, 1.3);
      b = clamp(b + (m11 * r2 - m12 * r1) / det, L.length > 2 ? 0.12 : 0.02, L.length > 2 ? 1.75 : 1.25);
    }
    return [a, b];
  }
  
  function place(M, L, ab, T) {
    const dx = T[0] - M[0], dd = T[1] - M[1], sH = Math.hypot(dx, dd) || 1e-6;
    const ux = dx / sH, ud = dd / sH;
    return chain(L, ab[0], ab[1]).map(([f, dz]) => [M[0] + ux * f, M[1] + ud * f, M[2] + dz]);
  }

  
  function planHand(rows, lab) {
    const d = lab === 'L' ? -1 : 1;
    const notes = rows.filter((r) => r.hand === lab).sort((a, b) => a.on - b.on || a.m - b.m);
    if (!notes.length) return null;
    
    const events = [];
    for (const n of notes) {
      const a = keyU(n.m) - d * (n.f - 1);
      const last = events[events.length - 1];
      if (last && n.on - last.t < 0.035) { last.sum += a; last.k += 1; last.a = last.sum / last.k; }
      else events.push({ t: n.on, a, sum: a, k: 1 });
    }
    return { d, notes, events };
  }
  function placeAt(P, t) {
    const ev = P.events;
    if (t <= ev[0].t) return ev[0].a;
    for (let i = 0; i < ev.length - 1; i++) {
      const A = ev[i], B = ev[i + 1];
      if (t >= B.t) continue;
      const move = Math.min(0.24, (B.t - A.t) * 0.75);
      const s = B.t - 0.03 - move;
      return lerp(A.a, B.a, smooth((t - s) / move));
    }
    return ev[ev.length - 1].a;
  }
  
  function tipAt(P, f, t, handPlace) {
    const d = P.d;
    const restX = (handPlace + d * (f - 1)) * W;
    let x = restX, dep = REST[f], h = HOVER;
    let best = null;
    for (const n of P.notes) {
      if (n.f !== f) continue;
      if (t >= n.on - APPROACH_S && t <= n.off + RELEASE_S) { if (!best || n.on > best.on) best = n; }
    }
    if (!best) return [x, dep, h];
    const n = best, kx = keyU(n.m) * W, black = isBlack(n.m);
    const kd = black ? BLACK_DEPTH[f] : REST[f], up = black ? BLACK_UP : 0;
    if (t < n.on) {                                  
      const k = smooth((t - (n.on - APPROACH_S)) / (APPROACH_S - 0.04));
      x = lerp(restX, kx, k); dep = lerp(REST[f], kd, k);
      const peakT = n.on - PEAK_S;
      h = t < peakT ? lerp(HOVER, LIFT + up, smooth((t - (n.on - APPROACH_S)) / (APPROACH_S - PEAK_S)))
        : lerp(LIFT + up, up, smooth((t - peakT) / PEAK_S));
    } else if (t <= n.off) {                         
      x = kx; dep = kd;
      h = lerp(up, up + DOWN, smooth((t - n.on) / PRESS_S));
    } else {                                         
      const k = smooth((t - n.off) / RELEASE_S);
      x = lerp(kx, restX, k); dep = lerp(kd, REST[f], k); h = lerp(up + DOWN, HOVER, k);
    }
    return [x, dep, h];
  }

  function take(input, opts = {}) {
    const rate = Number.isFinite(+opts.rate) && +opts.rate > 0.1 ? +opts.rate : 1;
    const rows = (Array.isArray(input) ? input : []).filter((r) => Array.isArray(r) && Number.isFinite(+r[0]) && Number.isFinite(+r[2]))
      .map((r) => ({ on: +r[0] / rate, off: Math.max(+r[0] + 0.12, Number.isFinite(+r[1]) ? +r[1] : +r[0] + 0.3) / rate, m: +r[2],
        v: +r[3] || 72, hand: r[4] === 'L' ? 'L' : 'R', f: clamp(Math.round(+r[5]) || 3, 1, 5) }))
      .sort((a, b) => a.on - b.on || a.m - b.m);
    const lastOff = rows.reduce((a, r) => Math.max(a, r.off), 0);
    const dur = lastOff + 1.2;
    const frames = Math.max(1, Math.ceil(dur * FPS));
    const buf = new ArrayBuffer(frames * 168 * 2), view = new DataView(buf);
    const plans = { L: planHand(rows, 'L'), R: planHand(rows, 'R') };
    const warm = { L: {}, R: {} };
    let fwd = { L: 0, R: 0 };
    const put = (fi, hi, k, val) => view.setInt16((fi * 168 + hi * 84 + k) * 2, clamp(Math.round(val), -32768, 32767), true);
    for (let fi = 0; fi < frames; fi++) {
      const t = fi / FPS;
      ['L', 'R'].forEach((lab, hi) => {
        const P = plans[lab];
        if (!P) return;                               
        const d = P.d, a = placeAt(P, t);
        
        const near = P.notes.filter((n) => n.on - 0.3 <= t && t <= n.off + 0.1);
        const want = near.length ? 18 * near.filter((n) => isBlack(n.m)).length / near.length : 0;
        fwd[lab] += (want - fwd[lab]) * Math.min(1, 1 / (FPS * 0.12));
        const ox = (a + d * 2) * W, od = KNUCKLE_AT.depth + fwd[lab], oh = KNUCKLE_AT.height;
        const at = (p) => [ox + d * p[0], od + p[1], oh + p[2]];
        const J = new Array(26);
        J[0] = at(TPL.wrist); J[1] = at(TPL.palm);
        
        const tip1 = tipAt(P, 1, t, a);
        const restTip1 = [(a) * W, REST[1], HOVER];
        const pull = [(tip1[0] - restTip1[0]) * 0.35, (tip1[1] - restTip1[1]) * 0.3, 0];
        J[2] = at(TPL.thumbBase);
        const k1 = at(TPL.thumbKnuckle);
        J[3] = [k1[0] + pull[0], k1[1] + pull[1], k1[2]];
        {
          const T = tip1, dx = T[0] - J[3][0], dd = T[1] - J[3][1];
          const ab = solve(THUMB_SEG, Math.hypot(dx, dd), T[2] - J[3][2], warm[lab][1]);
          warm[lab][1] = ab;
          const pts = place(J[3], THUMB_SEG, ab, T);
          J[4] = pts[0]; J[5] = pts[1];
        }
        for (let f = 2; f <= 5; f++) {
          const b0 = 6 + (f - 2) * 5;
          J[b0] = at(TPL.base[f]);
          const M = at(TPL.knuckle[f]);
          J[b0 + 1] = M;
          const T = tipAt(P, f, t, a);
          const dx = T[0] - M[0], dd = T[1] - M[1];
          const ab = solve(SEG[f], Math.hypot(dx, dd), T[2] - M[2], warm[lab][f]);
          warm[lab][f] = ab;
          const pts = place(M, SEG[f], ab, T);
          J[b0 + 2] = pts[0]; J[b0 + 3] = pts[1]; J[b0 + 4] = pts[2];
        }
        put(fi, hi, 0, 1);
        for (let j = 0; j < 26; j++) {
          put(fi, hi, 1 + j * 3, (J[j][0] / W) * 200);
          put(fi, hi, 2 + j * 3, J[j][1] * 10);
          put(fi, hi, 3 + j * 3, J[j][2] * 10);
        }
        const kn = [7, 12, 17, 22].reduce((s, j) => s + J[j][2], 0) / 4;
        put(fi, hi, 79, (J[0][2] - kn) * 10);       
        put(fi, hi, 80, 0);                          
        put(fi, hi, 81, J[25][2] * 10);             
        put(fi, hi, 82, Math.abs(J[25][0] - J[5][0]) * 10);
        put(fi, hi, 83, 0);                          
      });
    }
    const ms = rows.map((r) => r.m);
    const notes = rows.map((r) => [+r.on.toFixed(3), +r.off.toFixed(3), r.m, r.v, r.hand]);
    const result = {
      stage: { fps: FPS, t0: 0, frames, durationS: +dur.toFixed(3), hands: 'ghost.bin', whitePitchMm: W,
        keyRange: ms.length ? [Math.min(...ms) - 3, Math.max(...ms) + 3] : [55, 79] },
      notes, phrases: [], findings: [],
      reference: { digits: rows.map((r, i) => [i, r.hand, r.f, opts.fingers === 'course' || opts.fingers === 'piece' ? opts.fingers : 'suggested']) },
    };
    return { result, media: { 'ghost.bin': buf }, frames, durationS: dur };
  }

  window.MVGhostSynth = { take, _keyU: keyU };
})();
