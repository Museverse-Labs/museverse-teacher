













(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const API = new URL('api/', location.href);
  const MAX_BYTES = 400 * 1024 * 1024;       
  
  const windowS = () => chosenWindow() || (S.health && +S.health.windowS > 0 ? +S.health.windowS : 60);
  const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.3gp'];   
  const MAX_SECTION_S = 12;                  
  const POLL_MS = 1500;
  const JOB_ID = /^[0-9A-Za-z_-]{1,64}$/, DEMO_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;   
  const TOKEN_KEY = 'museverse-teacher-token', VOICE_KEY = 'museverse-teacher-voice', CODE_KEY = 'museverse-teacher-code';
  const JOBKEYS_KEY = 'museverse-teacher-job-keys';   
  const TAKES_KEY = 'museverse-teacher-takes';        
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const wide = matchMedia('(min-width: 1040px)');
  const behavior = () => (reduceMotion.matches ? 'auto' : 'smooth');

  
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { if (v == null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {   } },
  };

  const mmss = (s) => { s = Math.max(0, Math.round(+s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  
  
  
  
  const clipStart = () => { const v = +(S.result && S.result.media && S.result.media.clipStartS); return Number.isFinite(v) && v > 0 ? v : 0; };
  const at = (s) => mmss((+s || 0) + clipStart());
  const span = (a, b) => (b - a < 1 ? at(a) : `${at(a)} - ${at(b)}`);
  const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
  const count = (n) => Number(n).toLocaleString('en-US');
  const plural = (n, one, many) => `${count(n)} ${n === 1 ? one : many}`;
  const fmtMs = (ms) => (ms == null || !Number.isFinite(+ms) ? '' : ms < 1000 ? `${Math.round(ms)} ms`
    : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);
  const fmtEta = (s) => (s == null || !Number.isFinite(+s) ? '' : s < 60 ? `about ${Math.max(5, Math.round(s / 5) * 5)} s left` : `about ${Math.round(s / 60)} min left`);
  
  const durWords = (s) => {
    s = Math.max(0, +s || 0);
    if (s < 60) return 'under a minute';
    const m = Math.round(s / 60);
    if (m < 90) return `about ${m} minute${m === 1 ? '' : 's'}`;
    const h = Math.floor(m / 60), r = m % 60;
    return `about ${h} hour${h === 1 ? '' : 's'}${r ? ` ${r} minute${r === 1 ? '' : 's'}` : ''}`;
  };
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = (m) => `${NOTE[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const HAND = { L: 'Left hand', R: 'Right hand' };
  
  const PART = { lower: 'Below middle C', upper: 'From middle C up' };
  const HAND_RGB = { L: '168,85,247', R: '236,72,153' };
  
  const CONF = { measured: ['Measured', 'Read directly from the notes or the hand tracking'], rough: ['Rough estimate', 'Worked out with a wide margin, so take it as a pointer'] };
  
  const METRIC = {
    chordSpreadMs: 'chord spread', handsGapMs: 'gap between the hands', runIoiCv: 'variation in note spacing',
    runVelSd: 'variation in loudness', heldOpenShare: 'time held stretched', lateLeapShare: 'jumps arriving late',
    wrong_notes: 'notes different from the score', missed_notes: 'notes of the score missed', extra_notes: 'notes not in the score', stops: 'stops and passages played again',
    handSeenShare: 'time the hand was in view',
    wristRise: 'wrist height against the knuckles', roll: 'hand tilt towards the little finger', littleLiftP90: 'little finger lift above the keys',
    
    sameFingerSteps: 'neighbouring notes on the same finger', runsWithoutPassage: 'runs where the thumb did not pass',
    placesAwayFromLesson: "taught places away from the lesson's fingering", passagesFingeredDifferently: 'passages fingered differently when they came back',
  };
  
  const ITEM_METRIC = {
    rolled_chords: 'chordSpreadMs', hands_apart: 'handsGapMs', uneven_run: 'runIoiCv', uneven_touch: 'runVelSd', held_open: 'heldOpenShare',
    late_leap: 'lateLeapShare', wrist_height: 'wristRise', wrist_low: 'wristRise', wrist_high: 'wristRise', roll_little: 'roll', little_lift: 'littleLiftP90',
    finger_same_step: 'sameFingerSteps', finger_no_passage: 'runsWithoutPassage', finger_differs: 'placesAwayFromLesson', finger_inconsistent: 'passagesFingeredDifferently',
  };
  
  const CONF_FINGER = { rough: "Read from the hand tracking's fingertips, where two readings of them agreed, so check it on the replay",
    measured: "Read from the hand tracking's fingertips, checked against takes with known fingers" };
  const isFinger = (f) => /^finger_/.test(String((f && f.item) || ''));
  const SOURCE_BADGE = {
    quest: 'Recorded in the Museverse Quest app: hand tracking and notes',
    upload: 'Your video: SAM 3.1 and the sound',
  };
  
  const SOURCE_SHORT = { quest: 'Recorded on a Meta Quest headset', upload: 'From your video and its sound' };
  
  const SAMPLE_BADGE = 'A phone video: SAM 3.1 and the sound', SAMPLE_SHORT = 'From a phone video and its sound';
  
  
  const midiNotes = (r) => !!(r && r.notesFrom && r.notesFrom.source === 'midi');
  const notesWord = (r) => (midiNotes(r) ? "your piano's MIDI" : 'the sound');     
  const SOURCE_MIDI = { badge: "Your video: SAM 3.1 for the hands, your piano's MIDI for the notes", short: "From your video and your piano's MIDI",
    sampleBadge: "A phone video: SAM 3.1 for the hands, the piano's MIDI for the notes", sampleShort: "From a phone video and the piano's MIDI" };
  const PERF_MAX = 512 * 1024;                    
  
  const PERF_HINT = "The MIDI your piano recorded while you filmed: the notes come out exact, and the video still shows the hands. Keep the piano's own sound on, so the MIDI can be lined up with the video.";
  
  const SLIP_MIN_CHANGE = 2;
  
  
  function notesRow(r, transcriber, sample) {
    const nf = (r && r.notesFrom) || {}, whose = sample ? 'the piano' : 'your piano';
    if (nf.source === 'midi') {
      
      const off = !Number.isFinite(+nf.offsetS) ? '' : +nf.offsetS >= 0 ? `, its start ${(+nf.offsetS).toFixed(2)} s into the video`
        : `, its start ${(-nf.offsetS).toFixed(2)} s before the video began`;
      
      const of = Number.isFinite(+nf.heardNotes) && +nf.heardNotes > 0 ? ` of the ${+nf.heardNotes} notes heard` : ' notes heard';
      return `${cap(whose)}'s MIDI, lined up with the video by the notes heard${off} (${+nf.matched || 0}${of} matched it)`;
    }
    const heard = transcriber ? `From the sound (${transcriber})` : 'From the sound';
    return nf.midi && nf.midi.used === false ? `${heard}; ${whose}'s MIDI could not be lined up with the video` : heard;
  }
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const ICON_SKIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M6 12h12"/></svg>';
  const ICON_ARROW = '<svg class="demo-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  const ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const ICON_OUT = '<svg class="icon-out" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  const ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/></svg>';
  const ICON_SPEAK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>';

  
  
  
  
  const S = { kind: null, job: null, demo: null, sample: null, name: '', result: null, stage: null, poll: 0, xhr: null, videoUrl: null, D: 1,
    health: null, healthReady: null, sectionSeq: 0, hands: null, chat: null, demosLoad: null, samplesLoad: null, samples: null, plan: null, planSeq: 0,
    retake: null, seekAt: null, compare: null, cmpSeq: 0, details: false, museRows: [], museUrls: [] };

  

  class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  let token = store.get(TOKEN_KEY) || '';
  let code = store.get(CODE_KEY) || '';           
  let tokenAsk = null;
  const NEED_TOKEN = 'This server needs an access token. Ask the person who runs it for one.';
  const NEED_TOKEN_DEMO = "Questions about a demo need this server's access token.";
  let codesSeen = false;                          
  const codesOn = () => !!(S.health && S.health.judgeCode) || codesSeen;
  
  
  async function codeOk(v) {
    try {
      const r = await fetch(new URL('code', API), { headers: { 'X-Teacher-Code': v } });
      if (r.status === 429) { let b = null; try { b = await r.json(); } catch {   } return { locked: errorFrom(b, 429) }; }
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }
  function keepCode(v) { code = v; store.set(CODE_KEY, v); $('f-code').value = v; $('forget-token').hidden = !(token || code); }
  
  
  async function tokenOk(v) {
    try { return (await fetch(new URL(`jobs/${'0'.repeat(32)}`, API), { headers: { Authorization: `Bearer ${v}` } })).status === 404; } catch { return false; }
  }
  function keepToken(v) { token = v; store.set(TOKEN_KEY, v); $('forget-token').hidden = false; codeHint(); }
  const NEED_EITHER = 'A judge code or an access token is needed to use this server.';
  const BAD_EITHER = 'That judge code or access token was not accepted. Please check it and try again.';
  const BAD_TOKEN = 'That access token was not accepted. Please check it and try again.';
  
  
  function jobKeys() { try { const m = JSON.parse(store.get(JOBKEYS_KEY) || '{}'); return m && typeof m === 'object' ? m : {}; } catch { return {}; } }
  const jobKey = (id) => (id && typeof jobKeys()[id] === 'string' ? jobKeys()[id] : '');
  function keepJobKey(id, k) {
    if (!id || !k) return;
    const m = jobKeys();
    m[id] = k;
    const ids = Object.keys(m);
    for (const old of ids.slice(0, Math.max(0, ids.length - 50))) delete m[old];   
    store.set(JOBKEYS_KEY, JSON.stringify(m));
  }
  function forgetJobKey(id) {
    const m = jobKeys();
    if (!(id in m)) return;
    delete m[id];
    store.set(JOBKEYS_KEY, Object.keys(m).length ? JSON.stringify(m) : null);
  }

  function errorFrom(body, status) {
    const m = body && (body.error || (typeof body.detail === 'string' ? body.detail : null));
    if (m) return cap(m);
    return ({ 0: 'Could not reach the server. Check your connection and try again.', 404: 'Not found.', 413: 'That file is too large.' })[status]
      || `The server answered ${status}.`;
  }

  
  
  
  function askToken(reason, { codeHere = true } = {}) {
    if (tokenAsk) return tokenAsk;
    const dlg = $('token-dlg');
    tokenAsk = (async () => {
      try { await S.healthReady; } catch {   }
      return new Promise((resolve, reject) => {
        const codes = codesOn() && codeHere;
        $('token-msg').textContent = codes && reason === NEED_TOKEN ? "Type the judge code from the submission, or this server's access token."
          : codes ? `${reason} A judge code from the submission works here too.`
          : codesOn() ? `${reason} A judge code does not open this; the sample lessons take questions without either.` : reason;
        $('token-h').textContent = codes ? 'Access token or judge code' : 'Access token';
        $('token-lbl').textContent = codes ? 'Token or judge code' : 'Token';
        $('token-ok').textContent = codes ? 'Continue' : 'Use token';
        $('token-in').value = '';
        dlg.returnValue = '';
        const done = async () => {
          dlg.removeEventListener('close', done);
          const v = dlg.returnValue === 'ok' ? $('token-in').value.trim() : '';
          if (!v) { tokenAsk = null; return reject(new ApiError(401, codesOn() && codeHere ? NEED_EITHER : 'An access token is needed to use this server.')); }
          
          const got = codesOn() ? await codeOk(v) : null;
          if (got && !got.locked) {
            tokenAsk = null;
            keepCode(v);
            $('code-row').hidden = !!token;
            if (!codeHere) return reject(new ApiError(401, `${NEED_TOKEN_DEMO} A judge code opens your own uploads; the sample lessons take questions without either.`));
            resolve(v);
            return;
          }
          
          if (codesOn() && !(await tokenOk(v))) {
            tokenAsk = null;
            return reject(new ApiError(401, got && got.locked ? got.locked : BAD_EITHER));
          }
          tokenAsk = null;
          keepToken(v);
          resolve(v);
        };
        dlg.addEventListener('close', done);
        dlg.showModal();
        $('token-in').focus();
      });
    })();
    return tokenAsk;
  }

  
  async function noteCodes(r) {
    try { const b = await r.clone().json(); if (b && /judge code/i.test(String(b.detail || ''))) codesSeen = true; } catch {   }
  }
  async function apiFetch(path, opts = {}) {
    for (let tries = 0; ; tries++) {
      const headers = new Headers(opts.headers || {});
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (code) headers.set('X-Teacher-Code', code);
      const jm = typeof path === 'string' && path.match(/^jobs\/([0-9a-f]{32})(?:\/|$)/);
      if (jm && jobKey(jm[1])) headers.set('X-Teacher-Job-Key', jobKey(jm[1]));
      let r;
      try { r = await fetch(path instanceof URL ? path : new URL(path, API), { ...opts, headers }); } catch { throw new ApiError(0, errorFrom(null, 0)); }
      if (r.status === 401 && tries < 3) { await noteCodes(r); await askToken(token ? BAD_TOKEN : NEED_TOKEN); continue; }
      if (!r.ok) { let body = null; try { body = await r.json(); } catch {   } throw new ApiError(r.status, errorFrom(body, r.status)); }
      return r;
    }
  }
  const getJSON = async (path, opts) => (await apiFetch(path, opts)).json();

  

  const VIEWS = ['home', 'progress', 'results', 'muse'];
  
  
  function jumpTo(el) {
    const html = document.documentElement, prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    if (el) el.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
    html.style.scrollBehavior = prev;
  }
  function show(view, { focus = true } = {}) {
    for (const v of VIEWS) $(`v-${v}`).hidden = v !== view;
    if (focus) {
      jumpTo(null);
      const h = $(`v-${view}`).querySelector('h1, h2');
      if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    }
  }
  function globalMsg(text) { $('global-msg').textContent = text || ''; $('global-msg').hidden = !text; }
  
  
  function targetFromUrl() {
    const q = new URLSearchParams(window.__MV_SEARCH || ''), job = q.get('job'), demo = q.get('demo'), sample = q.get('sample');
    const t = /^\d{1,5}(\.\d{1,3})?$/.test(q.get('t') || '') ? +q.get('t') : null;
    if (job && JOB_ID.test(job)) return { kind: 'job', id: job, t, details: q.get('view') === 'details' };
    if (demo && DEMO_ID.test(demo)) return { kind: 'demo', id: demo, t };
    if (sample && DEMO_ID.test(sample)) return { kind: 'sample', id: sample, t };
    return null;
  }
  
  let routedSearch = null;
  function setUrl(kind, id, replace = false, view = null) {
    const u = new URL(location.href);
    u.searchParams.delete('job'); u.searchParams.delete('demo'); u.searchParams.delete('sample'); u.searchParams.delete('t'); u.searchParams.delete('view');
    if (kind && id) u.searchParams.set(kind, id);
    if (kind && id && view) u.searchParams.set('view', view);
    u.hash = '';
    window.__MV_SEARCH = u.search;
    routedSearch = u.search;
  }
  const setJobUrl = (id, replace = false) => setUrl(id ? 'job' : null, id, replace);
  function stopEverything() {
    S.poll++;
    if (window.MVMuse) { try { window.MVMuse.close(); } catch (e) { console.warn('MVMuse close:', e); } }
    S.museRows = [];
    for (const u of S.museUrls.splice(0)) URL.revokeObjectURL(u);
    S.planSeq++; S.plan = null;
    tourStop();
    stopSpeaking();
    S.sectionSeq++;
    if (S.chat) { try { S.chat.destroy(); } catch (e) { console.warn('MVChat destroy:', e); } S.chat = null; }
    if (S.hands) { try { S.hands.destroy(); } catch (e) { console.warn('MVHands destroy:', e); } S.hands = null; }
    $('hands-stage').innerHTML = '';
    $('chat-mount').innerHTML = '';
    const vid = $('vid');
    if (!vid.paused) vid.pause();
    if (S.videoUrl) { URL.revokeObjectURL(S.videoUrl); S.videoUrl = null; }
    vid.removeAttribute('src'); vid.load();
  }
  function route() {
    routedSearch = window.__MV_SEARCH || '';
    stopEverything();
    globalMsg('');
    const t = targetFromUrl();
    S.seekAt = t ? t.t : null;
    S.details = !!(t && t.details);
    if (t && t.kind === 'job') openJob(t.id);
    else if (t && t.kind === 'sample') openSample(t.id);
    else if (t) openDemo(t.id);
    else showHome({ focus: false });
  }
  
  function showHome({ focus = true, to = null } = {}) {
    if (window.__TB_HOME) window.__TB_HOME();   
    S.kind = null; S.result = null; S.seekAt = null;
    document.title = 'Museverse Teacher';
    show('home', { focus: focus && !to });
    renderTakes();
    renderRetake();
    loadSamples();
    loadDemos();
    if (to) {
      const sec = $(to);
      jumpTo(sec);
      if (focus) sec.focus({ preventScroll: true });
    }
  }
  function goHome(to = null) { setUrl(null); stopEverything(); globalMsg(''); showHome({ to }); }
  const newTake = () => goHome('upload');

  

  
  
  
  const TAKES_MAX = 30, HEX32 = /^[0-9a-f]{32}$/;
  function takesList() {
    try {
      const a = JSON.parse(store.get(TAKES_KEY) || '[]');
      return Array.isArray(a) ? a.filter((t) => t && typeof t === 'object' && HEX32.test(String(t.id || ''))) : [];
    } catch { return []; }
  }
  const saveTakes = (list) => store.set(TAKES_KEY, list.length ? JSON.stringify(list.slice(0, TAKES_MAX)) : null);
  
  function pieceOf(r) {
    const ref = (r && r.reference) || {}, p = (ref.pieces || []).find((x) => x && x.located && x.title);
    return (p && p.title) || ref.name || '';
  }
  
  function dayText(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    if (!m) return '';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString();
  }
  
  function keepTake(id, r) {
    if (!HEX32.test(id || '')) return;
    const st = (r.summary && r.summary.stats) || {}, v = (r.job && r.job.video) || {};
    const from = clipStart(), len = +(v.durationS || st.durationS) || 0;
    const found = (r.findings || []).filter((f) => f.kind === 'mistake' || f.kind === 'tip').slice(0, 3).map((f) => titleOf(f));
    const list = takesList(), old = list.find((t) => t.id === id);
    const t = { id, piece: pieceOf(r) || null, name: S.name || v.name || null, day: (r.job && r.job.createdAt) || new Date().toISOString(), from, to: from + len, found,
      notJudged: found.length ? null : notJudged(r), retakeOf: r.retakeOf || null, added: (old && old.added) || Date.now() };
    saveTakes([t, ...list.filter((x) => x.id !== id)].sort((a, b) => (+b.added || 0) - (+a.added || 0)));
  }
  function dropTake(id) {
    saveTakes(takesList().filter((t) => t.id !== id));
    forgetJobKey(id);                              
  }
  function takeItem(t) {
    const day = dayText(t.day), sp = +t.to > +t.from ? `${mmss(t.from)} - ${mmss(t.to)}` : '';
    
    const found = Array.isArray(t.found) && t.found.length ? t.found.map(String).join(' · ')
      : t.notJudged === 'too short' ? 'Too short to judge the technique' : t.notJudged === 'nothing judged' ? 'Nothing it can judge came up'
        : t.notJudged === 'no notes' ? 'No piano notes heard' : 'Nothing stood out';
    const title = String(t.piece || t.name || 'Your take'), k = esc(t.id);
    return `<li class="take">
      <a class="glass take-open" href="?job=${k}" data-job="${k}" aria-describedby="take-${k}-m take-${k}-f">
        <span class="take-t">${esc(title)}${t.retakeOf ? ' <span class="take-badge">Re-take</span>' : ''}</span>
        <span class="take-m small muted" id="take-${k}-m">${esc([day, sp && `analysed ${sp}`].filter(Boolean).join(' · '))}</span>
        <span class="take-f small" id="take-${k}-f">${esc(found)}</span>
      </a>
      <button type="button" class="btn icon-btn take-rm" data-rm="${k}" aria-label="${esc(`Remove ${title}${day ? `, ${day}` : ''}, from this list`)}">${ICON_X}</button>
    </li>`;
  }
  function renderTakes() {
    const list = takesList();
    $('takes').hidden = !list.length;
    $('takes-list').innerHTML = list.map(takeItem).join('');
  }

  

  
  
  function demoNote(caveat) {
    if (!caveat) return '';
    const m = /only the (left|right) hand/i.exec(caveat);
    if (m) return `${cap(m[1].toLowerCase())} hand only`;
    if (/times a second|rough/i.test(caveat)) return 'Rough hand data';
    return 'See the note inside';
  }
  const firstName = (p) => String(p || '').replace(/\s*\([^)]*\)\s*$/, '');      
  
  
  function demoCard(d) {
    const nf = +d.findings || 0, ns = +d.strengths || 0;
    const who = [firstName(d.player), d.durationS != null ? mmss(d.durationS) : ''].filter(Boolean).join(' · ');
    const out = [nf ? plural(nf, 'thing to work on', 'things to work on') : 'Nothing stood out', ns ? `${count(ns)} done well` : null].filter(Boolean).join(' · ');
    const note = demoNote(d.caveat);
    const k = esc(d.id), desc = [who && `demo-${k}-w`, `demo-${k}-o`, note && `demo-${k}-n`].filter(Boolean).join(' ');
    return `<a class="glass demo" href="?demo=${encodeURIComponent(d.id)}" data-demo="${k}" aria-labelledby="demo-${k}-t" aria-describedby="${desc}">
      <span class="demo-top" aria-hidden="true"><span class="demo-play">${ICON_PLAY}</span>${ICON_ARROW}</span>
      <span class="demo-title" id="demo-${k}-t">${esc(d.title || d.id)}</span>
      ${who ? `<span class="demo-who" id="demo-${k}-w">${esc(who)}</span>` : ''}
      <span class="demo-out" id="demo-${k}-o">${esc(out)}</span>
      ${note ? `<span class="demo-note" id="demo-${k}-n">${esc(note)}</span>` : ''}
    </a>`;
  }
  
  function loadDemos() {
    if (S.demosLoad) return S.demosLoad;
    const grid = $('demo-grid');
    grid.setAttribute('aria-busy', 'true');
    S.demosLoad = (async () => {
      try {
        const list = await getJSON('demos');
        const demos = Array.isArray(list) ? list.filter((d) => d && typeof d.id === 'string' && DEMO_ID.test(d.id)) : [];
        grid.innerHTML = demos.length ? demos.map(demoCard).join('') : '<p class="small muted">No demos are on this server yet. You can still upload your own video below.</p>';
      } catch (e) {
        grid.innerHTML = `<p class="msg err">The demos could not be loaded: ${esc(e.message)}</p>`;
        S.demosLoad = null;
      } finally { grid.setAttribute('aria-busy', 'false'); homeSections(); }
    })();
    return S.demosLoad;
  }

  

  
  
  function pairCard(x) {
    const b = x.before, k = esc(x.id);
    const who = [x.piece, x.durationS != null ? mmss(x.durationS) : ''].filter(Boolean).join(' · ');
    return `<div class="glass demo sample pair" role="group" aria-labelledby="sample-${k}-t">
      <span class="eyebrow pair-eyebrow">Before and after</span>
      <span class="demo-title" id="sample-${k}-t">${esc(x.title || x.id)}</span>
      ${who ? `<span class="demo-who">${esc(who)}</span>` : ''}
      <span class="demo-out">${esc(`The same part filmed again, and compared with the first take: ${b.title || b.id}.`)}</span>
      <span class="row pair-links">
        <a class="btn btn-sm" href="?sample=${encodeURIComponent(b.id)}" data-sample="${esc(b.id)}" aria-label="${esc(`Before: ${b.title || b.id}`)}">Before</a>
        <a class="btn btn-sm btn-primary" href="?sample=${encodeURIComponent(x.id)}" data-sample="${k}" aria-label="${esc(`After: ${x.title || x.id}, with the before and after`)}">After</a>
      </span>
    </div>`;
  }
  
  function sampleCard(x) {
    if (x.before && typeof x.before.id === 'string' && DEMO_ID.test(x.before.id)) return pairCard(x);
    const nf = +x.findings || 0;
    const who = [x.piece, x.durationS != null ? mmss(x.durationS) : ''].filter(Boolean).join(' · ');
    const out = nf ? plural(nf, 'thing to work on', 'things to work on') : 'Nothing stood out';
    const k = esc(x.id), desc = [who && `sample-${k}-w`, `sample-${k}-o`].filter(Boolean).join(' ');
    return `<a class="glass demo sample" href="?sample=${encodeURIComponent(x.id)}" data-sample="${k}" aria-labelledby="sample-${k}-t" aria-describedby="${desc}">
      <span class="demo-top" aria-hidden="true"><span class="demo-play">${ICON_PLAY}</span>${ICON_ARROW}</span>
      <span class="demo-title" id="sample-${k}-t">${esc(x.title || x.id)}</span>
      ${who ? `<span class="demo-who" id="sample-${k}-w">${esc(who)}</span>` : ''}
      <span class="demo-out" id="sample-${k}-o">${esc(out)}</span>
    </a>`;
  }
  
  function loadSamples() {
    if (S.samplesLoad) return S.samplesLoad;
    S.samplesLoad = (async () => {
      let list = [];
      try { list = await getJSON('samples'); } catch (e) { console.warn('samples:', e && e.message); S.samplesLoad = null; }
      S.samples = Array.isArray(list) ? list.filter((x) => x && typeof x.id === 'string' && DEMO_ID.test(x.id)) : [];
      $('sample-grid').innerHTML = S.samples.map(sampleCard).join('');
      homeSections();
    })();
    return S.samplesLoad;
  }
  
  
  function homeSections() {
    const samples = (S.samples || []).length > 0, demos = !(S.health && S.health.showDemos === false);
    $('samples').hidden = !samples;
    $('privacy-samples').hidden = !samples;
    $('demos').hidden = !demos;
    
    $('about-demo').hidden = !demos;
    $('privacy-demos').hidden = !demos;
    const to = samples ? 'samples' : demos ? 'demos' : null;
    const hero = $('hero-browse'), nav = $('nav-browse');
    hero.hidden = !to; nav.hidden = !to;
    if (to) {
      hero.textContent = samples ? 'Open a sample lesson' : 'Try a demo';
      hero.setAttribute('href', `#${to}`);
      nav.textContent = samples ? 'Samples' : 'Demos';
      nav.setAttribute('href', `./#${to}`); nav.dataset.go = to;
    }
    
    const up = document.querySelector('#v-home .hero-cta a[href="#upload"]');
    if (up) up.classList.toggle('btn-primary', !to);
    $('hero-lede').textContent = `Film yourself playing${samples ? ', or open a sample lesson' : demos ? ', or open a demo' : ''}. Your teacher watches your hands, listens to the notes, and tells you what to practise next.`;
    $('how-pick').textContent = samples ? ' Or open a sample lesson.' : demos ? ' Or pick a demo.' : '';
    codeHint();
  }
  
  const sampleAside = () => ((S.samples || []).length ? ' No code? Open a sample lesson above.' : '');
  
  
  const judgeLim = () => (!token && codesOn() && S.health && S.health.judge) || null;
  function codeHint() {
    const j = S.health && S.health.judge;
    $('code-hint').textContent = (j ? `From the submission: up to ${j.perDay} videos a day, each up to ${Math.round(j.maxBytes / 1048576)} MB and ${mmss(j.maxS)} long.`
      : 'From the submission.') + sampleAside();
    const lim = judgeLim();
    $('drop-hint').textContent = `MP4, MOV or WebM from your phone, up to ${lim ? `${Math.round(lim.maxBytes / 1048576)} MB and ${mmss(lim.maxS)} long` : '400 MB'}`;
    $('how-long').textContent = lim ? `With a judge code, up to ${mmss(lim.maxS)}: I find the part with the most playing.`
      : 'A longer video is fine: I find the minute with the most playing.';
  }
  async function openSample(id) {
    stopEverything();
    globalMsg('');
    S.kind = 'sample'; S.sample = id; S.demo = null; S.job = null; S.name = ''; S.result = null;
    const my = ++S.poll;
    resultsLoading('Opening the sample lesson...');
    $('r-kind').textContent = 'Sample lesson'; $('r-new-t').textContent = 'All samples'; $('r-source-t').textContent = SAMPLE_BADGE;
    let r;
    try { r = await getJSON(`samples/${encodeURIComponent(id)}/result`); } catch (e) {
      if (my !== S.poll) return;
      setUrl(null, true);
      showHome({ to: 'samples', focus: false });
      globalMsg(e.status === 404 ? 'That sample lesson is not on this server. Pick one of those below, or upload your own video.' : `The sample could not be opened: ${e.message}`);
      return;
    }
    if (my !== S.poll) return;
    S.result = r;
    renderResults(r);
  }

  
  function resultsLoading(title) {
    $('v-results').classList.add('is-loading');
    $('h-results').textContent = title;
    $('r-kind').textContent = 'Demo';
    $('r-new-t').textContent = 'All demos';
    $('r-source-t').textContent = SOURCE_BADGE.quest;
    for (const id of ['r-say', 'r-stats', 'r-meta']) $(id).textContent = '';
    for (const id of ['r-sub', 'r-who', 'r-caveat', 'r-blurb', 'r-say-row', 'r-get', 'r-film']) $(id).hidden = true;
    show('results');
  }
  async function openDemo(id) {
    stopEverything();
    globalMsg('');
    S.kind = 'demo'; S.demo = id; S.job = null; S.name = ''; S.result = null;
    const my = ++S.poll;
    resultsLoading('Opening the demo...');
    let r;
    try { r = await getJSON(`demos/${encodeURIComponent(id)}/result`); } catch (e) {
      if (my !== S.poll) return;
      setUrl(null, true);
      showHome({ to: 'demos', focus: false });
      globalMsg(e.status === 404 ? 'That demo is not on this server. Pick one of the demos below.' : `The demo could not be opened: ${e.message}`);
      return;
    }
    if (my !== S.poll) return;
    S.result = r;
    renderResults(r);
  }

  

  let picked = null, refFile = null, pickedS = null;   
  let perfFile = null;                                  
  function upMsg(text, kind = 'err') { const m = $('up-msg'); m.textContent = text || ''; m.className = `msg ${kind}`; m.hidden = !text; }
  
  
  function formSteps() {
    const adult = !!(S.health && S.health.adultRequired);
    const done = [!!picked, $('f-consent').checked && (!adult || $('f-adult').checked), false];
    const cur = done.indexOf(false);
    ['fs-1', 'fs-2', 'fs-3'].forEach((id, k) => {
      const el = $(id);
      el.classList.toggle('done', done[k]);
      el.classList.toggle('current', k === cur);
      el.querySelector('.fstep-sr').textContent = done[k] ? ', done' : '';
    });
  }

  function readDuration(file) {
    return new Promise((resolve) => {
      const v = document.createElement('video'), url = URL.createObjectURL(file);
      const end = (d) => { clearTimeout(t); URL.revokeObjectURL(url); v.removeAttribute('src'); resolve(d); };
      const t = setTimeout(() => end(null), 5000);
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = () => end(Number.isFinite(v.duration) ? v.duration : null);
      v.onerror = () => end(null);       
      v.src = url;
    });
  }

  function pickVideo(file) {
    upMsg('');
    if (!file) return;
    const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (!VIDEO_EXT.includes(ext)) return upMsg(`"${file.name}" is not a video this server reads. Please choose an MP4, MOV, M4V, WebM, MKV, AVI or 3GP file.`);
    
    const lim = judgeLim(), big = lim && file.size > lim.maxBytes
      ? `That video is ${mb(file.size)}. With a judge code this server takes up to ${mb(lim.maxBytes)}: trim it to the part you want feedback on, or record at 1080p or lower.` : '';
    if (file.size > MAX_BYTES) return upMsg(`That video is ${mb(file.size)}, over 400 MB. A long video is fine, but this file is too big: record at 1080p or lower, or trim it to the part you want feedback on.`);
    if (!file.size) return upMsg('That file is empty.');
    picked = file;
    S.healthReady = loadHealth();                   
    $('drop-empty').hidden = true; $('picked').hidden = false;
    $('picked-name').textContent = file.name;
    $('picked-meta').textContent = mb(file.size);
    $('picked-warn').textContent = big; $('picked-warn').hidden = !big; $('picked-warn').classList.add('warn');
    
    
    const rs = S.retake && S.retake.start != null ? S.retake.start : null;
    $('start-row').hidden = true; $('f-start').value = ''; pickedS = null;
    $('start-hint').textContent = 'Leave it empty and I pick the minute with the most playing.'
      + (rs != null ? ` In your first take this part started at ${mmss(rs)}.` : '');
    formSteps();
    readDuration(file).then((d) => {
      if (picked !== file || d == null) return;
      pickedS = d;
      $('up-time').textContent = waitText(S.health, d);      
      $('picked-meta').textContent = `${mb(file.size)} · ${mmss(d)}`;
      
      const jl = judgeLim(), long = d >= windowS() + 1, over = !!(jl && d > jl.maxS + 0.5);    
      const w = big || (over ? `This video is ${mmss(d)} long. With a judge code this server takes up to ${mmss(jl.maxS)}: trim it to the part you want feedback on.`
        : long ? `This video is ${mmss(d)} long. That is fine: I listen to all of it and look closely at the ${windowS() === 60 ? 'minute' : `${Math.round(windowS())} seconds`} with the most playing.`
          : d < 5 ? 'That is very short: a few phrases or more of playing gives the teacher enough to judge.' : '');
      $('picked-warn').textContent = w; $('picked-warn').hidden = !w;
      $('picked-warn').classList.toggle('warn', !!big || over || !long);
      $('start-row').hidden = !long;
    });
  }
  function pickRef(file) {
    upMsg('');
    if (!file) return;
    if (!/\.midi?$/i.test(file.name)) return upMsg('The reference must be a MIDI file (.mid).');
    refFile = file;
    if (S.retake) S.retake.sameScore = false;                 
    $('ref-name').textContent = file.name; $('ref-name').classList.remove('muted'); $('ref-clear').hidden = false;
    $('f-piece').value = '';                                   
  }
  
  function renderLibrary(h) {
    const ps = h && Array.isArray(h.library) ? h.library.filter((p) => p && p.id && p.title) : [];
    const sel = $('f-piece'), keep = sel.value || (S.retake && S.retake.piece) || '';
    sel.innerHTML = '<option value="">None</option>' + ps.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
    sel.value = ps.some((p) => p.id === keep) ? keep : '';
    $('piece-row').hidden = !ps.length;
  }
  function clearRef() {
    refFile = null;
    if (S.retake) S.retake.sameScore = false;      
    $('ref-name').textContent = 'With the score, the teacher can also point out wrong, missed and extra notes.';
    $('ref-name').classList.add('muted'); $('ref-clear').hidden = true;
  }
  
  async function pickPerf(file) {
    upMsg('');
    if (!file) return;
    const max = +(S.health && S.health.performanceMaxBytes) || PERF_MAX;
    if (!/\.midi?$/i.test(file.name)) return upMsg("The MIDI from your piano must be a MIDI file (.mid). Leave it out if your piano saved none.");
    if (file.size > max) return upMsg(`That MIDI file is ${mb(file.size)}, over the ${Math.round(max / 1024)} KB this server takes: record just this take.`);
    let head = '';
    try { head = String.fromCharCode(...new Uint8Array(await file.slice(0, 4).arrayBuffer())); } catch {   }
    if (head && head !== 'MThd') return upMsg(`"${file.name}" is not a MIDI file. Leave it out if your piano saved none.`);
    perfFile = file;
    $('perf-name').textContent = file.name; $('perf-name').classList.remove('muted'); $('perf-clear').hidden = false;
  }
  function clearPerf() {
    perfFile = null;
    $('perf-name').textContent = PERF_HINT;
    $('perf-name').classList.add('muted'); $('perf-clear').hidden = true;
  }

  

  
  
  
  function retakeTarget(r, f) {
    const ref = r.reference || {}, pieces = (ref.pieces || []).filter((p) => p && p.located);
    const named = pieces.length > 0 && pieces.every((p) => p.barNumbers);
    let bars = [];
    if (named && f.barNumbers && Array.isArray(f.bars)) bars = f.bars.map((b) => +b.bar).filter(Number.isFinite);
    if (named && !bars.length && Array.isArray(ref.barStats)) {
      bars = ref.barStats.filter((b) => +b.toS >= +f.fromS && +b.fromS <= +f.toS).map((b) => +b.bar).filter(Number.isFinite);
    }
    const lib = (S.health && Array.isArray(S.health.library) ? S.health.library : []).map((p) => p.id);
    const piece = (pieces.find((p) => p.id && lib.includes(p.id)) || {}).id || null;
    const base = { piece, sameScore: !piece && !!r.reference, refName: !piece && r.reference ? ref.name || '' : '',
      start: Math.max(0, (+f.fromS || 0) + clipStart() - 2), midi: midiNotes(r) };
    if (bars.length) {
      const lo = Math.min(...bars), hi = Math.max(...bars);
      return { ...base, bars: true, label: lo === hi ? `bar ${lo}` : `bars ${lo}-${hi}`, words: lo === hi ? `bar ${lo}` : `bars ${lo} to ${hi}`, one: lo === hi };
    }
    const a = +f.fromS || 0, b = Math.max(+f.toS || a, a);
    return { ...base, bars: false, label: span(a, b), words: `the part from ${at(a)} to ${at(b)}`, one: true };
  }
  
  const retakeFinding = (r) => (r.findings || []).find((f) => (f.kind === 'mistake' || f.kind === 'tip') && Number.isFinite(+f.fromS)) || null;
  function startRetake() {
    const r = S.result, f = r && retakeFinding(r);
    if (!f || S.kind !== 'job' || !S.job) return;
    S.retake = { of: S.job, ...retakeTarget(r, f) };
    goHome('upload');
  }
  
  function renderRetake() {
    const x = S.retake;
    $('retake-card').hidden = !x;
    if (!x) return;
    $('retake-what').textContent = x.words;
    
    $('retake-do').textContent = `Play ${x.words} three times, then film one take${x.bars ? ` of ${x.one ? 'it' : 'them'}` : ''}. `
      + `A short take is fine for this${x.bars ? ': it is compared bar by bar' : ''}; the technique needs a few phrases or more of playing to be judged.`;
    $('retake-how').textContent = `I compare the new take with your first one${x.bars ? ', bar by bar' : ''}, from what each measured.`
      + (x.piece ? ' The same piece is chosen below.' : x.sameScore ? ' I use the score of your first take.' : '')
      
      + (x.midi ? ` Add your piano's MIDI of the new take too: with both takes' notes from it, a change of ${SLIP_MIN_CHANGE} slips in a bar counts, a smaller margin than notes from the sound need.` : '');
    if (x.piece) { const sel = $('f-piece'); if ([...sel.options].some((o) => o.value === x.piece)) sel.value = x.piece; }
    if (x.sameScore && !refFile) {
      $('ref-name').textContent = `The score of your first take${x.refName ? `: ${x.refName}` : ''}`;
      $('ref-name').classList.remove('muted'); $('ref-clear').hidden = false;
    }
  }
  function cancelRetake() {
    const same = S.retake && S.retake.sameScore;
    S.retake = null;
    if (same && !refFile) clearRef();
    renderRetake();
  }

  
  function parseStart(v) {
    v = String(v || '').trim();
    if (!v) return null;
    if (!/^\d{1,5}(:[0-5]?\d){0,2}$/.test(v)) return NaN;
    return v.split(':').reduce((acc, x) => acc * 60 + +x, 0);
  }
  function setUploading(on) {
    $('up-go').disabled = on; $('up-cancel').hidden = !on; $('up-progress').hidden = !on;
    for (const id of ['f-video', 'f-ref', 'f-perf', 'f-piece', 'f-consent', 'f-adult', 'f-tip', 'f-start', 'f-code']) $(id).disabled = on;
    if (on) upProgress(0, null, performance.now());
  }
  function upProgress(loaded, total, t0) {
    const pct = total ? Math.round((loaded / total) * 100) : 0;
    $('up-bar').firstElementChild.style.width = `${pct}%`;
    $('up-bar').setAttribute('aria-valuenow', String(pct));
    if (!total) { $('up-text').textContent = 'Starting the upload...'; return; }
    if (loaded >= total) { $('up-text').textContent = `Uploaded ${mb(total)}. Starting the analysis...`; return; }
    const el = (performance.now() - t0) / 1000, rate = loaded / Math.max(el, 0.001);
    const left = rate > 0 && el > 1 ? ` · ${fmtEta((total - loaded) / rate)}` : '';
    $('up-text').textContent = `Uploading ${pct}% · ${mb(loaded)} of ${mb(total)}${left}`;
  }

  function xhrUpload(form) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest(), t0 = performance.now();
      S.xhr = x;
      upProgress(0, null, t0);                                  
      x.open('POST', new URL('jobs', API));
      if (token) x.setRequestHeader('Authorization', `Bearer ${token}`);
      if (code) x.setRequestHeader('X-Teacher-Code', code);
      x.upload.onprogress = (e) => upProgress(e.loaded, e.lengthComputable ? e.total : null, t0);
      x.onload = () => {
        S.xhr = null;
        let body = null;
        try { body = JSON.parse(x.responseText); } catch {   }
        if (x.status >= 200 && x.status < 300 && body && body.id) resolve(body);
        else reject(new ApiError(x.status, errorFrom(body, x.status)));
      };
      x.onerror = () => { S.xhr = null; reject(new ApiError(0, 'The upload failed: the connection dropped. Please try again.')); };
      x.onabort = () => { S.xhr = null; reject(new ApiError(-1, 'Upload cancelled.')); };
      x.send(form);
    });
  }
  
  
  
  async function checkToken() {
    if (S.health && !S.health.auth) return;
    if (!token && code) return;                     
    try { await apiFetch(`jobs/${'0'.repeat(32)}`); } catch (e) { if (e.status !== 404) throw e; }
  }
  async function uploadAuthed(makeForm) {
    await checkToken();
    for (let tries = 0; ; tries++) {
      try { return await xhrUpload(makeForm()); } catch (e) {
        if (e.status !== 401 || tries >= 3) throw e;
        await askToken(token ? BAD_TOKEN : NEED_TOKEN);
      }
    }
  }

  async function submitUpload(e) {
    e.preventDefault();
    upMsg('');
    if (window.__MV_PREVIEW) { upMsg(window.__MV_PREVIEW); return; }   
    if (!picked) { upMsg('Choose a video first.'); $('f-video').focus(); return; }
    
    if (!S.health) {
      await (S.healthReady = loadHealth());
      if (!S.health) { upMsg("Could not check this server's settings. Check your connection, then try again."); return; }
      if (!$('f-consent').checked) { upMsg('Please read the list above and tick the box to agree.'); $('f-consent').focus(); return; }
    }
    if (!$('f-consent').checked) { upMsg('Please tick the box to agree before uploading.'); $('f-consent').focus(); return; }
    const adult = !!S.health.adultRequired;
    if (adult && !$('f-adult').checked) { upMsg(`Please confirm you are 18 or older: this server uses ${andList(outsideNames(S.health))}.`); $('f-adult').focus(); return; }
    
    const typed = $('code-row').hidden ? '' : $('f-code').value.trim();
    
    if (!typed && !$('code-row').hidden && !token && !code) { upMsg(`Type your judge code above.${sampleAside()}`); $('f-code').focus(); return; }
    if (typed) {
      const ok = await codeOk(typed);
      if (ok && ok.locked) { upMsg(`${ok.locked}${/[.!?]$/.test(ok.locked) ? '' : '.'}${sampleAside()}`); return; }   
      if (!ok && await tokenOk(typed)) {               
        keepToken(typed); $('f-code').value = ''; $('code-row').hidden = true;
      } else if (!ok) { upMsg(`That judge code was not accepted. Please check it.${sampleAside()}`); $('f-code').focus(); return; }
      else {
        keepCode(typed);
        if (!(+ok.uploadsLeft > 0)) { upMsg(`This judge code has made its ${ok.perDay} uploads for today. Please try again tomorrow.${sampleAside()}`); return; }
      }
    }
    const lim = !token && code && S.health && S.health.judge;
    if (lim && picked.size > lim.maxBytes) { upMsg(`That video is ${mb(picked.size)}. With a judge code this server takes up to ${mb(lim.maxBytes)}: trim it to the part you want feedback on, or record at 1080p or lower.`); return; }
    if (lim && pickedS != null && pickedS > lim.maxS + 0.5) { upMsg(`That video is ${mmss(pickedS)} long. With a judge code this server takes up to ${mmss(lim.maxS)}: trim it to the part you want feedback on.`); return; }
    const start = $('start-row').hidden ? null : parseStart($('f-start').value);
    if (Number.isNaN(start)) { upMsg('Write the start as minutes and seconds, like 2:10, or leave it empty.'); $('f-start').focus(); return; }
    if (start != null && pickedS != null && start >= pickedS - 1) { upMsg(`Your video is ${mmss(pickedS)} long, so it cannot start at ${mmss(start)}. Leave it empty and I pick the part myself.`); $('f-start').focus(); return; }
    
    
    if (refFile && perfFile && refFile.size === perfFile.size) {
      let same = false;
      try {
        const [a, b] = (await Promise.all([refFile.arrayBuffer(), perfFile.arrayBuffer()])).map((x) => new Uint8Array(x));
        same = a.every((x, i) => x === b[i]);
      } catch {   }
      if (same) { upMsg("The score and the MIDI from your piano are the same file: the score is the music as written, the piano's MIDI is what you played. Add the MIDI your piano recorded while you filmed, or leave it out."); return; }
    }
    const file = picked, ref = refFile, piece = ref ? '' : $('f-piece').value, perf = perfFile, win = sentWindow();
    
    
    const told = JSON.stringify({ meta: S.health.meta || {}, replicate: S.health.replicate || {}, openrouter: S.health.openrouter || {},
      ...(S.health.openWeights ? { openWeights: S.health.openWeights } : {}), ...(S.health.framingTip ? { framingTip: S.health.framingTip } : {}),
      ...(S.health.voiceOut ? { voiceOut: S.health.voiceOut } : {}) });
    
    const tip = tipOffered(S.health) && $('f-tip').checked;
    const retake = S.retake && HEX32.test(S.retake.of || '') ? { ...S.retake } : null;
    const makeForm = () => {
      const f = new FormData();
      f.append('video', file, file.name);
      if (ref) f.append('reference', ref, ref.name);
      else if (piece) f.append('piece', piece);
      if (perf) f.append('performance', perf, perf.name);
      if (start != null) f.append('start', String(start));
      if (win) f.append('windowS', String(win));
      f.append('consent', 'yes');
      if (adult) f.append('adult', 'yes');
      if (tip) f.append('framingTip', 'yes');
      f.append('told', told);
      
      if (retake) { f.append('retakeOf', retake.of); if (retake.sameScore && !ref && !piece) f.append('sameScore', 'yes'); }
      return f;
    };
    setUploading(true);
    try {
      const { id, key } = await uploadAuthed(makeForm);
      keepJobKey(id, key);                       
      S.retake = null;
      clearPerf();                               
      setUploading(false);
      setJobUrl(id);
      openJob(id, file.name);
    } catch (err) {
      setUploading(false);
      upMsg(err.message, err.status === -1 ? 'ok' : 'err');
      
      if (err.status === 400 || err.status === 409) S.healthReady = loadHealth();
    }
  }

  

  const TIPS = [
    [/audio|sound|silent/i, 'Make sure the video has sound: the notes are heard from the audio.'],
    [/keyboard|keys?\b/i, 'Keep one end of the keyboard and both of your hands fully in the picture, filming from above and behind your hands.'],
    [/too large|too big|over 400|413/i, 'A long video is fine, but the file must be under 400 MB: record at 1080p or lower, or trim it to the part you want feedback on.'],
    [/format|codec|decode|read/i, 'Export the video as MP4 (H.264) and try again.'],
  ];
  
  
  
  const VIDEO_LEAD = ['I could not hear the piano in your video.', 'I could not find the keyboard in your video.',
    'Your video is too long or too large for me.', 'I could not read this video file.'];
  const SERVER_FAULT = /Traceback|checkpoint|\/root\/|[A-Z_]{6,} to its path|No such file|ModuleNotFoundError|ImportError|MemoryError|out of memory/;
  const CRASH = /\b[A-Z]\w*(Error|Exception)\b/;
  
  const TIMED_OUT = /^This take was stopped: it ran past the /;
  const OUR_SIDE = 'Something went wrong on our side, not with your video. Please try again later, or email hello@museverse.xyz with the job number under Details.';

  function stepState(s) { return s.state || (s.ok === false ? 'failed' : s.ok ? 'done' : 'waiting'); }
  
  function stepLi(s, times = true) {
    const st = stepState(s);
    
    
    const icon = st === 'done' ? ICON_OK : st === 'failed' || st === 'refused' ? ICON_X : st === 'skipped' ? ICON_SKIP : '';
    const word = { waiting: 'waiting', running: 'running', done: 'done', failed: 'failed', skipped: 'skipped', refused: 'stopped here' }[st] || st;
    return `<li class="${esc(st)}"><span class="st" aria-hidden="true">${icon}</span>`
      + `<span class="lab">${esc(s.label || s.id)}<span class="sr-only">, ${word}</span>${times && s.note ? `<span class="note">${esc(s.note)}</span>` : ''}</span>`
      + (times ? `<span class="t mono">${st === 'running' || st === 'skipped' ? st : esc(fmtMs(s.ms))}</span>` : '') + '</li>';
  }
  const stepsHtml = (steps) => (steps || []).map((s) => stepLi(s)).join('');
  
  
  
  const PLAIN_STEPS = [['Reading your video', ['prepare']], ['Listening to the notes', ['notes']],
    ['Finding your hands', ['hands', 'keyboard', 'fingers']], ['Writing your feedback', ['analysis', 'voice']],
    ['Composing the lesson', ['lesson']]];
  function plainStepsHtml(steps) {
    const by = new Map((steps || []).map((s) => [s.id, stepState(s)]));
    if ([...by.keys()].some((id) => !PLAIN_STEPS.some(([, ids]) => ids.includes(id)))) return (steps || []).map((s) => stepLi(s, false)).join('');
    
    return PLAIN_STEPS.filter(([, ids]) => ids[0] !== 'lesson' || by.has('lesson')).map(([label, ids]) => {
      const sts = ids.map((id) => by.get(id) || 'waiting');
      
      const state = sts.includes('failed') ? 'failed' : sts.includes('refused') ? 'refused' : sts.every((x) => x === 'skipped') && by.has(ids[0]) ? 'skipped'
        : sts.every((x) => x === 'done' || x === 'skipped') ? 'done' : sts.some((x) => x !== 'waiting') ? 'running' : 'waiting';
      return stepLi({ label, state }, false);
    }).join('');
  }
  function showSteps(steps) {
    const html = plainStepsHtml(steps);
    if ($('pr-steps').dataset.html !== html) { $('pr-steps').innerHTML = html; $('pr-steps').dataset.html = html; }
    const tech = stepsHtml(steps);
    if ($('pr-tech').dataset.html !== tech) { $('pr-tech').innerHTML = tech; $('pr-tech').dataset.html = tech; }
  }
  
  const plainStep = (s) => String(s || 'Working').replace(/\s*\([^)]*\)\s*$/, '');

  function resetProgress(id, name) {
    $('h-progress').textContent = 'Analysing your take';
    $('pr-bar').classList.remove('stopped');
    $('pr-name').textContent = name || '';
    $('pr-id').textContent = id;
    $('pr-step').textContent = 'Checking the job...';
    $('pr-eta').textContent = '';
    $('pr-copied').textContent = '';
    $('pr-details').open = false;
    for (const el of [$('pr-steps'), $('pr-tech')]) { el.innerHTML = ''; delete el.dataset.html; }
    showSteps([]);
    $('pr-fail').hidden = true;
    $('pr-comeback').hidden = false;
    $('pr-code-note').hidden = !(!token && (code || jobKey(id)));   
    $('pr-retry').hidden = true;
    setBar($('pr-bar'), 0);
  }
  function setBar(el, frac) {
    const pct = Math.round(clamp(+frac || 0, 0, 1) * 100);
    el.firstElementChild.style.width = `${pct}%`;
    el.setAttribute('aria-valuenow', String(pct));
  }
  function renderProgress(st) {
    setBar($('pr-bar'), st.status === 'done' ? 1 : st.progress);
    
    const ahead = Number.isFinite(+st.ahead) ? +st.ahead : null;
    const step = st.status === 'queued' ? (ahead == null ? 'Waiting for the analysis machine: it works on one take at a time.'
      : ahead > 0 ? `Waiting: ${ahead} ${ahead === 1 ? 'take' : 'takes'} ahead of yours. The analysis machine works on one take at a time.`
        : 'Yours is next: the analysis machine is getting ready.')
      : st.status === 'running' ? `${plainStep(st.step)}...` : st.status === 'done' ? 'Done. Loading your results...' : '';
    if ($('pr-step').textContent !== step) $('pr-step').textContent = step;
    $('pr-eta').textContent = st.status === 'running' ? fmtEta(st.etaS)
      : st.status === 'queued' && Number.isFinite(+st.startS) && +st.startS > 0 ? `starts in ${durWords(+st.startS)}` : '';
    showSteps(st.steps);
  }
  
  function filmCard(slot) {
    const el = $(slot);
    if (el && !el.firstElementChild) el.appendChild($('film-tpl').content.cloneNode(true));
  }
  
  
  
  const REFUSAL_TIP = {
    too_short: 'Start filming before you play, and keep going to the end of the passage.',
    no_piano_heard: 'Keep the sound on, with the phone or glasses close to the piano.',
    wrong_piece: 'Choose the piece you play from the list, or leave it out and I will find it myself.',
    hands_not_found: 'Keep both of your hands and the keys fully in the picture, filming from above and behind your hands.',
  };
  const refusalOf = (x) => (x && typeof x === 'object' && typeof x.message === 'string' && x.message.trim() ? { code: String(x.code || ''), message: x.message } : null);
  
  function progressFail(error, { steps, retry = false, lead = '', refusal = null } = {}) {
    const err = String(error || '');
    if (refusal) {
      $('pr-fail').hidden = false;
      $('pr-comeback').hidden = true;
      $('pr-err').textContent = `${refusal.message}${refusal.code ? ` (${refusal.code})` : ''}`;
      $('pr-step').textContent = 'Stopped.';
      $('pr-eta').textContent = '';
      $('pr-bar').classList.add('stopped');
      if (steps && steps.length) showSteps(steps);
      $('h-progress').textContent = 'No lesson from this take';
      document.title = `${$('h-progress').textContent} - Museverse Teacher`;
      $('pr-lead').textContent = refusal.message;
      const tip = REFUSAL_TIP[refusal.code];
      $('pr-tips').innerHTML = tip ? `<li>${esc(tip)}</li>` : '';
      $('pr-tips').hidden = !tip;
      $('pr-try').hidden = !tip;
      
      if (tip && refusal.code !== 'wrong_piece') filmCard('pr-film');
      $('pr-film').hidden = refusal.code === 'wrong_piece';
      $('pr-retry').hidden = true;
      return;
    }
    $('pr-film').hidden = false;
    $('pr-fail').hidden = false;
    $('pr-comeback').hidden = true;                                 
    $('pr-err').textContent = err || 'The server did not say why.';
    $('pr-step').textContent = 'Stopped.';
    $('pr-eta').textContent = '';
    $('pr-bar').classList.add('stopped');
    if (steps && steps.length) showSteps(steps);
    const timedOut = !retry && TIMED_OUT.test(err);
    const k = timedOut ? -1 : TIPS.findIndex(([re]) => re.test(err));
    const ours = !retry && !timedOut && (SERVER_FAULT.test(err) || (k < 0 && CRASH.test(err)));
    $('h-progress').textContent = retry ? 'Your results could not be loaded' : 'This take could not be analysed';
    document.title = `${$('h-progress').textContent} - Museverse Teacher`;
    $('pr-lead').textContent = retry ? lead || 'Your results could not be loaded just now. Check again in a moment.'
      : timedOut ? err : ours ? OUR_SIDE : k >= 0 ? VIDEO_LEAD[k] : 'The analysis stopped before it finished.';
    
    
    const tips = timedOut ? [] : TIPS.filter(([re]) => re.test(err)).map(([, t]) => t).slice(0, 1);
    $('pr-tips').innerHTML = tips.map((t) => `<li>${esc(t)}</li>`).join('');
    $('pr-tips').hidden = !tips.length;
    $('pr-try').hidden = retry || ours || timedOut;
    if (!retry && !ours && !timedOut) filmCard('pr-film');
    $('pr-retry').hidden = !retry;
  }
  async function gone() {
    if (S.job) dropTake(S.job);                    
    setJobUrl(null, true);
    showHome({ to: 'upload', focus: false });
    const my = S.poll;
    await S.healthReady;                                  
    if (my === S.poll) globalMsg(`That result is not here any more: results are kept for ${keepText()}, or the link is incomplete. Upload the video again for a new analysis.`);
  }

  async function openJob(id, name) {
    stopEverything();
    globalMsg('');
    S.kind = 'job'; S.job = id; S.demo = null; S.name = name || ''; S.result = null;
    resetProgress(id, name);
    document.title = 'Analysing your take - Museverse Teacher';
    show('progress');
    const my = ++S.poll;
    let fails = 0;
    while (my === S.poll) {
      let st;
      try {
        st = await getJSON(`jobs/${encodeURIComponent(id)}`);
        fails = 0;
      } catch (e) {
        if (my !== S.poll) return;
        if (e.status === 404) return gone();
        if (e.status === 401) return progressFail(e.message, { retry: true, lead: e.message });
        fails++;
        $('pr-step').textContent = `Lost the connection to the server; trying again (${fails})...`;
        await sleep(Math.min(15000, POLL_MS * 2 ** Math.min(fails, 4)));
        continue;
      }
      if (my !== S.poll) return;
      if (st.name && !S.name) { S.name = st.name; $('pr-name').textContent = st.name; }   
      renderProgress(st);
      if (st.status === 'done') return loadResult(id, my);
      if (st.status === 'refused') return progressFail(st.error, { steps: st.steps, refusal: refusalOf(st.refusal) || { code: '', message: String(st.error || 'This take could not give a lesson.') } });
      if (st.status === 'failed') return progressFail(st.error, { steps: st.steps });
      await sleep(POLL_MS);
    }
  }

  async function loadResult(id, my) {
    let r;
    try { r = await getJSON(`jobs/${encodeURIComponent(id)}/result`); } catch (e) {
      if (my !== S.poll) return;
      return progressFail(e.message, { retry: true });
    }
    if (my !== S.poll) return;
    if (!r || !r.job || r.job.status !== 'done') {
      return progressFail((r && r.job && r.job.error) || 'The analysis did not finish.', { steps: r && r.pipeline && r.pipeline.steps,
        refusal: r && r.job && r.job.status === 'refused' ? refusalOf(r.job.refusal || r.refusal) : null });
    }
    S.result = r;
    if (museFor(r)) return openMuse(r);
    renderResults(r);
  }

  
  
  
  
  
  
  const hasLesson = (r) => !!(r && r.lesson && r.lesson.view && typeof r.lesson.view === 'object' && Array.isArray(r.lesson.view.fixes)
    && Array.isArray(r.lesson.view.lines));
  const museFor = (r) => !!window.MVMuse && S.kind === 'job' && !S.details && hasLesson(r) && ((r.stage && r.stage.kind) || 'video') === 'video';
  
  
  async function museMedia(r, rel) {
    const url = new URL(`jobs/${encodeURIComponent(S.job)}/${rel}`, API);
    const key = r.media && /^[0-9a-f]{32}$/.test(r.media.videoKey || '') ? r.media.videoKey : '';
    if (!token || key) return url.href + (key ? `?k=${key}` : '');
    const u = URL.createObjectURL(await (await apiFetch(url)).blob());
    S.museUrls.push(u);
    return u;
  }
  async function openMuse(r) {
    const id = S.job, my = S.poll;
    show('muse', { focus: false });
    document.title = `${S.name || 'Your lesson'} - Museverse Teacher`;
    const rel = r.media && /^[\w./-]+$/.test(r.media.video || '') && !r.media.video.includes('..') && !r.media.video.startsWith('/') ? r.media.video : 'media/video.mp4';
    let video = null, voice = null;
    try { video = await museMedia(r, rel); } catch (e) { if (my === S.poll) globalMsg(`The video could not be loaded: ${e.message}`); }
    
    
    if (r.voicePack && r.voicePack.clips && typeof r.voicePack.clips === 'object') {
      try { voice = await museMedia(r, 'media/voice.mp4'); } catch { voice = null; }
    }
    if (my !== S.poll) return;
    S.museRows = [];
    if (S.job) keepTake(S.job, r);
    try {
      window.MVMuse.open({
      root: $('muse-view'), id, name: S.name || '', video, voice, res: r,
      
      models: S.health && S.health.modelTable && typeof S.health.modelTable === 'object' ? S.health.modelTable : null,
      
      tile: (tid) => (/^t\d{2,3}$/.test(String(tid)) ? museMedia(r, `score/${tid}`) : Promise.resolve(null)),
      back: () => goHome(),
      details: () => { setUrl('job', id, false, 'details'); route(); },
      
      retake: () => { if (retakeFinding(r)) startRetake(); else goHome('upload'); },
      });
    } catch (e) {
      
      console.error('MVMuse.open:', e);
      try { window.MVMuse.close(); } catch {   }
      renderResults(r);
    }
  }

  

  function fmtVal(v, unit) {
    if (v == null || !Number.isFinite(+v)) return 'n/a';
    v = +v;
    if (unit === 'share') return `${Math.round(v * 100)}%`;
    if (unit === 'ms') return `${Math.round(v)} ms`;
    if (unit === 'mm') return `${Math.round(v)} mm`;
    if (unit === 'deg') return `${Math.round(v)} degrees`;
    if (unit === 'notes') return String(Math.round(v));
    if (!unit) return v.toFixed(Math.abs(v) < 10 ? 2 : 0);
    return `${+v.toFixed(2)} ${unit}`;
  }
  
  function ratioText(r, ref) {
    if (r >= 1.1) return `about ${r.toFixed(1)} times ${ref}`;
    if (r > 0.9) return `about the same as ${ref}`;
    return `about ${Math.round(r * 100)}% of ${ref}`;
  }
  
  
  
  
  
  function evidenceText(ev) {
    if (!ev || ev.value == null) return '';
    const label = cap(METRIC[ev.metric] || ev.metric || 'measure');
    const ref = ev.usual != null ? ev.usual : ev.baseline, refWord = ev.usual != null ? 'your usual' : 'your other phrases';
    let s;
    if (!ev.unit && ref != null && +ref > 0 && Number.isFinite(+ev.value)) s = `${label}: ${ratioText(+ev.value / +ref, refWord)}`;
    else {
      s = `${label}: ${fmtVal(ev.value, ev.unit)}`;
      if (ref != null) s += ` (${refWord}: ${fmtVal(ref, ev.unit)})`;
    }
    if (ev.phrasesFlagged && ev.phrasesMeasured) s += `, in ${ev.phrasesFlagged} of the ${ev.phrasesMeasured} phrases where it could be measured`;
    else if (ev.phrasesFlagged) s += `, in ${plural(+ev.phrasesFlagged, 'phrase', 'phrases')}`;
    if (ev.barNumbers && Array.isArray(ev.bars) && ev.bars.length) {
      const bs = [...new Set(ev.bars.map((b) => b.bar))];
      s += `, in bar${bs.length > 1 ? 's' : ''} ${bs.slice(0, 8).join(', ')}${bs.length > 8 ? ' and more' : ''}`;
    }
    return s;
  }
  function strengthEvidence(g) {
    if (g.value == null) return '';
    const label = cap(METRIC[g.metric || ITEM_METRIC[g.item]] || g.metric || 'measure');
    const n = +g.measuredPhrases || 0, rg = Array.isArray(g.range) && g.range.length === 2 ? g.range : null;
    
    const read = Number.isFinite(+g.readPairs) && +g.fastPairs > 0 && g.readPairs != null ? `, read on ${g.readPairs} of the ${g.fastPairs} quick note pairs` : '';
    return `${label}: ${fmtVal(g.value, g.unit)}`
      + (rg ? ` (from ${fmtVal(rg[0], g.unit)} to ${fmtVal(rg[1], g.unit)} across ${plural(n, 'phrase', 'phrases')})` : n ? `, across ${plural(n, 'phrase', 'phrases')}` : '') + read;
  }
  
  const SRC = { muse: 'Worded by Muse', openrouter: 'Worded by Muse Spark via OpenRouter', 'openrouter-glimmer': 'Worded by Muse Glimmer via OpenRouter',
    open: 'Worded by Muse Spark Open (open weights)', glimmer: 'Worded by Muse Glimmer (our server)', fixed: 'Written from our fixed lines (no AI)' };
  
  
  
  const srcText = (src, r) => {
    const p = src === 'open' && r && r.pipeline;
    const by = p && (p.voiceAuthor || (p.voiceNote && p.voiceNote.author));
    return typeof by === 'string' && by ? `Worded by ${by}` : SRC[src];
  };
  
  const whatOf = (f) => f.what || f.say || '';
  const practiseOf = (f) => (Array.isArray(f.practise) && f.practise.length ? f.practise.filter(Boolean) : f.tip ? [f.tip] : []);
  const hearText = (f) => { const p = practiseOf(f)[0]; return [whatOf(f), p ? `Try this: ${p}` : ''].filter(Boolean).join(' '); };
  
  
  
  function momentsOf(f) {
    const mo = f.evidence && Array.isArray(f.evidence.moments) ? f.evidence.moments.filter((m) => m && Number.isFinite(+m.fromS)) : [];
    const out = mo.map((m) => [+m.fromS, Number.isFinite(+m.toS) ? Math.max(+m.toS, +m.fromS) : +m.fromS]);
    if (!out.length) return [[+f.fromS || 0, Math.max(+f.toS || 0, +f.fromS || 0)]];
    if (f.fromS != null && Number.isFinite(+f.fromS)) {
      const a = +f.fromS, b = Math.max(+f.toS || a, a);
      let k = out.findIndex((m) => Math.abs(m[0] - a) < 0.05);
      if (k < 0) k = out.findIndex(([x, y]) => y >= a && x <= b);
      if (k > 0) out.unshift(out.splice(k, 1)[0]);
    }
    return out;
  }
  const isQuest = (r) => r.source === 'quest' || (r.stage && r.stage.kind === 'hands');
  
  
  
  
  const scoreListsShown = (r) => {
    const ref = (r && r.reference) || {};
    if (typeof ref.listsShown === 'boolean') return ref.listsShown;
    return isQuest(r) || midiNotes(r) || (r.findings || []).some((f) => /^(wrong|missed|extra)_notes$/.test(f.item || ''));
  };
  
  
  
  
  const ENOUGH_PLAYING = { phrases: 4, seconds: 30 };
  function notJudged(r) {
    const st = (r.summary && r.summary.stats) || {};
    if ('notes' in st && !st.notes) return 'no notes';
    const cov = r.coverage || (r.analysis && r.analysis.coverage);
    if (cov) return cov.tooShort ? ((+cov.phrases || 0) >= ENOUGH_PLAYING.phrases && (+st.durationS || 0) >= ENOUGH_PLAYING.seconds ? 'nothing judged' : 'too short') : null;
    return 'phrases' in st && st.phrases < 2 ? 'too short' : null;
  }
  const NOT_JUDGED = {
    'no notes': 'No piano notes were heard in this take, so there was nothing to judge. Try again with the piano clearly audible, with a few phrases or more of playing.',
    'too short': 'This take was too short to judge your technique. Record a few phrases or more of playing so there is enough to compare.',
    'nothing judged': 'This take had enough playing, but nothing I can judge about your technique came up often enough in it.',
  };

  
  
  
  
  const titleOf = (f, dflt = 'Finding') => f.title || cap(String(f.item || dflt).replace(/_/g, ' '));
  
  const handWord = (f) => HAND[f.hand] || PART[f.part] || (f.item === 'hands_apart' ? 'Both hands' : '');
  const whereWord = () => (S.stage === 'hands' ? 'in the take' : 'in your video');
  
  
  
  
  function fchipsHtml(f) {
    const ch = Array.isArray(f.chips) ? f.chips : [];
    if (!ch.length || !isFinger(f)) return '';
    const rgb = HAND_RGB[f.hand] || '156,163,175';
    const head = (title, a, b) => `<div class="refbar-h"><h5>${esc(title)}</h5>${Number.isFinite(+a) && a != null ? `<button type="button" class="btn btn-sm timebtn" data-act="bar" data-a="${+a}" data-b="${Number.isFinite(+b) && b != null ? +b : +a + 1.5}" aria-label="Play ${esc(title.toLowerCase())}">${ICON_PLAY}${esc(at(+a))}</button>` : ''}</div>`;
    if (f.item === 'finger_differs') {
      
      const anyRead = ch.some((b) => (b.notes || []).some((c) => c.read != null));
      const chip = (c) => {
        const alt = Array.isArray(c.alt) && c.alt.length ? ` or ${c.alt.join(' or ')}` : '';
        const read = c.read == null ? '' : c.read === '?' ? ', not read' : `, read ${c.read}`;
        return `<li class="nchip${c.diff ? ' diff' : ''}" style="--hand:${rgb}" aria-label="${esc(`${noteName(c.midi)}, the lesson shows finger ${c.finger || 'none'}${alt}${read}`)}">`
          + `<span class="nm">${esc(noteName(c.midi))}</span>${c.finger ? `<span class="fg">${esc(String(c.finger))}</span>` : ''}${c.read != null ? `<span class="rd">${esc(String(c.read))}</span>` : ''}</li>`;
      };
      return `<div class="fchips"><h5>${anyRead ? "The lesson's fingering, and the fingers read" : "The lesson's fingering"}</h5>${ch.map((b) => `<div class="refbar">${head(`Bar ${b.bar}${+b.pass > 1 ? `, ${ORD[b.pass] || ''}` : ''}`, b.fromS, b.toS)}<ul class="nchips" role="list">${(b.notes || []).map(chip).join('')}</ul></div>`).join('')}
        <p class="small muted">Each note as written with the finger the lesson shows (1 is the thumb)${anyRead ? ', then the finger the hand tracking read (? where it could not tell)' : ''}. A note outside every fingering the lesson's sources accept is outlined.</p></div>`;
    }
    if (f.item === 'finger_inconsistent') {
      const chip = (c) => `<li class="nchip${c.diff ? ' diff' : ''}" style="--hand:${rgb}" aria-label="${esc(`${noteName(c.midi)}, finger ${c.first} the first time, ${c.later} later`)}">`
        + `<span class="nm">${esc(noteName(c.midi))}</span><span class="fg">${esc(String(c.first))}</span><span class="pl">${esc(String(c.later))}</span></li>`;
      return `<div class="fchips"><h5>Your fingers, the first time and later</h5>${ch.map((p) => `<div class="refbar">${head(`From ${at(p.fromS)}, back at ${at(p.laterS)}`, p.fromS, p.laterS)}<ul class="nchips" role="list">${(p.notes || []).map(chip).join('')}</ul></div>`).join('')}
        <p class="small muted">Each note with the finger the hand tracking read the first time, then later (1 is the thumb). These are your own fingerings; a note where they differ is outlined.</p></div>`;
    }
    return '';
  }
  function adviceHtml(f) {
    const what = whatOf(f), practise = practiseOf(f);
    return `<div class="adv">
        ${what ? `<div><h5>What I saw</h5><p class="say">${esc(what)}</p></div>` : ''}
        ${fchipsHtml(f)}
        ${f.reference ? `<div class="adv-ref"><h5>The reference recording</h5><p>${esc(f.reference)}</p></div>` : ''}
        ${f.why ? `<div><h5>Why it matters</h5><p>${esc(f.why)}</p></div>` : ''}
        ${practise.length ? `<div><h5>How to practise</h5><ol class="practise" role="list">${practise.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>` : ''}
        ${f.check ? `<div class="callout"><h5>Check yourself</h5><p>${esc(f.check)}</p></div>` : ''}
        ${f.fine ? `<p class="fine"><b>When this is fine:</b> ${esc(f.fine)}</p>` : ''}
      </div>`;
  }
  
  const confLine = (f) => (CONF[f.confidence] ? `This one is ${f.confidence === 'rough' ? 'a rough estimate' : 'measured'}: ${((isFinger(f) && CONF_FINGER[f.confidence]) || CONF[f.confidence][1]).replace(/^./, (c) => c.toLowerCase())}.` : '');
  function moreHtml(f, i) {
    const ev = evidenceText(f.evidence), mo = momentsOf(f), more = mo.slice(1, 8);
    const facts = [handWord(f), srcText(f.source, S.result)].filter(Boolean).join(' · ');
    return `<details class="find-more">
        <summary>More about this</summary>
        <div class="find-more-body">
          ${more.length ? `<p class="also"><span>Also around</span>${more.map((m, j) => `<button type="button" class="btn btn-sm timebtn" data-act="moment" data-i="${i}" data-m="${j + 1}" aria-label="Play ${esc(span(m[0], m[1]))} ${whereWord()}">${esc(at(m[0]))}</button>`).join('')}${mo.length > 8 ? `<span class="muted">and ${mo.length - 8} more</span>` : ''}</p>` : ''}
          ${ev ? `<p class="evidence">${esc(ev)}</p>` : ''}
          ${confLine(f) ? `<p class="conf">${esc(confLine(f))}</p>` : ''}
          ${facts ? `<p class="srcline">${esc(facts)}</p>` : ''}
        </div>
      </details>`;
  }
  
  
  const handTail = (x) => (handWord(x) ? `, ${handWord(x).toLowerCase()}` : '');
  const hearBtn = (f, i) => `<button type="button" class="btn btn-sm" data-act="say" data-i="${i}" aria-label="Read aloud: ${esc(titleOf(f, 'this advice'))}${esc(handTail(f))}">${ICON_SPEAK}Read aloud</button>`;
  
  function retakeBtn(f) {
    if (S.kind !== 'job' || S.stage !== 'video' || !S.result || retakeFinding(S.result) !== f) return '';
    const x = retakeTarget(S.result, f);
    return `<button type="button" class="btn btn-sm" data-act="retake" aria-describedby="retake-tip">${ICON_CAM}Film ${esc(x.label)} again</button>
      <span class="sr-only" id="retake-tip">Opens the upload, set up to film this part again and compare it with this take</span>`;
  }
  function mainCard(f, i) {
    const [a, b] = momentsOf(f)[0], hand = handWord(f);
    return `<article class="glass find main" id="find-${i}" aria-labelledby="find-${i}-t">
      <div class="find-head">
        ${hand ? `<p class="find-eyebrow h-${f.hand === 'L' || f.hand === 'R' ? f.hand : 'B'}">${esc(hand)}</p>` : ''}
        <h4 class="find-title" id="find-${i}-t">${esc(titleOf(f))}</h4>
      </div>
      <div class="row find-actions">
        <button type="button" class="btn btn-sm timebtn" data-act="seek" data-i="${i}" aria-label="Play this moment, ${esc(span(a, b))} ${whereWord()}">${ICON_PLAY}Play this moment <span class="t">${esc(at(a))}</span></button>
        ${hearBtn(f, i)}
        ${retakeBtn(f)}
      </div>
      ${adviceHtml(f)}
      ${moreHtml(f, i)}
    </article>`;
  }
  function rowCard(f, i) {
    const [a, b] = momentsOf(f)[0], meta = [handWord(f), `around ${at(a)}`].filter(Boolean).join(' · ');
    return `<article class="find minor" id="find-${i}" aria-labelledby="find-${i}-t">
      <div class="row-head">
        <button type="button" class="row-toggle" aria-expanded="false" aria-controls="find-${i}-body"><span class="row-text"><span class="row-title" id="find-${i}-t">${esc(titleOf(f))}</span><span class="row-meta">${esc(meta)}</span></span>${ICON_CHEV}</button>
        <button type="button" class="btn icon-btn timebtn" data-act="seek" data-i="${i}" aria-label="Play this moment, ${esc(span(a, b))} ${whereWord()}">${ICON_PLAY}</button>
      </div>
      <div class="find-body" id="find-${i}-body" hidden>
        <div class="row find-actions">${hearBtn(f, i)}</div>
        ${adviceHtml(f)}
        ${moreHtml(f, i)}
      </div>
    </article>`;
  }
  function findingsHtml(fs) {
    return mainCard(fs[0], 0) + (fs.length > 1 ? `<h4 class="also-h">Also worth a look</h4>${fs.slice(1).map((f, k) => rowCard(f, k + 1)).join('')}` : '');
  }
  function openRow(i, open = true) {
    const card = $(`find-${i}`);
    if (!card || !card.classList.contains('minor')) return;
    card.querySelector('.row-toggle').setAttribute('aria-expanded', String(open));
    $(`find-${i}-body`).hidden = !open;
  }
  
  
  
  const nextTakeBtn = () => `<div class="row"><button type="button" class="btn btn-sm" data-act="new">${S.kind === 'demo' || S.kind === 'sample' ? 'Analyse my video' : 'New take'}</button></div>`;
  
  
  const RETAKE_SHORT_CARD = 'A short re-take is fine: what changed since your first take is in Before and after. Judging your technique needs a few phrases or more of playing.';
  function nothingHtml(r, strengths) {
    const nj = notJudged(r);
    if (nj === 'too short' && r.retakeOf && (S.kind === 'job' || S.kind === 'sample') && !isQuest(r)) {
      return `<div class="glass find-none"><h4>A short re-take</h4><p>${esc(RETAKE_SHORT_CARD)}</p></div>`;
    }
    if (nj) return `<div class="glass find-none"><h4>${nj === 'nothing judged' ? 'Nothing it can judge came up' : 'Not enough to judge'}</h4><p>${esc(NOT_JUDGED[nj])}</p>${nextTakeBtn()}</div>`;
    const m = /what I could judge: ([^.]+)\./i.exec((r.summary && r.summary.say) || '');
    return `<div class="glass find-none"><h4>Nothing stood out</h4>
      <p>${m ? `I looked at ${esc(m[1])}: none of it stood out as a problem.` : 'Nothing in what this take lets me judge stood out as a problem.'}${strengths ? ' See what went well below.' : ''}</p>
      <p class="muted">Try recording a passage you find hard.</p>${nextTakeBtn()}</div>`;
  }
  
  function wellItem(g, i) {
    const title = titleOf(g, 'Done well');
    return `<li class="find well" id="well-${i}"><span class="tick" aria-hidden="true">${ICON_OK}</span><span class="well-say">${esc(g.say || title)}</span>`
      + `${g.say ? `<button type="button" class="btn icon-btn hear" data-act="praise" data-i="${i}" aria-label="Read aloud: ${esc(title)}${esc(handTail(g))}">${ICON_SPEAK}</button>` : ''}</li>`;
  }
  
  const WELL_SHOWN = 4;
  function wellsHtml(strengths) {
    const items = strengths.map(wellItem);
    if (items.length <= WELL_SHOWN + 1) return items.join('');
    return items.slice(0, WELL_SHOWN).join('') + `<li class="well-more"><details class="disclose"><summary>Show ${items.length - WELL_SHOWN} more</summary>`
      + `<ul class="wells" role="list">${items.slice(WELL_SHOWN).join('')}</ul></details></li>`;
  }
  
  function evidenceHtml(findings, strengths) {
    const who = (x) => (handWord(x) ? ` (${handWord(x).toLowerCase()})` : '');
    const rows = findings.map((f) => {
      const t = titleOf(f), conf = CONF[f.confidence];
      let ev = evidenceText(f.evidence);
      
      if (ev.toLowerCase().startsWith(`${t.toLowerCase()}: `)) ev = ev.slice(t.length + 2);
      return `<li><b>${esc(t)}</b>${esc(who(f))}: ${esc(ev || 'no measure given')}.${conf ? ` ${esc(conf[0])}.` : ''}</li>`;
    }).concat(strengths.map((g) => {
      const ev = strengthEvidence(g);
      return ev ? `<li><b>${esc(titleOf(g, 'Done well'))}</b>${esc(who(g))}: ${esc(ev)}.</li>` : '';
    }));
    return rows.join('') || '<li>No measures are given for this take.</li>';
  }

  
  
  
  
  
  
  const ORD = { 1: 'the first time', 2: 'the second time', 3: 'the third time' };
  
  function refHtml(ref, quest, lists = true) {
    const F = ref.fields || {}, col = (kind, name, dflt) => { const k = (F[kind] || []).indexOf(name); return k >= 0 ? k : dflt; };
    const note = ref.level === 'note', pieces = Array.isArray(ref.pieces) ? ref.pieces : [];
    const barsOn = (pid) => { const p = pieces.find((x) => x.id === pid); return !!(p && p.barNumbers); };
    const handOf = (h) => (h === 'L' ? 'left hand' : h === 'R' ? 'right hand' : '');
    const where = (r, kind) => {
      if (!note) return '';
      const bar = r[col(kind, 'bar', -1)], pass = r[col(kind, 'pass', -1)], pid = r[col(kind, 'piece', -1)], hand = r[col(kind, 'hand', -1)];
      const parts = [];
      if (barsOn(pid) && bar != null) parts.push(`bar ${bar}${+pass > 1 ? `, ${ORD[pass] || `pass ${pass}`}` : ''}`);
      if (hand) parts.push(handOf(hand));
      return parts.length ? `${parts.join(', ')}: ` : '';
    };
    const list = (title, rows, kind, fmt) => {
      if (!rows || !rows.length) return '';
      const shown = rows.slice(0, 12).map((r) => `<li><button type="button" class="btn btn-sm timebtn" data-act="t" data-t="${+r[0]}" aria-label="Play from ${at(r[0])}">${at(r[0])}</button> ${esc(cap(where(r, kind)) + fmt(r))}</li>`).join('');
      return `<h4>${title}</h4><ul>${shown}${rows.length > 12 ? `<li class="muted">and ${rows.length - 12} more</li>` : ''}</ul>`;
    };
    const wrongCol = col('wrong', 'played', 2);
    const lines = [];
    const located = pieces.filter((p) => p.located), lost = pieces.filter((p) => !p.located);
    for (const p of located) {
      const span = p.barNumbers && p.firstBar && p.lastBar
        ? `bar ${p.firstBar.bar}${p.firstBar.pass > 1 ? ` (${ORD[p.firstBar.pass] || ''})` : ''} to bar ${p.lastBar.bar}${p.lastBar.pass > 1 ? ` (${ORD[p.lastBar.pass] || ''})` : ''}`
        : `${mmss(p.refFrom)} to ${mmss(p.refTo)} of the score`;
      lines.push(`Compared note by note with ${p.title || 'your score'}, ${span}.`);
      if (Array.isArray(p.alsoAt) && p.alsoAt.length && p.barNumbers) {
        const bs = [...new Set(p.alsoAt.map((a) => a.firstBar && a.firstBar.bar).filter((b) => b != null))];
        if (bs.length) lines.push(`The same music also comes at bar${bs.length > 1 ? 's' : ''} ${bs.join(', ')}, so the bars named may be one of those.`);
      }
      if (p.sameNotesAs) lines.push("This take's notes are the song's own MIDI, so they match it by construction.");
      const unjudged = Object.entries(p.hands || {}).filter(([, v]) => !v).map(([h]) => handOf(h));
      if (unjudged.length) lines.push(`The ${unjudged.join(' and ')} is not compared.`);
    }
    if (lost.length) lines.push(`Not found in this take: ${lost.map((p) => p.title).filter(Boolean).join(', ')}.`);
    if (ref.level === 'group' && ref.why) lines.push(`${cap(ref.why)}.`);
    if (note && (ref.outside || []).length) lines.push(`${plural(ref.outside.length, 'note was', 'notes were')} ${quest ? 'played' : 'heard'} outside the score's passages and not compared.`);
    
    
    
    const slipped = +((ref.slips || {}).pairs) || 0;
    if (slipped) lines.push(`${plural(slipped, 'note was', 'notes were')} ${quest ? 'played' : 'heard'} within half a second of where the score expected ${slipped === 1 ? 'it' : 'them'}, but not where the score's alignment placed ${slipped === 1 ? 'it' : 'them'}: that may be the alignment's slip or a note out of its place, so ${slipped === 1 ? 'it is' : 'they are'} not counted as missed or added.`);
    if (!lists) lines.push('The sound alone mishears and misses notes, so these counts are not a list of your slips: a note is named only when the differences are large enough to be a finding.');
    
    
    
    const own = located.some((p) => p.sameNotesAs);
    const partial = (note && (ref.outside || []).length) || located.some((p) => Object.values(p.hands || {}).some((v) => !v));
    
    
    const counts = own ? '' : lists
      ? `${+ref.matched || 0} matched · ${(ref.wrong || []).length} wrong · ${(ref.missed || []).length} missed · ${(ref.extra || []).length} extra`
      : `${+ref.matched || 0} matched · ${(ref.wrong || []).length} heard as another note · ${(ref.missed || []).length} not heard · ${(ref.extra || []).length} heard but not in the score`;
    const none = !own && !(ref.wrong || []).length && !(ref.missed || []).length && !(ref.extra || []).length;
    return `<h3 id="h-ref">Against the score</h3>
      <p class="small muted">${esc(ref.name || '')}</p>
      ${lines.map((l) => `<p class="small">${esc(l)}</p>`).join('')}
      ${counts ? `<p class="counts small">${esc(counts)}</p>` : ''}
      ${lists ? list('Wrong notes', ref.wrong, 'wrong', (r) => `expected ${noteName(r[1])}, ${quest ? 'played' : 'heard'} ${noteName(r[wrongCol])}`) : ''}
      ${lists ? list('Missed notes', ref.missed, 'missed', (r) => `${noteName(r[1])} ${quest ? 'missed' : 'not heard'}`) : ''}
      ${lists ? list('Extra notes', ref.extra, 'extra', (r) => `${noteName(r[1])} not in the score`) : ''}
      ${none ? `<p>${partial ? 'Every note compared matched the score.' : 'Every note matched the score.'}</p>` : ''}
      ${note && lists ? barsHtml(ref, pieces) : ''}`;
  }
  
  
  function barsHtml(ref, pieces) {
    const bars = (ref.bars || []).slice(0, 6);
    if (!bars.length) return '';
    const fingered = bars.some((b) => (b.notes || []).some((c) => c.finger));
    
    
    const read = bars.some((b) => (b.notes || []).some((c) => c.read != null));
    const review = pieces.find((p) => p.located && p.fingeringReview);
    const quest = isQuest(S.result || {}) || midiNotes(S.result);   
    const chip = (c) => {
      const cls = c.status === 'wrong' || c.status === 'finger' ? ' diff' : c.status === 'missed' ? ' miss' : c.status === 'outside' ? ' out' : '';
      const rgb = HAND_RGB[c.hand] || '156,163,175';
      const what = c.status === 'wrong' ? `, ${quest ? 'played' : 'heard'} ${noteName(c.played)}` : c.status === 'missed' ? `, ${quest ? 'missed' : 'not heard'}` : '';
      const alt = Array.isArray(c.alt) && c.alt.length ? ` or ${c.alt.join(' or ')}` : '';
      const rd = c.read == null ? '' : c.read === '?' ? ', not read' : `, read ${c.read}`;
      const label = `${noteName(c.midi)}${c.finger ? `, finger ${c.finger}${alt}` : ''}${c.hand ? `, ${c.hand === 'L' ? 'left' : 'right'} hand` : ''}${what}${rd}`;
      return `<li class="nchip${cls}" style="--hand:${rgb}" aria-label="${esc(label)}"><span class="nm">${esc(noteName(c.midi))}</span>`
        + `${c.finger ? `<span class="fg">${esc(String(c.finger))}</span>` : ''}${c.status === 'wrong' ? `<span class="pl">${esc(noteName(c.played))}</span>` : ''}`
        + `${c.read != null ? `<span class="rd">${esc(String(c.read))}</span>` : ''}</li>`;
    };
    const head = (b) => {
      const p = pieces.find((x) => x.id === b.piece) || {};
      const name = p.barNumbers ? `Bar ${b.bar}${+b.pass > 1 ? `, ${ORD[b.pass] || ''}` : ''}` : `Around ${at(b.fromS)}`;
      return `<div class="refbar-h"><h5>${esc(name)}</h5><button type="button" class="btn btn-sm timebtn" data-act="bar" data-a="${+b.fromS}" data-b="${+b.toS}" aria-label="Play ${esc(name.toLowerCase())}">${ICON_PLAY}${esc(at(b.fromS))}</button></div>`;
    };
    return `<h4>The bars with a difference</h4>
      <p class="small muted">${fingered ? `Each note of the bar as written, with the finger the lesson shows (1 is the thumb)${review ? '; a piano teacher has not reviewed this fingering yet' : ''}. ` : 'Each note of the bar as written. '}${read ? 'After it, the finger the hand tracking read (? where it could not tell). ' : ''}A note that differs is outlined, with what was ${quest ? 'played' : 'heard'} instead.</p>
      <div class="refbars">${bars.map((b) => `<div class="refbar">${head(b)}<ul class="nchips" role="list">${(b.notes || []).map(chip).join('')}</ul></div>`).join('')}</div>
      ${(ref.bars || []).length > 6 ? `<p class="small muted">and ${(ref.bars || []).length - 6} more bars</p>` : ''}`;
  }

  

  function renderResults(r) {
    $('r-lesson-row').hidden = !(window.MVMuse && S.kind === 'job' && hasLesson(r));
    const demo = S.kind === 'demo', d = (demo && r.demo) || {}, quest = isQuest(r);
    
    const sample = S.kind === 'sample', sm = (sample && r.sample) || {};
    const filmer = sm.player && sm.player !== 'anonymous' ? sm.player : '';
    const findings = r.findings || [], strengths = r.strengths || [];
    const st = (r.summary && r.summary.stats) || {};
    S.stage = r.stage && r.stage.kind === 'hands' ? 'hands' : 'video';
    const hands = S.stage === 'hands';
    $('v-results').classList.remove('is-loading');
    document.title = `${demo ? d.title || 'Demo' : sample ? sm.title || 'Sample lesson' : 'Your take'} - Museverse Teacher`;

    
    $('r-kind').textContent = demo ? 'Demo' : sample ? 'Sample lesson' : 'Your video';
    $('h-results').textContent = demo ? d.title || 'Demo' : sample ? sm.title || 'Sample lesson' : 'Your take';
    
    const tl = String(d.title || '').replace(/\s*\(.*\)$/, '').trim();
    let piece = String(d.piece || '');
    if (tl && piece.toLowerCase().startsWith(tl.toLowerCase())) piece = cap(piece.slice(tl.length).replace(/^[\s,:;.-]+/, ''));
    const sub = demo ? [d.player, piece].filter(Boolean).join(' · ') : sample ? [filmer, sm.piece].filter(Boolean).join(' · ')
      : S.name || (r.job && r.job.video && r.job.video.name) || '';
    $('r-sub').textContent = sub; $('r-sub').hidden = !sub;
    
    $('r-who').textContent = demo ? `${firstName(d.player) || 'The player'} recorded this take. The teacher talks to them as you, just as it will about your own video.`
      : sample ? `${filmer || 'A player'} filmed this take on a phone. The teacher talks to them as you, just as it will about your own video.` : '';
    $('r-who').hidden = !(demo || sample);
    $('r-new-t').textContent = demo ? 'All demos' : sample ? 'All samples' : 'New take';
    
    $('r-get').hidden = !(sample && sm.downloadable);
    if (sample && sm.downloadable) $('r-get-a').setAttribute('href', new URL(`samples/${encodeURIComponent(S.sample)}/download`, API).href);
    const say = (r.summary && r.summary.say) || '';
    $('r-say').textContent = say;
    
    const note = demoNote(d.caveat), dur = st.durationS != null ? mmss(st.durationS) : '', told = !!dur && say.includes(dur);
    const fromMidi = !quest && midiNotes(r);
    const facts = [!told && dur, !told && st.notes != null && plural(+st.notes, 'note', 'notes'),
      fromMidi ? (sample ? SOURCE_MIDI.sampleShort : SOURCE_MIDI.short) : sample ? SAMPLE_SHORT : SOURCE_SHORT[quest ? 'quest' : 'upload']].filter(Boolean);
    $('r-meta').innerHTML = facts.map(esc).join(' · ')
      + (note ? ` · <a class="r-note" href="#r-caveat" title="${esc(d.caveat)}">${esc(note)}</a>` : '');
    
    $('t-hint').textContent = !findings.length ? 'Shows the summary, a line at a time.'
      : hands ? 'Plays each moment of the take, then shows you what to try.' : 'Plays each moment of your video, then shows you what to try.';

    
    $('find-count').textContent = findings.length > 1 ? `${findings.length} things, the most important first` : '';
    $('findings').innerHTML = findings.length ? findingsHtml(findings) : nothingHtml(r, strengths.length);
    $('well').hidden = !strengths.length;
    $('strengths').innerHTML = wellsHtml(strengths);
    loadPlan(r);                                     
    loadCompare(r);                                  
    renderRetaken(r);                                
    if (S.kind === 'job' && S.job) keepTake(S.job, r);   
    renderRefCompare(r);                             
    $('ref').hidden = !r.reference;
    $('ref').innerHTML = r.reference ? refHtml(r.reference, quest || fromMidi, scoreListsShown(r)) : '';   
    $('lg-ref').hidden = !r.reference;

    
    $('r-details').open = false;
    $('r-blurb').textContent = d.blurb || ''; $('r-blurb').hidden = !d.blurb;
    $('r-caveat').textContent = d.caveat || ''; $('r-caveat').hidden = !d.caveat;
    $('r-source').className = `r-source ${quest ? 'q-quest' : 'q-upload'}`;
    $('r-source-t').textContent = fromMidi ? (sample ? SOURCE_MIDI.sampleBadge : SOURCE_MIDI.badge) : sample ? SAMPLE_BADGE : SOURCE_BADGE[quest ? 'quest' : 'upload'];
    const stg = r.stage || {};
    $('r-sound').textContent = !hands ? '' : !stg.audio ? 'You hear the notes played on a grand piano: there is no recording of this take.'
      : stg.audioKind === 'backing' ? "You hear the song's audio from the app, not a recording of this take." : "You hear the take's own recording.";
    $('r-sound').hidden = !$('r-sound').textContent;
    $('r-say-src').textContent = srcText(r.summary && r.summary.source, r) || '';
    $('r-say-row').hidden = !$('r-say-src').textContent;
    const stats = [];
    if (st.durationS != null) stats.push(['Played', mmss(st.durationS)]);
    if (st.notes != null) stats.push(['Notes', count(st.notes)]);
    if (st.notesPerS != null) stats.push(['Notes a second', (+st.notesPerS).toFixed(1)]);
    if (st.handsSeenShare != null) stats.push(quest ? ['A hand tracked', `${Math.round(st.handsSeenShare * 100)}% of the take`] : ['A hand in view', `${Math.round(st.handsSeenShare * 100)}% of the frames`]);
    if (quest && st.phrases != null) stats.push(['Phrases', String(st.phrases)]);
    $('r-stats').innerHTML = stats.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('') || '<dt>Numbers</dt><dd>Not given for this take</dd>';
    const confs = Object.keys(CONF).filter((c) => findings.some((f) => f.confidence === c));
    $('conf-key').textContent = confs.map((c) => `${CONF[c][0]}: ${CONF[c][1].toLowerCase()}.`).join(' ');
    $('conf-key').hidden = !confs.length;
    $('r-evidence').innerHTML = evidenceHtml(findings, strengths);
    
    const warnings = ((r.pipeline && r.pipeline.warnings) || []).filter(Boolean);
    const limits = (r.limits || []).concat(warnings.length ? ['Some steps of the analysis reported problems; see "How this take was analysed" below.'] : []);
    $('limits').innerHTML = limits.map((l) => `<li>${esc(l)}</li>`).join('') || '<li>Not stated for this take.</li>';
    renderDetails(r);
    
    
    const fr = r.framing && typeof r.framing === 'object' ? r.framing : {};
    const badFrame = !hands && fr.checked && (fr.verdict === 'no_keyboard' || fr.verdict === 'no_octave');
    if (badFrame) filmCard('r-film');
    $('r-film').hidden = !badFrame;
    $('teacher').hidden = true;
    $('t-start').lastChild.textContent = findings.length ? 'Walk me through it' : 'Show the summary';

    
    $('video-stage').hidden = hands;
    $('hands-stage').hidden = !hands;
    if (hands) $('hands-stage').before($('teacher')); else $('stage').after($('teacher'));
    show('results');
    const seeking = S.seekAt != null;
    if (hands) mountHands(r); else showVideo(r);
    mountChat(r);
    hideTap();
    voiceUi();
    autoStart(r, seeking);
    
    if (S.seekAt != null && !hands) {
      const t = S.seekAt;
      S.seekAt = null;
      seekTo(Math.max(0, t)).then((done) => { if (done && S.result === r) { updatePlayhead(t); notice(`From ${at(t)} in this take.`); } });
    }
  }

  
  
  
  
  const RC_VERDICT = { ref_stop: 'a stop', ref_tempo_bar: 'a bar that slows', ref_even: 'uneven notes', ref_pedal: 'pedal held',
    ref_contrast: 'no change', ref_voicing: 'top note not above' };
  const RC_STRIP = { ok: 'no remark', differs: 'differs', choice: 'a choice', nm: 'not measured' };
  const RC_ASPECT = { timing: 'timing', chords: 'chords', hands: 'hands', pedal: 'pedal', loudness: 'loudness', voicing: 'the top note of chords' };
  const RC_PASS = { 2: 'second', 3: 'third', 4: 'fourth' };
  const rcBar = (b) => `bar ${b.bar}${+b.pass > 1 ? `, ${RC_PASS[+b.pass] || `pass ${b.pass}`} time` : ''}`;
  function rcVerdict(r) {
    if (r.verdict === 'choice') return 'a choice';
    if (r.item === 'ref_tempo_bar' && r.variant === 'rushes') return 'a bar that hurries';
    return RC_VERDICT[r.item] || 'differs';
  }
  function renderRefCompare(r) {
    const box = $('rc'), pc = r && r.proCompare && typeof r.proCompare === 'object' ? r.proCompare : null;
    box.hidden = !pc;
    if (!pc) { box.innerHTML = ''; return; }
    const lines = (xs) => (xs || []).filter((x) => x && x.say).map((x) => `<p class="small muted">${esc(x.say)}</p>`).join('');
    if (!pc.compared) {
      box.innerHTML = `<span class="eyebrow">The reference recording</span><h3 class="sr-only" id="h-rc">The reference recording</h3>${lines(pc.notCompared)}`;
      return;
    }
    const rows = pc.rows || [];
    const differs = {};
    for (const x of rows) for (const b of x.bars || []) if (x.verdict === 'differs') differs[`${b.bar}:${b.pass || 1}`] = rcVerdict(x);
    const strip = (pc.barStrip || []).map((b) => {
      const v = RC_STRIP[b.v] ? b.v : 'nm', what = differs[`${b.bar}:${b.pass || 1}`];
      const label = `${cap(rcBar(b))}: ${RC_STRIP[v]}${v === 'differs' && what ? `, ${what}` : ''}`;
      const play = Number.isFinite(+b.fromS) && v !== 'nm';
      return `<li><button type="button" class="rc-cell v-${v}"${play ? ` data-act="bar" data-a="${+b.fromS}" data-b="${Number.isFinite(+b.toS) ? +b.toS : +b.fromS + 1.5}"` : ' disabled'} aria-label="${esc(label)}" title="${esc(label)}">${esc(String(b.bar))}${+b.pass > 1 ? '<sup aria-hidden="true">′</sup>' : ''}</button></li>`;
    }).join('');
    const card = (x) => {
      const w = x.say || {}, bars = (x.bars || []).map(rcBar), head = cap(bars.length > 2 ? `${bars.slice(0, 2).join(', ')} and more` : bars.join(' and '));
      if (x.verdict === 'choice') {
        return `<li class="rc-row v-choice"><div class="rc-h"><h4>${esc(head)}</h4><span class="rc-v">A choice</span></div><p>${esc(w.what || '')}</p></li>`;
      }
      const lab = (k, v) => (v ? `<div class="rc-l"><span class="rc-k">${esc(k)}</span><p>${esc(v)}</p></div>` : '');
      const play = Number.isFinite(+x.atS) ? `<button type="button" class="btn btn-sm timebtn rc-play" data-act="bar" data-a="${Math.max(0, +x.atS - 1.5)}" data-b="${+x.atS + 1.5}" aria-label="${esc(`Play this moment in your take, ${at(+x.atS)}`)}">${ICON_PLAY}<span class="t">${esc(at(+x.atS))}</span></button>` : '';
      return `<li class="rc-row v-differs"><div class="rc-h"><h4>${esc(head)}</h4><span class="rc-v">${esc(cap(rcVerdict(x)))}</span></div>
        ${lab('You', w.what)}${lab('Reference', w.reference)}${lab('Why', w.why)}${lab('Try', w.step)}${lab('Check', w.check)}${play}</li>`;
    };
    const compared = ((pc.aspects || {}).compared || []).map((a) => RC_ASPECT[a] || a);
    box.innerHTML = `<div class="rc-top"><span class="eyebrow" id="h-rc">The reference recording</span></div>
      <p class="rc-lead">${esc(pc.lead || '')}</p>
      ${pc.tempo && pc.tempo.say ? `<p class="rc-tempo">${esc(pc.tempo.say)}</p>` : ''}
      ${pc.steady && pc.steady.say ? `<p class="small">${esc(pc.steady.say)}</p>` : ''}
      ${strip ? `<ul class="rc-strip" role="list" aria-label="Bar by bar against the reference recording">${strip}</ul>
      <p class="small muted rc-key"><span class="kk"><span class="k v-differs"></span>differs</span> <span class="kk"><span class="k v-choice"></span>a choice</span> <span class="kk"><span class="k v-ok"></span>no remark</span> <span class="kk"><span class="k v-nm"></span>not measured</span></p>` : ''}
      ${compared.length ? `<p class="small">Compared: ${esc(compared.join(', '))}.</p>` : ''}
      ${lines((pc.aspects || {}).notCompared)}
      ${(pc.praise || []).map((p) => `<p class="rc-praise">${esc(p)}</p>`).join('')}
      ${rows.length ? `<ul class="rc-rows" role="list">${rows.map(card).join('')}</ul>` : `<p class="small">Where your timing was compared, nothing stood out against the reference recording.</p>`}
      ${(pc.dropped || []).length ? `<p class="small muted">${esc(`Not counted as a remark: ${pc.dropped.map((d) => d.why).join('; ')}.`)}</p>` : ''}
      <p class="fine rc-foot">${esc(pc.footer || '')} <a href="how/#reference">How we compare</a></p>`;
  }

  

  
  
  
  const VERDICT = { better: 'Better', same: 'About the same', worse: 'Worse', 'not measured': 'Not compared' };
  async function loadCompare(r) {
    const my = ++S.cmpSeq;
    S.compare = null;
    $('cmp').hidden = true;
    if (!r.retakeOf || (S.kind !== 'job' && S.kind !== 'sample') || isQuest(r)) return;
    const path = S.kind === 'sample' ? `samples/${encodeURIComponent(S.sample)}/compare` : `jobs/${encodeURIComponent(S.job)}/compare`;
    try {
      const c = await getJSON(path);
      if (my === S.cmpSeq && S.result === r && c && Array.isArray(c.bars)) showCompare(c);
    } catch (e) { console.warn('compare:', e && e.message); }     
  }
  
  
  function renderRetaken(r) {
    let href = '';
    const sid = r.sample && r.sample.retakenBy;
    if (S.kind === 'sample' && typeof sid === 'string' && DEMO_ID.test(sid)) href = `?sample=${encodeURIComponent(sid)}`;
    else if (S.kind === 'job' && S.job) {
      const t = takesList().find((x) => x.retakeOf === S.job);
      if (t) href = `?job=${encodeURIComponent(t.id)}`;
    }
    $('retaken').hidden = !href;
    $('retaken').innerHTML = href ? `You filmed part of this take again. <a href="${href}" class="retaken-link">See the before and after</a>` : '';
  }
  
  function beforeLink(c, fromS, label) {
    const b = c.before || {};
    if (fromS == null || !Number.isFinite(+fromS) || !b.id || !(b.kind === 'job' ? HEX32.test(b.id) : DEMO_ID.test(b.id))) return '';
    const t = Math.max(0, +fromS), shown = mmss(t + (+b.clipStartS || 0));
    
    return `<a class="btn btn-sm timebtn cmp-play cmp-open" href="?${b.kind === 'job' ? 'job' : 'sample'}=${encodeURIComponent(b.id)}&amp;t=${+t.toFixed(2)}" aria-label="${esc(`Open ${label} in your first take, at ${shown}`)}">Open <span class="t">${esc(shown)}</span>${ICON_OUT}</a>`;
  }
  
  function afterButton(fromS, toS, label) {
    if (fromS == null || !Number.isFinite(+fromS)) return '';
    const b = Number.isFinite(+toS) ? +toS : +fromS + 2;
    return `<button type="button" class="btn btn-sm timebtn cmp-play" data-act="bar" data-a="${+fromS}" data-b="${b}" aria-label="${esc(`Play ${label} in this take, ${at(+fromS)}`)}">${ICON_PLAY}<span class="t">${esc(at(+fromS))}</span></button>`;
  }
  function cmpSide(head, main, sub, play) {
    return `<div class="cmp-col"><span class="cmp-lab">${esc(head)}</span><span class="cmp-val">${esc(main)}</span>${sub ? `<span class="cmp-sub small muted">${esc(sub)}</span>` : ''}${play}</div>`;
  }
  function cmpBarHtml(c, b) {
    
    
    const here = isQuest(S.result || {}) || midiNotes(S.result);
    const exactOf = (t, dflt) => (t && typeof t.exactNotes === 'boolean' ? t.exactNotes : dflt);
    const lab = `Bar ${b.bar}${+b.pass > 1 ? `, ${ORD[b.pass] || `pass ${b.pass}`}` : ''}`;
    const side = (x, exact) => {
      const kinds = [x.wrong && `${x.wrong} different`, x.missed && `${x.missed} ${exact ? 'missed' : 'not heard'}`, x.extra && `${x.extra} added`].filter(Boolean);
      
      const timing = x.onsetMs == null ? '' : +x.onsetMs < 5 ? 'on a steady beat' : `about ${Math.round(x.onsetMs)} ms off the beat`;
      return [x.slips ? plural(x.slips, 'slip', 'slips') : 'No slips', [kinds.join(', '), timing].filter(Boolean).join(' · ')];
    };
    const [bm, bs] = side(b.before || {}, exactOf(c.before, here)), [am, as] = side(b.after || {}, exactOf(c.after, here));
    const why = b.verdict === 'not measured' ? `: ${b.why || 'too few of its notes were compared'}`
      : b.clean ? ': no slips now' : b.slips === 'same' && b.timing === 'better' ? ': the timing is steadier' : b.slips === 'same' && b.timing === 'worse' ? ': the timing is less steady'
        
        : b.verdict === 'same' && (b.before || {}).slips !== (b.after || {}).slips ? ': a change smaller than this bar\'s margin' : '';
    return `<li class="cmp-row v-${esc(b.verdict.replace(/ /g, '-'))}">
      <div class="cmp-h"><h4>${esc(lab)}</h4><span class="cmp-v">${esc(VERDICT[b.verdict] || b.verdict)}<span class="cmp-why">${esc(why)}</span></span></div>
      <div class="cmp-cols">${cmpSide('First take', bm, bs, beforeLink(c, (b.before || {}).fromS, lab.toLowerCase()))}${cmpSide('This take', am, as, afterButton((b.after || {}).fromS, (b.after || {}).toS, lab.toLowerCase()))}</div>
    </li>`;
  }
  function cmpFindHtml(c, x) {
    const title = x.title || cap(METRIC[x.metric] || String(x.item || 'measure').replace(/_/g, ' '));
    const who = HAND[x.hand] || PART[x.part] || '';
    const val = (s) => (!s || !s.measured ? 'Not measured' : x.unit === 'notes' ? `${count(s.value)} of ${count(s.notes)} notes` : fmtVal(s.value, x.unit));
    const why = x.verdict === 'not measured' ? `: ${x.why || 'not measured in both takes'}`
      : x.cleared ? `, and under its limit now${x.unit === 'notes' ? '' : ` (${fmtVal(x.limit, x.unit)})`}` : '';
    const b = x.before || {}, a = x.after || {};
    
    
    const where = x.over === 'bars' ? (Array.isArray(x.bars) && x.bars.length ? `in ${barsWords(x.bars)}, the bars both takes played` : 'in the part both takes played')
      : x.over === 'take' ? 'over the whole take' : '';
    
    
    const sub = (s, flag, whole) => [s.flagged ? (s.measured ? flag : whole) : '', s.measured ? where : ''].filter(Boolean).join(' · ');
    return `<li class="cmp-row v-${esc(x.verdict.replace(/ /g, '-'))}">
      <div class="cmp-h"><h4>${esc(title)}${who ? ` <span class="cmp-hand small muted">${esc(who)}</span>` : ''}</h4><span class="cmp-v">${esc(VERDICT[x.verdict] || x.verdict)}<span class="cmp-why">${esc(why)}</span></span></div>
      <div class="cmp-cols">${cmpSide('First take', val(b), sub(b, 'a finding then', 'a finding over the whole first take'), beforeLink(c, b.fromS, title.toLowerCase()))}${cmpSide('This take', val(a), sub(a, 'still a finding', 'a finding over this whole take'), afterButton(a.fromS, a.toS, title.toLowerCase()))}</div>
    </li>`;
  }
  function showCompare(c) {
    S.compare = c;
    const bars = c.bars || [], rows = c.findings || [], th = c.thresholds || {};
    const both = bars.concat(rows), judged = both.filter((x) => x.verdict !== 'not measured');
    let lead = (c.summary && c.summary.say) || '';
    
    if (judged.length && !judged.some((x) => x.verdict === 'better' || x.verdict === 'worse')) lead += ' Nothing changed by more than its margin.';
    $('cmp-lead').textContent = lead;
    const day = dayText(c.before && c.before.createdAt);
    $('cmp-when').textContent = day ? `Your first take: ${day}` : '';
    $('cmp-bars-h').hidden = !bars.length;
    $('cmp-bars').innerHTML = bars.map((b) => cmpBarHtml(c, b)).join('');
    $('cmp-finds-h').hidden = !rows.length;
    $('cmp-finds').innerHTML = rows.map((x) => cmpFindHtml(c, x)).join('');
    const other = [c.onlyBefore && c.onlyBefore.length ? `only your first take played ${barsWords(c.onlyBefore)}` : '',
      c.onlyAfter && c.onlyAfter.length ? `only this take played ${barsWords(c.onlyAfter)}` : ''].filter(Boolean);
    $('cmp-other').textContent = bars.length && other.length ? `Not compared: ${other.join('; ')}.` : '';
    $('cmp-other').hidden = !$('cmp-other').textContent;
    const sh = th.slipShare || {}, pc = (v, d) => `${Math.round(100 * (+v || d))} percent`;
    $('cmp-note').textContent = 'Better or worse only when the change is at least its margin. '
      + (c.exact ? `In a bar, ${th.slipMinChange || 2} slips. `
        : `In a bar, the notes different from the score must change by ${pc(sh.wrong, 0.2)} of its notes and the missed ones by ${pc(sh.missed, 0.5)} `
          + `(the share of a bar's notes a finding needs), and by ${th.slipMinChange || 2} notes at least; added notes are not counted, as the listening adds some of its own. `)
      + `Its timing by ${th.onsetMinChangeMs || 25} ms, only at about the same speed, and it is a rough estimate. `
      + `A bar is compared when each take played all of it and ${th.barMinNotes || 3} or more of its notes; each finding by its own measure's margin. `
      + 'Worked out from what the two takes measured, never by an AI.';
    $('cmp').hidden = false;
  }
  
  function barsWords(bs) {
    const ns = [...new Set(bs.map((b) => +b.bar).filter(Number.isFinite))].sort((a, b) => a - b);
    if (!ns.length) return '';
    if (ns.length === 1) return `bar ${ns[0]}`;
    if (ns.length > 2 && ns[ns.length - 1] - ns[0] === ns.length - 1) return `bars ${ns[0]} to ${ns[ns.length - 1]}`;
    return `bars ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
  }

  

  
  
  const PLAN_FIXED = "Planned from the teacher's own exercises";
  function planHtml(p) {
    const fs = (S.result && S.result.findings) || [];
    const items = (p.blocks || []).map((b, k) => {
      const i = fs.findIndex((f) => f.id === b.findingId), keep = b.kind === 'keep';
      const from = b.fromS != null ? +b.fromS : i >= 0 ? +fs[i].fromS : null;
      const play = !keep && i >= 0 && Number.isFinite(from)
        ? `<button type="button" class="btn btn-sm timebtn" data-act="seek" data-i="${i}" aria-label="Play the moment for ${esc(b.title || 'this block')}, ${esc(at(from))}">${ICON_PLAY}Play the moment <span class="t">${esc(at(from))}</span></button>` : '';
      const mins = `${b.minutes} minute${+b.minutes === 1 ? '' : 's'}`;
      return `<li class="pblock${keep ? ' keep' : ''}" id="plan-${k}">
          <span class="pmin" aria-hidden="true">${esc(String(b.minutes))}<small>min</small></span>
          <div class="pbody">
            <p class="ptitle"><span class="sr-only">${esc(mins)}: </span>${keep ? '<span class="pkeep">Keep doing</span> ' : ''}${esc(b.title || '')}</p>
            <p class="pex">${esc(b.exercise || '')}</p>
            ${b.reason ? `<p class="pwhy small muted"><b>Why:</b> ${esc(b.reason)}</p>` : ''}
            ${b.new ? '<p class="pnew small muted">A new exercise, still being reviewed by our teacher.</p>' : ''}
            ${play ? `<div class="row">${play}</div>` : ''}
          </div>
        </li>`;
    }).join('');
    
    const progress = Array.isArray(p.progress) && p.progress.length
      ? `<div class="pprogress"><h4>Since your first take</h4><ul role="list">${p.progress.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    if (!items) return progress;                   
    return `${progress}${p.intro ? `<p class="pintro">${esc(p.intro)}</p>` : ''}<ol class="pblocks" role="list">${items}</ol>`
      + `<p class="fine pby" id="plan-by">${esc(p.by ? `Planned by ${p.by}${/via OpenRouter/.test(p.model || '') && !/OpenRouter/.test(p.by) ? ' via OpenRouter' : ''}` : PLAN_FIXED)}</p>`;
  }
  
  function stepNumbers() {
    let n = 3;
    for (const [sec, num, sr] of [['plan', 'plan-n', 'plan-sr'], ['well', 'well-n', 'well-sr'], ['chat', 'chat-n', 'chat-sr']]) {
      if (sec !== 'chat' && $(sec).hidden) continue;
      $(num).textContent = String(n);
      $(sr).textContent = `Step ${n}: `;
      n++;
    }
  }
  function showPlan(p) {
    S.plan = p && Array.isArray(p.blocks) ? p : null;
    const blocks = (S.plan && S.plan.blocks) || [];
    const progress = !!(S.plan && Array.isArray(S.plan.progress) && S.plan.progress.length);   
    $('plan').hidden = !blocks.length && !progress;
    $('plan-body').innerHTML = blocks.length || progress ? planHtml(S.plan) : '';
    $('plan-mins').textContent = blocks.length ? `About ${blocks.reduce((a, b) => a + (+b.minutes || 0), 0)} minutes` : '';
    
    
    const cards = ((S.result && S.result.findings) || []).length > 0;
    const none = S.plan && !blocks.length && S.plan.none && cards ? S.plan.none : '';
    $('plan-none').textContent = none; $('plan-none').hidden = !none;
    stepNumbers();
  }
  
  async function loadPlan(r) {
    const my = ++S.planSeq;
    if (r.plan && Array.isArray(r.plan.blocks)) { showPlan(r.plan); return; }
    showPlan(null);
    const path = S.kind === 'demo' ? `demos/${encodeURIComponent(S.demo)}/plan` : S.kind === 'sample' ? `samples/${encodeURIComponent(S.sample)}/plan`
      : `jobs/${encodeURIComponent(S.job)}/plan`;
    try {
      const p = await getJSON(path);
      if (my === S.planSeq && S.result === r) showPlan(p);
    } catch (e) { console.warn('plan:', e && e.message); }   
  }

  function renderDetails(r) {
    const job = r.job || {}, v = job.video || {}, kb = r.keyboard || {}, p = r.pipeline || {}, b = r.build || {}, stg = r.stage || {};
    let rows;
    if (isQuest(r)) {
      rows = [
        ['Recording', b.source ? String(b.source).split('/').pop() : 'a Museverse Quest app recording'],
        
        ['Hands', `Quest hand tracking${+b.trackingHz > 0 ? ` (about ${Math.round(+b.trackingHz)} times a second)` : ''}, replayed at ${+stg.fps || 30} frames a second`],
        ['Notes', p.transcriber || 'the piano, through the Quest app'],
        ['Sound', !stg.audio ? 'the notes, played on a grand piano' : stg.audioKind === 'backing' ? "the song's audio from the app, not a recording of this take" : "the take's own recording"],
        ['Wording', p.voiceModel], ['Voice', "your browser's speech synthesis"],
        ['Recording file', b.sha256 ? `sha256 ${String(b.sha256).slice(0, 16)}` : ''],
        ['Built with code', b.commit ? `${String(b.commit).slice(0, 12)}${b.dirty ? ' (with local changes)' : ''}` : ''],
      ];
    } else {
      
      
      const day = S.kind === 'sample' && /^\d{4}-\d{2}-\d{2}$/.test(String(job.createdAt || '')) ? String(job.createdAt).split('-').map(Number) : null;
      const created = day ? new Date(day[0], day[1] - 1, day[2]) : job.createdAt ? new Date(job.createdAt) : null;
      
      
      const osrc = kb.octaveSource || (r.analysis && r.analysis.octave && r.analysis.octave.source);
      const octave = { video: 'the video (an end of the keyboard was seen)', audio: 'the sound', unknown: 'not settled', none: 'not settled',
        fingertips: 'your fingertips on the keys you struck', 'keyboard-end': 'an end of the keyboard in the video', notes: 'the notes heard' }[osrc] || osrc || 'n/a';
      const fr = r.framing && typeof r.framing === 'object' ? r.framing : {};
      rows = [
        ['File', v.name], [S.kind === 'sample' ? 'Recorded' : 'Analysed', created && !isNaN(created) ? (S.kind === 'sample' ? created.toLocaleDateString() : created.toLocaleString()) : ''],
        ['Video', v.width ? `${v.width} x ${v.height}, ${v.window ? `${mmss(v.window.fromS)}, of which ${mmss(v.window.startS)} to ${mmss(v.window.endS)} analysed` : mmss(v.durationS)}` : ''],
        
        ['Keyboard found in', fr.skipped ? `${+(fr.keyboardSeen != null ? fr.keyboardSeen : fr.keyboardFrames) || 0} of the ${+fr.read || +fr.frames || 0} frames looked at first (the rest were not looked at)`
          : kb.framesTotal ? `${kb.framesLocked || 0} of ${kb.framesTotal} frames` : ''],
        ['First look', fr.checked ? `${+fr.frames || 0} frames: ${fr.verdict === 'ok' ? 'framed well enough' : fr.verdict === 'unknown' ? 'could not tell' : String(fr.why || fr.verdict || '')}`
          + (fr.skipped ? `, so the other frames were not looked at and the take was judged from ${notesWord(r)}` : fr.verdict === 'no_keyboard' || fr.verdict === 'no_octave' ? ', all of it analysed anyway' : '') : ''],
        ['Filming tip', filmTip(r) ? `${filmTip(r).say}${filmTip(r).by ? ` (${filmTip(r).by})` : ''}` : ''],
        ['Octave from', octave],
        ['Keyboard and hands', p.samBackend ? `SAM 3.1, ${samWhere(p.samBackend)}${p.samOutlines === 'box' ? ', outlines are boxes' : ''}` : ''],
        
        ['Colour', v.toneMap && v.toneMap.from ? `${v.toneMap.from === 'HLG' || v.toneMap.from === 'PQ' ? `HDR (${v.toneMap.from})` : v.toneMap.from}, converted to standard colour (BT.709)` : ''],
        ['Notes', notesRow(r, p.transcriber, S.kind === 'sample')], ['Wording', p.voiceModel], ['Voice', "your browser's speech synthesis"], ['Job', S.kind === 'sample' ? '' : job.id],
      ];
    }
    const mono = new Set(['Job', 'Recording file', 'Built with code']);
    
    const DEV = new Set(['Recording', 'Recording file', 'Built with code']);
    rows = rows.filter(([, val]) => val);
    const warnings = (p.warnings || []).filter(Boolean);
    const dl = (rs) => rs.map(([k, val]) => `<dt>${esc(k)}</dt><dd${mono.has(k) ? ' class="mono"' : ''}>${esc(val)}</dd>`).join('');
    const dev = rows.filter(([k]) => DEV.has(k));
    $('r-dl').innerHTML = `<dl class="kv">${dl(rows.filter(([k]) => !DEV.has(k)))}`
      + (warnings.length ? `<dt>Warnings</dt><dd><ul class="warns">${warnings.map((w) => `<li>${esc(cap(String(w)))}</li>`).join('')}</ul></dd>` : '') + '</dl>'
      + (dev.length ? `<details class="disclose dev"><summary>For developers</summary><dl class="kv">${dl(dev)}</dl></details>` : '');
    $('r-steps').innerHTML = stepsHtml(p.steps);
  }

  

  function handsFailed(why) {
    $('hands-stage').innerHTML = `<p class="msg err">The hands replay could not start${why ? ` (${esc(why)})` : ''}. Reload the page to try again; the advice below still works.</p>`;
  }
  function mountHands(r) {
    const el = $('hands-stage');
    el.innerHTML = '';
    if (!window.MVHands) { handsFailed('stage-hands.js did not load'); return; }
    const base = new URL(S.kind === 'demo' ? `demos/${encodeURIComponent(S.demo)}/media/` : `jobs/${encodeURIComponent(S.job)}/media/`, API);
    try {
      S.hands = window.MVHands.mount(el, {
        result: r, mediaBase: base.href,
        fetchMedia: (name) => apiFetch(new URL(name, base)),
        
        
        
        
        
        onPlaying: (on) => stageHold(on),
        
        
        
        onFinding: (i) => {
          highlight(i);
          openRow(i);
          if (wide.matches && !$('player').parentElement.classList.contains('tall')) { const c = $(`find-${i}`); if (c) c.scrollIntoView({ block: 'nearest', behavior: behavior() }); }
        },
      });
    } catch (e) {
      console.error('MVHands.mount:', e);
      S.hands = null;
      handsFailed(e && e.message);
    }
  }

  

  
  
  
  
  const held = (p) => (S.chat ? S.chat.hold(p) : p);
  let stageRelease = null;
  function stageHold(on) {
    if (on && !stageRelease && S.chat) stageRelease = S.chat.hold(true);
    else if (!on && stageRelease) { const release = stageRelease; stageRelease = null; release(); }
  }
  const stagePlaying = () => (S.stage === 'hands' ? !!(S.hands && S.hands.playing()) : !$('vid').paused);

  function mountChat(r) {
    const el = $('chat-mount');
    if (S.chat) { try { S.chat.destroy(); } catch (e) { console.warn('MVChat destroy:', e); } S.chat = null; }
    stageRelease = null;                                         
    el.innerHTML = '';
    const target = S.kind === 'demo' ? { kind: 'demo', id: S.demo } : S.kind === 'sample' ? { kind: 'sample', id: S.sample } : { kind: 'job', id: S.job };
    if (!window.MVChat || !target.id) { el.innerHTML = '<p class="msg err">The conversation could not load. Reload the page to talk to your teacher.</p>'; return; }
    try {
      S.chat = window.MVChat.mount(el, {
        api: API, target, result: r,
        token: () => token, code: () => code, askToken, jobKey: () => (target.kind === 'job' ? jobKey(target.id) : ''),
        
        
        health: window.__TB_HEALTH ? window.__TB_HEALTH(target) : (S.healthReady || Promise.resolve()).then(() => (S.health && S.health.auth && !token
          ? { ...S.health, stt: false, voice: { realtime: false, file: false } } : S.health)),
        
        speak: (text) => { if (T.state === 'playing') tourPause(); return speak(text); },
        
        voice: { on: () => voiceOn, set: setVoiceOn },
        stopSpeaking,
        
        onSeek: (f, i) => {
          const fs = (S.result && S.result.findings) || [];
          const k = Number.isInteger(i) && fs[i] ? i : fs.indexOf(f);
          return k >= 0 ? playFinding(k) : undefined;
        },
        
        onMoment: (a, b) => {
          if (!Number.isFinite(+a)) return undefined;
          if (T.state === 'playing') tourPause();
          stopSpeaking();
          revealFor(-1);
          unlockStage();
          const my = ++S.sectionSeq;
          return playSection({ fromS: +a, toS: Math.max(+a, Number.isFinite(+b) ? +b : +a + 3) }, () => my === S.sectionSeq && T.state !== 'playing');
        },
      });
      if (stagePlaying()) stageHold(true);
    } catch (e) {
      console.error('MVChat.mount:', e);
      S.chat = null;
      el.innerHTML = `<p class="msg err">The conversation could not start (${esc(e && e.message)}). Reload the page to try again.</p>`;
    }
  }

  

  function showVideo(r) {
    const findings = r.findings || [], st = (r.summary && r.summary.stats) || {};
    
    const ft = (r.media && r.media.frameTimes) || [];
    let D = Math.max(1, +st.durationS || 0, ft.length ? ft[ft.length - 1] : 0);
    for (const n of r.notes || []) D = Math.max(D, +n[1] || 0);
    for (const f of findings) D = Math.max(D, +f.toS || 0);
    S.D = D;
    $('ov-note').hidden = !(r.pipeline && r.pipeline.samOutlines === 'box');
    
    const w = r.job && r.job.video && r.job.video.window;
    $('clip-note').textContent = (w && w.replay) || '';
    $('clip-note').hidden = !(w && w.replay);
    setVideo(r);
    renderMarks();
    showSectionKey(r);
    drawRoll();
    drawOverlay();
    
    
    
    const kb = r.keyboard || {}, handsFrom = r.analysis && r.analysis.handsFrom;
    const placement = (r.analysis && r.analysis.placement) || {};
    if (handsFrom ? handsFrom !== 'video' : !kb.framesLocked) {
      notice(placement.say ? String(placement.say)
        : st.notes === 0 ? 'Your hands could not be placed on the keys in this video.'
        : handsFrom === 'score' ? `Your hands could not be placed on the keys in this video, so the take was judged from ${notesWord(r)} only, with each note's hand taken from the score.`
        : `Your hands could not be placed on the keys in this video, so the take was judged from ${notesWord(r)} only, without saying which hand played.`, false, filmTip(r));
    }
  }

  
  
  function filmTip(r) {
    const t = r && r.framing && typeof r.framing === 'object' && r.framing.tip;
    return t && typeof t === 'object' && t.say ? { say: String(t.say), by: t.by ? `Tip chosen by ${t.by}` : '' } : null;
  }
  
  function notice(text, transient = true, tip = null) {
    const n = $('vid-notice');
    n.textContent = text || ''; n.hidden = !text;
    if (text && tip) {
      const said = String(text).includes(tip.say);
      if (!said) n.insertAdjacentHTML('beforeend', `<span class="notice-tip">${esc(tip.say)}</span>`);
      if (tip.by) n.insertAdjacentHTML('beforeend', `<span class="notice-by" id="vid-tip-by">${esc(tip.by)}</span>`);
    }
    clearTimeout(notice.t);
    if (text && transient) notice.t = setTimeout(() => { n.hidden = true; }, 6000);
  }
  async function setVideo(r) {
    const vid = $('vid'), job = S.job;
    notice('');
    const v = (r.job && r.job.video) || {};
    $('stage').style.aspectRatio = v.width && v.height ? `${v.width} / ${v.height}` : '';
    if (S.kind === 'sample') {                      
      vid.src = new URL(`samples/${encodeURIComponent(S.sample)}/media/video.mp4`, API).href;
      return;
    }
    const rel = r.media && /^[\w./-]+$/.test(r.media.video) && !r.media.video.includes('..') && !r.media.video.startsWith('/') ? r.media.video : 'media/video.mp4';
    const url = new URL(`jobs/${encodeURIComponent(job)}/${rel}`, API);
    const key = r.media && /^[0-9a-f]{32}$/.test(r.media.videoKey || '') ? r.media.videoKey : '';
    if (window.__MV_VIDEO && window.__MV_VIDEO[job]) { vid.src = window.__MV_VIDEO[job]; return; }   
    if (!token || key) { vid.src = url.href + (key ? `?k=${key}` : ''); return; }   
    
    notice('Loading the video...', false);
    try {
      const blob = await (await apiFetch(url)).blob();
      if (S.job !== job || !S.result) return;
      S.videoUrl = URL.createObjectURL(blob);
      vid.src = S.videoUrl;
      notice('');
    } catch (e) { if (S.job === job) notice(`The video could not be loaded: ${e.message}`, false); }
  }

  function frameAt(t) {
    const T = (S.result && S.result.media && S.result.media.frameTimes) || [];
    if (!T.length) return { i: -1, dt: Infinity };
    let lo = 0, hi = T.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] < t) lo = m + 1; else hi = m; }
    const i = lo > 0 && Math.abs(T[lo - 1] - t) <= Math.abs(T[lo] - t) ? lo - 1 : lo;
    return { i, dt: t - T[i] };
  }
  function frameGap() {
    const T = S.result.media.frameTimes || [];
    if (T.length < 2) return 0.5;
    const d = []; for (let k = 1; k < Math.min(T.length, 50); k++) d.push(T[k] - T[k - 1]);
    d.sort((a, b) => a - b);
    return Math.max(0.3, 1.5 * d[d.length >> 1]);
  }
  
  function fit(cw, ch, W, H) {
    const s = Math.min(cw / W, ch / H);
    return { s, x0: (cw - W * s) / 2, y0: (ch - H * s) / 2 };
  }
  function tracePoly(ctx, pts, P) {
    ctx.beginPath();
    pts.forEach((p, k) => { const q = P(p); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.closePath();
  }
  function drawOverlay() {
    const r = S.result;
    if (!r || S.stage !== 'video' || $('v-results').hidden) return;
    const vid = $('vid'), cv = $('ov'), box = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!box.width) return;
    if (cv.width !== Math.round(box.width * dpr) || cv.height !== Math.round(box.height * dpr)) { cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    
    
    const t = (S.mediaT != null ? S.mediaT : vid.currentTime) || 0, n = ((r.media && r.media.frameTimes) || []).length;
    let { i, dt } = frameAt(t), near = i >= 0 && Math.abs(dt) <= frameGap();
    let outline = near && r.keyboard && r.keyboard.outline ? r.keyboard.outline[i] : null;
    let hands = near && r.hands ? r.hands[i] : null;
    if (window.MVOutlines) {
      const o = window.MVOutlines.at(r, t);
      near = o.near; i = o.near ? o.i : i;
      outline = o.keyboard; hands = o.hands;
    }
    const off = clipStart();
    const hud = !n ? 'no analysed frames' : !near ? `${(t + off).toFixed(2)} s · not analysed` : `frame ${i + 1} of ${n} · ${(r.media.frameTimes[i] + off).toFixed(2)} s${outline ? '' : ' · no keyboard'}`;
    if ($('hud').dataset.t !== hud) { $('hud').innerHTML = `<span>${esc(hud)}</span>`; $('hud').dataset.t = hud; }
    
    const cc = off ? `${at(t)} in your video` : '';
    if ($('clip-clock').textContent !== cc) $('clip-clock').textContent = cc;
    $('clip-clock').hidden = !off;
    updatePlayhead(t);
    if (!$('ov-on').checked || !near) return;
    const W = (r.job.video && r.job.video.width) || vid.videoWidth, H = (r.job.video && r.job.video.height) || vid.videoHeight;
    if (!W || !H) return;
    const { s, x0, y0 } = fit(box.width, box.height, W, H);
    const P = (p) => [x0 + p[0] * s, y0 + p[1] * s];
    ctx.lineJoin = 'round';
    if (outline && outline.length > 2) {
      tracePoly(ctx, outline, P);
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
    }
    for (const lab of ['L', 'R']) {
      const h = hands && hands[lab];
      if (!h || !h.poly || h.poly.length < 3) continue;
      
      
      const st = handAt(r, lab, t), fix = !!st && st.state === 'fix', good = !!st && st.state === 'good';
      tracePoly(ctx, h.poly, P);
      ctx.save();
      if (fix) { ctx.shadowColor = '#F87171'; ctx.shadowBlur = 26; }
      ctx.fillStyle = fix ? 'rgba(248,113,113,0.45)' : `rgba(${HAND_RGB[lab]},0.3)`; ctx.fill();
      ctx.setLineDash(h.raised ? [6, 4] : []);
      ctx.strokeStyle = fix ? '#FCA5A5' : good ? '#34D399' : `rgb(${HAND_RGB[lab]})`; ctx.lineWidth = fix ? 3 : 2.2; ctx.stroke();
      ctx.restore();
      
      const top = h.poly.reduce((a, b) => (b[1] < a[1] ? b : a));
      const [lx, ly] = P(top), fs = Math.max(11, Math.min(15, box.width / 60));
      ctx.font = `600 ${fs}px "Wix Madefor Display", system-ui, sans-serif`;
      const txt = (lab === 'L' ? 'Left' : 'Right') + (fix ? `: ${String(st.what || 'to fix').slice(0, 40)}` : ''), tw = ctx.measureText(txt).width;
      const bx = clamp(lx - tw / 2 - 6, 2, box.width - tw - 14), by = clamp(ly - fs - 14, 2, box.height - fs - 10);
      ctx.fillStyle = fix ? 'rgba(60,18,18,0.9)' : 'rgba(15,14,13,0.8)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, tw + 12, fs + 8, 8) : ctx.rect(bx, by, tw + 12, fs + 8); ctx.fill();
      ctx.fillStyle = fix ? '#FCA5A5' : `rgb(${HAND_RGB[lab]})`; ctx.fillText(txt, bx + 6, by + fs + 1);
    }
  }

  let rafId = 0;
  function loop() {
    drawOverlay();
    const vid = $('vid');
    if (!vid.paused && !vid.ended) rafId = requestAnimationFrame(loop); else rafId = 0;
  }
  let stopFollow = null;
  function kick() {
    if (window.MVOutlines) {
      
      if (!stopFollow) {
        const vid = $('vid');
        stopFollow = window.MVOutlines.follow(vid, (mt) => {
          S.mediaT = mt; drawOverlay();
          if (vid.paused || vid.ended) stillFrame();
        });
      }
      return;
    }
    if (!rafId) rafId = requestAnimationFrame(loop);
  }
  function stillFrame() {
    if (stopFollow) { stopFollow(); stopFollow = null; }
    S.mediaT = null;
    drawOverlay();
  }

  

  const SEC_COL = {
    good: { pill: 'rgba(52, 211, 153, 0.55)', tint: 'rgba(52, 211, 153, 0.08)' },
    fix: { pill: 'rgba(248, 113, 113, 0.55)', tint: 'rgba(248, 113, 113, 0.11)' },
    unsure: { pill: 'rgba(255, 255, 255, 0.08)', tint: null },
  };
  const okSec = (x) => x && SEC_COL[x.state] && Number.isFinite(x.fromS) && Number.isFinite(x.toS) && x.toS > x.fromS;
  function sectionsOf(r) {
    const L = r && r.lesson;
    return (L && Array.isArray(L.sections) ? L.sections : []).filter(okSec);
  }
  
  function handsOf(r) {
    const H = r && r.lesson && r.lesson.hands;
    if (!H || !Array.isArray(H.L) || !Array.isArray(H.R) || !(H.L.length || H.R.length)) return null;
    return { by: H.by, L: H.L.filter(okSec), R: H.R.filter(okSec), summary: H.summary || {} };
  }
  
  
  function handAt(r, lab, t) {
    const H = handsOf(r);
    const xs = H ? H[lab] : sectionsOf(r).filter((x) => x.state === 'fix' && Array.isArray(x.hands) && x.hands.includes(lab));
    const sc = xs.find((x) => t >= x.fromS && t < x.toS);
    return sc && (sc.state === 'fix' || (H && sc.state === 'good')) ? sc : null;
  }
  
  function showSectionKey(r) {
    const secs = sectionsOf(r), key = $('sec-key');
    if (!key) return;
    key.hidden = !secs.length;
    for (const st of ['good', 'fix', 'unsure']) {
      const k = key.querySelector(`[data-s="${st}"]`);
      if (k) k.hidden = !secs.some((x) => x.state === st);
    }
    const off = clipStart(), at = (x) => `${mmss(x.fromS + off)} to ${mmss(x.toS + off)}`;
    const good = secs.filter((x) => x.state === 'good'), fix = secs.filter((x) => x.state === 'fix');
    const words = [];
    if (good.length) words.push(`green where it was played well (${good.map(at).join(', ')})`);
    if (fix.length) words.push(`light red where there is something to fix (${fix.map((x) => `${at(x)}: ${String(x.why || '').slice(0, 120)}`).join('; ')})`);
    const hands = secs.length ? handsOf(r) : null, hv = $('hand-verdict');
    let handWords = '';
    if (hv) {
      hv.replaceChildren();
      hv.hidden = !hands;
      for (const h of hands ? ['L', 'R'] : []) {
        const m = hands.summary[h] || {};
        if (!SEC_COL[m.state]) continue;
        const it = document.createElement('span');
        it.className = `hv-${m.state}`;
        it.dataset.h = h;
        it.title = String(m.say || '');
        const b = document.createElement('b');
        b.textContent = h === 'L' ? 'Left hand' : 'Right hand';
        it.append(document.createElement('i'), b, document.createTextNode(String(m.short || '').slice(0, 120)));
        hv.append(it);
        if (m.say) handWords += ` ${String(m.say).slice(0, 240)}`;
      }
    }
    $('roll').setAttribute('aria-label', 'Timeline of phrases and notes; left hand purple, right hand pink' +
      (words.length ? `. Coloured ${words.join(', and ')}; plain where it could not tell.` : '') +
      (hands ? ` Along the top the right hand, under it the left.${handWords}` : ''));
  }

  function drawRoll() {
    const r = S.result;
    if (!r || S.stage !== 'video') return;
    const cv = $('roll'), w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const D = S.D, X = (t) => (clamp(t, 0, D) / D) * w;
    const top = 24, bot = h - 18;
    g.font = '500 10px "Wix Madefor Display", system-ui, sans-serif';
    const secs = sectionsOf(r);
    const pill = (a, b) => { g.beginPath(); g.roundRect ? g.roundRect(a, 2, Math.max(2, b - a - 1), 16, 6) : g.rect(a, 2, Math.max(2, b - a - 1), 16); };
    const hands = secs.length ? handsOf(r) : null;
    if (hands) {
      
      for (const [h, y0] of [['R', 2], ['L', 11]]) {
        for (const sc of hands[h]) {
          const a = X(sc.fromS), c = SEC_COL[sc.state], b = Math.max(X(sc.toS), a + (sc.state === 'fix' ? 5 : 3));
          g.fillStyle = c.pill; g.beginPath(); g.roundRect ? g.roundRect(a, y0, Math.max(2, b - a - 1), 7, 3) : g.rect(a, y0, Math.max(2, b - a - 1), 7); g.fill();
          if (sc.state === 'fix') {
            g.save(); g.beginPath(); g.rect(a, y0, Math.max(2, b - a - 1), 7); g.clip();
            g.strokeStyle = 'rgba(254, 202, 202, 0.5)'; g.lineWidth = 1; g.beginPath();
            for (let k = a - 7; k < b; k += 5) { g.moveTo(k, y0 + 7); g.lineTo(k + 7, y0); }
            g.stroke(); g.restore();
          }
        }
        g.fillStyle = 'rgba(13, 12, 11, 0.8)'; g.fillRect(0, y0 - 1, 10, 9);
        g.fillStyle = '#F3F4F6'; g.font = '700 8px "Wix Madefor Display", system-ui, sans-serif'; g.fillText(h, 2, y0 + 6.5);
      }
      g.font = '500 10px "Wix Madefor Display", system-ui, sans-serif';
    } else if (secs.length) {
      
      for (const sc of secs) {
        const a = X(sc.fromS), b = X(sc.toS), c = SEC_COL[sc.state];
        g.fillStyle = c.pill; pill(a, b); g.fill();
        if (sc.state === 'fix') {
          g.save(); pill(a, b); g.clip();
          g.strokeStyle = 'rgba(254, 202, 202, 0.45)'; g.lineWidth = 1; g.beginPath();
          for (let k = a - 16; k < b; k += 6) { g.moveTo(k, 18); g.lineTo(k + 16, 2); }
          g.stroke(); g.restore();
        }
      }
    } else {
      for (const p of r.phrases || []) {
        const a = X(p.s), b = X(p.e), flagged = p.flagged && p.flagged.length;
        g.fillStyle = flagged ? 'rgba(192,132,252,0.35)' : 'rgba(255,255,255,0.08)';
        pill(a, b); g.fill();
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, top, w, bot - top);
    for (const sc of secs) {
      if (sc.state === 'unsure') continue;
      g.fillStyle = SEC_COL[sc.state].tint; g.fillRect(X(sc.fromS), top, Math.max(1, X(sc.toS) - X(sc.fromS)), bot - top);
    }
    const notes = r.notes || [], ref = r.reference;
    const pitches = notes.map((n) => n[2]).concat(ref ? [...(ref.wrong || []).map((x) => x[2]), ...(ref.missed || []).map((x) => x[1])] : []);
    if (pitches.length) {
      
      const lo = pitches.reduce((a, m) => Math.min(a, m), Infinity) - 1, hi = pitches.reduce((a, m) => Math.max(a, m), -Infinity) + 1;
      const rowH = (bot - top - 4) / (hi - lo);
      const Y = (m) => bot - 2 - (m - lo + 0.5) * rowH;
      g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
      for (let m = Math.ceil(lo / 12) * 12; m <= hi; m += 12) {
        g.beginPath(); g.moveTo(0, Math.round(Y(m)) + 0.5); g.lineTo(w, Math.round(Y(m)) + 0.5); g.stroke();
        g.fillStyle = 'rgba(156,163,175,0.8)'; g.fillText(noteName(m), 3, Y(m) - 2);
      }
      const nh = Math.max(2, Math.min(6, rowH - 0.5));
      for (const [on, off, m, , hand] of notes) {
        g.fillStyle = hand === 'L' ? '#A855F7' : hand === 'R' ? '#EC4899' : '#9CA3AF';
        g.fillRect(X(on), Y(m) - nh / 2, Math.max(1.5, X(off) - X(on)), nh);
      }
      if (ref && scoreListsShown(r)) {                    
        g.strokeStyle = '#FBBF24'; g.lineWidth = 1.5;
        const ring = (t, m, dash) => { g.setLineDash(dash ? [2, 2] : []); g.beginPath(); g.arc(X(t), Y(m), 5, 0, Math.PI * 2); g.stroke(); };
        (ref.wrong || []).forEach((x) => ring(x[0], x[2]));
        (ref.missed || []).forEach((x) => ring(x[0], x[1], true));
        (ref.extra || []).forEach((x) => ring(x[0], x[1]));
        g.setLineDash([]);
      }
    }
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = steps.find((s) => (w / D) * s >= 56) || 600;
    g.fillStyle = '#9CA3AF';
    const off = clipStart();                               
    for (let t = Math.ceil(off / step - 1e-9) * step - off; t <= D + 1e-6; t += step) {
      const x = X(t), label = mmss(t + off), tw = g.measureText(label).width;
      g.fillRect(x, bot, 1, 4);
      g.fillText(label, clamp(x - tw / 2, 0, w - tw), h - 3);
    }
  }

  function renderMarks() {
    const r = S.result, D = S.D, lanes = [];
    const html = (r.findings || []).map((f, i) => {
      const a = clamp(f.fromS / D, 0, 1), b = clamp(Math.max(f.toS, f.fromS) / D, 0, 1);
      let lane = lanes.findIndex((end) => end <= a);
      if (lane < 0) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = Math.max(b, a + 0.03) + 0.005;
      
      const h = f.hand === 'L' || f.hand === 'R' ? f.hand : 'B';
      return `<button type="button" class="mark h-${h}${i === 0 ? ' main' : ''}" data-act="seek" data-i="${i}" style="left:${(a * 100).toFixed(3)}%;width:${((b - a) * 100).toFixed(3)}%;top:${lane * 22}px" aria-label="${esc(f.title || '')}${esc(handTail(f))}, ${esc(span(f.fromS, f.toS))}" title="${esc(f.title || '')} (${esc(span(f.fromS, f.toS))})"></button>`;
    }).join('');
    $('marks').innerHTML = html;
    $('marks').style.height = `${Math.max(1, lanes.length) * 22}px`;
  }
  function updatePlayhead(t) {
    const cv = $('roll'), ph = $('playhead');
    if (!cv.clientWidth) return;
    const x = cv.offsetLeft + (clamp(t, 0, S.D) / S.D) * cv.clientWidth;
    ph.style.transform = `translateX(${x - 8}px)`;
    ph.hidden = t > S.D + 0.5;
  }
  function seekFromRoll(e) {
    const cv = $('roll'), rect = cv.getBoundingClientRect();
    const t = clamp((e.clientX - rect.left) / rect.width, 0, 1) * S.D;
    const vid = $('vid');
    if (vid.readyState) vid.currentTime = t;
    updatePlayhead(t);
  }

  

  function waitEvent(el, ev, ms) {
    return new Promise((resolve) => {
      const done = () => { clearTimeout(t); el.removeEventListener(ev, done); resolve(); };
      const t = setTimeout(done, ms);
      el.addEventListener(ev, done);
    });
  }
  async function seekTo(t) {
    const vid = $('vid');
    if (vid.readyState < 1) await waitEvent(vid, 'loadedmetadata', 3000);
    if (vid.readyState < 1) return false;
    if (Math.abs(vid.currentTime - t) < 0.05) return true;
    const p = waitEvent(vid, 'seeked', 2500);
    vid.currentTime = t;
    await p;
    drawOverlay();
    return true;
  }
  let ownPause = false;
  
  
  
  
  function unlockStage() {
    if (S.stage === 'hands') { if (S.hands) S.hands.unlock(); return; }
    const v = $('vid');
    
    
    if (!v.paused || ownPause || !v.getAttribute('src')) return;
    const p = v.play();
    if (!v.paused) { ownPause = true; v.pause(); }
    if (p) p.catch(() => {});
  }
  function stagePause() {
    if (S.stage === 'hands') { if (S.hands && S.hands.playing()) S.hands.pause(); return; }
    const v = $('vid'); if (!v.paused) { ownPause = true; v.pause(); }
  }
  
  
  
  function sectionOf(f, m) {
    const mo = momentsOf(f), k = clamp(m, 0, mo.length - 1), [from, to] = mo[k];
    if (to - from >= 0.1) return [Math.max(0, from - 0.5), to + 0.5];
    const a = +f.fromS, b = Math.max(+f.toS || a, a);
    if (k === 0 && Number.isFinite(a) && from >= a - 0.05 && to <= b + 0.05) return [Math.max(0, a - 1), b + 1];
    return [Math.max(0, from - 1), to + 1];
  }
  
  
  const playSection = (f, isCurrent, m = 0) => held(playMoment(f, isCurrent, m));
  async function playMoment(f, isCurrent, m) {
    const [a, to] = sectionOf(f, m);
    if (S.stage === 'hands') {
      const h = S.hands;
      if (!h) return;
      try { await h.ready; } catch {   }
      if (!isCurrent() || S.hands !== h) return;
      const b = Math.min(to, a + MAX_SECTION_S, h.duration());
      await h.playSection(a, b);                                     
      return;
    }
    const vid = $('vid');
    const b = Math.min(to, a + MAX_SECTION_S, Number.isFinite(vid.duration) ? vid.duration : Infinity);
    if (!(await seekTo(a)) || !isCurrent() || vid.error) return;
    try { await vid.play(); } catch (e) {                           
      if (e && e.name === 'NotAllowedError' && isCurrent()) notice('This browser did not let the video play. Tap play on the video once, then try again.');
      return;
    }
    await new Promise((resolve) => {
      let raf = 0;
      const done = () => { cancelAnimationFrame(raf); clearTimeout(dl); resolve(); };
      const dl = setTimeout(done, ((b - a) * 1000) / (vid.playbackRate || 1) + 3000);
      const tick = () => { if (!isCurrent() || vid.paused || vid.ended || vid.currentTime >= b) done(); else raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    });
    if (isCurrent() && !vid.paused) { ownPause = true; vid.pause(); }     
  }
  function highlight(i) {
    document.querySelectorAll('.find.on').forEach((el) => { el.classList.remove('on'); el.removeAttribute('aria-current'); });
    document.querySelectorAll('.mark.on').forEach((el) => el.classList.remove('on'));
    if (S.hands) S.hands.highlight(i == null || i < 0 ? null : i);
    if (i == null || i < 0) return;
    const card = $(`find-${i}`);
    if (card) { card.classList.add('on'); card.setAttribute('aria-current', 'true'); }
    const mk = $('marks').querySelector(`[data-i="${i}"]`);
    if (mk) mk.classList.add('on');
  }
  
  
  
  function revealFor(i) {
    const card = i >= 0 ? $(`find-${i}`) : null;
    if (wide.matches && !$('player').parentElement.classList.contains('tall')) {
      const pr = $('player').getBoundingClientRect();
      if (pr.top < 0 || pr.bottom > window.innerHeight) window.scrollBy({ top: $('player').parentElement.getBoundingClientRect().top - 16, behavior: behavior() });
      else if (card) card.scrollIntoView({ block: 'nearest', behavior: behavior() });
      return;
    }
    const pr = $('player').getBoundingClientRect();
    if (pr.top < 0 || pr.top > window.innerHeight * 0.4) $('player').scrollIntoView({ block: 'start', behavior: behavior() });
  }
  
  function playFinding(i, m = 0) {
    const f = S.result && (S.result.findings || [])[i];
    if (!f) return Promise.resolve();
    if (T.state === 'playing') tourPause();
    stopSpeaking();
    highlight(i);
    openRow(i);
    revealFor(i);
    unlockStage();                                               
    const my = ++S.sectionSeq;
    return playSection(f, () => my === S.sectionSeq && T.state !== 'playing', m);
  }

  

  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  
  let voices = [], voiceURI = store.get(VOICE_KEY) || '', cancelSpeak = null;
  function loadVoices() {
    voices = synth ? synth.getVoices() : [];
    const sel = $('voice-sel');
    
    
    
    sel.style.maxWidth = '100%';
    sel.style.minWidth = '0';
    if (sel.parentElement) sel.parentElement.style.minWidth = '0';
    if (voices.length) {
      const R = window.MVVoices;
      const en = R ? R.ranked(voices) : voices.filter((v) => /^en([-_]|$)/i.test(v.lang)), rest = voices.filter((v) => !en.includes(v));
      const best = R ? R.best(voices) : null;
      if (!voiceURI && best && store.get(VOICE_KEY) == null) voiceURI = best.voiceURI;
      sel.innerHTML = '<option value="">Browser default</option>' + [...en, ...rest].map((v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})${v === best ? ', the most natural here' : ''}</option>`).join('');
      sel.value = voices.some((v) => v.voiceURI === voiceURI) ? voiceURI : '';
    }
    sel.hidden = $('voice-lbl').hidden = !voices.length;
    voiceUi();
  }
  const browserNote = () => (!synth ? "This browser cannot speak, so the teacher's words are shown instead."
    : voices.length ? "Spoken by your browser's own voice." : "Spoken by your browser's voice if it has one; the words are always shown.");
  function stopSpeaking() {
    if (cancelSpeak) cancelSpeak();
    else if (synth) synth.cancel();
    if (voiceAudio && !voiceAudio.paused) voiceAudio.pause();
  }
  
  const sentences = (t) => (String(t || '').match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) || []).map((s) => s.trim()).filter(Boolean);
  const readMsOf = (s) => 900 + String(s).split(/\s+/).length * 380;      
  
  
  
  
  
  
  function browserSay(text) {
    const parts = sentences(text);
    if (!parts.length) parts.push(text);
    return new Promise((resolve) => {
      let done = false, k = 0, t1 = 0, t2 = 0, t3 = 0, u = null;
      const clear = () => { clearTimeout(t1); clearTimeout(t3); t1 = t3 = 0; };
      const detach = () => { if (u) u.onstart = u.onend = u.onerror = null; };
      const finish = (said = true) => {
        if (done) return;
        done = true; clear(); clearTimeout(t2); detach();
        if (muteHook === toQuiet) muteHook = null;
        if (cancelSpeak === stop) { cancelSpeak = null; $('voice-stop').hidden = true; }
        resolve(said);
      };
      const stop = () => { detach(); hideTap(); if (synth) synth.cancel(); finish(false); };
      
      const toQuiet = () => {
        if (done) return;
        detach(); clear(); clearTimeout(t2); if (synth) synth.cancel(); hideTap();
        done = true; muteHook = null;
        if (cancelSpeak === stop) { cancelSpeak = null; $('voice-stop').hidden = true; }
        quietLine(parts.slice(Math.max(0, k - 1)).join(' ')).then(resolve);
      };
      cancelSpeak = stop;
      muteHook = toQuiet;
      $('voice-stop').hidden = T.state === 'playing';                
      if (!synth) { t2 = setTimeout(finish, readMsOf(text)); return; }
      
      
      const fallback = () => {
        if (done || t2) return;
        detach(); clear();
        t2 = setTimeout(finish, readMsOf(parts.slice(k - 1).join(' ')));
      };
      const next = () => {
        if (done) return;
        clear(); detach();
        if (k >= parts.length) { finish(); return; }
        const s = parts[k++], readMs = readMsOf(s);
        u = new SpeechSynthesisUtterance(s);
        const v = voices.find((x) => x.voiceURI === voiceURI);
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = document.documentElement.lang || 'en';
        let started = false;
        u.onstart = () => { started = true; };
        u.onend = () => (started ? next() : fallback());
        
        
        u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? finish(false)
          : e.error === 'not-allowed' && !started ? (clear(), detach(), askTap(() => { if (!done) { k--; next(); } }))
            : started ? next() : fallback());
        t1 = setTimeout(() => { if (!started) { fallback(); synth.cancel(); } }, 2500);
        
        
        t3 = setTimeout(() => { detach(); synth.cancel(); next(); }, readMs * 1.5 + 3000);
        synth.speak(u);
      };
      next();
    });
  }

  
  
  
  const VOICE_ON_KEY = 'museverse-teacher-voice-on', AUTO_KEY = 'museverse-teacher-autostart';
  let voiceOn = store.get(VOICE_ON_KEY) !== '0', muteHook = null, tapThen = null;
  const autoOn = () => false;
  function speak(text) {
    stopSpeaking();
    text = String(text || '');
    if (!voiceOn) return held(quietLine(text));
    return held(quietLine(text));
  }
  
  function quietLine(text) {
    return new Promise((resolve) => {
      let t = 0;
      const finish = (said) => { clearTimeout(t); if (cancelSpeak === stop) cancelSpeak = null; resolve(said); };
      const stop = () => finish(false);
      cancelSpeak = stop;
      t = setTimeout(() => finish(true), readMsOf(text));
    });
  }
  function setVoiceOn(on) {
    voiceOn = !!on;
    store.set(VOICE_ON_KEY, voiceOn ? '1' : '0');
    if (voiceOn) unlockVoice();
    else if (muteHook) muteHook();
    if (S.chat && S.chat.voice) S.chat.voice();
    voiceUi();
  }
  function voiceUi() {
    $('t-mute').setAttribute('aria-pressed', String(!voiceOn));
    $('t-mute').textContent = voiceOn ? 'Mute' : 'Unmute';
    $('voice-credit').hidden = true;
    $('t-mute').hidden = true;
    $('voice-note').textContent = !voiceOn ? "Muse is muted: the words are on screen only. The speaker in the question box turns the voice back on."
      : elevenOn() ? "Voice by ElevenLabs. A line it cannot say is spoken by your browser's own voice (chosen below)."
        : browserNote();
  }
  
  
  function askTap(then) {
    tapThen = then;
    $('teacher').hidden = false;
    $('voice-tap').hidden = false;
  }
  function hideTap() { tapThen = null; $('voice-tap').hidden = true; }

  
  
  
  
  const voiceAudio = typeof Audio === 'function' ? new Audio() : null;
  if (voiceAudio) voiceAudio.preload = 'auto';
  const clips = new Map();
  let clipsFor = '', elevenNoFor = '';
  const takeKey = () => (S.kind === 'job' ? `job:${S.job}` : S.kind === 'sample' ? `sample:${S.sample}` : '');
  const elevenOn = () => !!(voiceAudio && S.health && S.health.voiceOut && S.health.voiceOut.on && takeKey()
    && elevenNoFor !== takeKey() && !(S.result && isQuest(S.result)));
  
  let voiceUnlocked = false;
  function unlockVoice() {
    if (voiceUnlocked || !voiceAudio) return;
    voiceUnlocked = true;
    try {
      const n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      if (!voiceAudio.getAttribute('src')) voiceAudio.src = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
      const p = voiceAudio.play();
      if (p) p.then(() => { if (!cancelSpeak) voiceAudio.pause(); }).catch(() => { voiceUnlocked = false; });
    } catch { voiceUnlocked = false; }
  }
  async function clipFor(text, signal) {
    const key = takeKey();
    if (clipsFor !== key) { for (const u of clips.values()) URL.revokeObjectURL(u); clips.clear(); clipsFor = key; }
    if (clips.has(text)) return clips.get(text);
    const path = S.kind === 'job' ? `jobs/${S.job}/speak` : `samples/${S.sample}/speak`;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (code) headers.set('X-Teacher-Code', code);
    if (S.kind === 'job' && jobKey(S.job)) headers.set('X-Teacher-Job-Key', jobKey(S.job));
    let r;
    try { r = await fetch(new URL(path, API), { method: 'POST', headers, body: JSON.stringify({ text }), signal }); } catch { return null; }
    if (!r.ok) { if (r.status === 403 || r.status === 404) { elevenNoFor = key; voiceUi(); } return null; }
    try {
      const url = URL.createObjectURL(await r.blob());
      if (takeKey() === key) clips.set(text, url);
      return url;
    } catch { return null; }
  }
  function elevenSay(text) {
    return new Promise((resolve) => {
      let done = false, t = 0;
      const a = voiceAudio, ctl = new AbortController();
      const detach = () => { a.onended = a.onerror = null; clearTimeout(t); };
      const end = () => {
        done = true; detach();
        if (muteHook === toQuiet) muteHook = null;
        if (cancelSpeak === stop) { cancelSpeak = null; $('voice-stop').hidden = true; }
      };
      const finish = (said = true) => { if (done) return; end(); resolve(said); };
      const stop = () => { if (done) return; ctl.abort(); a.pause(); hideTap(); finish(false); };
      const toQuiet = () => { if (done) return; ctl.abort(); a.pause(); hideTap(); end(); quietLine(text).then(resolve); };
      const toBrowser = () => { if (done) return; a.pause(); end(); browserSay(text).then(resolve); };
      cancelSpeak = stop;
      muteHook = toQuiet;
      $('voice-stop').hidden = T.state === 'playing';
      const play = () => {
        if (done) return;
        a.onended = () => finish(true);
        a.onerror = toBrowser;
        t = setTimeout(() => finish(true), readMsOf(text) * 2 + 8000);       
        const p = a.play();
        if (p) p.catch((e) => {
          if (done) return;
          if (e && e.name === 'NotAllowedError') { detach(); askTap(play); } else toBrowser();
        });
      };
      clipFor(text, ctl.signal).then((url) => {
        if (done) return;
        if (!url) { toBrowser(); return; }
        a.src = url;
        voiceUi();
        play();
      });
    });
  }
  function setCaption(say, tip) {
    $('t-caption').innerHTML = `${esc(say || '')}${tip ? `<span class="tipline"><b>Try this:</b> ${esc(tip)}</span>` : ''}`;
  }

  
  const T = { state: 'idle', i: 0, seq: 0 };
  function tourUi() {
    
    if (T.state === 'idle' && $('teacher').contains(document.activeElement)) $('t-start').focus({ preventScroll: true });
    $('teacher').hidden = T.state === 'idle' && !$('t-caption').textContent;
    $('t-pause').textContent = T.state === 'paused' ? 'Resume' : 'Pause';
    $('t-pause').disabled = T.state === 'idle';
    $('t-next').disabled = T.state === 'idle';
    $('t-stop').disabled = T.state === 'idle';
  }
  function tourState(text, live) { $('t-state').innerHTML = `${live ? '<span class="live-dot" aria-hidden="true"></span>' : ''}${esc(text)}`; }
  async function tourRun(from) {
    const r = S.result;
    if (!r) return;
    const fs = r.findings || [], n = fs.length, my = ++T.seq;
    S.sectionSeq++;
    T.state = 'playing'; tourUi();
    const current = () => my === T.seq && T.state === 'playing';
    const where = S.stage === 'hands' ? 'of the take' : 'of your video';
    for (let i = from; i <= n; i++) {
      if (!current()) return;
      T.i = i;
      if (i === 0) {
        highlight(-1);
        tourState('Summary', true);                              
        setCaption(r.summary && r.summary.say);
        await speak((r.summary && r.summary.say) || 'Here is what I noticed.');
        continue;
      }
      const f = fs[i - 1], [a, b] = momentsOf(f)[0];
      highlight(i - 1); revealFor(i - 1);
      tourState(`${i} of ${n} · playing ${span(a, b)} ${where}`, true);
      setCaption(f.title, '');
      await playSection(f, current);
      if (!current()) return;
      tourState(`${i} of ${n} · ${f.title || ''}`, true);
      setCaption(whatOf(f), practiseOf(f)[0]);
      await speak(hearText(f));
    }
    const pb = S.plan && (S.plan.blocks || [])[0];
    if (pb && current()) {                                       
      highlight(-1);
      tourState('Your practice plan', true);
      const mins = `${pb.minutes} minute${+pb.minutes === 1 ? '' : 's'}`;
      $('t-caption').innerHTML = `<b>Your practice plan starts here, for ${esc(mins)}:</b> ${esc(pb.exercise || '')}`;
      const card = $('plan-0');
      if (card) { card.classList.add('on'); card.scrollIntoView({ block: 'nearest', behavior: behavior() }); }
      await speak(`Your practice plan starts with this, for ${mins}: ${pb.exercise || ''}`);
      if (card) card.classList.remove('on');
    }
    if (my !== T.seq) return;
    T.state = 'idle'; T.i = 0;
    highlight(-1);
    tourState('Done');
    setCaption("That's everything. Ask me about any of it below.");
    $('t-start').lastChild.textContent = n ? 'Walk me through it again' : 'Show it again';
    tourUi();
  }
  
  
  const tour = (from) => held(tourRun(from));
  function tourPause() {
    if (T.state !== 'playing') return;
    T.seq++; T.state = 'paused';
    stopSpeaking();
    stagePause();
    tourState(`Paused at ${T.i === 0 ? 'the summary' : `${T.i} of ${(S.result.findings || []).length}`}`);
    tourUi();
  }
  function tourStop() {
    T.seq++; T.state = 'idle'; T.i = 0;
    stopSpeaking();
    hideTap();
    $('t-caption').textContent = '';
    highlight(-1);
    tourUi();
  }
  
  
  
  
  function autoStart(r, seeking) {
    if (!autoOn() || seeking) return;
    const go = () => { if (S.result === r && T.state === 'idle') tourStart(); };
    const ua = navigator.userActivation;
    if (ua && !ua.hasBeenActive) {
      setCaption(r.summary && r.summary.say);
      tourState('Muse is ready to talk');
      askTap(go);
      return;
    }
    setTimeout(go, 250);
  }
  function tourStart() {
    hideTap();
    unlockStage();                                               
    stopSpeaking();
    $('teacher').hidden = false;
    tour(0);
    revealFor(-1);
  }

  

  
  function keepText() {
    const d = S.health ? +S.health.keepDays : NaN;
    if (!(d > 0)) return 'a limited time';
    if (d < 1) { const h = Math.max(1, Math.round(d * 24)); return `${h} hour${h === 1 ? '' : 's'}`; }
    const n = Math.round(d * 10) / 10;
    return `${n} day${n === 1 ? '' : 's'}`;
  }
  
  const META_SENDS = {
    sam: 'the video without its sound, and frames from it, to find the keyboard and the hands (SAM 3.1)',
    muse: "what the analysis found about the playing, and the questions asked about it, to word the teacher's remarks and answers and to write the practice plan (Muse)",
    stt: 'spoken questions, to turn them into text (Muse Voice Transcribe)',
  };
  const metaParts = (h) => Object.keys(META_SENDS).filter((k) => h && h.meta && h.meta[k]).map((k) => META_SENDS[k]);
  
  const toReplicate = (h) => !!(h && h.replicate && h.replicate.sam);
  
  
  const toOpenRouter = (h) => !!(h && h.openrouter && h.openrouter.muse);
  const orProviders = (h) => { const p = (h && h.openrouter && h.openrouter.providers) || []; return p.length ? p.join(' or ') : 'Meta'; };
  const orModel = (h) => (/glimmer/i.test((h && h.openrouter && h.openrouter.model) || '') ? 'Muse Glimmer' : 'Muse Spark');
  
  const orModels = (h) => (orModel(h) === 'Muse Spark' && h && h.openrouter && h.openrouter.planModel ? 'Muse Spark, and Muse Wonder for the plan' : orModel(h));
  const orMeta = (h) => toOpenRouter(h) && ((h.openrouter.providers || ['Meta']).includes('Meta'));
  
  
  const toOpen = (h) => !!(h && h.openWeights && h.openWeights.muse);
  const openFamily = (h) => (h && h.openWeights && h.openWeights.family) || 'Muse Spark Open';
  const openBy = (h) => (h && h.openWeights && h.openWeights.servedBy) || 'its host';
  
  const openAt = (h) => { const b = h && h.openWeights && h.openWeights.baseHost; return b ? ` (at ${b})` : ''; };
  const openHost = (h) => { const o = (h && h.openWeights) || {}; return o.host === 'openrouter' ? 'OpenRouter' : o.host === 'custom' ? 'our own model server' : o.hostName || 'its host'; };
  const openKeeps = (h) => { const o = (h && h.openWeights) || {};
    return o.host === 'custom' ? '' : o.host === 'openrouter' ? 'OpenRouter and the provider that runs the model may keep copies under their own terms, so deleting my take here does not delete them.'
      : `${openHost(h)} may keep copies under its own terms, so deleting my take here does not delete them.`; };
  const OPEN_CONSENT = (h) => `What the analysis finds about my playing, and the questions I ask about it, go to ${openFamily(h)}, Meta's open-weights model, `
    + `served by ${openBy(h)}${openAt(h)}, to word the teacher's remarks and answers and to write my practice plan. ${openKeeps(h)}`.trim();
  
  const tipOffered = (h) => !!(h && h.framingTip && h.framingTip.available);
  const tipWhy = (h) => { const t = (h && h.framingTip) || {}, to = andList(t.to || []);
    return `Optional, and only if the first look finds the video badly framed. The model is ${t.who || 'a Meta model'}. The frames show your hands; `
      + `they go to ${to}, which may keep a copy under its own terms. Nothing about them is kept here but the tip chosen.`; };
  
  const toEleven = (h) => !!(h && h.voiceOut && h.voiceOut.on);
  const ELEVEN_CONSENT = "The teacher's words about my take (never my video, its sound or my questions) are sent to ElevenLabs, a voice "
    + "service, which says them aloud in Muse's voice. ElevenLabs may keep a copy under its own terms, so deleting my take here does not delete it.";
  
  const outsideNames = (h) => [metaParts(h).length && "Meta's Model API", toOpenRouter(h) && 'OpenRouter', toOpen(h) && openHost(h), toReplicate(h) && 'Replicate',
    toEleven(h) && 'ElevenLabs'].filter(Boolean);
  const OPENROUTER_CONSENT = (h) => `What the analysis finds about my playing, and the questions I ask about it, go to OpenRouter, a service that passes requests on to AI models, `
    + `and from there only to ${orProviders(h)}, to word the teacher's remarks and answers and to write my practice plan (${orModels(h)}). `
    + `OpenRouter and ${orProviders(h)} may keep copies under their own terms, so deleting my take here does not delete them.`;
  const andList = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] || 'an outside service');
  const samWhere = (b) => String(b).replace(/^replicate\b/, 'on Replicate');
  const REPLICATE_CONSENT = 'Frames from my video, without its sound, are sent to Replicate, a US company that runs AI models in the cloud, '
    + 'where SAM 3.1 finds the keyboard and my hands in them. This server deletes the frames from Replicate when each batch is done; '
    + 'Replicate deletes what it found an hour later, and any frames left there within 24 hours.';
  function adultWhy(h) {
    const meta = metaParts(h).length > 0, rep = toReplicate(h);
    if (toOpenRouter(h) || toOpen(h) || toEleven(h)) {
      const names = outsideNames(h).map((n) => (n === 'OpenRouter' && toOpenRouter(h) ? `OpenRouter (which passes what it gets on to ${orProviders(h)})`
        : toOpen(h) && n === openHost(h) ? `${openHost(h)} (which runs ${openFamily(h)}, Meta's open-weights model${h.openWeights.host === 'openrouter' ? `, at ${openBy(h).replace(/, through OpenRouter$/, '')}` : ''})` : n));
      return `This server uses ${andList(names)}, and their terms are for adults.`;
    }
    if (meta && rep) return "This server uses Meta's Model API and Replicate, and their terms are for adults.";
    if (rep) return "This server sends frames from your video to Replicate, and Replicate's terms are for adults.";
    return "This server uses Meta's Model API, and Meta's terms allow it for adults only.";
  }

  
  function renderConsent(h) {
    const keep = keepText(), parts = metaParts(h);
    const items = !h ? ['Could not check how this server handles your video. Reload the page before uploading.']
      : [`My video, with its sound, is processed on this server to analyse my playing, and deleted from it after ${keep}.`]
        .concat(toReplicate(h) ? [REPLICATE_CONSENT] : [])
        .concat(parts.length ? [`This server also uses Meta's Model API, which receives ${parts.join('; ')}. Meta keeps its copy under its own terms, so deleting my take here does not delete it.`] : [])
        .concat(toOpenRouter(h) ? [OPENROUTER_CONSENT(h)] : [])
        .concat(toOpen(h) ? [OPEN_CONSENT(h)] : [])
        .concat(toEleven(h) ? [ELEVEN_CONSENT] : [])
        .concat(["The MIDI file from my piano, if I add it, stays on this server and is deleted with my take. When it can be lined up with the video, its notes become my lesson's notes and go where the lesson goes."])
        .concat(['I will not upload other people without their OK.']);
    const html = items.map((t) => `<li>${esc(t)}</li>`).join('');
    const list = $('consent-list');
    
    const key = html + (tipOffered(h) ? tipWhy(h) : '');
    if (list.dataset.html !== key) { list.innerHTML = html; list.dataset.html = key; $('f-consent').checked = false; $('f-adult').checked = false; $('f-tip').checked = false; }
    $('adult-row').hidden = !(h && h.adultRequired);
    $('adult-why').textContent = adultWhy(h);
    $('tip-row').hidden = !tipOffered(h);
    if (!tipOffered(h)) $('f-tip').checked = false;
    $('tip-why').textContent = tipOffered(h) ? tipWhy(h) : '';
    formSteps();
    for (const el of document.querySelectorAll('.keep-days')) el.textContent = keep;
    
    const viaOr = orMeta(h), OR_TO_META = "what the analysis found about your playing, and the questions you ask about it, to word the teacher's remarks and answers and to write your practice plan (Muse Spark and Muse Wonder)";
    $('privacy-meta').innerHTML = !h ? "<p>This server's settings could not be checked. Reload the page to see what, if anything, it sends to Meta.</p>"
      : !parts.length && !viaOr ? "<p>With this server's current settings, nothing you upload or ask is sent to Meta.</p>"
      : !parts.length ? `<p>This server sends nothing to Meta's Model API directly. Through OpenRouter (below), Meta receives ${OR_TO_META}. It goes to Meta's Standard model, not its Contributor tier, and Meta's terms for its Standard models say it does not use what it is sent to train its models.</p>
        <p>Meta may keep what it receives for as long as it needs to run its service, under its own terms, so deleting your take here does not delete Meta's copy.</p>`
      : `<p>This server uses Meta's Model API on its Standard tier, where Meta's terms say it does not use what it is sent to train its models. Meta receives:</p>
        <ul>${parts.map((p) => `<li>${esc(cap(p))}.</li>`).concat(viaOr ? [`<li>Through OpenRouter (below), ${esc(OR_TO_META)}.</li>`] : []).join('')}</ul>
        <p>A spoken question goes to Meta only after you confirm you are 18 or older and agree to it, the first time you use the mic. Meta may keep what it receives for as long as it needs to run its service, under its own terms, so deleting your take here does not delete Meta's copy.</p>`;
    
    const rep = toReplicate(h), or = toOpenRouter(h);
    $('privacy-where-more').textContent = toOpen(h)
      ? `, apart from what goes to ${openHost(h)} to word the teacher's remarks and answers (below)${rep ? ', and the frames used to find the keyboard and your hands, which go to Replicate (below)' : ''}`
      : or && rep
      ? ", apart from what goes to OpenRouter to word the teacher's remarks and answers, and the frames used to find the keyboard and your hands, which go to Replicate (below)"
      : or ? ", apart from what goes to OpenRouter to word the teacher's remarks and answers (below)"
        : rep ? ', apart from the frames used to find the keyboard and your hands, which go to Replicate (below)' : '';
    $('privacy-age-more').textContent = [or && ` When it uses OpenRouter, which passes what it gets on to ${orProviders(h)}, you must be 18 or older to upload.`,
      toOpen(h) && ` When it uses ${openFamily(h)} at ${openHost(h)}, you must be 18 or older to upload.`,
      rep && ' When it sends your frames to Replicate, you must be 18 or older to upload.'].filter(Boolean).join('');
    $('privacy-openrouter').hidden = !or;
    $('privacy-openrouter').innerHTML = !or ? ''
      : `<h3>What goes to OpenRouter</h3>
        <p>To word the teacher's remarks, write your practice plan and answer the questions you type, this server uses ${esc(orModels(h))} through OpenRouter, a service that passes requests on to AI models. OpenRouter receives what the analysis found about your playing and the questions you ask about it, and passes them only to ${esc(orProviders(h))}: this server tells OpenRouter not to use any other provider${h.openrouter.dataCollection === 'deny' ? ', and only providers that OpenRouter lists as not storing or training on what they are sent' : ''}.</p>
        <p>This happens for an upload only if you agreed to it when uploading. OpenRouter and ${esc(orProviders(h))} may keep what they receive under their own terms, so deleting your take here does not delete their copies.</p>`;
    
    
    $('privacy-samples-via').textContent = toOpen(h)
      ? ` (here ${openFamily(h)}, Meta's open-weights model, served by ${openBy(h)}${openAt(h)}, which then receives your question and what the analysis found in that sample)` : '';
    $('privacy-open').hidden = !toOpen(h);
    $('privacy-open').innerHTML = !toOpen(h) ? ''
      : `<h3>What goes to ${esc(openHost(h))}</h3>
        <p>To word the teacher's remarks, write your practice plan and answer the questions you type, this server uses ${esc(openFamily(h))}, Meta's open-weights model, served by ${esc(openBy(h))}${esc(openAt(h))}. Meta does not run it there and receives none of it. ${esc(cap(openHost(h)))} receives what the analysis found about your playing and the questions you ask about it${h.openWeights.host === 'openrouter' ? ', and passes them only to the providers named here: this server tells OpenRouter not to use any other, nor any that stores or trains on what it is sent' : ''}.</p>
        <p>This happens for an upload only if you agreed to it when uploading, and never for a demo. ${esc(cap(openKeeps(h).replace('my take', 'your take')))}</p>`;
    const tipOn = tipOffered(h), tt = (h && h.framingTip) || {};
    $('privacy-tip').hidden = !tipOn;
    $('privacy-tip').innerHTML = !tipOn ? ''
      : `<h3>The filming tip</h3>
        <p>Only if you tick its own box when uploading, and only when the first look at your video finds it badly framed, the ${esc(String(tt.frames || 4))} still frames it read go to ${esc(tt.who || 'a Meta model')}, at ${esc(andList(tt.to || []))}, made smaller first (${esc(String(tt.maxSide || 768))} pixels at most) and with nothing else from the file. It chooses one tip from our list; the page shows our own words for it. The frames show your hands. This server keeps nothing about them but the tip chosen; ${esc(andList(tt.to || []))} may keep a copy under its own terms.</p>`;
    $('privacy-voice-line').textContent = toEleven(h)
      ? "The teacher's lines about your own uploads, and about a sample whose player agreed, are said aloud by ElevenLabs (below); the demos, and any line ElevenLabs cannot say, by your browser's own voice."
      : "Your browser reads the teacher's lines aloud with its own voice.";
    $('privacy-voice').hidden = !toEleven(h);
    $('privacy-voice').innerHTML = !toEleven(h) ? ''
      : `<h3>Muse's voice: ElevenLabs</h3>
        <p>The teacher's lines about your take are said aloud by ElevenLabs, a voice service. It receives only those words, never your video, its sound, your name or the questions you ask, and only for an upload where you agreed to it. Each line is made once and kept with your take on this server, and deleted with it. ElevenLabs may keep what it receives under its own terms, so deleting your take here does not delete its copy.</p>
        <p>The speaker in the question box, or Mute under the video, turns the voice off; the words stay on screen.</p>`;
    $('privacy-replicate').hidden = !rep;
    $('privacy-replicate').innerHTML = !rep ? ''
      : `<h3>What goes to Replicate</h3>
        <p>To find the keyboard and your hands, this server runs SAM 3.1, a model made by Meta, on Replicate, a company that runs AI models in the cloud, on computers in the United States. The model there is our own copy, so Meta does not receive your frames.</p>
        <p>Replicate receives the frames taken from your video (5 a second, without the sound), a batch at a time, and sends back where the keyboard and your hands are in each one. This server deletes each batch from Replicate as soon as it is done. Replicate deletes what it sent back an hour later, and deletes any batch this server could not delete within 24 hours, under its own terms. Deleting your take here does not delete Replicate's copy before then.</p>`;
    const chat = (h && h.chat) || {};
    
    $('muse-via').textContent = viaOr ? ' (through OpenRouter)' : toOpen(h) ? ` (${openFamily(h)}, its open-weights model, served by ${openBy(h)})` : '';
    $('privacy-demo-via').textContent = viaOr ? ', directly or through OpenRouter,' : '';
    $('privacy-demo').textContent = !h ? "this server's settings could not be checked"
      
      : h.questDataOk && h.questDataOpenRouter && chat.hosted && chat.route === 'openrouter' && viaOr && !h.openrouter.uploadsOnly
        ? "this server is set up with that agreement, so Meta's Muse Spark, through OpenRouter, may answer questions about a demo"
      : h.questDataOk && chat.hosted && chat.route === 'meta' ? "this server is set up with that agreement, so Meta's hosted Muse may answer questions about a demo"
      : `on this server, questions about a demo are answered by ${chat.glimmer ? 'our own Muse Glimmer server' : 'fixed answers'}`;
  }

  
  function samPlace(b) {
    const v = String(b || '');
    if (/^local/.test(v)) return /cuda/.test(v) ? "on this server's GPU" : "on this server's processor, which has no GPU";
    if (/^replicate/.test(v)) return 'on a cloud GPU';
    if (/^meta/.test(v)) return "on Meta's Model API";
    return 'on this server';
  }
  
  
  
  
  
  function waitText(h, seconds) {
    const w = h && h.wait, back = 'You can close the page and come back with its link.';
    if (!w || !(+w.jobS > 0)) return back;
    const spf = +w.sPerFrame, per = spf >= 10 ? Math.round(spf) : +spf.toFixed(1);
    const how = w.measured ? `measured on its last ${plural(+w.measured, 'take', 'takes')}` : 'our estimate until this server has timed a take';
    const ahead = (+w.queued || 0) + (w.running ? 1 : 0);
    const full = +w.windowS > 0 ? +w.windowS : 60, fps = +w.frames > 0 ? +w.frames / full : 5;
    const win = chosenWindow() || full;
    const secs = Number.isFinite(+seconds) && +seconds > 0 ? Math.min(+seconds, win) : win;
    const frames = Math.round(secs * fps), total = (+w.coldStartS || 0) + (+w.aheadS || 0) + spf * frames;
    const look = secs < win ? `I look closely at all ${Math.round(secs)} seconds of your video (${count(frames)} frames)`
      : `I look closely at up to ${Math.round(win)} seconds of your video (${count(frames)} frames)`;
    return `Expect ${durWords(total)}. ${look}, and the analysis here takes about ${per} s a frame `
      + `(SAM 3.1 ${samPlace(w.samBackend)}, then placing your hands on the keys; ${how}). `
      + (+w.coldStartS > 0 ? `That includes ${durWords(w.coldStartS)} for the server to start up. ` : '')
      + (ahead ? `${ahead} ${ahead === 1 ? 'take is' : 'takes are'} ahead of yours. ` : 'No other take is waiting. ') + back;
  }

  
  
  
  function chosenWindow() {
    if (!$('win-row') || $('win-row').hidden) return 0;
    const c = document.querySelector('input[name="f-window"]:checked');
    return c ? +c.value : 0;
  }
  
  
  function sentWindow() {
    const c = !$('win-row') || $('win-row').hidden ? null : document.querySelector('input[name="f-window"]:checked');
    return c && !c.dataset.own ? +c.value : 0;
  }
  function renderWindows(h) {
    const ws = h && Array.isArray(h.windows) ? h.windows.map(Number).filter((x) => x > 0) : [];
    const row = $('win-row');
    if (!row) return;
    const was = !row.hidden;
    row.hidden = !(ws.includes(30) && ws.includes(60));
    const own = h && +h.windowS > 0 ? Math.round(+h.windowS) : 0;
    let extra = row.querySelector('input[data-own]');
    if (!row.hidden && own && !ws.includes(own)) {
      if (!extra) {
        const lab = document.createElement('label');
        lab.className = 'small winpick';
        extra = document.createElement('input');
        extra.type = 'radio'; extra.name = 'f-window'; extra.dataset.own = '1';
        lab.append(extra, document.createTextNode(` ${own} s`));
        row.insertBefore(lab, $('win-hint'));
      }
      extra.value = String(own);
    } else if (extra) extra.parentElement.remove();
    if (!row.hidden && !was) {                      
      const def = ws.includes(own) || (own && extra && extra.isConnected) ? own : 60;
      for (const i of document.querySelectorAll('input[name="f-window"]')) i.checked = +i.value === def;
    }
  }
  async function loadHealth() {
    try {
      const r = await fetch(new URL('health', API));
      if (!r.ok) throw new Error(String(r.status));
      const h = await r.json();
      S.health = h;
      const chat = h.chat || {}, v = h.voice || {};
      const hostedName = chat.route === 'openrouter' ? `${orModel(h)} via OpenRouter` : chat.route === 'open' ? `${openFamily(h)} (open weights, served by ${openBy(h)})` : 'Muse Spark';
      const answers = [chat.hosted && `${hostedName} (uploads that agreed)`, chat.glimmer && 'Muse Glimmer (our server)', 'fixed answers'].filter(Boolean).join(', ');
      const ears = v.realtime ? "Meta's live speech-to-text" : v.file ? "Meta's speech-to-text, as a recording" : "your browser's own speech recognition, if it has one";
      const parts = [h.samBackend && `hands and keyboard: SAM 3.1 (${samWhere(h.samBackend)})`, h.transcriber && `notes: ${h.transcriber}`, h.voiceModel && `wording: ${h.voiceModel}`,
        `answers: ${answers}`, `spoken questions: ${ears}`, 'voice: your browser'].filter(Boolean);
      $('health').textContent = `This server · ${parts.join(' · ')}`;
    } catch { S.health = null; }
    renderConsent(S.health);
    renderLibrary(S.health);
    renderWindows(S.health);
    $('up-time').textContent = waitText(S.health, picked ? pickedS : null);
    
    $('code-row').hidden = !(codesOn() && !token);
    if (!$('f-code').value && code) $('f-code').value = code;
    homeSections();
  }

  function wire() {
    
    $('f-video').addEventListener('change', (e) => { pickVideo(e.target.files[0]); e.target.value = ''; });
    $('f-ref').addEventListener('change', (e) => { pickRef(e.target.files[0]); e.target.value = ''; });
    $('ref-clear').addEventListener('click', clearRef);
    
    $('win-row').addEventListener('change', (e) => {
      if (e.target && e.target.name === 'f-window') { if (picked) pickVideo(picked); else $('up-time').textContent = waitText(S.health, null); }
    });
    $('r-lesson').addEventListener('click', () => { if (S.kind === 'job' && S.job) { setUrl('job', S.job); route(); } });
    $('f-perf').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; pickPerf(f); });
    $('perf-clear').addEventListener('click', clearPerf);
    $('f-piece').addEventListener('change', (e) => {
      if (e.target.value && (refFile || (S.retake && S.retake.sameScore))) clearRef();   
      if (S.retake) S.retake.piece = e.target.value || null;
    });
    $('up-form').addEventListener('submit', submitUpload);
    $('up-cancel').addEventListener('click', () => { if (S.xhr) S.xhr.abort(); });
    const drop = $('drop');
    let depth = 0;
    drop.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.classList.remove('over'); } });
    
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0; drop.classList.remove('over');
      if (!$('v-home').hidden && !$('up-go').disabled && e.dataTransfer && e.dataTransfer.files.length) pickVideo(e.dataTransfer.files[0]);
    });

    
    const plainClick = (e) => !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
    $('demo-grid').addEventListener('click', (e) => {
      const a = e.target.closest('a[data-demo]');
      if (!a || !plainClick(e)) return;
      e.preventDefault();
      setUrl('demo', a.dataset.demo);
      openDemo(a.dataset.demo);
    });
    $('sample-grid').addEventListener('click', (e) => {
      const a = e.target.closest('a[data-sample]');
      if (!a || !plainClick(e)) return;
      e.preventDefault();
      setUrl('sample', a.dataset.sample);
      openSample(a.dataset.sample);
    });
    $('home-link').addEventListener('click', (e) => { if (!plainClick(e)) return; e.preventDefault(); goHome(); });
    
    $('takes-list').addEventListener('click', (e) => {
      const rm = e.target.closest('button[data-rm]');
      if (rm) {
        const li = rm.closest('li'), next = li && (li.nextElementSibling || li.previousElementSibling);
        dropTake(rm.dataset.rm);
        renderTakes();
        const to = next && $('takes-list').querySelector(`[data-rm="${next.querySelector('[data-rm]').dataset.rm}"]`);
        (to || $('upload')).focus({ preventScroll: !to });
        return;
      }
      const a = e.target.closest('a[data-job]');
      if (!a || !plainClick(e)) return;
      e.preventDefault();
      setJobUrl(a.dataset.job);
      openJob(a.dataset.job);
    });
    $('takes-clear').addEventListener('click', () => {
      for (const t of takesList()) forgetJobKey(t.id);
      saveTakes([]);
      renderTakes();
      $('upload').focus();
    });
    $('retake-cancel').addEventListener('click', () => { cancelRetake(); $('f-video').focus(); });
    
    for (const a of document.querySelectorAll('a[data-go]')) {
      a.addEventListener('click', (e) => {
        if (!plainClick(e)) return;
        e.preventDefault();
        if ($('v-home').hidden) { goHome(a.dataset.go); return; }
        const sec = $(a.dataset.go);
        sec.scrollIntoView({ block: 'start', behavior: behavior() });
        sec.focus({ preventScroll: true });
      });
    }
    
    const openPrivacy = () => { $('privacy').open = true; };
    document.addEventListener('click', (e) => { if (e.target.closest('a[href="#privacy"]')) openPrivacy(); });
    window.addEventListener('hashchange', () => { if (location.hash === '#privacy') openPrivacy(); });
    if (location.hash === '#privacy') openPrivacy();
    
    const ASKED = { 'f-consent': /tick the box/, 'f-adult': /18 or older/ };
    for (const id of ['f-consent', 'f-adult']) {
      $(id).addEventListener('change', () => {
        formSteps();
        if ($(id).checked && ASKED[id].test($('up-msg').textContent)) upMsg('');
      });
    }

    $('pr-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); $('pr-copied').textContent = 'Copied'; } catch { $('pr-copied').textContent = location.href; }
    });
    $('pr-again').addEventListener('click', newTake);
    $('pr-retry').addEventListener('click', () => S.job && openJob(S.job, S.name));
    $('r-new').addEventListener('click', () => goHome(S.kind === 'demo' ? 'demos' : S.kind === 'sample' ? 'samples' : 'upload'));

    const vid = $('vid');
    for (const ev of ['play', 'playing']) vid.addEventListener(ev, kick);
    for (const ev of ['pause', 'ended', 'seeking', 'emptied']) vid.addEventListener(ev, stillFrame);
    for (const ev of ['seeked', 'timeupdate', 'loadedmetadata', 'loadeddata']) vid.addEventListener(ev, () => { if (S.mediaT == null) drawOverlay(); });
    vid.addEventListener('error', () => { if (vid.getAttribute('src')) notice('This browser cannot play the video (it needs H.264 MP4). The findings and the timeline still work.', false); });
    vid.addEventListener('play', () => stageHold(true));
    for (const ev of ['pause', 'ended', 'emptied']) vid.addEventListener(ev, () => stageHold(false));
    vid.addEventListener('pause', () => {
      if (ownPause) { ownPause = false; return; }
      if (T.state === 'playing') tourPause();          
    });
    $('ov-on').addEventListener('change', drawOverlay);
    
    $('ov-explain').addEventListener('toggle', () => { $('video-stage').classList.toggle('explaining', $('ov-explain').open); drawOverlay(); });
    
    const sizePlayer = () => {
      drawOverlay(); drawRoll();
      const col = $('player').parentElement;                    
      col.classList.toggle('tall', col.offsetHeight > window.innerHeight - 32);
    };
    if ('ResizeObserver' in window) new ResizeObserver(sizePlayer).observe($('player'));
    window.addEventListener('resize', sizePlayer);

    
    
    const roll = $('roll');
    let rollTouch = null;
    roll.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { rollTouch = { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId }; return; }
      roll.setPointerCapture(e.pointerId); seekFromRoll(e);
    });
    roll.addEventListener('pointermove', (e) => {
      if (rollTouch && e.pointerId === rollTouch.pointerId) {
        const dx = e.clientX - rollTouch.clientX, dy = e.clientY - rollTouch.clientY;
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { rollTouch = null; try { roll.setPointerCapture(e.pointerId); } catch {   } seekFromRoll(e); }
        return;
      }
      if (roll.hasPointerCapture(e.pointerId)) seekFromRoll(e);
    });
    const rollUp = (e) => { if (rollTouch && e.type === 'pointerup' && e.pointerId === rollTouch.pointerId) seekFromRoll(rollTouch); rollTouch = null; };
    roll.addEventListener('pointerup', rollUp);
    roll.addEventListener('pointercancel', rollUp);

    
    
    document.addEventListener('click', (e) => {
      
      const rn = e.target.closest('#r-meta a.r-note');
      if (rn) {
        e.preventDefault();
        $('r-details').open = true;
        $('r-caveat').scrollIntoView({ block: 'center', behavior: behavior() });
        $('r-caveat').focus({ preventScroll: true });
        return;
      }
      const tg = e.target.closest('#findings .row-toggle');
      if (tg) { const card = tg.closest('.find'); openRow(card.id.slice(5), tg.getAttribute('aria-expanded') !== 'true'); return; }
      const b = e.target.closest('button[data-act]');
      if (!b || !S.result || b.closest('#chat-mount, #hands-stage')) return;
      const i = +b.dataset.i;
      if (b.dataset.act === 'new') newTake();
      else if (b.dataset.act === 'retake') startRetake();
      else if (b.dataset.act === 'seek') playFinding(i);
      else if (b.dataset.act === 'moment') playFinding(i, +b.dataset.m || 0);
      else if (b.dataset.act === 'say') {
        const f = (S.result.findings || [])[i];
        if (!f) return;
        if (T.state === 'playing') tourPause();
        highlight(i);
        speak(hearText(f));
      } else if (b.dataset.act === 'praise') {
        const g = (S.result.strengths || [])[i];
        if (!g) return;
        if (T.state === 'playing') tourPause();
        speak(g.say || '');
      } else if (b.dataset.act === 't' && S.stage === 'video') {
        if (T.state === 'playing') tourPause();
        const t = Math.max(0, +b.dataset.t - 1);
        revealFor(-1);
        unlockStage();
        seekTo(t).then(() => vid.play().catch(() => {}));
      } else if (b.dataset.act === 'bar' || (b.dataset.act === 't' && S.stage === 'hands')) {
        
        const a = +(b.dataset.a ?? b.dataset.t), z = b.dataset.b != null ? +b.dataset.b : a + 1.5;
        if (!Number.isFinite(a)) return;
        if (T.state === 'playing') tourPause();
        stopSpeaking();
        revealFor(-1);
        unlockStage();
        const my = ++S.sectionSeq;
        playSection({ fromS: a, toS: Math.max(a, z) }, () => my === S.sectionSeq && T.state !== 'playing');
      }
    });

    $('t-start').addEventListener('click', tourStart);
    
    
    $('r-ask').addEventListener('click', () => {
      const c = $('chat'), box = c.querySelector('#chat-mount input[type="text"], #chat-mount textarea');
      const touch = matchMedia('(pointer: coarse)').matches;
      c.scrollIntoView({ block: 'start', behavior: behavior() });
      (box && !touch ? box : c).focus({ preventScroll: true });
    });
    $('t-pause').addEventListener('click', () => { if (T.state === 'playing') tourPause(); else if (T.state === 'paused') { unlockStage(); tour(T.i); } });
    $('t-next').addEventListener('click', () => { if (T.state === 'idle') return; unlockStage(); stopSpeaking(); tour(T.i + 1); });
    $('t-stop').addEventListener('click', () => {
      tourStop();
      stagePause();
      $('teacher').hidden = true;
      $('t-start').focus();
    });

    $('voice-stop').addEventListener('click', stopSpeaking);
    $('t-mute').addEventListener('click', () => setVoiceOn(!voiceOn));
    $('voice-tap').addEventListener('click', () => {
      const then = tapThen;
      hideTap();
      unlockVoice();
      unlockStage();
      if (then) then();
    });
    $('auto-on').checked = autoOn();
    $('auto-on').addEventListener('change', (e) => store.set(AUTO_KEY, e.target.checked ? '1' : '0'));
    
    document.addEventListener('pointerdown', unlockVoice, { capture: true, once: true });
    document.addEventListener('keydown', unlockVoice, { capture: true, once: true });
    
    $('voice-sel').addEventListener('change', (e) => { voiceURI = e.target.value; store.set(VOICE_KEY, voiceURI || 'default'); });
    $('forget-token').hidden = !(token || code);
    
    $('forget-token').addEventListener('click', () => {
      token = ''; code = ''; store.set(TOKEN_KEY, null); store.set(CODE_KEY, null); $('f-code').value = '';
      store.set(JOBKEYS_KEY, null); saveTakes([]); renderTakes();
      $('forget-token').hidden = true;
      $('code-row').hidden = !codesOn();
      codeHint();
    });
    if (synth) {
      loadVoices();
      if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices); else synth.onvoiceschanged = loadVoices;
    } else loadVoices();
    window.addEventListener('popstate', () => { if ((window.__MV_SEARCH || '') !== routedSearch) route(); });
  }

  wire();
  filmCard('film-upload');
  S.healthReady = loadHealth();
  route();
})();
