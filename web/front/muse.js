































(() => {
  'use strict';
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v, n = 600) => (typeof v === 'string' ? v.slice(0, n) : '');
  const mmss = (s) => { s = Math.max(0, Math.round(+s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const clipOf = (res) => { const v = +(res && res.media && res.media.clipStartS); return Number.isFinite(v) && v > 0 ? v : 0; };
  const LEAD_S = 0.25, TAIL_S = 0.6;              
  const DUCK_AHEAD_S = 0.5;                       
  const CARD_S = 2.0;
  const RIM_STEP_S = 0.25;                        
  
  
  
  
  
  const CLICK_S = 0.6, PACE_MIN = 0.25;
  const EXERCISE_MAX_S = 14;                      
  const REF_SCENES = ['signpost', 'correct', 'exercise'];   
  
  
  
  
  
  
  const END_CHEER = { url: '/voice/end-cheer.mp3', text: "Nice work! You made it all the way through. Here's how you did, and what to practise next." };
  function cheerStop(me) { if (me.cheer) { try { me.cheer.pause(); } catch {   } } }
  function cheerPlay(me) {                              
    if (!me.pack || me.cheered || !(me.vol > 0)) return;
    me.cheered = true;
    try { me.cheer = me.cheer || new Audio(END_CHEER.url); me.cheer.volume = Math.min(1, me.vol); me.cheer.currentTime = 0; const p = me.cheer.play(); if (p && p.catch) p.catch(() => {}); } catch {   }
  }
  const FINGER_GUIDE = { id: 'fingers.guide', url: '/voice/fingers-guide.mp3', durS: 6.72,     
    text: 'Fingers are numbered from the thumb. Thumb is one, little finger is five, on both hands.',
    sub: 'Fingers are numbered from the thumb. Thumb is 1, little finger is 5, on both hands.',
    
    words: [['Fingers', 0.12, 0.52], ['are', 0.56, 0.7], ['numbered', 0.74, 1.08], ['from', 1.12, 1.26], ['the', 1.3, 1.42], ['thumb.', 1.48, 1.82],
      ['Thumb', 2.4, 2.74], ['is', 2.82, 2.96], ['one,', 3.12, 3.32], ['little', 3.84, 4.059], ['finger', 4.12, 4.52], ['is', 4.6, 4.76], ['five,', 4.84, 5.26],
      ['on', 5.66, 5.78], ['both', 5.84, 6.04], ['hands.', 6.08, 6.48]] };
  const FINGER_WORDS = /\b(?:fingers?|thumbs?)\b/i;
  const VOL_KEY = 'mv-volume';
  let V = null;

  
  const barWord = (b, cap = true) => (+b === 0 ? `${cap ? 'The' : 'the'} pickup` : `${cap ? 'Bar' : 'bar'} ${+b}`);
  function barsWords(bs, cap = true) {
    const xs = [...new Set((Array.isArray(bs) ? bs : []).map(Number).filter((x) => Number.isInteger(x) && x >= 0))].sort((p, q) => p - q);
    if (!xs.length) return '';
    const a = xs[0], b = xs[xs.length - 1];
    if (a === b) return barWord(a, cap);
    if (b - a === xs.length - 1) return a === 0 ? `${cap ? 'The' : 'the'} pickup to bar ${b}` : `${cap ? 'Bars' : 'bars'} ${a} to ${b}`;
    const nums = xs.filter((x) => x > 0), list = (ns) => (ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}` : String(ns[0]));
    const said = `${nums.length > 1 ? 'bars' : 'bar'} ${list(nums)}`;
    return a === 0 ? `${cap ? 'The' : 'the'} pickup and ${said}` : (cap ? capital(said) : said);
  }
  const viewOf = (res) => {
    const v = res && res.lesson && res.lesson.view;
    return v && typeof v === 'object' && Array.isArray(v.fixes) && Array.isArray(v.lines) ? v : null;
  };

  
  
  
  
  
  
  
  
  const pianoOf = () => (window.MVPiano && typeof window.MVPiano.play === 'function' ? window.MVPiano : null);
  const pianoCall = (name, ...a) => { const P = pianoOf(); if (P && typeof P[name] === 'function') { try { return P[name](...a); } catch {   } } return undefined; };
  function pianoReady(notes) {
    const P = pianoOf();
    if (!P || typeof P.ready !== 'function') return Promise.resolve(false);
    try { return Promise.resolve(P.ready(notes)).catch(() => false); } catch { return Promise.resolve(false); }
  }
  const velOf = (v) => Math.max(1, Math.min(127, Math.round(+v || 80)));
  
  function lessonNotes(view) {
    const out = [], seen = new Set();
    const steps = [view.hook, view.keep, ...view.fixes.flatMap((f) => f.steps || [])];
    for (const s of steps) {
      for (const n of (s && Array.isArray(s.notes) ? s.notes : [])) {
        const m = Math.round(+n[2]), v = velOf(n[3]);
        if (!Number.isFinite(m) || seen.has(`${m}:${v}`)) continue;
        seen.add(`${m}:${v}`);
        out.push([m, v]);
      }
    }
    return out;
  }
  
  function playNote(me, midi, vel, aheadS, durS) {
    const P = pianoOf();
    me.counts.notes++;
    if (!P || me.vol <= 0) return;
    try {
      const now = typeof P.now === 'function' ? +P.now() : NaN;
      const r = P.play(midi, velOf(vel), Number.isFinite(now) ? now + Math.max(0, aheadS) : null, Math.max(0.05, durS));
      me.counts.piano++;
      me.counts.longest = Math.max(me.counts.longest || 0, Math.round(Math.max(0.05, durS) * 100) / 100);   
      if (r === null) me.counts.missed++;
    } catch { me.counts.missed++; }
  }
  function stopPiano() { pianoCall('stopAll'); pianoCall('unduck'); }
  
  
  function duckLines(me, s, t) {
    const P = pianoOf();
    if (!P || typeof P.duckUnder !== 'function' || typeof P.now !== 'function') return;
    me.tt.says.forEach((x, k) => {
      if (me.ducked.has(k) || x.at - t > DUCK_AHEAD_S || x.end <= t) return;
      me.ducked.add(k);
      const now = +P.now();
      pianoCall('duckUnder', now + Math.max(0, x.at - t), now + (x.end - t), s.role === 'you' ? 'you' : 'reference');
    });
  }
  
  
  const wrongOf = (fixes) => new Set((fixes || []).flatMap((f) => (f && f.marks) || []).filter((m) => m && m.kind === 'wrong' && m.noteId).map((m) => m.noteId));
  
  
  
  function click(me) {
    me.counts.clicks++;
  }
  
  const words = (t) => (str(t, 600).match(/\S+/g) || []).length;
  function lineOf(me, id) { return me.lines.get(id) || null; }
  function lineDur(me, id) {
    if (id === FINGER_GUIDE.id && me.guide && !me.guide.lost) return FINGER_GUIDE.durS;
    const c = me.pack && me.pack.clips[id];
    if (c && num(c.durS) && !me.packLost) return Math.max(0.4, c.durS);
    const L = lineOf(me, id);
    return 0.5 + 0.33 * words(L ? L.sub || L.text : '');       
  }
  
  
  
  function cuesOf(text) {
    const w = str(text, 600).split(/\s+/).filter(Boolean).reduce((a, x) => { if (x === '-' && a.length) a[a.length - 1] += ' -'; else a.push(x); return a; }, []);
    
    if (w.length < 15 || str(text, 600).length <= 72) return [text];
    let best = -1;
    for (let k = 3; k < w.length - 3; k++) if (/[,;:.-]$/.test(w[k - 1]) && (best < 0 || Math.abs(k - w.length / 2) < Math.abs(best - w.length / 2))) best = k;
    if (best < 0) best = Math.ceil(w.length / 2);
    return [w.slice(0, best).join(' '), w.slice(best).join(' ')];
  }
  
  
  
  
  
  const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const FINGER_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
  function saidCues(text, words, dur) {
    let toks;
    if (Array.isArray(words) && words.length) toks = words.filter((w) => Array.isArray(w) && typeof w[0] === 'string' && num(w[1]) != null).map((w) => ({ w: w[0], at: w[1] }));
    else {
      const t = str(text, 600);
      let pos = 0;
      toks = (t.match(/\S+/g) || []).map((w) => { const i = t.indexOf(w, pos); pos = i + w.length; return { w, at: (dur || 0) * (i / Math.max(1, t.length)) }; });
    }
    const bare = (w) => w.replace(/^[^\w#♯♭]+|[^\w#♯♭]+$/g, '');
    const low = (i) => (i >= 0 && i < toks.length ? bare(toks[i].w).toLowerCase() : '');
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const raw = toks[i].w, w = bare(raw), lw = w.toLowerCase();
      const m = /^([A-G])(#|♯|♭)?$/.exec(w);
      if (m) {
        
        const opens = i === 0 || /[.!?:]$/.test(toks[i - 1].w);
        if (m[1] === 'A' && !m[2] && opens && !/^(sharp|flat)$/.test(low(i + 1)) && !/[,.]$/.test(raw)) continue;
        const acc = m[2] ? (/[#♯]/.test(m[2]) ? 1 : -1) : low(i + 1) === 'sharp' ? 1 : low(i + 1) === 'flat' ? -1 : 0;
        out.push({ kind: 'note', at: toks[i].at, pc: (PITCH[m[1]] + acc + 12) % 12, i });
        continue;
      }
      
      
      let n = null;
      if (FINGER_NUM[lw] && (/^fingers?$/.test(low(i - 1)) || (low(i - 1) === 'is' && /^(thumb|finger)$/.test(low(i - 2)))
        || (low(i - 1) === 'and' && out.some((c) => c.kind === 'finger' && c.i >= i - 3)) || (low(i + 1) === 'finger' && /^(first|second|third|fourth|fifth)$/.test(lw)))) n = FINGER_NUM[lw];
      else if (lw === 'thumb' && low(i + 1) !== 'is') n = 1;
      else if (lw === 'little' && low(i + 1) === 'finger' && low(i + 2) !== 'is') n = 5;
      if (n) out.push({ kind: 'finger', at: toks[i].at, n, i });
    }
    
    for (const c of out) if (c.kind === 'finger') { const k = out.find((x) => x.kind === 'note' && x.i > c.i && x.i <= c.i + 4); if (k) c.pc = k.pc; }
    return out;
  }
  
  function fixNotes(f) {
    const out = [];
    for (const st of (f && f.steps) || []) for (const n of (st && st.notes) || []) if (Array.isArray(n) && Number.isInteger(n[2])) out.push(n);
    return out;
  }
  function keyFor(me, f, pc) {
    const marks = ((f && f.marks) || []).filter((m) => m && Number.isInteger(m.midi));
    const mk = marks.find((m) => m.midi % 12 === pc);
    if (mk) return mk.midi;
    const anchor = marks[0] ? marks[0].midi : null, ns = fixNotes(f).map((n) => n[2]).filter((m) => m % 12 === pc);
    if (!ns.length) return null;                                    
    return anchor == null ? ns[0] : ns.sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))[0];
  }
  
  function flashMark(me, mark, ms) {
    const gm = me.ghostMarks;
    if (!me.gst || typeof me.gst.setMarks !== 'function' || !gm) return;
    const base = () => [...gm.base, ...gm.rims.slice(0, gm.shown).map((m) => ({ midi: m, kind: 'landmark', clock: 'reference' }))];
    try { me.gst.setMarks([...base(), mark]); } catch {   }
    clearTimeout(me.flashT);
    me.flashT = setTimeout(() => { if (me.gst && me.ghostMarks === gm) { try { me.gst.setMarks(base()); } catch {   } } }, ms);
  }
  function sayCue(me, c) {
    const s = me.scene, f = s && s.fix, sc = me.score;
    if (c.kind === 'finger' && !me.fingers.hidden) {                 
      for (const d of me.fingers.querySelectorAll(`.mv2-hand-d[data-n="${c.n}"]`)) {
        d.classList.add('said');
        setTimeout(() => d.classList.remove('said'), 1100);
      }
      return;
    }
    if (!f) return;
    const pc = c.pc;
    if (c.kind === 'note' && sc && typeof sc.kOf === 'function') {
      const w = f.window || {}, k0 = num(w.kFrom), k1 = num(w.kTo) != null ? num(w.kTo) : k0;
      const ids = new Set(fixNotes(f).filter((n) => n[5] && n[2] % 12 === pc).map((n) => n[5])
        .filter((id) => { const k = sc.kOf(id); return k == null || k0 == null || (k >= k0 && k <= k1); }));
      for (const id of ids) sc.sound(id, false, 0.9);
    }
    if (pc == null && c.kind === 'note') return;
    const midi = pc != null ? keyFor(me, f, pc) : (((f.marks || []).find((m) => m && Number.isInteger(m.midi)) || {}).midi);
    if (!Number.isInteger(midi)) return;
    if (c.kind === 'note') flashMark(me, { midi, kind: 'play', clock: 'reference' }, 900);
    else flashMark(me, { midi, kind: 'finger', finger: c.n, hand: f.hand === 'L' ? 'L' : 'R', clock: 'reference' }, 1500);
  }
  function voiceStart(me, id, x) {
    const L = lineOf(me, id);
    if (!L) return;
    me.said.push(id);
    
    if (x && num(x.at) != null) {
      const c = me.pack && me.pack.clips && me.pack.clips[id];
      const ws = id === FINGER_GUIDE.id ? FINGER_GUIDE.words : c && Array.isArray(c.words) ? c.words : null;
      for (const q of saidCues(L.text || L.sub, ws, (num(x.end) || x.at) - x.at)) me.sayCues.push({ ...q, at: x.at + q.at, done: false });
    }
    const cues = cuesOf(L.sub || L.text);
    me.cue = cues.length > 1 && x ? { cues, at: x.at, end: x.end, split: cues[0].split(/\s+/).length / (L.sub || L.text).split(/\s+/).length, shown: 0 } : null;
    showSub(me, cues[0]);
    if (id === FINGER_GUIDE.id) {                       
      const g = me.guide;
      if (!g || g.lost || me.vol <= 0) return;
      try {
        g.audio.currentTime = 0; g.audio.volume = Math.min(1, me.vol); g.playing = true;
        const p = g.audio.play();
        if (p && p.catch) p.catch(() => { g.lost = true; g.playing = false; });
      } catch { g.lost = true; g.playing = false; }
      return;
    }
    const c = me.pack && me.pack.clips[id];
    if (!c || me.packLost || me.vol <= 0) return;
    const a = me.pack.audio;
    try {
      a.currentTime = +c.startS || 0;
      a.volume = Math.min(1, me.vol);
      me.voiceUntil = (+c.startS || 0) + (+c.durS || 0);
      const p = a.play();
      if (p && p.catch) p.catch(() => { me.packLost = true; });
    } catch { me.packLost = true; }
  }
  function voiceStop(me) {
    if (me.pack) { try { me.pack.audio.pause(); } catch {   } }
    if (me.guide) { try { me.guide.audio.pause(); } catch {   } me.guide.playing = false; }
    me.voiceUntil = null;
  }
  function showSub(me, text) {
    me.sub.replaceChildren();
    if (!text) { me.sub.hidden = true; return; }
    const sp = el('span', 'mv2-subline', text);
    me.sub.append(sp);
    me.sub.hidden = false;
  }

  
  const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM20 5.5v13L9.5 12z" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5.5v13L14.5 12z" fill="currentColor"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="m16 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="18.5" cy="12" r="1.8" fill="currentColor"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  
  
  
  const SVGNS = 'http://www.w3.org/2000/svg';
  function fingerFigure() {
    
    
    
    
    const mk = (tag, attrs, parent) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); if (parent) parent.append(e); return e; };
    const svg = mk('svg', { viewBox: '0 0 1000 600', class: 'mv2-hands', role: 'img',
      'aria-label': 'Both hands, the fingers numbered from the thumb: thumb 1, index finger 2, middle finger 3, ring finger 4, little finger 5' });
    const R_FINGERS = [[146, 262, -9, 128, 50, 2], [194, 250, -1, 146, 51, 3], [240, 256, 6, 134, 48, 4], [280, 276, 14, 104, 42, 5]];
    const R_THUMB = [126, 352, -52, 118, 58, 1];
    
    const finger = (X, mirror, [bx, by, ang, len, w], taper) => {
      const t = w * taper, r = t / 2, a = ((mirror ? -ang : ang) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), x0 = X(bx);
      const P = (x, y) => [x0 + x * c + y * sn, by - y * c + x * sn].map((v) => v.toFixed(1)).join(' ');
      return { d: `M${P(-w / 2, -12)} L${P(-t / 2, len - r)} A${r} ${r} 0 0 1 ${P(t / 2, len - r)} L${P(w / 2, -12)} Z`,
        tip: [x0 + (len - r * 0.9) * sn, by - (len - r * 0.9) * c] };
    };
    for (const h of [{ side: 'L', mirror: true, label: 'Left hand', col: '#C084FC' }, { side: 'R', mirror: false, label: 'Right hand', col: '#F472B6' }]) {
      const X = (x) => (h.mirror ? 500 - x : x + 500);          
      const g = mk('g', { class: `mv2-hand ${h.side}` }, svg);
      const parts = [...R_FINGERS.map((f) => ({ ...finger(X, h.mirror, f, 0.84), n: f[5] })), { ...finger(X, h.mirror, R_THUMB, 0.86), n: 1 }];
      const L = Math.min(X(116), X(306)), Rr = Math.max(X(116), X(306)), mid = (L + Rr) / 2;
      const palm = `M${L + 14} 250 Q${mid} 228 ${Rr - 6} 262 Q${Rr + 8} 344 ${Rr - 26} 424 Q${mid} 462 ${L + 28} 426 Q${L - 6} 344 ${L + 14} 250 Z`;
      const shapes = [palm, ...parts.map((p) => p.d)];
      
      for (const d of shapes) mk('path', { d, fill: 'none', stroke: h.col, 'stroke-width': 14, 'stroke-linejoin': 'round', 'stroke-opacity': 0.92 }, g);
      for (const d of shapes) mk('path', { d, fill: '#1C1A20' }, g);
      for (const n of [5, 4, 3, 2, 1]) {                           
        const p = parts.find((x) => x.n === n), [x, y] = p.tip;
        mk('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 27, fill: '#FFFFFF', stroke: h.col, 'stroke-width': 5, class: 'mv2-hand-d', 'data-n': n,
          style: `transform-origin: ${x.toFixed(1)}px ${y.toFixed(1)}px` }, g);
        mk('text', { x: x.toFixed(1), y: (y + 11).toFixed(1), 'text-anchor': 'middle', 'font-size': 31, 'font-weight': 700, fill: '#1A1918', class: 'mv2-hand-n' }, g).textContent = String(n);
      }
      mk('text', { x: X(212), y: 548, 'text-anchor': 'middle', 'font-size': 36, 'font-weight': 600, fill: '#F3F4F6', class: 'mv2-hand-l' }, g).textContent = h.label;
    }
    return svg;
  }
  const iconBtn = (cls, icon, label) => { const b = el('button', cls); b.type = 'button'; b.innerHTML = icon; b.setAttribute('aria-label', label); b.title = label; return b; };
  function build(ctx) {
    const root = ctx.root;
    root.replaceChildren();
    root.className = ctx.shell ? 'mv2' : 'mv mv2';     
    const stage = el('div', 'mv2-stage');
    stage.setAttribute('role', 'region');
    stage.setAttribute('aria-label', 'Your lesson');
    const video = el('video', 'mv2-video');
    video.muted = true; video.playsInline = true; video.preload = 'auto'; video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    if (ctx.video) video.src = ctx.video;
    const ghost = el('div', 'mv2-ghost');               
    const hintTag = el('div', 'mv2-hint-tag', 'REFERENCE');    
    hintTag.hidden = true;
    const shade = el('div', 'mv2-shade');               
    const frame = el('div', 'mv2-frame');
    frame.hidden = true;
    const tab = el('div', 'mv2-tab');
    tab.hidden = true;
    const tabIcon = el('span', 'mv2-tab-ic'); tabIcon.innerHTML = ICON.speaker;
    const tabText = el('span', 'mv2-tab-t');
    tab.append(tabIcon, tabText);
    const pips = el('div', 'mv2-pips');
    pips.setAttribute('role', 'group'); pips.setAttribute('aria-label', 'The fixes');
    const scoreHost = el('div', 'mv2-score');
    const tags = el('div', 'mv2-tags');
    const stepTag = el('span', 'mv2-tag mv2-step');
    const barTag = el('button', 'mv2-tag mv2-bartag'); barTag.type = 'button';
    const label = el('span', 'mv2-tag mv2-label');
    const listen = el('span', 'mv2-tag mv2-listen');
    listen.innerHTML = ICON.speaker; listen.append(el('span', '', 'Listen'));
    const keep = el('span', 'mv2-tag mv2-keep', '✓ Already good');
    for (const t of [stepTag, barTag, label, listen, keep]) t.hidden = true;
    tags.append(stepTag, label, keep, listen, barTag);
    const sub = el('div', 'mv2-sub');
    sub.setAttribute('aria-live', 'polite');
    sub.hidden = true;
    const card = el('div', 'mv2-card');
    card.hidden = true;
    const cardN = el('div', 'mv2-card-n'), cardW = el('div', 'mv2-card-w');
    card.append(cardN, cardW);
    const fingers = el('section', 'mv2-fingers');
    fingers.hidden = true;
    fingers.setAttribute('aria-label', 'Finger numbers');
    fingers.append(el('h2', 'mv2-fingers-h', 'Finger numbers'), fingerFigure());
    const end = el('div', 'mv2-end');
    end.hidden = true;
    const poster = el('div', 'mv2-poster');
    const go = el('button', 'mv2-go'); go.type = 'button';
    go.innerHTML = ICON.play; go.append(el('span', '', 'Play the lesson'));
    poster.append(go);
    const bar = el('div', 'mv2-bar');
    const home = iconBtn('mv2-btn mv2-home', ICON.home, 'Home');
    
    const lib = el('button', 'mv2-lib');
    lib.type = 'button';
    lib.innerHTML = ICON.back;
    lib.append(el('span', 'mv2-lib-t', 'Library'));
    lib.setAttribute('aria-label', 'Back to the Library');
    lib.hidden = !ctx.shell;
    home.hidden = !!ctx.shell;
    const prev = iconBtn('mv2-btn mv2-prev', ICON.prev, 'Previous step');
    const play = iconBtn('mv2-btn mv2-play', ICON.play, 'Play');
    const next = iconBtn('mv2-btn mv2-next', ICON.next, 'Next step');
    const volBtn = iconBtn('mv2-btn mv2-vol', ICON.vol, 'Mute');
    const moreBtn = iconBtn('mv2-btn mv2-more', ICON.more, 'More');
    moreBtn.setAttribute('aria-haspopup', 'menu'); moreBtn.setAttribute('aria-expanded', 'false');
    const left = el('div', 'mv2-bar-l'), mid = el('div', 'mv2-bar-c'), right = el('div', 'mv2-bar-r');
    left.append(home); mid.append(prev, play, next); right.append(volBtn, moreBtn);
    bar.append(left, mid, right);
    const menu = el('div', 'mv2-menu');
    menu.setAttribute('role', 'menu'); menu.hidden = true;
    const techItem = el('button', 'mv2-menu-i', 'How this was measured'); techItem.type = 'button'; techItem.setAttribute('role', 'menuitem');
    const detItem = el('button', 'mv2-menu-i', 'The four-step analysis'); detItem.type = 'button'; detItem.setAttribute('role', 'menuitem');
    menu.append(techItem, detItem);
    const sheetEl = el('div', 'mv2-sheet');
    sheetEl.hidden = true;
    sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-modal', 'true');
    const sheetHead = el('div', 'mv2-sheet-h'), sheetTitle = el('h2', 'mv2-sheet-t', 'How this was measured');
    const sheetShut = el('button', 'mv2-sheet-x', 'Close'); sheetShut.type = 'button';
    sheetHead.append(sheetTitle, sheetShut);
    const sheetBody = el('div', 'mv2-sheet-b');
    sheetEl.append(sheetHead, sheetBody);
    sheetEl.setAttribute('aria-labelledby', 'mv2-sheet-t'); sheetTitle.id = 'mv2-sheet-t';
    stage.append(video, ghost, hintTag, shade, scoreHost, tags, sub, card, fingers, end, poster, frame, tab, pips, lib, bar, menu, sheetEl);
    
    
    const side = el('div', 'mv2-side'), sideT = el('p', 'mv2-side-t'), sideCard = el('div', 'mv2-side-card');
    side.hidden = !ctx.shell;
    side.append(sideT, sideCard);
    root.append(stage, side);
    
    
    if (ctx.shell) root.append(sub);
    return { stage, side, sideT, sideCard, video, ghost, hintTag, shade, frame, tab, tabText, pips, scoreHost, tags, stepTag, barTag, label, listen, keep, sub, card, cardN, cardW, fingers,
      end, poster, go, bar, home, lib, prev, play, next, volBtn, moreBtn, menu, techItem, detItem, sheetEl, sheetBody, sheetShut };
  }

  
  function scenesOf(me) {
    const v = me.view, out = [];
    const step = (f, kind) => (f.steps || []).find((s) => s && s.kind === kind) || null;
    out.push({ id: 'hook', kind: 'hook', role: 'you', lines: [v.hook && v.hook.line].filter(Boolean) });
    if (v.keep && num(v.keep.fromS) != null) out.push({ id: 'keep', kind: 'keep', role: 'you', lines: [v.keep.line].filter(Boolean) });
    for (const f of v.fixes) {
      const ex = step(f, 'explain'), yo = step(f, 'yours'), co = step(f, 'correct'), xr = step(f, 'exercise');
      out.push({ id: `f${f.n}.card`, kind: 'card', fix: f, role: null, lines: (ex && ex.lines) || [] });
      if (yo && num(yo.fromS) != null) {
        
        out.push({ id: `f${f.n}.hear`, kind: 'hear', fix: f, step: yo, role: 'you', lines: Array.isArray(yo.hear) ? yo.hear : [] });
        out.push({ id: `f${f.n}.yours`, kind: 'slow', fix: f, step: yo, role: 'you', lines: yo.lines || [] });
      }
      if (co) {
        const ls = co.lines || [];
        out.push({ id: `f${f.n}.signpost`, kind: 'signpost', fix: f, step: co, role: 'ref', lines: ls.slice(0, 1) });
        out.push({ id: `f${f.n}.correct`, kind: 'correct', fix: f, step: co, role: 'ref', lines: ls.slice(1) });
      }
      if (xr) out.push({ id: `f${f.n}.exercise`, kind: 'exercise', fix: f, step: xr, role: 'ref', lines: xr.lines || [] });
    }
    
    
    
    
    out.push({ id: 'film', kind: 'film', role: null, lines: [] });
    for (const s of out) s.lines = s.lines.filter((id) => me.lines.has(id));
    
    
    const k = out.findIndex((s) => fingerScene(me, s));
    if (k >= 0) {
      const f = out[k].fix, at = f ? out.findIndex((s) => s.fix === f) : k;
      out.splice(at >= 0 ? at : k, 0, { id: 'fingers', kind: 'fingers', role: null, lines: [FINGER_GUIDE.id], before: f ? f.n : null });
    }
    return out;
  }
  
  
  function paceOf(notes) {
    
    
    const all = Array.isArray(notes) ? notes : [], written = all.filter((n) => n && n[5]);
    const on = (written.length >= 3 ? written : all).map((n) => +(n && n[0])).filter(Number.isFinite).sort((a, b) => a - b);
    const heads = [];
    for (const t of on) if (!heads.length || t - heads[heads.length - 1] > 0.04) heads.push(t);
    const gaps = heads.slice(1).map((t, k) => t - heads[k]).sort((a, b) => a - b);
    if (!gaps.length) return 1;
    const med = gaps.length % 2 ? gaps[gaps.length >> 1] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
    return Math.max(PACE_MIN, Math.min(1, med / CLICK_S));
  }
  
  
  function fingerScene(me, s) {
    if (s.lines.some((id) => FINGER_WORDS.test((me.lines.get(id) || {}).text || ''))) return true;
    const f = s.fix;
    if (!f || !f.ghost || typeof f.ghost !== 'object' || f.ghost.fallback) return false;
    if (REF_SCENES.includes(s.kind)) return true;
    return s.kind === 'slow' && !!(s.step && s.step.hold) && (f.marks || []).some((m) => m && m.kind === 'correct' && Number.isInteger(m.midi));
  }
  
  function timetable(me, s) {
    const T = { says: [], notes: [], dur: 0, media: 0 };
    let at = LEAD_S;
    const lines = (from) => { at = from; for (const id of s.lines) { const d = lineDur(me, id); T.says.push({ id, at, end: at + d }); at += d + 0.2; } };
    const st = s.step;
    if (s.kind === 'hook') {
      const h = me.view.hook || {};
      T.media = Math.max(0, (num(h.toS) || 0) - (num(h.fromS) || 0));
      const wr = wrongOf(me.view.fixes || []);
      T.notes = (me.view.hook.notes || []).map((n) => ({ at: n[0], d: n[1], m: n[2], v: n[3], id: n[5], w: wr.has(n[5]) }));
      lines(LEAD_S);
      T.overviewAt = Math.max(T.media, at) + 0.1;
      T.dur = T.overviewAt + 1.2;
      return T;
    }
    if (s.kind === 'keep') {
      const k = me.view.keep, rate = 0.33;
      T.media = (k.toS - k.fromS) / rate;
      T.rate = rate;
      T.notes = (k.notes || []).map((n) => ({ at: n[0] / rate, d: n[1] / rate, m: n[2], v: n[3], id: n[5] }));
      lines(LEAD_S);
    } else if (s.kind === 'card') {
      lines(0.3);
      T.dur = Math.max(CARD_S, at - 0.2 + TAIL_S);
      return T;
    } else if (s.kind === 'hear') {
      
      
      lines(LEAD_S);
      T.lead = s.lines.length ? at : 0;
      T.media = st.toS - st.fromS;
      T.rate = 1;
      const wr = wrongOf([s.fix]);
      T.notes = (st.notes || []).map((n) => ({ at: T.lead + n[0], d: n[1], m: n[2], v: n[3], id: n[5], w: wr.has(n[5]) }));
      T.clock = (t) => st.fromS + Math.max(0, Math.min(T.media, t - T.lead));
      T.dur = T.lead + T.media + 0.5;
      return T;
    } else if (s.kind === 'slow') {
      const rate = num(st.rate) && st.rate > 0.1 ? st.rate : (num(me.view.slowRate) || 0.4);
      const hold = st.hold && num(st.hold.atS) != null ? st.hold : null;
      T.rate = rate;
      T.hold = hold ? { at: hold.atS / rate, s: num(hold.s) || 2, id: hold.noteId } : null;
      const shift = (a) => a / rate + (T.hold && a / rate > T.hold.at + 1e-3 ? T.hold.s : 0);
      T.media = (st.toS - st.fromS) / rate + (T.hold ? T.hold.s : 0);
      
      
      const heldHand = T.hold ? ((st.notes || []).find((n) => n[5] && n[5] === T.hold.id) || [])[4] : null;
      const inHold = (n) => !!(T.hold && Math.abs(n[0] / rate - T.hold.at) < 0.06 && (n[5] === T.hold.id || (heldHand && n[4] === heldHand)));
      const wr = wrongOf([s.fix]);
      T.notes = (st.notes || []).map((n) => ({ at: shift(n[0]), d: n[1] / rate + (inHold(n) ? T.hold.s : 0), m: n[2], v: n[3], id: n[5], w: wr.has(n[5]) }));
      T.clock = (t) => {                         
        let a = t;
        if (T.hold && t > T.hold.at) a = t < T.hold.at + T.hold.s ? T.hold.at : t - T.hold.s;
        return st.fromS + a * rate;
      };
      lines(LEAD_S);
    } else if (s.kind === 'signpost') {
      lines(LEAD_S);
      T.dur = Math.max(1.6, at - 0.2 + TAIL_S);
      return T;
    } else if (s.kind === 'correct') {
      const span = num(st.refToS) != null && num(st.refFromS) != null ? st.refToS - st.refFromS : (st.toS - st.fromS);
      
      
      const rate = num(st.rate) && st.rate > 0.1 ? Math.min(1, st.rate) : paceOf(st.notes);
      const ns = (st.notes || []).filter((n) => Array.isArray(n) && Number.isFinite(+n[0]));
      const first = ns.length ? Math.max(0, Math.min(...ns.map((n) => +n[0]))) : 0;
      const sc = (a) => (a <= first ? a : first + (a - first) / rate), un = (t) => (t <= first ? t : first + (t - first) * rate);
      T.rate = rate;
      
      const cue = s.lines.reduce((a, id) => a + lineDur(me, id) + 0.2, 0);
      const hold = st.hold && num(st.hold.atS) != null ? { at: sc(st.hold.atS), s: Math.max(num(st.hold.s) || 2.5, cue + 0.6), id: st.hold.noteId } : null;
      T.hold = hold;
      const shift = (a) => a + (hold && a > hold.at + 1e-3 ? hold.s : 0);
      T.media = sc(span) + (hold ? hold.s : 0);
      
      
      const heldHand = hold ? (ns.find((n) => n[5] && n[5] === hold.id) || [])[4] : null;
      T.notes = ns.map((n) => {
        const at = sc(+n[0]), held = !!(hold && Math.abs(at - hold.at) < 0.04 && (n[5] === hold.id || (heldHand && n[4] === heldHand)));
        return { at: shift(at), d: (+n[1] || 0.2) / rate + (held ? hold.s : 0), m: n[2], v: n[3], id: n[5] };
      });
      T.ref = (t) => { let a = t; if (hold && t > hold.at) a = t < hold.at + hold.s ? hold.at : t - hold.s; return (num(st.refFromS) || 0) + un(a); };
      lines(hold ? hold.at + 0.3 : sc(span) + 0.1);     
    } else if (s.kind === 'exercise') {
      
      const rate = Math.min(num(st.rate) && st.rate > 0.1 ? st.rate : 0.6, paceOf(st.notes));
      T.rate = rate;
      const ns = (st.notes || []).slice().sort((a, b) => a[0] - b[0]);
      const anyId = ns.some((n) => n[5]);
      const first = ns.length ? ns[0][0] : 0, last = ns.length ? ns[ns.length - 1][0] + ns[ns.length - 1][1] : 1;
      const holdId = st.hold && st.hold.noteId;
      const wn = anyId ? ns.filter((n) => n[5]) : ns;
      const gaps = wn.slice(1).map((n, k) => n[0] - wn[k][0]).filter((g) => g > 0.05).sort((a, b) => a - b);
      const clickS = (gaps.length ? gaps[gaps.length >> 1] : 0.4) / rate;
      const holdS = holdId ? (+st.hold.clicks || 3) * clickS : 0;
      
      const onePass = (last - first) / rate + holdS + clickS * 2;
      const passes = Math.max(1, Math.min(3, +st.passes || 1, Math.floor(EXERCISE_MAX_S / onePass)));
      
      const lead = Math.max(0.8, 2 * clickS + 0.2);
      let at0 = lead, t = at0;
      const groups = [];
      for (let p = 0; p < passes; p++) {
        let extra = 0;
        for (const n of ns) {
          const nAt = at0 + (n[0] - first) / rate + extra;
          const isHold = n[5] && n[5] === holdId;
          T.notes.push({ at: nAt, d: n[1] / rate + (isHold ? holdS : 0), m: n[2], v: n[3], id: n[5], r: n[0], tick: true, hold: isHold && holdS ? holdS : 0 });
          
          if ((n[5] || !anyId) && (!groups.length || Math.abs(groups[groups.length - 1] - nAt) > 0.04)) groups.push(nAt);
          if (isHold) extra += holdS;
          t = Math.max(t, nAt + n[1] / rate);
        }
        at0 = at0 + (last - first) / rate + extra + clickS * 2;
      }
      T.clicks = groups;
      
      T.clicks.unshift(Math.max(0.05, lead - 2 * clickS), Math.max(0.1, lead - clickS));
      T.media = t + 0.6;
      lines(LEAD_S);
    } else if (s.kind === 'fingers') {
      lines(0.5);
      T.dur = Math.max(5, at - 0.2 + TAIL_S + 0.4);
      return T;
    } else if (s.kind === 'film') {
      lines(0.6);
      T.dur = Math.max(2.5, at - 0.2 + TAIL_S);
      return T;
    }
    T.dur = Math.max(T.media, at - 0.2 + TAIL_S);
    return T;
  }

  
  function role(me, r) {
    me.frame.hidden = !r; me.tab.hidden = !r || !!me.ctx.shell;     
    me.frame.dataset.role = r || ''; me.tab.dataset.role = r || '';
    me.tabText.textContent = r === 'ref' ? 'REFERENCE' : r === 'you' ? 'YOU' : '';
    me.root.dataset.role = r || 'none';
  }
  function tags(me, s) {
    const f = s.fix;
    const show = (e, on, t) => { e.hidden = !on; if (on && t != null) { if (e === me.listen) return; e.textContent = t; } };
    const stepWord = { hear: 'Your version', slow: 'Your version', signpost: 'Correct version', correct: 'Correct version', exercise: f ? `Exercise ${f.n}` : '' }[s.kind] || '';
    
    const pills = !me.ctx.shell;
    show(me.stepTag, pills && !!stepWord, stepWord);
    show(me.barTag, pills && !!(f && stepWord), f ? barsWords(f.bars, false) : '');
    me.barTag.setAttribute('aria-label', f ? `${barsWords(f.bars)}: show the whole passage` : '');
    show(me.label, s.kind === 'hook' && !!str(me.view.piece && me.view.piece.label, 80), str(me.view.piece && me.view.piece.label, 80));
    show(me.keep, s.kind === 'keep');
    me.listen.hidden = s.kind !== 'hear' || !!(me.tt && me.tt.lead);      
    me.tags.hidden = !['hook', 'keep', 'hear', 'slow', 'signpost', 'correct', 'exercise'].includes(s.kind);
    if (me.ctx.shell) me.sideT.textContent = f ? str(f.cardTitle, 60) || str(f.title, 60) : '';
  }
  function pipStates(me) {
    const cur = me.scene && me.scene.fix ? me.scene.fix.n : null;
    const doneTo = me.scene ? me.doneTo : 0;
    me.pipEls.forEach((b, k) => {
      const n = k + 1;
      const state = n === cur ? (me.scene.kind === 'exercise' && me.sceneEnded ? 'done' : 'on') : n <= doneTo ? 'done' : 'off';
      b.dataset.state = state;
      b.setAttribute('aria-current', n === cur ? 'step' : 'false');
    });
    me.pips.hidden = !!me.ctx.shell || !me.view.fixes.length || (me.scene && me.scene.kind === 'hook' && me.t < (me.tt.overviewAt || 0));
  }
  function seekVideo(me, t) {
    const v = me.video;
    if (!v.src && !v.currentSrc) return;
    try { if (Math.abs(v.currentTime - t) > 0.04) v.currentTime = Math.max(0, t); } catch {   }
  }
  function videoPlay(me, rate) {
    const v = me.video;
    try { v.playbackRate = rate; } catch {   }
    if (me.paused) return;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }
  function mapRef(map, ref) {
    if (!Array.isArray(map) || map.length < 2) return null;
    let i = 1;
    while (i < map.length - 1 && map[i][0] < ref) i++;
    const [a0, b0] = map[i - 1], [a1, b1] = map[i];
    return b0 + (b1 - b0) * ((ref - a0) / Math.max(1e-6, a1 - a0));
  }
  async function mountGhost(me, s) {
    if (me.gst || me.ghostFor === s.fix.n) return;        
    const f = s.fix, G = window.MVGhostOverlay;
    me.ghostWhy = !G ? 'no ghost overlay on this page' : !f.ghost ? 'no recorded performance was sent for this fix' : null;
    if (me.ghostWhy) { me.ghost.dataset.state = 'none'; console.info(`Correct version for fix ${f.n} from the score only: ${me.ghostWhy}.`); return; }
    try {
      const res = me.res || {};
      const st = s.step || {};
      
      
      
      
      
      
      
      const target = (f.marks || []).find((m) => m && m.kind === 'correct' && Number.isInteger(m.midi));
      const base = target ? [{ midi: target.midi, kind: 'target', label: str(target.letter, 4) || undefined, clock: 'reference' }] : [];
      me.ghostMarks = { base, shown: 0, contact: ghostContact(me, s),
        rims: target && Array.isArray(target.landmark) ? target.landmark.filter((m) => Number.isInteger(m)).slice(0, 3) : [] };
      me.ghostFor = f.n;
      
      
      const r0 = num(st.refFromS);
      const notes = r0 == null ? [] : (st.notes || []).filter((n) => Array.isArray(n) && Number.isInteger(n[2]))
        .map((n) => [r0 + n[0], r0 + n[0] + n[1], n[2], n[4]]);
      me.ghost.dataset.mounting = '1';                    
      const ctl = await Promise.resolve(G.mount(me.video, { camera: (res.keyboard || {}).camera || null, ghost: f.ghost,
        toLearner: (res.reference || {}).toLearner || st.map || null, result: res, look: 'pale', sound: false, background: 'transparent',
        marks: base, notes, fitHost: !!me.ctx.shell, focus: panelKeys(me, f, st),
        map: st.map || null, fromS: st.fromS, toS: st.toS, refFromS: st.refFromS, refToS: st.refToS, host: me.ghost, fix: f.n }));
      
      if (V !== me || me.ghostFor !== f.n || !me.scene || me.scene.fix !== f || !REF_SCENES.includes(me.scene.kind)) {
        if (ctl && ctl.destroy) ctl.destroy();
        if (V === me && !me.gst) delete me.ghost.dataset.mounting;
        return;
      }
      me.gst = ctl || null;
      me.ghost.dataset.state = ctl ? 'on' : 'none';
      me.ghost.dataset.mode = (ctl && typeof ctl.mode === 'string' && ctl.mode) || '';
      me.root.dataset.ghost = me.ghost.dataset.mode;          
      delete me.ghost.dataset.mounting;
      me.lastRef = null;
    } catch (e) {
      delete me.ghost.dataset.mounting;
      me.ghost.dataset.state = 'none';
      console.info(`Correct version for fix ${s.fix.n} from the score only: the ghost overlay failed (${(e && e.message) || e}).`);
    }
  }
  
  function ghostContact(me, s) {
    const target = (s.fix.marks || []).find((m) => m && m.kind === 'correct' && Number.isInteger(m.midi));
    const tn = target && me.tt ? (me.tt.notes || []).find((n) => n.id === target.noteId) : null;
    return tn ? tn.at : null;
  }
  
  
  
  
  
  
  
  
  async function mountHint(me, s) {
    const f = s.fix, G = window.MVGhostOverlay, res = me.res || {};
    const tgt = (f.marks || []).find((m) => m && m.kind === 'correct' && Number.isInteger(m.midi));
    const wr = (f.marks || []).find((m) => m && m.kind === 'wrong' && Number.isInteger(m.midi));
    me.hintState = 'mounting';
    me.hintWhy = !G ? 'no ghost overlay on this page' : !f.ghost ? 'no recorded performance was sent for this fix' : !tgt ? 'no written key to show' : null;
    if (me.hintWhy) { me.hintState = 'none'; return; }
    const marks = [wr && { midi: wr.midi, kind: 'wrong', label: str(wr.letter, 4) || undefined, clock: 'reference' },
      { midi: tgt.midi, kind: 'target', label: str(tgt.letter, 4) || undefined, clock: 'reference' }].filter(Boolean);
    
    const co = (f.steps || []).find((x) => x && x.kind === 'correct') || {}, r0 = num(co.refFromS);
    const tn = (co.notes || []).find((n) => Array.isArray(n) && n[5] === tgt.noteId);
    const at = r0 == null ? null : r0 + (co.hold && num(co.hold.atS) != null ? co.hold.atS : tn ? +tn[0] : 0);
    const notes = r0 == null ? [] : (co.notes || []).filter((n) => Array.isArray(n) && Number.isInteger(n[2])).map((n) => [r0 + n[0], r0 + n[0] + n[1], n[2], n[4]]);
    let ctl = null;
    me.ghost.dataset.mounting = '1';                        
    try {
      ctl = await Promise.resolve(G.mount(me.video, { camera: (res.keyboard || {}).camera || null, ghost: f.ghost,
        toLearner: (res.reference || {}).toLearner || co.map || null, result: res, look: 'pale', sound: false, background: 'transparent',
        marks, notes, fitHost: !!me.ctx.shell, focus: panelKeys(me, f, co),
        map: co.map || null, fromS: co.fromS, toS: co.toS, refFromS: co.refFromS, refToS: co.refToS, host: me.ghost, fix: f.n }));
    } catch (e) { me.hintWhy = `the recorded hand could not be drawn (${(e && e.message) || e})`; ctl = null; }
    const gone = () => { if (ctl && ctl.destroy) { try { ctl.destroy(); } catch {   } } ctl = null; };
    if (V !== me || me.scene !== s || me.hintState !== 'mounting') { gone(); if (V === me && !me.hint) delete me.ghost.dataset.mounting; return; }
    
    if (ctl && ctl.mode === 'overlay') { me.hintWhy = 'the overlay chose the learner\'s footage'; gone(); }
    if (ctl) {
      if (at != null && typeof ctl.seek === 'function') { try { ctl.seek(at, { clock: 'reference' }); } catch {   } }
      me.hintAt = at;
      if (ctl.gate && Array.isArray(ctl.gate.why) && ctl.gate.why.length) me.hintWhy = ctl.gate.why.join('; ');
      me.root.dataset.ghost = ctl.mode;                     
    }
    delete me.ghost.dataset.mounting;
    if (!ctl) { me.hintState = 'none'; return; }
    me.hint = ctl; me.hintState = 'on'; me.hintMode = ctl.mode;
    
    
    const t = me.hintTag, low = ctl.mode !== 'overlay';
    const place = () => {
      if (me.hint !== ctl) return;
      const q = typeof ctl.keyQuad === 'function' ? ctl.keyQuad(tgt.midi, true) : null, layer = me.ghost.lastElementChild;
      if (q && q.length && layer) {
        const lr = layer.getBoundingClientRect(), sr = me.stage.getBoundingClientRect();
        t.style.left = `${lr.left - sr.left + q.reduce((a, p) => a + p[0], 0) / q.length}px`;
        t.style.top = `${lr.top - sr.top + (low ? Math.max(...q.map((p) => p[1])) : Math.min(...q.map((p) => p[1])))}px`;
        t.classList.toggle('at-key', !low); t.classList.toggle('under-key', low);
      } else { t.style.left = ''; t.style.top = ''; t.classList.remove('at-key', 'under-key'); }
    };
    place();
    requestAnimationFrame(() => requestAnimationFrame(place));     
    t.hidden = false;
  }
  
  
  function panelKeys(me, f, st) {
    if (!me.ctx.shell) return null;
    const hand = f.hand === 'R' || f.hand === 'L' ? f.hand : null;
    const ms = ((st && st.notes) || []).filter((n) => Array.isArray(n) && Number.isInteger(n[2]) && (!hand || n[4] === hand)).map((n) => n[2]);
    for (const m of f.marks || []) if (m && Number.isInteger(m.midi)) ms.push(m.midi);
    if (!ms.length) return null;
    let lo = Math.min(...ms) - 2, hi = Math.max(...ms) + 2;
    if (hi - lo < 18) { const c = (lo + hi) / 2; lo = Math.round(c - 9); hi = Math.round(c + 9); }
    return [Math.max(21, lo), Math.min(108, hi)];
  }
  function unmountHint(me) {
    if (me.hint) { try { me.hint.destroy(); } catch {   } }
    if (me.hint && me.hintMode && me.hintMode !== 'overlay' && !me.gst) delete me.root.dataset.ghost;
    me.hint = null; me.hintMode = null;
    me.hintState = me.hintState === 'none' ? 'none' : 'done';
    me.hintTag.hidden = true;
  }
  
  function ghostRims(me, t) {
    const gm = me.ghostMarks;
    if (!me.gst || !gm || !gm.rims.length || gm.contact == null || typeof me.gst.setMarks !== 'function') return;
    const due = gm.rims.filter((_, k) => t >= gm.contact + RIM_STEP_S * k).length;
    if (due === gm.shown) return;
    gm.shown = due;
    try { me.gst.setMarks([...gm.base, ...gm.rims.slice(0, due).map((m) => ({ midi: m, kind: 'landmark', clock: 'reference' }))]); } catch {   }
  }
  function unmountGhost(me) {
    if (me.gst) { try { (me.gst.destroy || me.gst.unmount || (() => {})).call(me.gst); } catch {   } }
    me.gst = null;
    me.ghostMarks = null;
    me.ghostFor = null;
    delete me.root.dataset.ghost;
    me.ghost.dataset.state = '';
    me.ghost.dataset.mode = '';
  }
  
  function litTimes(T) {
    const ons = [...new Set(T.notes.map((n) => n.at))].sort((a, b) => a - b);
    for (const n of T.notes) {
      const nx = ons.find((a) => a > n.at + 0.04);
      n.lit = Math.max(0.2, Math.min(1.2, nx != null ? nx - n.at : n.d || 0.35));
    }
  }
  
  function revealMarks(me, x) {
    const sc = me.score;
    if (!sc || !me.pendingMarks || !me.pendingMarks.length) return;
    const due = me.pendingMarks.filter((m) => { const mx = sc.noteX(m.noteId); return mx != null && x != null && x >= mx - 2; });
    if (!due.length) return;
    me.shownMarks = [...(me.shownMarks || []).filter((m) => !due.includes(m)), ...due];
    me.pendingMarks = me.pendingMarks.filter((m) => !due.includes(m));
    sc.marks(me.shownMarks);
    if (due.some((m) => m.kind === 'stop')) sc.badge(true);
  }
  
  
  function enter(me, i, natural = false) {
    cheerStop(me);                                     
    const s = me.scenes[i];
    leave(me, !natural, !!(s.fix && REF_SCENES.includes(s.kind) && me.ghostFor === s.fix.n));
    me.lastRef = null;
    me.si = i; me.scene = s; me.t = 0; me.sceneEnded = false;
    me.tt = timetable(me, s);
    litTimes(me.tt);
    me.fired = new Set(); me.saidHere = new Set(); me.ducked = new Set(); me.lastSeek = 0; me.lastClick = -1; me.cue = null; me.sayCues = [];
    me.shownMarks = [];                          
    me.root.dataset.scene = s.kind;
    me.root.dataset.sceneId = s.id;
    role(me, s.role);
    tags(me, s);
    showSub(me, '');
    me.card.hidden = s.kind !== 'card';
    me.fingers.hidden = s.kind !== 'fingers';
    me.end.hidden = s.kind !== 'film';
    me.shade.dataset.on = ['card', 'fingers', 'film'].includes(s.kind) ? '1' : '';
    me.root.classList.toggle('ref', s.role === 'ref');
    const sc = me.score;
    if (sc) {
      sc.el.hidden = ['fingers', 'film'].includes(s.kind);
      sc.dim(s.kind === 'card');
      sc.clearTicks(); sc.hold(null); sc.badge(false);
      sc.marks([]);
      sc.playhead(null);
      if (s.kind === 'hook') { sc.pins('drop'); sc.follow(sc.timeToX(num(me.view.hook.fromS) || 0)); }
      else if (s.kind === 'card') { sc.pins('shown'); sc.overview(true); }
      else if (s.kind === 'keep') sc.focus({ window: me.view.keep.window || {} }, true);
      else if (s.fix) {
        
        
        sc.pins('hidden');
        
        const ks = typeof sc.kOf === 'function' ? ((s.step && s.step.notes) || []).map((n) => (n && n[5] ? sc.kOf(n[5]) : null)).filter((k) => k != null) : [];
        
        
        const play = ((s.step && s.step.notes) || []).map((n) => (n && n[5]) || null).filter(Boolean);
        sc.focus(ks.length ? { ...s.fix, see: [Math.min(...ks), Math.max(...ks)], play } : s.fix, true);
      }
    }
    const f = s.fix;
    if (s.kind === 'card') {
      me.cardN.textContent = String(f.n);
      
      const words = str(f.cardTitle, 60) || str(f.title, 60), not = /^(.+), not (.+)$/.exec(words);
      me.cardW.replaceChildren(...(not ? [document.createTextNode(`${not[1]}, not `), el('span', 'mv2-card-dim', not[2])] : [document.createTextNode(words)]));
      me.card.classList.remove('in'); void me.card.offsetWidth; me.card.classList.add('in');
    }
    if (s.kind === 'film') { endView(me); cheerPlay(me); }
    
    const v = me.video;
    v.classList.toggle('dim', s.role === 'ref');
    if (s.kind === 'hook') { seekVideo(me, num(me.view.hook.fromS) || 0); videoPlay(me, 1); }
    else if (s.kind === 'keep') { seekVideo(me, me.view.keep.fromS); videoPlay(me, me.tt.rate); }
    else if (s.kind === 'hear') { seekVideo(me, s.step.fromS); if (!me.tt.lead) videoPlay(me, 1); else me.video.pause(); }
    else if (s.kind === 'slow') { seekVideo(me, s.step.fromS); videoPlay(me, me.tt.rate); }
    else { v.pause(); if (s.step && num(s.step.fromS) != null) seekVideo(me, s.step.fromS); }
    if (REF_SCENES.includes(s.kind)) {
      mountGhost(me, s);
      const gm = me.ghostMarks;                  
      if (gm) {
        gm.contact = ghostContact(me, s);
        if (gm.shown && me.gst && typeof me.gst.setMarks === 'function') { try { me.gst.setMarks(gm.base.slice()); } catch {   } }
        gm.shown = 0;
      }
    }
    
    
    
    
    
    
    const cue = s.lines.some((id) => FINGER_WORDS.test((me.lines.get(id) || {}).text || ''));
    const fingered = (ms) => ms.map((m) => (m && m.finger != null && !cue ? { ...m, finger: null } : m));
    if (sc && s.kind === 'slow' && s.fix) me.pendingMarks = fingered((s.fix.marks || []).slice());
    else if (sc && (s.kind === 'correct' || s.kind === 'exercise') && s.fix) me.pendingMarks = fingered((s.fix.marks || []).filter((m) => m.kind === 'correct'));
    else me.pendingMarks = null;
    if (sc && s.kind === 'signpost') sc.playhead(firstX(me, s));
    if (sc) { sc.past(s.kind === 'hook'); if (typeof sc.drawNow === 'function') sc.drawNow(); }
    cardFit(me);
    pipStates(me);
    renderBar(me);
    me.stepAt = performance.now();
  }
  
  
  function cardFit(me) {
    if (!me.ctx.shell) return;
    const sc = me.score, h = sc && typeof sc.fitHeight === 'function' ? sc.fitHeight() : null;
    const u = parseFloat(getComputedStyle(me.scoreHost).getPropertyValue('--u')) || me.stage.getBoundingClientRect().width / 1080 || 0.36;
    const H = h ? Math.max(160 * u, Math.min(470 * u, h)) : 470 * u;
    me.scoreHost.style.height = h ? `${H}px` : '';
    
    const b = sc && !me.scoreHost.hidden && !sc.el.hidden && me.scoreHost.parentNode === me.stage ? me.scoreHost.offsetTop + H : 0;
    me.stage.style.setProperty('--card-b', `${b}px`);
  }
  
  
  
  
  const SIDE_MIN = 150, SIDE_MAX = 520, CARD_TALL = 0.45, SIDE_HEAD = 110;
  function fitShell(me) {
    const r = me.root.getBoundingClientRect(), s = me.stage.getBoundingClientRect();
    const room = Math.min(SIDE_MAX, s.left - r.left - 64, (r.height - SIDE_HEAD) / CARD_TALL);
    const beside = room >= SIDE_MIN;
    me.root.classList.toggle('side-on', beside);
    me.root.style.setProperty('--side-w', `${Math.max(0, room)}px`);
    if (beside && me.scoreHost.parentNode !== me.sideCard) me.sideCard.append(me.scoreHost);
    if (!beside && me.scoreHost.parentNode !== me.stage) me.stage.insertBefore(me.scoreHost, me.tags);
    if (beside) me.scoreHost.style.setProperty('--u', `${room / 900}px`); else me.scoreHost.style.removeProperty('--u');
  }
  function firstX(me, s) {
    const n = (s.step && s.step.notes || []).find((x) => x[5] && me.score && me.score.noteX(x[5]) != null);
    return n ? me.score.noteX(n[5]) : null;
  }
  
  
  function leave(me, hard = true, keepGhost = false) {
    if (!me.scene) return;
    voiceStop(me);
    if (hard) stopPiano();
    if (!keepGhost) unmountGhost(me);
    unmountHint(me);
    me.hintState = null; me.hintWhy = null;
    me.video.pause();
    me.scene = null;
  }
  
  function tick(me, t) {
    const s = me.scene, T = me.tt, sc = me.score;
    if (!s) return;
    
    for (const x of T.says) {
      if (t >= x.at && !me.saidHere.has(x.id)) { me.saidHere.add(x.id); voiceStart(me, x.id, x); }
    }
    for (const c of me.sayCues || []) if (!c.done && t >= c.at) { c.done = true; if (c.at > t - 0.6) sayCue(me, c); }
    if (me.cue && me.cue.shown === 0 && t >= me.cue.at + (me.cue.end - me.cue.at) * me.cue.split) { me.cue.shown = 1; showSub(me, me.cue.cues[1]); }
    if (me.voiceUntil != null && me.pack && me.pack.audio.currentTime >= me.voiceUntil) voiceStop(me);
    duckLines(me, s, t);
    
    for (let k = 0; k < T.notes.length; k++) {
      const n = T.notes[k];
      if (me.fired.has(k) || n.at > t + 0.06) continue;
      me.fired.add(k);
      if (n.at < t - 0.25) continue;                 
      playNote(me, n.m, n.v, n.at - t, n.d);
      
      
      if (sc && n.id) {
        const lit = (n.lit || 0.35) / (me.rate || 1);
        setTimeout(() => { if (V === me && me.scene === s) { sc.sound(n.id, !!n.tick, lit, n.w ? 'wrong' : 'sounding'); if (s.kind === 'exercise') sc.played(n.id); } }, Math.max(0, (n.at - t) * 1000 / (me.rate || 1)));
      }
      if (s.kind === 'exercise' && n.hold && sc) { sc.hold(n.id); setTimeout(() => { if (V === me && me.scene === s && me.score) me.score.hold(null); }, n.hold * 1000 + 300); }
    }
    
    if (T.clicks) for (let k = 0; k < T.clicks.length; k++) if (T.clicks[k] <= t && k > me.lastClick) { me.lastClick = k; click(me); }
    
    if (s.kind === 'hook') {
      const w = (num(me.view.hook.fromS) || 0) + Math.min(t, T.media);
      if (t > T.media) me.video.pause(); else syncVideo(me, w, 1);
      if (sc) {
        const x = sc.timeToX(w);
        if (t < T.overviewAt) {
          sc.follow(x);
          for (const f of me.view.fixes) {
            const ax = f.anchor && f.anchor.noteId ? sc.noteX(f.anchor.noteId) : null;
            if (ax != null && x != null && x >= ax - 4) sc.dropPin(f.n);
          }
        } else if (!me.overviewed) {
          me.overviewed = true;
          for (const f of me.view.fixes) sc.dropPin(f.n);
          sc.overview(true); sc.pins('shown');
          pipStates(me);
        }
        sc.playhead(x);
      }
    } else if (s.kind === 'keep' || s.kind === 'hear' || s.kind === 'slow') {
      const from = s.kind === 'keep' ? me.view.keep.fromS : s.step.fromS;
      const w = T.clock ? T.clock(t) : from + Math.min(t, T.media) * (T.rate || 1);
      const held = T.hold && t > T.hold.at && t < T.hold.at + T.hold.s, lead = T.lead || 0;
      if (s.kind === 'slow' && T.hold) {
        if (held && !me.hintState) mountHint(me, s);
        
        else if (held && me.hint && me.hintAt != null && typeof me.hint.seek === 'function') {
          try { me.hint.seek(me.hintAt, { clock: 'reference' }); } catch {   }
        }
        else if (!held && me.hintState && me.hintState !== 'none' && t >= T.hold.at + T.hold.s) unmountHint(me);
      }
      if (held || t < lead || t > lead + T.media) { if (!me.video.paused) me.video.pause(); seekVideo(me, w); }
      else syncVideo(me, w, T.rate || 1);
      if (lead && t >= lead && me.listen.hidden) { me.listen.hidden = false; showSub(me, ''); }   
      if (sc) {
        const x = sc.timeToX(w);
        sc.playhead(x);
        revealMarks(me, x);
      }
    } else if (s.kind === 'signpost') {
      
      
      const r0 = num((s.step || {}).refFromS);
      if (me.gst && typeof me.gst.seek === 'function' && r0 != null && me.lastRef !== r0) {
        me.lastRef = r0;
        try { me.gst.seek(r0, { clock: 'reference' }); } catch {   }
      }
    } else if (s.kind === 'correct' || s.kind === 'exercise') {
      const st = s.step || {};
      
      let ref = null;
      if (T.ref) ref = T.ref(t);
      else if (num(st.refFromS) != null) {
        const done = T.notes.filter((n) => n.at <= t), n0 = done[done.length - 1], n1 = T.notes.find((n) => n.at > t);
        if (n0 && n1 && n1.at > n0.at) ref = st.refFromS + n0.r + (n1.r - n0.r) * Math.min(1, (t - n0.at) / (n1.at - n0.at));
        else if (n0 || n1) ref = st.refFromS + (n0 || n1).r;
      }
      const w = ref != null ? mapRef(st.map, ref) : null;
      const now = performance.now();
      
      
      const showsTake = !me.gst || me.gst.mode === 'overlay';
      if (w != null && showsTake && now - me.lastSeek > 90) { me.lastSeek = now; seekVideo(me, w); }
      
      if (me.gst && typeof me.gst.seek === 'function' && ref != null && (me.lastRef == null || Math.abs(ref - me.lastRef) > 1e-3)) {
        me.lastRef = ref;
        try { me.gst.seek(ref, { clock: 'reference' }); } catch {   }
      }
      ghostRims(me, t);
      if (sc) {
        const done = T.notes.filter((n) => n.id && n.at <= t);
        const last = done[done.length - 1], nxt = T.notes.find((n) => n.id && n.at > t);
        const lx = last ? sc.noteX(last.id) : null, nx = nxt ? sc.noteX(nxt.id) : null;
        if (lx != null && nx != null && nxt.at > last.at) sc.playhead(lx + (nx - lx) * Math.min(1, (t - last.at) / (nxt.at - last.at)));
        else sc.playhead(lx != null ? lx : (nx != null ? nx : null));
        if (lx != null) revealMarks(me, lx);
      }
    }
  }
  function syncVideo(me, target, rate) {
    const v = me.video;
    if (me.paused) return;
    if (v.paused) { seekVideo(me, target); videoPlay(me, rate); return; }
    if (Math.abs(v.playbackRate - rate) > 0.01) { try { v.playbackRate = rate; } catch {   } }
    if (Math.abs(v.currentTime - target) > 0.3) seekVideo(me, target);
  }

  
  function loop(me) {
    if (V !== me) return;
    const now = performance.now();
    const dt = Math.min(0.25, (now - (me.lastFrame || now)) / 1000) * (me.rate || 1);
    me.lastFrame = now;
    if (me.mode === 'lesson' && !me.paused && me.scene) {
      me.t += dt;
      tick(me, me.t);
      if (me.t >= me.tt.dur) {
        if (me.scene.fix && me.scene.kind === 'exercise') me.doneTo = Math.max(me.doneTo, me.scene.fix.n);
        me.sceneEnded = true;
        if (me.si + 1 < me.scenes.length) enter(me, me.si + 1, true);
        else finish(me);
      }
    }
    me.raf = requestAnimationFrame(() => loop(me));
  }
  function start(me, i = 0) {
    me.poster.hidden = true;
    me.mode = 'lesson';
    me.paused = false;
    if (me.si !== i || !me.scene) enter(me, i);
    renderBar(me);
  }
  function finish(me) {
    
    me.mode = 'end';
    me.paused = false;
    voiceStop(me);
    me.video.pause();
    cheerPlay(me);
    me.doneTo = me.view.fixes.length;
    pipStates(me);
    renderBar(me);
  }
  function pause(me) {
    if (me.mode !== 'lesson' || me.paused) return;
    me.paused = true;
    me.video.pause();
    stopPiano();
    if (me.pack) { try { me.pack.audio.pause(); } catch {   } }
    if (me.guide) { try { me.guide.audio.pause(); } catch {   } }
    renderBar(me);
  }
  function resume(me) {
    if (me.mode !== 'lesson' || !me.paused) return;
    me.paused = false;
    const s = me.scene;
    const lead = (me.tt && me.tt.lead) || 0;
    if (s && ['hook', 'keep', 'hear', 'slow'].includes(s.kind) && me.t >= lead && me.t < lead + me.tt.media) videoPlay(me, me.tt.rate || 1);
    if (me.pack && me.voiceUntil != null) { const p = me.pack.audio.play(); if (p && p.catch) p.catch(() => {}); }
    if (me.guide && me.guide.playing && !me.guide.audio.ended) { const p = me.guide.audio.play(); if (p && p.catch) p.catch(() => {}); }
    
    
    for (const k of [...me.fired]) { const n = me.tt.notes[k]; if (n && n.at > me.t - 0.05) me.fired.delete(k); }
    if (me.ducked) me.ducked.clear();
    renderBar(me);
  }
  function jump(me, i) {
    i = Math.max(0, Math.min(me.scenes.length - 1, i));
    const s = me.scenes[i];
    
    me.doneTo = s.fix ? s.fix.n - 1 : s.before ? s.before - 1 : s.kind === 'film' ? me.view.fixes.length : 0;
    me.overviewed = false;
    if (me.mode !== 'lesson') { me.mode = 'lesson'; me.poster.hidden = true; }
    me.paused = false;
    enter(me, i);
  }
  const sceneIndex = (me, id) => me.scenes.findIndex((s) => s.id === id);
  function goFix(me, n) { const i = sceneIndex(me, `f${n}.card`); if (i >= 0) jump(me, i); }
  
  
  
  
  const AT_START_S = 1.5;
  function prevStep(me) {
    if (me.mode === 'idle' || !me.scene) return start(me, 0);
    if (me.mode === 'end') return jump(me, me.si - 1);
    jump(me, me.t > AT_START_S ? me.si : me.si - 1);
  }
  function nextStep(me) {
    if (me.mode === 'idle' || !me.scene) return start(me, 0);
    if (me.mode === 'end') return;
    if (me.si + 1 < me.scenes.length) jump(me, me.si + 1); else finish(me);
  }

  
  function endView(me) {
    me.end.replaceChildren();
    
    let chart = null;
    if (typeof me.ctx.endChart === 'function') {
      try { chart = me.ctx.endChart(me.res); } catch (e) { console.info(`The end shows no chart: ${(e && e.message) || e}.`); chart = null; }
    }
    me.end.classList.toggle('chart', !!(chart && chart.nodeType === 1));
    
    
    const slot = chart && chart.nodeType === 1 && chart.querySelector ? chart.querySelector('.bn-acts') : null;
    me.end.classList.toggle('bento', !!slot);
    if (slot && me.end.parentNode !== me.root) me.root.append(me.end);
    if (chart && chart.nodeType === 1) { if (!slot) me.end.append(el('p', 'mv2-end-h', 'Nice work!')); me.end.append(chart); }
    
    const again = el('button', slot ? 'btn btn-primary btn-lg mv2-again' : 'mv2-again', slot ? 'Play the lesson again' : 'Replay lesson');
    again.type = 'button';
    again.addEventListener('click', () => jump(me, 0));
    if (slot) slot.append(again);
    else { const row = el('div', 'mv2-end-row'); row.append(again); me.end.append(row); }
    if (!me.ctx.shell) me.end.append(el('p', 'mv2-mark', 'MUSEVERSE'));
  }

  
  function renderBar(me) {
    const playing = me.mode === 'lesson' && !me.paused;
    me.play.innerHTML = playing ? ICON.pause : ICON.play;
    me.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    me.play.title = playing ? 'Pause' : 'Play';
    me.volBtn.innerHTML = me.vol > 0 ? ICON.vol : ICON.mute;
    me.volBtn.setAttribute('aria-label', me.vol > 0 ? 'Mute' : 'Sound on');
    me.prev.disabled = me.mode === 'idle';
    me.next.disabled = me.mode === 'idle';
  }
  function onPlay(me) {
    if (me.mode === 'idle') return start(me, 0);
    if (me.mode === 'end') return jump(me, 0);
    if (me.paused) resume(me); else pause(me);
  }
  function setVolume(me, v) {
    me.vol = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(VOL_KEY, String(me.vol)); } catch {   }
    pianoCall('setVolume', me.vol);                  
    if (me.vol <= 0) { voiceStop(me); stopPiano(); }
    renderBar(me);
  }
  function menuOpen(me, open) {
    me.menu.hidden = !open;
    me.moreBtn.setAttribute('aria-expanded', String(open));
  }
  function sheet(me, open) {
    if (!open) {
      me.sheetEl.hidden = true;
      if (me.sheetPaused) resume(me);
      me.sheetPaused = false;
      return;
    }
    me.sheetPaused = me.mode === 'lesson' && !me.paused;
    if (me.sheetPaused) pause(me);
    me.sheetBody.replaceChildren(techView(me));
    me.sheetEl.hidden = false;
    me.sheetBody.scrollTop = 0;
    try { me.sheetShut.focus({ preventScroll: true }); } catch {   }
  }

  
  
  
  
  const modelName = (m) => {
    const x = str(m, 80).toLowerCase();
    return x.includes('wonder') ? 'Muse Wonder' : x.includes('spark-open') ? 'Muse Spark Open' : x.includes('spark') ? 'Muse Spark'
      : x.includes('glimmer') ? 'Muse Glimmer' : x.includes('sam') ? 'SAM 3.1' : x.includes('transcribe') ? 'Muse Voice Transcribe' : str(m, 80);
  };
  const PROVIDER = { meta: 'on Meta', openrouter: 'through OpenRouter', self: 'on our own server', open: 'on the open-weights host' };
  const whereRan = (p) => PROVIDER[str(p, 40)] || (str(p, 40) ? `on ${str(p, 40)}` : '');
  const PURPOSE = { judge: 'chose what to teach', plan: 'wrote the practice week', word: 'worded the findings', 'lesson-lines': "worded the lesson's lines",
    chat: 'answered a question', tip: 'chose a filming tip', exercise: 'chose the exercises', segment: 'found the hands and the keyboard' };
  const OCTAVE_FROM = { fingertips: 'your fingertips on the keys you struck', 'keyboard-end': 'an end of the keyboard in the video',
    notes: 'the notes heard', video: 'the video (an end of the keyboard was seen)', audio: 'the sound', unknown: 'not settled', none: 'not settled' };
  const MEASURE_STATE = { steady: 'Steady', 'work-on-it': 'Work on it', 'not-measured': 'Not measured this time' };
  function measuresOf(res) {
    const M = res && res.lesson && Array.isArray(res.lesson.measures) ? res.lesson.measures : [];
    return M.filter((m) => m && typeof m === 'object' && str(m.name, 60)).slice(0, 6).map((m) => ({
      id: str(m.id, 30), name: str(m.name, 60), state: MEASURE_STATE[m.state] ? m.state : 'not-measured', words: str(m.words, 160),
      evidence: m.evidence && typeof m.evidence === 'object' ? m.evidence : null }));
  }
  function vitals(res) {
    const st = (res.summary || {}).stats || {}, out = [];
    const notes = num(st.notes) ?? (Array.isArray(res.notes) ? res.notes.length : null);
    if (notes != null) out.push({ big: String(notes), small: 'notes heard' });
    if (num(st.notesPerS) != null) out.push({ big: (+st.notesPerS).toFixed(1), unit: '/s', small: 'pace' });
    if (num(st.handsSeenShare) != null) out.push({ big: String(Math.round(st.handsSeenShare * 100)), unit: '%', small: 'hands in view' });
    const kb = res.keyboard || {};
    if (num(kb.framesLocked) != null && num(kb.framesTotal)) out.push({ big: String(Math.round(kb.framesLocked / kb.framesTotal * 100)), unit: '%', small: 'keyboard found' });
    return out.slice(0, 5);
  }
  const fmtNum = (v) => (Number.isInteger(v) ? String(v) : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));
  function fmtVal(v, depth = 0) {
    if (v == null) return '-';
    if (typeof v === 'number') return Number.isFinite(v) ? fmtNum(v) : '-';
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    if (typeof v === 'string') return str(v, 160);
    if (Array.isArray(v)) return v.slice(0, 12).map((x) => fmtVal(x, depth + 1)).join(', ') + (v.length > 12 ? ', ...' : '');
    if (typeof v === 'object' && depth < 2) return Object.entries(v).slice(0, 10).map(([k, x]) => `${k}: ${fmtVal(x, depth + 1)}`).join(', ');
    return '...';
  }
  function techRows(dl, rows) {
    for (const [k, v] of rows) {
      if (v == null || v === '') continue;
      dl.append(el('dt', '', k), el('dd', '', typeof v === 'string' ? v : fmtVal(v)));
    }
  }
  function techView(me) {
    const res = me.res, box = el('div', 'mv-tech');
    const part = (title) => { const s = el('section', 'mv-tech-sec'); s.append(el('h3', '', title)); box.append(s); return s; };
    box.append(el('p', 'mv-tech-lead', 'The numbers behind this lesson, for anyone who wants to check them. The lesson itself speaks in words.'));
    const ms = measuresOf(res);
    if (ms.length) {
      const s = part('The measures');
      for (const m of ms) {
        const dl = el('dl', 'mv-tech-dl');
        dl.dataset.id = m.id;
        techRows(dl, [[m.name, MEASURE_STATE[m.state]], ...Object.entries(m.evidence || {}).map(([k, v]) => [k, v])]);
        s.append(dl);
      }
    }
    const v = vitals(res);
    if (v.length) {
      const dl = el('dl', 'mv-tech-dl');
      techRows(dl, v.map((x) => [x.small, `${x.big}${x.unit ? (x.unit === '%' ? '%' : ` ${x.unit}`) : ''}`]));
      part('The take').append(dl);
    }
    samView(me, box);
    handCheckView(res, box);
    const an = (res && res.analysis) || {};
    const oc = an.octave && typeof an.octave === 'object' ? an.octave : null;
    if (oc) {
      const dl = el('dl', 'mv-tech-dl');
      const known = { shift: 'Octave shift', rule: 'Decided by', source: 'From', votes: 'Votes' };
      const val = (k) => (k === 'shift' && num(oc.shift) != null ? `${oc.shift > 0 ? '+' : ''}${oc.shift}` : k === 'source' && OCTAVE_FROM[oc.source] ? OCTAVE_FROM[oc.source] : oc[k]);
      techRows(dl, [...Object.keys(known).filter((k) => oc[k] != null).map((k) => [known[k], val(k)]), ...Object.entries(oc).filter(([k]) => !(k in known))]);
      part('The octave').append(dl);
    }
    const stops = Array.isArray(an.stops) ? an.stops.filter((x) => x && typeof x === 'object').slice(0, 20) : [];
    if (stops.length) {
      const ul = el('ul', 'mv-tech-list');
      for (const x of stops) {
        
        const kind = str(x.kind, 20) && str(x.kind, 20) !== 'stop' ? str(x.kind, 20) : 'pause';
        ul.append(el('li', '', `${Number.isFinite(+x.bar) ? barWord(+x.bar) : 'At ' + mmss((num(x.t) || 0) + clipOf(res))}: a ${kind} of ${fmtVal(num(x.gapS))} s`
          + (num(x.refGapS) != null ? ` where the pianist takes ${fmtVal(num(x.refGapS))} s` : '')));
      }
      part('Pauses, against the reference').append(ul);
    }
    const rf = (res && res.reference) || {}, info = rf.toLearnerInfo && typeof rf.toLearnerInfo === 'object' ? rf.toLearnerInfo : {};
    const tl = Array.isArray(rf.toLearner) ? rf.toLearner.filter((p) => Array.isArray(p) && p.length >= 2) : [];
    if (tl.length >= 2) {
      const dl = el('dl', 'mv-tech-dl'), c = clipOf(res);
      techRows(dl, [['Anchors', num(info.anchors)], ['Set aside', num(info.dropped) ? info.dropped : null],
        ['Pianist', `${fmtVal(+tl[0][0])} to ${fmtVal(+tl[tl.length - 1][0])} s`], ['You', `${fmtVal(+tl[0][1] + c)} to ${fmtVal(+tl[tl.length - 1][1] + c)} s`]]);
      part('The pianist, re-timed to your playing').append(dl);
    } else if (str(info.why, 200)) {
      part('The pianist, re-timed to your playing').append(el('p', 'mv-tech-none', `Not re-timed: ${str(info.why, 200)}.`));
    }
    const calls = Array.isArray(res && res.modelCalls) ? res.modelCalls.filter((c) => c && typeof c === 'object') : [];
    const s = part(calls.length && calls.every((c) => c.provider === 'meta') ? 'Meta models in this lesson' : 'Models in this lesson');
    if (calls.length) {
      const groups = new Map();
      for (const c of calls) {
        const k = `${str(c.provider, 40)}|${str(c.model, 80)}|${str(c.purpose, 40)}`;
        const g = groups.get(k) || { provider: c.provider, model: c.model, purpose: c.purpose, n: 0, ms: 0, used: 0, fell: 0, failed: 0, tin: 0, tout: 0, usd: 0, money: false };
        g.n++; g.ms += num(c.ms) || 0;
        if (c.ok === false && c.used !== 'fallback') g.failed++;
        else if (c.used === 'fallback') g.fell++; else g.used++;
        g.tin += num(c.tokensIn) || 0; g.tout += num(c.tokensOut) || 0;
        if (num(c.usd) != null) { g.usd += c.usd; g.money = true; }
        groups.set(k, g);
      }
      const ul = el('ul', 'mv-tech-models');
      for (const g of groups.values()) {
        const li = el('li', 'mv-tech-model');
        li.dataset.model = str(g.model, 80); li.dataset.purpose = str(g.purpose, 40); li.dataset.provider = str(g.provider, 40);
        const said = [g.used ? `${g.used} used` : '', g.fell ? `${g.fell} fell back to the fixed wording` : '', g.failed ? `${g.failed} failed` : ''].filter(Boolean).join(', ');
        const w = whereRan(g.provider);
        li.append(el('b', '', `${modelName(g.model)}${w ? `, ${w}` : ''}`), el('span', 'mv-tech-what', PURPOSE[g.purpose] || str(g.purpose, 40) || 'a call'),
          el('span', 'mv-tech-how', `${g.n} ${g.n === 1 ? 'call' : 'calls'}, ${(g.ms / 1000).toFixed(1)} s${said ? `: ${said}` : ''}`
            + (g.tin || g.tout ? `; ${Math.round(g.tin)} tokens in, ${Math.round(g.tout)} out` : '') + (g.money ? `; $${g.usd.toFixed(4)}` : '')));
        ul.append(li);
      }
      s.append(ul);
    } else s.append(el('p', 'mv-tech-none', 'This result does not list its model calls.'));
    const mt = me.ctx.models && typeof me.ctx.models === 'object' ? Object.entries(me.ctx.models).filter(([, x]) => x && typeof x === 'object' && str(x.model, 80)) : [];
    if (mt.length) {
      const dl = el('dl', 'mv-tech-dl mv-tech-table');
      techRows(dl, mt.slice(0, 12).map(([k, x]) => [PURPOSE[k] ? capital(PURPOSE[k]) : str(k, 40),
        `${modelName(x.model)}${str(x.fallback, 80) && str(x.fallback, 80) !== str(x.model, 80) ? `, else ${modelName(x.fallback)}` : ''}${num(x.seconds) ? ` (${fmtVal(x.seconds)} s at most)` : ''}`]));
      part('Which model runs each step on this server').append(dl);
    }
    
    const refused = me.view && Array.isArray(me.view.refused) ? me.view.refused : [];
    if (refused.length) {
      const ul = el('ul', 'mv-tech-list');
      for (const r of refused.slice(0, 12)) ul.append(el('li', '', `${str(r.id, 40)}: ${(Array.isArray(r.why) ? r.why : []).map((x) => str(x, 120)).join('; ')}`));
      part('Lines the lesson would not say').append(ul);
    }
    if (me.ctx.details) {
      const d = el('button', 'mv-nav mv-tech-details', 'The four-step analysis');
      d.type = 'button';
      d.addEventListener('click', () => me.ctx.details());
      box.append(d);
    }
    return box;
  }
  
  
  
  
  
  
  const HC_CLEAR = { yes: 'In view', partly: 'Partly in view', no: 'Not in view' };
  function hcDetail(m) {
    if (m.state === 'silent') return '';
    if (m.id === 'place' && m.hands) {
      const hs = ['L', 'R'].filter((h) => m.hands[h] && num(m.hands[h].typicalMm) != null).map((h) => `${h === 'L' ? 'left' : 'right'} hand ${Math.round(m.hands[h].typicalMm)} mm`);
      return hs.length ? `${capital(hs.join(', '))} from the pianist's place, typically` : '';
    }
    if (m.id === 'arrival' && Array.isArray(m.jumps) && num(m.pianistAheadS) != null) return `The pianist ${(+m.pianistAheadS).toFixed(2)} s ahead at the same ${m.jumps.length} jumps`;
    if (m.id === 'travel' && Array.isArray(m.perBar) && m.perBar.length) {
      const a = m.perBar.reduce((s, r) => s + (num(r.mm) || 0), 0), b = m.perBar.reduce((s, r) => s + (num(r.pianistMm) || 0), 0);
      return `You ${Math.round(a / 10)} cm, the pianist ${Math.round(b / 10)} cm, over ${m.perBar.length} bars`;
    }
    if (m.id === 'handPerNote' && num(m.notes) != null) return `${m.agree} of ${m.notes} notes${m.excused ? `, ${m.excused} as the pianist plays them` : ''}`;
    return '';
  }
  function handCheckView(res, box) {
    const hc = res && res.handCheck;
    if (!hc || typeof hc !== 'object' || !hc.seen || typeof hc.seen !== 'object') return;
    const sec = el('section', 'mv-tech-sec mv-tech-hc');
    sec.dataset.id = 'handCheck';
    sec.append(el('h3', '', 'Your hands, measured'));
    if (str(hc.seen.say, 300)) sec.append(el('p', 'mv-hc-say', str(hc.seen.say, 300)));
    const bars = (Array.isArray(hc.seen.bars) ? hc.seen.bars : []).filter((b) => b && (b.notes || b.clear)).slice(0, 80);
    if (bars.length) {
      const strip = el('div', 'mv-hc-bars');
      strip.setAttribute('role', 'list');
      for (const b of bars) {
        const clear = HC_CLEAR[b.clear] ? b.clear : 'none';
        const c = el('span', `mv-hc-b mv-hc-${clear}`);
        c.setAttribute('role', 'listitem');
        const what = HC_CLEAR[b.clear] ? `${b.seen} of ${b.notes} notes with the hand in view` : 'no hand to look for';
        c.title = `${barWord(+b.bar)}${b.pass_ > 1 ? ' (again)' : ''}: ${what}`;
        c.setAttribute('aria-label', c.title);
        c.append(el('i', ''), el('small', '', String(b.bar)));
        strip.append(c);
      }
      sec.append(strip);
      const key = el('p', 'mv-hc-key');
      for (const k of ['yes', 'partly', 'no']) if (bars.some((b) => b.clear === k)) key.append(el('span', `mv-hc-k mv-hc-${k}`, HC_CLEAR[k]));
      sec.append(key);
    }
    const list = el('div', 'mv-hc-ms');
    for (const m of (Array.isArray(hc.measures) ? hc.measures : []).filter((x) => x && typeof x === 'object').slice(0, 8)) {
      const row = el('p', `mv-hc-m mv-hc-${str(m.state, 20)}`);
      row.dataset.m = str(m.id, 30);
      const tag = m.state === 'judged' ? 'To work on' : m.state === 'silent' ? 'Not measured' : '';
      row.append(el('b', '', str(m.title, 80)));
      if (tag) row.append(el('em', '', tag));
      row.append(el('span', '', m.state === 'silent' ? `${capital(str(m.whySay, 200))}.` : str(m.say, 300)));
      const d = hcDetail(m);
      if (d) row.append(el('small', '', d));
      list.append(row);
    }
    sec.append(list);
    sec.append(el('p', 'mv-tech-none', "From SAM 3.1's outlines of your hands, five frames a second" + (hc.pianist ? ", against a pianist's recorded hands at the same notes" : '')
      + '. A measure says nothing unless what it needs was clearly in view.'));
    box.append(sec);
  }
  
  function handsFound(res) {
    const H = Array.isArray(res && res.hands) ? res.hands : [], ft = (res && res.media && Array.isArray(res.media.frameTimes)) ? res.media.frameTimes : [];
    const n = Math.min(H.length, ft.length), has = (i, lab) => !!(H[i] && H[i][lab] && Array.isArray(H[i][lab].poly) && H[i][lab].poly.length >= 3);
    let seen = 0, both = -1, one = -1;
    const nearer = (i, j) => j < 0 || Math.abs(i - n / 2) < Math.abs(j - n / 2);
    for (let i = 0; i < n; i++) {
      const L = has(i, 'L'), R = has(i, 'R');
      if (!L && !R) continue;
      seen++;
      if (L && R && nearer(i, both)) both = i;
      if (nearer(i, one)) one = i;
    }
    return { frames: n, seen, at: both >= 0 ? both : one, t: num(ft[both >= 0 ? both : one]) };
  }
  function poly(ctx, pts, s) {
    if (!Array.isArray(pts) || pts.length < 3) return false;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s)));
    ctx.closePath();
    return true;
  }
  function samView(me, box) {
    const res = me.res, f = handsFound(res), src = me.video.currentSrc || me.video.src;
    if (!f.seen || f.at < 0 || f.t == null || !src) return;
    const sec = el('section', 'mv-tech-sec mv-tech-hands');
    sec.append(el('h3', '', 'Your hands, as SAM 3.1 found them'));
    const fig = el('figure', 'mv-sam'), cv = el('canvas', 'mv-sam-cv');
    const said = `SAM 3.1, Meta's segmentation model, found your hands in ${f.seen} of the ${f.frames} frames it looked at. `
      + `Here they are outlined in one of them, ${mmss(f.t + clipOf(res))} into your video.`;
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', said);
    fig.append(cv, el('figcaption', 'mv-sam-cap', said));
    sec.append(fig);
    box.append(sec);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    const draw = () => {
      const W = v.videoWidth || (res.job && res.job.video && res.job.video.width) || 0, H = v.videoHeight || (res.job && res.job.video && res.job.video.height) || 0;
      const PW = (res.job && res.job.video && res.job.video.width) || W;
      if (!W || !H || !PW) return;
      const k = Math.min(1, 640 / W);
      cv.width = Math.round(W * k); cv.height = Math.round(H * k);
      const ctx = cv.getContext('2d');
      try { ctx.drawImage(v, 0, 0, cv.width, cv.height); } catch {   }
      ctx.lineJoin = 'round';
      for (const lab of ['L', 'R']) {
        const h = res.hands[f.at] && res.hands[f.at][lab];
        if (!h || !poly(ctx, h.poly, (W * k) / PW)) continue;
        ctx.fillStyle = lab === 'L' ? 'rgba(168, 85, 247, 0.28)' : 'rgba(236, 72, 153, 0.28)';
        ctx.fill();
        ctx.strokeStyle = lab === 'L' ? '#A855F7' : '#EC4899'; ctx.lineWidth = 2; ctx.stroke();
      }
      cv.dataset.drawn = String(f.at);
      v.removeAttribute('src');
    };
    v.addEventListener('loadeddata', () => { try { v.currentTime = f.t; } catch { draw(); } }, { once: true });
    v.addEventListener('seeked', draw, { once: true });
    v.src = src;
  }

  
  function open(ctx) {
    close();
    const view = viewOf(ctx.res);
    if (!view) throw new Error('this result has no lesson view (result.lesson.view)');
    if (!view.hook || typeof view.hook !== 'object') view.hook = { fromS: 0, toS: 0, notes: [] };   
    const parts = build(ctx);
    const me = { ctx, res: ctx.res || {}, view, ...parts, root: ctx.root, mode: 'idle', paused: false, si: -1, scene: null, t: 0, tt: { says: [], notes: [], dur: 0 },
      doneTo: 0, said: [], counts: { notes: 0, piano: 0, missed: 0, clicks: 0, longest: 0 }, lines: new Map(), ducked: new Set(), shownMarks: [], gst: null, pipEls: [] };
    V = me;
    for (const L of view.lines) if (L && str(L.id, 60) && str(L.text, 600)) me.lines.set(L.id, { id: L.id, text: str(L.text, 600), sub: str(L.sub, 600) || str(L.text, 600) });
    me.lines.set(FINGER_GUIDE.id, { id: FINGER_GUIDE.id, text: FINGER_GUIDE.text, sub: FINGER_GUIDE.sub });
    const vp = me.res.voicePack;
    me.pack = ctx.voice && vp && vp.clips && typeof vp.clips === 'object' ? { clips: vp.clips, audio: new Audio(ctx.voice) } : null;
    if (me.pack) { me.pack.audio.preload = 'auto'; me.pack.audio.addEventListener('error', () => { me.packLost = true; }); }
    
    me.guide = me.pack ? { audio: new Audio(FINGER_GUIDE.url), lost: false, playing: false } : null;
    if (me.guide) { me.guide.audio.preload = 'auto'; me.guide.audio.addEventListener('error', () => { me.guide.lost = true; }); }
    me.vol = (() => { try { const v = parseFloat(localStorage.getItem(VOL_KEY)); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; } catch { return 1; } })();
    me.volBefore = me.vol || 1;
    
    me.score = window.MVScoreCard && view.score ? window.MVScoreCard.mount(me.scoreHost, { score: view.score, fixes: view.fixes, tight: !!ctx.shell,
      tileUrl: (id) => (ctx.tile ? ctx.tile(id) : null), onPin: (n) => goFix(me, n),
      onTap: () => { if (me.scene && me.scene.fix && me.mode === 'lesson') jump(me, me.si); } }) : null;
    me.scoreHost.hidden = !me.score;
    me.root.classList.toggle('no-score', !me.score);
    
    view.fixes.forEach((f) => {
      const b = el('button', 'mv2-pip', String(f.n));
      b.type = 'button';
      b.dataset.n = String(f.n);
      b.dataset.state = 'off';
      b.setAttribute('aria-label', `Fix ${f.n}: ${str(f.cardTitle, 60) || str(f.title, 60)}`);
      b.addEventListener('click', () => goFix(me, f.n));
      me.pips.append(b);
      me.pipEls.push(b);
    });
    me.pips.hidden = true;
    me.root.classList.toggle('shell', !!ctx.shell);
    me.scenes = scenesOf(me);
    
    me.fit = () => {
      const w = me.stage.getBoundingClientRect().width || 360;
      me.stage.style.setProperty('--u', `${w / 1080}px`);
      if (ctx.shell) fitShell(me);
      if (me.score) me.score.redraw();
      cardFit(me);
    };
    me.ro = window.ResizeObserver ? new ResizeObserver(me.fit) : null;
    if (me.ro) me.ro.observe(me.stage);
    window.addEventListener('resize', me.fit);
    me.video.addEventListener('loadedmetadata', () => {
      me.video.classList.toggle('wide', me.video.videoWidth > me.video.videoHeight);
      
      if (me.video.videoWidth && me.video.videoHeight) me.root.style.setProperty('--take-ar', String(me.video.videoWidth / me.video.videoHeight));
      me.fit();
    }, { once: true });
    me.go.addEventListener('click', () => start(me, 0));
    me.play.addEventListener('click', () => onPlay(me));
    me.prev.addEventListener('click', () => prevStep(me));
    me.next.addEventListener('click', () => nextStep(me));
    me.home.addEventListener('click', () => { if (ctx.back) ctx.back(); });
    me.lib.addEventListener('click', () => { if (ctx.back) ctx.back(); });
    me.volBtn.addEventListener('click', () => { if (me.vol > 0) { me.volBefore = me.vol; setVolume(me, 0); } else setVolume(me, me.volBefore || 1); });
    me.moreBtn.addEventListener('click', (e) => { e.stopPropagation(); menuOpen(me, me.menu.hidden); });
    me.techItem.addEventListener('click', () => { menuOpen(me, false); sheet(me, true); });
    me.detItem.addEventListener('click', () => { menuOpen(me, false); if (ctx.details) ctx.details(); });
    me.detItem.hidden = !ctx.details;
    me.sheetShut.addEventListener('click', () => sheet(me, false));
    me.barTag.addEventListener('click', () => { if (me.score) { me.score.overview(true); me.score.pins('shown'); } });
    me.docClick = (e) => { if (!me.menu.hidden && !me.menu.contains(e.target) && e.target !== me.moreBtn) menuOpen(me, false); };
    document.addEventListener('click', me.docClick);
    me.keys = (e) => {
      if (V !== me) return;
      const a = document.activeElement;
      if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
      if (e.key === 'Escape') { if (!me.sheetEl.hidden) sheet(me, false); else if (!me.menu.hidden) menuOpen(me, false); else if (me.score) { me.score.overview(true); me.score.pins('shown'); } return; }
      if (!me.sheetEl.hidden) return;
      if (e.code === 'Space' && !e.repeat && !(a && /^(BUTTON|A)$/.test(a.tagName))) { e.preventDefault(); onPlay(me); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nextStep(me); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prevStep(me); }
      else if (/^[1-3]$/.test(e.key) && +e.key <= view.fixes.length) goFix(me, +e.key);
    };
    document.addEventListener('keydown', me.keys);
    
    seekVideo(me, num(view.hook && view.hook.fromS) || 0);
    role(me, 'you');
    me.root.dataset.scene = 'idle';
    me.root.hidden = false;
    
    pianoReady(lessonNotes(view));
    pianoCall('setVolume', me.vol);
    renderBar(me);
    me.fit();
    requestAnimationFrame(() => me.fit());
    me.raf = requestAnimationFrame(() => loop(me));
    window.scrollTo(0, 0);
    
    
    const ua = navigator.userActivation;
    const auto = (() => { try { return localStorage.getItem('mv-autostart') !== '0'; } catch { return true; } })();
    if (!(ua && !ua.hasBeenActive) && auto) setTimeout(() => { if (V === me && me.mode === 'idle') start(me, 0); }, 450);
  }
  function close() {
    if (!V) return;
    const me = V;
    leave(me);
    pianoCall('setVolume', 1);                       
    me.stopped = true;
    if (me.raf) cancelAnimationFrame(me.raf);
    if (me.ro) me.ro.disconnect();
    if (me.score) me.score.destroy();
    window.removeEventListener('resize', me.fit);
    document.removeEventListener('keydown', me.keys);
    document.removeEventListener('click', me.docClick);
    if (me.pack) { try { me.pack.audio.pause(); me.pack.audio.removeAttribute('src'); } catch {   } }
    if (me.guide) { try { me.guide.audio.pause(); me.guide.audio.removeAttribute('src'); } catch {   } }
    if (me.cheer) { try { me.cheer.pause(); me.cheer.removeAttribute('src'); } catch {   } }
    me.video.pause();
    me.video.removeAttribute('src');
    me.root.hidden = true;
    me.root.replaceChildren();
    V = null;
  }
  window.MVMuse = { open, close, update() {   },
    get openId() { return V ? V.ctx.id : null; },
    get state() {
      if (!V) return null;
      const me = V;
      return { lesson: true, mode: me.mode, paused: !!me.paused, scene: me.scene ? me.scene.kind : 'idle', sceneId: me.scene ? me.scene.id : null,
        fix: me.scene && me.scene.fix ? me.scene.fix.n : null, role: me.root.dataset.role, t: +me.t.toFixed(2), dur: +(me.tt.dur || 0).toFixed(2),
        holdAt: me.tt.hold ? +me.tt.hold.at.toFixed(2) : null, says: (me.tt.says || []).map((x) => [x.id, +x.at.toFixed(2), +x.end.toFixed(2)]),
        scenes: me.scenes.map((s) => s.id), said: me.said.slice(), lineIds: [...me.lines.keys()], volume: me.vol,
        pips: me.pipEls.map((b) => b.dataset.state), score: me.score ? me.score.state() : null, ghost: me.ghost.dataset.state || null, ghostMode: me.ghost.dataset.mode || null, ghostWhy: me.ghostWhy || null,
        hint: me.hintState || null, hintWhy: me.hintWhy || null, hintMode: me.hintMode || null, rate: me.tt.rate || null,
        
        ghostMarks: me.gst && typeof me.gst.state === 'function' ? (() => { try { const m = me.gst.state().marks; return { marks: m.marks, neon: m.neon, sounding: m.sounding, landmarks: m.landmarks, glyphs: m.chips.map((c) => c.kind), said: m.said || 0, discs: m.discs.map((d) => d.f) }; } catch { return null; } })() : null,
        hintMarks: me.hint && typeof me.hint.state === 'function' ? (() => { try { const m = me.hint.state().marks; return { marks: m.marks, neon: m.neon, glyphs: m.chips.map((c) => c.kind) }; } catch { return null; } })() : null,
        counts: { ...me.counts }, voicePack: !!me.pack, stepAgeMs: Math.round(performance.now() - (me.stepAt || 0)) };
    },
    
    _jump(id) { if (V) { const i = sceneIndex(V, id); if (i >= 0) jump(V, i); return i >= 0; } return false; },
    _rate(k) { if (V) V.rate = Math.max(0.25, Math.min(20, +k || 1)); },
    
    _notePoint(id) { return V && V.score ? V.score.notePoint(id) : null; },
    _barsWords: barsWords, _barWord: barWord, _cues: cuesOf };

  
  
  
  
  
  
  const openPlayer = window.MVMuse.open;
  window.MVMuse.open = (ctx) => {
    openPlayer(ctx);
    const me = V, sc = me && me.score;
    if (!sc) return;
    me.shellX = null; me.shellLit = new Map();
    const head = sc.playhead, sound = sc.sound;
    sc.playhead = (x) => { me.shellX = Number.isFinite(x) ? x : null; return head(x); };
    sc.sound = (id, tick, ...more) => { me.shellLit.set(id, performance.now()); return sound(id, tick, ...more); };
  };
  window.MVMuse.shell = {
    now() {
      if (!V) return null;
      const me = V, at = performance.now(), lit = [];
      for (const [id, t] of me.shellLit || []) { if (at - t < 350) lit.push(id); else me.shellLit.delete(id); }
      return { id: me.ctx.id, mode: me.mode, playing: me.mode === 'lesson' && !me.paused, sceneId: me.scene ? me.scene.id : null,
        kind: me.scene ? me.scene.kind : null, fix: me.scene && me.scene.fix ? me.scene.fix.n : null, x: me.shellX == null ? null : me.shellX, lit, volume: me.vol,
        menu: !me.menu.hidden };
    },
    play() { if (V) onPlay(V); },
    prev() { if (V) prevStep(V); },
    next() { if (V) nextStep(V); },
    fix(n) { if (V) goFix(V, n); },
    volume(v) { if (V) setVolume(V, v); },
    menu(open) { if (V) menuOpen(V, open == null ? V.menu.hidden : !!open); },
  };
  
})();
