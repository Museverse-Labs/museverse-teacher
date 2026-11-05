

























































(() => {
  'use strict';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (s) => { s = Math.round(Math.max(0, s) * 10) / 10; const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
  const mmss = (s) => { s = Math.max(0, Math.round(+s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);

  
  const CHAINS = [[0, 2, 3, 4, 5], [0, 6, 7, 8, 9, 10], [0, 11, 12, 13, 14, 15], [0, 16, 17, 18, 19, 20], [0, 21, 22, 23, 24, 25]];
  const KNUCKLES = [7, 12, 17, 22];
  const TIPS = [5, 10, 15, 20, 25];
  const PER_HAND = 84, PER_FRAME = 168;                   
  
  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  const BLACK_U = { 1: 0.9, 3: 2.1, 6: 4 - 1 / 7, 8: 5, 10: 6 + 1 / 7 };
  const pcOf = (m) => ((m % 12) + 12) % 12;
  const isBlack = (m) => !WHITE_PCS.includes(pcOf(m));
  const keyU = (m) => { const o = Math.floor((m - 60) / 12), pc = pcOf(m); return WHITE_PCS.includes(pc) ? o * 7 + WHITE_PCS.indexOf(pc) : o * 7 + BLACK_U[pc] - 0.5; };
  const PIANO_U = [keyU(21) - 0.5, keyU(108) + 0.5];     
  
  
  
  
  const FRONT_MM = -61.6, BACK_MM = 81, BLACK_MM = 93.1, BLACK_W_MM = 11.6, NEAR_MM = -175;
  const LOOK_S = 3;                                       
  const GLOW_MIN_S = 0.15;                                
  const MAX_VOICES = 48;
  
  
  const MARK_Y = 10, LANE_PX = 10, LANE_GAP_PX = 12, TL_H = 76;
  
  
  
  const SIDE_D = [-190, 70], SIDE_H = [-30, 110], AT_KEYS_MM = [-15, 100];
  
  const WRIST_SAME_MM = 5;
  const READ_MS = 250;                                    
  
  
  const GHOST_WAIT_MS = 8000, GHOST_HINT_MS = 700;
  const SIDE_ITEMS = new Set(['wrist_low', 'wrist_high', 'little_lift']);
  const SELF_SRC = (document.currentScript && document.currentScript.src) || '';

  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

  
  const STYLE = `
.mvh { display: grid; gap: 12px; min-width: 0; max-width: 100%; }
.mvh > * { min-width: 0; }
.mvh [hidden] { display: none !important; }
.mvh canvas { display: block; width: 100%; border-radius: 12px; background: var(--ground-alt, #151413); }
.mvh-view { position: relative; min-width: 0; }
.mvh-glbox { position: relative; overflow: hidden; border-radius: 14px; background: radial-gradient(120% 95% at 50% 0%, var(--glow, #2D2A28) 0%, var(--ground, #1A1918) 55%, var(--ground-alt, #151413) 100%); }
.mvh-glbox canvas.mvh-gl { position: absolute; inset: 0; height: 100%; border-radius: 0; background: transparent; }
.mvh-wait { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; font-size: 14px; color: var(--muted, #9CA3AF); }
/* over a view that moves every frame a backdrop blur would be redone every frame, so the glass is a little denser instead */
.mvh-cams, .mvh-hands { position: absolute; top: 10px; display: flex; gap: 2px; padding: 3px; border-radius: 999px;
  background: rgba(30, 28, 26, 0.86); border: 1px solid var(--line, rgba(255, 255, 255, 0.08)); }
.mvh-cams { right: 10px; }
.mvh-hands { left: 10px; }
.mvh-cams button, .mvh-hands button { min-height: 38px; padding: 0 14px; border: 0; border-radius: 999px; background: transparent; color: var(--body, #D1D5DB);
  font: 600 13px/1 var(--font, system-ui, sans-serif); cursor: pointer; white-space: nowrap; }
.mvh-cams button:hover, .mvh-hands button:hover { color: var(--fg, #F3F4F6); background: rgba(255, 255, 255, 0.06); }
.mvh-cams button[aria-pressed="true"], .mvh-hands button[aria-pressed="true"] { background: #FFFFFF; color: var(--ground, #1A1918); }
.mvh-cams button:focus-visible, .mvh-hands button:focus-visible { outline: 2px solid var(--grad-a, #C084FC); outline-offset: 2px; }
@media (pointer: coarse) { .mvh-cams button, .mvh-hands button { min-height: 44px; } }
.mvh.mvh-narrow .mvh-cams { top: 8px; right: 8px; }
/* on a phone the hand switch sits under the picture, not over the keys the side view is there to show */
.mvh.mvh-narrow .mvh-hands { position: static; margin-top: 8px; width: max-content; max-width: 100%; }
.mvh.mvh-narrow .mvh-cams button, .mvh.mvh-narrow .mvh-hands button { padding: 0 11px; }
/* from the side in 3D: the hand's wrist and fingertip heights, in a line over the bottom of the picture
   (under it on a phone); the canvas's text alternative says what the view shows, so this is not read twice */
.mvh-sidecap { position: absolute; left: 10px; bottom: 10px; max-width: calc(100% - 20px); margin: 0; padding: 6px 12px; border-radius: 12px;
  background: rgba(30, 28, 26, 0.86); border: 1px solid var(--line, rgba(255, 255, 255, 0.08)); font-size: 13px; line-height: 1.4; color: var(--body, #D1D5DB); pointer-events: none; }
.mvh-sidecap b { color: var(--fg, #F3F4F6); font-weight: 700; font-variant-numeric: tabular-nums; }
.mvh.mvh-narrow .mvh-sidecap { position: static; margin-top: 8px; padding: 0; background: none; border: 0; }
.mvh-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.mvh-play svg { width: 16px; height: 16px; flex: none; }
.mvh-time { font-variant-numeric: tabular-nums; color: var(--fg, #F3F4F6); font-size: 14px; font-weight: 600; min-width: 11ch; }
.mvh-note { font-size: 13px; color: var(--muted, #9CA3AF); }
.mvh-tl { touch-action: pan-y; cursor: pointer; }
.mvh-msg { margin: 0; font-size: 13px; color: var(--muted, #9CA3AF); }
.mvh-more { display: grid; gap: 4px; }
.mvh-more > summary { cursor: pointer; display: flex; align-items: center; min-height: 44px; font-size: 14px; font-weight: 600; color: var(--body, #D1D5DB); width: max-content; max-width: 100%; }
.mvh-more > summary:hover { color: var(--fg, #F3F4F6); }
.mvh-more > summary:focus-visible { outline: 2px solid var(--grad-a, #C084FC); outline-offset: 2px; border-radius: 6px; }
.mvh-more[open] > summary { margin-bottom: 6px; }
.mvh-sound { margin: 10px 0 0; font-size: 13px; color: var(--muted, #9CA3AF); }
.mvh-legend b.mvh-dig { display: inline-grid; place-items: center; width: 16px; height: 16px; margin-right: 6px; border-radius: 4px; vertical-align: -3px;
  background: var(--fg, #F3F4F6); color: var(--ground, #1A1918); font-size: 11px; font-weight: 800; }
.mvh-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; line-height: 1.5; color: var(--muted, #9CA3AF); }
.mvh-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.mvh-legend i.mvh-lit { background: #FFFFFF; box-shadow: 0 0 5px 2px rgba(255, 255, 255, 0.55); }
.mvh-legend i.mvh-dia { width: 8px; height: 8px; border-radius: 1px; transform: rotate(45deg); margin: 0 7px 0 2px; }
.mvh-legend i.mvh-dig { width: auto; height: auto; padding: 0 5px; border-radius: 4px; background: rgba(21, 20, 19, 0.9); color: var(--fg, #F3F4F6);
  font: 800 11px/16px var(--font, system-ui, sans-serif); font-style: normal; vertical-align: 0; }
.mvh-sides { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
.mvh.mvh-narrow .mvh-sides { grid-template-columns: minmax(0, 1fr); }
.mvh-side { margin: 0; display: grid; grid-template-rows: 1fr auto; gap: 6px; min-width: 0; }
.mvh-side figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; align-content: end; gap: 2px 10px; font-size: 12.5px; color: var(--muted, #9CA3AF); }
.mvh-side figcaption b { color: var(--fg, #F3F4F6); font-weight: 700; font-variant-numeric: tabular-nums; }
/* with the 3D view the side drawings are left out (its own camera shows the hand from the side): each hand's
   heights are one line of words */
.mvh.mvh-3d .mvh-sv { display: none; }
.mvh.mvh-3d .mvh-sides { grid-template-columns: minmax(0, 1fr); gap: 4px; }
.mvh.mvh-3d .mvh-side figcaption { display: block; font-size: 14px; color: var(--body, #D1D5DB); }
.mvh.mvh-3d .mvh-side-h { color: var(--fg, #F3F4F6); font-weight: 600; margin-right: 6px; }
`;
  function injectCss() {
    if (document.getElementById('mvh-css')) return;
    const s = document.createElement('style');
    s.id = 'mvh-css';
    s.textContent = STYLE;
    document.head.append(s);
  }

  
  
  let ghostP = null;
  function loadGhost() {
    if (window.MVGhost) return Promise.resolve(window.MVGhost);
    if (ghostP) return ghostP;
    ghostP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('stage-ghost.js', SELF_SRC || location.href).href;
      s.async = true;
      s.onload = () => (window.MVGhost ? resolve(window.MVGhost) : reject(new Error('stage-ghost.js did not start')));
      s.onerror = () => { ghostP = null; s.remove(); reject(new Error('stage-ghost.js did not load')); };
      document.head.append(s);
    });
    return ghostP;
  }
  const want3d = (opts) => !opts.view2d && !window.MVHANDS_2D && !/[?&]mvh2d(?:[=&]|$)/.test(location.search) && !!window.WebGLRenderingContext;

  

  
  
  
  
  let AC = null, BUS = null;
  const piano = () => (window.MVPiano && typeof window.MVPiano.voice === 'function' && typeof window.MVPiano.context === 'function' ? window.MVPiano : null);
  function audioCtx() {
    if (AC) return AC;
    const P = piano();
    if (!P) return null;
    const c = P.context(), bus = c && P.output();
    if (!bus) return null;
    AC = c; BUS = bus;
    return AC;
  }
  const PIANO_WAIT_S = 8;        
  
  function whenPiano() {
    if (piano()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = (v) => { window.removeEventListener('mvpiano', on); clearTimeout(t); resolve(v); };
      const on = () => done(!!piano());
      const t = setTimeout(() => done(!!piano()), PIANO_WAIT_S * 1000);
      window.addEventListener('mvpiano', on);
    });
  }
  const CUT_FADE = 0.06;         
  const RING_FADE = 0.1;         
  const LANDING_TAIL_S = 0.8;    
  const LANDING_LET_GO_S = 0.2;  
  function silence(c, vc, fade = CUT_FADE) {
    const now = c.currentTime, g = vc.out.gain;
    if (vc.start > now) { for (const o of vc.oscs) { try { o.stop(now); } catch {   } } return; }
    try {
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
      else { const val = g.value; g.cancelScheduledValues(now); g.setValueAtTime(val, now); }
      g.setTargetAtTime(0, now, fade);
    } catch {   }
    for (const o of vc.oscs) { try { o.stop(now + fade * 6); } catch {   } }
  }

  

  
  
  
  
  
  
  
  
  
  
  
  
  function keyTimeline(raw, dur) {
    const keyEvents = [];
    for (const n of raw || []) {
      if (!Array.isArray(n) || num(n[0]) == null || num(n[2]) == null || !Number.isInteger(+n[2])) continue;
      keyEvents.push([+n[0], 1, +n[2]]);
      if (num(n[1]) != null) keyEvents.push([+n[1], 0, +n[2]]);
    }
    keyEvents.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const held = new Map(), keyNotes = [];
    for (const [t, on, m] of keyEvents) {
      const h = held.get(m);
      if (on) { if (h != null) keyNotes.push({ on: h, off: t, m }); held.set(m, t); }
      else if (h != null) { keyNotes.push({ on: h, off: t, m }); held.delete(m); }
    }
    for (const [m, h] of held) keyNotes.push({ on: h, off: Math.max(h, dur), m });
    keyNotes.sort((a, b) => a.on - b.on || a.m - b.m);
    let keyWindow = 0;
    for (const n of keyNotes) keyWindow = Math.max(keyWindow, Math.max(n.off, n.on + GLOW_MIN_S) - n.on);
    function keyStates(t, lit, glow) {
      lit.fill(0); glow.fill(0);
      if (!Number.isFinite(t)) return;
      for (let k = lowerBound(keyNotes, t - keyWindow); k < keyNotes.length && keyNotes[k].on <= t; k++) {
        const n = keyNotes[k];
        if (n.m < 21 || n.m > 108) continue;
        if (t < n.off) lit[n.m] = 1;
        if (t < Math.max(n.off, n.on + GLOW_MIN_S)) glow[n.m] = 1;
      }
    }
    return { keyEvents, keyNotes, keyWindow, keyStates };
  }

  
  
  
  function digitsOf(result) {
    const out = new Map();
    const ds = result.reference && Array.isArray(result.reference.digits) ? result.reference.digits : [];
    for (const d of ds) {
      if (!Array.isArray(d) || !Number.isInteger(+d[0]) || !(+d[2] >= 1 && +d[2] <= 5)) continue;
      out.set(+d[0], { finger: +d[2], hand: d[1] === 'L' || d[1] === 'R' ? d[1] : null, why: String(d[3] || '') });
    }
    return out;
  }

  
  
  const FINGER_STAGES = ['shown', 'tip', 'spoken'];
  function fingerDisplay(result) {
    const b = result && result.fingering && typeof result.fingering === 'object' ? result.fingering : null;
    if (!b || !FINGER_STAGES.includes(b.stage)) return { info: null, digit: () => null };
    const d = b.display && typeof b.display === 'object' ? b.display : {};
    const hands = d.hands && typeof d.hands === 'object' ? d.hands : {};
    const minConf = num(d.minConf) != null ? +d.minConf : 0.5;
    const hide = new Set(Array.isArray(d.hideIndices) ? d.hideIndices.map(Number) : []);
    const rows = new Map();
    for (const r of Array.isArray(b.notes) ? b.notes : []) if (Array.isArray(r) && Number.isInteger(r[0])) rows.set(r[0], r);
    const info = { stage: b.stage, professional: !!d.professional, minConf, shown: 0, unsure: 0 };
    const digit = (i, hand, n5) => {
      if (hide.has(i)) return null;
      
      
      if (hand === '?') {
        if (!hands.L || !hands.R) return null;
        info.unsure++;
        return '?';
      }
      if (!hands[hand]) return null;
      const r = rows.get(i), f = Number.isInteger(+n5) ? +n5 : 0;
      const ok = f >= 1 && f <= 5 && r && r[1] === hand && +r[2] === f && r[5] === 1 && +r[3] >= minConf;
      if (ok) info.shown++; else info.unsure++;
      return ok ? String(f) : '?';
    };
    return { info, digit };
  }

  function prepare(result) {
    const stage = result.stage || {};
    const digits = digitsOf(result), fing = fingerDisplay(result);
    
    const notes = (result.notes || []).map((n, idx) => [n, idx]).filter(([n]) => Array.isArray(n) && Number.isFinite(+n[0]) && Number.isFinite(+n[2]))
      .map(([n, idx]) => {
        const hand = n[4] === 'L' || n[4] === 'R' ? n[4] : '?', digit = digits.get(idx) || null;
        return { i: idx, idx, on: +n[0], off: Number.isFinite(+n[1]) && +n[1] > +n[0] ? +n[1] : +n[0] + 0.3, m: +n[2], v: +n[3] || 64, hand,
          digit, fing: digit ? null : fing.digit(idx, hand, n[5]) };
      })
      .sort((a, b) => a.on - b.on || a.m - b.m);
    
    const downs = [];
    let down = null;
    for (const [t, v] of (result.pedal || []).filter((p) => Array.isArray(p)).sort((a, b) => a[0] - b[0])) {
      if (v >= 64 && down == null) down = +t;
      else if (v < 64 && down != null) { downs.push([down, +t]); down = null; }
    }
    if (down != null) downs.push([down, Infinity]);
    for (const n of notes) {
      const d = downs.find(([a, b]) => a <= n.off && n.off < b);
      n.offSound = d ? Math.min(d[1], n.off + 10) : n.off;
    }
    
    const holds = new Map((Array.isArray(result.holds) ? result.holds : []).filter((h) => Array.isArray(h) && Number.isInteger(+h[0]) && num(h[1]) != null && +h[1] >= 0)
      .map((h) => [+h[0], +h[1]]));
    for (const n of notes) n.holdFloorS = holds.has(n.idx) ? holds.get(n.idx) : null;
    let maxLen = 0;
    for (const n of notes) maxLen = Math.max(maxLen, n.off - n.on);
    const lastOff = notes.reduce((a, n) => Math.max(a, n.off), 0);
    const dur = num(stage.durationS) || num(result.stats && result.stats.durationS) || num(result.summary && result.summary.stats && result.summary.stats.durationS)
      || (num(stage.frames) && num(stage.fps) ? stage.frames / stage.fps : null) || lastOff || 1;
    let range = Array.isArray(stage.keyRange) && stage.keyRange.length === 2 ? stage.keyRange.map(Number) : null;
    if (!range || !range.every(Number.isFinite)) range = notes.length ? [Math.min(...notes.map((n) => n.m)), Math.max(...notes.map((n) => n.m))] : [48, 72];
    const offs = {};
    for (const lab of ['L', 'R']) {
      const o = stage.handOffsetsMm && stage.handOffsetsMm[lab];
      offs[lab] = Array.isArray(o) && o.length === 3 && o.every((x) => Number.isFinite(+x)) ? o.map(Number) : [0, 0, 0];
    }
    const judged = (result.demo && result.demo.handsPosture) || { L: true, R: true };
    
    
    const findings = (result.findings || []).map((f, i) => {
      const mo = f.evidence && Array.isArray(f.evidence.moments) && f.evidence.moments.length ? f.evidence.moments : [{ fromS: f.fromS, toS: f.toS }];
      const spans = mo.map((x) => [num(x.fromS), num(x.toS)]).filter(([a]) => a != null).map(([a, b]) => [a, b != null && b > a ? b : a]);
      return { i, hand: f.hand === 'L' || f.hand === 'R' ? f.hand : null, kind: f.kind, item: f.item || null, fromS: num(f.fromS), spans };
    }).filter((f) => f.fromS != null || f.spans.length);
    const phrases = (result.phrases || []).map((p) => ({ s: num(p.s), e: num(p.e) })).filter((p) => p.s != null && p.e != null && p.e >= p.s);
    for (const p of phrases) p.marked = findings.some((f) => f.spans.some(([a, b]) => a < p.e + 0.05 && b > p.s - 0.05));
    const keys = keyTimeline(result.notes, dur);
    return {
      stage, notes, maxLen, dur, range, offs, judged, findings, phrases, ...keys, digits: digits.size, fingering: fing.info,
      fps: num(stage.fps) || 30, t0: num(stage.t0) || 0, frames: num(stage.frames),
      W: num(stage.whitePitchMm) || 23.5, offsetS: num(stage.audioOffsetS) || 0,
      audioName: stage.audio || null, handsName: stage.hands || 'hands.bin', handsRotName: stage.handsRot || null,
      audioKind: stage.audioKind === 'backing' ? 'backing' : 'recording',
    };
  }
  
  const markS = (f) => (f.fromS != null ? f.fromS : f.spans[0][0]);
  
  function lowerBound(notes, t) {
    let a = 0, b = notes.length;
    while (a < b) { const k = (a + b) >> 1; if (notes[k].on < t) a = k + 1; else b = k; }
    return a;
  }

  

  function mount(el, opts = {}) {
    const result = opts.result;
    if (!el || !result) throw new Error('MVHands.mount needs an element and a result');
    injectCss();
    const D = prepare(result);
    const mediaBase = new URL(opts.mediaBase ? (String(opts.mediaBase).endsWith('/') ? opts.mediaBase : `${opts.mediaBase}/`) : './', location.href);
    const fetchMedia = typeof opts.fetchMedia === 'function' ? opts.fetchMedia : (name) => fetch(new URL(name, mediaBase));

    const css = getComputedStyle(el);
    const tok = (n, d) => (css.getPropertyValue(n) || '').trim() || d;
    const COL = {
      L: tok('--lh', '#A855F7'), R: tok('--rh', '#EC4899'), '?': tok('--unk', '#9CA3AF'), both: tok('--fg', '#F3F4F6'),
      fg: tok('--fg', '#F3F4F6'), muted: tok('--muted', '#9CA3AF'), phrase: 'rgba(192, 132, 252, 0.7)',
      white: '#D9D3CC', black: '#121110', ink: '#3A3633',
    };
    const FONT = tok('--font', 'system-ui, sans-serif');

    const root = document.createElement('div');
    root.className = 'mvh';
    const handName = { L: 'Left', R: 'Right' };
    const sideHtml = (lab) => `<figure class="mvh-side"><figcaption><span class="mvh-side-h">${handName[lab]} hand from the side</span><span class="mvh-read" data-h="${lab}">-</span></figcaption>`
      + `<canvas class="mvh-sv" data-h="${lab}" role="img" aria-label="${handName[lab]} hand from the side: the wrist against the knuckles, and the fingertips over the key"></canvas></figure>`;
    const offsetNote = D.offs.L.some((x) => x) || D.offs.R.some((x) => x)
      ? '<span>The two hands were recorded separately, so each is shifted a little for display.</span>' : '';
    
    const anyBoth = D.findings.some((f) => !f.hand);
    const dia = (c) => `<i class="mvh-dia" style="background:${c}"></i>`;
    
    const fingNote = D.fingering
      ? `<span class="mvh-fingnote"><b class="mvh-dig">1</b>Fingers as the hand tracking read them, 1 the thumb to 5 the little finger; ? where it could not tell${D.fingering.professional ? '. On this take only where it was most sure' : ''}${D.fingering.stage === 'shown' ? '. Fingering is not judged' : '. Fingering habits are judged only where these were read'}</span>` : '';
    const markNote = D.findings.length
      ? `<span>${dia(COL.L)}${dia(COL.R)}${anyBoth ? dia(COL.both) : ''}Where a finding was seen, in its hand's colour${anyBoth ? ' (white: both hands)' : ''}, with a thin line for how long it lasted</span>` : '';
    
    const digitNote = D.digits
      ? '<span><i class="mvh-dig">3</i>The finger the lesson shows for that note (1 is the thumb): in the bars with a difference from the score, and where a printed fingering would mark a change. It is not a reading of the finger that played.</span>' : '';
    
    const HOW = {
      '2d': 'Drawn to scale from the Quest hand tracking, on a keyboard fitted to the whole take; where the key fronts sit is estimated. A key turns white while it is held down, with a soft glow, as in the Museverse app.',
      '3d': `${result.demo ? 'The hands as the headset tracked them' : 'Your hands as the Quest tracked them'}, drawn to scale on a keyboard fitted to the whole take; where the key fronts sit is estimated. A key goes down and turns white while it is held down, with a soft glow, as in the Museverse app.`,
    };
    const SIDE_SUMMARY = { '2d': 'Show hands from the side', '3d': 'Wrist and fingertip heights, in mm' };
    root.innerHTML = `
      <div class="mvh-view">
        <div class="mvh-glbox" hidden><p class="mvh-wait" hidden>Loading the 3D view...</p></div>
        <div class="mvh-cams" role="group" aria-label="Camera" hidden>
          <button type="button" data-view="player" aria-pressed="true">Player's view</button>
          <button type="button" data-view="side" aria-pressed="false">From the side</button>
        </div>
        <div class="mvh-hands" role="group" aria-label="Which hand, from the side" hidden>
          <button type="button" data-hand="L" aria-pressed="false">Left hand</button>
          <button type="button" data-hand="R" aria-pressed="false">Right hand</button>
        </div>
        <p class="mvh-sidecap" aria-hidden="true" hidden></p>
      </div>
      <p class="mvh-msg" hidden></p>
      <div class="mvh-bar">
        <button type="button" class="btn btn-sm mvh-play">${ICON_PLAY}<span>Play</span></button>
        <span class="mvh-time" aria-hidden="true" data-t="0:00.0">0:00 / ${mmss(D.dur)}</span>
        <span class="mvh-note" hidden></span>
      </div>
      <canvas class="mvh-tl" tabindex="0" role="slider" aria-label="Position in the take, with its phrases and findings. Arrow keys move 5 seconds."
        aria-valuemin="0" aria-valuemax="${Math.round(D.dur)}" aria-valuenow="0" aria-valuetext="0:00 of ${mmss(D.dur)}"></canvas>
      <details class="mvh-more mvh-what">
        <summary>What am I seeing?</summary>
        <div class="mvh-legend">
          <span><i style="background:${COL.L}"></i>Left hand and its notes</span>
          <span><i style="background:${COL.R}"></i>Right hand and its notes</span>
          <span><i class="mvh-lit"></i>A key while it is held down, whichever hand plays it</span>
          ${fingNote}
          ${markNote}
          ${digitNote}
          <span><i style="background:${COL.phrase}"></i>Phrase with a finding</span>
          <span class="mvh-how"></span>
          ${offsetNote}
        </div>
        <p class="mvh-sound"></p>
      </details>
      <details class="mvh-more mvh-sidebox">
        <summary></summary>
        <div class="mvh-sides">${sideHtml('L')}${sideHtml('R')}</div>
      </details>`;
    el.append(root);
    const q = (s) => root.querySelector(s);
    const E = {
      play: q('.mvh-play'), time: q('.mvh-time'), sound: q('.mvh-sound'), note: q('.mvh-note'), tl: q('.mvh-tl'), roll: null, msg: q('.mvh-msg'),
      view: q('.mvh-view'), glbox: q('.mvh-glbox'), wait: q('.mvh-wait'), cams: q('.mvh-cams'), hands: q('.mvh-hands'), cap: q('.mvh-sidecap'),
      how: q('.mvh-how'), sidebox: q('.mvh-sidebox'), sideSum: q('.mvh-sidebox > summary'),
      sv: { L: q('.mvh-sv[data-h="L"]'), R: q('.mvh-sv[data-h="R"]') }, read: { L: q('.mvh-read[data-h="L"]'), R: q('.mvh-read[data-h="R"]') },
      sideH: { L: root.querySelector('.mvh-sv[data-h="L"]').parentElement.querySelector('.mvh-side-h'), R: root.querySelector('.mvh-sv[data-h="R"]').parentElement.querySelector('.mvh-side-h') },
    };

    
    function defaultSideHand() {
      const f = D.findings.find((x) => x.hand && D.judged[x.hand] !== false);
      if (f) return f.hand;
      return D.judged.R === false && D.judged.L !== false ? 'L' : 'R';
    }

    const st = {
      t: D.notes.length ? clamp(D.notes[0].on - 0.5, 0, D.dur) : 0,   
      playing: false, destroyed: false, raf: 0, timer: 0, drawRaf: 0, playPerf: 0,
      H: null, frames: 0, handsErr: null,
      freeT: 0, freePerf: 0,                               
      sound: D.audioName ? 'audio' : 'piano', soundNote: '', blocked: false,
      piano: 'idle', pianoP: null,                         
      tailUntil: null,                                     
      audio: null, audioUrl: null, audioOk: false, audioDur: 0, onAudio: false, audioTried: false, audioSeq: 0,
      syn: null, master: null, voices: [], volume: Math.min(1, Math.max(0, Number.isFinite(opts.volume) ? opts.volume : 1)),
      section: null, secSeq: 0, highlight: null, listeners: new Set(), geo: null, tlLayer: null, dpr: 0,
      lanes: 1, band: 0,                                   
      sizes: new Map(),                                    
      reads: { L: '', R: '' }, readNext: { L: '-', R: '-' }, readAt: 0, timeText: '', timeExact: '', ariaNow: '', capText: '',
      
      
      mode: want3d(opts) ? 'pending' : '2d', ghost: null, noGhost: false, waitTimer: 0, hintTimer: 0,
      camView: 'player', sideHand: defaultSideHand(), sideTouched: false,
      focus: null,                                         
    };

    

    async function asBuffer(r) {
      if (r instanceof ArrayBuffer) return r;
      if (r instanceof Blob) return r.arrayBuffer();
      if (r && typeof r.arrayBuffer === 'function') { if (r.ok === false) throw new Error(`the server answered ${r.status}`); return r.arrayBuffer(); }
      throw new Error('nothing came back');
    }
    async function asBlob(r) {
      if (r instanceof Blob) return r;
      if (r instanceof ArrayBuffer) return new Blob([r], { type: 'audio/mpeg' });
      if (r && typeof r.blob === 'function') { if (r.ok === false) throw new Error(`the server answered ${r.status}`); return r.blob(); }
      throw new Error('nothing came back');
    }
    const ready = (async () => {
      try {
        const buf = await asBuffer(await fetchMedia(D.handsName));
        if (st.destroyed) return;
        const n = Math.floor(buf.byteLength / 2);
        const H = new Int16Array(buf, 0, n - (n % PER_FRAME));   
        st.H = H;
        st.frames = Math.min(H.length / PER_FRAME, D.frames || Infinity);
        if (!st.frames) throw new Error('the file is empty');
        st.wristUsual = wristUsual();
      } catch (e) {
        if (st.destroyed) return;
        st.H = null; st.handsErr = String((e && e.message) || e);
        showMsg(`Could not load the hands for this take (${st.handsErr}). The notes and the sound still play.`);
      }
      requestDraw();
    })();
    if (D.audioName) {
      (async () => {
        try {
          const blob = await asBlob(await fetchMedia(D.audioName));
          if (st.destroyed) return;
          const a = new Audio();
          a.preload = 'auto';
          st.audioUrl = URL.createObjectURL(blob);
          a.addEventListener('loadedmetadata', () => { st.audioDur = a.duration || 0; st.audioOk = st.audioDur > 0; if (st.playing) audioFollow(); }, { once: true });
          a.addEventListener('error', () => audioFailed('it would not play here'));
          a.src = st.audioUrl; a.volume = st.volume;
          st.audio = a;
        } catch (e) { audioFailed(String((e && e.message) || e)); }
      })();
    }
    function audioFailed(why) {
      if (st.destroyed || st.sound !== 'audio') return;
      st.audioOk = false; st.onAudio = false;
      st.sound = 'piano';
      st.soundNote = `The ${D.audioKind === 'backing' ? "song's audio" : 'recording'} did not load (${why}), so the notes are played on the grand piano.`;
      loadPiano();
      if (st.playing) { anchorFree(); startPiano(); }
      soundUi();
    }
    function showMsg(text) { E.msg.textContent = text || ''; E.msg.hidden = !text; }
    function soundUi() {
      let s;
      if (st.sound === 'audio') s = D.audioKind === 'backing' ? "Sound: the song's audio from the app, not a recording of this take." : "Sound: the take's own recording.";
      else if (!(window.AudioContext || window.webkitAudioContext)) s = 'This browser cannot play the notes, so the replay is silent.';
      else if (st.piano === 'none') s = "The piano's sounds did not load, so the replay is silent.";
      else if (st.piano === 'loading') s = 'Sound: the grand piano is on its way.';
      else s = st.soundNote || 'Sound: the notes, played on a grand piano (this take has no recording).';
      if (st.blocked) s += ' The browser held the sound back: tap Play to hear it.';
      E.sound.textContent = s;
      
      
      let n = '';
      if (st.blocked) n = 'The browser held the sound back: tap Play to hear it.';
      else if (st.sound === 'piano' && st.soundNote) n = `${D.audioKind === 'backing' ? "The song's audio" : 'The recording'} did not load, so the grand piano plays the notes.`;
      else if (st.sound === 'piano' && st.piano === 'none') n = (window.AudioContext || window.webkitAudioContext)
        ? "The piano's sounds did not load, so the replay is silent." : 'This browser cannot play the notes, so the replay is silent.';
      else if (st.sound === 'audio' && D.audioKind === 'backing') n = "Sound: the song's audio, not this take.";
      if (E.note.textContent !== n) E.note.textContent = n;
      E.note.hidden = !n;
    }
    soundUi();

    

    
    
    
    
    function anchorFree() { st.freeT = st.t; st.freePerf = performance.now(); }
    function audioFollow() {
      
      const a = st.audio;
      if (!a || !st.audioOk || st.sound !== 'audio') { st.onAudio = false; return; }
      const at = st.t + D.offsetS;
      st.audioTried = true;
      if (at < 0 || at >= st.audioDur - 0.05) { st.onAudio = false; if (!a.paused) a.pause(); return; }
      try { a.currentTime = at; } catch { st.onAudio = false; return; }
      st.onAudio = true;
      const my = ++st.audioSeq;                            
      const p = a.play();
      if (p) p.then(() => { if (my === st.audioSeq && st.blocked) { st.blocked = false; soundUi(); } }).catch((e) => {
        if (my !== st.audioSeq || st.destroyed) return;
        st.onAudio = false;
        if (e && e.name === 'NotAllowedError') { st.blocked = true; soundUi(); }
        else if (!(e && e.name === 'AbortError')) audioFailed((e && e.name) || 'it would not play here');
      });
    }
    
    function loadPiano() {
      if (st.pianoP) return st.pianoP;
      if (!D.notes.length) { st.piano = 'ready'; return (st.pianoP = Promise.resolve(true)); }
      const P = piano();
      st.piano = 'loading';
      soundUi();
      if (!P) {                                            
        st.pianoP = whenPiano().then((came) => {
          st.pianoP = null;
          if (st.destroyed) return false;
          if (!came) { st.piano = 'none'; soundUi(); st.pianoP = Promise.resolve(false); return false; }
          return loadPiano();
        });
        return st.pianoP;
      }
      let timer = 0;
      const waited = new Promise((res) => { timer = setTimeout(() => res(false), PIANO_WAIT_S * 1000); });
      st.pianoP = Promise.race([P.ready(D.notes.map((n) => [n.m, n.v])).catch(() => false), waited]).then((all) => {
        clearTimeout(timer);
        if (st.destroyed) return false;
        st.piano = all || D.notes.some((n) => P.has(n.m, n.v)) ? 'ready' : 'none';
        if (st.playing && st.sound === 'piano') { anchorFree(); if (st.syn && AC) pianoAnchor(); }
        soundUi();
        return st.piano === 'ready';
      });
      return st.pianoP;
    }
    if (!D.audioName) loadPiano();
    function startPiano() {
      loadPiano();
      const c = audioCtx();
      if (!c || !D.notes.length) { st.syn = null; return; }
      if (!st.master) { st.master = c.createGain(); st.master.gain.value = st.volume; st.master.connect(BUS); }
      if (c.state !== 'running') c.resume().catch(() => {});
      st.syn = { live: false, anchorT: st.t, anchorCtx: 0, next: 0, lastCtx: c.currentTime, lastPerf: performance.now() };
      pianoAnchor();
    }
    function pianoAnchor() {
      const c = AC, s = st.syn;
      s.anchorT = st.t; s.anchorCtx = c.currentTime + 0.05;
      s.next = lowerBound(D.notes, st.t - 0.02);
      s.live = c.state === 'running';
    }
    function pianoStop(fade = CUT_FADE) {
      if (AC) for (const vc of st.voices) silence(AC, vc, fade);
      st.voices = [];
    }
    function schedule() {
      const s = st.syn, c = AC, P = piano();
      if (!st.playing || st.sound !== 'piano' || st.piano === 'loading' || !s || !s.live || !c || !P) return;
      const look = document.hidden ? 1.5 : 0.3;
      let horizon = s.anchorT + (c.currentTime + look - s.anchorCtx);
      if (st.section) horizon = Math.min(horizon, st.section.b);
      const now = c.currentTime;
      st.voices = st.voices.filter((vc) => vc.end > now);
      while (s.next < D.notes.length && D.notes[s.next].on < horizon) {
        const n = D.notes[s.next++];
        if (n.on < s.anchorT - 0.02) continue;
        const when = Math.max(now, s.anchorCtx + (n.on - s.anchorT));
        let off = s.anchorCtx + (n.offSound - s.anchorT);
        
        if (st.section) off = Math.min(off, Math.max(s.anchorCtx + (st.section.b - s.anchorT) + 0.25, when + LANDING_TAIL_S));
        if (st.voices.length >= MAX_VOICES) silence(c, st.voices.shift(), 0.015);     
        
        const vc = P.voice(c, st.master, when, off, n.m, n.v, n.holdFloorS != null ? { holdFloorS: n.holdFloorS } : undefined);
        if (vc) { vc.keyOff = off; st.voices.push(vc); }
      }
    }
    
    function clockNow() {
      const now = performance.now();
      let t = st.freeT + (now - st.freePerf) / 1000;
      if (st.sound === 'audio' && st.audio) {
        const a = st.audio;
        if (st.onAudio && !a.paused && !a.seeking && Math.abs(a.currentTime - D.offsetS - t) < 1.5) t = Math.max(st.t, a.currentTime - D.offsetS);
        else if (st.onAudio && (a.ended || t + D.offsetS >= st.audioDur - 0.05)) { st.onAudio = false; }   
        else if (!st.onAudio && st.audioOk && !st.audioTried) { st.t = t; audioFollow(); }
        else if (!st.onAudio && st.audioOk && !st.blocked) {
          const at = t + D.offsetS;                        
          if (at >= 0 && at < st.audioDur - 0.05 && a.paused) { st.t = t; audioFollow(); }
        }
      } else if (st.sound === 'piano' && st.piano === 'loading') {
        t = st.t;                                          
      } else if (st.sound === 'piano' && st.syn && AC) {
        const s = st.syn, c = AC;
        const running = c.state === 'running';
        if (running && c.currentTime !== s.lastCtx) { s.lastCtx = c.currentTime; s.lastPerf = now; }
        const advancing = running && now - s.lastPerf < 400;   
        if (!s.live && advancing) { st.t = t; pianoAnchor(); if (st.blocked) { st.blocked = false; soundUi(); } }
        else if (s.live && !advancing) { s.live = false; pianoStop(); }
        if (s.live) t = Math.max(s.anchorT, s.anchorT + (c.currentTime - s.anchorCtx));
        else if (!running && !st.blocked && now - st.playPerf > 800) { st.blocked = true; soundUi(); }
      }
      return t;
    }
    
    
    
    function landing() {
      const c = AC, s = st.syn;
      if (st.sound !== 'piano' || !c || !s || !s.live || c.state !== 'running') { st.tailUntil = null; return false; }
      if (st.tailUntil == null) {
        let until = 0;
        for (const vc of st.voices) {
          if (!(vc.end > c.currentTime) || !Number.isFinite(vc.keyOff)) continue;
          until = Math.max(until, Math.min(vc.keyOff, vc.start + LANDING_TAIL_S) + LANDING_LET_GO_S);
        }
        st.tailUntil = until;
      }
      if (c.currentTime < st.tailUntil) return true;
      st.tailUntil = null;
      return false;
    }
    function advance(drawIt) {
      if (!st.playing || st.destroyed) return;
      let t = clockNow();
      const sec = st.section;
      const end = sec ? Math.min(sec.b, D.dur) : D.dur;
      if (t >= end) t = end;
      st.t = t; anchorFree();
      if (st.sound === 'piano') schedule();
      if (t >= end) {
        if (landing()) { if (drawIt) { drawAll(); emit(); } return; }   
        halt(true);                                        
        if (sec && st.section === sec) { st.section = null; sec.resolve(true); }
        drawAll(); emit(); return;
      }
      if (drawIt) { drawAll(); emit(); }
    }
    function frame() { st.raf = 0; advance(true); if (st.playing) st.raf = requestAnimationFrame(frame); }
    function start() {
      if (st.destroyed || st.playing) return;
      if (st.t >= D.dur - 0.05) st.t = 0;
      st.playing = true;
      st.tailUntil = null;
      st.playPerf = performance.now();
      anchorFree();
      st.audioTried = false;
      if (st.sound === 'audio') audioFollow();
      else startPiano();
      st.raf = requestAnimationFrame(frame);
      st.timer = setInterval(() => advance(false), 50);    
      playUi();
    }
    function halt(ring) {
      if (!st.playing) return;
      st.playing = false;
      st.tailUntil = null;
      cancelAnimationFrame(st.raf); st.raf = 0;
      clearInterval(st.timer); st.timer = 0;
      st.audioSeq++;
      if (st.audio && !st.audio.paused) st.audio.pause();
      st.onAudio = false;
      pianoStop(ring ? RING_FADE : CUT_FADE); st.syn = null;
      playUi();
    }
    function moveTo(t) {
      st.t = clamp(+t || 0, 0, D.dur);
      st.tailUntil = null;
      anchorFree();
      if (st.playing) {
        if (st.sound === 'audio') { st.audioTried = false; audioFollow(); }
        else if (st.syn && AC) { pianoStop(); pianoAnchor(); }
      }
      drawAll(); emit();
    }
    function cutSection() {
      st.secSeq++;
      const sec = st.section;
      st.section = null;
      if (sec) sec.resolve(false);
    }
    function emit() { for (const fn of st.listeners) { try { fn(st.t); } catch (e) { console.warn('MVHands onTime listener:', e); } } }
    let shownPlaying = false;
    function playUi() {
      E.play.innerHTML = `${st.playing ? ICON_PAUSE : ICON_PLAY}<span>${st.playing ? 'Pause' : 'Play'}</span>`;
      E.play.setAttribute('aria-label', st.playing ? 'Pause the replay' : 'Play the replay with sound');
      if (st.playing !== shownPlaying) {
        shownPlaying = st.playing;
        if (typeof opts.onPlaying === 'function') { try { opts.onPlaying(st.playing); } catch (e) { console.warn('MVHands onPlaying:', e); } }
      }
    }
    playUi();

    
    
    function unlock() {
      if (st.destroyed) return;
      if (st.sound === 'piano' || !D.audioName) { const c = audioCtx(); if (c && c.state !== 'running') c.resume().catch(() => {}); }
      const a = st.audio;
      if (a && a.paused && !st.playing && a.src) {
        const p = a.play();
        a.pause();
        if (p) p.catch(() => {});
      }
    }
    const onGesture = () => {
      unlock();
      if ((!AC || AC.state === 'running') && (!D.audioName || st.audio)) {
        document.removeEventListener('pointerdown', onGesture, true);
        document.removeEventListener('keydown', onGesture, true);
      }
    };
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('keydown', onGesture, true);

    

    
    
    
    function wristUsual() {
      const out = { L: null, R: null };
      for (const [h, lab] of [[0, 'L'], [1, 'R']]) {
        const vals = [];
        const seen = new Uint8Array(st.frames);
        for (const n of D.notes) {
          if (n.hand !== lab) continue;
          const a = Math.max(0, Math.ceil((n.on - D.t0) * D.fps)), b = Math.min(st.frames - 1, Math.floor((n.off - D.t0) * D.fps));
          for (let i = a; i <= b; i++) {
            if (seen[i]) continue;
            seen[i] = 1;
            const o = i * PER_FRAME + h * PER_HAND;
            if (st.H[o]) vals.push(st.H[o + 79] / 10);
          }
        }
        if (vals.length >= 30) { vals.sort((x, y) => x - y); out[lab] = vals[vals.length >> 1]; }
      }
      return out;
    }

    function readHand(i, h) {
      const H = st.H, o = i * PER_FRAME + h * PER_HAND;
      if (!H[o]) return null;
      const J = new Array(26);
      for (let j = 0; j < 26; j++) J[j] = [H[o + 1 + j * 3] / 200, H[o + 2 + j * 3] / 10, H[o + 3 + j * 3] / 10];
      const f = o + 79;
      return { J, wristRise: H[f] / 10, roll: H[f + 1] / 10, little: H[f + 2] / 10, span: H[f + 3] / 10, pitch: H[f + 4] / 10 };
    }
    
    
    function soundingNow(lab, t) {
      for (let k = lowerBound(D.notes, t - D.maxLen - 0.1); k < D.notes.length && D.notes[k].on <= t; k++) {
        const n = D.notes[k];
        if (n.hand === lab && n.off > t) return true;
      }
      return false;
    }

    function handAt(t, lab) {
      if (!st.H) return null;
      const h = lab === 'L' ? 0 : 1, f = (t - D.t0) * D.fps, i = Math.floor(f), w = f - i;
      if (i < 0 || i >= st.frames) return null;
      const a = readHand(i, h), b = i + 1 < st.frames && w > 0.001 ? readHand(i + 1, h) : null;
      let x;
      if (a && b) {
        x = { J: a.J.map((p, k) => [p[0] + (b.J[k][0] - p[0]) * w, p[1] + (b.J[k][1] - p[1]) * w, p[2] + (b.J[k][2] - p[2]) * w]) };
        for (const k of ['wristRise', 'roll', 'little', 'span', 'pitch']) x[k] = a[k] + (b[k] - a[k]) * w;
      } else x = w < 0.5 || i + 1 >= st.frames ? a : b;
      if (!x) return null;
      const [al, de, he] = D.offs[lab];
      if (al || de || he) x.J = x.J.map((p) => [p[0] + al / D.W, p[1] + de, p[2] + he]);
      return x;
    }

    

    
    
    function fit(cv) {
      const s = st.sizes.get(cv), r = window.devicePixelRatio || 1;
      const w = (s && s[0]) || cv.clientWidth || 300, h = (s && s[1]) || cv.clientHeight || 150;
      if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
      const g = cv.getContext('2d');
      g.setTransform(r, 0, 0, r, 0, 0);
      return [g, w, h];
    }
    function roundRect(g, x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    
    
    
    
    
    function layout() {
      if (st.destroyed) return;
      const w = root.clientWidth || el.clientWidth || 600;
      root.classList.toggle('mvh-narrow', w < 560);
      const vh = document.documentElement.clientHeight || window.innerHeight || 800, cap = Math.max(200, vh * 0.6);
      const lo0 = keyU(D.range[0]) - 1.5, hi0 = keyU(D.range[1]) + 1.5;
      const rollH = Math.round(Math.min(clamp(w * 0.17, 90, 170), cap * 0.4));
      const kbMax = Math.min(clamp(w * (w < 560 ? 0.42 : 0.3), 120, 300), Math.max(110, cap - rollH - 10)), kbMm = BACK_MM - NEAR_MM;
      const px = Math.min(w / Math.max(4, hi0 - lo0), (kbMax / kbMm) * D.W);
      const span = w / px;
      let lo = (lo0 + hi0) / 2 - span / 2;
      const pLo = PIANO_U[0], pHi = PIANO_U[1];
      if (span >= pHi - pLo) lo = (pLo + pHi) / 2 - span / 2;
      else lo = clamp(lo, pLo, pHi - span);
      const mm = px / D.W, kbH = kbMm * mm;
      st.geo = { w, px, mm, lo, hi: lo + span, rollH, h: Math.round(rollH + kbH + 10) };
      st.lanes = markerLanes(w);
      st.band = (st.lanes - 1) * LANE_PX;
      if (E.roll) E.roll.style.height = `${st.geo.h}px`;
      
      const gh = Math.round(Math.min(clamp(w < 560 ? w * 0.72 : w * 0.5, 240, 540), cap));
      E.glbox.style.height = `${gh}px`;
      if (st.ghost) st.ghost.resize(w, gh);
      E.tl.style.height = `${TL_H + st.band}px`;
      const sh = w < 560 ? 140 : 150;
      E.sv.L.style.height = E.sv.R.style.height = `${sh}px`;
      st.sizes = new Map([E.roll, E.tl, E.sv.L, E.sv.R].filter(Boolean).map((cv) => [cv, [cv.clientWidth, cv.clientHeight]]));
      st.tlLayer = null;
      drawAll();
    }
    
    
    function markerLanes(w) {
      const order = D.findings.map((f) => ({ f, x: tlX(markS(f), w) })).sort((a, b) => a.x - b.x || a.f.i - b.f.i);
      const last = [];                                     
      for (const o of order) {
        let lane = last.findIndex((x) => o.x - x >= LANE_GAP_PX);
        if (lane < 0) { lane = last.length; last.push(0); }
        last[lane] = o.x;
        o.f.lane = lane;
      }
      return Math.max(1, last.length);
    }
    const laneY = (f) => MARK_Y + (f.lane || 0) * LANE_PX;
    
    
    
    function drawAll() {
      if (st.destroyed || !st.geo) return;
      if (st.mode === '3d') st.ghost.draw(st.t, st.playing);
      else if (st.mode === '2d') drawRoll();
      const now = performance.now(), due = !st.playing || now - st.readAt >= READ_MS;
      
      if (E.sidebox.open || due) { drawSide('L'); drawSide('R'); }
      drawTimeline();
      if (due) {
        st.readAt = now;
        for (const lab of ['L', 'R']) if (st.readNext[lab] !== st.reads[lab]) { st.reads[lab] = st.readNext[lab]; E.read[lab].innerHTML = st.reads[lab]; }
        
        const r = st.reads[st.sideHand], on = st.mode === '3d' && st.camView === 'side' && !!r && r !== '-';
        const c = on ? `${handName[st.sideHand]} hand: ${r}` : '';
        if (c !== st.capText) { st.capText = c; E.cap.innerHTML = c; E.cap.hidden = !on; }
      }
      
      const tt = `${mmss(st.t)} / ${mmss(D.dur)}`;
      if (tt !== st.timeText) { st.timeText = tt; E.time.textContent = tt; }
      const tx = fmt(st.t);
      if (tx !== st.timeExact) { st.timeExact = tx; E.time.dataset.t = tx; }
      const sec = String(Math.round(st.t));
      if (sec !== st.ariaNow) {
        st.ariaNow = sec;
        E.tl.setAttribute('aria-valuenow', sec);
        E.tl.setAttribute('aria-valuetext', `${mmss(st.t)} of ${mmss(D.dur)}`);
      }
    }
    function requestDraw() {
      if (st.drawRaf || st.destroyed) return;
      st.drawRaf = requestAnimationFrame(() => { st.drawRaf = 0; if (!st.playing) drawAll(); });
    }

    
    const digitSize = () => Math.round(clamp((st.geo ? st.geo.px : 12) * 0.62, 9, 13));
    function digitPlate(g, cx, cy, finger, hand) {
      const fs = digitSize(), pw = fs * 0.95, ph = fs * 1.3;
      g.fillStyle = 'rgba(21,20,19,0.9)';
      roundRect(g, cx - pw / 2, cy - ph / 2, pw, ph, 3); g.fill();
      g.fillStyle = COL[hand] || COL.fg;
      g.font = `800 ${fs}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(finger), cx, cy + 0.5);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    }

    
    const lit = new Uint8Array(128), glowing = new Uint8Array(128);
    
    function digitAt(text, x, y, fill, edge, size) {
      const g = E.roll.getContext('2d');
      g.font = `800 ${Math.max(8, Math.round(size))}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (edge) { g.lineWidth = 3; g.strokeStyle = edge; g.strokeText(text, x, y); }
      g.fillStyle = fill; g.fillText(text, x, y);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    }
    function drawRoll() {
      const [g, w, h] = fit(E.roll), G = st.geo, t = st.t;
      g.clearRect(0, 0, w, h);
      const px = G.px, mm = G.mm, X = (u) => (u - G.lo) * px;
      const kbBottom = h - 6, Y = (d) => kbBottom - (d - NEAR_MM) * mm;
      const yFront = Y(FRONT_MM), yBack = Y(BACK_MM);
      const rollBottom = yBack - 4, sp = Math.max(40, rollBottom - 6) / LOOK_S;
      g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(0, 0, w, rollBottom);
      const uA = Math.max(keyU(21), Math.ceil(G.lo - 0.5)), uB = Math.min(keyU(108), Math.floor(G.hi + 0.5));
      for (let u = uA; u <= uB; u++) if (((u % 7) + 7) % 7 === 0) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(X(u - 0.5), 0, 1, rollBottom); }
      
      
      
      D.keyStates(t, lit, glowing);
      for (let k = lowerBound(D.notes, t - D.maxLen - 0.2); k < D.notes.length; k++) {
        const n = D.notes[k];
        if (n.on > t + LOOK_S) break;
        if (n.off < t - 0.05) continue;
        const u = keyU(n.m), bw = isBlack(n.m) ? 0.55 : 0.86;
        const y0 = rollBottom - (n.on - t) * sp, y1 = rollBottom - (n.off - t) * sp;
        const top = Math.max(0, y1), bot = Math.min(rollBottom, y0);
        if (bot <= top) continue;
        g.fillStyle = COL[n.hand] || COL['?']; g.globalAlpha = n.on <= t ? 0.95 : 0.7;
        roundRect(g, X(u - bw / 2), top, bw * px, bot - top, Math.min(4, px * 0.2)); g.fill();
        g.globalAlpha = 1;
        
        
        
        if (n.digit && bw * px >= 9 && bot - top >= digitSize() + 4) digitPlate(g, X(u), bot - digitSize() * 0.75 - 2, n.digit.finger, n.digit.hand || n.hand);
        const ds = Math.min(12, isBlack(n.m) && px >= 9 ? Math.max(8, bw * px * 0.9) : bw * px * 0.9, bot - top + 1);
        if (n.fing && ds >= 7) digitAt(n.fing, X(u), bot - Math.max(4, ds / 2 + 1), n.fing === '?' ? COL.muted : '#FFFFFF', 'rgba(0,0,0,0.55)', ds);
      }
      
      
      
      const bw = BLACK_W_MM / D.W, dpr = window.devicePixelRatio || 1;
      const keyRect = (m) => (isBlack(m) ? [X(keyU(m) - bw / 2), yBack, bw * px, BLACK_MM * mm] : [X(keyU(m) - 0.5) + 0.5, yBack, px - 1, yFront - yBack]);
      const glowAround = (m) => {
        const [x, y, kw, kh] = keyRect(m), far = 4000;
        g.save();
        g.beginPath(); g.rect(0, 0, w, h); g.rect(x, y, kw, kh); g.clip('evenodd');
        
        g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = Math.max(6, px * 0.55) * dpr; g.shadowOffsetX = far * dpr;
        g.fillStyle = '#FFFFFF'; g.fillRect(x - far, y, kw, kh);
        g.restore();
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1; g.strokeRect(x - 0.5, y - 0.5, kw + 1, kh + 1);
      };
      for (let u = uA; u <= uB; u++) { g.fillStyle = COL.white; g.fillRect(X(u - 0.5) + 0.5, yBack, px - 1, yFront - yBack); }
      for (let m = 21; m <= 108; m++) { if (!lit[m] || isBlack(m)) continue; const [x, y, kw, kh] = keyRect(m); g.fillStyle = '#FFFFFF'; g.fillRect(x, y, kw, kh); }
      for (let m = 21; m <= 108; m++) if (glowing[m] && !isBlack(m)) glowAround(m);
      for (let m = 21; m <= 108; m++) {
        if (!isBlack(m)) continue;
        const u = keyU(m);
        if (u < uA - 1 || u > uB + 1) continue;
        g.fillStyle = lit[m] ? '#FFFFFF' : COL.black;
        g.fillRect(X(u - bw / 2), yBack, bw * px, BLACK_MM * mm);
      }
      for (let m = 21; m <= 108; m++) if (glowing[m] && isBlack(m)) glowAround(m);
      
      if (D.digits && px >= 9) {
        for (let k = lowerBound(D.notes, t - D.maxLen - 0.2); k < D.notes.length; k++) {
          const n = D.notes[k];
          if (n.on > t) break;
          if (!n.digit || t >= n.off || n.m < 21 || n.m > 108) continue;
          const y = isBlack(n.m) ? yBack + BLACK_MM * mm - digitSize() * 0.75 - 3 : yFront - digitSize() * 0.75 - 3;
          digitPlate(g, X(keyU(n.m)), y, n.digit.finger, n.digit.hand || n.hand);
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, yBack - 3, w, 3);
      
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const lab of ['L', 'R']) {
        const x = handAt(t, lab);
        if (!x) continue;
        const P = x.J.map((p) => [X(p[0]), Y(p[1])]);
        const path = () => CHAINS.forEach((c) => { g.beginPath(); c.forEach((j, k) => (k ? g.lineTo(P[j][0], P[j][1]) : g.moveTo(P[j][0], P[j][1]))); g.stroke(); });
        g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = Math.max(5, px * 0.42); path();
        g.strokeStyle = COL[lab]; g.lineWidth = Math.max(2.5, px * 0.22); path();
        g.fillStyle = '#fff';
        for (const j of TIPS) { g.beginPath(); g.arc(P[j][0], P[j][1], Math.max(2, px * 0.12), 0, 7); g.fill(); }
        g.fillStyle = COL[lab]; g.beginPath(); g.arc(P[0][0], P[0][1], Math.max(4, px * 0.24), 0, 7); g.fill();
      }
      
      
      
      
      const readBox = [];                            
      if (D.fingering) {
        for (let k = lowerBound(D.notes, t - D.maxLen - 0.2); k < D.notes.length && D.notes[k].on <= t; k++) {
          const n = D.notes[k];
          if (!n.fing || t >= n.off || !lit[n.m]) continue;
          const [x, y, kw, kh] = keyRect(n.m), black = isBlack(n.m);
          if (black ? px < 9 : kw < 7) continue;
          const s = Math.max(8, Math.round(Math.min(13, kw * 0.85))), cx = x + kw / 2, cy = black ? y + kh - 9 : y + kh - 11;
          digitAt(n.fing, cx, cy, n.fing === '?' ? COL.ink : COL[n.hand] || COL.ink, 'rgba(255,255,255,0.9)', s);
          readBox.push([cx - s * 0.45 - 1.5, cx + s * 0.45 + 1.5, cy - s * 0.5 - 1.5, cy + s * 0.5 + 1.5]);
        }
      }
      g.font = `500 12px ${FONT}`; g.textAlign = 'left';
      const lw = g.measureText(`next ${LOOK_S} s of notes`).width;
      g.fillStyle = 'rgba(21,20,19,0.78)'; roundRect(g, 4, 4, lw + 8, 17, 5); g.fill();
      g.fillStyle = COL.muted; g.fillText(`next ${LOOK_S} s of notes`, 8, 16);
      if (!st.H) { g.textAlign = 'right'; g.fillText(st.handsErr ? 'no hands for this take' : 'loading the hands...', w - 8, 16); g.textAlign = 'left'; }
      
      
      if (px > 9) {
        g.fillStyle = COL.ink;
        for (let u = uA; u <= uB; u++) {
          if (((u % 7) + 7) % 7 !== 0 || X(u - 0.5) < 0) continue;
          const text = `C${4 + Math.floor(u / 7)}`, lx = X(u - 0.5) + 3, tw = g.measureText(text).width;
          if (readBox.some(([a, b, c, d]) => a < lx + tw && b > lx && c < yFront - 4 && d > yFront - 16)) continue;
          g.fillText(text, lx, yFront - 6);
        }
      }
    }

    
    
    function drawSide(lab) {
      const paint = st.mode === '2d';
      const [dLo, dHi] = SIDE_D, [hLo, hHi] = SIDE_H;
      let g = null, X = null, Y = null;
      if (paint) {
        const [g0, w, h] = fit(E.sv[lab]);
        g = g0;
        g.clearRect(0, 0, w, h);
        const s = Math.min(w / (dHi - dLo), h / (hHi - hLo));
        X = (d) => (d - dLo) * s + (w - (dHi - dLo) * s) / 2; Y = (z) => h - (z - hLo) * s;
        g.fillStyle = 'rgba(217,211,204,0.16)'; g.fillRect(X(FRONT_MM), Y(10), X(dHi) - X(FRONT_MM), Y(-8) - Y(10));
        g.fillStyle = 'rgba(217,211,204,0.35)'; g.fillRect(X(FRONT_MM), Y(10), X(dHi) - X(FRONT_MM), 2);
        g.strokeStyle = 'rgba(255,255,255,0.10)'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke(); g.setLineDash([]);
        g.fillStyle = COL.muted; g.font = `500 11px ${FONT}`; g.textAlign = 'left'; g.fillText('key', X(FRONT_MM) + 4, Y(10) - 5);
      }
      const x = handAt(st.t, lab), judged = D.judged[lab] !== false;
      let read;
      if (!x) {
        if (paint) { g.font = `12px ${FONT}`; g.fillText(st.H ? 'not tracked here' : st.handsErr ? 'no hands for this take' : 'loading...', 10, 20); }
        read = st.H ? 'not tracked here' : '-';
      } else {
        if (paint) {
          const P = x.J.map((p) => [X(p[1]), Y(p[2])]);
          g.lineCap = 'round'; g.strokeStyle = COL[lab]; g.lineWidth = 2.5; g.globalAlpha = judged ? 0.9 : 0.4;
          CHAINS.forEach((c) => { g.beginPath(); c.forEach((j, k) => (k ? g.lineTo(P[j][0], P[j][1]) : g.moveTo(P[j][0], P[j][1]))); g.stroke(); });
          const kd = KNUCKLES.reduce((a, j) => a + x.J[j][1], 0) / 4, kh = KNUCKLES.reduce((a, j) => a + x.J[j][2], 0) / 4;
          g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(P[0][0], P[0][1]); g.lineTo(X(kd), Y(kh)); g.stroke(); g.setLineDash([]);
          g.fillStyle = '#fff'; g.beginPath(); g.arc(X(kd), Y(kh), 3, 0, 7); g.fill();
          g.fillStyle = COL[lab]; g.beginPath(); g.arc(P[0][0], P[0][1], 5, 0, 7); g.fill();
          g.globalAlpha = 1;
        }
        
        
        const li = x.little + D.offs[lab][2], [, wd, wh] = x.J[0];
        
        
        
        const inBox = wd >= dLo && wd <= dHi && wh >= hLo && wh <= hHi;
        const atKeys = (inBox && li <= AT_KEYS_MM[1]) || soundingNow(lab, st.t);
        if (!judged) read = 'posture not judged in this take';
        else if (!atKeys) {
          read = 'hand away from the keys';
          if (paint && !inBox) { g.font = `12px ${FONT}`; g.fillStyle = COL.muted; g.fillText('away from the keys', 10, 20); }
        } else {
          
          
          const u = st.wristUsual && st.wristUsual[lab], l = Math.round(li);
          const d = u == null ? null : Math.round(x.wristRise - u);
          const wrist = d == null ? '' : Math.abs(d) < WRIST_SAME_MM ? 'wrist at about its usual height in this take, '
            : `wrist <b>${Math.abs(d)}</b> mm ${d > 0 ? 'higher' : 'lower'} than its usual in this take, `;
          read = `${wrist}little fingertip ` + (l > 0 ? `<b>${l}</b> mm above the keys` : 'on the key');
        }
      }
      st.readNext[lab] = read;
    }

    
    
    function tlX(s, w) { return 6 + (s / D.dur) * (w - 12); }
    function buildTimelineLayer(w, h) {
      const r = window.devicePixelRatio || 1;
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * r); cv.height = Math.round(h * r);
      const g = cv.getContext('2d');
      g.setTransform(r, 0, 0, r, 0, 0);
      const X = (s) => tlX(s, w), b0 = st.band;            
      g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(0, 0, w, h);
      for (const p of D.phrases) {
        g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(X(p.s), 24 + b0, Math.max(2, X(p.e) - X(p.s)), 12);
        if (p.marked) { g.fillStyle = COL.phrase; g.fillRect(X(p.s), 20 + b0, Math.max(2, X(p.e) - X(p.s)), 3); }
      }
      
      const [m0, m1] = [Math.min(D.range[0], D.range[1]), Math.max(D.range[0], D.range[1])];
      const Yn = (m) => 60 + b0 - ((m - m0) / Math.max(1, m1 - m0)) * 20;
      for (const n of D.notes) { g.fillStyle = COL[n.hand] || COL['?']; g.globalAlpha = 0.75; g.fillRect(X(n.on), Yn(n.m) - 1, Math.max(1.2, X(n.off) - X(n.on)), 2); }
      g.globalAlpha = 1;
      
      const marks = D.findings.filter((f) => st.highlight !== f.i).concat(D.findings.filter((f) => st.highlight === f.i));
      for (const f of marks) {
        const on = st.highlight === f.i, c = f.hand ? COL[f.hand] : COL.both, y = laneY(f);
        g.fillStyle = c; g.globalAlpha = on ? 0.9 : 0.5;
        for (const [a, b] of f.spans) g.fillRect(X(a), y - 1, Math.max(2, X(b) - X(a)), 2);
        g.globalAlpha = 1;
        const x = X(markS(f)), s = on ? 7 : 5;
        g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath();
        g.fill();
        if (on) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
      }
      g.fillStyle = COL.muted; g.font = `500 11px ${FONT}`;
      g.textAlign = 'left'; g.fillText('0:00', 6, 73 + b0);
      g.textAlign = 'right'; g.fillText(mmss(D.dur), w - 6, 73 + b0);
      g.textAlign = 'left';
      return cv;
    }
    function drawTimeline() {
      const [g, w, h] = fit(E.tl), r = window.devicePixelRatio || 1;
      if (!st.tlLayer || st.tlLayer.width !== Math.round(w * r) || st.tlLayer.height !== Math.round(h * r)) st.tlLayer = buildTimelineLayer(w, h);
      g.clearRect(0, 0, w, h);
      g.drawImage(st.tlLayer, 0, 0, w, h);
      if (st.section) {
        const a = tlX(st.section.a, w), b = tlX(st.section.b, w);
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(a, 0, Math.max(2, b - a), h - 14);
      }
      const x = tlX(st.t, w);
      g.fillStyle = '#fff'; g.fillRect(x - 1, 0, 2, h - 14);
    }

    

    function startGhost() {
      E.glbox.hidden = false;
      st.hintTimer = setTimeout(() => { if (st.mode === 'pending') E.wait.hidden = false; }, GHOST_HINT_MS);
      st.waitTimer = setTimeout(() => { if (st.mode === 'pending') to2d(false); }, GHOST_WAIT_MS);
      loadGhost()
        .then((G) => (st.destroyed || st.noGhost ? null : G.create(E.glbox, {
          D, COL, hands: () => (st.H ? st : null), redraw: requestDraw, onLost: () => to2d(true),
          media: async (name) => asBuffer(await fetchMedia(name)), rotName: D.handsRotName,
          orbit: !!opts.orbit, orbitStart: opts.orbitStart, onOrbit: opts.onOrbit, bare: !!opts.bare, bright: !!opts.bright, footage: opts.footage || null,
        })))
        .then((g) => {
          if (!g) return;
          if (st.destroyed || st.noGhost) { g.destroy(); return; }
          st.ghost = g;                                    
          to3d();
        })
        .catch((e) => {
          console.info(`MVHands: the 3D view did not start (${(e && e.message) || e}), so the keyboard is drawn in 2D.`);
          if (!st.destroyed && st.mode === 'pending') to2d(true);
        });
    }
    function to3d() {
      clearTimeout(st.waitTimer); clearTimeout(st.hintTimer);
      st.mode = '3d';
      if (E.roll) { E.roll.remove(); E.roll = null; }
      E.glbox.hidden = false; E.wait.hidden = true;
      st.ghost.setView(st.camView, st.sideHand);
      st.ghost.setFocus(st.focus);
      modeUi(); layout();
    }
    
    function to2d(final) {
      clearTimeout(st.waitTimer); clearTimeout(st.hintTimer);
      if (final) st.noGhost = true;
      if (st.ghost) { const g = st.ghost; st.ghost = null; g.destroy(); }
      st.mode = '2d';
      E.glbox.hidden = true;
      if (!E.roll) {
        E.roll = document.createElement('canvas');
        E.roll.className = 'mvh-roll';
        E.roll.setAttribute('role', 'img');
        
        const F = D.fingering;
        E.roll.setAttribute('aria-label', 'The keyboard seen from above, with both hands and the next notes coming down to the keys'
          + (F ? `, and on each held key the finger the hand tracking read, 1 the thumb to 5 the little finger, ? where it could not tell${F.professional ? ' (on this take only where it was most sure)' : ''}${F.stage === 'shown' ? '; fingering is not judged' : ''}` : ''));
        E.view.prepend(E.roll);
      }
      modeUi(); layout();
    }
    function modeUi() {
      const m = st.mode === '2d' ? '2d' : '3d';
      E.how.textContent = HOW[m];
      E.sideSum.textContent = SIDE_SUMMARY[m];
      
      root.classList.toggle('mvh-3d', m === '3d');
      for (const lab of ['L', 'R']) E.sideH[lab].textContent = m === '3d' ? `${handName[lab]} hand:` : `${handName[lab]} hand from the side`;
      
      if (!st.sideTouched) E.sidebox.open = m === '2d' && (root.clientWidth || 0) >= 560;
      camUi();
    }
    function camUi() {
      const on = st.mode === '3d', both = D.judged.L !== false && D.judged.R !== false;
      E.cams.hidden = !on || !!opts.orbit;              
      if (!(on && st.camView === 'side') && !E.cap.hidden) { E.cap.hidden = true; st.capText = ''; }
      E.hands.hidden = !(on && st.camView === 'side' && both) || !!opts.orbit;
      for (const b of E.cams.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.view === st.camView));
      for (const b of E.hands.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.hand === st.sideHand));
    }
    function setView(view, hand) {
      st.camView = view === 'side' && !opts.orbit ? 'side' : 'player';
      if (hand === 'L' || hand === 'R') st.sideHand = hand;
      if (st.ghost) st.ghost.setView(st.camView, st.sideHand);
      camUi();
      requestDraw();
    }

    

    function tlTime(ev) { const r = E.tl.getBoundingClientRect(); return ((ev.clientX - r.left - 6) / Math.max(1, r.width - 12)) * D.dur; }
    
    
    function markerAt(ev) {
      const r = E.tl.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      if (y > 22 + st.band) return null;
      const lane = clamp(Math.round((y - MARK_Y) / LANE_PX), 0, st.lanes - 1);
      let best = null, bd = Infinity;
      for (const f of D.findings) {
        const d = Math.abs(tlX(markS(f), r.width) - x);
        if (d >= 9) continue;
        const score = d + 100 * Math.abs((f.lane || 0) - lane);
        if (score < bd) { bd = score; best = f; }
      }
      return best;
    }
    
    
    
    
    let dragging = false, touchAt = null;
    function grab(ev) {
      const mk = markerAt(ev);
      cutSection();
      dragging = true;
      try { E.tl.setPointerCapture(ev.pointerId); } catch {   }
      moveTo(mk ? markS(mk) : tlTime(ev));
      if (mk && typeof opts.onFinding === 'function') { try { opts.onFinding(mk.i); } catch (e) { console.warn('MVHands onFinding:', e); } }
    }
    const onDown = (ev) => {
      if (ev.button > 0) return;
      if (ev.pointerType === 'touch') { touchAt = { clientX: ev.clientX, clientY: ev.clientY, pointerId: ev.pointerId }; return; }
      grab(ev);
    };
    const onMove = (ev) => {
      if (touchAt && ev.pointerId === touchAt.pointerId && !dragging) {
        const dx = ev.clientX - touchAt.clientX, dy = ev.clientY - touchAt.clientY;
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { touchAt = null; grab(ev); }
        return;
      }
      if (dragging) moveTo(tlTime(ev));
    };
    const onUp = (ev) => {
      if (touchAt && ev.type === 'pointerup' && ev.pointerId === touchAt.pointerId) grab(touchAt);
      touchAt = null; dragging = false;
    };
    const onKey = (ev) => {
      const step = { ArrowRight: 5, ArrowLeft: -5, PageUp: 30, PageDown: -30 }[ev.key];
      if (step != null) { cutSection(); moveTo(st.t + (ev.shiftKey ? Math.sign(step) : step)); ev.preventDefault(); }
      else if (ev.key === 'Home') { cutSection(); moveTo(0); ev.preventDefault(); }
      else if (ev.key === 'End') { cutSection(); moveTo(D.dur); ev.preventDefault(); }
    };
    const onPlayBtn = () => { if (st.playing) api.pause(); else api.play(); };
    E.tl.addEventListener('pointerdown', onDown);
    E.tl.addEventListener('pointermove', onMove);
    E.tl.addEventListener('pointerup', onUp);
    E.tl.addEventListener('pointercancel', onUp);
    E.tl.addEventListener('keydown', onKey);
    E.play.addEventListener('click', onPlayBtn);
    const onCam = (ev) => { const b = ev.target.closest('button[data-view]'); if (b) setView(b.dataset.view); };
    const onHand = (ev) => { const b = ev.target.closest('button[data-hand]'); if (b) setView('side', b.dataset.hand); };
    E.cams.addEventListener('click', onCam);
    E.hands.addEventListener('click', onHand);
    E.sideSum.addEventListener('click', () => { st.sideTouched = true; });

    
    let ro = null, mq = null, layoutRaf = 0;
    const relayout = () => { if (layoutRaf || st.destroyed) return; layoutRaf = requestAnimationFrame(() => { layoutRaf = 0; layout(); }); };
    if (window.ResizeObserver) { ro = new ResizeObserver(relayout); ro.observe(root); } else window.addEventListener('resize', relayout);
    const watchDpr = () => {
      if (mq) mq.removeEventListener('change', onDpr);
      mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener('change', onDpr);
    };
    function onDpr() { if (st.destroyed) return; watchDpr(); st.tlLayer = null; relayout(); }
    watchDpr();
    const onVisible = () => { if (!document.hidden && st.playing) advance(true); };
    document.addEventListener('visibilitychange', onVisible);
    if (st.mode === '2d') to2d(false); else { startGhost(); modeUi(); }
    layout();

    

    const api = {
      ready,
      play() { cutSection(); unlock(); start(); return Promise.resolve(); },
      pause() { cutSection(); halt(); drawAll(); emit(); },
      seek(t) { cutSection(); moveTo(t); },
      time: () => st.t,
      duration: () => D.dur,
      playing: () => st.playing,
      onTime(fn) { if (typeof fn !== 'function') return () => {}; st.listeners.add(fn); return () => st.listeners.delete(fn); },
      
      
      playSection(fromS, toS) {
        cutSection();
        if (st.destroyed) return Promise.resolve(false);
        const a = clamp(num(fromS) || 0, 0, D.dur), b = clamp(num(toS) != null ? +toS : a + 5, 0, D.dur);
        if (!(b > a)) return Promise.resolve(false);
        return new Promise((resolve) => {
          halt();
          st.section = { a, b, resolve };
          moveTo(a);
          start();
          drawAll();
        });
      },
      unlock,
      highlight(i) {
        st.highlight = i == null || i < 0 ? null : +i; st.tlLayer = null;
        
        const f = st.highlight == null ? null : D.findings.find((x) => x.i === st.highlight);
        if (f && st.mode !== '2d') setView(SIDE_ITEMS.has(f.item) && f.hand ? 'side' : 'player', f.hand);
        st.focus = f && f.hand ? f.hand : null;
        if (st.ghost) st.ghost.setFocus(st.focus);
        if (!st.playing) requestDraw();
      },
      setView,
      view: () => ({ mode: st.mode, view: st.camView, hand: st.sideHand, stats: st.ghost ? st.ghost.stats : null }),
      
      setVolume(v) {
        st.volume = Math.min(1, Math.max(0, +v || 0));
        if (st.master) st.master.gain.value = st.volume;
        if (st.audio) st.audio.volume = st.volume;
      },
      orbit: () => (st.ghost ? st.ghost.orbit() : null),
      ghostState: () => (st.ghost ? st.ghost.state() : null),
      ghostKeyOnCanvas: (m) => (st.ghost && st.ghost.keyOnCanvas ? st.ghost.keyOnCanvas(m) : null),
      ghostFootage: () => (st.ghost && st.ghost.footage ? st.ghost.footage() : null),
      setOrbit(o) { if (st.ghost) st.ghost.setOrbit(o); },
      resetView(animate) { if (st.ghost) st.ghost.resetView(animate); },
      destroy() {
        if (st.destroyed) return;
        cutSection();
        halt();
        st.destroyed = true;
        st.listeners.clear();
        cancelAnimationFrame(st.drawRaf); cancelAnimationFrame(layoutRaf);
        clearTimeout(st.waitTimer); clearTimeout(st.hintTimer);
        if (st.ghost) { const g = st.ghost; st.ghost = null; g.destroy(); }
        if (ro) ro.disconnect(); else window.removeEventListener('resize', relayout);
        if (mq) mq.removeEventListener('change', onDpr);
        document.removeEventListener('visibilitychange', onVisible);
        document.removeEventListener('pointerdown', onGesture, true);
        document.removeEventListener('keydown', onGesture, true);
        if (st.master) { try { st.master.disconnect(); } catch {   } st.master = null; }
        if (st.audio) { st.audio.pause(); st.audio.removeAttribute('src'); try { st.audio.load(); } catch {   } st.audio = null; }
        if (st.audioUrl) { URL.revokeObjectURL(st.audioUrl); st.audioUrl = null; }
        st.H = null;
        root.remove();
      },
    };
    return api;
  }

  window.MVHands = { mount, prepare };   
})();
