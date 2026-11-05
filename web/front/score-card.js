






































(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  
  
  
  const C = { paper: '#EEECE8', ink: '#1A1918', correct: '#34D399', wrong: '#F87171', sounding: '#C084FC', digit: '#6B6763' };
  const OTHER_HAND = 0.22, SHARED_FOCUS = 0.61;
  
  const HL = { sounding: '#C084FC', correct: '#34D399', wrong: '#F87171' };
  const VIEW_EASE_S = 0.35, SOUND_S = 0.35, SOUND_FADE_S = 0.15, PAST_FADE = 0.6;
  const MAX_ZOOM = 1.15;                 
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  let filtersMade = false;

  
  function filters() {
    if (filtersMade) return;
    filtersMade = true;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    const ink = [0x1A / 255, 0x19 / 255, 0x18 / 255];
    for (const [id, w] of [['both', [1, 1, 1]], ['R', [1, OTHER_HAND, SHARED_FOCUS]], ['L', [OTHER_HAND, 1, SHARED_FOCUS]]]) {
      const f = document.createElementNS(NS, 'filter');
      f.setAttribute('id', `mvsc-ink-${id}`);
      f.setAttribute('color-interpolation-filters', 'sRGB');
      f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', '1'); f.setAttribute('height', '1');
      const m = document.createElementNS(NS, 'feColorMatrix');
      m.setAttribute('type', 'matrix');
      m.setAttribute('values', `0 0 0 0 ${ink[0]}  0 0 0 0 ${ink[1]}  0 0 0 0 ${ink[2]}  ${w[0]} ${w[1]} ${w[2]} 0 0`);
      f.append(m);
      svg.append(f);
    }
    
    
    
    for (const [id, hex] of Object.entries(HL)) {
      const f = document.createElementNS(NS, 'filter');
      f.setAttribute('id', `mvsc-hl-${id}`);
      f.setAttribute('color-interpolation-filters', 'sRGB');
      f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', '1'); f.setAttribute('height', '1');
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const m = document.createElementNS(NS, 'feColorMatrix');
      m.setAttribute('type', 'matrix');
      m.setAttribute('values', `0 0 0 0 ${c[0]}  0 0 0 0 ${c[1]}  0 0 0 0 ${c[2]}  1 1 1 0 0`);
      const ct = document.createElementNS(NS, 'feComponentTransfer');
      const fa = document.createElementNS(NS, 'feFuncA');
      fa.setAttribute('type', 'table');
      fa.setAttribute('tableValues', '0 0 0 0 0 0 0 0 0.5 1');
      ct.append(fa);
      
      const dl = document.createElementNS(NS, 'feMorphology');
      dl.setAttribute('operator', 'dilate');
      dl.setAttribute('radius', '1');
      f.append(m, ct, dl);
      svg.append(f);
    }
    document.body.append(svg);
  }
  const svgEl = (tag, attrs = {}, parent = null) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (parent) parent.append(e);
    return e;
  };
  const div = (cls, parent) => { const e = document.createElement('div'); e.className = cls; if (parent) parent.append(e); return e; };

  function mount(host, opts) {
    const S = opts && opts.score;
    const G = S && S.geom;
    if (!G || !G.notes || !Array.isArray(G.bars) || !G.bars.length || !Array.isArray(S.tiles) || !S.tiles.length) return null;
    filters();
    const fixes = Array.isArray(opts.fixes) ? opts.fixes : [];
    const root = div('mvsc', host);
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'The score');
    const paper = div('mvsc-paper', root);
    const inkBox = div('mvsc-ink', paper);
    
    const hlBox = {};
    for (const k of Object.keys(HL)) { hlBox[k] = div(`mvsc-ink mvsc-hl mvsc-hl-${k}`, paper); hlBox[k].style.filter = `url(#mvsc-hl-${k})`; hlBox[k].style.display = 'none'; }
    const ov = svgEl('svg', { class: 'mvsc-ov', 'aria-hidden': 'true' }, paper);
    const hit = div('mvsc-hit', paper);            
    const staves = (G.staves || []).slice().sort((a, b) => a.staff - b.staff);
    const st = { view: null, from: null, to: null, anim: 0, hand: 'both', marks: [], playX: null, sounding: new Map(), played: new Set(), past: false,
      holdId: null, pinMode: 'hidden', dropAt: new Map(), dimmed: false, destroyed: false, raf: 0 };
    
    const imgs = [];
    for (const t of S.tiles) {
      const im = document.createElement('img');
      im.className = 'mvsc-tile';
      im.alt = '';
      im.decoding = 'async';
      im.draggable = false;
      im.style.left = `${t.x0}px`;
      im.style.width = `${t.x1 - t.x0}px`;
      im.style.height = `${G.height}px`;
      im.dataset.tile = t.id;
      inkBox.append(im);
      imgs.push(im);
      const copies = Object.values(hlBox).map((lay) => { const c = im.cloneNode(); c.className = 'mvsc-tile-hl'; lay.append(c); return c; });
      Promise.resolve().then(() => opts.tileUrl(t.id)).then((u) => { if (u && !st.destroyed) { im.src = u; for (const c of copies) c.src = u; } }).catch(() => {   });
    }
    inkBox.style.height = `${G.height}px`;
    for (const lay of Object.values(hlBox)) lay.style.height = `${G.height}px`;
    
    let heads = { sounding: new Map(), correct: new Map(), wrong: new Map() };
    const light = (kind, id, a = 1) => { if (G.notes[id]) heads[kind].set(id, Math.max(a, heads[kind].get(id) || 0)); };
    function paint() {
      
      for (const id of heads.wrong.keys()) { heads.correct.delete(id); heads.sounding.delete(id); }
      for (const id of heads.correct.keys()) heads.sounding.delete(id);
      for (const [k, lay] of Object.entries(hlBox)) {
        const m = heads[k];
        if (!m.size) { lay.style.display = 'none'; continue; }
        lay.style.display = '';
        lay.style.transform = inkBox.style.transform;
        lay.style.opacity = String(Math.max(...m.values()));
        const d = [...m.keys()].map((id) => {
          const b = G.notes[id], pad = 0.12 * ss, rx = (b[2] - b[0]) / 2 + pad, ry = (b[3] - b[1]) / 2 + pad, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
          return `M${(cx - rx).toFixed(1)} ${cy.toFixed(1)}a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(2 * rx).toFixed(1)} 0a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(-2 * rx).toFixed(1)} 0Z`;
        }).join('');
        lay.style.clipPath = `path('${d}')`;
      }
    }
    const ss = G.ss || 24;
    const noteBox = (id) => { const b = G.notes[id]; return b ? { x0: b[0], y0: b[1], x1: b[2], y1: b[3], staff: b[4], k: b[5], cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2 } : null; };
    const barK = new Map(G.bars.map((b) => [b.k, b]));
    const staffOf = (hand) => staves.find((s) => s.hand === hand) || null;
    
    function rowsFor(hand) {
      const s = hand === 'R' || hand === 'L' ? staffOf(hand) : null;
      if (s) return [s.y[0] - 3.2 * ss, s.y[1] + 3.2 * ss];
      const ys = staves.flatMap((x) => x.y);
      
      
      return ys.length ? [Math.min(...ys) - 3.6 * ss, Math.max(...ys) + 4.4 * ss] : [0, G.height];
    }
    function spanOfKs(a, b) {
      const bs = G.bars.filter((x) => x.k >= a && x.k <= b);
      if (!bs.length) return [G.x0, G.x1];
      return [Math.min(...bs.map((x) => x.x0)), Math.max(...bs.map((x) => x.x1))];
    }
    const box = () => ({ w: paper.clientWidth || 1, h: paper.clientHeight || 1 });
    
    const left = Math.min(...G.bars.map((b) => b.k)) === 0 ? 0 : G.x0 - 0.8 * ss;
    
    function fit(v) {
      const { w, h } = box();
      
      
      const s = Math.min(w / Math.max(1, v.x1 - v.x0), h / Math.max(1, v.y1 - v.y0), (w / 900) * MAX_ZOOM);
      return { s, tx: (w - (v.x1 - v.x0) * s) / 2 - v.x0 * s, ty: (h - (v.y1 - v.y0) * s) / 2 - v.y0 * s };
    }
    const lerp = (a, b, w) => a + (b - a) * w;
    function current() {
      if (!st.view) return null;
      if (!st.from || st.anim <= 0) return st.view;
      const w = ease(Math.min(1, (performance.now() - st.animAt) / (VIEW_EASE_S * 1000)));
      if (w >= 1) { st.anim = 0; return st.view; }
      const a = st.from, b = st.view;
      return { x0: lerp(a.x0, b.x0, w), x1: lerp(a.x1, b.x1, w), y0: lerp(a.y0, b.y0, w), y1: lerp(a.y1, b.y1, w), hand: b.hand, kind: b.kind, fix: b.fix };
    }
    function setView(v, animate) {
      const was = current();
      st.from = was && animate && !calm() ? was : null;
      st.anim = st.from ? 1 : 0;
      st.animAt = performance.now();
      st.view = v;
      const f = v.hand === 'R' || v.hand === 'L' ? v.hand : 'both';
      if (f !== st.hand) { st.hand = f; for (const im of imgs) im.style.filter = `url(#mvsc-ink-${f})`; }
      root.dataset.view = v.kind;
      root.dataset.hand = f;
      kick();
    }
    for (const im of imgs) im.style.filter = 'url(#mvsc-ink-both)';
    
    function proj(T, x, y) { return [x * T.s + T.tx, y * T.s + T.ty]; }
    function text(g, x, y, str, attrs) {
      const halo = svgEl('text', { x, y, ...attrs, stroke: C.paper, 'stroke-width': 6, 'stroke-linejoin': 'round', 'paint-order': 'stroke' }, g);
      halo.textContent = str;
      return halo;
    }
    function draw() {
      const v = current();
      while (ov.firstChild) ov.firstChild.remove();
      heads = { sounding: new Map(), correct: new Map(), wrong: new Map() };
      if (!v) { paint(); return; }
      const { w, h } = box();
      ov.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const T = fit(v);
      inkBox.style.transform = `translate(${T.tx}px, ${T.ty}px) scale(${T.s})`;
      
      
      const u = Math.min(w / 900, h / 235);
      const label = 40 * u;
      const g = svgEl('g', {}, ov);
      const now = performance.now();
      
      
      
      st.fade = null;
      if (v.kind === 'window' && Array.isArray(v.span)) {
        const xa = Math.max(0, proj(T, v.span[0] - 0.35 * ss, 0)[0]), xz = Math.min(w, proj(T, v.span[1] + 0.25 * ss, 0)[0]);
        if (xa > 1) svgEl('rect', { x: 0, y: 0, width: xa, height: h, fill: C.paper, opacity: 0.86, class: 'mvsc-fade' }, g);
        if (xz < w - 1) svgEl('rect', { x: xz, y: 0, width: w - xz, height: h, fill: C.paper, opacity: 0.86, class: 'mvsc-fade' }, g);
        st.fade = [Math.round(xa), Math.round(xz)];
      }
      
      if (v.kind === 'window' && v.k0 != null) {
        const b = barK.get(v.k0);
        if (b && !b.pickup) {
          const [bx] = proj(T, b.x0, 0);
          const s1 = staves[0] ? proj(T, 0, v.hand === 'L' && staves[1] ? staves[1].y[0] : staves[0].y[0])[1] : 20 * u;
          text(g, Math.max(6 * u, bx + 4 * u), Math.max(label, s1 - 10 * u), String(b.m), { 'font-size': label, 'font-weight': 400, fill: C.ink, class: 'mvsc-barno' });
        }
      }
      
      const [ry0, ry1] = rowsFor('both');
      const lanes = regionLanes();
      const placed = [];                               
      for (const f of fixes) {
        const b = hitFor(f.n);
        const wk = f.window || {};
        if ((v.kind !== 'overview' && v.kind !== 'follow') || wk.kFrom == null) { b.reg.hidden = true; b.pin.hidden = true; continue; }
        const [a, z] = spanOfKs(wk.kFrom, wk.kTo);
        const [x0, y0] = proj(T, a, ry0), [x1, y1] = proj(T, z, ry1);
        
        const ln = lanes.get(f.n) || { i: 0, n: 1 };
        const rTop = Math.max(0, y0), full = Math.min(h, y1) - rTop, gap = ln.n > 1 ? 2 : 0, wid = (x1 - x0) / ln.n;
        Object.assign(b.reg.style, { left: `${x0 + wid * ln.i}px`, top: `${rTop}px`, width: `${Math.max(14, wid - gap)}px`,
          height: `${Math.max(8, full)}px`, zIndex: String(Math.max(1, 1000 - Math.round(x1 - x0))) });
        b.reg.hidden = v.kind !== 'overview';
        
        const nb = f.anchor && f.anchor.noteId ? noteBox(f.anchor.noteId) : null;
        const ax = nb ? proj(T, nb.cx, 0)[0] : x0 + 12 * u;
        const ay = nb ? proj(T, 0, nb.y0)[1] : Math.max(0, y0);
        const pinD = 64 * u, stem = 22 * u;
        let drop = 0;
        if (st.pinMode === 'drop') {
          const t0 = st.dropAt.get(f.n);
          drop = t0 == null ? -1 : calm() ? 0 : 70 * u * (1 - ease(Math.min(1, (now - t0) / 433)));
        }
        const top = Math.max(pinD / 2 + 2 * u, ay - stem - pinD / 2 - 4 * u) - drop;
        const show = st.pinMode === 'shown' || (st.pinMode === 'drop' && drop >= 0);
        b.pin.hidden = !show;
        if (show) {
          
          
          const span = Math.max(pinD, 26) + 4 * u;
          let px = ax;
          for (let k = 0; k < 4; k++) {
            const q = placed.find((x) => Math.abs(x - px) < span);
            if (q == null) break;
            px = q + (px >= q ? 1 : -1) * span;
          }
          px = Math.min(Math.max(px, pinD / 2), Math.max(pinD / 2, w - pinD / 2));
          placed.push(px);
          Object.assign(b.pin.style, { left: `${px - pinD / 2}px`, top: `${top - pinD / 2}px`, width: `${pinD}px`, height: `${pinD}px`, fontSize: `${38 * u}px` });
          svgEl('line', { x1: px, y1: top + pinD / 2, x2: ax, y2: ay - 6 * u, stroke: 'url(#mvsc-grad)', 'stroke-width': 4 * u, 'stroke-linecap': 'round' }, g);
          svgEl('circle', { cx: ax, cy: ay - 4 * u, r: 3.5 * u, fill: '#F472B6' }, g);
        }
        
        
        if (show) { const wr = wrongIds(f.marks); for (const m of f.marks || []) if (!(m.kind === 'correct' && wr.has(m.noteId))) smallMark(g, T, m, u); }
      }
      
      
      const lastStop = st.marks.filter((m) => m.kind === 'stop').pop();
      const wrongs = wrongIds(st.marks);
      for (const m of st.marks) if ((m.kind !== 'stop' || m === lastStop) && !(m.kind === 'correct' && wrongs.has(m.noteId))) drawMark(g, T, m, u, label, v);
      
      if (st.holdId) {
        const nb = noteBox(st.holdId);
        if (nb) {
          const [cx] = proj(T, nb.cx, 0), [, top] = proj(T, 0, nb.y0);
          const r = 16 * u, y = top - 30 * u;
          svgEl('path', { d: `M${cx - r} ${y} A${r} ${r} 0 0 1 ${cx + r} ${y}`, fill: 'none', stroke: C.ink, 'stroke-width': 3.5 * u, class: 'mvsc-fermata' }, g);
          svgEl('circle', { cx, cy: y - 3 * u, r: 3.5 * u, fill: C.ink }, g);
        }
      }
      
      for (const id of st.played) {
        const nb = noteBox(id);
        if (!nb) continue;
        const [x0, y0] = proj(T, nb.x0, nb.y0), [x1, y1] = proj(T, nb.x1, nb.y1);
        light('correct', id);
      }
      
      let busy = false;
      for (const [id, sd] of st.sounding) {
        const left = sd.until - now, a = left >= 0 ? 1 : 1 + left / (SOUND_FADE_S * 1000);
        if (a <= 0) { st.sounding.delete(id); continue; }
        busy = true;
        const nb = noteBox(id);
        if (!nb) continue;
        const [x0, y0] = proj(T, nb.x0, nb.y0), [x1, y1] = proj(T, nb.x1, nb.y1);
        light(sd.kind === 'wrong' ? 'wrong' : 'sounding', id, a);
      }
      
      if (st.past && st.playX != null) {
        const [px] = proj(T, st.playX - 0.6 * ss, 0);
        if (px > 0) svgEl('rect', { x: 0, y: 0, width: Math.min(w, px), height: h, fill: C.paper, opacity: PAST_FADE, class: 'mvsc-past' }, g);
      }
      
      if (st.playX != null) {
        const [rA, rB] = rowsFor(v.hand);
        const [px, pa] = proj(T, st.playX, rA + 0.6 * ss), [, pb] = proj(T, 0, rB - 0.6 * ss);
        if (px > -10 && px < w + 10) {
          svgEl('line', { x1: px, y1: Math.max(0, pa), x2: px, y2: Math.min(h, pb), stroke: C.sounding, 'stroke-width': 14 * u, opacity: 0.22, class: 'mvsc-halo' }, g);
          svgEl('line', { x1: px, y1: Math.max(0, pa), x2: px, y2: Math.min(h, pb), stroke: C.sounding, 'stroke-width': Math.max(2, 4 * u), class: 'mvsc-playhead' }, g);
        }
      }
      paint();
      if (busy || st.anim || st.pinMode === 'drop') kick();
    }
    
    const wrongIds = (ms) => new Set((ms || []).filter((m) => m && m.kind === 'wrong').map((m) => m.noteId));
    function smallMark(g, T, m, u) {
      const nb = noteBox(m.noteId);
      if (!nb) return;
      const [x0, y0] = proj(T, nb.x0, nb.y0), [x1, y1] = proj(T, nb.x1, nb.y1);
      const col = m.kind === 'correct' ? C.correct : C.wrong;
      if (m.kind === 'stop') {                          
        const px = proj(T, pauseX(nb), 0)[0];
        svgEl('line', { x1: px, y1: y0 - 10 * u, x2: px, y2: y1 + 10 * u, stroke: C.wrong, 'stroke-width': Math.max(2, 3 * u), 'stroke-linecap': 'round' }, g);
        return;
      }
      light(m.kind === 'correct' ? 'correct' : 'wrong', m.noteId);
    }
    function drawMark(g, T, m, u, label, v) {
      const nb = noteBox(m.noteId);
      if (!nb) return;
      const a = m.at != null ? Math.min(1, Math.max(0, (performance.now() - m.at) / 200)) : 1;
      if (a < 1) kick();
      const gg = svgEl('g', { opacity: a, class: `mvsc-mark ${m.kind}`, 'data-note': m.noteId }, g);
      const [x0, y0] = proj(T, nb.x0, nb.y0), [x1, y1] = proj(T, nb.x1, nb.y1);
      const cx = (x0 + x1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
      const sv = staves.find((s) => s.staff === nb.staff) || staves[0];
      const above = nb.staff === 1 || staves.length < 2;
      const [, sTop] = proj(T, 0, sv ? sv.y[0] : nb.y0), [, sBot] = proj(T, 0, sv ? sv.y[1] : nb.y1);
      const outY = above ? Math.min(sTop, y0) - 18 * u : Math.max(sBot, y1) + label + 6 * u;
      if (m.kind === 'correct') {
        
        
        light('correct', m.noteId, a);
        if (Number.isInteger(m.finger)) text(gg, cx + rx + 6 * u, outY + label * 0.1, String(m.finger), { 'font-size': label * 0.72, 'font-weight': 600, fill: C.digit, class: 'mvsc-digit' });
      } else if (m.kind === 'wrong') {
        
        
        light('wrong', m.noteId, a);
      } else if (m.kind === 'octave') {
        
        light('wrong', m.noteId, a);
        if (m.words) text(gg, cx - label, outY, m.up ? 'octave up' : 'octave down', { 'font-size': label * 0.8, 'font-weight': 700, fill: C.wrong });
      } else if (m.kind === 'stop' && st.badge) {
        
        
        
        const clear = st.fade || [0, box().w];
        const px = proj(T, pauseX(nb), 0)[0];
        if (px < clear[0] || px > clear[1]) return;
        const ys = staves.flatMap((x) => x.y), shown = v.hand === 'R' || v.hand === 'L' ? [sv.y[0], sv.y[1]] : [Math.min(...ys), Math.max(...ys)];
        const [, ya] = proj(T, 0, shown[0] - 1.2 * ss), [, yb] = proj(T, 0, shown[1] + 1.2 * ss);
        svgEl('line', { x1: px, y1: ya, x2: px, y2: yb, stroke: C.wrong, 'stroke-width': Math.max(3, 6 * u), 'stroke-linecap': 'round', class: 'mvsc-pause' }, gg);
        const t = text(gg, px, Math.max(label * 0.8, ya - 8 * u), 'pause', { 'font-size': label * 0.8, 'font-weight': 700, fill: C.wrong, 'text-anchor': 'middle', class: 'mvsc-pause-t' });
        t.setAttribute('text-anchor', 'middle');
      }
    }
    
    function pauseX(nb) {
      let nx = Infinity;
      for (const b of Object.values(G.notes)) if (b[0] > nb.x1 - 1 && b[0] < nx) nx = b[0];
      return Number.isFinite(nx) ? (nb.x1 + nx) / 2 : nb.x1 + 1.2 * ss;
    }
    
    function regionLanes() {
      const spans = fixes.filter((f) => f.window && f.window.kFrom != null).map((f) => ({ n: f.n, a: f.window.kFrom, z: f.window.kTo == null ? f.window.kFrom : f.window.kTo }))
        .sort((p, q) => p.a - q.a || p.z - q.z || p.n - q.n);
      const out = new Map();
      let group = [], end = -Infinity;
      const close = () => {
        const ends = [];                                   
        for (const g of group) {
          let i = ends.findIndex((e) => e < g.a);
          if (i < 0) { i = ends.length; ends.push(g.z); } else ends[i] = g.z;
          g.lane = i;
        }
        for (const g of group) out.set(g.n, { i: g.lane, n: Math.max(1, ends.length) });
        group = [];
      };
      for (const sp of spans) {
        if (group.length && sp.a > end) close();
        group.push(sp);
        end = Math.max(end, sp.z);
      }
      if (group.length) close();
      return out;
    }
    
    const hits = new Map();
    function hitFor(n) {
      if (hits.has(n)) return hits.get(n);
      const f = fixes.find((x) => x.n === n);
      const reg = document.createElement('button');
      reg.type = 'button'; reg.className = 'mvsc-region'; reg.dataset.n = String(n); reg.hidden = true;
      reg.setAttribute('aria-label', `Fix ${n}: ${(f && (f.cardTitle || f.title)) || ''}`.trim());
      if (opts.numbers) { const sn = document.createElement('span'); sn.className = 'mvsc-region-n'; sn.textContent = String(n); reg.append(sn); }
      const pin = document.createElement('button');
      pin.type = 'button'; pin.className = 'mvsc-pin'; pin.dataset.n = String(n); pin.hidden = true; pin.textContent = String(n);
      pin.setAttribute('aria-label', `Go to fix ${n}`);
      for (const b of [reg, pin]) b.addEventListener('click', (e) => { e.stopPropagation(); if (opts.onPin) opts.onPin(n); });
      hit.append(reg, pin);
      const o = { reg, pin };
      hits.set(n, o);
      return o;
    }
    for (const f of fixes) hitFor(f.n);
    paper.addEventListener('click', (e) => {
      if (!opts.onTap || !st.view) return;
      const r = paper.getBoundingClientRect(), T = fit(current());
      const x = (e.clientX - r.left - T.tx) / T.s;
      const b = G.bars.find((q) => x >= q.x0 && x < q.x1) || null;
      opts.onTap({ x, k: b ? b.k : null, bar: b ? b.m : null });
    });
    
    const defs = svgEl('defs', {});
    const lg = svgEl('linearGradient', { id: 'mvsc-grad', x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
    svgEl('stop', { offset: 0, 'stop-color': '#C084FC' }, lg);
    svgEl('stop', { offset: 1, 'stop-color': '#F472B6' }, lg);
    const gradHost = svgEl('svg', { width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute' });
    gradHost.append(defs);
    root.append(gradHost);
    function kick() { if (!st.raf && !st.destroyed) st.raf = requestAnimationFrame(() => { st.raf = 0; draw(); }); }
    const ro = window.ResizeObserver ? new ResizeObserver(() => kick()) : null;
    if (ro) ro.observe(paper);
    
    const path = Array.isArray(S.path) ? S.path.filter((p) => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])) : [];
    function timeToX(t) {
      if (!path.length || !Number.isFinite(t)) return null;
      if (t <= path[0][0]) return path[0][1];
      if (t >= path[path.length - 1][0]) return path[path.length - 1][1];
      let lo = 0, hi = path.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path[m][0] <= t) lo = m; else hi = m; }
      const [t0, x0] = path[lo], [t1, x1] = path[hi];
      return x0 + (x1 - x0) * ((t - t0) / Math.max(1e-6, t1 - t0));
    }
    const api = {
      el: root,
      overview(animate = true) {
        const [y0, y1] = rowsFor('both');
        const pad = 0.8 * ss;
        setView({ kind: 'overview', x0: Math.min(left, G.x0 - pad), x1: G.x1 + pad, y0: y0 - 3.2 * ss, y1, hand: 'both' }, animate);
      },
      follow(x, span) {
        const [y0, y1] = rowsFor('both');
        const { w, h } = box();
        const s = h / (y1 - y0 + 3.2 * ss);
        const half = Math.max(span || 0, (w / s)) / 2;
        const cx = Math.max(left + half, Math.min(G.x1 + 0.8 * ss - half, x == null ? left + half : x));
        st.view = { kind: 'follow', x0: cx - half, x1: cx + half, y0: y0 - 3.2 * ss, y1, hand: 'both' };
        st.from = null; st.anim = 0;
        root.dataset.view = 'follow';
        kick();
      },
      focus(fix, animate = true) {
        const wk = (fix && fix.window) || {};
        if (wk.kFrom == null) return api.overview(animate);
        const [a, z] = spanOfKs(wk.kFrom, wk.kTo);
        
        
        const see = Array.isArray(fix.see) ? [Math.min(wk.kFrom, fix.see[0]), Math.max(wk.kTo != null ? wk.kTo : wk.kFrom, fix.see[1])] : [wk.kFrom, wk.kTo];
        const [va, vz] = spanOfKs(see[0], see[1]);
        const hand = wk.hand === 'R' || wk.hand === 'L' ? wk.hand : 'both';
        let [y0, y1] = rowsFor(hand);
        y0 -= 1.6 * ss; y1 += 0.4 * ss;
        if (opts.tight) {
          
          
          const sv = hand === 'R' || hand === 'L' ? [staffOf(hand)].filter(Boolean) : staves;
          const ids = sv.map((x) => x.staff);
          const heads = Object.values(G.notes).filter((b) => b[5] >= see[0] && b[5] <= see[1] && (!ids.length || ids.includes(b[4])));
          const ys = [...sv.flatMap((x) => x.y), ...heads.flatMap((b) => [b[1], b[3]]),
            ...((fix.marks || []).filter((m) => Number.isFinite(m.y)).map((m) => m.y))];
          if (ys.length) { y0 = Math.min(...ys) - 3.4 * ss; y1 = Math.max(...ys) + 3.6 * ss; }
        }
        
        
        let [ca, cz] = [a, z];
        let pickup = 0;
        for (const id of Array.isArray(fix.play) ? fix.play : []) {
          const b = G.notes[id];
          if (b) { ca = Math.min(ca, b[0] - 0.2 * ss); cz = Math.max(cz, b[2] + 0.2 * ss); }
          else if (/^b0\./.test(id) && /\.R\d+$/.test(id)) pickup++;      
        }
        
        
        if (pickup && wk.kFrom <= 1) ca = Math.min(ca, (Number.isFinite(G.x0) ? G.x0 : a) - (Math.min(pickup, 4) * 2.6 + 0.6) * ss);
        setView({ kind: 'window', x0: Math.min(a, va, ca) - 1.0 * ss, x1: Math.max(z, vz, cz) + 0.8 * ss, y0, y1, hand, k0: wk.kFrom, fix: fix.n, span: [ca, cz] }, animate);
      },
      
      fitHeight() {
        const v = st.view;
        if (!opts.tight || !v || v.kind !== 'window') return null;
        const { w } = box();
        const s = Math.min(w / Math.max(1, v.x1 - v.x0), (w / 900) * MAX_ZOOM);
        return Math.ceil((v.y1 - v.y0) * s);
      },
      marks(list) {
        const now = performance.now();
        const before = new Set(st.marks.map((m) => `${m.kind}:${m.noteId}`));
        st.marks = (Array.isArray(list) ? list : []).filter((m) => m && G.notes[m.noteId])
          .map((m) => ({ ...m, at: before.has(`${m.kind}:${m.noteId}`) || calm() ? null : now }));
        
        const bars = new Set();
        for (const m of st.marks.filter((x) => x.kind === 'octave').sort((a, b) => noteBox(a.noteId).cx - noteBox(b.noteId).cx)) {
          const k = noteBox(m.noteId).k;
          m.words = !bars.has(k);
          bars.add(k);
        }
        kick();
      },
      badge(on) { st.badge = !!on; kick(); },
      playhead(x) { st.playX = Number.isFinite(x) ? x : null; kick(); },
      timeToX,
      noteX(id) { const b = noteBox(id); return b ? b.cx : null; },
      kOf(id) { const b = G.notes[id]; return b && Number.isFinite(b[5]) ? b[5] : null; },     
      sound(id, tick, s = SOUND_S, kind = 'sounding') {   
        if (!G.notes[id]) return;                     
        st.sounding.set(id, { until: performance.now() + 1000 * Math.max(0.1, Math.min(3, +s || SOUND_S)), kind });
        kick();
      },
      clearTicks() { st.played.clear(); kick(); },
      played(id) { if (G.notes[id]) { st.played.add(id); kick(); } },
      past(on) { st.past = !!on; kick(); },
      hold(id) { st.holdId = id && G.notes[id] ? id : null; kick(); },
      pins(mode) { st.pinMode = mode; if (mode !== 'drop') st.dropAt.clear(); kick(); },
      dropPin(n) { if (!st.dropAt.has(n)) st.dropAt.set(n, performance.now()); kick(); },
      dim(on) { st.dimmed = !!on; root.classList.toggle('dim', !!on); },
      active(n) { for (const [k, o] of hits) o.reg.classList.toggle('on', k === n); },
      state() {
        const v = current();
        return { view: v ? v.kind : null, hand: st.hand, fix: v && v.fix != null ? v.fix : null, pinMode: st.pinMode,
          pins: [...hits.entries()].filter(([, o]) => !o.pin.hidden).map(([n]) => n),
          regions: [...hits.entries()].filter(([, o]) => !o.reg.hidden).map(([n]) => n),
          marks: st.marks.map((m) => `${m.kind}:${m.noteId}`), playheadX: st.playX, sounding: st.sounding.size,
          soundingIds: [...st.sounding.keys()], played: st.played.size, past: st.past,
          heads: Object.fromEntries(Object.entries(heads).map(([k, m]) => [k, [...m.keys()]])),
          hold: st.holdId, badge: !!st.badge, fade: st.fade || null, tiles: imgs.map((im) => !!im.complete && im.naturalWidth > 0) };
      },
      
      notePoint(id) {
        const nb = noteBox(id), v = current();
        if (!nb || !v) return null;
        const T = fit(v), r = paper.getBoundingClientRect();
        const [x, y] = proj(T, nb.cx, nb.y0);
        return { x: r.left + x, y: r.top + y };
      },
      redraw() { kick(); },
      
      drawNow() { if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; } if (!st.destroyed) draw(); },
      destroy() {
        st.destroyed = true;
        if (st.raf) cancelAnimationFrame(st.raf);
        if (ro) ro.disconnect();
        root.remove();
      },
    };
    api.overview(false);
    return api;
  }
  window.MVScoreCard = { mount };
})();
