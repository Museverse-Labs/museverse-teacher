


























(() => {
  'use strict';
  const COL = { L: '#A855F7', R: '#EC4899', '?': '#C084FC' };
  
  
  const WHO = { muse: 'Muse Spark', fixed: 'Fixed lines' };
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v, n = 600) => (typeof v === 'string' ? v.slice(0, n) : '');
  const mmss = (s) => { s = Math.max(0, Math.round(+s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sentences = (t) => (str(t, 4000).match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || []).map((s) => s.trim()).filter(Boolean);
  let V = null;            

  
  function opening(res) {
    const lines = [];
    const s = res.summary || {};
    for (const x of sentences(s.say)) lines.push(x);
    for (const f of Array.isArray(res.findings) ? res.findings.slice(0, 3) : []) {
      const say = str(f.say, 400) || str(f.what, 400);
      if (say && !lines.includes(say)) lines.push(say);
    }
    for (const g of Array.isArray(res.strengths) ? res.strengths.slice(0, 2) : []) {
      const say = str(g.say, 300);
      if (say && !lines.includes(say)) lines.push(say);
    }
    const p = res.plan || {};
    const first = Array.isArray(p.blocks) && p.blocks[0];
    if (first && str(first.title, 200)) lines.push(`Today: ${str(first.title, 200)}${num(first.minutes) ? `, ${first.minutes} minutes` : ''}.`);
    return lines.slice(0, 8);
  }
  
  
  function sourceOf(res) {
    const L = (res && res.lesson) || {};
    const judged = !!(L.judge && typeof L.judge === 'object');
    const spoke = (Array.isArray(L.muse) && L.muse.length > 0) || ((res.summary || {}).source || 'fixed') !== 'fixed';
    if (judged && spoke) return 'Judged by Muse Wonder, spoken by Muse Spark, on Meta';
    if (judged) return 'Judged by Muse Wonder, on Meta';
    return spoke ? 'Muse Spark, on Meta' : 'Fixed lines';
  }
  
  
  function lineWho(L, id) {
    const J = L && L.judge && Array.isArray(L.judge.lines) ? L.judge.lines : [];
    if (id && J.includes(id)) return 'Muse Wonder';
    if (id && L && Array.isArray(L.muse) && L.muse.includes(id)) return 'Muse Spark';
    return 'Muse';
  }

  
  function vitals(res) {
    const st = (res.summary || {}).stats || {}, out = [];
    const notes = num(st.notes) ?? (Array.isArray(res.notes) ? res.notes.length : null);
    if (notes != null) out.push({ big: String(notes), small: 'notes heard', ring: null });
    if (num(st.notesPerS) != null) out.push({ big: (+st.notesPerS).toFixed(1), unit: '/s', small: 'pace', ring: Math.min(1, st.notesPerS / 8) });
    if (num(st.handsSeenShare) != null) out.push({ big: String(Math.round(st.handsSeenShare * 100)), unit: '%', small: 'hands in view', ring: st.handsSeenShare });
    const kb = res.keyboard || {};
    if (num(kb.framesLocked) != null && num(kb.framesTotal)) out.push({ big: String(Math.round(kb.framesLocked / kb.framesTotal * 100)), unit: '%', small: 'keyboard found', ring: kb.framesLocked / kb.framesTotal });
    const chords = ((res.analysis || {}).measures || []).filter((m) => m && m.item === 'rolled_chords' && num(m.median) != null);
    if (chords.length) {
      const ms = Math.round(Math.max(...chords.map((m) => m.median)));
      out.push({ big: String(ms), unit: 'ms', small: 'chord spread', ring: Math.max(0, 1 - ms / 50) });
    }
    return out.slice(0, 5);
  }
  
  
  function statsFor(res) {
    const root = el('section', 'tb-glance');
    root.setAttribute('aria-label', 'At a glance');
    root.append(el('h3', 'tg-h', 'At a glance'));
    const secs = sectionsTrimmed(res), hands = secs.length ? handsOf(res) : null;
    if (hands) {
      const box = el('div', 'tg-hands');
      for (const h of ['L', 'R']) {
        const sm = hands.summary[h];
        if (!sm.state) continue;
        const row = el('p', `tg-hand ${sm.state}`);
        row.dataset.h = h; row.title = sm.say;
        row.append(el('b', '', h === 'L' ? 'Left hand' : 'Right hand'), el('span', '', sm.short));
        box.append(row);
      }
      root.append(box);
    }
    if (secs.length) {
      const key = el('p', 'tg-key');
      for (const st of ['good', 'fix', 'unsure']) if (secs.some((x) => x.state === st)) key.append(el('span', `tg-k tg-k-${st}`, SEC[st].word));
      if (hands) key.append(el('span', 'tg-note', hands.by === 'score' ? "Each hand's part as the score gives it" : 'The hands as the video placed them'));
      root.append(key);
    }
    const v = vitals(res);
    if (v.length) {
      const nums = el('p', 'tg-nums');
      for (const x of v) { const n = el('span', 'tg-n'); n.append(el('b', '', `${x.big}${x.unit ? (x.unit === '%' ? '%' : ` ${x.unit}`) : ''}`), el('small', '', x.small)); nums.append(n); }
      root.append(nums);
    }
    const cr = el('a', 'tg-credit', 'Hand model and other credits');
    cr.href = 'notices.html'; cr.target = '_blank'; cr.rel = 'noopener';
    root.append(cr);
    return root;
  }

  
  
  
  
  const HC_CLEAR = { yes: 'In view', partly: 'Partly in view', no: 'Not in view' };
  function hcDetail(m) {
    if (m.state === 'silent') return '';
    if (m.id === 'place' && m.hands) {
      const hs = ['L', 'R'].filter((h) => m.hands[h]).map((h) => `${h === 'L' ? 'left' : 'right'} hand ${Math.round(m.hands[h].typicalMm)} mm`);
      const t = hs.join(', ');
      return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)} from the pianist's place, typically` : '';
    }
    if (m.id === 'arrival' && m.jumps) return `The pianist ${(+m.pianistAheadS).toFixed(2)} s ahead at the same ${m.jumps.length} jumps`;
    if (m.id === 'travel' && m.perBar) {
      const a = m.perBar.reduce((s, r) => s + r.mm, 0), b = m.perBar.reduce((s, r) => s + r.pianistMm, 0);
      return `You ${Math.round(a / 10)} cm, the pianist ${Math.round(b / 10)} cm, over ${m.perBar.length} bars`;
    }
    if (m.id === 'handPerNote' && m.notes) return `${m.agree} of ${m.notes} notes${m.excused ? `, ${m.excused} as the pianist plays them` : ''}`;
    return '';
  }
  function handsFor(res) {
    const hc = res && res.handCheck;
    if (!hc || !hc.seen) return null;
    const root = el('section', 'tb-hc');
    root.setAttribute('aria-label', 'Your hands, measured');
    root.append(el('h3', 'tg-h', 'Your hands, measured'));
    root.append(el('p', 'hc-say', hc.seen.say || ''));
    const bars = (hc.seen.bars || []).filter((b) => b.notes || b.clear);
    if (bars.length) {
      const strip = el('div', 'hc-bars');
      strip.setAttribute('role', 'list');
      for (const b of bars) {
        const c = el('span', `hc-b hc-${b.clear || 'none'}`);
        c.setAttribute('role', 'listitem');
        const what = b.clear ? `${b.seen} of ${b.notes} notes with the hand in view` : 'no hand to look for';
        c.title = `Bar ${b.bar}${b.pass_ > 1 ? ' (again)' : ''}: ${what}`;
        c.setAttribute('aria-label', c.title);
        c.append(el('i', ''), el('small', '', String(b.bar)));
        strip.append(c);
      }
      root.append(strip);
      const key = el('p', 'tg-key');
      for (const k of ['yes', 'partly', 'no']) if (bars.some((b) => b.clear === k)) key.append(el('span', `hc-k hc-k-${k}`, HC_CLEAR[k]));
      root.append(key);
    }
    const list = el('div', 'hc-ms');
    for (const m of hc.measures || []) {
      const row = el('p', `hc-m hc-${m.state}`);
      row.dataset.m = m.id;
      const tag = m.state === 'judged' ? 'To work on' : m.state === 'silent' ? 'Not measured' : '';
      row.append(el('b', '', m.title));
      if (tag) row.append(el('em', '', tag));
      row.append(el('span', '', m.state === 'silent' ? `${m.whySay.charAt(0).toUpperCase()}${m.whySay.slice(1)}.` : m.say));
      const d = hcDetail(m);
      if (d) row.append(el('small', '', d));
      list.append(row);
    }
    root.append(list);
    root.append(el('p', 'tg-note', "From SAM 3.1's outlines of your hands, five frames a second" +
      (hc.pianist ? ", against a pianist's recorded hands at the same notes" : '') +
      '. A measure says nothing unless what it needs was clearly in view.'));
    return root;
  }

  
  function frameAt(res, t) {
    const ft = (res.media && res.media.frameTimes) || [];
    if (!ft.length) return -1;
    let lo = 0, hi = ft.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ft[mid] < t) lo = mid + 1; else hi = mid; }
    return lo > 0 && Math.abs(ft[lo - 1] - t) < Math.abs(ft[lo] - t) ? lo - 1 : lo;
  }
  function poly(ctx, pts, s) {
    if (!Array.isArray(pts) || pts.length < 3) return false;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s)));
    ctx.closePath();
    return true;
  }
  function drawOverlay() {
    if (!V) return;
    const { res, video, ov } = V;
    const W = (res.job && res.job.video && res.job.video.width) || video.videoWidth;
    const box = ov.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!box.width || !W) return;
    if (ov.width !== Math.round(box.width * dpr)) { ov.width = Math.round(box.width * dpr); ov.height = Math.round(box.height * dpr); }
    const ctx = ov.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    if (!V.overlayOn) return;
    
    
    const H = (res.job && res.job.video && res.job.video.height) || video.videoHeight || W;
    const s = Math.min(box.width / W, box.height / H);
    ctx.translate((box.width - W * s) / 2, (box.height - H * s) / 2);
    
    
    
    
    const t = V.mediaT != null ? V.mediaT : video.currentTime;
    let hands = null;
    if (window.MVOutlines) {
      const o = window.MVOutlines.at(res, t);
      if (!o.near) return;
      hands = o.hands;
    } else {
      const i = frameAt(res, t);
      if (i < 0) return;
      hands = Array.isArray(res.hands) ? res.hands[i] : null;
    }
    ctx.lineJoin = 'round';
    
    
    for (const lab of ['L', 'R']) {
      const h = hands && hands[lab];
      if (!h || !poly(ctx, h.poly, s)) continue;
      
      
      const st = handAt(lab, t), fix = !!st && st.state === 'fix', good = !!st && st.state === 'good';
      
      if (V.secs && V.secs.length && !st) continue;
      ctx.save();
      ctx.shadowColor = fix ? '#F87171' : good ? '#34D399' : COL[lab]; ctx.shadowBlur = fix ? 30 : 18;
      ctx.fillStyle = fix ? 'rgba(248, 113, 113, 0.45)' : lab === 'L' ? 'rgba(168, 85, 247, 0.22)' : 'rgba(236, 72, 153, 0.22)';
      ctx.fill();
      ctx.strokeStyle = fix ? '#FCA5A5' : good ? '#34D399' : COL[lab]; ctx.lineWidth = fix ? 3 : 2; ctx.stroke();
      ctx.restore();
      if (fix && st.what) {
        
        const pts = h.poly, topI = pts.reduce((k, p, j) => (+p[1] < +pts[k][1] ? j : k), 0);
        const tx = +pts[topI][0] * s, ty = +pts[topI][1] * s, ox = (box.width - W * s) / 2, oy = (box.height - H * s) / 2;
        const txt = `${lab === 'L' ? 'Left' : 'Right'}: ${st.what}`;
        ctx.font = '700 13px "Wix Madefor Display", system-ui, sans-serif';
        const tw = ctx.measureText(txt).width, bw = tw + 14, bh = 22;
        const bx = Math.max(4 - ox, Math.min(box.width - ox - bw - 4, tx - bw / 2)), by = Math.max(4 - oy, ty - bh - 10);
        ctx.fillStyle = 'rgba(60, 18, 18, 0.9)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 11) : ctx.rect(bx, by, bw, bh); ctx.fill();
        ctx.fillStyle = '#FCA5A5'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 7, by + bh / 2 + 0.5);
      }
    }
  }

  
  
  
  const SEC = {
    good: { fill: 'rgba(52, 211, 153, 0.17)', line: '#34D399', word: 'Played well' },
    fix: { fill: 'rgba(248, 113, 113, 0.20)', line: '#F87171', word: 'To fix' },
    unsure: { fill: 'rgba(255, 255, 255, 0.035)', line: 'rgba(243, 244, 246, 0.25)', word: "Couldn't tell" },
  };
  const HAND = { L: 'left hand', R: 'right hand' };
  const okSec = (x) => x && SEC[x.state] && num(x.fromS) != null && num(x.toS) != null && x.toS > x.fromS;
  
  
  const TAIL_SOLID_S = 1.0, TAIL_MAX_S = 1.5;
  function trimTail(xs) {
    let k = -1;
    for (let i = xs.length - 1; i >= 0; i--) if (xs[i].state !== 'unsure' && xs[i].b - xs[i].a >= TAIL_SOLID_S) { k = i; break; }
    if (k < 0 || k === xs.length - 1) return xs;
    const tail = xs.slice(k + 1).filter((x) => x.state !== 'unsure');
    if (!tail.length || tail[tail.length - 1].b - tail[0].a > TAIL_MAX_S) return xs;
    return xs.slice(0, k + 1).concat(xs.slice(k + 1).filter((x) => x.state === 'unsure'));
  }
  function sectionsOf(res) {
    const L = res && res.lesson;
    return (L && Array.isArray(L.sections) ? L.sections : []).filter(okSec)
      .map((x) => ({ a: x.fromS, b: x.toS, state: x.state, why: str(x.why, 120), hands: Array.isArray(x.hands) ? x.hands.filter((h) => HAND[h]) : [] }))
      .sort((p, q) => p.a - q.a);
  }
  const sectionsTrimmed = (res) => trimTail(sectionsOf(res));
  
  function handsOf(res) {
    const H = res && res.lesson && res.lesson.hands;
    if (!H || !Array.isArray(H.L) || !Array.isArray(H.R) || !(H.L.length || H.R.length)) return null;
    const lane = (xs) => trimTail(xs.filter(okSec).map((x) => ({ a: x.fromS, b: x.toS, state: x.state, why: str(x.why, 120), what: str(x.what, 60) })).sort((p, q) => p.a - q.a));
    const sum = (h) => { const m = (H.summary || {})[h] || {}; return { state: SEC[m.state] ? m.state : null, short: str(m.short, 120), say: str(m.say, 240) }; };
    return { by: H.by === 'video' ? 'video' : 'score', L: lane(H.L), R: lane(H.R), summary: { L: sum('L'), R: sum('R') } };
  }
  
  
  
  const COMPOSER = { 'fur-elise': 'Ludwig van Beethoven', 'fur-elise-opening': 'Ludwig van Beethoven', 'chopin-nocturne-20': 'Frederic Chopin',
    'mozart-rondo-alla-turca': 'Wolfgang Amadeus Mozart' };
  function trackOf(ctx) {
    const L = lessonOf(ctx.res), pc = L && L.piece && typeof L.piece === 'object' ? L.piece : null;
    const title = pc && str(pc.title, 120) ? str(pc.title, 120).split(/[,:(]/)[0].trim() : str(ctx.name, 120).replace(/\.[a-z0-9]{2,4}$/i, '').trim();
    const by = pc ? str(pc.composer, 80) || COMPOSER[pc.id] || '' : '';
    return { title: title || 'Your take', by: by || 'Your take', composer: pc ? str(pc.composer, 80) || COMPOSER[pc.id] || '' : '' };
  }
  
  function coverOf(composer) {
    const c = String(composer || '').toLowerCase();
    return (window.MVCOVERS && c && Object.keys(window.MVCOVERS).map((k) => (c.includes(k) ? window.MVCOVERS[k] : null)).find(Boolean)) || null;
  }
  
  
  function handAt(lab, t) {
    if (!V) return null;
    if (V.hands) {
      const sc = V.hands[lab].find((x) => t >= x.a && t < x.b);
      return sc && (sc.state === 'fix' || sc.state === 'good') ? sc : null;
    }
    return (V.secs || []).find((x) => t >= x.a && t < x.b && (x.state === 'good' || (x.state === 'fix' && x.hands.includes(lab)))) || null;
  }
  
  
  const LINGER_S = 1.2;
  function showSection(t) {
    if (!V || !V.secs || !V.secs.length) return;
    const s = V.secs.find((x) => t >= x.a && t < x.b) || null;
    const said = s && s.state === 'fix' ? s : V.secs.find((x) => x.state === 'fix' && t >= x.b && t < x.b + LINGER_S) || s;
    const key = `${s ? s.state + s.a : ''}|${said ? said.state + said.a : ''}`;
    if (key === V.secKey) return;
    V.secKey = key;
    const st = s && s.state !== 'unsure' ? s.state : '';
    V.frame.classList.toggle('sec-good', st === 'good');
    V.frame.classList.toggle('sec-fix', st === 'fix');
    const show = said && said.state !== 'unsure' ? said.state : '';
    V.secPill.hidden = !show;
    if (show) {
      V.secPill.className = `mv-sec ${show}`;
      const who = said.hands.length === 2 ? ', both hands' : said.hands.length === 1 ? `, ${HAND[said.hands[0]]}` : '';
      V.secPill.textContent = show === 'fix' && said.why ? `To fix${who}: ${said.why}` : SEC[show].word;
    }
  }

  
  
  function drawRoll() {
    if (!V) return;
    renderScoreHead(V);
    showSection(V.mediaT != null ? V.mediaT : V.video.currentTime);
  }
  function loop() {
    if (!V) return;
    drawOverlay(); drawRoll();
    V.raf = !V.video.paused && !V.video.ended ? requestAnimationFrame(loop) : 0;
  }
  
  function kick() {
    if (!V) return;
    if (window.MVOutlines) {
      if (!V.stopFollow) {
        const me = V;
        V.stopFollow = window.MVOutlines.follow(V.video, (mt) => {
          if (V !== me) return;
          me.mediaT = mt; drawOverlay(); drawRoll();
          if (me.video.paused || me.video.ended) stillFrame();
        });
      }
      return;
    }
    if (!V.raf) V.raf = requestAnimationFrame(loop);
  }
  
  function stillFrame() {
    if (!V) return;
    if (V.stopFollow) { V.stopFollow(); V.stopFollow = null; }
    V.mediaT = null;
    drawOverlay(); drawRoll();
  }

  
  
  
  
  
  
  
  const SC_BAR_MIN = 46, SC_H = 64;
  
  
  
  
  
  const SC_PAPER = 'rgba(247, 246, 244, 0.86)', SC_INK = [26, 25, 24], SC_LIT = [192, 132, 252], SC_PAST = 0.55, SC_LIT_S = [0.15, 0.6];
  const sharpPc = new Set([1, 3, 6, 8, 10]);
  const STEP_OF_PC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];                 
  const diatonic = (m) => (Math.floor(m / 12) - 1) * 7 + STEP_OF_PC[((m % 12) + 12) % 12];
  
  function barsOfPart(p, bars) {
    if (Array.isArray(p.bars) && p.bars.length) return p.bars.map(Number).filter(Number.isFinite);
    if (Number.isFinite(+p.bar)) return [+p.bar];
    const tk = p.take && num(p.take.fromS) != null ? p.take : null;
    return tk ? bars.filter((b) => b.take && b.toS > tk.fromS && b.fromS < tk.toS).map((b) => b.bar) : [];
  }
  function scoreModel(res) {
    const L = (res && res.lesson) || {};
    const view = L.view && typeof L.view === 'object' ? L.view : null;
    const ref = res && res.reference && typeof res.reference === 'object' ? res.reference : {};
    const rb = Array.isArray(ref.bars) ? ref.bars.filter((b) => b && typeof b === 'object') : [];
    const src = L.timeline && Array.isArray(L.timeline.bars) && L.timeline.bars.length ? L.timeline.bars : Array.isArray(ref.barStats) ? ref.barStats : [];
    const notesOf = (b) => {
      const r = rb.find((x) => (b.k != null && x.k === b.k) || (x.bar === b.bar && (x.pass || 1) === (b.pass || 1)));
      return (r && Array.isArray(r.notes) ? r.notes : []).filter((n) => n && Number.isFinite(+n.midi))
        .map((n) => ({ m: +n.midi, h: n.hand === 'L' || n.hand === 'R' ? n.hand : +n.midi < 60 ? 'L' : 'R', t: num(n.t), j: num(n.j) }));
    };
    let bars = src.filter((b) => b && Number.isFinite(+b.bar)).map((b) => ({ bar: +b.bar, pass: +b.pass || 1, k: b.k, fromS: num(b.fromS), toS: num(b.toS), take: true }))
      .map((b) => ({ ...b, notes: notesOf(b) }));
    
    const sv = view && view.score && typeof view.score === 'object' ? view.score : null;
    
    
    const geomOk = !!(sv && sv.geom && typeof sv.geom === 'object' && sv.geom.notes && Array.isArray(sv.geom.bars) && sv.geom.bars.length);
    const win = geomOk && sv.window && Number.isFinite(+sv.window.fromBar) && Number.isFinite(+sv.window.toBar) && +sv.window.toBar >= +sv.window.fromBar ? sv.window : null;
    const tiles = win && Array.isArray(sv.tiles) ? sv.tiles.filter((t) => t && /^[A-Za-z0-9_-]{1,64}$/.test(String(t.id)) && Number.isFinite(+t.fromBar) && Number.isFinite(+t.toBar))
      .map((t) => ({ id: String(t.id), fromBar: +t.fromBar, toBar: +t.toBar, x0: num(t.x0), x1: num(t.x1) })).sort((a, b) => a.fromBar - b.fromBar) : [];
    if (win && tiles.length) {
      const span = [];
      for (let b = +win.fromBar; b <= +win.toBar && span.length < 400; b++) {
        const t = bars.find((x) => x.bar === b);
        span.push(t || { bar: b, pass: 1, fromS: null, toS: null, take: false, notes: [] });
      }
      bars = span;
    }
    
    let fixes = [];
    if (view && Array.isArray(view.fixes)) {
      
      const partBars = (i) => (Number.isInteger(i) && Array.isArray(L.parts) && L.parts[i] && Array.isArray(L.parts[i].bars) ? L.parts[i].bars : []);
      fixes = view.fixes.filter((f) => f && typeof f === 'object').map((f, k) => ({ n: +f.n || k + 1, partI: Number.isInteger(f.partI) ? f.partI : null,
        bars: [...new Set([...(Array.isArray(f.bars) ? f.bars : [f.bars]), ...partBars(f.partI)].map(Number).filter(Number.isFinite))].sort((x, y) => x - y),
        title: str(f.cardTitle || f.title, 80), hand: f.hand, kind: str(f.kind, 20) }));
    } else if (L.timeline && Array.isArray(L.timeline.bubbles) && L.timeline.bubbles.length) {
      fixes = L.timeline.bubbles.filter((b) => b && typeof b === 'object').map((b, k) => {
        const p = Array.isArray(L.parts) && Number.isInteger(b.i) ? L.parts[b.i] : null;
        const bs = Number.isFinite(+b.bar) ? [+b.bar] : p ? barsOfPart(p, bars) : [];
        return { n: +b.n || k + 1, partI: Number.isInteger(b.i) ? b.i : null, bars: bs, title: str(b.title, 80), hand: b.hand, kind: str(b.kind, 20) };
      });
    } else if (Array.isArray(L.parts)) {
      fixes = L.parts.map((p, k) => ({ n: k + 1, partI: Number.isInteger(p.i) ? p.i : k, bars: barsOfPart(p, bars), title: str(p.title, 80), hand: p.hand, kind: str(p.kind, 20) }));
    }
    fixes = fixes.filter((f) => f.bars.length).slice(0, 9);
    
    if (!tiles.length) {
      for (const f of fixes) {
        const lo = Math.min(...f.bars), hi = Math.max(...f.bars);
        for (let b = lo; b <= hi && b - lo < 8; b++) {
          if (bars.some((x) => x.bar === b)) continue;
          const p = Array.isArray(L.parts) && f.partI != null ? L.parts[f.partI] : null;
          const gn = p && p.ghost && Array.isArray(p.ghost.notes) ? p.ghost.notes.filter((r) => Array.isArray(r) && Number.isFinite(+r[2])) : [];
          const per = Math.ceil(gn.length / (hi - lo + 1)), mine = gn.slice((b - lo) * per, (b - lo + 1) * per);
          const t0 = mine.length ? +mine[0][0] : 0, t1 = mine.length ? Math.max(t0 + 0.5, +mine[mine.length - 1][0] + 0.3) : 1;
          bars.push({ bar: b, pass: 1, fromS: null, toS: null, take: false, span: [t0, t1],
            notes: mine.map((r) => ({ m: +r[2], h: r[4] === 'L' || r[4] === 'R' ? r[4] : +r[2] < 60 ? 'L' : 'R', t: +r[0], j: null })) });
        }
      }
      const order = (x) => (x.take ? -1 : 0);
      bars.sort((a, b) => (a.take && b.take ? 0 : a.bar - b.bar || order(a) - order(b)));
      
      const take = bars.filter((x) => x.take), rest = bars.filter((x) => !x.take);
      const last = take.length ? take[take.length - 1].bar : -Infinity;
      bars = [...rest.filter((x) => x.bar < (take.length ? take[0].bar : Infinity)), ...take, ...rest.filter((x) => x.bar > last)];
    }
    for (const f of fixes) {
      const idx = bars.map((b, i) => (f.bars.includes(b.bar) ? i : -1)).filter((i) => i >= 0);
      f.a = idx.length ? Math.min(...idx) : -1; f.b = idx.length ? Math.max(...idx) : -1;
      
      f.runs = [];
      for (const i of idx) { const r = f.runs[f.runs.length - 1]; if (r && i === r[1] + 1) r[1] = i; else f.runs.push([i, i]); }
    }
    fixes = fixes.filter((f) => f.a >= 0);
    if (!bars.length) return null;
    const M = { bars, fixes, tiles: tiles.length ? tiles : null, win: tiles.length ? win : null, card: tiles.length ? sv : null,
      strip: tiles.length ? scoreStrip(sv, bars, res) : null };
    placeFixes(M);
    return M;
  }
  
  
  
  
  
  function scoreStrip(sv, bars, res) {
    const G = sv && sv.geom && typeof sv.geom === 'object' ? sv.geom : null;
    if (!G || !Array.isArray(G.bars) || !Array.isArray(sv.tiles) || !sv.tiles.every((t) => t && num(t.x0) != null && num(t.x1) > num(t.x0))) return null;
    const used = new Set();
    const gs = bars.map((b) => {
      const free = G.bars.filter((g) => g && g.m === b.bar && !used.has(g.k) && num(g.x0) != null && num(g.x1) > num(g.x0));
      const g = free.find((x) => (x.p || 1) === (b.pass || 1)) || free[0] || null;
      if (g) used.add(g.k);
      return g;
    });
    if (!gs.every(Boolean)) return null;
    const ss = num(G.ss) || 24, X0 = Math.min(...gs.map((g) => +g.x0)) - ss, X1 = Math.max(...gs.map((g) => +g.x1)) + ss;
    const fx = (x) => (x - X0) / (X1 - X0);
    const boxes = G.notes && typeof G.notes === 'object' ? G.notes : {};
    const lit = [];
    for (const b of (res && res.reference && Array.isArray(res.reference.bars) ? res.reference.bars : [])) {
      for (const n of (b && Array.isArray(b.notes) ? b.notes : [])) {
        const bx = n && typeof n.id === 'string' ? boxes[n.id] : null;
        if (num(n.t) != null && Array.isArray(bx) && bx.slice(0, 4).every((v) => num(v) != null)) lit.push({ t: +n.t, box: bx.slice(0, 4).map(Number), staff: bx[4] });
      }
    }
    lit.sort((a, b) => a.t - b.t);
    
    lit.forEach((n, i) => {
      const nx = lit.slice(i + 1).find((m) => m.staff === n.staff && m.t > n.t + 0.02);
      n.u = n.t + Math.max(SC_LIT_S[0], Math.min(SC_LIT_S[1], nx ? nx.t - n.t : SC_LIT_S[1]));
    });
    const path = Array.isArray(sv.path) ? sv.path.filter((q) => Array.isArray(q) && num(q[0]) != null && num(q[1]) != null).map((q) => [+q[0], +q[1]]) : [];
    return { X0, X1, ss, fx, boxes, spans: gs.map((g) => [fx(+g.x0), fx(+g.x1)]), path, lit, geom: G,
      bars: gs.map((g) => ({ k: g.k, m: g.m, x0: +g.x0, x1: +g.x1 })) };
  }
  
  const spansOf = (M) => (M.strip ? M.strip.spans : M.bars.map((b, i) => [i / M.bars.length, (i + 1) / M.bars.length]));
  
  function fracAt(M, p) {
    const sp = spansOf(M), N = sp.length;
    if (!(p > 0)) return sp[0][0];
    const i = Math.min(N - 1, Math.floor(p)), [a, b] = sp[i];
    return a + Math.min(1, p - i) * (b - a);
  }
  
  
  
  function placeFixes(M) {
    const sp = spansOf(M);
    M.regions = [];
    for (const f of M.fixes) {
      f.lo = sp[f.a][0]; f.hi = sp[f.b][1];
      f.regs = (f.runs && f.runs.length ? f.runs : [[f.a, f.b]]).map(([a, b]) => ({ f, a, b, lo: sp[a][0], hi: sp[b][1] }));
      M.regions.push(...f.regs);
    }
    const order = [...M.regions].sort((x, y) => x.lo - y.lo || x.f.n - y.f.n);
    for (let i = 0; i < order.length;) {
      let j = i + 1, hi = order[i].hi;
      while (j < order.length && order[j].lo < hi - 1e-6) { hi = Math.max(hi, order[j].hi); j++; }
      const run = order.slice(i, j), lo = run[0].lo, w = (hi - lo) / run.length;
      run.forEach((r, k) => { if (run.length > 1) { r.left = lo + k * w; r.width = w; } else { r.left = r.lo; r.width = r.hi - r.lo; } });
      i = j;
    }
    
    for (const f of M.fixes) { f.left = f.regs[0].left; f.width = f.regs[0].width; }
  }
  const pct = (f) => `${+(f * 100).toFixed(4)}%`;
  
  
  function staffSvg(M, W) {
    const NS = 'http://www.w3.org/2000/svg', N = M.bars.length, bw = W / N, PAD = Math.min(8, bw * 0.16);
    const mk = (tag, at, text) => { const n = document.createElementNS(NS, tag); for (const k in at) n.setAttribute(k, at[k]); if (text != null) n.textContent = text; return n; };
    const svg = mk('svg', { class: 'mv-sc-staff', viewBox: `0 0 ${W.toFixed(1)} ${SC_H}`, width: W.toFixed(1), height: String(SC_H), 'aria-hidden': 'true' });
    const T = [12, 16, 20, 24, 28], B = [38, 42, 46, 50, 54];               
    for (const y of [...T, ...B]) svg.append(mk('line', { x1: 0, x2: W.toFixed(1), y1: y, y2: y, class: 'sc-line' }));
    M.bars.forEach((b, i) => {
      const x0 = i * bw;
      svg.append(mk('line', { x1: x0.toFixed(1), x2: x0.toFixed(1), y1: 12, y2: 54, class: 'sc-barline' }));
      if (i === 0 || b.bar !== M.bars[i - 1].bar + 1 || b.pass > 1) svg.append(mk('text', { x: (x0 + 3).toFixed(1), y: 8, class: 'sc-num' }, String(b.bar)));
      else svg.append(mk('text', { x: (x0 + 3).toFixed(1), y: 8, class: 'sc-num' }, String(b.bar)));
      const ns = b.notes.slice(0, 40);
      const ts = ns.map((n) => n.t).filter((t) => t != null);
      const a = b.fromS != null && b.toS != null && b.toS > b.fromS ? b.fromS : b.span ? b.span[0] : ts.length ? Math.min(...ts) : null;
      const z = b.fromS != null && b.toS != null && b.toS > b.fromS ? b.toS : b.span ? b.span[1] : ts.length ? Math.max(...ts) + 0.3 : null;
      ns.forEach((n, k) => {
        const f = n.t != null && a != null && z > a ? Math.max(0, Math.min(1, (n.t - a) / (z - a))) : (k + 0.5) / ns.length;
        const x = x0 + PAD + f * Math.max(4, bw - 2 * PAD), d = diatonic(n.m);
        
        let y = n.h === 'L' ? 54 - (d - 18) * 2 : 28 - (d - 30) * 2;
        y = Math.max(3, Math.min(SC_H - 3, y));
        const top = n.h === 'L' ? 38 : 12, bot = n.h === 'L' ? 54 : 28;
        for (let ly = bot + 4; ly <= y + 0.1; ly += 4) svg.append(mk('line', { x1: (x - 4.5).toFixed(1), x2: (x + 4.5).toFixed(1), y1: ly, y2: ly, class: 'sc-ledger' }));
        for (let ly = top - 4; ly >= y - 0.1; ly -= 4) svg.append(mk('line', { x1: (x - 4.5).toFixed(1), x2: (x + 4.5).toFixed(1), y1: ly, y2: ly, class: 'sc-ledger' }));
        svg.append(mk('ellipse', { cx: x.toFixed(1), cy: y.toFixed(1), rx: 2.9, ry: 2.1, transform: `rotate(-20 ${x.toFixed(1)} ${y.toFixed(1)})`, class: `sc-note ${n.h}` }));
        if (sharpPc.has(((n.m % 12) + 12) % 12)) svg.append(mk('text', { x: (x - 8).toFixed(1), y: (y + 2.5).toFixed(1), class: 'sc-acc' }, '♯'));
      });
    });
    svg.append(mk('line', { x1: (W - 0.5).toFixed(1), x2: (W - 0.5).toFixed(1), y1: 12, y2: 54, class: 'sc-barline' }));
    return svg;
  }
  
  function buildScore(me) {
    const M = me.score, box = me.scoreBox;
    if (me.card) { try { me.card.destroy(); } catch {   } me.card = null; }
    box.replaceChildren();
    box.classList.remove('card');
    if (!M) { box.hidden = true; return; }
    box.hidden = false;
    if (M.card && mountCard(me)) return;
    const inner = el('div', 'mv-sc-in');
    const art = el('div', 'mv-sc-art');
    inner.append(art);
    me.scoreArt = art;
    for (const f of M.fixes) {
      const b = el('button', 'mv-fix');
      b.type = 'button';
      b.dataset.n = String(f.n);
      b.style.left = `${(f.a / M.bars.length) * 100}%`;
      b.style.width = `${((f.b - f.a + 1) / M.bars.length) * 100}%`;
      const lo = M.bars[f.a].bar, hi = M.bars[f.b].bar;
      const where = lo === hi ? `bar ${lo}` : `bars ${lo} to ${hi}`;
      b.setAttribute('aria-label', `Fix ${f.n}: ${f.title || 'the lesson'}, ${where}`);
      b.title = `${f.n}. ${f.title || ''} (${where})`;
      b.append(el('span', 'mv-fix-n', String(f.n)));
      b.addEventListener('click', (e) => { e.stopPropagation(); if (f.partI != null) practisePart(me, f.partI); });
      f.btn = b;
      inner.append(b);
    }
    const head = el('div', 'mv-sc-head');
    head.setAttribute('aria-hidden', 'true');
    inner.append(head);
    me.scoreHead = head; me.scoreIn = inner;
    box.append(inner);
    const lo = M.bars[0].bar, hi = M.bars[M.bars.length - 1].bar;
    box.setAttribute('aria-label', `The score, bar ${lo} to bar ${hi}${M.fixes.length ? `, with ${M.fixes.length} ${M.fixes.length === 1 ? 'fix' : 'fixes'} marked: ${M.fixes.map((f) => `${f.n}, ${f.title}`).join('; ')}` : ''}. Tap a fix to go to it, or a bar to play your take from there.`);
    
    inner.addEventListener('click', (e) => {
      const r = inner.getBoundingClientRect(), i = Math.floor(((e.clientX - r.left) / Math.max(1, r.width)) * M.bars.length);
      const b = M.bars[Math.max(0, Math.min(M.bars.length - 1, i))];
      if (b && b.take && b.fromS != null) playFrom(me, b.fromS);
    });
    
    box.tabIndex = 0;
    box.addEventListener('keydown', (e) => {
      if (!M.fixes.length) return;
      const k = M.fixes.findIndex((f) => f.btn === document.activeElement);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = k < 0 ? 0 : (k + (e.key === 'ArrowRight' ? 1 : M.fixes.length - 1)) % M.fixes.length;
        M.fixes[n].btn.focus();
      }
    });
    layoutScore(me);
  }
  
  
  
  
  const clipOf = (me) => { const v = +(me.res && me.res.media && me.res.media.clipStartS); return Number.isFinite(v) && v > 0 ? v : 0; };
  function mountCard(me) {
    const view = me.res.lesson && me.res.lesson.view, sc = me.score.card;
    if (!window.MVScoreCard || typeof window.MVScoreCard.mount !== 'function' || !me.ctx.score || !view) return false;
    const fixes = (Array.isArray(view.fixes) ? view.fixes : []).filter((f) => f && Number.isInteger(f.n));
    let card = null;
    try {
      card = window.MVScoreCard.mount(me.scoreBox, { score: sc, fixes, numbers: true,
        tileUrl: (id) => me.ctx.score(id),
        onPin: (n) => { const f = fixes.find((x) => x.n === n); if (f && Number.isInteger(f.partI)) practisePart(me, f.partI); },
        onTap: ({ x }) => { const t = cardTime(sc, x); if (t != null) playFrom(me, t); } });   
    } catch (e) {
      console.info(`The score card did not mount: ${(e && e.message) || e}`);
      card = null;
    }
    if (!card) return false;
    me.card = card; me.cardFixes = fixes; me.cardKey = null;
    me.scoreBox.classList.add('card');
    me.scoreBox.tabIndex = -1;
    me.scoreBox.setAttribute('aria-label', `The score${fixes.length ? `, with ${fixes.length} ${fixes.length === 1 ? 'fix' : 'fixes'} marked: ${fixes.map((f) => `${f.n}, ${str(f.cardTitle || f.title, 80)}`).join('; ')}` : ''}. Tap a fix to go to it, or a bar to play your take from there.`);
    card.overview(false);
    renderScoreHead(me);
    return true;
  }
  
  function cardTime(sc, x) {
    const P = Array.isArray(sc.path) ? sc.path.filter((p) => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])) : [];
    if (!P.length || !Number.isFinite(x)) return null;
    if (x <= +P[0][1]) return +P[0][0];
    for (let i = 1; i < P.length; i++) {
      const [t0, x0] = P[i - 1], [t1, x1] = P[i];
      if (x <= +x1) return +x1 > +x0 ? +t0 + (+t1 - +t0) * ((x - +x0) / (+x1 - +x0)) : +t0;
    }
    return +P[P.length - 1][0];
  }
  
  function cardSpan(sc, f) {
    const wk = f.window || {}, bars = Array.isArray(sc.geom.bars) ? sc.geom.bars : [];
    const bs = wk.kFrom == null ? [] : bars.filter((b) => b && b.k >= wk.kFrom && b.k <= (wk.kTo == null ? wk.kFrom : wk.kTo));
    return bs.length ? [Math.min(...bs.map((b) => +b.x0)), Math.max(...bs.map((b) => +b.x1))] : null;
  }
  function cardHead(me) {
    const card = me.card, sc = me.score.card;
    const s = me.mode === 'lesson' && me.plan && me.segI < me.plan.segs.length ? me.plan.segs[me.segI] : null;
    
    const part = s && s.part != null ? s.part : me.mode === 'lesson' && me.at && Number.isInteger(me.at.part) ? me.at.part : null;
    const f = part != null ? me.cardFixes.find((x) => x.partI === part) || null : null;
    const t = me.mediaT != null ? me.mediaT : me.video.currentTime || 0;
    let x = card.timeToX(t);
    const span = f ? cardSpan(sc, f) : null;
    if (f && span && !(s && s.kind === 'take' && s.part === part)) {
      x = span[0];
      if (s && s.kind === 'ghost' && me.curGhost && me.lesson && me.curGhost.part === me.lesson.parts[s.part]) {
        let g = 0;
        try { g = me.curGhost.st.time() / Math.max(0.1, me.curGhost.dur); } catch { g = 0; }
        x = span[0] + clamp01(g) * (span[1] - span[0]);
      }
    }
    card.playhead(x);
    card.active(f ? f.n : null);
    
    
    const cure = !!(s && s.part === part ? /^ghost/.test(s.step || '') : me.at && /^ghost/.test(me.at.step || ''));
    const key = f ? `${f.n}:${cure ? 'cure' : 'yours'}` : '';
    if (key !== me.cardKey) {
      me.cardKey = key;
      const ms = f ? (Array.isArray(f.marks) ? f.marks : []).filter((m) => m && (!cure || m.kind === 'correct')) : [];
      card.marks(ms);
      card.badge(!cure && ms.some((m) => m.kind === 'stop'));
    }
  }
  
  function layoutScore(me) {
    const M = me.score;
    if (me.card || !M || !me.scoreIn || me.scoreBox.hidden) return;
    const W = Math.max(me.scoreBox.clientWidth || 0, M.bars.length * SC_BAR_MIN);
    if (!W || me.scoreW === W) return;
    me.scoreW = W;
    me.scoreIn.style.width = `${W}px`;
    me.scoreArt.replaceChildren(staffSvg(M, W));
    renderScoreHead(me);
  }
  
  
  function scorePos(me) {
    const M = me.score;
    if (!M) return null;
    const vt = me.mediaT != null ? me.mediaT : me.video.currentTime || 0;     
    const fromTake = () => {
      let at = null;
      M.bars.forEach((b, i) => { if (b.take && b.fromS != null && b.toS > b.fromS && vt >= b.fromS) at = i + Math.min(1, (vt - b.fromS) / (b.toS - b.fromS)); });
      if (at == null) { const i = M.bars.findIndex((b) => b.take && b.fromS != null); return i < 0 ? null : i; }
      return at;
    };
    const s = me.mode === 'lesson' && me.plan && me.segI < me.plan.segs.length ? me.plan.segs[me.segI] : null;
    const f = s && s.part != null ? M.fixes.find((x) => x.partI === s.part) : null;
    me.scoreFix = f || null;
    if (f && s.kind !== 'take') {
      if (s.kind === 'ghost' && me.curGhost && me.lesson && me.curGhost.part === me.lesson.parts[s.part]) {
        let g = 0;
        try { g = me.curGhost.st.time() / Math.max(0.1, me.curGhost.dur); } catch { g = 0; }
        return f.a + clamp01(g) * (f.b - f.a + 1);
      }
      return f.a;
    }
    return fromTake();
  }
  function renderScoreHead(me) {
    const M = me.score;
    if (M && me.card) { cardHead(me); return; }
    if (!M || !me.scoreHead) return;
    const p = scorePos(me);
    me.scoreHead.hidden = p == null;
    if (p != null) me.scoreHead.style.left = `${(Math.max(0, Math.min(M.bars.length, p)) / M.bars.length) * 100}%`;
    for (const f of M.fixes) if (f.btn) f.btn.classList.toggle('on', me.scoreFix === f);
    
    const box = me.scoreBox;
    if (p != null && box.scrollWidth > box.clientWidth + 2 && !me.scoreTouched) {
      const x = (p / M.bars.length) * box.scrollWidth;
      if (x < box.scrollLeft + 40 || x > box.scrollLeft + box.clientWidth - 40) box.scrollLeft = Math.max(0, x - box.clientWidth / 3);
    }
  }
  
  function practisePart(me, i) {
    const s = me.plan && me.plan.segs.find((x) => x.ch === i);
    if (!s) return;
    if (me.mode === 'lesson') { me.jumpTo = s.at; me.holdPaused = false; interrupt(me); return; }
    if (me.mode === 'watch') { me.video.pause(); me.mode = 'idle'; }
    runLesson(me, s.at);
  }
  
  function playFrom(me, t) {
    if (me.mode === 'lesson') {
      interrupt(me);
      me.band = null; me.lbar.hidden = true;
      me.root.classList.remove('lesson');
      subtitle(me, '');
    }
    watch(me, Math.max(0, t));
  }

  
  
  function bubble(who, text, cls = '') {
    const li = el('li', `mv-msg ${who === 'you' ? 'mv-you' : 'mv-from'} ${cls}`.trim());
    li.append(el('p', 'mv-text', text));
    return li;
  }
  function typing() {
    const li = el('li', 'mv-msg mv-from mv-typing');
    const p = el('p', 'mv-text');
    p.setAttribute('aria-label', 'Muse is thinking');
    for (let k = 0; k < 3; k++) p.append(el('i'));
    li.append(p);
    return li;
  }
  
  function note(me, who, text, cls = '') {
    const b = bubble(who, text, cls);
    const firstRow = me.talk.querySelector('[data-row]');
    me.talk.insertBefore(b, firstRow);
    me.talk.scrollTop = me.talk.scrollHeight;
    return b;
  }
  
  function subtitle(me, text, who = 'Muse', cls = '') {
    if (!me || !me.sub) return;
    me.subWho.lastChild.textContent = who;
    me.subText.replaceChildren();
    if (cls === 'thinking') for (let k = 0; k < 3; k++) me.subText.append(el('i'));
    else me.subText.textContent = text || '';
    me.sub.className = `mv-sub ${cls}`.trim();
    me.sub.hidden = cls !== 'thinking' && !text;
    if (!calm() && !me.sub.hidden) { me.sub.classList.remove('mv-sub-in'); void me.sub.offsetWidth; me.sub.classList.add('mv-sub-in'); }
  }

  
  
  
  
  const BROWSER_VOICE = false;
  const browserVoice = (me) => BROWSER_VOICE && !!me.voiceOn && !!window.speechSynthesis;
  
  const readS = (text) => Math.max(1.6, 0.9 + String(text || '').split(/\s+/).filter(Boolean).length * 0.38);
  
  const voiced = (me) => !!(me.voiceOn && me.pack && !me.packLost);
  let VOICE = null;
  
  
  const VOICE_KEY = 'mv-voice', VOICE_ON_KEY = 'mv-voice-on', AUTO_KEY = 'mv-autostart', VOL_KEY = 'mv-volume';
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  
  function setVolume(me, v) {
    me.vol = clamp01(v);
    me.video.volume = me.vol;
    if (me.pack) me.pack.audio.volume = me.vol;
    if (me.gst && me.gst.setVolume) me.gst.setVolume(me.vol);
    me.volRange.value = String(Math.round(me.vol * 100));
    me.volRange.style.setProperty('--v', `${Math.round(me.vol * 100)}%`);
    me.volBtn.innerHTML = me.vol > 0 ? ICON.voiceOn : ICON.voiceOff;
    me.volBtn.setAttribute('aria-label', me.vol > 0 ? 'Mute' : 'Unmute'); me.volBtn.title = me.vol > 0 ? 'Mute' : 'Unmute';
    try { localStorage.setItem(VOL_KEY, String(me.vol)); } catch {   }
  }
  const voiceWanted = () => { try { return localStorage.getItem(VOICE_ON_KEY) !== '0'; } catch { return true; } };
  const autoWanted = () => { try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch { return true; } };
  const remembered = () => { try { return localStorage.getItem(VOICE_KEY); } catch { return null; } };
  function allVoices() { try { return (window.speechSynthesis && speechSynthesis.getVoices()) || []; } catch { return []; } }
  function rankedVoices() {
    const vs = allVoices();
    return window.MVVoices ? window.MVVoices.ranked(vs) : vs.filter((v) => /^en(-|_|$)/i.test(v.lang));
  }
  function pickVoice() {
    const vs = allVoices(), want = remembered();
    const mine = want && vs.find((v) => v.voiceURI === want);
    if (mine) return mine;
    return (window.MVVoices && window.MVVoices.best(vs)) || rankedVoices()[0] || null;
  }
  
  function fillVoices(sel) {
    if (!sel) return;
    const vs = rankedVoices().slice(0, 24), cur = VOICE || pickVoice();
    sel.replaceChildren(...vs.map((v, i) => {
      const o = el('option', '', `${v.name}${i === 0 ? ' (most natural)' : ''}`);
      o.value = v.voiceURI;
      return o;
    }));
    if (cur) sel.value = cur.voiceURI;
    sel.hidden = !BROWSER_VOICE || vs.length < 2;
  }
  if (window.speechSynthesis) {
    try { speechSynthesis.onvoiceschanged = () => { VOICE = pickVoice(); if (V) fillVoices(V.voiceSel); }; } catch {   }
  }

  
  
  function pianoReady(L) {
    const P = window.MVPiano;
    if (!P) return;
    try {
      
      
      const pairs = new Map();
      for (const p of L && Array.isArray(L.parts) ? L.parts : []) {
        for (const r of p.ghost && Array.isArray(p.ghost.notes) ? p.ghost.notes : []) {
          if (!Array.isArray(r) || !Number.isFinite(+r[2])) continue;
          const v = Number.isFinite(+r[3]) && +r[3] > 0 ? Math.max(1, Math.min(127, Math.round(+r[3]))) : 80;
          pairs.set(`${+r[2]}:${v}`, [+r[2], v]);
        }
      }
      const fn = typeof P.ready === 'function' ? P.ready : typeof P.preload === 'function' ? P.preload : null;
      const got = fn ? fn.call(P, [...pairs.values()]) : null;
      if (got && got.catch) got.catch(() => {});
    } catch {   }
  }

  
  
  function resumed(me) { return me.paused ? new Promise((r) => me.resumers.push(r)) : Promise.resolve(); }
  
  function hold(ms, me) {
    return new Promise((resolve) => {
      let left = ms, last = performance.now();
      const tick = () => {
        if (V !== me || me.stopped) return resolve();
        const now = performance.now();
        if (!me.paused) left -= now - last;
        last = now;
        if (left <= 0) return resolve();
        setTimeout(tick, 80);
      };
      tick();
    });
  }
  
  
  
  const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const normLine = (s) => String(s || '').toLowerCase().replace(/\u2019/g, "'").replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/\b(10|[0-9])\b/g, (d) => NUM_WORDS[+d]);
  
  
  function packClips(res) {
    const vp = res && res.voicePack, c = vp && vp.clips && typeof vp.clips === 'object' ? vp.clips : null;
    if (!c) return null;
    const lines = res.lesson && res.lesson.view && Array.isArray(res.lesson.view.lines) ? res.lesson.view.lines : [];
    const text = new Map(lines.filter((l) => l && typeof l.id === 'string' && typeof l.text === 'string').map((l) => [l.id, l]));
    const out = {};
    for (const [k, v] of Object.entries(c)) {
      if (Array.isArray(v)) out[k] = v;
      else if (v && typeof v === 'object' && num(v.startS) != null && num(v.durS) > 0 && text.has(k)) {
        
        const l = text.get(k), at = [v.startS, v.startS + v.durS];
        out[normLine(l.text)] = at;
        if (typeof l.sub === 'string' && l.sub.trim()) out[normLine(l.sub)] = at;
      }
    }
    return Object.keys(out).length ? out : null;
  }
  function packClip(me, text) {
    const p = me.pack;
    const c = p && p.clips[normLine(text)];
    return Array.isArray(c) && c.length === 2 && Number.isFinite(+c[0]) && +c[1] > +c[0] ? [+c[0], +c[1]] : null;
  }
  
  
  function playClip(me, clip, resolve) {
    const a = me.pack.audio, [s, e] = clip;
    let over = false, t = 0, cap = 0;
    const fin = () => { if (over) return; over = true; clearTimeout(t); clearTimeout(cap); if (me.packStop === fin) me.packStop = null; try { a.pause(); } catch {   } resolve(); };
    const lost = () => { me.packLost = true; fin(); };
    const tick = () => {
      if (over) return;
      if (V !== me || me.stopped) return fin();
      if (me.paused) { if (!a.paused) a.pause(); t = setTimeout(tick, 120); return; }
      if (a.paused) { const p = a.play(); if (p && p.catch) p.catch(lost); }
      if (a.currentTime >= e - 0.02) return fin();
      t = setTimeout(tick, 40);
    };
    me.packStop = fin;
    try { a.currentTime = s; } catch { lost(); return; }
    me.root.classList.add('speaking');
    const p = a.play();
    if (p && p.catch) p.catch(lost);
    t = setTimeout(tick, 60);
    cap = setTimeout(fin, (e - s) * 1000 + 8000);              
  }
  function sayOne(text, me) {
    return new Promise((resolve) => {
      const wait = readS(text) * 1000;
      let over = false;
      const done = () => { if (over) return; over = true; if (me.skipper === skip) me.skipper = null; me.root.classList.remove('speaking'); resolve(); };
      const skip = () => { try { speechSynthesis.cancel(); } catch {   } if (me.packStop) me.packStop(); done(); };
      me.skipper = skip;
      const clip = me.voiceOn && !me.packLost ? packClip(me, text) : null;
      if (clip) { playClip(me, clip, () => (me.packLost && !over && me.voiceOn ? browserSay() : done())); return; }
      browserSay();
      function browserSay() {
      if (!browserVoice(me)) { hold(wait, me).then(done); return; }
      hold(wait + 6000, me).then(done);                
      try {
        const u = new SpeechSynthesisUtterance(text);
        VOICE = VOICE || pickVoice();
        if (VOICE) u.voice = VOICE;
        u.rate = 1.0; u.pitch = 1.04; u.volume = me.vol;
        u.onstart = () => me.root.classList.add('speaking');
        u.onend = u.onerror = done;
        speechSynthesis.speak(u);
      } catch {   }
      }
    });
  }
  
  
  async function say(lines, me, ids = null) {
    const L = me.lesson;
    const list = lines.map((x, k) => [x, Array.isArray(ids) ? ids[k] : ids ? `${ids}.${k}` : null]).filter(([x]) => x);
    for (const [line, id] of list) {
      if (V !== me || me.stopped) return;
      await resumed(me);
      if (V !== me || me.stopped) return;
      const who = lineWho(L, id);
      subtitle(me, line, who);
      const b = note(me, 'muse', line, 'mv-in mv-now');
      if (who !== 'Muse') b.append(el('span', 'mv-by', who));
      await sayOne(line, me);
      b.classList.remove('mv-now');
    }
  }
  
  function skippable(p, me) {
    return new Promise((resolve) => {
      let over = false;
      const fin = (v) => { if (over) return; over = true; if (me.skipper === skip) me.skipper = null; resolve(v); };
      const skip = () => fin('skipped');
      me.skipper = skip;
      Promise.resolve(p).then(fin, () => fin('failed'));
    });
  }
  function pauseLesson(me) {
    if (me.paused || me.mode !== 'lesson') return;
    me.paused = true;
    me.pauseStart = performance.now();
    try { speechSynthesis.pause(); } catch {   }
    if (me.pack && !me.pack.audio.paused) me.pack.audio.pause();
    if (!me.video.paused) { me.video.pause(); me.videoHeld = true; }
    if (me.gst && me.ghostPlaying) { try { me.gst.pause(); } catch {   } }
    if (me.listening) { me.listenHeld = true; me.listening.stop(); }
    renderBar(me);
  }
  function resumeLesson(me) {
    if (!me.paused) return;
    me.paused = false;
    if (me.pauseStart != null) { me.pauseAcc = (me.pauseAcc || 0) + performance.now() - me.pauseStart; me.pauseStart = null; }
    try { speechSynthesis.resume(); } catch {   }
    if (me.videoHeld) { me.videoHeld = false; const p = me.video.play(); if (p && p.catch) p.catch(() => {}); }
    for (const r of me.resumers.splice(0)) r();
    renderBar(me);
  }

  
  const CHIPS = ['What should I practise first?', 'How was my timing?', 'How do I film it better?'];
  async function ask(q) {
    q = String(q || '').trim();
    if (!q || !V) return;
    const me = V;
    me.input.value = ''; if (me.chatInput) me.chatInput.value = '';
    me.chips.hidden = true;
    if (me.mode === 'lesson') pauseLesson(me);
    else if (me.mode === 'watch' && !me.video.paused) me.video.pause();
    try { speechSynthesis.cancel(); } catch {   }
    subtitle(me, q, 'You', 'you');
    me.asked = q;
    try { await me.ctx.ask(q); } catch (e) {
      const m = (e && e.message) || 'That question could not be sent. Try again?';
      if (V === me) { subtitle(me, m, 'Muse', 'err'); note(me, 'muse', m, 'mv-err'); }
    }
  }
  function renderRows(rows) {
    if (!V || !V.opened) return;
    const me = V, list = me.talk;
    for (const n of list.querySelectorAll('[data-row], .mv-typing')) n.remove();
    const qs = rows.filter((r) => r && r.role === 'user').sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const answers = new Map(rows.filter((r) => r && r.role === 'teacher' && r.replyTo).map((r) => [r.replyTo, r]));
    for (const q of qs) {
      const u = bubble('you', str(q.text, 2000));
      u.dataset.row = q.id;
      list.append(u);
      const a = answers.get(q.id);
      if (a) {
        const m = bubble('muse', str(a.text, 4000));
        m.dataset.row = `${q.id}-a`;
        m.append(el('span', 'mv-by', WHO[a.source] || 'The teacher'));
        list.append(m);
      } else if (q.status === 'failed') {
        const m = bubble('muse', str(q.error, 300) || 'I could not answer that one. Ask me again?', 'mv-err');
        m.dataset.row = `${q.id}-a`;
        list.append(m);
      } else {
        const t = typing();
        t.dataset.row = `${q.id}-a`;
        list.append(t);
      }
    }
    list.scrollTop = list.scrollHeight;
    
    const last = qs[qs.length - 1];
    if (!last) return;
    const a = answers.get(last.id);
    if (a && !me.announced.has(last.id)) {
      me.announced.add(last.id);
      if (me.seenRows) { subtitle(me, str(a.text, 600), WHO[a.source] || 'The teacher'); if (me.voiceOn) sayOne(str(a.text, 600), me); }
    } else if (!a && last.status !== 'failed' && me.asked && str(last.text, 2000) === me.asked) {
      setTimeout(() => { if (V === me && me.asked && !me.announced.has(last.id) && me.sub.classList.contains('you')) subtitle(me, '', 'Muse', 'thinking'); }, 1400);
    } else if (!a && last.status === 'failed' && !me.announced.has(last.id)) {
      me.announced.add(last.id);
      if (me.seenRows) subtitle(me, str(last.error, 300) || 'I could not answer that one. Ask me again?', 'Muse', 'err');
    }
    me.seenRows = true;
  }

  
  

  
  const STEPS = [['take', 'You played'], ['take-slow', 'Slow replay'], ['ghost', "How it's done"], ['ghost-slow', 'Done slowly']];
  const lessonOf = (res) => {
    const L = res && res.lesson;
    return L && Array.isArray(L.parts) && Array.isArray(L.open) ? viewed(L) : null;
  };
  
  
  
  
  
  
  const VIEWED = new WeakMap();
  function viewed(L) {
    if (VIEWED.has(L)) return VIEWED.get(L);
    const v = L.view && typeof L.view === 'object' ? L.view : null;
    const rows = v && Array.isArray(v.lines) ? v.lines.filter((l) => l && typeof l.id === 'string' && typeof l.text === 'string' && l.text.trim()) : [];
    if (!rows.length) { VIEWED.set(L, L); return L; }
    const T = new Map(rows.map((l) => [l.id, str(l.sub, 600) || l.text.trim()]));
    const said = (ids) => (Array.isArray(ids) ? ids : []).map((id) => T.get(id)).filter(Boolean);
    const out = { ...L, viewLines: true };
    const open = said(['hook', v.keep && v.keep.line ? v.keep.line : null]);
    if (open.length) out.open = open;
    const fixes = Array.isArray(v.fixes) ? v.fixes.filter((f) => f && Number.isInteger(f.partI)) : [];
    out.parts = L.parts.map((p) => {
      const f = fixes.find((x) => x.partI === p.i);
      if (!f || !Array.isArray(f.steps)) return p;
      const step = (kind) => said([].concat(...f.steps.filter((x) => x && x.kind === kind).map((x) => x.lines || [])));
      const q = { ...p };
      const intro = [...step('explain'), ...step('yours')];
      if (intro.length) q.intro = intro;
      const watch = step('correct');
      if (watch.length && p.ghost) q.watch = watch;
      const ex = step('exercise');
      
      if (ex.length && p.practice && typeof p.practice === 'object') q.practice = { ...p.practice, say: ex[0], more: ex.slice(1) };
      return q;
    });
    const close = said([v.week && v.week.line ? v.week.line : null, v.filmAgain && v.filmAgain.line ? v.filmAgain.line : null]);
    if (close.length) out.close = close;
    VIEWED.set(L, out);
    return out;
  }
  const article = (w) => (/^[AEF]/.test(w) ? 'an' : 'a');
  function setStep(me, part, step) {
    const same = !me.lbar.hidden && me.at && me.at.part === part && me.at.step === step;
    me.lbar.hidden = false;
    const P = me.lesson && me.lesson.parts ? me.lesson.parts[part] : null;
    if (me.stripFor !== P) renderStrip(me, P); else if (!same) lightStrip(me, null);
    if (same) return;
    me.at = { part, step };
    me.stepAt = performance.now();
    for (const li of me.lparts.children) li.classList.toggle('on', +li.dataset.i === part);
    
    const has = new Set(me.plan ? me.plan.segs.filter((s) => s.part === part && s.step).map((s) => s.step) : STEPS.map(([id]) => id));
    for (const sp of me.lsteps.children) {
      sp.hidden = !has.has(sp.dataset.s);
      const k = STEPS.findIndex(([id]) => id === sp.dataset.s), at = STEPS.findIndex(([id]) => id === step);
      sp.classList.toggle('on', sp.dataset.s === step);
      sp.classList.toggle('past', k >= 0 && at >= 0 && k < at);
    }
    renderBar(me);
  }
  
  
  
  
  const FINGERS_FROM = { course: "the course's fingering", piece: "the piece's own fingering", suggested: 'a suggested fingering' };
  const spell = (n) => String(n).replace('♯', ' sharp').replace('♭', ' flat');
  function stripWhere(st) {
    if (st.bar != null && Number.isFinite(+st.bar)) return `Bar ${+st.bar}`;
    const bs = Array.isArray(st.bars) ? st.bars.map(Number).filter(Number.isFinite) : [];
    if (bs.length > 1) return `Bars ${bs[0]}-${bs[bs.length - 1]}`;
    return bs.length ? `Bar ${bs[0]}` : '';
  }
  function renderStrip(me, part) {
    const box = me.lstrip, st = part && part.strip && typeof part.strip === 'object' ? part.strip : null;
    me.stripFor = part || null;
    me.stripLit = '';
    me.stripNotes = null;
    box.replaceChildren();
    const notes = st && Array.isArray(st.notes) ? st.notes.filter((c) => c && typeof c.n === 'string').slice(0, 16) : [];
    if (!notes.length) { box.hidden = true; return; }
    me.stripNotes = notes;
    const where = stripWhere(st), words = [];
    if (where) box.append(el('span', 'mv-strip-where', where));
    const ol = el('ol', 'mv-strip-n');
    ol.setAttribute('aria-hidden', 'true');
    notes.forEach((c, k) => {
      const li = el('li', 'mv-nc');
      li.dataset.k = String(k);
      if (c.h === 'L' || c.h === 'R') li.dataset.h = c.h;
      const f = [1, 2, 3, 4, 5].includes(+c.f) ? +c.f : null;
      const want = el('span', 'mv-nc-want');
      want.append(el('b', '', str(c.n, 3)));
      if (f) want.append(el('i', '', String(f)));
      const focus = st.focus && +st.focus.at === k ? st.focus : null;
      if (focus) {
        const kind = focus.kind === 'missed' ? 'missed' : focus.kind === 'corrected' ? 'corrected' : 'wrong';
        li.classList.add('focus', kind);
        const played = (Array.isArray(focus.played) ? focus.played : []).map((x) => str(x, 3)).filter(Boolean).slice(0, 2);
        if (played.length) { const p = el('span', 'mv-nc-played'); p.append(el('b', '', played.join(' '))); li.append(p); }
        li.append(want);
        if (kind !== 'wrong') li.append(el('span', 'mv-nc-cap', kind === 'missed' ? 'missed' : 'put right'));
        words.push(played.length ? `${played.map(spell).join(' and ')} played where the score has ${spell(c.n)}${kind === 'corrected' ? ', then put right' : ''}${f ? `, finger ${f}` : ''}`
          : `${spell(c.n)} missed${f ? `, finger ${f}` : ''}`);
      } else {
        li.append(want);
        words.push(`${spell(c.n)}${f ? ` ${f}` : ''}`);
      }
      ol.append(li);
      if (st.stop && +st.stop.after === k && Number.isFinite(+st.stop.s)) {
        const s = el('li', 'mv-nc-stop');
        
        s.append(el('i'), el('span', '', 'stop'));
        ol.append(s);
        words.push('a stop');
      }
    });
    box.append(ol);
    const from = FINGERS_FROM[st.fingers] || FINGERS_FROM.suggested;
    box.title = `Numbers: fingers, from ${from}`;
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', `${where ? `${where}${st.hand === 'L' ? ', left hand' : st.hand === 'R' ? ', right hand' : ''}: ` : ''}${words.join(', ')}. Fingers from ${from}.`);
    box.hidden = false;
  }
  
  
  function lightStrip(me, clock, t) {
    if (!me.lstrip || me.lstrip.hidden || !me.stripNotes) return;
    const notes = me.stripNotes;
    let last = null;
    const lit = notes.map((c) => {
      const at = clock ? num(c[clock]) : null;
      const on = at != null && t != null && at <= t + 0.03;
      if (on && (last == null || at >= last)) last = at;
      return on ? at : null;
    });
    const key = lit.map((a) => (a == null ? 0 : a === last && t - last < 0.6 ? 2 : 1)).join('');
    if (key === me.stripLit) return;
    me.stripLit = key;
    for (const li of me.lstrip.querySelectorAll('.mv-nc')) {
      const v = key[+li.dataset.k];
      li.classList.toggle('lit', v === '1' || v === '2');
      li.classList.toggle('now', v === '2');
    }
  }
  
  const SCENE = { video: 'Your performance', ghost: 'Muse shows you', try: 'Your turn' };
  function showStage(me, which) {
    const scene = which === 'try' ? 'ghost' : which;
    for (const [node, on] of [[me.frame, scene === 'video'], [me.ghostWrap, scene === 'ghost']]) {
      if (node.hidden === !on) continue;
      node.hidden = !on;
      if (on && !calm()) { node.classList.remove('mv-scene-in'); void node.offsetWidth; node.classList.add('mv-scene-in'); }
    }
    me.tag.lastChild.textContent = SCENE[which] || SCENE.video;
    me.tag.dataset.s = which;
    me.root.dataset.scene = scene;
  }
  
  
  function playTake(me, take, rate, spot, off = 0) {
    const v = me.video;                            
    showStage(me, 'video');
    me.band = { a: take.fromS, b: take.toS, f: take.focusS };
    me.takeRun = true;
    me.segLocal = () => Math.max(0, (v.currentTime - take.fromS) / rate);
    return new Promise((resolve) => {
      let shown = take.focusS != null && take.fromS + off * rate > take.focusS + 0.3, raf = 0, over = false;
      const end = () => {
        if (over) return; over = true;
        me.takeRun = false;
        cancelAnimationFrame(raf); v.pause(); v.playbackRate = 1; me.spot.hidden = true; me.videoHeld = false; resolve();
      };
      const watch = () => {
        if (over || V !== me || me.stopped) return end();
        const t = v.currentTime;
        lightStrip(me, 't', t);
        if (spot && !shown && take.focusS != null && t >= take.focusS - 0.05) {
          shown = true; me.spot.textContent = spot; me.spot.hidden = false;
          setTimeout(() => { me.spot.hidden = true; }, 1600 / rate);
        }
        if (t >= take.toS || v.ended) return end();
        raf = requestAnimationFrame(watch);
      };
      try { v.currentTime = Math.max(0, take.fromS + off * rate); } catch {   }
      v.playbackRate = rate;
      const go = me.paused ? Promise.resolve() : v.play();
      if (me.paused) me.videoHeld = true;
      (go && go.then ? go : Promise.resolve()).then(() => { raf = requestAnimationFrame(watch); kick(); }, end);
      me.endTake = end;
    });
  }
  
  function gestureUi(me) {
    me.gesture.hidden = !!me.onKeys || !!me.ghostFixed;
    if (me.onKeys || me.ghostFixed) return;
    me.gHint.hidden = !!me.orbitTouched || !!me.orbitKeep;
    me.gReset.hidden = !me.orbitKeep;
  }
  
  
  
  
  
  
  function plateOf(me, part) {
    const P = me.res && me.res.keyboard && Array.isArray(me.res.keyboard.plates) ? me.res.keyboard.plates : null, i = part && part.plate;
    const p = P && Number.isInteger(i) ? P[i] : null, k = p && p.K;
    const ok = p && typeof p.src === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p.src) && num(p.w) && num(p.h)
      && k && [k.fx, k.fy, k.cx, k.cy].every((v) => num(v) != null) && Array.isArray(p.T) && p.T.length === 16 && p.T.every((v) => num(v) != null);
    return ok ? { src: p.src, w: p.w, h: p.h, K: { fx: k.fx, fy: k.fy, cx: k.cx, cy: k.cy }, T: p.T.slice(), layout: p.layout || null } : null;
  }
  
  
  function takeAt(map, ref) {
    if (!Array.isArray(map) || map.length < 2 || num(ref) == null) return null;
    let i = 1;
    while (i < map.length - 1 && +map[i][0] < ref) i++;
    const [a0, b0] = map[i - 1], [a1, b1] = map[i];
    return +b0 + (+b1 - +b0) * ((ref - +a0) / Math.max(1e-6, +a1 - +a0));
  }
  
  
  
  
  
  
  
  
  
  async function overlayGhost(me, part, rate) {
    const O = window.MVGhostOverlay, res = me.res || {}, view = res.lesson && res.lesson.view;
    const fx = view && Array.isArray(view.fixes) ? view.fixes.find((f) => f && f.partI === part.i) : null;
    const g = fx && fx.ghost && typeof fx.ghost === 'object' && typeof fx.ghost.url === 'string' && fx.ghost.url ? fx.ghost : null;
    if (!O || typeof O.mount !== 'function' || !g) return null;
    if (me.gst) { try { me.gst.destroy(); } catch {   } me.gst = null; }
    const box = el('div', 'mv-ovbox');
    const stand = el('video', 'mv-ovstand');
    stand.muted = true; stand.playsInline = true; stand.preload = 'none'; stand.tabIndex = -1;
    stand.setAttribute('aria-hidden', 'true');
    box.append(stand);
    me.ghostBox.replaceChildren(box);
    const toLearner = res.reference && Array.isArray(res.reference.toLearner) ? res.reference.toLearner : null;
    let ov = null;
    try {
      ov = await O.mount(stand, { camera: (res.keyboard && res.keyboard.camera) || null, ghost: g, toLearner, result: res, look: 'hologram', host: box });
    } catch (e) {
      console.info(`Fix ${fx.n}'s recorded hands could not be drawn (${(e && e.message) || e}): the 3D stage instead.`);
      box.remove();
      return null;
    }
    const r0 = ov && ov.ghost ? num(ov.ghost.refT0) : null, r1 = ov && ov.ghost ? num(ov.ghost.refEnd) : null;
    if (V !== me || me.stopped || !ov || typeof ov.play !== 'function' || r0 == null || r1 == null || !(r1 > r0)) {
      try { if (ov && ov.destroy) ov.destroy(); } catch {   }
      box.remove();
      return null;
    }
    const P = window.MVPiano, vol0 = P && typeof P.volume === 'function' ? P.volume() : null;
    const setVol = (v) => { try { if (P && typeof P.setVolume === 'function') P.setVolume(v); } catch {   } };
    setVol(me.vol);
    const dur = (r1 - r0) / rate;
    const refNow = () => { try { const t = ov.time(); return t && num(t.ref) != null ? t.ref : r0; } catch { return r0; } };
    const st = {
      playSection: (a, b) => ov.play(r0 + Math.max(0, num(+a) || 0) * rate, r0 + Math.min(dur, num(+b) == null ? dur : +b) * rate, rate, { clock: 'reference' }),
      time: () => Math.max(0, Math.min(dur, (refNow() - r0) / rate)),
      pause: () => { try { ov.stop(); } catch {   } },
      seek: (t) => { try { ov.seek(r0 + Math.max(0, Math.min(dur, num(+t) || 0)) * rate, { clock: 'reference' }); } catch {   } },
      unlock: () => { try { const c = P && typeof P.context === 'function' ? P.context() : null; if (c && c.state !== 'running') c.resume().catch(() => {}); } catch {   } },
      destroy: () => { try { ov.destroy(); } catch {   } box.remove(); if (vol0 != null) setVol(vol0); },
      setVolume: setVol, resetView: () => {}, orbit: () => null,
      view: () => ({ mode: ov.mode }),
      ghostState: () => ({ footage: ov.mode === 'plate', overlay: ov.mode, gate: ov.gate ? { ok: !!ov.gate.ok, why: (ov.gate.why || []).slice(0, 6) } : null }),
      ready: Promise.resolve(),
    };
    
    return { st, dur, mode: ov.mode, stripAt: () => takeAt(toLearner, refNow()) };
  }
  async function mountGhost(me, part, rate) {
    const over = await overlayGhost(me, part, rate);
    if (over) {
      me.onKeys = over.mode === 'plate';
      me.ghostFixed = true;                                  
      me.root.classList.toggle('onkeys', me.onKeys);
      me.gst = over.st;
      gestureUi(me);
      me.ghostRecorded = true;
      me.gcap.textContent = `${me.onKeys ? 'On your own keyboard: the' : 'Close up: the'} recorded performance${rate < 1 ? ', slowly' : ', at your tempo'}`;
      me.gnote.textContent = 'A pianist\'s own hands, recorded. ';
      const lic = el('a', 'mv-lic', 'Hand model');
      lic.href = 'notices.html'; lic.target = '_blank'; lic.rel = 'noopener';
      me.gnote.append(lic);
      me.curGhost = { st: over.st, dur: over.dur, rate, part, clock: 't', eff: 1, stripAt: over.stripAt };
      return me.curGhost;
    }
    me.ghostFixed = false;
    if (!window.MVHands || !part.ghost) return null;
    const rec = part.ghost.recorded && typeof part.ghost.recorded === 'object' && window.MVGhostRecorded ? part.ghost.recorded : null;
    if (!rec && (!window.MVGhostSynth || !Array.isArray(part.ghost.notes))) return null;
    let g = null;
    if (rec) {
      try { g = window.MVGhostRecorded.take(rec, { rate: Math.max(0.3, rate * (num(rec.rate) || 1)) }); } catch { g = null; }
    }
    const recorded = !!g;
    if (!g) {
      if (!window.MVGhostSynth || !Array.isArray(part.ghost.notes)) return null;
      g = window.MVGhostSynth.take(part.ghost.notes, { rate, fingers: part.ghost.fingers });
    }
    if (me.gst) { try { me.gst.destroy(); } catch {   } me.gst = null; }
    me.ghostBox.replaceChildren();
    
    
    
    
    const plate = null;
    me.onKeys = false;
    me.root.classList.remove('onkeys');
    const st = window.MVHands.mount(me.ghostBox, { result: g.result, fetchMedia: async (n) => (g.media[n] ? g.media[n].slice(0) : new ArrayBuffer(0)),
      orbit: true, bare: true, bright: true, orbitStart: me.orbitKeep || undefined, volume: me.vol, footage: plate,
      onOrbit: (moved, state) => { me.orbitKeep = moved ? state : null; me.orbitTouched = true; if (V === me) gestureUi(me); } });
    me.gst = st;
    gestureUi(me);
    setTimeout(() => { if (V === me && me.gst === st && st.view().mode === '2d') me.gesture.hidden = true; }, 2500);       
    me.ghostRecorded = recorded;
    const where = plate ? 'On your own keyboard: ' : '';
    if (recorded) {
      me.gcap.textContent = `${where}${where ? 'a' : 'A'} recorded performance${rate < 1 ? ', slowly' : ', at your tempo'}`;
      me.gnote.textContent = `${str(rec.performer, 80) || 'A pianist'}'s own hands, ${str(rec.handsFrom, 80) || 'recorded'}`
        + `${rec.rights === 'internal' ? '. Internal preview only: not cleared for sharing' : ''}. `;
    } else {
      const lab = part.ghost.label === 'A recorded performance, at your tempo' ? 'The score, at your tempo' : (part.ghost.label || 'The score');
      me.gcap.textContent = `${where}${where ? lab[0].toLowerCase() + lab.slice(1) : lab}${rate < 1 ? ', slowly' : ''}`;
      me.gnote.textContent = `Ghost hands drawn from the notes, not a recording${part.ghost.fingers === 'piece' ? ''
        : part.ghost.fingers === 'course' ? "; the fingers are the course's" : '; the fingers are a suggestion'}. `;
    }
    const lic = el('a', 'mv-lic', 'Hand model');
    lic.href = 'notices.html'; lic.target = '_blank'; lic.rel = 'noopener';
    me.gnote.append(lic);
    try { await Promise.race([st.ready, new Promise((r) => setTimeout(r, 8000))]); } catch {   }
    
    me.curGhost = { st, dur: g.durationS, rate, part, clock: recorded ? 'gr' : 'g', eff: recorded ? Math.max(0.3, rate * (num(rec.rate) || 1)) : rate };
    return me.curGhost;
  }
  
  
  async function playGhost(me, part, rate, ready, from0 = 0) {
    showStage(me, 'ghost');
    const m = ready && ready.rate === rate ? ready : await mountGhost(me, part, rate);
    if (!m || V !== me || me.stopped) return;
    try { m.st.unlock(); } catch {   }
    let from = from0;
    me.segLocal = () => { try { return m.st.time(); } catch { return from; } };
    if (me.paused) { try { m.st.seek(from); } catch {   } }      
    for (;;) {
      await resumed(me);
      if (V !== me || me.stopped) return;
      me.ghostPlaying = true;
      
      
      const follow = () => {
        if (!me.ghostPlaying || V !== me) return;
        try { lightStrip(me, m.clock, m.stripAt ? m.stripAt() : m.st.time() * (m.eff || 1)); } catch {   }
        renderScoreHead(me);
        me.stripRaf = requestAnimationFrame(follow);
      };
      follow();
      const r = await skippable(m.st.playSection(from, m.dur), me);
      me.ghostPlaying = false;
      cancelAnimationFrame(me.stripRaf);
      if (r === false && me.paused && V === me && !me.stopped) {
        from = Math.min(m.dur, m.st.time());
        continue;
      }
      break;
    }
    try { m.st.pause(); } catch {   }
  }
  function verdictLine(part, r, retry = true) {
    const want = part.spot ? part.spot.replace(/^the /, '') : null;
    if (!r || !r.ok) {
      return r && r.why === 'blocked'
        ? "I can't use the microphone on this page. Play it a few times along with the ghost hands, then film it again and add it here: I'll listen to that."
        : "I couldn't listen just now. Play it a few times along with the ghost hands, then film it again and add it here.";
    }
    const f = (r.focus || [])[0];
    if (r.verdict === 'quiet') return "I couldn't hear enough of it. Play it once more, a bit closer to the phone?";
    if (r.verdict === 'right') return f ? `That's it! I heard the ${f.want} right where it goes.` : "That's it! I heard it just like the ghost hands played it.";
    const then = retry ? "Let's watch it once more, slowly." : 'Keep it in mind next time you play it.';
    if (r.verdict === 'focus' && f) return f.got ? `So close. I heard ${article(f.got)} ${f.got} where the ${f.want} goes. ${then}` : `So close. I didn't hear the ${f.want}. ${then}`;
    return `Nearly: I heard ${r.matched} of the ${r.total} notes as they go${want && f && f.got === f.want ? `, and the ${want} was right` : ''}. Once more?`;
  }
  
  async function listenFor(me, part) {
    if (!part.listen || !window.MVListen) return null;
    for (;;) {
      await resumed(me);
      if (V !== me || me.stopped) return null;
      showStage(me, 'try');
      me.lis.hidden = false;
      me.lisText.textContent = "I'm listening. Play it now.";
      me.lisDots.replaceChildren(...part.listen.expect.map(() => el('i')));
      let k = 0;
      me.listenAt = performance.now();
      const ctl = await window.MVListen.start({
        expect: part.listen.expect, focus: part.listen.focus,
        onLevel: (v) => { me.lisLevel.style.transform = `scale(${1 + Math.min(0.6, v * 0.9)})`; },
        onNote: () => { const d = me.lisDots.children[k++]; if (d) d.classList.add('on'); },
      });
      me.listening = ctl;
      const r = await skippable(ctl.done, me);
      const out = r === 'skipped' || r === 'failed' ? await ctl.stop() : r;
      me.listening = null;
      me.listenAt = null;
      me.lis.hidden = true;
      if (me.listenHeld) { me.listenHeld = false; continue; }
      return out;
    }
  }
  
  
  
  
  
  
  
  
  const slowOf = (L) => (+L.slowRate > 0.2 && +L.slowRate < 1 ? +L.slowRate : 0.65);
  function lineLen(me, text) {
    const clip = me.voiceOn && !me.packLost ? packClip(me, text) : null;
    return clip ? clip[1] - clip[0] : readS(text);
  }
  
  function ghostLen(part, rate) {
    const rec = part.ghost && part.ghost.recorded && typeof part.ghost.recorded === 'object' && window.MVGhostRecorded ? part.ghost.recorded : null;
    if (rec && num(rec.frames)) return Math.ceil(rec.frames / Math.min(2, Math.max(0.3, rate * (num(rec.rate) || 1)))) / 30;
    let off = 0;
    for (const r of part.ghost && Array.isArray(part.ghost.notes) ? part.ghost.notes : []) {
      if (Array.isArray(r) && Number.isFinite(+r[0])) off = Math.max(off, Math.max(+r[0] + 0.12, Number.isFinite(+r[1]) ? +r[1] : +r[0] + 0.3) / rate);
    }
    return off + 1.2;
  }
  const listenLen = (part) => {
    const ex = part.listen && Array.isArray(part.listen.expect) ? part.listen.expect : [];
    return ex.length ? Math.max(2, +ex[ex.length - 1][0] + 0.8) : 6;
  };
  function planOf(me) {
    const L = me.lesson, segs = [];
    let at = 0;
    const add = (s) => { s.k = segs.length; s.at = at; at += s.dur; segs.push(s); };
    const line = (text, id, ch, part, step, scene) => { const t = str(text, 600); if (t) add({ kind: 'line', text: t, id, ch, part, step, scene, dur: lineLen(me, t) }); };
    L.open.forEach((x, k) => line(x, `open.${k}`, 'open', null, null, 'open'));
    const rate = slowOf(L);
    for (const part of L.parts) {
      const ch = part.i, take = part.take && me.video.src ? part.take : null, p = `p${part.i}`;
      if (take) {
        (part.intro || []).forEach((x, k) => line(x, `${p}.intro.${k}`, ch, part.i, 'take', 'video'));
        add({ kind: 'take', ch, part: part.i, step: 'take', rate: 1, dur: Math.max(0.2, take.toS - take.fromS) });
        line('Once more, slowly.', null, ch, part.i, 'take-slow', 'video');
        add({ kind: 'take', ch, part: part.i, step: 'take-slow', rate, dur: Math.max(0.2, take.toS - take.fromS) / rate });
      } else {
        (part.intro || []).forEach((x, k) => line(x, `${p}.intro.${k}`, ch, part.i, part.ghost ? 'ghost' : 'take', part.ghost ? 'ghost' : 'video'));
      }
      if (part.ghost) {
        (part.watch || []).forEach((x, k) => line(x, `${p}.watch.${k}`, ch, part.i, 'ghost', 'ghost'));
        add({ kind: 'ghost', ch, part: part.i, step: 'ghost', rate: 1, dur: ghostLen(part, 1) });
        line('And now slowly.', null, ch, part.i, 'ghost-slow', 'ghost');
        add({ kind: 'ghost', ch, part: part.i, step: 'ghost-slow', rate, dur: ghostLen(part, rate) });
      }
      
      const drill = part.practice && typeof part.practice === 'object' ? str(part.practice.say, 400) : '';
      if (drill) {
        const at = [ch, part.i, part.ghost ? 'ghost-slow' : take ? 'take-slow' : 'take', part.ghost ? 'ghost' : 'video'];
        line(drill, `${p}.practice`, ...at);
        (Array.isArray(part.practice.more) ? part.practice.more : []).forEach((x, k) => line(x, `${p}.practice.${k + 1}`, ...at));
      }
    }
    (L.close || []).forEach((x, k) => line(x, `close.${k}`, 'close', null, null, 'close'));
    return { segs, total: at };
  }
  
  function chaptersOf(me) {
    const out = [];
    for (const s of me.plan ? me.plan.segs : []) {
      const c = out[out.length - 1];
      if (c && c.ch === s.ch) c.dur += s.dur; else out.push({ ch: s.ch, at: s.at, dur: s.dur });
    }
    return out;
  }
  function chapterName(me, ch) {
    if (ch === 'open') return 'Hello';
    if (ch === 'close') return 'The end';
    const p = me.lesson && me.lesson.parts[ch];
    return `Part ${ch + 1} of ${me.parts}${p && p.title ? `: ${str(p.title, 80)}` : ''}`;
  }
  
  function segAt(me, pos) {
    const S = me.plan ? me.plan.segs : [];
    pos = Math.max(0, pos);
    const i = S.findIndex((s) => pos < s.at + s.dur - 1e-3);
    return i < 0 ? { i: S.length, off: 0 } : { i, off: Math.max(0, pos - S[i].at) };
  }
  
  
  function posNow(me) {
    if (me.scrub != null) return me.scrub;
    const P = me.plan;
    if (!P) return 0;
    if (me.mode === 'end' || me.segI >= P.segs.length) return me.mode === 'idle' ? 0 : P.total;
    const s = P.segs[me.segI];
    if (!s || me.mode !== 'lesson') return 0;
    let local = 0;
    try { local = me.segLocal ? +me.segLocal() || 0 : 0; } catch { local = 0; }
    return s.at + Math.max(0, Math.min(s.dur, local));
  }
  
  const pausedMs = (me) => (me.pauseAcc || 0) + (me.pauseStart != null ? performance.now() - me.pauseStart : 0);
  function pausable(me, from) {
    const t0 = performance.now(), p0 = pausedMs(me);
    return () => from + (performance.now() - t0 - (pausedMs(me) - p0)) / 1000;
  }
  
  function ensureGhost(me, part, rate) {
    const key = `${part.i}|${rate}`, m = me.curGhost;
    if (m && m.part === part && m.rate === rate && me.gst === m.st) return Promise.resolve(m);
    if (me.mounting && me.mounting.key === key) return me.mounting.p;
    const before = me.mounting ? me.mounting.p.catch(() => null) : Promise.resolve(null);
    const job = { key, p: null };
    job.p = before.then(() => (V === me ? mountGhost(me, part, rate) : null)).finally(() => { if (me.mounting === job) me.mounting = null; });
    me.mounting = job;
    return job.p;
  }
  
  
  function speakSeg(me, s, off) {
    return new Promise((resolve) => {
      let over = false;
      const done = () => { if (over) return; over = true; if (me.skipper === skip) me.skipper = null; me.root.classList.remove('speaking'); resolve(); };
      const skip = () => { try { speechSynthesis.cancel(); } catch {   } if (me.packStop) me.packStop(); done(); };
      me.skipper = skip;
      const clip = me.voiceOn && !me.packLost ? packClip(me, s.text) : null;
      if (clip) {
        const a = me.pack.audio;
        me.segLocal = () => Math.max(0, a.currentTime - clip[0]);
        playClip(me, [Math.min(clip[1] - 0.05, clip[0] + off), clip[1]], () => (me.packLost && !over && me.voiceOn ? browserSay(0) : done()));
        return;
      }
      browserSay(browserVoice(me) ? 0 : off);
      function browserSay(from) {
        me.segLocal = pausable(me, from);
        if (!browserVoice(me)) { hold(Math.max(0, s.dur - from) * 1000, me).then(done); return; }
        hold(s.dur * 1000 + 6000, me).then(done);           
        try {
          const u = new SpeechSynthesisUtterance(s.text);
          VOICE = VOICE || pickVoice();
          if (VOICE) u.voice = VOICE;
          u.rate = 1.0; u.pitch = 1.04; u.volume = me.vol;
          u.onstart = () => me.root.classList.add('speaking');
          u.onend = u.onerror = done;
          speechSynthesis.speak(u);
        } catch {   }
      }
    });
  }
  
  function enterSeg(me, s, off) {
    const L = me.lesson, v = me.video;
    const part = s.part != null ? L.parts[s.part] : null;
    if (part) setStep(me, s.part, s.step);
    else {
      const at = s.ch === 'close' ? { part: L.parts.length, step: null } : null;
      if (me.lbar.hidden === false || (me.at && !at) || (!me.at && at)) me.stepAt = performance.now();
      me.lbar.hidden = true;
      me.at = at;
    }
    if (s.kind !== 'take') me.band = null;
    else if (part && part.take) { try { v.pause(); v.currentTime = Math.max(0, part.take.fromS + off * s.rate); } catch {   } }
    const scene = s.kind === 'take' ? 'video' : s.kind === 'ghost' ? 'ghost' : s.kind === 'listen' ? 'try' : s.scene;
    
    if (scene === 'open') {
      showStage(me, 'video');
      const want = Math.max(0, Math.min((num(v.duration) || 1e9) - 0.05, s.at + off));
      v.muted = voiced(me);
      if (Math.abs((v.currentTime || 0) - want) > 0.4) { try { v.currentTime = want; } catch {   } }
      me.inOpen = true;
      if (me.paused) me.videoHeld = true;
      else if (v.paused && !v.ended) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
      return;
    }
    if (me.inOpen) { me.inOpen = false; v.pause(); v.muted = false; me.videoHeld = false; }
    if (scene === 'video' || scene === 'close') {
      showStage(me, 'video');
      if (s.kind === 'line') {
        v.pause();
        if (part && part.take) { try { v.currentTime = Math.max(0, part.take.fromS); } catch {   } }
      }
    } else if (scene === 'ghost' || scene === 'try') {
      showStage(me, scene);
      if (part && part.ghost && s.kind === 'line') ensureGhost(me, part, s.step === 'ghost' ? 1 : slowOf(L)).catch(() => {});
    }
  }
  async function runLine(me, s, off) {
    const who = lineWho(me.lesson, s.id);
    subtitle(me, s.text, who);
    let b = null;
    if (s.ch === 'open') b = me.talk.querySelectorAll('.mv-open')[+String(s.id).split('.')[1]] || null;
    else if (me.notes.has(s.k)) b = me.notes.get(s.k);
    else {
      b = note(me, 'muse', s.text, 'mv-in');
      if (who !== 'Muse') b.append(el('span', 'mv-by', who));
      me.notes.set(s.k, b);
    }
    if (b) b.classList.add('mv-now');
    me.segLocal = () => off;
    await resumed(me);
    if (V === me && !me.stopped) await speakSeg(me, s, off);
    if (b) b.classList.remove('mv-now');
  }
  
  async function runSeg(me, s, off) {
    const L = me.lesson, part = s.part != null ? L.parts[s.part] : null;
    const gone = () => V !== me || me.stopped;
    if (s.kind === 'line') return runLine(me, s, off);
    if (s.kind === 'take') {
      await resumed(me);
      if (!gone()) await playTake(me, part.take, s.rate, part.spot, off);
      return null;
    }
    if (s.kind === 'ghost') {
      const m = part.ghost ? await ensureGhost(me, part, s.rate).catch(() => null) : null;
      if (m && !gone()) await playGhost(me, part, s.rate, m, Math.min(off, Math.max(0, m.dur - 0.05)));
      return null;
    }
    if (s.kind === 'listen') {
      me.segLocal = () => (me.listenAt ? Math.min(s.dur, (performance.now() - me.listenAt) / 1000) : 0);
      const r = await listenFor(me, part);
      if (gone()) return null;
      me.segLocal = () => s.dur;
      const retry = !!(r && r.ok && r.verdict === 'focus' && part.ghost && !me.retried.has(part.i));
      if (r) await say([verdictLine(part, r, retry)], me);
      if (retry && !gone()) {
        me.retried.add(part.i);
        const j = me.plan.segs.findIndex((x) => x.part === part.i && x.step === 'ghost-slow');
        if (j >= 0) return { goto: me.plan.segs[j].at };
      }
    }
    return null;
  }
  async function playPlan(me, from) {
    const S = me.plan.segs;
    let { i, off } = segAt(me, from);
    for (; i < S.length; i++, off = 0) {
      if (V !== me || me.stopped) return;
      const s = S[i];
      me.segI = i;
      me.segLocal = () => off;
      enterSeg(me, s, off);
      const r = await runSeg(me, s, off);
      if (V !== me || me.stopped) return;
      if (r && r.goto != null) i = segAt(me, r.goto).i - 1;
    }
    me.segI = S.length;
  }
  
  async function playWithMuse(me) {
    showStage(me, 'video');
    try { me.video.currentTime = 0; } catch {   }
    const p = me.video.play();
    if (p && p.catch) p.catch(() => {});
    const shown = [...me.talk.querySelectorAll('.mv-open')];
    for (const [k, line] of me.lines.entries()) {
      if (V !== me || me.stopped) return;
      await resumed(me);
      subtitle(me, line);
      const b = shown[k];
      if (b) b.classList.add('mv-now');
      await sayOne(line, me);
      if (b) b.classList.remove('mv-now');
    }
    if (V !== me || me.stopped) return;
    if (!me.video.ended && me.video.src) await skippable(new Promise((r) => me.video.addEventListener('ended', r, { once: true })), me);
  }
  
  
  async function lessonPass(me, from) {
    const dead = () => V !== me || me.stopped;
    const out = () => (V === me && me.jumpTo != null ? 'jump' : 'stopped');
    if (!me.parts) {
      me.at = null; me.stepAt = performance.now();
      await playWithMuse(me);
    } else {
      await playPlan(me, from || 0);
      if (dead()) return out();
      if (me.inOpen) { me.inOpen = false; me.video.pause(); me.video.muted = false; me.videoHeld = false; }
      me.lbar.hidden = true;
      showStage(me, 'video');
    }
    if (dead()) return out();
    me.mode = 'end';
    me.root.classList.remove('lesson');
    subtitle(me, '');
    poster(me, 'end');
    renderBar(me);
    return 'done';
  }
  async function runLesson(me, from = 0) {
    me.stopped = false; me.paused = false; me.resumers = []; me.jumpTo = null;
    me.pauseAcc = 0; me.pauseStart = null; me.scrub = null;
    if (!from) me.retried = new Set();
    me.mode = 'lesson';
    me.root.classList.add('lesson');
    me.poster.hidden = true;
    me.at = null; me.segI = 0;
    if (me.parts) me.plan = planOf(me);
    renderBar(me);
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch {   }
    let target = from;
    for (;;) {
      const r = await lessonPass(me, target);
      if (r !== 'jump') return;
      
      target = me.jumpTo; me.jumpTo = null;
      me.stopped = false; me.resumers = [];
      me.at = null;                                     
      me.paused = !!me.holdPaused; me.holdPaused = false;
      if (me.paused) me.pauseStart = performance.now();
      try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch {   }
      renderBar(me);
    }
  }
  
  function interrupt(me) {
    me.stopped = true;
    me.paused = false;
    if (me.pauseStart != null) { me.pauseAcc = (me.pauseAcc || 0) + performance.now() - me.pauseStart; me.pauseStart = null; }
    for (const r of (me.resumers || []).splice(0)) r();
    try { speechSynthesis.cancel(); } catch {   }
    if (me.endTake) me.endTake();
    if (me.skipper) me.skipper();
    if (me.packStop) me.packStop();
    if (me.listening) me.listening.stop();
    if (me.gst) { try { me.gst.pause(); } catch {   } }
    me.video.pause();
    me.video.muted = false;
    me.inOpen = false; me.videoHeld = false;
    me.lis.hidden = true;
  }
  
  
  function seekTo(me, pos) {
    if (V !== me || !me.plan || !me.parts) return;
    pos = Math.max(0, Math.min(me.plan.total, +pos || 0));
    if (me.mode === 'lesson') { me.jumpTo = pos; me.holdPaused = me.paused; interrupt(me); }
    else if (me.mode === 'idle' || me.mode === 'end') runLesson(me, pos);
  }
  
  function stepBounds(me, i) {
    const S = me.plan.segs, same = (a, b) => a && b && a.ch === b.ch && a.step === b.step;
    let a = i, b = i;
    while (a > 0 && same(S[a - 1], S[i])) a--;
    while (b < S.length - 1 && same(S[b + 1], S[i])) b++;
    return [a, b];
  }
  
  
  function previous(me) {
    if (V !== me) return;
    if (me.mode === 'watch') { try { me.video.currentTime = 0; } catch {   } return; }
    if (me.mode !== 'lesson') return;
    if (!me.plan || !me.parts) { me.jumpTo = 0; interrupt(me); return; }
    const S = me.plan.segs, i = Math.min(me.segI || 0, S.length - 1);
    if (i < 0) return;
    const [a] = stepBounds(me, i);
    if (posNow(me) - S[a].at > 3) return seekTo(me, S[a].at);
    seekTo(me, a > 0 ? S[stepBounds(me, a - 1)[0]].at : 0);
  }
  
  function next(me) {
    if (me.mode !== 'lesson') return;
    if (!me.plan || !me.parts) { if (me.endTake) me.endTake(); if (me.skipper) me.skipper(); return; }
    const S = me.plan.segs, i = me.segI || 0;
    if (i >= S.length) return;
    const [, b] = stepBounds(me, i);
    seekTo(me, b + 1 < S.length ? S[b + 1].at : me.plan.total);
  }
  function stopLesson(me) {
    interrupt(me);
    showStage(me, 'video');
    me.band = null;
    me.lbar.hidden = true;
    me.root.classList.remove('lesson');
    me.mode = 'idle';
    subtitle(me, '');
    poster(me, 'idle');
    renderBar(me);
  }
  
  function watch(me, from = null) {
    me.mode = 'watch';
    me.poster.hidden = true;
    showStage(me, 'video');
    subtitle(me, '');
    try { if (from != null) me.video.currentTime = from; else if (me.video.ended) me.video.currentTime = 0; } catch {   }
    const p = me.video.play();
    if (p && p.catch) p.catch(() => {});
    renderBar(me);
  }

  
  const ICON = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
    skip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6.5v11l8-5.5zM16 6h2.2v12H16z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 6.5v11l-8-5.5zM6 6h2.2v12H6z"/></svg>',
    voiceOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    voiceOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>',
    notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1.1-3.9A8 8 0 1 1 20 12z"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>',
  };
  const iconBtn = (cls, icon, label) => { const b = el('button', cls); b.type = 'button'; b.innerHTML = icon; b.setAttribute('aria-label', label); b.title = label; return b; };
  function minutesOf(me) {
    const n = me.parts;
    if (!n) return '';
    const s = me.plan ? me.plan.total : 60 * n;
    return `${n} ${n === 1 ? 'part' : 'parts'}, about ${Math.max(1, Math.round(s / 60))} min`;
  }
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  const SKILL_LESSON = { rhythm: ['steadiness', ['uneven_run', 'uneven_touch']] };
  const SKILL_AXES = [['notes', 'Notes'], ['rhythm', 'Rhythm'], ['right', 'Right hand'], ['left', 'Left hand'], ['flow', 'Flow']];
  const SKILL_WHY = {
    notes: "The score's notes you played as written",
    rhythm: 'How steady the beat was inside each bar',
    right: 'How much of the time your right hand played well',
    left: 'How much of the time your left hand played well',
    flow: 'The bars you played through without stopping or going back',
  };
  const ramp = (v, full, none) => clamp01(1 - (v - full) / (none - full));
  
  
  function judgedOf(judged, finds, test) {
    let n = 0, bad = 0;
    for (const j of judged.filter(test)) {
      const ph = Math.max(0, Math.round(num(j.phrases) || 0));
      const f = finds.find((x) => x.item === j.item && (x.hand || null) === (j.hand || null));
      n += ph;
      if (f) bad += Math.min(ph, Array.isArray(f.phrases) ? new Set(f.phrases).size : ph);
    }
    return { n, bad };
  }
  function skillsOf(res) {
    const ref = res && res.reference && typeof res.reference === 'object' ? res.reference : null;
    const ok = !!ref && ref.recognised !== false && ref.level === 'note';
    const M = res && res.lesson && Array.isArray(res.lesson.measures) ? res.lesson.measures.filter((m) => m && typeof m === 'object') : [];
    const ev = (id) => { const m = M.find((x) => x.id === id); return m && m.evidence && typeof m.evidence === 'object' ? m.evidence : null; };
    const v = {};
    const bars = ok && Array.isArray(ref.barStats) ? ref.barStats.filter((b) => b && typeof b === 'object') : [];
    if (ok) {
      const m = Math.max(0, +ref.matched || 0), w = Array.isArray(ref.wrong) ? ref.wrong.length : 0, x = Array.isArray(ref.missed) ? ref.missed.length : 0;
      if (m + w + x >= 8) v.notes = m / (m + w + x);
      const ms = bars.map((b) => num(b.onsetMs)).filter((t) => t != null).sort((a, b) => a - b);
      if (ms.length >= 3) v.rhythm = ramp(ms[ms.length >> 1], 10, 70);
    }
    const ne = ev('notes');
    if (v.notes == null && ne) {
      const m = Math.max(0, num(ne.matched) || 0), w = Math.max(0, num(ne.wrong) || 0), x = Math.max(0, num(ne.missed) || 0);
      if (m + w + x >= 8) v.notes = m / (m + w + x);
    }
    const st = ev('steadiness');
    if (v.rhythm == null && st && num(st.onsetMsMedian) != null) v.rhythm = ramp(st.onsetMsMedian, 10, 70);
    
    
    if (v.rhythm == null && st && st.timing && num(st.timing.score) != null) v.rhythm = Math.max(0, Math.min(1, num(st.timing.score)));
    const all = new Set(bars.map((b) => `${b.piece}|${b.bar}|${b.pass}`));
    if (all.size >= 4) {
      const sf = (Array.isArray(res.findings) ? res.findings : []).find((f) => f && f.item === 'stops');
      let fl = sf ? sf.flow : null;
      if (typeof fl === 'string') { try { fl = JSON.parse(fl); } catch { fl = null; } }
      const cont = ev('continuity');
      const hits = (Array.isArray(fl) ? fl : []).concat(cont && Array.isArray(cont.stops) ? cont.stops : []).filter((e) => e && typeof e === 'object')
        .map((e) => `${e.piece || (bars[0] || {}).piece}|${e.bar}|${e.pass || 1}`).filter((k) => all.has(k));
      v.flow = (all.size - new Set(hits).size) / all.size;
    }
    const an = res && res.analysis && typeof res.analysis === 'object' ? res.analysis : null;
    const judged = an && an.coverage && Array.isArray(an.coverage.judged) ? an.coverage.judged.filter((j) => j && typeof j === 'object') : [];
    const finds = (Array.isArray(res && res.findings) ? res.findings : []).filter((f) => f && typeof f === 'object');
    const H = res && res.lesson && res.lesson.hands;
    for (const [h, id] of [['R', 'right'], ['L', 'left']]) {
      const xs = H && Array.isArray(H[h]) ? H[h].filter(okSec) : [];
      if (xs.length) {
        const len = (s) => xs.filter((x) => x.state === s).reduce((a, x) => a + (x.toS - x.fromS), 0);
        const g = len('good'), f = len('fix');
        if (g + f >= 1) v[id] = g / (g + f);
      } else {
        const { n, bad } = judgedOf(judged, finds, (j) => j.hand === h);
        if (n) v[id] = (n - bad) / n;
      }
    }
    for (const [axis, [mid, items]] of Object.entries(SKILL_LESSON)) {
      if (v[axis] != null) continue;
      const lm = M.find((x) => x.id === mid);
      if (!lm || (lm.state !== 'steady' && lm.state !== 'work-on-it')) continue;
      const { n, bad } = judgedOf(judged, finds, (j) => items.includes(j.item));
      if (n) v[axis] = (n - bad) / n;
      else if (lm.state === 'steady') v[axis] = 1;
    }
    const axes = SKILL_AXES.map(([id, name]) => ({ id, name, v: num(v[id]) != null ? clamp01(v[id]) : null, why: SKILL_WHY[id] }));
    const got = axes.filter((a) => a.v != null);
    if (!got.length) return null;
    return { axes, score: got.length >= 3 ? Math.round((100 * got.reduce((a, x) => a + x.v, 0)) / got.length) : null };
  }
  
  
  function skillsView(sk) {
    const NS = 'http://www.w3.org/2000/svg', R = 70, cx = 120, cy = 104;
    const mk = (tag, at) => { const n = document.createElementNS(NS, tag); for (const k in at) n.setAttribute(k, at[k]); return n; };
    const pt = (k, r) => { const a = (-90 + 72 * k) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const ring = (f) => SKILL_AXES.map((_, k) => pt(k, R * f).map((n) => n.toFixed(1)).join(',')).join(' ');
    const wrap = el('figure', 'mv-skills');
    const svg = mk('svg', { viewBox: '0 0 240 212', class: 'mv-sk-svg', 'aria-hidden': 'true' });
    const defs = mk('defs', {}), grad = mk('linearGradient', { id: 'mvSkGrad', x1: '0', y1: '0', x2: '1', y2: '1' });
    grad.append(mk('stop', { offset: '0', 'stop-color': '#C084FC' }), mk('stop', { offset: '1', 'stop-color': '#F472B6' }));
    defs.append(grad); svg.append(defs);
    svg.append(mk('polygon', { points: ring(1), class: 'sk-ring' }), mk('polygon', { points: ring(0.5), class: 'sk-ring sk-half' }));
    SKILL_AXES.forEach((_, k) => { const [x, y] = pt(k, R); svg.append(mk('line', { x1: cx, y1: cy, x2: x.toFixed(1), y2: y.toFixed(1), class: 'sk-axis' })); });
    const on = sk.axes.map((a, k) => (a.v != null ? pt(k, Math.max(0.04, a.v) * R) : null)).filter(Boolean);
    const shape = mk('g', { class: 'sk-shape' });
    shape.append(mk('polygon', { points: on.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' '), class: 'sk-fill' }));
    for (const [x, y] of on) shape.append(mk('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: '2.6', class: 'sk-dot' }));
    svg.append(shape);
    sk.axes.forEach((a, k) => {
      const [x, y] = pt(k, R + 17), anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
      const t = mk('text', { x: x.toFixed(1), y: (y + (k === 0 ? -6 : 0)).toFixed(1), 'text-anchor': anchor, class: `sk-name${a.v == null ? ' off' : ''}` });
      t.textContent = a.name;
      const n = mk('tspan', { x: x.toFixed(1), dy: '13', class: 'sk-val' });
      n.textContent = a.v == null ? '-' : String(Math.round(a.v * 100));
      t.append(n);
      const tt = mk('title', {}); tt.textContent = a.v == null ? `${a.name}: not measured in this take` : `${a.name}: ${Math.round(a.v * 100)}. ${a.why}`;
      t.append(tt);
      svg.append(t);
    });
    const sc = mk('text', { x: cx, y: cy + 8, 'text-anchor': 'middle', class: `sk-score${sk.score == null ? ' off' : ''}` });
    sc.textContent = sk.score == null ? '-' : String(sk.score);
    const sl = mk('text', { x: cx, y: cy + 22, 'text-anchor': 'middle', class: 'sk-score-l' });
    sl.textContent = 'SCORE';
    svg.append(sc, sl);
    wrap.append(svg);
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `${sk.score == null ? 'No score: fewer than three measures could be measured in this take' : `Score ${sk.score} out of 100`}. ${sk.axes.map((a) => (a.v == null ? `${a.name}: not measured` : `${a.name}: ${Math.round(a.v * 100)}`)).join(', ')}.`);
    return wrap;
  }

  
  function poster(me, kind) {
    me.poster.hidden = false;
    me.poster.dataset.kind = kind;
    const kids = [];
    if (kind === 'end') {
      
      const sk = skillsOf(me.res);
      kids.push(el('p', 'mv-eyebrow', "That's the lesson"), sk ? skillsView(sk) : el('h2', 'mv-ptitle', 'Film it again and see what changed'));
      const again = el('button', 'btn btn-primary btn-lg mv-again', 'Film it again');
      again.type = 'button';
      again.addEventListener('click', () => (me.ctx.retake || me.ctx.back)());
      const re = el('button', 'tb-nav mv-replay', 'Play the lesson again');
      re.type = 'button';
      re.addEventListener('click', () => runLesson(me));
      const row = el('div', 'mv-prow');
      row.append(again, re);
      kids.push(row);
    } else {
      kids.push(el('p', 'mv-eyebrow', me.parts ? "Muse's lesson" : 'Muse watched your take'));
      const titles = me.parts ? me.lesson.parts.map((p) => str(p.title, 80)).filter(Boolean) : [];
      kids.push(el('h2', 'mv-ptitle', titles.length ? titles.join(' · ') : (me.lines[0] || 'Your take')));
      const go = el('button', 'mv-play-big mv-go');
      go.type = 'button';
      go.innerHTML = ICON.play;
      go.append(el('span', 'mv-go-t', me.parts ? 'Play the lesson' : 'Play with Muse'));
      go.addEventListener('click', () => runLesson(me));
      kids.push(go);
      const meta = minutesOf(me);
      if (meta) kids.push(el('p', 'mv-pmeta', meta));
      if (me.parts && me.video.src) {
        const w = el('button', 'tb-nav mv-watch', 'Watch your take');
        w.type = 'button';
        w.addEventListener('click', () => watch(me));
        kids.push(w);
      }
    }
    me.poster.replaceChildren(...kids);
  }
  
  function renderBar(me) {
    const playing = (me.mode === 'lesson' && !me.paused) || (me.mode === 'watch' && !me.video.paused);
    me.playBtn.innerHTML = playing ? ICON.pause : ICON.play;
    const label = me.mode === 'lesson' ? (me.paused ? 'Resume the lesson' : 'Pause the lesson') : me.mode === 'watch' ? (playing ? 'Pause' : 'Play your take')
      : me.mode === 'end' ? 'Play the lesson again' : me.parts ? 'Play the lesson' : 'Play with Muse';
    me.playBtn.setAttribute('aria-label', label); me.playBtn.title = label;
    me.playBtn.classList.toggle('on', playing);
    me.skipBtn.hidden = me.mode !== 'lesson';
    me.prevBtn.hidden = me.mode !== 'lesson' && me.mode !== 'watch';
    me.voiceBtn.innerHTML = me.voiceOn ? ICON.voiceOn : ICON.voiceOff;
    me.voiceBtn.setAttribute('aria-pressed', String(me.voiceOn));
    me.voiceBtn.setAttribute('aria-label', "Muse's voice");
    me.voiceBtn.title = me.voiceOn ? "Muse's voice is on. Tap to mute it; the subtitles stay." : 'Muse is muted: subtitles only. Tap to hear Muse.';
    if (me.credit) me.credit.hidden = !(me.voiceOn && me.pack && !me.packLost);
    me.chips.hidden = !(me.mode === 'idle' || me.mode === 'end') || me.asked != null;
    
    let where = '';
    const n = me.parts;
    if (me.mode === 'lesson' && n && me.at) {
      const p = me.lesson.parts[me.at.part];
      where = p ? `Part ${me.at.part + 1} of ${n} · ${(STEPS.find(([id]) => id === me.at.step) || [, ''])[1]}` : 'The end';
    } else if (me.mode === 'lesson') where = me.at && me.at.part === n ? 'The end' : 'Hello';
    else if (me.mode === 'watch') where = 'Your take';
    me.where.textContent = me.paused ? `Paused${where ? ` · ${where}` : ''}` : where;
    renderTimeline(me);
  }

  
  
  
  
  const lessonBar = (me) => !!(me.plan && me.parts && me.mode !== 'watch');
  function videoTime(me) {
    const v = me.video;
    const d = num(v.duration) || num(me.res.job && me.res.job.video && me.res.job.video.durationS) || null;
    return { pos: v.currentTime || 0, len: d, seek: d ? (f) => { try { v.currentTime = f * d; } catch {   } } : null };
  }
  function renderTimeline(me) {
    if (!me.segWrap || V !== me) return;
    if (lessonBar(me)) {
      const chs = chaptersOf(me), pos = posNow(me), total = me.plan.total;
      const key = `plan|${chs.map((c) => `${c.ch}:${c.dur.toFixed(1)}`).join()}`;
      if (me.segKey !== key) {
        me.segKey = key;
        me.segWrap.replaceChildren(...chs.map((c) => {
          const sg = el('div', 'mv-seg');
          sg.dataset.ch = String(c.ch); sg.title = chapterName(me, c.ch);
          sg.style.flex = `${Math.max(0.6, c.dur).toFixed(2)} 1 0px`;
          sg.append(el('span'));
          return sg;
        }));
      }
      let on = chs.length - 1;
      [...me.segWrap.children].forEach((sg, k) => {
        const c = chs[k], f = Math.max(0, Math.min(1, (pos - c.at) / Math.max(0.01, c.dur)));
        if (pos >= c.at && pos < c.at + c.dur && on === chs.length - 1) on = k;
        sg.firstChild.style.width = `${(f * 100).toFixed(2)}%`;
      });
      if (pos < (chs[on] || { at: 0 }).at) on = 0;
      [...me.segWrap.children].forEach((sg, k) => { sg.classList.toggle('on', k === on); sg.classList.toggle('past', k < on); });
      me.tL.textContent = mmss(pos);
      me.tR.textContent = mmss(total);
      me.progWrap.setAttribute('aria-valuenow', String(Math.round((total ? pos / total : 0) * 100)));
      me.progWrap.setAttribute('aria-valuetext', `${mmss(pos)} of ${mmss(total)}, ${chs[on] ? chapterName(me, chs[on].ch) : ''}`);
      me.progWrap.classList.toggle('live', true);
      me.progWrap.classList.toggle('scrubbing', me.scrub != null);
      return;
    }
    const t = videoTime(me);
    if (me.segKey !== 'all') {
      me.segKey = 'all';
      const sg = el('div', 'mv-seg');
      sg.dataset.id = 'all'; sg.title = 'The take';
      sg.append(el('span'));
      me.segWrap.replaceChildren(sg);
    }
    const sg = me.segWrap.firstChild;
    sg.firstChild.style.width = `${((t.len ? Math.max(0, Math.min(1, t.pos / t.len)) : 0) * 100).toFixed(1)}%`;
    sg.classList.add('on');
    me.tL.textContent = mmss(t.pos);
    me.tR.textContent = t.len ? mmss(t.len) : '--:--';
    me.progWrap.setAttribute('aria-valuenow', String(Math.round((t.len ? t.pos / t.len : 0) * 100)));
    me.progWrap.setAttribute('aria-valuetext', `The take: ${mmss(t.pos)} of ${t.len ? mmss(t.len) : 'unknown'}`);
    me.progWrap.classList.toggle('live', (me.mode === 'lesson' || me.mode === 'watch') && !!t.seek);
    me.progWrap.classList.remove('scrubbing');
  }
  
  function wireTimeline(me) {
    const posAt = (x) => {
      const kids = [...me.segWrap.children], chs = chaptersOf(me);
      if (!kids.length || kids.length !== chs.length) return null;
      let best = null;
      kids.forEach((k, i) => { const r = k.getBoundingClientRect(); const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0; if (!best || d < best.d) best = { d, r, c: chs[i] }; });
      return best.c.at + Math.max(0, Math.min(1, (x - best.r.left) / Math.max(1, best.r.width))) * best.c.dur;
    };
    const fracAt = (x) => { const r = me.segWrap.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / Math.max(1, r.width))); };
    let drag = null;
    me.progWrap.addEventListener('pointerdown', (e) => {
      if (lessonBar(me)) {
        const p = posAt(e.clientX);
        if (p == null) return;
        drag = 'lesson'; me.scrub = p;
      } else {
        if (me.mode !== 'lesson' && me.mode !== 'watch') return;
        const t = videoTime(me);
        if (!t.seek) return;
        drag = 'video'; t.seek(fracAt(e.clientX));
      }
      try { me.progWrap.setPointerCapture(e.pointerId); } catch {   }
      renderTimeline(me);
      e.preventDefault();
    });
    me.progWrap.addEventListener('pointermove', (e) => {
      if (drag === 'lesson') { const p = posAt(e.clientX); if (p != null) { me.scrub = p; renderTimeline(me); } }
      else if (drag === 'video') { const t = videoTime(me); if (t.seek) { t.seek(fracAt(e.clientX)); renderTimeline(me); } }
    });
    const up = () => {
      if (drag === 'lesson' && me.scrub != null) { const p = me.scrub; me.scrub = null; seekTo(me, p); }
      drag = null; me.scrub = null;
      renderTimeline(me);
    };
    me.progWrap.addEventListener('pointerup', up);
    me.progWrap.addEventListener('pointercancel', () => { drag = null; me.scrub = null; renderTimeline(me); });
    me.progWrap.addEventListener('keydown', (e) => {
      let to = null;
      if (lessonBar(me)) {
        const pos = posNow(me), total = me.plan.total;
        if (e.key === 'ArrowRight') to = pos + 5; else if (e.key === 'ArrowLeft') to = pos - 5; else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = total;
        if (to == null) return;
        e.preventDefault();
        seekTo(me, to);
        return;
      }
      if (me.mode !== 'lesson' && me.mode !== 'watch') return;
      const t = videoTime(me);
      if (!t.seek || !t.len) return;
      if (e.key === 'ArrowRight') to = t.pos + 5; else if (e.key === 'ArrowLeft') to = t.pos - 5; else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = t.len - 0.1;
      if (to == null) return;
      e.preventDefault();
      t.seek(Math.max(0, Math.min(1, to / t.len)));
      renderTimeline(me);
    });
  }

  
  function build(ctx) {
    const root = document.getElementById('tb-mv');
    root.replaceChildren();
    
    const canvas = el('div', 'mv-canvas');
    const frame = el('div', 'mv-scene mv-frame');
    const video = el('video', 'mv-video');
    video.playsInline = true; video.preload = 'metadata'; video.controls = false;
    if (ctx.video) video.src = ctx.video;
    const ov = el('canvas', 'mv-ov');
    ov.setAttribute('aria-hidden', 'true');
    const spot = el('span', 'mv-spot');
    spot.hidden = true;
    spot.setAttribute('aria-live', 'polite');
    const secPill = el('span', 'mv-sec');
    secPill.hidden = true;
    frame.append(video, ov, secPill, spot);
    const ghostWrap = el('div', 'mv-scene mv-ghost');
    ghostWrap.hidden = true;
    const ghostBox = el('div', 'mv-ghostbox');
    const gcap = el('span', 'mv-gcap', 'The score');
    const gnote = el('span', 'mv-gnote');
    const lis = el('div', 'mv-listen');
    lis.hidden = true;
    const lisLevel = el('span', 'mv-lis-orb');
    lisLevel.setAttribute('aria-hidden', 'true');
    const lisText = el('p', 'mv-lis-text');
    lisText.setAttribute('aria-live', 'polite');
    const lisDots = el('span', 'mv-lis-dots');
    lisDots.setAttribute('aria-hidden', 'true');
    lis.append(lisLevel, lisText, lisDots);
    const gtop = el('div', 'mv-gtop');
    gtop.append(gcap, gnote);
    const gesture = el('div', 'mv-gesture');
    const gHint = el('span', 'mv-gesture-hint', 'Drag to turn · pinch or scroll to zoom');
    const gReset = el('button', 'mv-gesture-reset', 'Reset view');
    gReset.type = 'button'; gReset.hidden = true;
    gReset.addEventListener('click', () => { if (V && V.gst) V.gst.resetView(true); });
    gesture.append(gHint, gReset);
    ghostWrap.append(gtop, ghostBox, lis, gesture);
    const shade = el('div', 'mv-shade');
    shade.setAttribute('aria-hidden', 'true');
    canvas.append(frame, ghostWrap, shade);

    
    const top = el('header', 'mv-top');
    const back = el('button', 'tb-nav mv-back');
    back.type = 'button';
    back.innerHTML = ICON.back;
    back.append(el('span', 'mv-back-word', 'History'));
    back.setAttribute('aria-label', 'Back to History');
    back.addEventListener('click', () => ctx.back());
    
    const name = el('span', 'mv-name', ctx.name || 'Your take');
    const det = el('button', 'tb-nav mv-details', 'Full analysis');
    det.type = 'button';
    det.hidden = !ctx.details;                                            
    det.addEventListener('click', () => { if (ctx.details) ctx.details(); });
    const lbar = el('div', 'mv-lbar');
    lbar.hidden = true;
    const lparts = el('ol', 'mv-lparts');
    const L = lessonOf(ctx.res);
    for (const p of L ? L.parts : []) {
      const li = el('li', '', `${p.i + 1}  ${str(p.title, 80)}`);
      li.dataset.i = String(p.i);
      lparts.append(li);
    }
    const lsteps = el('div', 'mv-lsteps');
    for (const [id, label] of STEPS) { const sp = el('span', '', label); sp.dataset.s = id; lsteps.append(sp); }
    const lstrip = el('div', 'mv-strip');
    lstrip.hidden = true;
    lbar.append(lparts, lsteps, lstrip);
    
    const tag = el('span', 'mv-tag');
    tag.append(el('i'), el('span', '', SCENE.video));

    
    const posterEl = el('div', 'mv-poster');
    const sub = el('div', 'mv-sub');
    sub.hidden = true;
    sub.setAttribute('aria-live', 'polite');
    const subWho = el('span', 'mv-sub-who');
    const sorb = el('span', 'mv-orb');
    sorb.setAttribute('aria-hidden', 'true');
    subWho.append(sorb, el('span', '', 'Muse'));
    const subText = el('p', 'mv-sub-text');
    
    const credit = el('p', 'mv-credit', 'Voice by ElevenLabs');
    credit.hidden = true;
    sub.append(subWho, subText, credit);

    
    const dock = el('div', 'mv-dock');
    
    const secs = sectionsTrimmed(ctx.res), hands = secs.length ? handsOf(ctx.res) : null;
    const bar = el('div', 'mv-bar');
    
    const track = el('div', 'mv-track');
    
    
    const tk = trackOf(ctx), meta = el('div', 'mv-meta');
    const cover = coverOf(tk.composer);
    let art;
    if (cover) {
      art = el('img', 'mv-art');
      art.src = cover; art.alt = ''; art.decoding = 'async';
    } else {
      art = el('video', 'mv-art');
      art.muted = true; art.playsInline = true; art.preload = 'metadata'; art.tabIndex = -1; art.disablePictureInPicture = true;
      if (ctx.video) {
        art.src = ctx.video;
        art.addEventListener('loadedmetadata', () => { try { art.currentTime = Math.min(1, (num(art.duration) || 2) / 2); } catch {   } }, { once: true });
      }
    }
    art.setAttribute('aria-hidden', 'true');
    const artBtn = el('button', 'mv-art-btn');
    artBtn.type = 'button';
    artBtn.setAttribute('aria-label', 'History: your takes'); artBtn.title = 'History: your takes';
    artBtn.addEventListener('click', () => ctx.back());
    artBtn.append(art);
    meta.append(el('span', 'mv-title', tk.title), el('span', 'mv-artist', tk.by));
    track.append(artBtn, meta);
    const playBtn = iconBtn('mv-tbtn mv-play', ICON.play, 'Play the lesson');
    const skipBtn = iconBtn('mv-tbtn mv-skip', ICON.skip, 'Skip');
    const prevBtn = iconBtn('mv-tbtn mv-prev', ICON.prev, 'Previous: start this step again, or go back one');
    
    
    const progWrap = el('div', 'mv-prog');
    progWrap.tabIndex = 0;
    progWrap.setAttribute('role', 'slider');
    progWrap.setAttribute('aria-label', 'Position in this part of the lesson');
    progWrap.setAttribute('aria-valuemin', '0'); progWrap.setAttribute('aria-valuemax', '100'); progWrap.setAttribute('aria-valuenow', '0');
    const segWrap = el('div', 'mv-segs');
    progWrap.append(segWrap);
    const tL = el('span', 'mv-t mv-t-l', '0:00'), tR = el('span', 'mv-t mv-t-r', '--:--');
    tL.setAttribute('aria-hidden', 'true'); tR.setAttribute('aria-hidden', 'true');
    const where = el('span', 'mv-where');
    const voiceBtn = iconBtn('mv-tbtn mv-voice-on', ICON.voiceOn, 'Voice on');
    const voiceSel = el('select', 'mv-voice');
    voiceSel.setAttribute('aria-label', "Muse's voice");
    voiceSel.title = "Muse's voice: the voices this browser has, the most natural first";
    voiceSel.hidden = true;
    const mid = el('div', 'mv-mid');
    mid.append(where, tL, progWrap, tR);
    const ctrl = el('div', 'mv-ctrl');
    ctrl.append(prevBtn, playBtn, skipBtn);
    
    
    const volBtn = iconBtn('mv-tbtn mv-vol-btn', ICON.voiceOn, 'Mute');
    const volRange = el('input', 'mv-vol');
    volRange.type = 'range'; volRange.min = '0'; volRange.max = '100'; volRange.step = '1';
    volRange.setAttribute('aria-label', 'Volume');
    const tools = el('div', 'mv-tools');
    tools.append(volBtn, volRange);
    bar.append(track, ctrl, mid, tools);
    const chips = el('div', 'mv-chips');
    for (const c of CHIPS) {
      const b = el('button', 'mv-chip', c);
      b.type = 'button';
      b.addEventListener('click', () => ask(c));
      chips.append(b);
    }
    const form = el('form', 'mv-ask');
    const input = el('input');
    input.type = 'text'; input.maxLength = 500; input.placeholder = 'Ask Muse about your take'; input.setAttribute('aria-label', 'Ask Muse about your take');
    const send = el('button', 'mv-send');
    send.type = 'submit'; send.setAttribute('aria-label', 'Ask');
    send.innerHTML = ICON.send;
    
    form.append(input, send);
    dock.append(bar);
    
    
    const scoreBox = el('div', 'mv-score');
    scoreBox.setAttribute('role', 'group');
    scoreBox.hidden = true;
    top.append(back, name, scoreBox, det);

    
    
    const side = el('aside', 'mv-notes mv-muse');
    side.setAttribute('aria-label', 'Chat with Muse');
    side.hidden = true;
    const head = el('div', 'mv-head');
    const who = el('div', 'mv-who');
    who.append(el('b', '', 'Muse'), el('span', 'mv-src', sourceOf(ctx.res)));
    const shut = iconBtn('mv-tbtn mv-shut', ICON.close, 'Close the chat');
    const vrow = el('label', 'mv-vrow');
    vrow.append(el('span', '', 'Voice'), voiceSel);
    head.append(who, voiceBtn, vrow, shut);
    const talk = el('ol', 'mv-talk');
    const chatChips = el('div', 'mv-chat-chips');
    for (const c of CHIPS) {
      const b = el('button', 'mv-chat-chip', c);
      b.type = 'button';
      b.addEventListener('click', () => ask(c));
      chatChips.append(b);
    }
    const chatForm = el('form', 'mv-chatform');
    const chatInput = el('input');
    chatInput.type = 'text'; chatInput.maxLength = 500; chatInput.placeholder = 'Message Muse'; chatInput.setAttribute('aria-label', 'Message Muse');
    const chatSend = el('button', 'mv-send');
    chatSend.type = 'submit'; chatSend.setAttribute('aria-label', 'Send');
    chatSend.innerHTML = ICON.send;
    chatForm.append(chatInput, chatSend);
    chatForm.addEventListener('submit', (e) => { e.preventDefault(); ask(chatInput.value); });
    side.append(head, talk, el('div', 'mv-chat-foot'));
    side.lastChild.append(chatChips, chatForm);

    root.append(canvas, top, lbar, tag, posterEl, sub, dock);
    return { root, canvas, video, ov, scoreBox, talk, chips, input, chatInput, chatChips, voiceSel, voiceBtn, credit, frame, spot, secPill, secs, hands,
      lbar, lparts, lsteps, lstrip, ghostWrap, ghostBox, gesture, gHint, gReset, gcap, gnote, lis, lisLevel, lisText, lisDots, tag, poster: posterEl, sub, subWho, subText, dock,
      playBtn, skipBtn, prevBtn, volBtn, volRange, progWrap, segWrap, tL, tR, where, side, shut };
  }

  function onPlay(me) {
    if (me.mode === 'lesson') { if (me.paused) resumeLesson(me); else pauseLesson(me); return; }
    if (me.mode === 'watch') { if (me.video.paused) { const p = me.video.play(); if (p && p.catch) p.catch(() => {}); } else me.video.pause(); renderBar(me); return; }
    runLesson(me);
  }

  function open(ctx) {
    close();
    const parts = build(ctx);
    V = { ctx, res: ctx.res, ...parts, raf: 0, overlayOn: true, opened: false, rows: ctx.rows || [], mode: 'idle', paused: false, resumers: [], announced: new Set(), asked: null, seenRows: false };
    const me = V, L = lessonOf(ctx.res);
    const lines = L ? L.open.map((x) => str(x, 400)).filter(Boolean) : opening(ctx.res);
    me.lines = lines;
    me.voiceOn = voiceWanted();
    
    const vp = ctx.res && ctx.res.voicePack;
    const clips = packClips(ctx.res);
    me.pack = ctx.voice && vp && clips ? { clips, audio: new Audio(ctx.voice) } : null;
    if (me.pack) { me.pack.audio.preload = 'auto'; me.pack.audio.addEventListener('error', () => { me.packLost = true; if (V === me) renderBar(me); }); }
    me.lesson = L;
    me.parts = L ? L.parts.length : 0;
    me.retried = new Set(); me.notes = new Map(); me.segI = 0;
    me.plan = L && me.parts ? planOf(me) : null;
    me.root.hidden = false;
    pianoReady(L);                                               
    
    for (const [k, line] of lines.entries()) {
      const b = bubble('muse', line, 'mv-open');
      const who = L ? lineWho(L, `open.${k}`) : 'Muse';
      if (who !== 'Muse') b.append(el('span', 'mv-by', who));
      me.talk.append(b);
    }
    
    const aside = L && L.judge && Array.isArray(L.judge.setAside) ? L.judge.setAside : [];
    for (const x of aside.slice(0, 6)) {
      const t = [str(x && x.title, 120), str(x && x.why, 300)].filter(Boolean).join(': ');
      if (!t) continue;
      const b = bubble('muse', `Set aside for now - ${t}`, 'mv-open mv-aside');
      b.append(el('span', 'mv-by', 'Muse Wonder'));
      me.talk.append(b);
    }
    me.opened = true;
    renderRows(me.rows);
    for (const r of me.rows) if (r && r.role === 'user') me.announced.add(r.id);       
    me.seenRows = true;
    me.video.addEventListener('play', () => { kick(); renderBar(me); });
    for (const ev of ['pause', 'ended', 'seeking']) me.video.addEventListener(ev, () => { stillFrame(); if (V === me) renderBar(me); });
    me.video.addEventListener('ended', () => { if (V === me && me.mode === 'watch') { me.mode = 'idle'; poster(me, 'idle'); renderBar(me); } });
    for (const ev of ['seeked', 'loadeddata', 'timeupdate']) me.video.addEventListener(ev, () => { if (V && V.mediaT == null) { drawOverlay(); drawRoll(); } });
    me.score = scoreModel(ctx.res);
    buildScore(me);
    me.scoreBox.addEventListener('scroll', () => { me.scoreTouched = true; clearTimeout(me.scoreTouchT); me.scoreTouchT = setTimeout(() => { me.scoreTouched = false; }, 4000); }, { passive: true });
    me.video.addEventListener('click', () => { if (me.mode === 'watch') onPlay(me); });
    me.playBtn.addEventListener('click', () => onPlay(me));
    me.skipBtn.addEventListener('click', () => next(me));
    me.prevBtn.addEventListener('click', () => previous(me));
    
    me.vol = (() => { try { const v = parseFloat(localStorage.getItem(VOL_KEY)); return Number.isFinite(v) ? clamp01(v) : 1; } catch { return 1; } })();
    me.volBefore = me.vol || 1;
    wireTimeline(me);
    
    
    me.tlTimer = setInterval(() => { if (V === me && !document.hidden) { renderTimeline(me); if (me.mode === 'lesson') renderScoreHead(me); } }, 200);
    me.volRange.addEventListener('input', () => setVolume(me, +me.volRange.value / 100));
    me.volBtn.addEventListener('click', () => { if (me.vol > 0) { me.volBefore = me.vol; setVolume(me, 0); } else setVolume(me, me.volBefore || 1); });
    setVolume(me, me.vol);
    me.voiceBtn.addEventListener('click', () => {
      me.voiceOn = !me.voiceOn;
      try { localStorage.setItem(VOICE_ON_KEY, me.voiceOn ? '1' : '0'); } catch {   }
      if (me.plan) {
        const S0 = me.plan.segs, i = Math.min(me.segI || 0, S0.length), s0 = S0[i];
        const frac = s0 && me.mode === 'lesson' ? Math.max(0, Math.min(1, (posNow(me) - s0.at) / Math.max(0.01, s0.dur))) : 0;
        me.plan = planOf(me);
        const s1 = me.plan.segs[i];
        if (me.mode === 'lesson') { seekTo(me, s1 ? s1.at + (s1.kind === 'line' ? 0 : frac * s1.dur) : me.plan.total); return renderBar(me); }
      } else if (!me.voiceOn) {
        try { speechSynthesis.cancel(); } catch {   }
        if (me.packStop) me.packStop();
      }
      renderBar(me);
    });
    fillVoices(me.voiceSel);
    me.voiceSel.addEventListener('change', () => {
      const v = allVoices().find((x) => x.voiceURI === me.voiceSel.value);
      if (!v || !BROWSER_VOICE) return;
      VOICE = v;
      try { localStorage.setItem(VOICE_KEY, v.voiceURI); } catch {   }
      try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance('Hi, this is how I sound.'); u.voice = v; speechSynthesis.speak(u); } catch {   }
    });
    
    me.keys = (e) => {
      if (V !== me || e.code !== 'Space' || e.repeat) return;
      const a = document.activeElement;
      if (a && /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(a.tagName)) return;
      e.preventDefault(); onPlay(me);
    };
    document.addEventListener('keydown', me.keys);
    
    me.fit = () => { me.root.style.setProperty('--dock-h', `${Math.round(me.dock.getBoundingClientRect().height)}px`); layoutScore(me); drawOverlay(); drawRoll(); };
    me.ro = window.ResizeObserver ? new ResizeObserver(me.fit) : null;
    if (me.ro) { me.ro.observe(me.dock); me.ro.observe(me.canvas); }
    me.resize = me.fit;
    window.addEventListener('resize', me.resize);
    showStage(me, 'video');
    poster(me, 'idle');
    renderBar(me);
    requestAnimationFrame(() => { me.fit(); });
    window.scrollTo(0, 0);
    
    
    const ua = navigator.userActivation;
    if (!(ua && !ua.hasBeenActive) && autoWanted()) setTimeout(() => { if (V === me && me.mode === 'idle') onPlay(me); }, 450);
  }
  function update(id, rows) {
    if (!V || V.ctx.id !== id) return;
    V.rows = rows || [];
    renderRows(V.rows);
  }
  function close() {
    if (!V) return;
    V.stopped = true;
    clearInterval(V.tlTimer);
    for (const r of (V.resumers || []).splice(0)) r();
    if (V.listening) { try { V.listening.stop(); } catch {   } }
    if (V.gst) { try { V.gst.destroy(); } catch {   } V.gst = null; }
    if (V.card) { try { V.card.destroy(); } catch {   } V.card = null; }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {   }
    if (V.raf) cancelAnimationFrame(V.raf);
    if (V.stopFollow) { V.stopFollow(); V.stopFollow = null; }
    if (V.ro) V.ro.disconnect();
    window.removeEventListener('resize', V.resize);
    document.removeEventListener('keydown', V.keys);
    V.video.pause();
    V.video.removeAttribute('src');
    V.root.hidden = true;
    V.root.replaceChildren();
    V = null;
  }
  
  
  
  
  
  
  
  
  
  const SC_PAD_Y = 4;                                                       
  const FADE8 = 0.22, BAND_LOOK_MS = 4000, BAR_NUM_H = 16;
  const narrow8 = () => window.innerWidth < 720 || window.innerHeight < 500;
  
  
  const BAND8 = () => {
    const n = narrow8(), h = window.innerHeight;
    return { gut: 16, top: 8, bottom: 6, H: n ? Math.round(Math.min(150, Math.max(96, h * 0.178))) : Math.round(Math.min(170, Math.max(100, h * 0.19))),
      lane: n ? { top: 5, h: 16, gap: 6 } : { top: 6, h: 24, gap: 8 }, rail: n ? { h: 10, gap: 2, top: 5 } : { h: 12, gap: 3, top: 6 } };
  };
  const SC_H8 = () => { const H = BAND8().H; return [H, H]; };
  
  function litAt(M, t) {
    const out = [];
    for (const n of (M && M.strip ? M.strip.lit : [])) {
      if (n.t > t) break;
      if (t < n.u) out.push(n.box);
    }
    return out;
  }
  
  
  
  async function bandSource(me) {
    const M = me.score, S = M && M.strip, sv = me.ctx.res && me.ctx.res.lesson && me.ctx.res.lesson.view ? me.ctx.res.lesson.view.score : null;
    if (!S || !M.tiles || !me.ctx.score) return null;
    let lib = null;
    if (typeof me.ctx.pieceScore === 'function' && sv && typeof sv.piece === 'string') {
      const u = me.ctx.pieceScore(sv.piece, 'score-geom.json');
      try {
        const r = u ? await fetch(u) : null;
        lib = r && r.ok ? await r.json() : null;
      } catch { lib = null; }
      const ok = lib && Array.isArray(lib.bars) && lib.bars.length && Array.isArray(lib.tiles) && lib.tiles.length
        && lib.tiles.every((t) => t && /^tile-\d{2,3}\.webp$/.test(String(t.file)) && num(t.x0) != null && num(t.x1) > num(t.x0))
        && lib.bars.every((b) => b && Number.isInteger(b.k) && num(b.x0) != null && num(b.x1) >= num(b.x0));
      if (!ok) lib = null;
    }
    const G = lib || S.geom;
    const tiles = lib ? lib.tiles.map((t) => ({ x0: +t.x0, x1: +t.x1, url: () => me.ctx.pieceScore(sv.piece, t.file) }))
      : M.tiles.map((t) => ({ x0: t.x0, x1: t.x1, url: () => me.ctx.score(t.id) }));
    const ss = num(G.ss) || S.ss || 24, H0 = num(G.height) || num(S.geom.height) || 0;
    const bars = (lib ? lib.bars : S.bars).map((b) => ({ k: b.k, x0: +b.x0, x1: +b.x1 }));
    const CX0 = Math.min(...bars.map((b) => b.x0)) - ss, CX1 = Math.max(...bars.map((b) => b.x1)) + ss;
    
    const pairs = S.bars.map((b) => { const l = lib ? lib.bars.find((x) => x.k === b.k) : b; return l ? [b.x0, b.x1, +l.x0, +l.x1] : null; })
      .filter(Boolean).sort((p, q) => p[0] - q[0]);
    const map = (x) => {
      if (!pairs.length) return x;
      if (x <= pairs[0][0]) return pairs[0][2] - (pairs[0][0] - x);
      for (const [a, b, la, lb] of pairs) if (x <= b) return x >= a ? la + (b > a ? (x - a) / (b - a) : 0) * (lb - la) : la - (a - x);
      const [, b, , lb] = pairs[pairs.length - 1];
      return lb + (x - b);
    };
    const staves = (Array.isArray(G.staves) && G.staves.length ? G.staves : S.geom.staves || []).filter((s) => s && Array.isArray(s.y) && s.y.every((v) => num(v) != null));
    
    const top0 = Math.min(...staves.map((s) => +s.y[0]));
    let rows = staves.map((s) => [Math.max(0, +s.y[0] - (+s.y[0] === top0 ? 5.5 : 2.75) * ss), H0 ? Math.min(H0, +s.y[1] + 2.75 * ss) : +s.y[1] + 2.75 * ss]).sort((p, q) => p[0] - q[0]);
    if (!rows.length) rows = [[0, H0 || 400]];
    const merged = [];
    for (const [a, b] of rows) { const l = merged[merged.length - 1]; if (l && a <= l.b) l.b = Math.max(l.b, b); else merged.push({ a: Math.floor(a), b: Math.ceil(b) }); }
    let at = 0;
    for (const m of merged) { m.at = at; at += m.b - m.a + Math.round(ss); }
    const bandH = at - Math.round(ss);
    const ymap = (y) => { for (const m of merged) if (y < m.b) return m.at + Math.max(0, y - m.a); const m = merged[merged.length - 1]; return m.at + m.b - m.a; };
    
    const WX0 = map(S.bars[0].x0), WX1 = map(S.bars[S.bars.length - 1].x1);
    return { lib: !!lib, tiles, CX0: Math.max(CX0, WX0 - ss), CX1: Math.min(CX1, WX1 + ss), map, WX0, WX1, rows: merged, bandH, ymap };
  }
  
  const wfToC = (me, f) => (me.fr ? me.fr.map(me.score.strip.X0 + f * (me.score.strip.X1 - me.score.strip.X0)) : f * 1000);
  
  async function readTile(me, t) {
    const F = me.fr, u = await t.url();
    if (!u) throw new Error('a tile could not load');
    const im = new Image();
    im.decoding = 'async';
    im.src = u;
    await im.decode();
    const w = im.naturalWidth, h = im.naturalHeight, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, w, h).data, ink = new Uint8ClampedArray(w * F.bandH);
    for (const m of F.rows) {
      for (let y = m.a; y < Math.min(m.b, h); y++) {
        const row = (m.at + y - m.a) * w;
        for (let x = 0, o = y * w * 4; x < w; x++, o += 4) ink[row + x] = Math.max(d[o], d[o + 1], d[o + 2]);
      }
    }
    t.w = w; t.ink = ink;
    t.sc = null;
  }
  
  function scaledTile(me, t, dpr) {
    const F = me.fr, kx = me.k * dpr, W = Math.max(1, Math.round((t.x1 - t.x0) * kx)), Hh = Math.max(1, Math.round(F.bandH * kx));
    if (t.sc && t.sc.W === W && t.sc.H === Hh) return t.sc;
    const make = (rgb) => {
      const full = document.createElement('canvas');
      full.width = t.w; full.height = F.bandH;
      const id = new ImageData(t.w, F.bandH);
      for (let i = 0, o = 0; i < t.ink.length; i++, o += 4) { const v = t.ink[i]; if (v) { id.data[o] = rgb[0]; id.data[o + 1] = rgb[1]; id.data[o + 2] = rgb[2]; id.data[o + 3] = v; } }
      full.getContext('2d').putImageData(id, 0, 0);
      return shrinkTo(full, Math.round(t.w * kx), Hh);
    };
    t.sc = { W, H: Hh, dark: make(SC_INK), lit: make(SC_LIT) };
    return t.sc;
  }
  
  function shrinkTo(src, w, h) {
    let c = src;
    while (c.width / 2 > w && c.height / 2 > h) {
      const n = document.createElement('canvas');
      n.width = Math.ceil(c.width / 2); n.height = Math.ceil(c.height / 2);
      const g = n.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(c, 0, 0, n.width, n.height);
      c = n;
    }
    const o = document.createElement('canvas');
    o.width = Math.max(1, w); o.height = Math.max(1, h);
    const g = o.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, 0, 0, o.width, o.height);
    return o;
  }
  
  
  function paintBand(me) {
    const cv = me.canvas, F = me.fr;
    if (!cv || !me.vw || !me.H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(me.vw * dpr), H = Math.round(me.H * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath();
    if (g.roundRect) g.roundRect(0, 0, W, H, 10 * dpr); else g.rect(0, 0, W, H);
    g.fillStyle = SC_PAPER;
    g.fill();
    g.clip();
    if (!F) { g.restore(); return; }
    const sx = (c) => ((c - F.CX0) * me.k + me.off - me.scroll) * dpr, py = SC_PAD_Y * dpr;
    const play = me.pos != null ? wfToC(me, me.pos) : null;
    const zones = play != null && play > F.WX0
      ? [[-Infinity, F.WX0, FADE8], [F.WX0, Math.min(play, F.WX1), SC_PAST], [Math.min(play, F.WX1), F.WX1, 1], [F.WX1, Infinity, FADE8]]
      : [[-Infinity, F.WX0, FADE8], [F.WX0, F.WX1, 1], [F.WX1, Infinity, FADE8]];
    const view0 = F.CX0 + (me.scroll - me.off) / me.k, view1 = view0 + me.vw / me.k;
    let drawn = 0;
    for (const t of F.tiles) {
      const near = t.x1 >= view0 - me.vw / me.k && t.x0 <= view1 + me.vw / me.k;
      if (!near) { t.sc = null; continue; }
      if (!t.ink) { if (!t.loading) { t.loading = readTile(me, t).then(() => { if (me.alive) { me.painted = null; paintBand(me); } }, (e) => { console.warn('score tile:', e && e.message ? e.message : e); t.failed = true; }); } continue; }
      if (t.x1 < view0 || t.x0 > view1) continue;
      const sc = scaledTile(me, t, dpr), x = sx(t.x0);
      for (const [a, b, alpha] of zones) {
        const za = Math.max(x, sx(a)), zb = Math.min(x + sc.W, sx(b));
        if (zb <= za) continue;
        g.globalAlpha = alpha;
        g.drawImage(sc.dark, za - x, 0, zb - za, sc.H, za, py, zb - za, sc.H);
      }
      drawn++;
    }
    g.globalAlpha = 1;
    
    const B = me.score.strip && me.score.strip.boxes;
    if (B && me.litIds && me.litIds.length) {
      g.shadowColor = 'rgba(192, 132, 252, 0.9)';
      g.shadowBlur = 6 * dpr;
      for (const id of me.litIds) {
        const bx = Array.isArray(B[id]) ? B[id] : null;
        if (!bx) continue;
        const c0 = F.map(+bx[0]), c1 = F.map(+bx[2]), y0 = F.ymap(+bx[1]) * me.k * dpr + py, y1 = F.ymap(+bx[3]) * me.k * dpr + py;
        for (const t of F.tiles) {
          if (!t.sc || t.x1 < c0 || t.x0 > c1) continue;
          const x = sx(t.x0), a = Math.max(x, sx(c0) - 1), b = Math.min(x + t.sc.W, sx(c1) + 1);
          if (b > a) g.drawImage(t.sc.lit, a - x, Math.max(0, y0 - py - 1), b - a, y1 - y0 + 2, a, y0 - 1, b - a, y1 - y0 + 2);
        }
      }
    }
    g.restore();
    me.drawn = drawn;
  }
  
  
  
  
  
  
  function bandBuild(me, onFix) {
    const M = me.score, band = me.band;
    band.replaceChildren();
    if (!M) { band.hidden = true; return; }
    band.hidden = false;
    const view = el('div', 'mv-band-view'), canvas = el('canvas', 'mv-sc-paper'), layer = el('div', 'mv-band-in');
    canvas.setAttribute('aria-hidden', 'true');
    const head = el('div', 'mv-sc-head');
    head.setAttribute('aria-hidden', 'true');
    head.hidden = true;
    
    me.errors = errorsOf(M, me.ctx.res);
    const cols = el('div', 'mv-cols'), bubs = el('div', 'mv-bubs');
    bubs.setAttribute('role', 'group');
    bubs.setAttribute('aria-label', 'The fixes, where each happens');
    for (const e of me.errors) {
      const where = e.bar != null ? `bar ${e.bar}` : '';
      const label = `Fix ${e.n}: ${e.f.title || 'the lesson'}${where ? `, ${where}` : ''}. Play this fix`;
      const col = el('button', 'mv-col');
      col.type = 'button'; col.tabIndex = -1; col.dataset.n = String(e.n);
      col.setAttribute('aria-label', label);
      col.append(el('span', 'mv-col-glow'));
      const b = el('button', 'mv-bub');
      b.type = 'button'; b.dataset.n = String(e.n); b.dataset.kind = e.kind;
      b.setAttribute('aria-label', label); b.title = `${e.n}. ${e.f.title || ''}`;
      b.append(el('span', 'mv-bub-n', String(e.n)), el('span', 'mv-bub-k', e.emoji));
      b.removeAttribute('title');                                          
      b.addEventListener('pointerenter', (ev) => { if (ev.pointerType !== 'touch') hoverShow(me, e); });
      b.addEventListener('pointerleave', () => hoverHide(me));
      b.addEventListener('focus', () => { if (b.matches(':focus-visible')) hoverShow(me, e); });   
      b.addEventListener('blur', () => hoverHide(me));
      
      const tip = el('span', 'mv-bub-tip');
      tip.setAttribute('aria-hidden', 'true');
      e.col = col; e.bub = b; e.tip = tip;
      cols.append(col); bubs.append(tip, b);
    }
    
    me.lanes = lanesOf(M, me.ctx.res);
    const lanes = el('div', 'mv-lanes');
    lanes.setAttribute('role', 'group');
    lanes.setAttribute('aria-label', 'Each hand: green where it played, red where the lesson has something to fix');
    lanes.hidden = !me.lanes;
    const staff = el('div', 'mv-band-staff');                            
    staff.setAttribute('aria-hidden', 'true');
    layer.append(staff, cols, head, lanes, bubs);
    view.append(canvas, layer);
    band.append(view);
    Object.assign(me, { bandView: view, canvas, layer, staffArt: staff, scoreHead: head, laneBox: lanes, colBox: cols, bubBox: bubs, scroll: 0, off: 0, userUntil: 0 });
    const lo = M.bars[0].bar, hi = M.bars[M.bars.length - 1].bar;
    band.setAttribute('role', 'group');
    band.setAttribute('aria-label', `The score, the bars you played (${lo} to ${hi}) in full, with ${M.fixes.length} ${M.fixes.length === 1 ? 'fix' : 'fixes'}${M.fixes.length ? `: ${M.fixes.map((f) => `${f.n}, ${f.title}`).join('; ')}` : ''}. Tap a fix's bubble to play it.`);
    
    
    view.addEventListener('click', (e) => {
      if (me.dragged) { me.dragged = false; e.stopPropagation(); e.preventDefault(); return; }
      const own = e.target.closest && e.target.closest('.mv-bub, .mv-col, .mv-lane-hit');
      if (!own) return;
      e.stopPropagation();
      const n = +own.dataset.n;
      if (Number.isInteger(n)) onFix(n);
    }, true);
    
    let drag = null;
    view.addEventListener('pointerdown', (e) => { if (e.button === 0) drag = { x: e.clientX, s: me.scroll, moved: false }; });
    view.addEventListener('pointermove', (e) => {
      if (!drag || me.cw <= me.vw) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      drag.moved = true;
      me.scroll = Math.max(0, Math.min(me.cw - me.vw, drag.s - dx));
      me.userUntil = performance.now() + BAND_LOOK_MS;
      bandMove(me);
    });
    const end = () => { if (drag && drag.moved) me.dragged = true; drag = null; };
    view.addEventListener('pointerup', end);
    view.addEventListener('pointercancel', () => { drag = null; });
    view.addEventListener('wheel', (e) => {
      if (me.cw <= me.vw) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      me.scroll = Math.max(0, Math.min(me.cw - me.vw, me.scroll + d));
      me.userUntil = performance.now() + BAND_LOOK_MS;
      bandMove(me);
    }, { passive: false });
    
    band.addEventListener('keydown', (e) => {
      const gs = me.errors.map((x) => x.bub);
      if (!gs.length || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      const k = gs.indexOf(document.activeElement);
      e.preventDefault();
      gs[k < 0 ? 0 : (k + (e.key === 'ArrowRight' ? 1 : gs.length - 1)) % gs.length].focus();
    });
    bandSource(me).then((F) => { if (me.alive) { me.fr = F; me.staffMode = !F; me.sized = null; bandLayout(me); } },
      (e) => { console.warn('score band:', e && e.message ? e.message : e); if (me.alive) { me.staffMode = true; me.sized = null; bandLayout(me); } });
    bandLayout(me);
  }
  
  
  
  const CATS = { notes: ['\u{1F3B5}', 'Notes'], timing: ['⏱️', 'Timing'], flow: ['⏸︎', 'Flow'], fingering: ['✋', 'Fingering'], touch: ['\u{1FAB6}', 'Touch'] };
  const KIND_CAT = { slip: 'notes', wrong: 'notes', missed: 'notes', octave: 'notes', 'octave-run': 'notes', finding: 'notes',
    stop: 'flow', 'slow-bar': 'flow', pause: 'flow',
    early: 'timing', late: 'timing', timing: 'timing', rhythm: 'timing', rush: 'timing', steadiness: 'timing', together: 'timing', hands: 'timing',
    fingering: 'fingering', finger: 'fingering', fingers: 'fingering',
    tie: 'touch', held: 'touch', hold: 'touch' };
  const catOf = (kind) => KIND_CAT[kind] || 'notes';
  const KIND_EMOJI = Object.fromEntries(Object.keys(KIND_CAT).map((k) => [k, CATS[KIND_CAT[k]][0]]));
  const STOP8 = new Set(['stop', 'slow-bar', 'pause']), TIE8 = new Set(['tie', 'held', 'hold']);
  
  const KIND_NAME = Object.fromEntries(Object.values(CATS));
  
  
  
  function keyOf(me) {
    const box = el('div', 'mv8-key');
    box.setAttribute('aria-live', 'polite');
    box.hidden = true;
    return box;
  }
  function keyNow(me) {
    const box = me.key, f = me.fixOn;
    if (!box || box.dataset.fix === String(f ? f.n : '')) return;
    box.dataset.fix = String(f ? f.n : '');
    const mine = f ? (me.errors || []).filter((e) => e.f === f) : [];
    box.replaceChildren();
    box.hidden = !mine.length;
    if (!mine.length) return;
    const em = mine[0].emoji, hands = new Set(mine.flatMap((e) => e.hands));
    const hand = hands.size > 1 ? 'B' : hands.has('L') ? 'L' : 'R';
    const cat = el('span', 'mv8-key-c');
    cat.append(el('span', 'mv8-key-e', em), el('span', 'mv8-key-t', KIND_NAME[em] || 'Notes'));
    const hd = el('span', 'mv8-key-c mv8-key-h');
    hd.append(el('i', `mv8-key-hd mv8-key-hd-${hand}`), el('span', 'mv8-key-t', hand === 'B' ? 'Both hands' : hand === 'L' ? 'Left hand' : 'Right hand'));
    box.append(cat, hd);
  }
  
  
  function hoverShow(me, e) {
    if (!me.hover) { me.hover = el('div', 'mv-hover'); me.hover.setAttribute('aria-hidden', 'true'); me.band.append(me.hover); }
    const H = me.hover, hands = e.hands.length > 1 ? 'both hands' : e.hands[0] === 'L' ? 'left hand' : 'right hand';
    const head = el('div', 'mv-hover-h');
    head.append(el('span', 'mv-hover-n', String(e.n)), el('span', 'mv-hover-e', e.emoji), el('span', 'mv-hover-k', KIND_NAME[e.emoji] || 'Fix'));
    H.replaceChildren(head, el('div', 'mv-hover-t', (e.f && e.f.title) || ''),
      el('div', 'mv-hover-w', `${e.bar != null ? `Bar ${e.bar} · ` : ''}${hands}`), el('div', 'mv-hover-p', '▶ Play this fix'));
    H.hidden = false;
    const br = me.band.getBoundingClientRect(), r = e.bub.getBoundingClientRect(), w = H.offsetWidth || 240;
    const left = Math.max(8, Math.min(br.width - w - 8, r.left - br.left + r.width / 2 - w / 2));
    Object.assign(H.style, { left: `${left}px`, bottom: `${br.bottom - r.top + 10}px` });
  }
  const hoverHide = (me) => { if (me.hover) me.hover.hidden = true; };
  
  
  
  function errorsOf(M, res) {
    const V = res && res.lesson && res.lesson.view, B = M.strip && M.strip.boxes;
    if (!V || !Array.isArray(V.fixes) || !B) return [];
    const ss = M.strip.ss || 24, staves = {};
    for (const [id, b] of Object.entries(B)) if (Array.isArray(b) && b.slice(0, 4).every((v) => num(v) != null)) (staves[b[4]] = staves[b[4]] || []).push({ id, b });
    for (const s of Object.values(staves)) s.sort((p, q) => p.b[0] - q.b[0]);
    const barOf = (b) => { const g = Number.isInteger(b[5]) ? M.strip.bars.find((x) => x.k === b[5]) : null; return g ? g.m : null; };
    const out = [];
    for (const vf of V.fixes) {
      const f = vf && M.fixes.find((x) => x.n === vf.n);
      if (!f) continue;
      const kind = str(vf.kind || f.kind, 20) || 'slip';
      const ids = [...new Set((Array.isArray(vf.marks) ? vf.marks : []).map((m) => m && m.noteId).filter((id) => typeof id === 'string' && B[id]))];
      if (!ids.length && vf.anchor && B[vf.anchor.noteId]) ids.push(vf.anchor.noteId);
      let spans = [];
      if (STOP8.has(kind)) {
        spans = ids.map((id) => {
          const b = B[id], list = staves[b[4]] || [], nx = list.find((x) => x.b[0] > +b[2] + 1);
          const a = +b[2] - 2, z = nx ? +nx.b[0] + 2 : +b[2] + 2 * ss;
          return { a, z: Math.max(z, a + 0.8 * ss), bar: barOf(b) };
        });
      } else if (TIE8.has(kind)) {
        const byBar = new Map();
        for (const id of ids) { const b = B[id], key = b[5]; const s = byBar.get(key); if (s) { s.a = Math.min(s.a, +b[0] - 3); s.z = Math.max(s.z, +b[2] + 3); } else byBar.set(key, { a: +b[0] - 3, z: +b[2] + 3, bar: barOf(b) }); }
        spans = [...byBar.values()];
      } else spans = ids.map((id) => ({ a: +B[id][0] - 3, z: +B[id][2] + 3, bar: barOf(B[id]) }));
      spans.sort((p, q) => p.a - q.a);
      const merged = [];
      for (const s of spans) { const l = merged[merged.length - 1]; if (l && s.a <= l.z) l.z = Math.max(l.z, s.z); else merged.push({ ...s }); }
      const hand = vf.hand || (vf.window && vf.window.hand) || f.hand;
      const hands = hand === 'both' ? ['R', 'L'] : [hand === 'L' ? 'L' : 'R'];
      for (const s of merged) out.push({ f, n: f.n, kind, emoji: KIND_EMOJI[kind] || '\u{1F3B5}', x0: s.a, x1: s.z, bar: s.bar, hands });
    }
    return out.sort((p, q) => p.x0 - q.x0 || p.n - q.n);
  }
  
  const lanesHeight = (me) => (me.lanes ? (({ top, h, gap }) => top + h + gap + h)(BAND8().lane) + BAND8().lane.top : 0);
  
  
  function bandLayout(me) {
    const M = me.score;
    if (!M || !me.layer || me.band.hidden) return;
    const B = BAND8(), F = me.fr, vw = Math.max(120, Math.round(me.band.clientWidth - 2 * B.gut));
    
    
    const lanesH = lanesHeight(me), H = narrow8() ? 30 : 36;
    const k = F ? Math.min((1.5 * (B.H - 2 * SC_PAD_Y)) / F.bandH, (vw - 48) / Math.max(1, F.CX1 - F.CX0)) : vw / 1000;
    const cw = F ? (F.CX1 - F.CX0) * k : vw;
    const key = `${vw}|${H}|${k}|${lanesH}|${!!F}`;
    if (key === me.sized) return;
    me.sized = key;
    Object.assign(me, { vw, H, k, cw, lanesH, off: cw < vw ? (vw - cw) / 2 : 0 });
    me.scroll = Math.max(0, Math.min(Math.max(0, cw - vw), me.scroll || 0));
    const bandH = B.top + H + lanesH + BAR_NUM_H + B.bottom;
    me.band.style.height = `${bandH}px`;
    me.root.style.setProperty('--band-h', `${bandH}px`);
    Object.assign(me.bandView.style, { left: `${B.gut}px`, right: `${B.gut}px`, top: `${B.top}px`, height: `${H + lanesH + BAR_NUM_H}px` });
    Object.assign(me.canvas.style, { width: `${vw}px`, height: `${H}px` });
    me.layer.style.width = `${cw}px`;
    if (!F && me.staffMode) me.staffArt.replaceChildren(staffSvg(M, cw));
    me.layer.style.height = `${H + lanesH + BAR_NUM_H}px`;
    Object.assign(me.scoreHead.style, { top: `${H}px`, height: `${lanesH}px` });       
    const cx = (c) => (c - (F ? F.CX0 : 0)) * k;                            
    const wx = (x) => (F ? cx(F.map(x)) : null);                            
    const sp = spansOf(M), at = (f) => cx(wfToC(me, f));
    me.laneBox.style.top = `${H}px`;
    me.laneBox.style.height = `${lanesH}px`;
    
    
    const n8 = narrow8(), gap = 4;
    let lastRight = -Infinity;
    for (const e of me.errors) {
      const x0 = F ? wx(e.x0) : at(sp[0][0]), x1 = F ? wx(e.x1) : at(sp[0][1]), mid = (x0 + x1) / 2, w = Math.max(4, x1 - x0);
      e.lx0 = x0; e.lx1 = x1;
      Object.assign(e.col.style, { left: `${mid - Math.max(24, w) / 2}px`, width: `${Math.max(24, w)}px`, top: '0px', height: `${H + lanesH - 2}px` });
      Object.assign(e.col.firstChild.style, { left: `${(Math.max(24, w) - w) / 2}px`, width: `${w}px` });
      const bw = e.bub.offsetWidth || (n8 ? 44 : 54);
      const left = Math.max(mid - bw / 2, lastRight + gap);
      lastRight = left + bw;
      const top = n8 ? 4 : 6;
      Object.assign(e.bub.style, { left: `${left}px`, top: `${top}px` });
      Object.assign(e.tip.style, { left: `${mid - 4}px`, top: `${top + (e.bub.offsetHeight || 22) - 5}px` });
      e.bl = left; e.bw = bw;
    }
    placeLanes(me, sp, at);
    me.painted = null;
    bandFollow(me, true);
  }
  
  
  
  
  
  
  function rollIn(me, box, L) {
    const F = me.fr, M = me.score, res = me.ctx.res;
    if (!F || !M || !M.strip || !Array.isArray(M.strip.bars) || !res) return;
    const cx = (sx) => (F.map(sx) - F.CX0) * me.k;
    const tb = M.bars.filter((b) => b.take && b.fromS != null && b.toS != null && b.toS > b.fromS);
    const gx = new Map(M.strip.bars.map((b) => [b.k, b]));
    if (!tb.length) return;
    const xAt = (t) => {
      const b = tb.find((q) => t >= q.fromS && t < q.toS) || (t >= tb[tb.length - 1].toS ? tb[tb.length - 1] : null);
      const g = b && gx.get(b.k);
      if (!g) return null;
      const f = Math.max(0, Math.min(1, (t - b.fromS) / (b.toS - b.fromS)));
      return cx(g.x0 + f * (g.x1 - g.x0));
    };
    const handOf = new Map();
    for (const b of M.bars) for (const n of b.notes || []) if (n.t != null) handOf.set(`${n.m}@${Math.round(n.t * 100)}`, n.h);
    const end = tb[tb.length - 1].toS - 1e-3, roll = { R: [], L: [] };
    for (const n of Array.isArray(res.notes) ? res.notes : []) {
      if (!Array.isArray(n) || !Number.isFinite(+n[0]) || !Number.isFinite(+n[2])) continue;
      const on = +n[0], off = Number.isFinite(+n[1]) ? +n[1] : on, m = +n[2], x0 = xAt(on);
      if (x0 == null) continue;
      let x1 = xAt(Math.min(off, end));
      if (x1 == null || x1 < x0) x1 = x0;
      const h = handOf.get(`${m}@${Math.round(on * 100)}`) || (n[4] === 'L' || n[4] === 'R' ? n[4] : m < 60 ? 'L' : 'R');
      roll[h].push({ x0, x1, m });
    }
    me.rollCount = { R: roll.R.length, L: roll.L.length };
    for (const [k, h] of [[0, 'R'], [1, 'L']]) {
      const ns = roll[h];
      if (!ns.length) continue;
      const lo = Math.min(...ns.map((n) => n.m)) - 1, hi = Math.max(...ns.map((n) => n.m)) + 1, top = L.top + k * (L.h + L.gap);
      const nh = L.h >= 20 ? 3 : 2;
      for (const n of ns) {
        const d = el('span', 'mv-roll');
        Object.assign(d.style, { left: `${n.x0}px`, width: `${Math.max(3, n.x1 - n.x0 - 1)}px`, height: `${nh}px`,
          top: `${top + 2 + ((hi - n.m) / (hi - lo)) * (L.h - 4 - nh)}px` });
        box.append(d);
      }
    }
    const y0 = L.top, y1 = L.top + 2 * L.h + L.gap;
    M.strip.bars.forEach((b, i) => {
      const x = cx(b.x0);
      if (i) { const ln = el('span', 'mv-roll-bar'); Object.assign(ln.style, { left: `${x}px`, top: `${y0}px`, height: `${y1 - y0}px` }); box.append(ln); }
      const num = el('span', 'mv-roll-n', String(b.m));
      Object.assign(num.style, { left: `${x + 3}px`, top: `${y1 + 4}px` });
      box.append(num);
    });
  }
  
  
  
  function placeLanes(me, sp, at) {
    const box = me.laneBox, L = BAND8().lane;
    me.laneTaps = [];
    if (!box || !me.lanes) return;
    box.replaceChildren();
    let first = Infinity;
    me.reds = [];
    for (const [k, h] of [[0, 'R'], [1, 'L']]) {
      const top = L.top + k * (L.h + L.gap);
      
      const runs = [];
      for (const g of me.lanes[h]) {
        const b0 = at(sp[g.i][0]) + 2, b1 = at(sp[g.i][1]) - 2, r = runs[runs.length - 1];
        if (r && Math.abs(b0 - r.z - 4) < 1.5) r.z = b1; else runs.push({ a: b0, z: b1 });
      }
      for (const r of runs) {
        first = Math.min(first, r.a);
        const line = el('span', 'mv-lane-seg good');
        line.dataset.h = h;
        Object.assign(line.style, { left: `${r.a}px`, width: `${Math.max(1, r.z - r.a)}px`, top: `${top}px`, height: `${L.h}px` });
        box.append(line);
      }
      for (const e of me.errors) {
        if (!e.hands.includes(h)) continue;
        const pieces = runs.map((r) => [Math.max(r.a, e.lx0), Math.min(r.z, e.lx1)]).filter(([a, z]) => z > a);
        
        if (!pieces.length && e.hands.length === 1) pieces.push([e.lx0, e.lx1]);
        for (const [a, z] of pieces) {
          const hit = el('button', 'mv-lane-hit');
          hit.type = 'button'; hit.tabIndex = -1;
          hit.dataset.h = h; hit.dataset.n = String(e.n);
          hit.setAttribute('aria-label', `${h === 'R' ? 'Right' : 'Left'} hand: fix ${e.n}. Play this fix`);
          const w = Math.max(24, z - a);
          Object.assign(hit.style, { left: `${(a + z) / 2 - w / 2}px`, width: `${w}px`, top: `${top + L.h / 2 - 12}px` });
          const line = el('span', 'mv-lane-seg fix');
          line.dataset.h = h; line.dataset.n = String(e.n);
          Object.assign(line.style, { top: '50%', height: `${L.h}px`, marginTop: `${-L.h / 2}px`, left: `${(w - (z - a)) / 2}px`, width: `${z - a}px` });
          hit.append(line);
          box.append(hit);
          me.laneTaps.push({ btn: hit, line, n: e.n });
          me.reds.push({ h, n: e.n, a, z });
        }
      }
    }
    rollIn(me, box, L);
    if (Number.isFinite(first)) {
      for (const [k, h] of [[0, 'R'], [1, 'L']]) {
        const key = el('span', 'mv-lane-k', h);
        key.setAttribute('aria-hidden', 'true');
        Object.assign(key.style, { left: `${first - 14}px`, top: `${L.top + k * (L.h + L.gap) + L.h / 2}px` });
        box.append(key);
      }
    }
  }
  
  
  function bandFollow(me, now = false) {
    if (!me.layer || !me.vw) return;
    const play = me.pos != null ? (wfToC(me, me.pos) - (me.fr ? me.fr.CX0 : 0)) * me.k : null;
    if (me.cw > me.vw && play != null && performance.now() > (me.userUntil || 0)) {
      const want = Math.max(0, Math.min(me.cw - me.vw, play - me.vw / 3));
      const d = want - me.scroll;
      me.scroll = now || calm() || Math.abs(d) < 0.5 ? want : me.scroll + d * 0.12;
    }
    bandMove(me);
  }
  function bandMove(me) {
    const x = Math.round((me.off - me.scroll) * 100) / 100;
    if (me.layerX !== x) { me.layerX = x; me.layer.style.transform = `translateX(${x}px)`; }
    const p = me.pos;
    me.scoreHead.hidden = p == null;
    if (p != null) me.scoreHead.style.left = `${(wfToC(me, p) - (me.fr ? me.fr.CX0 : 0)) * me.k}px`;
    for (const e of me.errors || []) { e.bub.classList.toggle('on', me.fixOn === e.f); e.col.classList.toggle('on', me.fixOn === e.f); e.tip.classList.toggle('on', me.fixOn === e.f); }
    keyNow(me);
    const key = `${me.sized}|${x}|${p == null ? '' : p.toFixed(4)}|${(me.litIds || []).join()}|${me.loaded || 0}`;
    if (key !== me.painted) { me.painted = key; paintBand(me); }
  }
  
  
  
  
  
  
  
  function lanesOf(M, res) {
    const H = handsOf(res), secs = H ? null : sectionsOf(res);
    if (!H && !(secs && secs.length)) return null;
    const stateAt = (h, t) => {
      if (H) { const x = H[h].find((q) => t >= q.a && t < q.b); return x ? x.state : 'unsure'; }
      const x = secs.find((q) => t >= q.a && t < q.b && (q.state !== 'fix' || q.hands.includes(h)));
      return x ? x.state : 'unsure';
    };
    const over = (h, a, z) => {
      const xs = H ? H[h].filter((q) => q.b > a && q.a < z) : secs.filter((q) => q.b > a && q.a < z && (q.state !== 'fix' || q.hands.includes(h)));
      return xs.length ? (xs.some((q) => q.state === 'fix') ? 'fix' : xs.some((q) => q.state === 'good') ? 'good' : 'unsure') : null;
    };
    const rb = res && res.reference && Array.isArray(res.reference.bars) ? res.reference.bars.filter((b) => b && typeof b === 'object') : [];
    const G = M.strip && M.strip.boxes ? M.strip.boxes : null;
    const out = { R: [], L: [] };
    M.bars.forEach((b, i) => {
      const ref = rb.find((r) => (b.k != null && r.k === b.k) || (r.bar === b.bar && (r.pass || 1) === (b.pass || 1)));
      for (const h of ['R', 'L']) {
        let notes = null;
        if (ref) {
          notes = (Array.isArray(ref.notes) ? ref.notes : []).filter((n) => n && num(n.t) != null
            && (n.hand === h || ((n.hand !== 'L' && n.hand !== 'R') && Number.isFinite(+n.midi) && (h === 'L') === (+n.midi < 60))));
          if (!notes.length) continue;                                         
        }
        let parts;
        if (notes) {
          const sts = notes.slice().sort((p, q) => p.t - q.t).map((n) => {
            const bx = G && typeof n.id === 'string' && Array.isArray(G[n.id]) && Number.isFinite(+G[n.id][0]) && Number.isFinite(+G[n.id][2]) ? (+G[n.id][0] + +G[n.id][2]) / 2 : null;
            return { st: stateAt(h, +n.t), x: bx };
          });
          const worst = sts.some((q) => q.st === 'fix') ? 'fix' : sts.some((q) => q.st === 'good') ? 'good' : 'unsure';
          if (new Set(sts.map((q) => q.st)).size > 1 && sts.every((q) => q.x != null)) {
            
            parts = [];
            sts.forEach((q, k) => {
              const last = parts[parts.length - 1];
              if (last && last.st === q.st) return;
              const x0 = k ? (sts[k - 1].x + q.x) / 2 : null;
              if (last) last.x1 = x0;
              parts.push({ st: q.st, x0, x1: null });
            });
          } else parts = [{ st: worst, x0: null, x1: null }];
          parts.worst = worst;
        } else {
          
          const a = num(b.fromS), z = num(b.toS) != null ? b.toS : M.bars[i + 1] && num(M.bars[i + 1].fromS) != null ? M.bars[i + 1].fromS : null;
          const st = a != null && z != null && z > a ? over(h, a, z) : null;
          if (!st) continue;
          parts = [{ st, x0: null, x1: null }];
          parts.worst = st;
        }
        const covering = M.fixes.filter((f) => (f.regs || []).some((r) => r.a <= i && i <= r.b));
        const fix = covering.find((f) => f.hand === h) || covering[0] || null;
        out[h].push({ i, bar: b.bar, parts, worst: parts.worst, fix: fix ? fix.n : null });
      }
    });
    return out.R.length || out.L.length ? out : null;
  }
  
  
  
  
  
  
  
  
  
  let L8 = null;
  const shellApi = () => (window.MVMuse && window.MVMuse.shell) || null;
  function shell08(ctx) {
    close08();
    let root = document.getElementById('tb-l08');
    if (!root) { root = el('div'); root.id = 'tb-l08'; document.body.append(root); }
    root.className = 'mv mv8';
    root.replaceChildren();
    const top = el('header', 'mv-top');
    const back = el('button', 'tb-nav mv-back');
    back.type = 'button';
    back.innerHTML = ICON.back;
    back.append(el('span', 'mv-back-word', 'History'));
    back.setAttribute('aria-label', 'Back to History');
    back.addEventListener('click', () => ctx.back());
    
    top.append(back);
    const stage = el('div', 'mv8-stage');
    const player = el('div');
    player.id = 'tb-v08';
    player.hidden = true;
    stage.append(player);
    
    
    const dock = el('div', 'mv-dock'), bar = el('div', 'mv-bar');
    const tk = trackOf(ctx), track = el('div', 'mv-track'), meta = el('div', 'mv-meta');
    
    
    const cover = (typeof ctx.cover === 'string' && ctx.cover) || coverOf(tk.composer);
    let art;
    if (cover) {
      art = el('img', 'mv-art');
      art.src = cover; art.alt = ''; art.decoding = 'async';
      if (ctx.cover) art.classList.add('song');
    } else {
      art = el('video', 'mv-art');
      art.muted = true; art.playsInline = true; art.preload = 'metadata'; art.tabIndex = -1; art.disablePictureInPicture = true;
      if (ctx.video) {
        art.src = ctx.video;
        art.addEventListener('loadedmetadata', () => { try { art.currentTime = Math.min(1, (num(art.duration) || 2) / 2); } catch {   } }, { once: true });
      }
    }
    art.setAttribute('aria-hidden', 'true');
    const artBtn = el('button', 'mv-art-btn');
    artBtn.type = 'button';
    artBtn.setAttribute('aria-label', 'History: your takes'); artBtn.title = 'History: your takes';
    artBtn.addEventListener('click', () => ctx.back());
    artBtn.append(art);
    meta.append(el('span', 'mv-title', tk.title), el('span', 'mv-artist', tk.by));
    track.append(artBtn, meta);
    const prevBtn = iconBtn('mv-tbtn mv-prev', ICON.prev, 'Previous step');
    const playBtn = iconBtn('mv-tbtn mv-play', ICON.play, 'Play the lesson');
    const nextBtn = iconBtn('mv-tbtn mv-skip', ICON.skip, 'Next step');
    const ctrl = el('div', 'mv-ctrl');
    ctrl.append(prevBtn, playBtn, nextBtn);
    const volBtn = iconBtn('mv-tbtn mv-vol-btn', ICON.voiceOn, 'Mute');
    const volRange = el('input', 'mv-vol');
    volRange.type = 'range'; volRange.min = '0'; volRange.max = '100'; volRange.step = '1';
    volRange.setAttribute('aria-label', 'Volume');
    const tools = el('div', 'mv-tools');
    
    
    const moreBtn = iconBtn('mv-tbtn mv-more8', ICON.more, 'More');
    moreBtn.setAttribute('aria-haspopup', 'menu'); moreBtn.setAttribute('aria-expanded', 'false');
    
    moreBtn.hidden = true;
    tools.append(volBtn, volRange);
    bar.append(track, ctrl, tools);
    dock.append(bar);
    
    
    const band = el('div', 'mv-band');
    band.hidden = true;
    root.append(top, stage, band, dock);
    root.hidden = false;
    const me = { ctx, root, top, stage, player, dock, band, back, playBtn, prevBtn, nextBtn, volBtn, volRange, moreBtn, alive: true, pos: null, fixOn: null,
      litIds: [], vol: null, volBefore: 1, said: null };
    L8 = me;
    me.score = scoreModel(ctx.res);
    bandBuild(me, (n) => { const A = shellApi(); if (A) A.fix(n); });
    me.key = keyOf(me);
    stage.append(me.key);
    playBtn.addEventListener('click', () => { const A = shellApi(); if (A) A.play(); });
    prevBtn.addEventListener('click', () => { const A = shellApi(); if (A) A.prev(); });
    nextBtn.addEventListener('click', () => { const A = shellApi(); if (A) A.next(); });
    
    moreBtn.addEventListener('click', (e) => { e.stopPropagation(); const A = shellApi(); if (A && A.menu) A.menu(); });
    volRange.addEventListener('input', () => { const A = shellApi(); if (A) A.volume(+volRange.value / 100); });
    volBtn.addEventListener('click', () => {
      const A = shellApi();
      if (!A) return;
      if (me.vol > 0) { me.volBefore = me.vol; A.volume(0); } else A.volume(me.volBefore || 1);
    });
    
    me.fit = () => {
      root.style.setProperty('--dock-h', `${Math.round(dock.getBoundingClientRect().height)}px`);
      root.style.setProperty('--deck-h', `${Math.round(top.getBoundingClientRect().height)}px`);
      bandLayout(me);
    };
    me.ro = window.ResizeObserver ? new ResizeObserver(me.fit) : null;
    if (me.ro) { me.ro.observe(dock); me.ro.observe(top); me.ro.observe(root); }
    window.addEventListener('resize', me.fit);
    me.fit();
    requestAnimationFrame(() => { if (L8 === me) me.fit(); });
    const loop = () => { if (L8 !== me) return; follow8(me); me.raf = requestAnimationFrame(loop); };
    me.raf = requestAnimationFrame(loop);
    window.scrollTo(0, 0);
    return { player };
  }
  
  
  function follow8(me) {
    const A = shellApi(), s = A ? A.now() : null;
    if (!s) return;
    const M = me.score;
    if (M) {
      const f = s.fix != null ? M.fixes.find((x) => x.n === s.fix) || null : null;
      let p = me.pos;
      if (s.x != null && M.strip) p = clamp01(M.strip.fx(s.x));
      else if (f && (s.kind === 'card' || p == null || !f.regs.some((r) => p >= r.lo - 1e-6 && p <= r.hi + 1e-6))) p = f.regs[0].lo;
      else if (s.mode === 'end' || s.kind === 'week' || s.kind === 'film') p = 1;
      else if (s.mode === 'idle' || p == null) p = M.strip && M.strip.path.length ? clamp01(M.strip.fx(M.strip.path[0][1])) : 0;
      me.pos = p; me.fixOn = f; me.litIds = s.lit || [];
      bandFollow(me);
    }
    const said = `${s.mode}|${s.playing}`;
    if (said !== me.said) {
      me.said = said;
      me.playBtn.innerHTML = s.playing ? ICON.pause : ICON.play;
      const label = s.playing ? 'Pause the lesson' : s.mode === 'end' ? 'Play the lesson again' : s.mode === 'idle' ? 'Play the lesson' : 'Resume the lesson';
      me.playBtn.setAttribute('aria-label', label); me.playBtn.title = label;
      me.playBtn.classList.toggle('on', !!s.playing);
      me.prevBtn.disabled = s.mode === 'idle'; me.nextBtn.disabled = s.mode === 'idle';
    }
    if (me.moreBtn && typeof s.menu === 'boolean') me.moreBtn.setAttribute('aria-expanded', String(s.menu));
    if (s.volume !== me.vol && Number.isFinite(s.volume)) {
      me.vol = s.volume;
      me.volRange.value = String(Math.round(me.vol * 100));
      me.volRange.style.setProperty('--v', `${Math.round(me.vol * 100)}%`);
      me.volBtn.innerHTML = me.vol > 0 ? ICON.voiceOn : ICON.voiceOff;
      me.volBtn.setAttribute('aria-label', me.vol > 0 ? 'Mute' : 'Unmute'); me.volBtn.title = me.vol > 0 ? 'Mute' : 'Unmute';
    }
  }
  function close08() {
    const me = L8;
    if (!me) return;
    L8 = null;
    me.alive = false;
    if (me.raf) cancelAnimationFrame(me.raf);
    if (me.ro) me.ro.disconnect();
    window.removeEventListener('resize', me.fit);
    me.root.hidden = true;
    me.root.replaceChildren();
  }
  window.TBMuse = { open, update, close, get openId() { return V ? V.ctx.id : null; },
    get state() { return V ? { lesson: !!V.lesson, mode: V.mode, paused: !!V.paused, stopped: !!V.stopped, ghost: !!V.gst, ghostView: V.gst ? V.gst.view().mode : null, orbit: V.gst ? V.gst.orbit() : null, bodyParts: V.gst && V.gst.ghostState() ? V.gst.ghostState().bodyParts : null, look: V.gst && V.gst.ghostState() ? V.gst.ghostState().look : null, volume: V.vol, stepAgeMs: Math.round(performance.now() - (V.stepAt || 0)), step: V.at ? V.at.step : null, part: V.at ? V.at.part : null, pos: V.plan ? +posNow(V).toFixed(2) : null, total: V.plan ? +V.plan.total.toFixed(2) : null, piano: window.MVPiano && typeof window.MVPiano.stats === 'function' ? window.MVPiano.stats() : null, listening: !!V.listening, scene: V.root.dataset.scene, onKeys: !!V.onKeys, footage: V.gst && V.gst.ghostState() ? !!V.gst.ghostState().footage : null } : null; },
    stop() { if (V && V.mode === 'lesson') stopLesson(V); else if (V) { V.video.pause(); V.mode = 'idle'; poster(V, 'idle'); renderBar(V); } },
    
    _ghostStage: () => (V && V.gst) || null,
    _plate: () => (V && V.curGhost ? plateOf(V, V.curGhost.part) : null),
    
    _card: () => (V && V.card ? V.card.state() : null),
    
    _lines: () => (V && V.plan ? V.plan.segs.filter((x) => x.kind === 'line').map((x) => ({ id: x.id, text: x.text, voiced: !!(V.pack && packClip(V, x.text)) })) : null),
    statsFor, handsFor, _skills: skillsOf, _cover: (ctx) => coverOf(trackOf(ctx).composer), _trimTail: trimTail, _opening: opening, _vitals: vitals, _verdict: verdictLine };
  
  window.TBMuse.shell08 = shell08;
  window.TBMuse.close08 = close08;
  window.TBMuse._shell = () => (L8 ? { pos: L8.pos, fix: L8.fixOn ? L8.fixOn.n : null, lit: L8.litIds.slice(), painted: (L8.drawn || 0) > 0, tiles: !!L8.fr, whole: !!(L8.fr && L8.fr.lib),
    
    
    band: L8.fr ? { vw: L8.vw, cw: L8.cw, k: L8.k, scroll: L8.scroll, off: L8.off, H: L8.H,
      analysed: [L8.fr.WX0, L8.fr.WX1].map((c) => (c - L8.fr.CX0) * L8.k + L8.off - L8.scroll), content: [L8.fr.CX0, L8.fr.CX1],
      play: L8.pos != null ? (wfToC(L8, L8.pos) - L8.fr.CX0) * L8.k + L8.off - L8.scroll : null } : null,
    fixes: L8.score ? L8.score.fixes.map((f) => ({ n: f.n, bars: f.bars.slice(), row: f.row, regions: f.regs.map((r) => ({ lo: r.lo, hi: r.hi, bars: [L8.score.bars[r.a].bar, L8.score.bars[r.b].bar] })) })) : [],
    
    errors: (L8.errors || []).map((e) => ({ n: e.n, kind: e.kind, emoji: e.emoji, bar: e.bar, hands: e.hands, x0: e.lx0, x1: e.lx1, left: e.bl, width: e.bw })),
    reds: (L8.reds || []).map((r) => ({ ...r })), shift: (L8.off || 0) - (L8.scroll || 0),
    lanes: L8.lanes ? Object.fromEntries(['R', 'L'].map((h) => [h, L8.lanes[h].map((g) => ({ bar: g.bar, state: g.worst, parts: g.parts.map((q) => q.st), fix: g.fix }))])) : null } : null);
  window.TBMuse._scoreModel = scoreModel;
  window.TBMuse._litAt = litAt;
  
  window.TBMuse.skillsView = (res) => { const sk = skillsOf(res); return sk ? skillsView(sk) : null; };
  
  
  
  
  
  
  
  const HAND_AXES = [['notes', 'Notes', "The score's notes of this hand you played as written"],
    ['timing', 'Timing', 'How even the beat of this hand was, against the score and the pianist, room left for interpretation'],
    ['flow', 'Flow', 'The bars you played through without stopping or going back (the take as a whole)'],
    ['fingering', 'Fingering', 'The fingers this hand used, against the reference'],
    ['touch', 'Touch', "How this hand's loud and soft followed the pianist's"]];
  const LOW_WHY = { touch: 'Low confidence: from the sound of glasses or a phone, loud and soft are only roughly told',
    fingering: 'Low confidence: the fingertip reader has not passed its accuracy check yet' };
  const NOT_MEASURED = { fingering: 'not measured in this take: the fingertip reader has not passed its accuracy check yet',
    touch: 'not measured in this take: from the sound of glasses or a phone it cannot be told reliably' };
  function handSkills(res) {
    const ref = res && res.reference && typeof res.reference === 'object' ? res.reference : null;
    const M = res && res.lesson && Array.isArray(res.lesson.measures) ? res.lesson.measures.filter((m) => m && typeof m === 'object') : [];
    const meas = (id) => M.find((x) => x.id === id) || null;
    const ev = (id) => { const m = meas(id); return m && m.evidence && typeof m.evidence === 'object' ? m.evidence : null; };
    const take = skillsOf(res), flow = take ? (take.axes.find((a) => a.id === 'flow') || {}).v : null;
    const out = {};
    for (const h of ['L', 'R']) {
      const v = {};
      if (ref && ref.level === 'note' && ref.recognised !== false) {
        const F = ref.fields || {}, rows = (k) => (Array.isArray(ref[k]) ? ref[k] : []).map((r) => (Array.isArray(r) ? Object.fromEntries((F[k] || []).map((f, i) => [f, r[i]])) : r)).filter((r) => r && typeof r === 'object');
        const st = Array.isArray(ref.status) ? ref.status : [], of = Array.isArray(ref.refOf) ? ref.refOf : [];
        const m = st.filter((x, j) => x === 'matched' && Array.isArray(of[j]) && of[j][2] === h).length;
        const w = rows('wrong').filter((r) => r.hand === h).length, x = rows('missed').filter((r) => r.hand === h).length;
        if (m + w + x >= 6) v.notes = m / (m + w + x);
      }
      const tm = ev('steadiness') && ev('steadiness').timing && ev('steadiness').timing.hands ? ev('steadiness').timing.hands[h] : null;
      if (tm && num(tm.score) != null) v.timing = num(tm.score);
      if (num(flow) != null) v.flow = flow;
      
      
      const low = new Set();
      const fg = meas('fingering');
      if (fg && fg.state !== 'not-measured' && fg.evidence && fg.evidence.hands && fg.evidence.hands[h] && num(fg.evidence.hands[h].score) != null) v.fingering = num(fg.evidence.hands[h].score);
      else {
        
        const fs = res && res.fingering && res.fingering.summary && res.fingering.summary.hands ? res.fingering.summary.hands[h] : null;
        if (fs && num(fs.score) != null && (num(fs.notes) || 0) >= 6) { v.fingering = num(fs.score); low.add('fingering'); }
      }
      const tc = meas('touch'), tce = tc && tc.evidence && tc.evidence.touch;
      if (tc && tc.state !== 'not-measured' && tce && tce.hands && tce.hands[h] && num(tce.hands[h].score) != null) v.touch = num(tce.hands[h].score);
      else if (tce && tce.hands && tce.hands[h] && num(tce.hands[h].rho) != null && (num(tce.hands[h].notes) || 0) >= 8) {
        
        
        v.touch = (num(tce.hands[h].rho) + 1) / 2; low.add('touch');
      }
      const axes = HAND_AXES.map(([id, name, why]) => ({ id, name, why, v: num(v[id]) != null ? clamp01(v[id]) : null, low: low.has(id) }));
      const got = axes.filter((a) => a.v != null && !a.low);
      out[h] = { axes, score: got.length >= 2 ? Math.round((100 * got.reduce((a, b) => a + b.v, 0)) / got.length) : null };
    }
    return out;
  }
  
  
  function handPentagon(sk, h) {
    const NS = 'http://www.w3.org/2000/svg', R = 70, cx = 120, cy = 104;
    const mk = (tag, at) => { const n = document.createElementNS(NS, tag); for (const k in at) n.setAttribute(k, at[k]); return n; };
    const pt = (k, r) => { const a = (-90 + 72 * k) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const f1 = (p) => p.map((n) => n.toFixed(1));
    const ring = (f) => sk.axes.map((_, k) => f1(pt(k, R * f)).join(',')).join(' ');
    const words = sk.axes.map((a) => `${a.name}: ${a.v != null ? `${a.low ? 'about ' : ''}${Math.round(a.v * 100)}${a.low ? ' (low confidence)' : ''}` : 'not measured'}`).join(', ');
    const wrap = el('figure', 'mv-skills');
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `${h === 'L' ? 'Left' : 'Right'} hand: ${sk.score != null ? `score ${sk.score} out of 100` : 'no score'}. ${words}.`);
    const svg = mk('svg', { viewBox: '-62 0 316 212', class: 'mv-sk-svg', 'aria-hidden': 'true' });
    svg.append(mk('polygon', { points: ring(1), class: 'sk-ring' }), mk('polygon', { points: ring(0.5), class: 'sk-ring sk-half' }));
    sk.axes.forEach((_, k) => { const [x, y] = f1(pt(k, R)); svg.append(mk('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'sk-axis' })); });
    const fill = sk.score != null ? sk.score / 100 : 0.5;
    const P = sk.axes.map((a, k) => f1(pt(k, Math.max(0.04, a.v != null ? a.v : fill) * R)));
    const g = mk('g', { class: 'sk-shape' });
    g.append(mk('polygon', { points: P.map((p) => p.join(',')).join(' '), class: 'sk-fill sk-fill-whole' }));
    sk.axes.forEach((a, k) => {
      const b = sk.axes[(k + 1) % sk.axes.length], q = P[(k + 1) % P.length];
      g.append(mk('line', { x1: P[k][0], y1: P[k][1], x2: q[0], y2: q[1], class: `sk-edge${a.v == null || b.v == null ? ' sk-edge-off' : ''}` }));
    });
    sk.axes.forEach((a, k) => g.append(mk('circle', { cx: P[k][0], cy: P[k][1], r: a.v == null || a.low ? '2.8' : '2.6', class: a.v == null ? 'sk-dot-off' : a.low ? 'sk-dot-low' : 'sk-dot' })));
    svg.append(g);
    sk.axes.forEach((a, k) => {
      const [x, y] = pt(k, R + 22), anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
      const ty = k === 0 ? y - 1 : y - 5;
      const t = mk('text', { x: x.toFixed(1), y: ty.toFixed(1), 'text-anchor': anchor, class: `sk-name${a.v == null ? ' off' : ''}` });
      t.append(document.createTextNode(a.name));
      const val = mk('tspan', { x: x.toFixed(1), dy: '13', class: 'sk-val' });
      val.textContent = a.v != null ? `${a.low ? '~' : ''}${Math.round(a.v * 100)}` : '-';
      t.append(val);
      const tt = mk('title', {});
      tt.textContent = a.v != null ? `${a.name}: ${a.low ? 'about ' : ''}${Math.round(a.v * 100)}. ${a.why}${a.low ? `. ${LOW_WHY[a.id] || 'Low confidence'}; not in the score.` : ''}`
        : `${a.name}: ${NOT_MEASURED[a.id] || 'not measured in this take'}`;
      t.append(tt);
      svg.append(t);
    });
    wrap.append(svg);
    return wrap;
  }
  const HAND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 12.5V5.2a1.4 1.4 0 0 1 2.8 0V11"/><path d="M11.8 10.6V3.9a1.4 1.4 0 0 1 2.8 0v6.9"/><path d="M14.6 10.8V5.3a1.4 1.4 0 0 1 2.8 0v6.4"/><path d="M17.4 11.6V8.2a1.4 1.4 0 0 1 2.8 0v5.4a7.4 7.4 0 0 1-7.4 7.4h-.9a6.3 6.3 0 0 1-4.9-2.4l-3.3-4.1a1.5 1.5 0 0 1 2.3-1.9L9 15"/></svg>';
  const GO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const OK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const NUM_WORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  
  
  
  function cheerOf(hands, keep) {
    const all = ['L', 'R'].flatMap((h) => hands[h].axes.filter((a) => a.v != null).map((a) => ({ ...a, h })));
    const scores = ['L', 'R'].map((h) => hands[h].score).filter((x) => x != null);
    const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const out = [mean == null ? 'Well done for playing it through.' : mean >= 90 ? 'Beautiful playing.' : mean >= 75 ? 'Well played.' : 'Good work getting through it.'];
    const best = all.sort((a, b) => b.v - a.v)[0];
    const handW = (h) => (h === 'L' ? 'left' : 'right');
    const both = best && all.filter((a) => a.id === best.id && a.v >= 0.8).length > 1;
    if (best && best.v >= 0.8) {
      if (best.id === 'notes') out.push(both ? 'Your notes were right almost everywhere, in both hands.' : `Your ${handW(best.h)} hand's notes were right almost everywhere.`);
      else if (best.id === 'flow') out.push('You kept going through the passage, with no stops to speak of.');
      else if (best.id === 'timing') out.push(both ? 'Both hands kept a steady beat.' : `Your ${handW(best.h)} hand kept a steady beat.`);
      else if (best.id === 'fingering') out.push('Your fingering was clean.');
      else if (best.id === 'touch') out.push('Your touch followed the music\'s shape.');
    }
    if (keep && keep.bars && keep.bars.length) out.push(`Bar ${keep.bars[0]} was right note for note.`);
    return out.join(' ');
  }
  function endView(res, opts = {}) {
    const L = res && res.lesson, V = L && L.view;
    if (!V) return null;
    const fixes = (Array.isArray(V.fixes) ? V.fixes : []).filter((f) => f && Number.isInteger(f.n));
    const keep = L.strength && Array.isArray(L.strength.bars) && L.strength.bars.length ? L.strength : null;
    const piece = V.piece || {}, [ptitle, psec] = String(piece.label || piece.title || '').split(' · ');
    const hands = handSkills(res), hasHands = ['L', 'R'].some((h) => hands[h].axes.some((a) => a.v != null));
    const kindOf = (f) => (L8 && Array.isArray(L8.errors) ? (L8.errors.find((e) => e.n === f.n) || {}).emoji : null) || KIND_EMOJI[f.kind] || CATS.notes[0];
    const handWords = (hd) => (hd === 'L' ? 'left hand' : hd === 'R' ? 'right hand' : 'both hands');
    const grid = el('div', `bn ${hasHands ? 'bn-hands' : 'bn-solo'}`);
    let i = 0;
    
    const hero = el('div', 'bn-t bn-hero');
    hero.style.setProperty('--i', String(hasHands ? 1 : 0));
    if (opts.portrait) { const im = el('img', 'bn-art'); im.src = opts.portrait; im.alt = ''; im.decoding = 'async'; hero.append(im); }
    else { const no = el('span', 'bn-art bn-art-none'); no.setAttribute('aria-hidden', 'true'); hero.append(no); }
    const ht = el('div', 'bn-hero-t'), title = el('h2', 'bn-title');
    title.append(document.createTextNode(psec ? `${ptitle}, ` : ptitle || 'Your lesson'));
    if (psec) title.append(el('span', 'grad', psec));
    const nf = fixes.length;
    const lead = `${NUM_WORD[nf] || nf} ${nf === 1 ? 'thing' : 'things'} to fix${keep ? ', one to keep' : ''}.`;
    ht.append(el('p', 'bn-eye', 'Nice work!'), title, el('p', 'bn-cheer', cheerOf(hands, keep)), el('p', 'bn-lead', nf || keep ? lead : 'Nothing to fix in this take.'));
    if (piece.composer) ht.append(el('p', 'bn-by', piece.composer));
    ht.append(el('div', 'bn-acts'));
    hero.append(ht);
    
    const span = (() => {
      const xs = ['L', 'R'].flatMap((h) => (L.hands && Array.isArray(L.hands[h]) ? L.hands[h].filter(okSec) : []));
      return xs.length ? [Math.min(...xs.map((x) => x.fromS)), Math.max(...xs.map((x) => x.toS))] : null;
    })();
    const handCard = (h) => {
      const sk = hands[h], card = el('div', `bn-t bn-hand bn-hs bn-${h}`);
      card.style.setProperty('--i', String(h === 'L' ? 0 : 2));
      card.setAttribute('aria-label', `${h === 'L' ? 'Left' : 'Right'} hand: ${sk.score != null ? `score ${sk.score} out of 100` : 'no score in this take'}`);
      const head = el('div', 'bn-hhead'), ic = el('span', `bn-hic${h === 'L' ? ' bn-hic-l' : ''}`), tx = el('div', 'bn-htx'), big = el('p', 'bn-big');
      ic.innerHTML = HAND_SVG;
      big.append(el('b', '', sk.score != null ? String(sk.score) : '-'));
      if (sk.score != null) big.append(el('span', 'bn-of', '/100'));
      tx.append(el('p', 'bn-eye', h === 'L' ? 'Left hand' : 'Right hand'), big);
      head.append(ic, tx);
      card.append(head, handPentagon(sk, h));
      const segs = span && L.hands && Array.isArray(L.hands[h]) ? L.hands[h].filter(okSec) : [];
      if (segs.length) {
        const lane = el('span', 'bn-lane'), W = span[1] - span[0];
        lane.setAttribute('aria-hidden', 'true');
        for (const x of segs) {
          const s = el('i', `bn-lane-s ${x.state === 'fix' ? 'fix' : x.state === 'good' ? 'good' : 'unsure'}`);
          Object.assign(s.style, { left: `${(100 * (x.fromS - span[0])) / W}%`, width: `${(100 * (x.toS - x.fromS)) / W}%` });
          lane.append(s);
        }
        card.append(el('p', 'bn-cap', 'Through the take'), lane);
      }
      const mine = fixes.filter((f) => f.hand === h || !f.hand || f.hand === 'both');
      card.append(el('p', 'bn-sub', mine.length ? `To fix: ${mine.map((f) => str(f.cardTitle, 60) || str(f.title, 60)).join('; ')}` : 'Nothing to fix in this hand.'));
      return card;
    };
    if (hasHands) grid.append(handCard('L'), hero, handCard('R')); else grid.append(hero);
    i = 3;
    
    const row = el('div', 'bn-row');
    row.style.setProperty('--n', String(Math.max(1, nf + (keep ? 1 : 0))));
    for (const f of fixes) {
      const b = el('button', 'bn-t bn-fix');
      b.type = 'button';
      b.style.setProperty('--i', String(i++));
      const where = `${Array.isArray(f.bars) && f.bars.length ? `Bar ${f.bars[0]} · ` : ''}${handWords(f.hand)}`;
      b.setAttribute('aria-label', `Practise fix ${f.n}: ${str(f.cardTitle, 60) || str(f.title, 60)}, ${where}`);
      const top = el('span', 'bn-fix-top'), sub = el('span', 'bn-sub'), go = el('span', 'bn-go');
      const em = kindOf(f), cat = el('span', 'bn-cat');
      cat.append(el('span', 'bn-emoji', em), el('span', 'bn-cat-t', KIND_NAME[em] || 'Notes'));
      top.append(el('span', 'bn-n', String(f.n)), cat);
      sub.append(el('i', `bn-hd bn-hd-${f.hand === 'L' || f.hand === 'R' ? f.hand : 'B'}`), document.createTextNode(where));
      go.append(el('span', '', 'Practise it'));
      go.insertAdjacentHTML('beforeend', GO_SVG);
      b.append(top, el('span', 'bn-fix-t', str(f.cardTitle, 60) || str(f.title, 60)), sub, go);
      b.addEventListener('click', () => { const A = shellApi(); if (A) A.fix(f.n); });
      row.append(b);
    }
    if (keep) {
      
      
      const k = el('div', 'bn-t bn-keep'), top = el('span', 'bn-fix-top'), ok = el('span', 'bn-n bn-ok');
      k.style.setProperty('--i', String(i++));
      ok.innerHTML = OK_SVG;
      top.append(ok, el('span', 'bn-eye', 'Keep'));
      const bars = keep.bars.slice(0, 3), sub = el('span', 'bn-sub');
      sub.append(el('i', 'bn-hd bn-hd-K'), document.createTextNode(bars.length > 1 ? 'the whole bars' : 'the whole bar'));
      k.append(top, el('span', 'bn-fix-t', `Bar${bars.length > 1 ? 's' : ''} ${bars.join(', ')}, every note as written`), sub);
      row.append(k);
    }
    if (row.children.length) grid.append(row);
    return grid;
  }
  window.TBMuse.endView = (res, opts) => endView(res, opts);

  
  window.TBMuse._notePoint = (id) => (V && V.card ? V.card.notePoint(id) : null);
})();
