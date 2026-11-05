



























































































(() => {
  'use strict';
  const MIN_SHARE = 0.8, MAX_HOLD_S = 0.25, NEAR_MM = 20, FAR_MM = 6000, VIEW_Y_MM = 20;
  
  
  
  const PLATE_REACH_WHITE = 2;
  const COL = { target: '#34D399', wrong: '#F87171', sounding: '#C084FC', R: '#F3F4F6', L: '#F3F4F6' };   
  
  const LOOK = { ink: '#1A1918', fg: '#F3F4F6', font: '"Wix Madefor Display", system-ui, sans-serif',
    ring: { R: '#9CA3AF', L: '#9CA3AF', target: '#7E22CE', wrong: '#BE185D' },
    discR: 32 / 1080, tagPx: 40 / 1080, neonPx: 6 / 1080, glowPx: 30 / 1080, glyphPx: 44 / 1080 };
  
  
  
  
  const NEON = { sounding: ['#E9D5FF', '#C084FC', 'rgba(192, 132, 252, 0.16)'], target: ['#A7F3D0', '#34D399', 'rgba(52, 211, 153, 0.34)'],
    wrong: ['#FCA5A5', '#F87171', 'rgba(248, 113, 113, 0.36)'] };
  const MAX_LABEL = 12;
  const VEL = 72, LEAD_S = { reference: 0.3, take: 0.12 }, LATE_S = 0.1;
  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  const BLACK_U = { 1: 0.9, 3: 2.1, 6: 4 - 1 / 7, 8: 5, 10: 6 + 1 / 7 };
  const pcOf = (m) => ((m % 12) + 12) % 12;
  const isBlack = (m) => !WHITE_PCS.includes(pcOf(m));
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  

  
  function keyMm(m, white = 23.5) {
    const o = Math.floor((m - 60) / 12), pc = pcOf(m);
    const u = WHITE_PCS.includes(pc) ? o * 7 + WHITE_PCS.indexOf(pc) : o * 7 + BLACK_U[pc] - 0.5;
    return (u + 0.5) * white;
  }
  function quat(R) {                                     
    const w = Math.sqrt(Math.max(0, 1 + R[0] + R[4] + R[8])) / 2;
    const x = Math.sign(R[7] - R[5] || 1) * Math.sqrt(Math.max(0, 1 + R[0] - R[4] - R[8])) / 2;
    const y = Math.sign(R[2] - R[6] || 1) * Math.sqrt(Math.max(0, 1 - R[0] + R[4] - R[8])) / 2;
    const z = Math.sign(R[3] - R[1] || 1) * Math.sqrt(Math.max(0, 1 - R[0] - R[4] + R[8])) / 2;
    const l = Math.hypot(w, x, y, z) || 1;
    return [w / l, x / l, y / l, z / l];
  }
  function mat(q) {
    const [w, x, y, z] = q;
    return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
  }
  function slerp(a, b, w) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) { b = b.map((v) => -v); d = -d; }
    if (d > 0.9995) { const q = a.map((v, i) => v + (b[i] - v) * w), l = Math.hypot(...q); return q.map((v) => v / l); }
    const th = Math.acos(Math.min(1, d)), s = Math.sin(th);
    return a.map((v, i) => (Math.sin((1 - w) * th) * v + Math.sin(w * th) * b[i]) / s);
  }
  const rt = (T) => ({ R: [T[0], T[1], T[2], T[4], T[5], T[6], T[8], T[9], T[10]], t: [T[3], T[7], T[11]] });
  
  function poseAt(cam, t) {
    const F = cam.frames;
    let i = -1, j = -1;
    let lo = 0, hi = F.length;                           
    while (lo < hi) { const k = (lo + hi) >> 1; const tk = frameT(cam, k); if (tk <= t) lo = k + 1; else hi = k; }
    for (let k = lo - 1; k >= 0; k--) if (F[k]) { i = k; break; }
    for (let k = lo; k < F.length; k++) if (F[k]) { j = k; break; }
    if (i >= 0 && j === i + 1) {
      const A = rt(F[i].T), B = rt(F[j].T), w = (t - F[i].t) / (F[j].t - F[i].t);
      return { R: mat(slerp(quat(A.R), quat(B.R), w)), t: A.t.map((v, k) => v + (B.t[k] - v) * w) };
    }
    const c = [i, j].filter((k) => k >= 0).sort((a, b) => Math.abs(F[a].t - t) - Math.abs(F[b].t - t))[0];
    return c != null && Math.abs(F[c].t - t) <= MAX_HOLD_S ? rt(F[c].T) : null;
  }
  
  function frameT(cam, k) {
    const f = cam.frames[k];
    if (f) return f.t;
    if (!cam._times) {
      const ts = cam.frames.map((x) => (x ? x.t : NaN));
      for (let a = 0; a < ts.length; a++) {
        if (Number.isFinite(ts[a])) continue;
        let p = a - 1, n = a + 1;
        while (n < ts.length && !Number.isFinite(ts[n])) n++;
        ts[a] = p >= 0 && n < ts.length ? ts[p] + ((ts[n] - ts[p]) * (a - p)) / (n - p) : p >= 0 ? ts[p] + 1e-3 * (a - p) : n < ts.length ? ts[n] - 1e-3 * (n - a) : a;
      }
      Object.defineProperty(cam, '_times', { value: ts, enumerable: false });
    }
    return cam._times[k];
  }
  
  function stageToClip(keys, shiftMm, whiteMm = 23.5) {
    const o = keys.origin, yaw = (keys.yawDeg * Math.PI) / 180, c = Math.cos(yaw), s = Math.sin(yaw);
    const qpitch = (keys.keys[72 - 21][0] - keys.keys[60 - 21][0]) / 7, sx = whiteMm / qpitch;
    
    const A = [sx * c, 0, -sx * s, -s, 0, -c, 0, 1, 0];  
    const b = [keyMm(60, whiteMm) - shiftMm, 0, 0];
    const tx = b[0] - (A[0] * o[0] + A[1] * o[1] + A[2] * o[2]);
    const ty = b[1] - (A[3] * o[0] + A[4] * o[1] + A[5] * o[2]);
    const tz = b[2] - (A[6] * o[0] + A[7] * o[1] + A[8] * o[2]);
    return [A[0], A[3], A[6], 0, A[1], A[4], A[7], 0, A[2], A[5], A[8], 0, tx, ty, tz, 1];
  }
  function mul(a, b) {                                   
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  
  function viewMatrix(pose, S) {
    const R = pose.R, t = pose.t;
    const cv = [R[0], R[3], R[6], 0, R[1], R[4], R[7], 0, R[2], R[5], R[8], 0, t[0], t[1], t[2], 1];
    const F = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
    return mul(F, mul(cv, S));
  }
  
  function projMatrix(K, size, rect, ew, eh, near = NEAR_MM, far = FAR_MM) {
    const sx = rect.w / size[0], sy = rect.h / size[1];
    const fx = K.fx * sx, fy = K.fy * sy, cx = rect.x + (K.cx + 0.5) * sx, cy = rect.y + (K.cy + 0.5) * sy;
    const P = new Array(16).fill(0);
    P[0] = (2 * fx) / ew; P[8] = 1 - (2 * cx) / ew;
    P[5] = (2 * fy) / eh; P[9] = (2 * cy) / eh - 1;
    P[10] = -(far + near) / (far - near); P[14] = (-2 * far * near) / (far - near);
    P[11] = -1;
    return P;
  }
  
  function toOriginal(lens, x, y) {
    const lam = +lens.lambda || 0, cx = +lens.cx, cy = +lens.cy, z = +lens.zoom || 1, norm = +lens.norm || 1;
    const qx = (x - cx) / z, qy = (y - cy) / z;
    if (!lam) return [cx + qx, cy + qy];
    const ru = Math.hypot(qx, qy) / norm, disc = 1 - 4 * lam * ru * ru;
    if (!(disc >= 0)) return null;
    let rd = ru > 1e-12 ? (2 * ru) / (1 + Math.sqrt(disc)) : ru;
    for (let k = 0; k < 2; k++) { const den = 1 + lam * rd * rd; rd -= (rd / den - ru) / ((1 - lam * rd * rd) / (den * den)); }
    const s = ru > 1e-12 ? rd / ru : 1;
    return [cx + qx * s, cy + qy * s];
  }
  
  function project(cam, pose, X) {
    const R = pose.R, t = pose.t;
    const x = R[0] * X[0] + R[1] * X[1] + R[2] * X[2] + t[0], y = R[3] * X[0] + R[4] * X[1] + R[5] * X[2] + t[1];
    const z = R[6] * X[0] + R[7] * X[1] + R[8] * X[2] + t[2];
    if (!(z > 1)) return null;
    return toOriginal(cam.lens || {}, (cam.K.fx * x) / z + cam.K.cx, (cam.K.fy * y) / z + cam.K.cy);
  }
  
  
  function contentRect(ew, eh, vw, vh, fit, pos) {
    if (!(vw > 0 && vh > 0) || fit === 'fill') return { x: 0, y: 0, w: ew, h: eh };
    const s = fit === 'cover' ? Math.max(ew / vw, eh / vh) : fit === 'none' ? 1 : Math.min(ew / vw, eh / vh);
    const w = vw * s, h = vh * s;
    const [px, py] = String(pos || '').trim().split(/\s+/);
    const at = (tok, free) => {
      const v = parseFloat(tok);
      if (!fin(v)) return free / 2;
      return /%$/.test(tok) ? (free * v) / 100 : /px$/.test(tok) ? v : free / 2;
    };
    return { x: at(px, ew - w), y: at(py, eh - h), w, h };
  }

  

  
  
  function projectPlate(plate, pose, X) {
    const R = pose.R, t = pose.t, K = plate.K;
    const x = R[0] * X[0] + R[1] * X[1] + R[2] * X[2] + t[0], y = R[3] * X[0] + R[4] * X[1] + R[5] * X[2] + t[1];
    const z = R[6] * X[0] + R[7] * X[1] + R[8] * X[2] + t[2];
    return z > 1 ? [(K.fx * x) / z + K.cx, (K.fy * y) / z + K.cy] : null;
  }
  const plateWhite = (plate) => (plate.layout && fin(plate.layout.whiteWidth) ? plate.layout.whiteWidth : 23.5);
  
  
  function plateWindow(plate, lo, hi) {
    const W = plateWhite(plate), L = (plate.layout && plate.layout.whiteLength) || 150, P = rt(plate.T);
    const x0 = keyMm(lo, W) - 2.5 * W, x1 = keyMm(hi, W) + 2.5 * W;
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const x of [x0, (x0 + x1) / 2, x1]) for (const y of [-30, L]) for (const z of [0, 110]) {
      const p = projectPlate(plate, P, [x, y, z]);
      if (!p) continue;
      u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]);
    }
    if (!Number.isFinite(u0)) return { x: 0, y: 0, w: plate.w, h: plate.h };
    const pad = 0.08 * Math.max(u1 - u0, v1 - v0);
    u0 = Math.max(0, u0 - pad); v0 = Math.max(0, v0 - pad); u1 = Math.min(plate.w, u1 + pad); v1 = Math.min(plate.h, v1 + pad);
    return { x: u0, y: v0, w: Math.max(8, u1 - u0), h: Math.max(8, v1 - v0) };
  }
  
  
  function fitWindow(win, plate, ew, eh) {
    const want = ew / eh;
    let { x, y, w, h } = win;
    if (w / h < want) { const w2 = Math.min(plate.w, h * want); x = Math.min(Math.max(0, x + w / 2 - w2 / 2), plate.w - w2); w = w2; }
    else { const h2 = Math.min(plate.h, w / want); y = Math.min(Math.max(0, y + h / 2 - h2 / 2), plate.h - h2); h = h2; }
    return { x, y, w, h };
  }
  
  function plateRect(win, plate, ew, eh) {
    const sc = Math.min(ew / win.w, eh / win.h), ox = (ew - win.w * sc) / 2, oy = (eh - win.h * sc) / 2;
    return { x: ox - win.x * sc, y: oy - win.y * sc, w: plate.w * sc, h: plate.h * sc };
  }
  
  
  
  
  
  
  
  const PLATE_FACE_MM = 40, PLATE_BACK_GAP_MM = 5, PLATE_BACK_MM = 60;
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  }
  function plateArea(plate) {
    const W = plateWhite(plate), L = plate.layout && fin(plate.layout.whiteLength) ? plate.layout.whiteLength : 150, P = rt(plate.T);
    const kk = Array.isArray(plate.keys) && plate.keys.length === 2 && plate.keys.every(fin) ? plate.keys : [60, 72];
    const mid = (keyMm(kk[0], W) + keyMm(kk[1], W)) / 2;
    let x0 = keyMm(21, W) - 1.5 * W, x1 = keyMm(108, W) + 1.5 * W;
    for (let k = 0; k < 12; k++) {
      const pts = [];
      for (const x of [x0, x1]) for (const [y, z] of [[0, -PLATE_FACE_MM], [0, 0], [L, 0], [L + PLATE_BACK_GAP_MM, 0], [L + PLATE_BACK_GAP_MM, PLATE_BACK_MM]]) {
        pts.push(projectPlate(plate, P, [x, y, z]));
      }
      if (pts.every(Boolean)) return hull(pts);
      x0 = mid + (x0 - mid) / 2; x1 = mid + (x1 - mid) / 2;
    }
    return null;
  }
  
  function plateOk(p) {
    const k = p && p.K, q = (p && p.quality) || {};
    return !!(p && typeof p.src === 'string' && /^(data:image\/(jpeg|png|webp);base64,|https?:|\/)/.test(p.src) && p.w > 0 && p.h > 0
      && k && [k.fx, k.fy, k.cx, k.cy].every(fin) && Array.isArray(p.T) && p.T.length === 16 && p.T.every(fin)
      && !(fin(q.filled) && q.filled < 0.9) && !(fin(q.edgePx) && Math.abs(q.edgePx) > 2)
      && !(p.octave && p.octave.source === 'unknown'));
  }
  
  
  
  function plateSees(p, lo, hi) {
    const P = rt(p.T), W = plateWhite(p);
    return [[lo, 0], [hi, 0], [lo, -PLATE_REACH_WHITE * W], [hi, PLATE_REACH_WHITE * W]].every(([m, dx]) => {
      const q = projectPlate(p, P, [keyMm(m, W) + dx, VIEW_Y_MM, isBlack(m) && !dx ? 12 : 0]);
      return q && q[0] >= 0 && q[0] <= p.w && q[1] >= 0 && q[1] <= p.h;
    });
  }
  
  
  function plateFor(plates, keyRange, span) {
    const [lo, hi] = keyRange;
    const ok = (Array.isArray(plates) ? plates : []).filter((p) => plateOk(p) && plateSees(p, lo, hi));
    if (!ok.length) return null;
    const [a, b] = span && span.every(fin) ? span : [-Infinity, Infinity];
    const far = (p) => (!fin(+p.t) ? Infinity : +p.t < a ? a - p.t : +p.t > b ? p.t - b : 0);
    const mid = Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : 0;
    return ok.slice().sort((p, q) => far(p) - far(q) || Math.abs(+p.t - mid) - Math.abs(+q.t - mid))[0];
  }

  

  
  
  
  function learnerOctave(result, fromS, toS) {
    const rows = (((result || {}).analysis || {}).noteRows || []).filter((r) => r && fin(+r.t) && +r.t >= fromS - 0.05 && +r.t <= toS + 0.05
      && r.octaveShift != null && fin(+r.octaveShift) && (r.verdict === 'matched' || r.verdict === 'wrong'));
    if (!rows.length) return null;
    const n = new Map();
    for (const r of rows) n.set(+r.octaveShift, (n.get(+r.octaveShift) || 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || Math.abs(b[0]) - Math.abs(a[0]))[0][0];
  }
  
  
  function stillFrames(result, cam, fromS = -Infinity, toS = Infinity) {
    const H = (result && result.hands) || [], out = [];
    (cam && cam.frames ? cam.frames : []).forEach((f, i) => {
      if (!f || f.t < fromS || f.t > toS) return;
      const h = H[i];
      if (h && (h.L || h.R)) return;
      out.push({ t: f.t });
    });
    return out;
  }

  
  function footageGate(cam, g, a, b) {
    const out = { poseShare: 0, inView: 0, why: [] };
    const shift = cam && fin(cam.shiftMm) ? cam.shiftMm : null;
    if (!cam || !Array.isArray(cam.frames) || !cam.K || !Array.isArray(cam.size)) { out.why.push('no camera for this take'); return out; }
    const inSpan = cam.frames.map((f, k) => [f, frameT(cam, k)]).filter(([, t]) => t >= a && t <= b);
    if (!inSpan.length) out.why.push('the take does not show these bars');
    const posed = inSpan.filter(([f]) => f);
    out.poseShare = inSpan.length ? posed.length / inSpan.length : 0;
    if (out.poseShare < MIN_SHARE) out.why.push('the keyboard is not held in enough of these frames');
    if (shift != null && posed.length) {
      const [lo, hi] = g.keyRange, W = cam.size[0], H = cam.size[1];
      let seen = 0;
      for (const [f] of posed) {
        const P = rt(f.T), ok = [lo, hi].every((m) => {
          const p = project(cam, P, [keyMm(m, cam.whiteMm || 23.5) - shift, VIEW_Y_MM, isBlack(m) ? 12 : 0]);
          return p && p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H;
        });
        if (ok) seen++;
      }
      out.inView = seen / posed.length;
    }
    if (out.inView < MIN_SHARE) out.why.push("the part's keys are not all in the picture");
    return out;
  }

  
  function gateOf(cam, g, opts) {
    const out = { ok: false, plate: null, poseShare: 0, inView: 0, footage: false, octaveSettled: false, learnerOctave: null,
      keys: !!g.keys, span: null, why: [] };
    const both = [];                                     
    if (!g.clocksKnown) both.push('the take is not lined up with the performance (no toLearner)');
    const a = g.learnerAt(g.refT0), b = g.learnerAt(g.refEnd);
    out.span = [a, b];
    const lo = opts.learnerOctave !== undefined ? opts.learnerOctave : opts.result ? learnerOctave(opts.result, a, b) : null;
    out.learnerOctave = lo === null || lo === undefined ? null : +lo;
    if (out.learnerOctave !== 0) both.push(out.learnerOctave == null ? 'not known which octave the learner played' : 'the learner played these bars in another octave');
    if (!g.keys) both.push("the performance does not sit on Quest's keys");
    
    const camShift = cam && fin(cam.shiftMm) ? cam.shiftMm : null;
    const camSettled = !!(cam && cam.octave && cam.octave.settled && camShift != null);
    const fg = footageGate(cam, g, a, b);
    out.poseShare = fg.poseShare; out.inView = fg.inView;
    out.footage = !fg.why.length && camSettled && !both.length;
    
    const plates = Array.isArray(opts.plates) ? opts.plates : ((((opts.result || {}).keyboard) || {}).plates || null);
    const pl = plateFor(plates, g.keyRange, out.span);
    const why = [];
    if (!pl) {
      why.push(!(Array.isArray(plates) && plates.length) ? "no still of the learner's keyboard for this take"
        : plates.some(plateOk) ? "no still of the learner's keyboard shows all of the part's keys" : "no still of the learner's keyboard is good enough");
    }
    const plShift = pl && pl.octave && fin(pl.octave.shiftMm) ? pl.octave.shiftMm : null;
    if (pl) {
      
      out.octaveSettled = !(camSettled && plShift != null && Math.abs(plShift - camShift) > 1);
      out.plate = { t: +pl.t, keys: pl.keys.slice(), filled: pl.quality ? pl.quality.filled : null, edgePx: pl.quality ? pl.quality.edgePx : null,
        shiftMm: plShift };
    } else out.octaveSettled = camSettled;
    if (!out.octaveSettled) why.push('the octave is not settled');
    out.why = [...why, ...both];
    out.ok = !out.why.length;
    Object.defineProperty(out, '_plate', { value: pl, enumerable: false });
    Object.defineProperty(out, '_footageWhy', { value: [...fg.why, ...(camSettled ? [] : ['the octave is not settled']), ...both], enumerable: false });
    return out;
  }

  
  function keysRound(marks) {
    const ms = (Array.isArray(marks) ? marks : []).map((mk) => Math.round(+(mk && mk.midi))).filter((m) => m >= 21 && m <= 108);
    return ms.length ? [Math.max(21, Math.min(...ms) - 7), Math.min(108, Math.max(...ms) + 7)] : null;
  }

  

  async function mount(videoEl, opts = {}) {
    if (!videoEl || !videoEl.parentElement) throw new Error('MVGhostOverlay.mount needs a video in the page');
    if (!window.MVGhost || !window.MVGhostRecorded) throw new Error('MVGhostOverlay needs stage-ghost.js and ghost-recorded.js');
    const cam = opts.camera || null;
    const fallback = opts.ghost && typeof opts.ghost === 'object' && opts.ghost.fallback && !opts.ghost.url ? opts.ghost : null;
    const g = opts.ghost && typeof opts.ghost.stage === 'function' ? opts.ghost
      : fallback ? window.MVGhostRecorded.keysOnly({ keyRange: opts.keyRange || keysRound(opts.marks), refFromS: opts.refFromS,
        refToS: opts.refToS, notes: opts.notes, toLearner: opts.toLearner })
        : await window.MVGhostRecorded.load(opts.ghost, { toLearner: opts.toLearner });
    const gate = gateOf(cam, g, opts);
    
    const view = Array.isArray(opts.focus) && opts.focus.length === 2 && opts.focus.every(fin) && opts.focus[1] > opts.focus[0]
      ? [Math.max(21, Math.round(opts.focus[0])), Math.min(108, Math.round(opts.focus[1]))] : g.keyRange.slice();
    if (fallback) {
      gate.ok = false;
      gate.why.unshift(`no recorded hands for these bars (${String(fallback.reason || 'none').slice(0, 24)})`);
    }
    const mode = fallback ? 'closeup' : ['plate', 'overlay', 'closeup'].includes(opts.mode) ? opts.mode : gate.ok ? 'plate' : 'closeup';
    const over = mode === 'overlay';
    if (over && !(cam && fin(cam.shiftMm) && g.keys)) throw new Error('the overlay needs a camera with a settled octave and Quest keys');
    
    const plates = Array.isArray(opts.plates) ? opts.plates : ((((opts.result || {}).keyboard) || {}).plates || null);
    const plate = mode === 'plate' ? gate._plate || plateFor(plates, g.keyRange, gate.span) : null;
    if (mode === 'plate' && !(plate && g.keys)) throw new Error("the plate needs a still of the learner's keyboard that shows the part's keys, and Quest keys");
    const platePose = plate ? rt(plate.T) : null;
    const area = plate ? plateArea(plate) : null;
    if (mode === 'plate' && !area) throw new Error("the plate's keys are not in front of its camera");
    
    
    const S = over ? stageToClip(g.quest(), cam.shiftMm, cam.whiteMm || 23.5) : plate ? stageToClip(g.quest(), 0, plateWhite(plate)) : null;

    
    const own = typeof Element !== 'undefined' && opts.host instanceof Element && opts.host !== videoEl ? opts.host : null;
    const host = own || videoEl.parentElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const layer = document.createElement('div');
    layer.className = 'mv-ghost-overlay';
    layer.dataset.mode = mode;
    Object.assign(layer.style, { position: 'absolute', pointerEvents: 'none', overflow: 'hidden', zIndex: own ? '' : '1',
      background: over ? 'transparent' : (opts.background || '#151413') });
    if (own) host.append(layer); else host.insertBefore(layer, videoEl.nextSibling);
    
    const img = plate ? document.createElement('img') : null;
    if (img) {
      img.alt = '';
      img.decoding = 'async';
      Object.assign(img.style, { position: 'absolute', maxWidth: 'none', userSelect: 'none' });
      img.src = plate.src;
      layer.append(img);
    }
    const marksCv = document.createElement('canvas');
    Object.assign(marksCv.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    marksCv.setAttribute('aria-hidden', 'true');

    const { D, hands } = g.stage();
    let rect = { x: 0, y: 0, w: 1, h: 1 }, ew = 1, eh = 1, takeT = videoEl.currentTime || 0, poseNow = null;
    const off = +opts.videoOffsetS || 0;                 
    const camFn = over ? () => {
      poseNow = poseAt(cam, takeT);
      if (!poseNow) return null;
      return { proj: projMatrix(cam.K, cam.size, rect, ew, eh), view: viewMatrix(poseNow, S) };
    } : plate ? () => {
      poseNow = platePose;
      return { proj: projMatrix(plate.K, [plate.w, plate.h], rect, ew, eh), view: viewMatrix(platePose, S) };
    } : null;
    let win = null;
    let st;
    try {
      st = await window.MVGhost.create(layer, {
        D, hands, redraw: () => frame(), bare: true, bright: opts.look === 'bright', pale: opts.look === 'pale',
        ...(camFn ? { camera: camFn, keys: 'depth' } : { closeUp: { lo: view[0], hi: view[1] }, litColor: COL.sounding }),
        onLost: () => { if (typeof opts.onLost === 'function') opts.onLost(); },
      });
    } catch (e) { layer.remove(); throw e; }
    Object.assign(st.canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    layer.append(marksCv);
    const ctx = marksCv.getContext('2d');

    function layout() {
      ew = Math.max(1, videoEl.clientWidth); eh = Math.max(1, videoEl.clientHeight);
      let lx = videoEl.offsetLeft, ly = videoEl.offsetTop;
      if (own && opts.fitHost && !over) {                  
        ew = Math.max(1, host.clientWidth); eh = Math.max(1, host.clientHeight); lx = 0; ly = 0;
      } else if (own && videoEl.offsetParent !== host) {  
        const vr = videoEl.getBoundingClientRect(), hr = host.getBoundingClientRect();
        lx = vr.left - hr.left - host.clientLeft + videoEl.clientLeft; ly = vr.top - hr.top - host.clientTop + videoEl.clientTop;
      }
      Object.assign(layer.style, { left: `${lx}px`, top: `${ly}px`, width: `${ew}px`, height: `${eh}px` });
      if (plate) {
        win = fitWindow(plateWindow(plate, view[0], view[1]), plate, ew, eh);
        rect = plateRect(win, plate, ew, eh);
        
        const sx = rect.w / plate.w, sy = rect.h / plate.h;
        Object.assign(img.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px`,
          clipPath: `polygon(${area.map(([u, v]) => `${(u * sx).toFixed(1)}px ${(v * sy).toFixed(1)}px`).join(', ')})` });
        
        const cut = [rect.y, ew - rect.x - rect.w, eh - rect.y - rect.h, rect.x].map((v) => `${Math.max(0, v).toFixed(1)}px`);
        st.canvas.style.clipPath = `inset(${cut.join(' ')})`;
      } else {
        const vw = videoEl.videoWidth || (cam && cam.size[0]) || ew, vh = videoEl.videoHeight || (cam && cam.size[1]) || eh;
        const cs = getComputedStyle(videoEl);
        rect = contentRect(ew, eh, vw, vh, cs.objectFit || 'contain', cs.objectPosition);
      }
      st.resize(ew, eh);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      marksCv.width = Math.round(ew * dpr); marksCv.height = Math.round(eh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      frame();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(() => layout()) : null;
    if (ro) { ro.observe(videoEl); if (own) ro.observe(host); }
    videoEl.addEventListener('loadedmetadata', layout);

    

    let marks = Array.isArray(opts.marks) ? opts.marks.slice() : [];
    let run = null, destroyed = false, refNow = g.refT0, raf = 0, schedRef = -Infinity;
    const piano = () => (opts.sound === false ? null : window.MVPiano || null);
    const NOTES = g.notes();
    const DIG = new Map(g.digits().map(([row, hand, f]) => [row, { hand, f }]));
    if (piano() && typeof piano().ready === 'function') {                 
      const want = [...new Set(NOTES.map((r) => r[2]))].map((m) => [m, VEL]);
      try { Promise.resolve(piano().ready(want)).catch(() => {}); } catch {   }
    }

    
    
    
    const followsVideo = () => over || (run && run.clock === 'take') || marks.some((mk) => mk && mk.clock === 'take');
    let draws = 0;
    function frame() {
      if (destroyed || !st) return;
      draws++;
      if (!run || run.clock === 'take') {
        takeT = (videoEl.currentTime || 0) - off;
        if (run || over) refNow = g.refAt(takeT);
      }
      const shown = refNow >= g.refT0 - 0.05 && refNow <= g.refEnd + 0.05;
      layer.style.visibility = shown || !over ? 'visible' : 'hidden';
      st.draw(Math.min(g.refEnd, Math.max(g.refT0, refNow)), !!run);
      drawMarks(shown);
    }
    function loop() {
      raf = 0;
      if (destroyed) return;
      if (run && run.clock === 'reference') {
        const now = performance.now();
        refNow = run.from + ((now - run.wall0) / 1000) * run.rate;
        if (refNow >= run.to) { refNow = run.to; frame(); finish(true); return; }
      } else if (run && run.clock === 'take') {
        if ((videoEl.currentTime || 0) - off >= run.to - 1e-3 || videoEl.ended) { videoEl.pause(); frame(); finish(true); return; }
        takeT = (videoEl.currentTime || 0) - off;       
        refNow = g.refAt(takeT);
      }
      if (run && !run.seeking) sound();                 
      frame();
      if (run || (!videoEl.paused && followsVideo())) raf = requestAnimationFrame(loop);
    }
    const kick = () => { if (!raf && !destroyed) raf = requestAnimationFrame(loop); };
    const onPlay = () => { if (followsVideo()) kick(); };
    const onSeek = () => { if (run && run.clock === 'take' && !run.seeking) finish(false); if (followsVideo()) frame(); };
    const onPause = () => { if (run && run.clock === 'take' && !run.pausing) { finish(false); } if (followsVideo()) frame(); };
    videoEl.addEventListener('play', onPlay);
    videoEl.addEventListener('seeked', onSeek);
    videoEl.addEventListener('pause', onPause);
    const onTime = () => { if (!raf && followsVideo()) frame(); };
    videoEl.addEventListener('timeupdate', onTime);

    
    function sound() {
      const P = piano();
      if (!P || !run || typeof P.play !== 'function') return;
      const ahead = refNow + LEAD_S[run.clock] * run.rate, from = Math.max(schedRef, refNow - LATE_S * run.rate);
      const base = typeof P.now === 'function' ? +P.now() || 0 : 0;   
      for (const r of NOTES) {
        if (r[0] < from || r[0] >= ahead || r[0] < run.startRef || r[0] >= run.endRef) continue;
        const toWall = run.clock === 'take' ? (g.learnerAt(r[0]) - takeT) / run.rate : (r[0] - refNow) / run.rate;
        const dur = run.clock === 'take' ? (g.learnerAt(r[1]) - g.learnerAt(r[0])) / run.rate : (r[1] - r[0]) / run.rate;
        try { P.play(r[2], VEL, base + Math.max(0, toWall), Math.max(0.05, dur)); } catch (e) { console.warn('MVGhostOverlay: the piano did not play', e); }
      }
      schedRef = Math.max(schedRef, ahead);
    }
    function finish(done) {
      const r = run;
      if (!r) return;
      run = null;
      if (r.clock === 'take' && r.muted !== null) videoEl.muted = r.muted;
      if (r.clock === 'take') videoEl.playbackRate = r.prevRate;
      const P = piano();
      if (!done && P && typeof P.stopAll === 'function') { try { P.stopAll(); } catch {   } }
      r.resolve(done);
    }

    function play(fromS, toS, rate = 1, o = {}) {
      if (destroyed) return Promise.resolve(false);
      finish(false);
      const clock = o.clock === 'take' || o.clock === 'reference' ? o.clock : over ? 'take' : 'reference';
      rate = fin(+rate) && +rate > 0.1 ? Math.min(2, +rate) : 1;
      return new Promise((resolve) => {
        if (clock === 'reference') {
          const from = fin(+fromS) ? +fromS : g.refT0, to = fin(+toS) ? +toS : g.refEnd;
          run = { clock, from, to, rate, wall0: performance.now(), resolve, startRef: from, endRef: to };
          schedRef = from - 1e-6; refNow = from;
          sound();                                         
        } else {
          const from = fin(+fromS) ? +fromS : g.learnerAt(g.refT0), to = fin(+toS) ? +toS : g.learnerAt(g.refEnd);
          run = { clock, from, to, rate, resolve, muted: opts.muteVideo === false ? null : videoEl.muted, prevRate: videoEl.playbackRate,
            startRef: g.refAt(from), endRef: g.refAt(to), seeking: true, pausing: false };
          if (opts.muteVideo !== false) videoEl.muted = true;   
          schedRef = g.refAt(from) - 1e-6; takeT = from; refNow = g.refAt(from);
          videoEl.playbackRate = rate;
          const go = () => { if (run && run.clock === 'take') { run.seeking = false; videoEl.play().catch(() => finish(false)); } };
          if (Math.abs((videoEl.currentTime || 0) - off - from) > 0.01) { videoEl.addEventListener('seeked', go, { once: true }); videoEl.currentTime = from + off; } else go();
        }
        kick();
      });
    }
    function seek(s, o = {}) {
      const clock = o.clock === 'take' || o.clock === 'reference' ? o.clock : over ? 'take' : 'reference';
      finish(false);
      if (clock === 'take') { takeT = +s; refNow = g.refAt(+s); if (over) videoEl.currentTime = +s + off; }
      else refNow = +s;
      frame();
    }
    function stop() {
      if (run && run.clock === 'take') { run.pausing = true; videoEl.pause(); }
      finish(false);
      frame();
    }

    

    
    
    
    function quad(m, full = false) {
      const blk = isBlack(m);
      const y0 = blk ? 50 : 3, y1 = full ? (blk ? 140 : 135) : blk ? 80 : 46, z = blk ? 12 : 0;
      if (plate) {
        const W = plateWhite(plate), x = keyMm(m, W), hw = blk ? 5.5 : W / 2 - 1;
        const pts = [[x - hw, y0, z], [x + hw, y0, z], [x + hw, y1, z], [x - hw, y1, z]].map((X) => projectPlate(plate, platePose, X));
        if (pts.some((p) => !p)) return null;
        const sx = rect.w / plate.w, sy = rect.h / plate.h;
        return pts.map(([u, v]) => [rect.x + (u + 0.5) * sx, rect.y + (v + 0.5) * sy]);
      }
      if (!over) return st.keyQuad(m, blk ? 2 : 4, full ? (blk ? 92 : 135) : blk ? 32 : 46);
      if (!poseNow) return null;
      const x = keyMm(m, cam.whiteMm || 23.5) - cam.shiftMm, hw = blk ? 5.5 : (cam.whiteMm || 23.5) / 2 - 1;
      const pts = [[x - hw, y0, z], [x + hw, y0, z], [x + hw, y1, z], [x - hw, y1, z]].map((X) => project(cam, poseNow, X));
      if (pts.some((p) => !p)) return null;
      const sx = rect.w / cam.size[0], sy = rect.h / cam.size[1];
      return pts.map(([u, v]) => [rect.x + (u + 0.5) * sx, rect.y + (v + 0.5) * sy]);
    }
    
    
    
    function outline(m) {
      if (!over && !plate) return (st.keyOutline && st.keyOutline(m)) || quad(m);
      const blk = isBlack(m), z = blk ? 12 : 0;
      const W = plate ? plateWhite(plate) : cam.whiteMm || 23.5, shift = plate ? 0 : cam.shiftMm;
      const kx = (k) => keyMm(k, W) - shift, x = kx(m), bh = 5.5;
      let pts;
      if (blk) pts = [[x - bh, 50, z], [x + bh, 50, z], [x + bh, 140, z], [x - bh, 140, z]];
      else {
        const hw = W / 2 - 1, xr2 = isBlack(m + 1) ? kx(m + 1) - bh - 0.6 : x + hw, xl2 = isBlack(m - 1) ? kx(m - 1) + bh + 0.6 : x - hw;
        pts = [[x - hw, 3, z], [x + hw, 3, z], [x + hw, 50, z], [xr2, 50, z], [xr2, 135, z], [xl2, 135, z], [xl2, 50, z], [x - hw, 50, z]];
      }
      if (plate) {
        const P = pts.map((X) => projectPlate(plate, platePose, X));
        if (P.some((q) => !q)) return quad(m);
        const sx = rect.w / plate.w, sy = rect.h / plate.h;
        return P.map(([u, v]) => [rect.x + (u + 0.5) * sx, rect.y + (v + 0.5) * sy]);
      }
      if (!poseNow) return null;
      const P = pts.map((X) => project(cam, poseNow, X));
      if (P.some((q) => !q)) return quad(m);
      const sx = rect.w / cam.size[0], sy = rect.h / cam.size[1];
      return P.map(([u, v]) => [rect.x + (u + 0.5) * sx, rect.y + (v + 0.5) * sy]);
    }
    const mid = (q) => [q.reduce((a, p) => a + p[0], 0) / 4, q.reduce((a, p) => a + p[1], 0) / 4];
    const width = (q) => Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]);
    const half = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const px = (share, min) => Math.max(min, ew * share);         
    const label = (s) => (typeof s === 'string' ? s.trim().slice(0, MAX_LABEL) : '');
    
    function landmark(q, text) {
      neon(q, 'sounding', false);
      lastMarks.landmarks++;
      if (!text) return;
      const far = half(q[2], q[3]), size = Math.round(px(LOOK.tagPx, 12));
      ctx.font = `600 ${size}px ${LOOK.font}`;
      const w = ctx.measureText(text).width + size * 0.9, h = size * 1.5, caret = size * 0.4;
      const x = Math.min(Math.max(2, far[0] - w / 2), ew - w - 2), y = Math.max(2, far[1] - caret - h - 2);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2); else ctx.rect(x, y, w, h);
      ctx.moveTo(far[0] - caret, y + h); ctx.lineTo(far[0], y + h + caret); ctx.lineTo(far[0] + caret, y + h);
      ctx.fillStyle = 'rgba(26, 25, 24, 0.86)'; ctx.fill();
      ctx.fillStyle = LOOK.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + w / 2, y + h / 2);
      lastMarks.labels.push({ text, kind: 'landmark', x: x + w / 2, y: y + h / 2, size });
    }
    
    
    function disc(q, f, hand) {
      const n = half(q[0], q[1]), [mx, my] = mid(q);
      const r = Math.max(px(LOOK.discR, 10), width(q) * 0.4), cx = n[0] + (n[0] - mx) * 0.35, cy = n[1] + (n[1] - my) * 0.35;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = COL[hand] || COL.R; ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.12); ctx.strokeStyle = LOOK.ring[hand] || LOOK.ring.R; ctx.stroke();
      ctx.fillStyle = LOOK.ink; ctx.font = `700 ${Math.round(r * 1.2)}px ${LOOK.font}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(f), cx, cy + r * 0.06);
      lastMarks.discs.push({ x: cx, y: cy, r, f, hand });
    }
    
    function neon(q, kind, filled = true) {
      const [core, glow, fill] = NEON[kind] || NEON.sounding, lw = px(LOOK.neonPx, 2);
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.beginPath(); q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
      if (filled) { ctx.fillStyle = fill; ctx.fill(); }
      ctx.shadowColor = glow; ctx.shadowBlur = px(LOOK.glowPx, 8);
      ctx.strokeStyle = glow; ctx.lineWidth = lw; ctx.stroke();
      ctx.stroke();                                           
      ctx.shadowBlur = 0; ctx.strokeStyle = core; ctx.lineWidth = Math.max(1, lw * 0.45); ctx.stroke();
      ctx.restore();
      lastMarks.neon++;
    }
    
    function glyph(q, kind) {
      const far = half(q[2], q[3]), [mx, my] = mid(q);
      const r = Math.max(px(LOOK.glyphPx, 9), width(q) * 0.42) / 2;
      const dx = far[0] - mx, dy = far[1] - my, d = Math.hypot(dx, dy) || 1;
      const cx = far[0] + (dx / d) * r * 1.5, cy = far[1] + (dy / d) * r * 1.5;
      const [core, glow] = NEON[kind];
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      if (kind === 'target') { ctx.moveTo(cx - r * 0.85, cy); ctx.lineTo(cx - r * 0.2, cy + r * 0.7); ctx.lineTo(cx + r * 0.95, cy - r * 0.75); }
      else { ctx.moveTo(cx - r * 0.75, cy - r * 0.75); ctx.lineTo(cx + r * 0.75, cy + r * 0.75); ctx.moveTo(cx + r * 0.75, cy - r * 0.75); ctx.lineTo(cx - r * 0.75, cy + r * 0.75); }
      ctx.shadowColor = glow; ctx.shadowBlur = px(LOOK.glowPx, 8);
      ctx.strokeStyle = glow; ctx.lineWidth = Math.max(2.5, r * 0.42); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = core; ctx.lineWidth = Math.max(1.2, r * 0.18); ctx.stroke();
      ctx.restore();
      lastMarks.chips.push({ kind, x: cx, y: cy, r });
    }
    const blank = () => ({ sounding: 0, marks: 0, digits: 0, landmarks: 0, neon: 0, discs: [], chips: [], labels: [] });
    let lastMarks = blank();
    function drawMarks(shown) {
      ctx.clearRect(0, 0, ew, eh);
      lastMarks = blank();
      if (over && (!shown || !poseNow)) return;
      const t = refNow;
      const held = [];
      NOTES.forEach((r, row) => { if (r[0] <= t && t < r[1]) held.push([r, row]); });
      
      for (const [r] of held) { const q = outline(r[2]); if (q) { neon(q, 'sounding'); lastMarks.sounding++; } }
      const due = (mk) => {
        const now = mk.clock === 'take' ? takeT : t;
        return !(fin(+mk.fromS) && now < +mk.fromS) && !(fin(+mk.toS) && now >= +mk.toS);
      };
      const live = marks.filter((mk) => mk && fin(+mk.midi) && ['target', 'wrong', 'landmark', 'play', 'finger'].includes(mk.kind) && due(mk));
      for (const mk of live.filter((x) => x.kind === 'landmark')) {   
        const q = quad(Math.round(+mk.midi), true);
        if (q) landmark(q, label(mk.label));
      }
      for (const mk of live.filter((x) => x.kind === 'play')) {
        const q = outline(Math.round(+mk.midi));
        if (q) neon(q, 'sounding');
      }
      for (const mk of live.filter((x) => x.kind === 'target' || x.kind === 'wrong')) {
        const q = quad(Math.round(+mk.midi));
        if (!q) continue;
        neon(outline(Math.round(+mk.midi)) || q, mk.kind);     
        glyph(q, mk.kind);
        lastMarks.marks++;
      }
      
      for (const mk of live.filter((x) => x.kind === 'finger' && Number.isInteger(+x.finger))) {
        const q = quad(Math.round(+mk.midi));
        if (!q) continue;
        neon(outline(Math.round(+mk.midi)) || q, 'sounding');
        ctx.save(); ctx.shadowColor = '#FFFFFF'; ctx.shadowBlur = px(LOOK.glowPx, 8) * 1.5;
        disc(q, +mk.finger, mk.hand === 'L' ? 'L' : 'R');
        ctx.restore();
        lastMarks.said = (lastMarks.said || 0) + 1;
      }
      for (const [r, row] of held) {
        const d = DIG.get(row);
        if (!d) continue;
        const q = quad(r[2]);
        if (q) { disc(q, d.f, d.hand); lastMarks.digits++; }
      }
    }

    layout();
    if (!videoEl.paused && followsVideo()) kick();
    const api = {
      mode, gate, ghost: { refT0: g.refT0, refEnd: g.refEnd, bars: g.bars, keyRange: g.keyRange.slice(), recorded: g.recorded !== false },
      plate: plate ? { t: +plate.t, keys: plate.keys ? plate.keys.slice() : null, window: () => (win ? { ...win } : null) } : null,
      play, seek, stop,
      setMarks(list) { marks = Array.isArray(list) ? list.slice() : []; frame(); if (!videoEl.paused && followsVideo()) kick(); },
      time: () => ({ take: takeT, ref: refNow }),
      playing: () => !!run,
      stillFrames: (fromS, toS) => stillFrames(opts.result, cam, fromS, toS),
      
      state: () => ({ mode, posed: !!poseNow, take: takeT, ref: refNow, visible: layer.style.visibility !== 'hidden', marks: { ...lastMarks }, draws,
        stage: st.state(), plate: plate ? { t: +plate.t, rect: { ...rect }, window: win ? { ...win } : null, loaded: !!(img && img.complete && img.naturalWidth),
          area: area.map((q) => q.slice()), clip: img.style.clipPath, handsClip: st.canvas.style.clipPath } : null }),
      
      
      keyQuad: (m, full = false) => quad(m, !!full),
      
      keyOutline: (m) => outline(m),
      destroy() {
        if (destroyed) return;
        finish(false);
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        videoEl.removeEventListener('loadedmetadata', layout);
        videoEl.removeEventListener('play', onPlay);
        videoEl.removeEventListener('seeked', onSeek);
        videoEl.removeEventListener('pause', onPause);
        videoEl.removeEventListener('timeupdate', onTime);
        st.destroy();
        layer.remove();
        if (!opts.ghost || typeof opts.ghost.stage !== 'function') g.dispose();
      },
    };
    return api;
  }

  window.MVGhostOverlay = {
    mount, learnerOctave, stillFrames, plateFor, look: LOOK,
    
    math: { keyMm, poseAt, stageToClip, viewMatrix, projMatrix, project, toOriginal, contentRect, mul, gate: gateOf,
      projectPlate, plateWindow, fitWindow, plateRect, plateOk, plateArea },
  };
})();
