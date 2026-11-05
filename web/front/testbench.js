










































































(() => {
  'use strict';
  
  
  
  const PRODUCT = window.TBServer && window.TBServer.product ? window.TBServer : null;
  
  
  const CFG = Object.assign({
    fps: 5, windows: [30, 60], maxAssetBytes: 20 * 1024 * 1024, partBytes: 14 * 1024 * 1024, partsMaxBytes: 400 * 1024 * 1024,
    steps: [], library: [],
    timing: { samSPerFrame: 100, keyboardSPerFrame: 2.1, fixedS: 175 }, timingSource: '', driveMaxBytes: 2 * 1024 ** 3,
    htmlWake: false, midiMaxBytes: 512 * 1024, openProviders: ['Fireworks', 'Modal', 'BaseTen', 'Together'],
  }, window.__TB_CONFIG__ || {});
  
  
  const QUICK_S = 30, NORMAL_S = 60;
  const STEP_STATES = ['waiting', 'running', 'done', 'failed', 'skipped'];      
  const PAGE = window.__TB_PAGE__ || null;
  const TITLE = PRODUCT ? 'Museverse: AI Piano Teacher' : 'Museverse Teacher Test Bench';
  const NUDGE_MS = 2 * 60 * 1000;             
  const STALE_MS = 12 * 60 * 1000;            
  const MAX_Q = 500, HISTORY_TURNS = 8, HISTORY_CHARS = 4000;   
  const CHAT_SUBS = 40;                       
  const JOB_ID = /^[0-9a-f]{32}$/;
  
  const ROW_ID = PRODUCT ? /^(?:[0-9a-f]{32}|s-[a-z0-9][a-z0-9-]{0,63})$/ : JOB_ID;
  const ASSET_ID = /^[A-Za-z0-9_-]{8,64}$/;   
  const MSG_ID = /^[0-9a-z]{6,16}-[0-9a-z]{4,12}$/;
  
  const RESET = ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
    + 'body{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%}[hidden]{display:none!important}';
  const HEAD = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>';
  
  
  const VIDEO_EXT = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mp4', '3gp': 'video/mp4', webm: 'video/webm' };
  const SMALLER = [
    'Trim it to the part you want feedback on: on a phone, Photos (or Gallery), Edit, then trim.',
    'Or export it smaller, at 720p: ffmpeg -i in.mov -vf scale=-2:720 -c:v libx264 -crf 28 -c:a aac out.mp4',
    'Or share it from a cloud drive as "Anyone with the link" and paste the link here instead (larger files work there).',
  ];
  const DRIVE_TIP = ['Share it from a cloud drive as "Anyone with the link" and paste the link here instead (up to 16 GB works there).'];
  const STATUS = { queued: 'Queued', fetching: 'Fetching', running: 'Running', done: 'Done', failed: 'Failed', deleting: 'Deleting' };
  const WHO = { muse: "Muse Spark (Meta's model)", openrouter: 'Muse Spark through OpenRouter', 'openrouter-glimmer': 'Muse Glimmer through OpenRouter',
    open: 'Muse Spark Open (open weights) through OpenRouter', glimmer: 'Muse Glimmer (our own server)', fixed: 'the fixed lines (no language model)' };
  const whoOf = (src) => WHO[src] || 'the teacher (its engine was not said)';
  
  
  
  
  
  
  
  
  const CONSENT_VERSION = 'testbench-2026-11-01.1';
  const OPEN_HOST = 'openrouter';             
  
  
  const routeOf = (j) => {
    const c = j && j.consent;
    if (!c || c.adult !== true) return null;
    if (c.metaMuse === true) return 'meta';
    if (c.openrouterMuse === true) return 'openrouter';
    return c.openWeightsMuse === true && c.openWeightsHost === OPEN_HOST ? 'open' : null;
  };
  const optedIn = (j) => routeOf(j) === 'meta';
  const MIDI_EXT = /\.(mid|midi)$/i;
  
  const ITEMS = { wrong_notes: 'Wrong notes', missed_notes: 'Missed notes', extra_notes: 'Extra notes', rolled_chords: 'Chords not together',
    uneven_run: 'Uneven runs', uneven_touch: 'Uneven touch', hands_apart: 'Hands not together', held_open: 'Hand held open', late_leap: 'Late leaps' };
  const itemName = (f) => {
    const name = ITEMS[str(f.item, 40)] || str(f.item, 40).replace(/_/g, ' ') || 'A finding';
    const who = f.hand === 'L' ? 'left hand' : f.hand === 'R' ? 'right hand' : f.part === 'lower' ? 'lower part' : f.part === 'upper' ? 'upper part' : '';
    return who ? `${name} (${who})` : name;
  };
  const VERDICTS = ['supported', 'partly', 'unsupported', 'not checkable'];
  
  const SAMPLE_HOSTS = [['openrouter', "OpenRouter's open-weights partners"], ['baseten', 'Baseten'], ['fireworks', 'Fireworks']];
  
  const SAMPLE_MODELS = [['none', 'No model: the fixed answers'], ['meta', "Meta's Muse Spark, on Meta's Model API"]];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const str =(v, n = 400) => (typeof v === 'string' ? v.slice(0, n) : '');
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const iso = () => new Date().toISOString();
  const ms = (t) => { const v = Date.parse(t || ''); return Number.isFinite(v) ? v : null; };
  const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
  const mmss = (s) => { s = Math.max(0, Math.round(+s || 0)); return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fmtMs = (v) => (v == null || !Number.isFinite(+v) ? '' : v < 1000 ? `${Math.round(v)} ms`
    : v < 60000 ? `${(v / 1000).toFixed(1)} s` : v < 3600000 ? `${Math.floor(v / 60000)} min ${Math.round((v % 60000) / 1000)} s`
      : `${Math.floor(v / 3600000)} h ${Math.round((v % 3600000) / 60000)} min`);
  const minutes = (s) => {
    if (s == null || !Number.isFinite(s)) return '';
    const m = s / 60;
    if (m < 1.5) return 'about a minute';
    if (m < 10) return `about ${Math.round(m)} min`;
    if (m < 60) return `about ${Math.round(m / 5) * 5} min`;
    const r = Math.round(m / 5) * 5;
    return `about ${Math.floor(r / 60)} h${r % 60 ? ` ${r % 60} min` : ''}`;
  };
  const clock = (t) => {
    const v = ms(t);
    if (v == null) return '';
    const d = new Date(v), today = new Date().toDateString() === d.toDateString();
    const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return today ? hm : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${hm}`;
  };
  const ago = (t) => {
    const v = ms(t);
    if (v == null) return '';
    const s = Math.max(0, (Date.now() - v) / 1000);
    if (s < 45) return 'just now';
    if (s < 90) return '1 min ago';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min ago`;
    return `on ${clock(t)}`;
  };
  const store = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch {   } },
  };
  
  const prefs = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch {   } },
  };
  const randHex = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };
  const newJobId = () => randHex(16);
  const newMsgId = () => `${Date.now().toString(36)}-${randHex(3)}`;
  const assetOk = (id) => typeof id === 'string' && ASSET_ID.test(id);
  const blobUrl = (id) => (assetOk(id) ? `/_blob/${id}` : null);
  
  
  const EX = (() => {
    const e = CFG.example;
    return e && Array.isArray(e.parts) && e.parts.length && e.parts.every((p) => p && assetOk(p.assetId)) && num(e.sizeBytes) ? e : null;
  })();
  const EX_IDS = new Set(EX ? [...EX.parts.map((p) => p.assetId), EX.posterAssetId].filter(assetOk) : []);
  
  
  
  
  const exampleNow = () => (PRODUCT ? (PRODUCT.exampleFor ? PRODUCT.exampleFor($('tb-piece').value || null) : PRODUCT.example) : EX);

  

  const S = {
    db: null, assets: null, artifact: null, user: null,
    userId: null, owner: null,        
    writable: true,                   
    connected: false, dbProblem: '',
    jobs: new Map(), order: [], worker: null,
    chats: new Map(), chatSubs: new Map(),
    pending: new Map(),               
    page: readState(), filesForm: true, wakeBlocked: false,
    view: 'bench', open: null, reopen: null, barFlash: '',
    picked: null, pickedDur: null, example: false, busy: false, midi: null,
    
    
    
    ui: { focus: null, libAll: prefs.get('tb-lib-all') === '1', confirm: new Set(), deleting: new Set(), delErr: new Map(), opened: new Set(), wakeMsg: new Map(),
      sampleDraft: new Map(), sampleBusy: new Set(), sampleMsg: new Map(), view: 'hello', step: 'video', autoOpened: new Set() },
    cards: new Map(), results: new Map(), usage: null,
  };

  function readState() {
    try {
      const s = JSON.parse(($('tb-state') || {}).textContent || '{}');
      return s && typeof s === 'object' ? { v: 1, wake: Number.isInteger(s.wake) && s.wake >= 0 ? s.wake : 0 } : { v: 1, wake: 0 };
    } catch { return { v: 1, wake: 0 }; }
  }

  

  function explain(e) {
    const code = e && e.code, m = e && typeof e.message === 'string' ? e.message : '';
    switch (code) {
      case 'too_large': return 'That video is over 20 MB, the most this page can store in one file.';
      case 'unsupported_type': return 'This page cannot store that kind of file. Upload an MP4, MOV or WebM video, or share a link to it.';
      case 'quota_or_state': return "This page's storage is full. Delete a test you no longer need, then try again.";
      case 'quota_exceeded': return "This page's database is full. Delete a test you no longer need, then try again.";
      case 'rate_limited': case 'resource_exhausted': return 'Too many requests in a short time. Wait a minute, then try again.';
      case 'upstream_auth': return 'Your sign-in could not be checked. Reload the page, then try again.';
      case 'invalid_argument': return 'This view cannot save tests: only the owner of this test bench can start or change one.';
      case 'not_uploader': return 'Only the person who uploaded this video can delete it.';
      case 'not_granted': case 'capability_disabled': case 'capability_removed': case 'revoked':
        return "This view cannot change this page's storage. Open it signed in as its owner.";
      case 'store_unavailable': case 'unavailable': return 'The storage did not answer. Try again in a moment.';
      default: return m ? `That did not work: ${m}` : 'That did not work. Try again in a moment.';
    }
  }
  
  async function dbWrite(fn) {
    try { return await fn(); } catch (e) {
      if (e && e.code === 'unavailable') { await sleep(400 + Math.random() * 800); return fn(); }
      if (e && ['invalid_argument', 'not_granted', 'revoked'].includes(e.code)) { S.writable = false; renderForm(); }
      throw e;
    }
  }
  async function assetCall(fn) {
    try { return await fn(); } catch (e) {
      if (e && e.code === 'store_unavailable') { await sleep(500 + Math.random() * 800); return fn(); }
      throw e;
    }
  }

  

  async function connect() {
    const C = window.runtime;
    const use = (n) => (C && typeof C.use === 'function' ? Promise.resolve(C.use(n)).catch(() => null) : Promise.resolve(null));
    const [db, assets, artifact, user] = await Promise.all([use('db'), use('assets'), use('artifact'), use('user')]);
    Object.assign(S, { db, assets, artifact, user });
    if (user) {
      const [owner, id] = await Promise.all([user.isOwner().catch(() => null), user.id().catch(() => null)]);
      S.owner = typeof owner === 'boolean' ? owner : null;
      S.userId = typeof id === 'string' ? id : null;
      if (S.owner === false) S.writable = false;
    }
    S.connected = true;
    if (!db) {
      S.dbProblem = "This view cannot reach the test bench's storage, so there are no tests to show. Open it signed in as its owner.";
      S.writable = false;
    } else {
      subscribeJobs();
      subscribeWorker();
    }
    window.TBShim && window.TBShim.connect(shimApi);
    renderAll();
    loadUsage();
    afterReload();
  }

  let jobsUnsub = null, jobsTries = 0;
  function subscribeJobs() {
    if (jobsUnsub) jobsUnsub();
    try {
      jobsUnsub = S.db.collection('jobs').orderBy('createdAt', 'desc').limit(100).onSnapshot((snap) => {
        jobsTries = 0;
        const next = new Map();
        for (const d of snap.docs) {
          const data = d.data();
          if (!ROW_ID.test(d.id) || !data || typeof data !== 'object') continue;
          next.set(d.id, Object.assign({ id: d.id }, data));
        }
        S.jobs = next;
        S.order = [...next.keys()];
        S.jobsSeen = true;  
        S.dbProblem = '';
        followChats();
        renderAll();
        reopen();
      }, (e) => storeLost(e, subscribeJobs, () => jobsTries++));
    } catch (e) { S.dbProblem = explain(e); renderAll(); }
  }
  let workerUnsub = null, workerTries = 0;
  function subscribeWorker() {
    if (workerUnsub) workerUnsub();
    try {
      workerUnsub = S.db.doc('bench/worker').onSnapshot((snap) => {
        workerTries = 0;
        const d = snap.exists ? snap.data() : null;
        S.worker = d && typeof d === 'object' ? d : null;
        renderStrip();
        renderEstimates();
        renderModelBoxes();
      }, (e) => storeLost(e, subscribeWorker, () => workerTries++));
    } catch (e) {   }
  }
  
  function storeLost(e, again, count) {
    const code = e && e.code;
    if (code === 'unavailable' || code === 'queue_overflow') {
      const n = count();
      if (n < 4) { setTimeout(again, 2000 * (n + 1)); return; }
    }
    if (code === 'revoked' || code === 'not_granted') S.writable = false;
    S.dbProblem = code === 'revoked' ? "This view lost access to the test bench's storage. Reload the page to see the latest."
      : `The test bench stopped receiving updates. Reload the page to see the latest. (${explain(e)})`;
    renderAll();
  }
  function followChats() {
    const want = new Set(S.order.filter((id) => S.jobs.get(id).status === 'done').slice(0, CHAT_SUBS));
    if (S.open) want.add(S.open);
    for (const [id, un] of S.chatSubs) if (!want.has(id)) { un(); S.chatSubs.delete(id); S.chats.delete(id); }
    for (const id of want) if (!S.chatSubs.has(id)) subscribeChat(id);
  }
  function subscribeChat(jobId) {
    try {
      const un = S.db.collection(`jobs/${jobId}/chat`).orderBy('at').limit(400).onSnapshot((snap) => {
        const rows = [];
        for (const d of snap.docs) {
          const x = d.data();
          if (x && typeof x === 'object' && MSG_ID.test(d.id.replace(/-a$/, ''))) rows.push(Object.assign({ id: d.id }, x));
        }
        S.chats.set(jobId, rows);
        settleAnswers(jobId);
        renderJob(jobId);
        renderBar();
        if (window.TBMuse && window.TBMuse.openId === jobId) window.TBMuse.update(jobId, rows);
      }, () => { S.chatSubs.delete(jobId); });
      S.chatSubs.set(jobId, un);
    } catch (e) {   }
  }

  async function loadUsage() {
    if (!S.assets || typeof S.assets.list !== 'function') { renderStrip(); return; }
    try { S.usage = (await S.assets.list()).usage || null; } catch { S.usage = null; }
    renderStrip();
  }

  

  
  
  function liveReset() {
    for (const s of document.head ? document.head.querySelectorAll('style') : []) {
      const t = s.textContent;
      if (t && t.length < 3000 && t.includes('[hidden]') && !t.includes('<')) return t;
    }
    return null;
  }
  function pageDocument(state) {
    const data = JSON.stringify(state).replace(/</g, '\\u003c');
    return `${HEAD}${liveReset() || RESET}</style></head><body>${PAGE.source.split(PAGE.marker).join(data)}</body></html>`;
  }
  async function wake(reason, ref) {
    if (PRODUCT) return { ok: true, product: true };                
    if (!S.artifact) return { ok: false, why: 'none' };
    if (S.wakeBlocked) return { ok: false, why: 'readonly' };
    if (!PAGE || typeof PAGE.source !== 'string' || typeof PAGE.marker !== 'string' || !PAGE.source.includes(PAGE.marker)) {
      return { ok: false, why: 'bug', message: "the page's own source did not load" };
    }
    const next = { v: 1, wake: (S.page.wake | 0) + 1, reason, ref, at: iso() };
    const html = pageDocument(next);
    
    store.set('tb-wake', { n: next.wake, reason, ref, at: next.at });
    let form = S.filesForm || !CFG.htmlWake ? 'files' : 'html', retried = false;
    for (;;) {
      try {
        if (form === 'files') await S.artifact.publish({ 'index.html': html });
        else await S.artifact.publish(html);
        S.page = { v: 1, wake: next.wake };
        if (form === 'files') store.set('tb-wake', null);
        return { ok: true, n: next.wake, at: next.at, form };
      } catch (e) {
        const code = (e && e.code) || 'upstream_error';
        
        
        if (form === 'files' && CFG.htmlWake === true && ['capability_disabled', 'capability_removed'].includes(code)) { S.filesForm = false; form = 'html'; continue; }
        if (!['conflict', 'not_writer', 'not_declared', 'too_large', 'invalid_content', 'read_only_path', 'rate_limited', 'consent_required',
          'not_granted', 'capability_disabled', 'capability_removed', 'transform_error'].includes(code) && !retried) {
          retried = true;                               
          await sleep(600 + Math.random() * 900);
          continue;
        }
        if (code === 'conflict') return { ok: false, why: 'conflict' };   
        store.set('tb-wake', null);
        if (['not_writer', 'not_granted', 'consent_required', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) {
          S.wakeBlocked = true;
          return { ok: false, why: 'readonly' };
        }
        if (code === 'rate_limited') return { ok: false, why: 'rate' };
        return { ok: false, why: 'error', message: (e && e.message) || code };
      }
    }
  }
  const TELL = 'tell the teacher in the chat: run the test bench.';
  function wakeText(w, what = 'It usually starts within a minute or two') {
    if (PRODUCT) return '';
    if (w.ok) return `the teacher was notified at ${clock(w.at)}. ${what}.`;
    if (w.why === 'conflict') return `Saved. The page was updated elsewhere at the same moment and is reloading. If nothing happens within two minutes, ${TELL}`;
    if (w.why === 'readonly' || w.why === 'none') return `Saved, but this view cannot notify the teacher by itself: ${TELL}`;
    if (w.why === 'rate') return `Saved. the teacher could not be notified just now because the page was updated too often. Try Notify the teacher again in a minute, or ${TELL}`;
    return `Saved, but notifying the teacher failed (${w.message || 'unknown'}). ${TELL[0].toUpperCase()}${TELL.slice(1)}`;
  }
  
  async function noteWake(path, w) {
    if (w.why === 'conflict' || !S.db) return;
    try { await S.db.doc(path).update({ wake: { n: w.n || null, at: w.at || iso(), ok: !!w.ok } }); } catch {   }
  }
  function afterReload() {
    const s = store.get('tb-wake');
    store.set('tb-wake', null);
    const open = store.get('tb-open');
    if (s && s.reason !== 'delete' && ms(s.at) != null && Date.now() - ms(s.at) < 10 * 60 * 1000) {
      const landed = (S.page.wake | 0) >= (s.n | 0);
      const text = landed ? `the teacher was notified at ${clock(s.at)}. The page reloaded to show it.`
        : `Your ${s.reason === 'chat' ? 'question' : s.reason === 'sample' ? 'sample offer' : 'test'} is saved, but the page reloaded before the teacher was notified. If nothing happens within two minutes, ${TELL}`;
      if (s.reason === 'chat') S.barFlash = text; else formMsg(text, landed ? 'ok' : 'note');
    }
    if (open && ROW_ID.test(open)) S.reopen = open;      
    reopen();
  }

  function reopen() {
    const id = S.reopen, j = id && S.jobs.get(id);
    if (!j) return;
    S.reopen = null;
    if (j.status === 'done' && S.view === 'bench') openMuse(id);
  }

  

  function srcKind() { return $('tb-src-drive').checked ? 'drive' : 'asset'; }
  
  
  function lenS() { return PRODUCT ? QUICK_S : NORMAL_S; }
  const lenWords = (s) => (s >= 60 ? 'minute' : `${s} seconds`);
  function formMsg(text, kind = '', tips = null) {
    const el = $('tb-msg');
    el.className = `tb-msg${kind ? ` ${kind}` : ''}`;
    el.innerHTML = esc(text || '') + (tips && tips.length ? `<ul class="tb-tip">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '');
  }
  function uploadType(file) {
    const ext = String(file.name || '').toLowerCase().split('.').pop();
    if (file.type === 'video/webm') return 'video/webm';
    if (file.type === 'video/mp4') return 'video/mp4';
    return VIDEO_EXT[ext] || (file.type === 'video/quicktime' || file.type === 'video/x-m4v' ? 'video/mp4' : null);
  }
  const cleanName = (n) => String(n || '').split(/[\\/]/).pop().slice(0, 200) || 'your video';
  function checkFile(file) {
    if (!file) return { error: 'Choose a video first, or switch to a drive link.' };
    if (!uploadType(file)) return { error: `${cleanName(file.name)} is not a video this page can store. Upload an MP4, MOV or WebM, or share a link to it.` };
    
    if (file.size > CFG.partsMaxBytes) {
      return { error: `${cleanName(file.name)} is ${mb(file.size)}, more than the ${mb(CFG.partsMaxBytes)} this page takes as an upload:`, tips: DRIVE_TIP };
    }
    if (!file.size) return { error: 'That file is empty.' };
    return { ok: true };
  }
  
  function probeDuration(file) {
    return new Promise((resolve) => {
      let url = null, done = false;
      const end = (v) => { if (done) return; done = true; if (url) URL.revokeObjectURL(url); resolve(v); };
      try {
        const v = document.createElement('video');
        v.preload = 'metadata'; v.muted = true;
        v.onloadedmetadata = () => end(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null);
        v.onerror = () => end(null);
        url = URL.createObjectURL(file);
        v.src = url;
        setTimeout(() => end(null), 4000);
      } catch { end(null); }
    });
  }
  async function pick(file) {
    
    if (S.pieceLocked) { S.pieceLocked = false; $('tb-piece').disabled = S.busy; }
    S.picked = file || null; S.pickedDur = null; S.example = false;
    renderExample();
    const name = $('tb-file-name');
    name.classList.toggle('has', !!file);
    if (!file) { name.textContent = `or drop it here, up to ${mb(CFG.partsMaxBytes)}`; renderEstimates(); return; }
    const c = checkFile(file);
    name.textContent = `${cleanName(file.name)}, ${mb(file.size)}`;
    if (!c.ok) { formMsg(c.error, 'err', c.tips); renderEstimates(); return; }
    formMsg('');
    const mine = file;
    const d = await probeDuration(file);
    if (S.picked !== mine) return;
    S.pickedDur = d;
    if (d) name.textContent = `${cleanName(file.name)}, ${mb(file.size)}, ${mmss(d)} long`;
    renderEstimates();
  }
  
  function renderExample() {
    const box = $('tb-example'), X = exampleNow();
    box.hidden = !X || srcKind() !== 'asset';
    if (!X) return;
    box.classList.toggle('on', S.example);
    const b = $('tb-ex-use');
    b.textContent = S.example ? 'Chosen' : 'Use it';
    b.setAttribute('aria-pressed', String(S.example));
    if (PRODUCT) {
      
      
      $('tb-ex-h').textContent = 'Example';
      
      $('tb-ex-meta').textContent = [X.sizeBytes ? mb(X.sizeBytes) : null, num(X.durationS) ? `${mmss(X.durationS)} long` : null].filter(Boolean).join(', ');
      const poster = $('tb-ex-poster');
      poster.hidden = !(X.thumb || X.video);
      if (X.thumb) poster.style.backgroundImage = `url("${X.thumb}")`;
      else if (X.video && !poster.querySelector('video')) {
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.tabIndex = -1; v.disablePictureInPicture = true;
        v.className = 'tb-ex-frame';
        v.src = `${X.video}#t=1`;
        poster.append(v);
      }
      return;
    }
    $('tb-ex-meta').textContent = `${mb(EX.sizeBytes)}${num(EX.durationS) ? `, ${mmss(EX.durationS)} long` : ''}`;
    const poster = $('tb-ex-poster'), url = blobUrl(EX.posterAssetId);
    poster.hidden = !url;
    if (url) poster.style.backgroundImage = `url("${url}")`;
  }
  function useExample(on) {
    const X = exampleNow();
    if (!X) return;
    if (!on) { pick(null); return; }
    $('tb-file').value = '';
    S.picked = null; S.example = true; S.pickedDur = num(X.durationS) || null;
    const name = $('tb-file-name');
    name.classList.add('has');
    name.textContent = PRODUCT ? `The example${X.sizeBytes ? `, ${mb(X.sizeBytes)}` : ''}${S.pickedDur ? `, ${mmss(S.pickedDur)} long` : ''}`
      : `The example, ${mb(EX.sizeBytes)}${S.pickedDur ? `, ${mmss(S.pickedDur)} long` : ''}`;
    
    const sel = $('tb-piece');
    S.pieceLocked = !!(X.pieceId && [...sel.options].some((o) => o.value === X.pieceId));
    if (S.pieceLocked) { sel.value = X.pieceId; sel.disabled = true; }
    formMsg('');
    renderExample();
    renderEstimates();
  }
  
  const kb = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : mb(b));
  async function checkMidi(file) {
    if (!file) return { error: 'Choose the MIDI file again.' };
    if (!MIDI_EXT.test(String(file.name || ''))) return { error: `${cleanName(file.name)} is not a MIDI file. Choose the .mid the piano recorded while you filmed.` };
    if (!file.size) return { error: 'That MIDI file is empty.' };
    if (file.size > CFG.midiMaxBytes) {
      return { error: `${cleanName(file.name)} is ${kb(file.size)}, more than one take's recording needs (at most ${kb(CFG.midiMaxBytes)}). Choose the MIDI of this take only.` };
    }
    let head = '';
    try { head = String.fromCharCode(...new Uint8Array(await file.slice(0, 4).arrayBuffer())); } catch { head = ''; }
    if (head !== 'MThd') return { error: `${cleanName(file.name)} does not read as a MIDI file. Save it from the piano or its app as a standard MIDI file (.mid).` };
    return { ok: true };
  }
  async function pickMidi(file) {
    S.midi = null;
    $('tb-midi-clear').hidden = true;
    $('tb-midi-name').textContent = '';
    $('tb-midi-name').classList.remove('has');
    if (!file) { renderNav(); return; }
    const c = await checkMidi(file);
    if (c.error) { formMsg(c.error, 'err'); $('tb-midi').value = ''; return; }
    S.midi = file;
    $('tb-midi-name').textContent = `${cleanName(file.name)}, ${kb(file.size)}`;
    $('tb-midi-name').classList.add('has');
    $('tb-midi-clear').hidden = false;
    formMsg('');
    renderNav();
  }
  
  function b64of(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async function midiBlob(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return new Blob([JSON.stringify({ v: 1, kind: 'performance-midi', b64: b64of(bytes) })], { type: 'application/json' });
  }
  
  
  
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  const partsOf = (size) => Math.ceil(size / CFG.partBytes);
  async function roomFor(file) {
    try { S.usage = (await S.assets.list()).usage || null; } catch {   }
    const u = S.usage, need = Math.ceil(file.size * 4 / 3) + partsOf(file.size) * 512;
    if (u && num(u.bytes) != null && num(u.maxBytes) && u.bytes + need > u.maxBytes) {
      return `This page's storage has ${mb(Math.max(0, u.maxBytes - u.bytes))} free, and ${cleanName(file.name)} needs about ${mb(need)} in pieces. Delete a test you no longer need, or share a link to it.`;
    }
    return null;
  }
  async function uploadParts(file, up) {
    const n = partsOf(file.size), parts = [];
    for (let i = 0; i < n; i++) {
      formMsg(`Uploading ${cleanName(file.name)} (${mb(file.size)}): piece ${i + 1} of ${n}...`, 'note');
      const bytes = new Uint8Array(await file.slice(i * CFG.partBytes, Math.min(file.size, (i + 1) * CFG.partBytes)).arrayBuffer());
      const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
      const blob = new Blob([JSON.stringify({ v: 1, kind: 'video-part', i, n, sizeBytes: bytes.length, sha256, b64: b64of(bytes) })], { type: 'application/json' });
      const a = await assetCall(() => S.assets.upload(blob, { type: 'application/json' }));
      if (!a || !assetOk(a.id)) throw { message: 'the store gave no usable id for a piece of the video' };
      up.push(a);
      parts.push({ assetId: a.id, sizeBytes: bytes.length, sha256 });
    }
    return parts;
  }
  
  
  
  
  function modelRoute() { return 'meta'; }
  function museDown() {
    const h = (S.worker && S.worker.health && typeof S.worker.health === 'object') ? S.worker.health : {};
    return !!(h.metaOptIn && h.metaOptIn.meta === false);
  }
  function renderModelBoxes() {
    const down = museDown();
    $('tb-route-note').hidden = !down;
    $('tb-route-note').textContent = !down ? '' : PRODUCT
      ? "The server cannot reach Muse on Meta's Model API now, so the teacher's fixed lines would word this lesson, and nothing would be sent to a model."
      : "the server cannot reach Muse on Meta's Model API now (no working key there), so the fixed lines would word and answer this test, and nothing would be sent to a model.";
    if (S.ui.view === 'form') renderSummary();
  }
  function driveFile(raw) {
    let u;
    return { error: 'This page takes uploads only.' };
  }
  
  function parseStart(v) {
    v = String(v || '').trim();
    if (!v) return { s: null, text: null };
    const bad = { error: 'The start must be a time in your video, like 2:10, or empty.' };
    const m = v.match(/^(?:(?:([0-9]{1,2}):)?([0-9]{1,4}):)?([0-9]{1,5}(?:\.[0-9]{1,3})?)$/);
    if (!m) return bad;
    const [, h, mi, sec] = m;
    if (mi !== undefined && (sec.split('.')[0].length !== 2 || +sec >= 60)) return bad;
    if (h !== undefined && (mi.length !== 2 || +mi >= 60)) return bad;
    const s = ((+(h || 0)) * 60 + (+(mi || 0))) * 60 + +sec;
    if (s >= 86400) return { error: 'That start is later than any video the teacher takes.' };
    if (S.pickedDur && srcKind() === 'asset' && s >= S.pickedDur - 1) return { error: `Your video is ${mmss(S.pickedDur)} long, so it cannot start at ${mmss(s)}. Leave it empty and the teacher picks the part itself.` };
    return { s: Math.round(s * 1000) / 1000, text: v };
  }
  
  function timing() {
    const t = Object.assign({}, CFG.timing), w = S.worker && S.worker.timing;
    t.from = 'built';
    if (w && typeof w === 'object' && ['samSPerFrame', 'keyboardSPerFrame', 'fixedS'].every((k) => num(w[k]) != null && w[k] > 0 && w[k] < 36000)) {
      for (const k of ['samSPerFrame', 'keyboardSPerFrame', 'fixedS']) t[k] = w[k];
      t.from = 'worker';
    }
    t.measured = t.from === 'worker' ? /^measured/.test(str(S.worker.rateSource, 200)) || !S.worker.rateSource : /^measured/.test(str(CFG.timingSource, 200));
    return t;
  }
  function driveMax() {
    const w = S.worker && num(S.worker.driveMaxBytes);
    return w != null && w >= 0 ? w : CFG.driveMaxBytes;
  }
  const gb = (b) => (b >= 1024 ** 3 ? `about ${(Math.floor(b / 1024 ** 3 * 2) / 2).toString()} GB` : `about ${Math.max(0, Math.floor(b / 1048576 / 100) * 100)} MB`);
  function estimateS(windowS, durS) {
    const t = timing(), s = durS ? Math.min(windowS, durS) : windowS;
    return t.fixedS + Math.ceil(s * CFG.fps) * (t.samSPerFrame + t.keyboardSPerFrame);
  }
  function renderEstimates() {
    const dur = srcKind() === 'asset' ? (S.example && exampleNow() ? num(exampleNow().durationS) : S.pickedDur) : null;
    const st = parseStart($('tb-start').value);
    const len = lenS(), w = lenWords(len);
    const what = dur && dur <= len + 0.05 ? 'the whole take' : !st.error && st.s != null ? `the ${w} from ${mmss(st.s)}` : `the whole take up to a ${w}, or the best ${w} of a longer video`;
    $('tb-est').textContent = `${minutes(estimateS(len, dur)).replace(/^a/, 'A')}, for ${what}.`;
    const t = timing();
    const from = PRODUCT ? (t.measured ? "this server's last measured takes" : "this server's estimate (no take measured yet)")
      : t.measured ? "the teacher's last measured run on this computer" : "this computer's CPU (no run measured yet)";
    
    $('tb-est-why').textContent = (dur && dur < len ? `Your video is ${mmss(dur)} long, so at most that much is analysed. ` : '')
      + `Estimated from ${from}: SAM 3.1 about ${Math.round(t.samSPerFrame)} s a frame, `
      + `placing the hands on the keys about ${(+t.keyboardSPerFrame).toFixed(1)} s a frame, at ${CFG.fps} frames a second of video.`;
    $('tb-est').title = $('tb-est-why').textContent;
    const foot = $('tb-foot-rate');
    if (foot) foot.textContent = PRODUCT ? `Times are this server's: SAM 3.1 takes about ${(+t.samSPerFrame).toFixed(1)} seconds a frame at ${CFG.fps} frames a second of video, so a minute of playing takes ${minutes(estimateS(NORMAL_S))}.`
      : `Times are for this session's ${S.worker && num(S.worker.cpus) ? `${S.worker.cpus}-core ` : ''}CPU, where SAM 3.1 takes about ${Math.round(t.samSPerFrame)} seconds a frame at ${CFG.fps} frames a second of video, so a minute of playing takes ${minutes(estimateS(NORMAL_S))}.`;
    for (const el of document.querySelectorAll('.tb-drive-max')) el.textContent = gb(driveMax());
  }
  function renderForm() {
    const up = srcKind() === 'asset';
    $('tb-up-box').hidden = !up;
    $('tb-drive-box').hidden = up;
    renderExample();
    const canUpload = !!S.assets;
    $('tb-src-up').disabled = !canUpload && S.connected;
    if (!canUpload && S.connected && up) { $('tb-src-drive').checked = true; $('tb-up-box').hidden = true; $('tb-drive-box').hidden = false; $('tb-example').hidden = true; }
    const off = S.connected && (!S.db || !S.writable);
    for (const el of $('tb-form').querySelectorAll('input, select, button')) {
      if (el.id === 'tb-prev' || el.id === 'tb-next') continue;
      el.disabled = S.busy || off || (el.id === 'tb-src-up' && !canUpload && S.connected) || (el.id === 'tb-piece' && !!S.pieceLocked);
    }
    $('tb-new').classList.toggle('tb-off', off);
    if (off && !$('tb-msg').textContent) {
      formMsg(!S.db ? 'Tests cannot be started in this view.' : 'Only the owner of this test bench can start tests. You can look at the tests and their results.', 'note');
    }
    renderModelBoxes();
    renderEstimates();
  }
  function resetForm() {
    $('tb-file').value = ''; $('tb-drive').value = ''; $('tb-start').value = ''; $('tb-midi').value = '';
    
    
    $('tb-ok').checked = !!PRODUCT;
    pick(null);
    pickMidi(null);
    renderModelBoxes();
  }
  async function submit(e) {
    e.preventDefault();
    if (S.busy) return;
    if (S.ui.view === 'form' && STEPS.indexOf(S.ui.step) < STEPS.length - 1) { next(); return; }
    formMsg('');
    
    { const step = S.ui.step, problem = await stepProblem(step);
      if (S.ui.step !== step) return;
      if (problem) { formMsg(problem.text, 'err', problem.tips); at(problem.el); return; } }
    if (!S.db) return formMsg("This view cannot reach the test bench's storage, so it cannot start a test.", 'err');
    if (!S.writable) return formMsg('Only the owner of this test bench can start tests.', 'err');
    const kind = srcKind(), windowS = lenS();
    const start = parseStart($('tb-start').value);
    if (start.error) { formMsg(start.error, 'err'); at('tb-start'); return; }
    const piece = $('tb-piece').value || null;
    if (piece && !CFG.library.some((p) => p.id === piece)) return formMsg('That piece is not in the library.', 'err');
    let source = null, file = null;
    const ex = kind === 'asset' && S.example && exampleNow();
    if (ex && PRODUCT) {
      
    } else if (ex) {
      source = { kind: 'parts', parts: EX.parts.map((p) => ({ assetId: p.assetId, sizeBytes: p.sizeBytes, sha256: p.sha256 })),
        name: cleanName(EX.name), sizeBytes: EX.sizeBytes, type: str(EX.type, 60) || 'video/mp4', durationS: num(EX.durationS) || null, example: true };
    } else if (kind === 'asset') {
      file = S.picked;
      const c = checkFile(file);
      if (!c.ok) { formMsg(c.error, 'err', c.tips); at('tb-file'); return; }
      if (!S.assets) { at('tb-src-drive'); return formMsg('Uploading is not available in this view. Paste a drive link instead.', 'err'); }
    } else {
      const d = driveFile($('tb-drive').value);
      if (d.error) { formMsg(d.error, 'err'); at('tb-drive'); return; }
      source = { kind: 'drive', url: d.url, fileId: d.fileId, name: null };
    }
    const midiFile = S.midi;
    if (midiFile) {
      const c = await checkMidi(midiFile);
      if (c.error) { formMsg(c.error, 'err'); at('tb-midi'); return; }
      if (!S.assets) { at('tb-midi'); return formMsg('Adding a MIDI file is not available in this view.', 'err'); }
    }
    
    
    if (!$('tb-ok').checked) {
      formMsg("Please tick the box: it says the playing is yours (or you have the player's OK) and that you agree to how the video is used.", 'err');
      at('tb-ok'); return;
    }
    const footage = 'own';
    if (PRODUCT) { submitProduct(file, piece, start, ex || null); return; }
    if (file && file.size > CFG.maxAssetBytes) {
      const full = await roomFor(file);
      if (full) { formMsg(full, 'err', DRIVE_TIP); return; }
    }
    S.busy = true; renderForm();
    const id = newJobId();
    let up = null, mup = null;
    const pieces = [];
    try {
      if (file && file.size > CFG.maxAssetBytes) {
        const type = uploadType(file);
        const parts = await uploadParts(file, pieces);
        source = { kind: 'parts', parts, name: cleanName(file.name), sizeBytes: file.size, type,
          durationS: S.pickedDur ? Math.round(S.pickedDur * 10) / 10 : null };
      } else if (file) {
        formMsg(`Uploading ${cleanName(file.name)} (${mb(file.size)})...`, 'note');
        const type = uploadType(file);
        up = await assetCall(() => S.assets.upload(file, { type }));
        if (!up || !assetOk(up.id)) throw { message: 'the store gave no usable id for the video' };
        source = { kind: 'asset', assetId: up.id, name: cleanName(file.name), sizeBytes: num(up.sizeBytes) || file.size, type: str(up.contentType, 60) || type,
          durationS: S.pickedDur ? Math.round(S.pickedDur * 10) / 10 : null };
      }
      let midi = null;
      if (midiFile) {
        formMsg(`Adding ${cleanName(midiFile.name)}...`, 'note');
        const blob = await midiBlob(midiFile);
        mup = await assetCall(() => S.assets.upload(blob, { type: 'application/json' }));
        if (!mup || !assetOk(mup.id)) throw { message: 'the store gave no usable id for the MIDI file' };
        midi = { assetId: mup.id, name: cleanName(midiFile.name), sizeBytes: midiFile.size };
      }
      
      const route = modelRoute();
      const doc = {
        v: 1, status: 'queued', source,
        options: { windowS, startS: start.s, startText: start.text, piece },
        backend: 'meta', createdAt: iso(), createdBy: S.userId, steps: [],
        
        
        consent: { agreed: true, version: CONSENT_VERSION, footage, adult: true, metaSam: true, voice: 'elevenlabs',
          ...(route === 'meta' ? { metaMuse: true } : {}) },
        ...(midi ? { midi } : {}),
      };
      await dbWrite(() => S.db.doc(`jobs/${id}`).set(doc));
    } catch (err) {
      for (const a of [up, mup, ...pieces]) if (a && assetOk(a.id)) { try { await S.assets.delete(a.id); } catch {   } }
      S.busy = false; renderForm();
      formMsg(explain(err), 'err', err && err.code === 'too_large' ? SMALLER : null);
      return;
    }
    resetForm();                                   
    S.ui.step = 'video';
    S.ui.focus = id;                               
    S.ui.focusFrom = 'new';                        
    show('tests');
    formMsg('Saved. Notifying the teacher...', 'note');
    const w = await wake('job', id);
    await noteWake(`jobs/${id}`, w);
    S.ui.wakeMsg.set(id, w);
    S.busy = false; renderForm();
    formMsg(wakeText(w), w.ok ? 'ok' : 'note');
    loadUsage();
    const li = document.querySelector(`.tb-job[data-job="${id}"]`);
    if (li) li.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  
  
  
  
  
  
  async function submitProduct(file, piece, start, sample = null) {
    const name = sample ? sample.title : cleanName(file.name), size = sample ? null : file.size;
    const go = async () => {
      S.busy = true; renderForm();
      formMsg('');
      S.ui.focus = null;
      S.ui.upload = { name, size, frac: 0, state: 'sending', sample: !!sample };
      show('tests');
      renderJobs();
      window.scrollTo({ top: 0, behavior: 'auto' });
      let id = null;
      for (let tries = 0; ; tries++) {
        try {
          ({ id } = await PRODUCT.create({ file: sample ? null : file, sample: sample ? sample.id : null, name, piece, startText: start.text, windowS: lenS(),
            onProgress: sample ? null : (f) => { if (S.ui.upload && S.ui.upload.state !== 'failed') { S.ui.upload.frac = f; renderUpload(); } } }));
          break;
        } catch (err) {
          const net = err && (err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504);
          if (net && tries < 1) {
            S.ui.upload = { name, size, frac: 0, state: 'retrying', sample: !!sample };
            renderJobs();
            await sleep(1500);
            continue;
          }
          S.busy = false; renderForm();
          S.ui.upload = { name, size, state: 'failed', sample: !!sample, msg: (err && err.message) || explain(err),
            tips: err && err.status === 413 ? SMALLER.slice(0, 2) : null, retry: go };
          renderJobs();
          return;
        }
      }
      resetForm();
      S.ui.step = 'video';
      S.ui.focus = id;                             
      S.ui.focusFrom = 'new';                      
      S.ui.upload = { name, size, frac: 1, state: 'starting', id, sample: !!sample };
      S.busy = false; renderForm();
      renderJobs();
      PRODUCT.refresh();                           
    };
    go();
  }
  
  function uploadHtml(u) {
    const what = u.sample ? `The sample performance: ${u.name}` : `${u.name}${u.size ? `, ${mb(u.size)}` : ''}`;
    if (u.state === 'failed') {
      return `<div class="tb-up failed" role="alert"><p class="tb-up-name">${esc(what)}</p><p class="tb-up-msg">${esc(u.msg || 'The upload did not reach the server.')}</p>`
        + `${u.tips && u.tips.length ? `<ul class="tb-tip">${u.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`
        + '<div class="tb-up-acts"><button type="button" class="btn btn-primary" data-act="up-retry">Try again</button><button type="button" class="btn" data-act="up-back">Back</button></div></div>';
    }
    const pct = Math.round((u.frac || 0) * 100);
    const line = u.state === 'starting' ? 'Uploaded. Starting the analysis...' : u.state === 'retrying' ? 'The connection dropped. Trying again...'
      : u.sample ? 'Sending...' : pct >= 100 ? 'Uploaded. Starting the analysis...' : `Uploading: ${pct}%`;
    return `<div class="tb-up" aria-live="polite"><p class="tb-up-name">${esc(what)}</p><p class="tb-up-line">${esc(line)}</p>`
      + `<div class="tb-up-bar${u.state === 'sending' && !u.sample ? '' : ' busy'}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${u.state === 'sending' && !u.sample ? pct : 100}%"></i></div></div>`;
  }
  function renderUpload() {
    const u = S.ui.upload;
    if (!u) return;
    $('tb-run').hidden = false;
    $('tb-run-h').textContent = u.state === 'failed' ? 'The upload stopped' : u.state === 'starting' ? 'Starting' : 'Uploading your video';
    const box = $('tb-run-top'), html = uploadHtml(u);
    if (box.dataset.up !== html) { box.dataset.up = html; delete box.dataset.job; S.topKey = null; box.innerHTML = html; }
    for (const li of [...$('tb-list').children]) { li.remove(); S.cards.delete(li.dataset.job); }
    $('tb-now').hidden = u.state === 'failed';
    anim.job = null;
    const f = $('tb-anim');
    if (!f.getAttribute('src')) f.setAttribute('src', f.dataset.src);
    animSend(false);
    $('tb-lib-box').hidden = true;
    $('tb-empty').hidden = true;
  }
  function onUpload(e) {
    const b = e.target.closest && e.target.closest('button[data-act^="up-"]');
    if (!b || !S.ui.upload) return;
    e.stopPropagation();
    const u = S.ui.upload;
    if (b.dataset.act === 'up-retry' && u.retry) u.retry();
    else if (b.dataset.act === 'up-back') { S.ui.upload = null; delete $('tb-run-top').dataset.up; $('tb-run-top').innerHTML = ''; show('form', 'video'); renderJobs(); focusStep(); }
  }


  

  const jobName = (j) => str((j.fetched && j.fetched.name) || (j.source && j.source.name), 200) || (j.source && j.source.kind === 'drive' ? 'Video from a drive link' : 'Your video');
  const stateOf = (j) => (S.ui.deleting.has(j.id) || j.deleting === true ? 'deleting' : STATUS[j.status] ? j.status : 'queued');
  function facts(j) {
    const o = j.options || {}, src = j.source || {}, out = [];
    if (src.kind === 'drive') out.push('From a drive link');
    else if (src.example === true) out.push(`The example${num(src.sizeBytes) ? `, ${mb(src.sizeBytes)}` : ''}${num(src.durationS) ? `, ${mmss(src.durationS)} long` : ''}`);
    else out.push(`Uploaded${num(src.sizeBytes) ? `, ${mb(src.sizeBytes)}` : ''}${src.kind === 'parts' && Array.isArray(src.parts) ? ` in ${src.parts.length} pieces` : ''}${num(src.durationS) ? `, ${mmss(src.durationS)} long` : ''}`);
    out.push(`up to ${num(o.windowS) || NORMAL_S} s analysed`);
    if (num(o.startS) != null) out.push(`from ${mmss(o.startS)}`);
    const piece = o.piece && CFG.library.find((p) => p.id === o.piece);
    if (piece) out.push(piece.title);
    const route = PRODUCT ? null : routeOf(j);
    if (route === 'meta') out.push("Muse Spark and Muse Wonder, on Meta's Model API");
    else if (route === 'openrouter') out.push('Muse Spark and Muse Wonder, through OpenRouter (no longer offered: answered with the fixed lines)');
    else if (route === 'open') out.push('Muse Spark Open, through OpenRouter (no longer offered: answered with the fixed lines)');
    if (route && j.consent.framingTip === true) out.push('filming tip');
    if (j.midi && assetOk(j.midi.assetId)) out.push('with its MIDI');
    if (j.consent && j.consent.footage === 'third-party') out.push("someone else's recording");
    out.push(`added ${clock(j.createdAt)}`);
    return out.join(' · ');
  }
  function queueAhead(j) {
    const t0 = ms(j.createdAt) || 0;
    let ahead = 0, waitS = 0;
    for (const id of S.order) {
      const o = S.jobs.get(id);
      if (!o || o.id === j.id || o.deleting === true) continue;
      if (o.status === 'running' || o.status === 'fetching') { ahead++; waitS += num(o.etaS) != null ? o.etaS : estimateS((o.options || {}).windowS || QUICK_S) * (1 - (num(o.progress) || 0)); }
      else if (o.status === 'queued' && (ms(o.createdAt) || 0) < t0) { ahead++; waitS += estimateS((o.options || {}).windowS || QUICK_S, (o.source || {}).durationS); }
    }
    return { ahead, waitS };
  }
  function stepRows(j) {
    const known = new Map((Array.isArray(j.steps) ? j.steps : []).filter((s) => s && typeof s === 'object').map((s) => [str(s.id, 40), s]));
    const weights = new Map(CFG.steps.map((s) => [s.id, s.weight]));
    let doneW = 0;
    
    for (const s of CFG.steps) if (['done', 'failed', 'skipped'].includes((known.get(s.id) || {}).state)) doneW += s.weight;
    const rows = [];
    const f = j.fetch && typeof j.fetch === 'object' ? j.fetch : null;
    if (f || j.status === 'fetching') {
      const st = f && ['running', 'done', 'failed'].includes(f.state) ? f.state : j.status === 'fetching' ? 'running' : 'done';
      rows.push({ id: 'fetch', label: j.source && j.source.kind === 'drive' ? 'Getting your video from the drive link' : 'Getting your video', state: st, ms: f && num(f.ms), note: f && str(f.note, 300), frac: null });
    }
    const ids = CFG.steps.length ? CFG.steps.map((s) => s.id) : [...known.keys()];
    for (const id of ids) {
      const s = known.get(id) || {}, c = CFG.steps.find((x) => x.id === id) || {};
      const state = STEP_STATES.includes(s.state) ? s.state : 'waiting';
      let frac = num(s.progress);
      if (frac == null && state === 'running' && num(j.progress) != null && weights.get(id)) frac = (j.progress - doneW) / weights.get(id);
      rows.push({ id, label: str(s.label, 120) || c.label || id, state, ms: num(s.ms), note: str(s.note, 300), frac: frac == null ? null : Math.max(0, Math.min(1, frac)) });
    }
    for (const [id, s] of known) if (!ids.includes(id)) rows.push({ id, label: str(s.label, 120) || id, state: STEP_STATES.includes(s.state) ? s.state : 'waiting', ms: num(s.ms), note: str(s.note, 300), frac: null });
    return rows;
  }
  function stepsHtml(j) {
    return `<ol class="tb-steps" aria-label="Pipeline steps">${stepRows(j).map((r) => {
      const t = r.state === 'running' && r.frac != null ? `${Math.round(r.frac * 100)}%` : r.ms != null ? fmtMs(r.ms) : r.state === 'waiting' || r.state === 'skipped' ? r.state : '';
      return `<li class="tb-step ${r.state}"><span class="ic" aria-hidden="true"></span><span class="lab">${esc(r.label)}<span class="sr-only">: ${esc(r.state)}</span></span><span class="t">${esc(t)}</span>`
        + (r.state === 'running' && r.frac != null ? `<div class="bar" aria-hidden="true"><span style="width:${(r.frac * 100).toFixed(1)}%"></span></div>` : '')
        + (r.note ? `<span class="sub">${esc(r.note)}</span>` : '') + '</li>';
    }).join('')}</ol>`;
  }
  
  
  const IC = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const PHASES = {
    fetch: { t: 'Getting your video', ic: IC('<path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M5 19h14"/>'),
      d: 'the teacher fetches the part of your video it needs.' },
    prepare: { t: 'Your video', ic: IC('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10.5 9.5v5l4-2.5z"/>'),
      d: 'The part with the most playing, up to a minute, at 5 frames a second.' },
    notes: { t: 'The notes', ic: IC('<path d="M3 12h1.5M6.5 9v6M10 5v14M13.5 8v8M17 10v4M20.5 12H21"/>'),
      d: 'Every note you play, heard in the sound: which key, when, how long.' },
    hands: { t: 'Keyboard and hands', ic: IC('<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M4 12h16"/>'),
      d: "SAM 3.1 on Meta's Model API outlines the keyboard and your hands." },
    keyboard: { t: 'Hands on the keys', ic: IC('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 18v-5M12 18V6M16 18v-5"/><rect x="6.5" y="6" width="3" height="7" rx=".6" fill="currentColor" stroke="none"/><rect x="14.5" y="6" width="3" height="7" rx=".6" fill="currentColor" stroke="none"/>'),
      d: 'Each hand placed over the keys it played, frame by frame.' },
    fingers: { t: 'Fingertips', ic: IC('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
      d: 'Your fingertips followed onto the keys. Measured only, for now.' },
    analysis: { t: 'Technique', ic: IC('<path d="M4 19v-7M9.5 19V6M15 19v-4M20.5 19V9"/>'),
      d: 'Which hand played each note, and what to work on in each phrase.' },
    lesson: { t: 'Composing the lesson', ic: IC('<path d="M5 5.5h14M5 10h14M5 14.5h9"/><path d="m15.5 18 2 2 4-4.5"/>'),
      d: 'Each fix put together: what you played, how it is done, and how to practise it.' },
    voice: { t: 'The lesson', ic: IC('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z"/>'),
      d: 'Muse Wonder judges what to teach first and why; Muse Spark says it, from what went well.' },
  };
  const CHECK = '<svg class="tb-ph-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h15"/><path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2"/><path d="M6.5 7l.8 11.6A2 2 0 0 0 9.3 20.5h5.4a2 2 0 0 0 2-1.9L17.5 7"/><path d="M10.25 11v5.5M13.75 11v5.5"/></svg>';
  const PH_STATE = { done: 'done', running: 'running now', waiting: 'still to come', skipped: 'skipped', failed: 'stopped here' };
  function phasesHtml(j) {
    const rows = stepRows(j), r = j.result && typeof j.result === 'object' ? j.result : null;
    return `<section class="tb-phases" aria-label="What happens to your take"><ol class="tb-ph">${rows.map((row) => {
      const P = PHASES[row.id] || { t: row.label, ic: IC('<circle cx="12" cy="12" r="3"/>'), d: '' };
      const pct = row.state === 'running' && row.frac != null && row.frac >= 0.01 ? `<span class="tb-ph-pct">${Math.round(row.frac * 100)}%</span>` : '';
      
      const sub = row.state === 'skipped' ? (PRODUCT && /refused/i.test(row.note || '') ? '' : `Skipped${row.note ? `: ${row.note.replace(/^skipped:\s*/i, '')}` : ''}`)
        : row.state === 'failed' ? `Stopped here${row.note ? `: ${row.note}` : ''}`
        : row.id === 'voice' && row.state === 'done' && r && r.summarySource
          ? (str(r.summarySource, 20) === 'fixed' ? 'Worded from the fixed lines, not a language model' : `Written by ${whoOf(str(r.summarySource, 20))}`) : '';
      return `<li class="tb-ph-i ${row.state}" data-ph="${esc(row.id)}"><span class="tb-ph-ic">${P.ic}</span><div class="tb-ph-tx">`
        + `<p class="tb-ph-h"><span>${esc(P.t)}</span>${row.state === 'done' ? CHECK : ''}${pct}<span class="sr-only">, ${esc(PH_STATE[row.state] || row.state)}</span></p>`
        + (P.d ? `<p class="tb-ph-d">${esc(P.d)}</p>` : '') + (sub ? `<p class="tb-ph-sub">${esc(sub)}</p>` : '') + '</div></li>';
    }).join('')}</ol></section>`;
  }
  const since = (j) => ms((j.wake && j.wake.at) || j.createdAt) || Date.now();
  const nudgeDue = (j) => !PRODUCT && j.status === 'queued' && !j.pickedUpAt && Date.now() - since(j) > NUDGE_MS;
  const staleDue = (j) => !PRODUCT && (j.status === 'running' || j.status === 'fetching') && Date.now() - (ms(j.updatedAt || j.pickedUpAt) || Date.now()) > STALE_MS;
  function wakeLine(id, w) {
    if (!w) return '';
    return `<p class="tb-hint">${esc(wakeText(w))}</p>`;
  }
  function voiceText(r) {
    const v = str(r.voice, 120), src = str(r.summarySource, 20);
    if (src && WHO[src]) return `${WHO[src][0].toUpperCase()}${WHO[src].slice(1)}${v && src !== 'fixed' ? ` (${v})` : ''}`;
    return v ? (v.startsWith('fixed') ? 'The fixed lines (no language model)' : v) : 'Not said';
  }
  function windowText(r) {
    const w = r.window && typeof r.window === 'object' ? r.window : null;
    if (w && num(w.startS) != null && num(w.endS) != null) {
      const how = { 'your start': 'from the start you gave', 'best match with the score': 'the part that fits the score best', 'first, no sound': 'the start (no sound to listen to)' }[w.how] || 'the part with the most playing';
      return `${mmss(w.startS)} to ${mmss(w.endS)}${num(w.fromS) ? ` of ${mmss(w.fromS)}` : ''}, ${how}`;
    }
    return num(r.analysedS) != null ? `All of it, ${mmss(r.analysedS)}` : 'Not said';
  }
  function qaHtml(j) {
    const rows = S.chats.get(j.id) || [];
    const qs = rows.filter((r) => r.role === 'user');
    if (!qs.length) return '';
    const ans = new Map(rows.filter((r) => r.role === 'teacher' && typeof r.replyTo === 'string').map((r) => [r.replyTo, r]));
    const open = S.ui.opened.has(`${j.id}:qa`) ? ' open' : '';
    const waiting = qs.filter((q) => !ans.has(q.id) && q.status !== 'failed').length;
    return `<details class="disclose" data-d="${j.id}:qa"${open}><summary>Questions and answers (${qs.length}${waiting ? `, ${waiting} waiting` : ''})</summary><ul class="tb-qa disclose-body">${qs.map((q) => {
      const a = ans.get(q.id);
      let body;
      if (a) body = `<p>${esc(str(a.text, 4000))}</p><p class="by">Answered ${esc(clock(a.at))} by ${esc(whoOf(a.source))}</p>`;
      else if (q.status === 'failed') body = `<p class="tb-err">No answer: ${esc(str(q.error, 300) || 'the teacher could not answer this one.')}</p>`;
      else {
        const late = Date.now() - (ms((q.wake && q.wake.at) || q.at) || Date.now()) > NUDGE_MS;
        body = `<p class="wait">Waiting for the teacher${late ? `. Still waiting after ${esc(ago((q.wake && q.wake.at) || q.at).replace(' ago', ''))}: ${esc(TELL)}` : ': the teacher answers in its session.'}</p>`
          + (late && S.writable ? `<div class="tb-acts"><button type="button" class="btn btn-sm" data-act="rewake-q" data-q="${esc(q.id)}">Notify the teacher again</button></div>` : '');
      }
      return `<li><p class="q">${esc(str(q.text, MAX_Q))}</p><p class="by">Asked ${esc(clock(q.at))}</p>${body}</li>`;
    }).join('')}</ul></details>`;
  }
  
  
  
  const f2 = (v) => (num(v) == null ? '-' : (Math.floor(v * 100 + 1e-6) / 100).toFixed(2));
  function prText(d, none) {
    if (!d || typeof d !== 'object') return '';
    const lesson = num(d.lesson) || 0, truth = num(d.truth) || 0;
    if (!lesson && !truth) return `none, in the lesson or the MIDI${none ? ` (${none})` : ''}`;
    return `precision ${f2(d.precision)}, recall ${f2(d.recall)} (the lesson ${lesson}, the MIDI ${truth}, both ${num(d.tp) || 0})`;
  }
  function accuracyHtml(j) {
    const r = j.result && typeof j.result === 'object' ? j.result : {};
    const a = r.accuracy && typeof r.accuracy === 'object' ? r.accuracy : null;
    if (!a && !(j.midi && assetOk(j.midi.assetId))) return '';
    let body;
    if (!a) body = '<p class="tb-hint">The MIDI you added has not been compared with the lesson yet. Tell the teacher in the chat: check the test bench.</p>';
    else if (a.state === 'refused') {
      body = `<p class="tb-refused"><b>Could not line up the MIDI with the video.</b> ${esc(str(a.reason, 300) || 'The notes in the two did not match well enough.')}</p>`
        + '<p class="tb-hint">No accuracy is given for this take: scored on a wrong alignment, a good lesson would read as a deaf one. Check the MIDI is of this same playing, recorded while you filmed.</p>';
    } else if (a.state !== 'scored') {
      body = `<p class="tb-err">${esc(str(a.reason, 300) || 'The MIDI file could not be read.')}</p>`;
    } else {
      const on = a.onsets && typeof a.onsets === 'object' ? a.onsets : {}, sc = a.score && typeof a.score === 'object' ? a.score : null;
      
      const off = num(a.videoOffsetS) != null ? num(a.videoOffsetS) : num(a.offsetS);
      const rows = [
        ['Notes heard', `F1 ${f2(on.f1)} within 50 ms: precision ${f2(on.precision)}, recall ${f2(on.recall)}${num(on.matched) != null && num(on.midiNotes) != null ? ` (${on.matched} of the MIDI's ${on.midiNotes} notes in the part analysed)` : ''}`],
        ['Lined up', `${off == null ? 'not said' : `${off >= 0 ? '+' : ''}${off.toFixed(3)} s from the MIDI's clock to the video's`}, confidence ${f2(a.confidence)}${num(a.matched) != null ? `, ${a.matched} notes matched` : ''}`],
      ];
      if (sc) {
        for (const [k, name] of [['wrong', 'Wrong notes'], ['missed', 'Missed notes'], ['extra', 'Extra notes']]) if (sc[k]) rows.push([name, prText(sc[k])]);
      } else rows.push(['Wrong, missed, extra', 'not checked: no piece was chosen for this test']);
      const c = a.counts && typeof a.counts === 'object' ? a.counts : {};
      
      if (num(c.findings) === 0) rows.push(['Findings', 'none: the lesson named no finding to check']);
      else if (num(c.findings) != null) rows.push(['Findings', `${c.supported || 0} of ${c.findings} supported by the MIDI${c.partly ? `, ${c.partly} partly` : ''}${c.unsupported ? `, ${c.unsupported} not` : ''}${c.notCheckable ? `, ${c.notCheckable} not checkable` : ''}`]);
      const fs = (Array.isArray(a.findings) ? a.findings : []).filter((f) => f && typeof f === 'object').slice(0, 30);
      const missed = (Array.isArray(a.missedFindings) ? a.missedFindings : []).filter((f) => f && typeof f === 'object').slice(0, 20);
      const warn = (Array.isArray(a.warnings) ? a.warnings : []).map((w) => str(w, 300)).filter(Boolean).slice(0, 5);
      body = `<dl class="tb-kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
        + (fs.length ? `<ul class="tb-verdicts" aria-label="Each finding against the MIDI">${fs.map((f) => {
          const v = VERDICTS.includes(f.verdict) ? f.verdict : 'not checkable';
          return `<li><span><b>${esc(itemName(f))}</b>: <span class="tb-v ${v.replace(' ', '-')}">${esc(v)}</span></span>${str(f.why, 240) ? `<span class="sub">${esc(str(f.why, 240))}</span>` : ''}</li>`;
        }).join('')}</ul>` : '')
        + (missed.length ? `<p class="tb-hint">The MIDI also shows what the lesson did not say: ${esc(missed.map(itemName).join(', '))}.</p>` : '')
        + (warn.length ? `<ul class="tb-tip tb-hint">${warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '');
    }
    return `<section class="tb-block" aria-label="Accuracy against your MIDI"><h3>Accuracy against your MIDI</h3>${body}</section>`;
  }

  
  
  function sampleDraft(j) {
    let d = S.ui.sampleDraft.get(j.id);
    if (!d) {
      const lib = j.options && j.options.piece && CFG.library.find((p) => p.id === j.options.piece);
      const prev = j.sampleRequest && typeof j.sampleRequest === 'object' ? j.sampleRequest : {};
      d = { title: str(prev.title, 80), piece: str(prev.piece, 120) || (lib ? lib.title : ''), player: str(prev.player, 60), agreed: false,
        hostedModels: SAMPLE_MODELS.some(([k]) => k === prev.hostedModels) ? prev.hostedModels : 'none',
        openHost: SAMPLE_HOSTS.some(([k]) => k === prev.openHost) ? prev.openHost : 'openrouter', adult: false, downloadable: prev.downloadable === true };
      S.ui.sampleDraft.set(j.id, d);
    }
    return d;
  }
  function sampleState(j) {
    const q = j.sampleRequest && typeof j.sampleRequest === 'object' ? j.sampleRequest : null;
    const s = j.sample && typeof j.sample === 'object' ? j.sample : null;
    if (q && (!s || s.requestAt !== q.at)) return { state: 'waiting', q, s };
    return { state: s && ['made', 'refused'].includes(s.state) ? s.state : 'none', q, s };
  }
  function sampleHtml(j) {
    const c = j.consent && typeof j.consent === 'object' ? j.consent : null;
    const head = '<h3>Offer as a sample for the judges</h3>';
    if (c && c.footage === 'third-party') return `<section class="tb-block">${head}<p class="tb-hint">This test is someone else's recording, so it cannot be offered as a sample.</p></section>`;
    if (!c || c.footage !== 'own') return `<section class="tb-block">${head}<p class="tb-hint">This test was added before the bench recorded whose playing it is, so it cannot be offered as a sample. Add the take again to offer it.</p></section>`;
    const st = sampleState(j), id = j.id, busy = S.ui.sampleBusy.has(id), msg = S.ui.sampleMsg.get(id);
    let status = '';
    if (st.state === 'waiting') {
      const late = Date.now() - (ms((j.wake && j.wake.at) || st.q.at) || Date.now()) > NUDGE_MS;
      status = `<p class="tb-hint">Offered ${esc(clock(st.q.at))}. Waiting for the teacher to make the sample${late ? `. Still waiting: ${esc(TELL)}` : '.'}</p>`
        + (late && S.writable ? '<div class="tb-acts"><button type="button" class="btn btn-sm" data-act="rewake-s">Notify the teacher again</button></div>' : '');
    } else if (st.state === 'made') {
      status = `<p class="tb-msg ok">Sample made: <b>${esc(str(st.s.id, 80))}</b>, ${esc(clock(st.s.at))}. It waits in the samples folder of the teacher's server: the judges see it once the team publishes the samples.</p>`;
    } else if (st.state === 'refused') {
      status = `<p class="tb-refused"><b>Not made.</b> ${esc(str(st.s.reason, 400) || 'the teacher could not make it.')}</p>`
        + (st.s.kept && str(st.s.id, 80) ? `<p class="tb-hint">The sample made earlier from this test, <b>${esc(str(st.s.id, 80))}</b>, is unchanged: it still says what was agreed for it then. If that no longer holds, ask the teacher in the chat to remove it.</p>` : '');
    }
    if (!S.writable) return `<section class="tb-block">${head}${status || '<p class="tb-hint">Only the owner of this test bench can offer a test as a sample.</p>'}</section>`;
    if (st.state === 'waiting') return `<section class="tb-block">${head}${status}</section>`;
    const d = sampleDraft(j), open = S.ui.opened.has(`${id}:sample`) ? ' open' : '', f = (k) => `tb-s-${k}-${id}`;
    const form = `<form class="tb-sform" data-sample="${id}" novalidate>`
      + `<div class="tb-field"><label class="tb-label" for="${f('title')}">Title</label><input type="text" id="${f('title')}" data-s="title" maxlength="80" autocomplete="off" value="${esc(d.title)}" placeholder="Bars 9-12, a slip in the left hand"></div>`
      + `<div class="tb-two"><div class="tb-field"><label class="tb-label" for="${f('piece')}">Piece (optional)</label><input type="text" id="${f('piece')}" data-s="piece" maxlength="120" autocomplete="off" value="${esc(d.piece)}"></div>`
      + `<div class="tb-field"><label class="tb-label" for="${f('player')}">Player's name as shown (optional)</label><input type="text" id="${f('player')}" data-s="player" maxlength="60" autocomplete="off" value="${esc(d.player)}" placeholder="anonymous"><p class="tb-hint">Leave it empty and the sample says anonymous.</p></div></div>`
      + `<fieldset><legend>Which models may answer questions about it</legend><div class="tb-choices">${SAMPLE_MODELS.map(([k, label]) => `<label class="check" for="${f(`m-${k}`)}"><input type="radio" name="${f('models')}" id="${f(`m-${k}`)}" data-s="hostedModels" value="${k}"${d.hostedModels === k ? ' checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>`
      + `<div class="tb-field tb-sub"${d.hostedModels === 'open' ? '' : ' hidden'}><label class="tb-label" for="${f('host')}">Where Muse Spark Open may run</label><select id="${f('host')}" data-s="openHost">${SAMPLE_HOSTS.map(([k, label]) => `<option value="${k}"${d.openHost === k ? ' selected' : ''}>${esc(label)}${k === 'openrouter' ? ` (${esc(CFG.openProviders.join(', '))})` : ''}</option>`).join('')}</select></div>`
      + `<label class="check tb-sub" for="${f('adult')}"${d.hostedModels === 'none' ? ' hidden' : ''}><input type="checkbox" id="${f('adult')}" data-s="adult"${d.adult ? ' checked' : ''}><span>The player is 18 or older.</span></label></fieldset>`
      + `<label class="check" for="${f('dl')}"><input type="checkbox" id="${f('dl')}" data-s="downloadable"${d.downloadable ? ' checked' : ''}><span>The player agreed that the video may be downloaded (the part the lesson looked at).</span></label>`
      + `<label class="check" for="${f('agree')}"><input type="checkbox" id="${f('agree')}" data-s="agreed"${d.agreed ? ' checked' : ''}><span>The player agreed that this take may be shown to the hackathon judges and to anyone with the link</span></label>`
      + `<div class="tb-submit"><button type="submit" class="btn btn-primary" data-act="sample-go"${busy ? ' disabled' : ''}>${st.state === 'made' ? 'Offer it again' : 'Offer as a sample'}</button>`
      + `<p class="tb-msg${msg ? ` ${msg.kind}` : ''}" role="status" aria-live="polite">${esc(msg ? msg.text : '')}</p></div>`
      + '<p class="tb-hint">the teacher makes the sample in its session (make_sample.py, then its check): the lesson, its video and plan, with the file name and anything personal taken out. Nothing is uploaded anywhere.</p></form>';
    return `<section class="tb-block">${head}${status}<details class="disclose" data-d="${id}:sample"${open}><summary>${st.state === 'made' ? 'Change what the sample says' : st.state === 'refused' ? 'Offer it again' : 'Offer this take'}</summary><div class="disclose-body">${form}</div></details></section>`;
  }
  async function offerSample(id) {
    const j = S.jobs.get(id), d = j && sampleDraft(j);
    if (!j || !d || !S.db) return;
    const say = (text, kind = 'err') => { S.ui.sampleMsg.set(id, { text, kind }); renderJob(id); };
    const title = d.title.trim().replace(/[\u2013\u2014]/g, '-'), piece = d.piece.trim().replace(/[\u2013\u2014]/g, '-'), player = d.player.trim().replace(/[\u2013\u2014]/g, '-');
    if (!title) return say('Give the sample a title.');
    if (!d.agreed) return say("Tick the player's agreement to show this take to the hackathon judges and to anyone with the link.");
    if (d.hostedModels !== 'none' && !d.adult) return say('A model may answer about a sample only when the player is 18 or older: tick that, or choose no model.');
    const req = { title: title.slice(0, 80), piece: piece.slice(0, 120) || null, player: player.slice(0, 60) || null, agreed: true,
      hostedModels: d.hostedModels, openHost: d.hostedModels === 'open' ? d.openHost : null, adult: d.hostedModels !== 'none' && d.adult === true,
      downloadable: d.downloadable === true, at: iso(), by: S.userId };
    S.ui.sampleBusy.add(id); say('Saving the offer...', 'note');
    try { await dbWrite(() => S.db.doc(`jobs/${id}`).update({ sampleRequest: req })); } catch (e) {
      S.ui.sampleBusy.delete(id); say(explain(e)); return;
    }
    S.ui.sampleBusy.delete(id);
    S.ui.sampleMsg.delete(id);
    Object.assign(d, { title: req.title, piece: req.piece || '', player: req.player || '' });   
    d.agreed = false;                              
    S.ui.opened.delete(`${id}:sample`);
    const w = await wake('sample', id);
    await noteWake(`jobs/${id}`, w);
    formMsg(wakeText(w, 'the teacher makes the sample when it looks'), w.ok ? 'ok' : 'note');
    renderJob(id);
  }
  function onSampleInput(e) {
    const el = e.target, form = el.closest && el.closest('form[data-sample]');
    if (!form || !el.dataset.s) return;
    const j = S.jobs.get(form.dataset.sample);
    if (!j) return;
    const d = sampleDraft(j), k = el.dataset.s;
    d[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'hostedModels' && e.type === 'change') { S.cards.delete(j.id); renderJob(j.id); }   
  }

  function jobHtml(j, mode = 'lib') {
    const st = stateOf(j), name = jobName(j), busyDel = S.ui.deleting.has(j.id);
    let body = '';
    if (busyDel) body = '<p class="tb-hint">Deleting the video, the result and the questions...</p>';
    else if (st === 'deleting') {
      
      body = `<p class="tb-hint">This test was being deleted, but not everything went yet.${S.writable ? '' : ' Its owner can finish deleting it.'}</p>`
        + (S.writable ? '<div class="tb-acts"><button type="button" class="btn btn-sm btn-danger" data-act="del-yes">Finish deleting</button></div>' : '');
    }
    else if (j.status === 'queued' && PRODUCT) {
      
      const q = j.queue || {}, est = num(q.jobS) != null ? q.jobS : estimateS((j.options || {}).windowS || NORMAL_S, (j.source || {}).durationS);
      body = `<p class="tb-now-step">Waiting to start</p><p class="tb-hint">${q.ahead ? `After ${q.ahead} other ${q.ahead === 1 ? 'take' : 'takes'}${num(q.startS) ? ` (${esc(minutes(q.startS))})` : ''}. ` : ''}`
        + `Once it starts it takes ${esc(minutes(est))}.</p>` + detailsHtml(j);
    } else if (j.status === 'queued') {
      const q = queueAhead(j), est = estimateS((j.options || {}).windowS || QUICK_S, (j.source || {}).durationS);
      body = `<p class="tb-now-step">Waiting for the teacher</p><p class="tb-hint">Waiting for the teacher to pick it up${q.ahead ? `, after ${q.ahead} other ${q.ahead === 1 ? 'test' : 'tests'} (${esc(minutes(q.waitS))})` : ''}. `
        + `Once it starts it takes ${esc(minutes(est))}.</p>`
        + (nudgeDue(j) ? `<div class="tb-nudge"><span>Nothing has started after <span class="tb-ago" data-ago-short="${esc(new Date(since(j)).toISOString())}"></span>. If it stays like this, ${esc(TELL)}</span>`
          + (S.writable ? '<button type="button" class="btn btn-sm" data-act="rewake">Notify the teacher again</button>' : '') + '</div>' : wakeLine(j.id, S.ui.wakeMsg.get(j.id)))
        + detailsHtml(j);
    } else if (j.status === 'fetching' || j.status === 'running') {
      const p = num(j.progress), eta = num(j.etaS);
      const label = str(j.step, 120) || (j.status === 'fetching' ? 'Getting your video' : 'Running');
      
      body = `<div class="tb-overall"><p class="tb-now-meta"><span class="tb-now-step">${esc(label)}</span>`
        + `<span class="tb-num">${p != null ? `${Math.round(p * 100)}%` : ''}${eta != null ? ` · ${esc(minutes(eta))} left` : ''}</span></p>`
        + `<div class="bar" role="progressbar" aria-label="Overall progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((p || 0) * 100)}"><span style="width:${((p || 0) * 100).toFixed(1)}%"></span></div></div>`
        + (staleDue(j) ? `<p class="tb-nudge">No update for a while. the teacher posts progress every few minutes as it checks the run; if this stays, tell the teacher in the chat: check the test bench.</p>` : '')
        + detailsHtml(j, PRODUCT ? stepsHtml(j) : `<p class="tb-hint">Started ${esc(clock(j.startedAt || j.pickedUpAt))}. Last update from the teacher: <span class="tb-ago" data-ago="${esc(j.updatedAt || j.pickedUpAt || '')}"></span>.</p>${stepsHtml(j)}`);
    } else if (j.status === 'done') {
      const r = j.result && typeof j.result === 'object' ? j.result : {};
      const took = PRODUCT ? (stepRows(j).some((x) => x.ms != null) ? fmtMs(stepRows(j).reduce((a, x) => a + (x.ms || 0), 0)) : '')
      : ms(j.finishedAt) != null && ms(j.startedAt || j.pickedUpAt) != null ? fmtMs(ms(j.finishedAt) - ms(j.startedAt || j.pickedUpAt)) : '';
      const ok = assetOk(r.resultAsset);
      body = `<div class="tb-done">`
        + (mode === 'lib' && ok ? '' : `<div class="tb-acts">${ok ? `<button type="button" class="btn btn-primary${mode === 'feature' ? ' btn-lg' : ''}" data-act="open">Open the result</button>` : '<span class="tb-err">The result file is missing from this page.</span>'}</div>`)
        + (PRODUCT ? '' : accuracyHtml(j) + qaHtml(j) + sampleHtml(j))
        + detailsHtml(j, `<dl class="tb-kv">`
          + `<dt>Analysed</dt><dd>${esc(windowText(r))}</dd>`
          + (PRODUCT ? '' : `<dt>Teacher's words</dt><dd>${esc(voiceText(r))}</dd>`)
          + (num(r.findings) != null ? `<dt>Found</dt><dd>${r.findings} ${r.findings === 1 ? 'thing' : 'things'} to work on${num(r.strengths) != null ? `, ${r.strengths} that went well` : ''}</dd>` : '')
          + (took ? `<dt>Took</dt><dd class="tb-num">${esc(took)}${j.finishedAt ? `, finished ${esc(clock(j.finishedAt))}` : ''}</dd>` : '')
          + (PRODUCT ? `</dl>${j.sample ? '' : stepsHtml(j)}` : `<dt>Cost</dt><dd>${esc(costText(j))}</dd></dl>${stepsHtml(j)}`))
        + '</div>';
    } else if (j.status === 'failed') {
      body = `<p class="tb-err">${esc(str(j.error, 600) || 'The run stopped before it finished.')}</p>${detailsHtml(j, stepsHtml(j))}`;
    }
    const del = delHtml(j, busyDel, st);
    const derr = S.ui.delErr.get(j.id);
    
    if (mode === 'feature') return `${body}${derr ? `<p class="tb-err" role="alert">${esc(derr)}</p>` : ''}`;
    return `${body}${derr ? `<p class="tb-err" role="alert">${esc(derr)}</p>` : ''}${del.confirm || (del.btn ? `<div class="tb-acts tb-acts-end">${del.btn}</div>` : '')}`;
  }
  
  function delHtml(j, busyDel, st) {
    if (PRODUCT || !S.writable || busyDel || st === 'deleting') return { btn: '', confirm: '' };
    if (!S.ui.confirm.has(j.id)) return { btn: `<button type="button" class="tb-del" data-act="del" aria-label="Delete this test" title="Delete this test">${TRASH}</button>`, confirm: '' };
    return { btn: '', confirm: `<div class="tb-confirm" role="group" aria-label="Delete this test"><p>Delete this test for good? The video, the result${j.midi ? ', the MIDI' : ''} and the questions are removed from this page${j.status === 'running' || j.status === 'fetching' ? ', and the teacher stops the run the next time it checks on it' : ''}.${j.sample && (j.sample.state === 'made' || j.sample.kept) && str(j.sample.id, 80) ? ' The sample made from it stays in the teacher\'s samples folder, as the player agreed: ask the teacher in the chat to remove it too.' : ''}</p>`
        + '<div class="tb-acts"><button type="button" class="btn btn-sm btn-danger" data-act="del-yes">Delete for good</button><button type="button" class="btn btn-sm" data-act="del-no">Keep it</button></div></div>' };
  }
  
  function topHtml(j) {
    const st = stateOf(j), busyDel = S.ui.deleting.has(j.id), del = delHtml(j, busyDel, st);
    return `<div class="tb-job-head"><p class="tb-job-name">${esc(jobName(j))}</p><span class="tb-pill ${st}">${esc(STATUS[st])}</span>${del.btn}</div>`
      + del.confirm + (!busyDel && st !== 'deleting' ? phasesHtml(j) : '');
  }
  
  function detailsHtml(j, extra = '') {
    const open = S.ui.opened.has(`${j.id}:steps`) ? ' open' : '';
    return `<details class="disclose tb-det" data-d="${j.id}:steps"${open}><summary>Details</summary><div class="disclose-body">`
      + `<p class="tb-facts">${esc(facts(j))}</p>${extra}</div></details>`;
  }
  
  
  
  
  const NOTE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
  const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const pieceOf = (j) => (j.result && typeof j.result === 'object' && j.result.piece && typeof j.result.piece === 'object' ? j.result.piece : null);
  function titleOf(j) {
    const p = pieceOf(j), t = p && str(p.title, 120);
    return t ? t.split(/[,:(]/)[0].trim() : jobName(j).replace(/\.[a-z0-9]{2,4}$/i, '').trim() || 'Your take';
  }
  function coverFor(composer) {
    const c = String(composer || '').toLowerCase();
    return (window.MVCOVERS && c && Object.keys(window.MVCOVERS).map((k) => (c.includes(k) ? window.MVCOVERS[k] : null)).find(Boolean)) || null;
  }
  function workLine(j) {
    if (j.status !== 'done') return '';
    const r = j.result && typeof j.result === 'object' ? j.result : {};
    const parts = Array.isArray(r.toWorkOn) ? r.toWorkOn.map((x) => str(x, 80)).filter(Boolean) : null;
    if (parts && parts.length) return `To work on: ${parts.join(', ')}`;
    if (parts || num(r.findings) === 0) return 'Nothing to work on was found';
    return num(r.findings) != null ? `${r.findings} ${r.findings === 1 ? 'thing' : 'things'} to work on` : '';
  }
  
  function stateLine(j) {
    if (j.status === 'queued') return 'Waiting to start';
    if (j.status === 'fetching' || j.status === 'running') {
      const p = num(j.progress), eta = num(j.etaS);
      return [str(j.step, 120) || (j.status === 'fetching' ? 'Getting your video' : 'Analysing'), p != null ? `${Math.round(p * 100)}%` : null,
        eta != null ? `${minutes(eta)} left` : null].filter(Boolean).join(' · ');
    }
    return '';
  }
  const isActive = (j) => ['running', 'fetching', 'queued'].includes(j.status);
  function libHtml(j) {
    const open = S.ui.libAll || S.ui.opened.has(`${j.id}:lib`), st = stateOf(j);
    const r = j.result && typeof j.result === 'object' ? j.result : {};
    const ready = st === 'done' && assetOk(r.resultAsset) && !S.ui.deleting.has(j.id);
    const live = isActive(j) && st !== 'deleting';
    const p = pieceOf(j), cover = p ? coverFor(p.composer || '') : null, len = num((j.video && j.video.durationS) || (j.source && j.source.durationS));
    const sub = [p ? jobName(j) : null, len ? mmss(len) : null, clock(PRODUCT ? j.createdAt || j.finishedAt : j.finishedAt || j.createdAt)].filter(Boolean).join(' · ');
    const fix = live ? stateLine(j) : workLine(j);
    const art = cover ? `<img class="tb-lib-art" src="${esc(cover)}" alt="">` : `<span class="tb-lib-art tb-lib-art-none">${NOTE_ICON}</span>`;
    const act = ready ? 'open' : live ? 'focus' : 'lib';
    return `<div class="tb-lib-line"><button type="button" class="tb-lib-row${live ? ' live' : ''}" data-act="${act}"${act === 'lib' ? ` aria-expanded="${open}"` : ''}>${art}`
      + `<span class="tb-lib-text"><span class="tb-lib-name">${esc(titleOf(j))}</span><span class="tb-lib-sub">${esc(sub)}</span>`
      + `${fix ? `<span class="tb-lib-fix">${esc(fix)}</span>` : ''}</span>`
      + `${st === 'done' ? '' : `<span class="tb-pill ${st}">${esc(STATUS[st])}</span>`}</button>`
      + `<button type="button" class="tb-lib-more" data-act="lib" aria-expanded="${open}" aria-label="More about this take" title="More about this take">${CHEVRON}</button></div>`
      + (open ? `<div class="tb-lib-body">${jobHtml(j, 'lib')}</div>` : '');
  }
  function costText(j) {
    const c = j.cost && typeof j.cost === 'object' ? j.cost : null;
    if (c && num(c.usd) != null && c.usd > 0) return `$${c.usd.toFixed(2)}${str(c.note, 120) ? `, ${str(c.note, 120)}` : ''}`;
    if (j.backend === 'meta') return "Not reported yet: SAM 3.1 on Meta's Model API, on its bill";
    return j.backend === 'replicate' ? 'Not reported' : "None: it ran on the teacher's server CPU";
  }
  
  
  const PHASE_OF = { prepare: 'reveal', notes: 'wave', hands: 'scan', keyboard: 'align', fingers: 'rings', analysis: 'lock', voice: 'glow' };
  function phaseOf(j) {
    if (!j) return 'look';
    if (j.status === 'done') return 'done';
    if (j.status === 'failed') return 'off';
    if (j.status !== 'running') return 'look';
    const run = (Array.isArray(j.steps) ? j.steps : []).find((x) => x && x.state === 'running');
    return (run && PHASE_OF[run.id]) || 'reveal';
  }
  const anim = { phase: null, on: null, job: null };
  
  
  
  
  const piano = { loadedAt: 0, tries: 0, lastTry: 0, warm: null };
  
  window.__pianoWarm = [];
  function warmPiano() {
    if (piano.warm) return;
    const src = $('tb-anim').dataset.src;
    piano.warm = fetch(src).then((r) => (r.ok ? r.text() : '')).then((html) => {
      const urls = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], new URL(src, document.baseURI)).href);
      window.__pianoWarm = urls;
      return Promise.all(urls.map((u) => fetch(u).then((r) => r.blob()).catch(() => null)));
    }).catch(() => null);
  }
  window.__pianoLog = [];
  function pianoWhy() {
    const f = $('tb-anim');
    let M = null, c = null;
    try { M = f.contentWindow && f.contentWindow.MVCalib; c = f.contentDocument && f.contentDocument.querySelector('canvas'); } catch (e) { return `it could not be read (${e.message || e})`; }
    if (M && M.failed) return M.failed;
    if (M && M.lost) return 'the browser took back its 3D drawing';
    
    if (!M || !M.ready) return piano.loadedAt && Date.now() - piano.loadedAt > 4000 ? 'it did not finish loading' : '';
    if (c && (c.width < 8 || c.height < 8) && f.clientWidth > 50 && f.clientHeight > 50) return 'it was drawn at no size';
    try { const gl = c && (c.getContext('webgl2') || c.getContext('webgl')); if (gl && gl.isContextLost()) return 'the browser took back its 3D drawing'; } catch {   }
    return '';
  }
  function pianoHealth() {
    const f = $('tb-anim'), n = $('tb-now');
    if (n.hidden || !f.getAttribute('src') || S.ui.view !== 'tests' || S.view !== 'bench' || document.hidden) return;
    const why = pianoWhy();
    if (!why) { if (n.dataset.why) delete n.dataset.why; if (piano.tries && Date.now() - piano.lastTry > 60000) piano.tries = 0; return; }
    if (piano.tries < 2 && Date.now() - piano.lastTry > 5000) {
      piano.tries++; piano.lastTry = Date.now(); piano.loadedAt = 0;
      let seen = null;
      try { const w = f.contentWindow, M = w.MVCalib; seen = { href: String(w.location.href).split('/').pop(), rs: w.document.readyState, M: M ? Object.keys(M).filter((k) => typeof M[k] !== 'function').map((k) => `${k}=${String(M[k]).slice(0, 20)}`) : null, sinceLoad: piano.loadedAt ? Date.now() - piano.loadedAt : null }; } catch (e) { seen = String(e).slice(0, 80); }
      window.__pianoLog.push({ at: new Date().toISOString(), why, did: 'reloaded', seen });
      console.warn(`[piano] not drawing: ${why}; loading it again (${piano.tries} of 2)`);
      n.classList.remove('ready'); delete n.dataset.why;
      f.setAttribute('src', `${f.dataset.src}?again=${piano.tries}`);
      return;
    }
    if (Date.now() - piano.lastTry > 5000 && n.dataset.why !== why) {
      window.__pianoLog.push({ at: new Date().toISOString(), why, did: 'said' });
      console.warn(`[piano] not drawing: ${why}`);
      n.classList.add('ready'); n.dataset.why = why;
    }
  }
  function animSend(force) {
    const f = $('tb-anim');
    if (!f || !f.getAttribute('src')) return;
    const j = anim.job && S.jobs.get(anim.job), ph = S.ui.upload && !j ? 'reveal' : phaseOf(j);
    const on = (!!j || !!(S.ui.upload && S.ui.upload.state !== 'failed')) && S.view === 'bench' && S.ui.view === 'tests' && !document.hidden;
    if (!force && ph === anim.phase && on === anim.on) return;
    anim.phase = ph; anim.on = on;
    try { f.contentWindow.postMessage({ mvPhase: ph, mvRun: on }, '*'); } catch (e) {   }
    f.dataset.phase = ph;
  }
  function renderAnim(j) {
    $('tb-now').hidden = !j;
    anim.job = j ? j.id : null;
    const f = $('tb-anim');
    if (j && !f.getAttribute('src') && S.ui.view === 'tests') f.setAttribute('src', f.dataset.src);   
    animSend(false);
  }
  
  function renderJob(id) {
    const li = document.querySelector(`.tb-job[data-job="${id}"]`), j = S.jobs.get(id);
    if (!li || !j) return;
    const top = li.classList.contains('tb-feature');
    const html = top ? jobHtml(j, 'feature') : libHtml(j), key = html + (nudgeDue(j) ? 1 : 0) + (staleDue(j) ? 1 : 0);
    if (top) { renderAnim(j); renderTop(j); }
    if (S.cards.get(id) === key) return;
    const a = li.contains(document.activeElement) ? document.activeElement : null;
    const had = a && (a.dataset.act ? `[data-act="${a.dataset.act}"]` : a.id ? `#${CSS.escape(a.id)}` : null);
    S.cards.set(id, key);
    li.innerHTML = html;
    if (had) { const b = li.querySelector(had); if (b) b.focus({ preventScroll: true }); }
    tickTimes(li);
    if (top) fitRun();
  }
  function renderTop(j) {
    const box = $('tb-run-top');
    if (!j) { if (box.dataset.job) { box.innerHTML = ''; delete box.dataset.job; } S.topKey = null; return; }
    const html = topHtml(j);
    if (S.topKey === html && box.dataset.job === j.id) return;
    const a = box.contains(document.activeElement) ? document.activeElement : null;
    const had = a && a.dataset.act ? `[data-act="${a.dataset.act}"]` : null;
    S.topKey = html; box.dataset.job = j.id; box.innerHTML = html;
    if (had) { const b = box.querySelector(had); if (b) b.focus({ preventScroll: true }); }
    fitRun();
  }
  
  
  function fitRun() {
    const now = $('tb-now'), li = document.querySelector('#tb-list > .tb-feature');
    if (now.hidden || S.ui.view !== 'tests' || !li) { now.style.height = ''; return; }
    const first = li.querySelector('.tb-overall, .tb-done > .tb-acts, .tb-err, .tb-hint') || li.firstElementChild;
    const below = first ? first.getBoundingClientRect().bottom - li.getBoundingClientRect().top : 0;
    const gap = parseFloat(getComputedStyle($('tb-run')).rowGap) || 12;
    const top = now.getBoundingClientRect().top + window.scrollY;
    const h = window.innerHeight - top - gap - below - 14;
    now.style.height = `${Math.round(Math.max(180, Math.min(560, h, now.getBoundingClientRect().width * 0.64)))}px`;
  }
  
  function listOrder() {
    const at = (id) => ms(S.jobs.get(id).createdAt) || 0, st = (id) => S.jobs.get(id).status;
    const active = S.order.filter((id) => st(id) === 'running' || st(id) === 'fetching');
    const queued = S.order.filter((id) => st(id) === 'queued').sort((a, b) => at(a) - at(b));
    return active.concat(queued, S.order.filter((id) => !active.includes(id) && !queued.includes(id)));
  }
  function renderJobs() {
    const list = $('tb-list'), lib = $('tb-lib');
    const ids = listOrder();
    
    if (S.ui.upload && S.ui.upload.id && S.jobs.get(S.ui.upload.id)) { S.ui.upload = null; delete $('tb-run-top').dataset.up; $('tb-run-top').innerHTML = ''; }
    if (S.ui.upload) { renderUpload(); $('tb-nav-n').textContent = ids.length ? String(ids.length) : ''; return; }
    if ($('tb-run-top').dataset.up) { delete $('tb-run-top').dataset.up; $('tb-run-top').innerHTML = ''; }
    
    
    
    const f = S.ui.focus && S.jobs.get(S.ui.focus);
    
    if (f && f.status === 'done' && stateOf(f) === 'done' && S.view === 'bench' && S.ui.view === 'tests' && !S.ui.autoOpened.has(f.id)
      && f.result && assetOk(f.result.resultAsset)) {
      S.ui.autoOpened.add(f.id);
      setTimeout(() => openMuse(f.id), 0);
    }
    if (S.ui.focus && !(f && (isActive(f) || f.status === 'failed' || stateOf(f) === 'deleting'))) S.ui.focus = null;
    const top = S.ui.focus || null;
    const rest = ids.filter((id) => id !== top);
    $('tb-run').hidden = !top;
    
    $('tb-run-back').hidden = S.ui.focusFrom !== 'history';
    if (top) $('tb-run-h').textContent = S.jobs.get(top).status === 'queued' ? 'Waiting to start' : S.jobs.get(top).status === 'failed' ? 'Stopped' : 'Analysing now';
    for (const [ul, mine] of [[list, top ? [top] : []], [lib, rest]]) {
      const cls = ul === list ? 'tb-job tb-feature' : 'tb-job tb-lib-item';
      for (const li of [...ul.children]) if (!mine.includes(li.dataset.job)) { li.remove(); S.cards.delete(li.dataset.job); }
      let prev = null;
      for (const id of mine) {
        let li = ul.querySelector(`[data-job="${id}"]`);
        if (!li) { li = document.createElement('li'); li.className = cls; li.dataset.job = id; }
        const want = prev ? prev.nextSibling : ul.firstChild;
        if (li !== want) ul.insertBefore(li, want);
        renderJob(id);
        prev = li;
      }
    }
    $('tb-lib-box').hidden = !!top || !rest.length;
    $('tb-lib-n').textContent = ids.length ? `${ids.length} ${ids.length === 1 ? 'take' : 'takes'}` : '';
    $('tb-lib-all').setAttribute('aria-pressed', String(!!S.ui.libAll));
    $('tb-lib-all').textContent = S.ui.libAll ? 'Hide details' : 'Show details';
    if (!top) { renderAnim(null); renderTop(null); }
    fitRun();
    $('tb-empty').hidden = ids.length > 0;
    const loading = !S.connected || (S.db && !S.jobsSeen && !S.dbProblem);
    $('tb-empty').textContent = PRODUCT ? (loading ? 'Loading your history...' : PRODUCT.problem || 'No takes yet. Film one with New, and its lesson lands here.')
      : !S.connected ? 'Loading the tests...' : S.dbProblem || (!S.db ? "This view cannot reach the test bench's storage, so there are no tests to show."
      : 'No tests yet. Start one with New test, and its lesson lands here.');
    if (S.dbProblem && ids.length) { $('tb-alert').textContent = S.dbProblem; $('tb-alert').hidden = false; } else $('tb-alert').hidden = true;
    $('tb-nav-n').textContent = ids.length ? String(ids.length) : '';
  }
  
  function toLibrary() {
    const was = S.ui.focus;
    S.ui.focus = null;
    renderJobs();
    const r = was && document.querySelector(`#tb-lib .tb-job[data-job="${was}"] .tb-lib-row`);
    if (r) r.focus({ preventScroll: true });
  }
  
  function renderStripProduct() {
    const h = PRODUCT.health, pulse = $('tb-pulse');
    const running = S.order.map((id) => S.jobs.get(id)).find((j) => j && j.status === 'running');
    const waiting = S.order.filter((id) => S.jobs.get(id).status === 'queued').length;
    const text = !h ? 'Connecting to the teacher...' : running ? `Analysing ${jobName(running)}${waiting ? `, ${waiting} waiting` : ''}`
      : waiting ? `${waiting} ${waiting === 1 ? 'take' : 'takes'} waiting` : 'Muse is ready';
    $('tb-worker').textContent = text;
    pulse.className = `tb-pulse${h ? (running ? ' busy' : ' on') : ''}`;
    $('tb-storage').textContent = '';
    $('tb-who').textContent = h && num(h.keepDays) ? `Your takes are kept on the server for ${h.keepDays} ${h.keepDays === 1 ? 'day' : 'days'}, then deleted.` : '';
    $('tb-strip').title = text;
  }
  function renderStrip() {
    if (PRODUCT) { renderStripProduct(); return; }
    const w = S.worker, pulse = $('tb-pulse');
    let text;
    if (!S.connected) text = "Connecting to this page's storage...";
    else if (!S.db) text = "This view cannot reach this page's storage.";
    else if (!w || !ms(w.seenAt)) text = 'the teacher has not checked in on this page yet. It does when a test or a question arrives.';
    else {
      const busy = typeof w.busy === 'string' && S.jobs.get(w.busy);
      text = `the teacher last checked in <span class="tb-ago" data-ago="${esc(w.seenAt)}"></span>${busy ? `, working on ${esc(jobName(busy))}` : ''}.`;
    }
    $('tb-worker').innerHTML = text;
    pulse.className = `tb-pulse${w && ms(w.seenAt) && Date.now() - ms(w.seenAt) < 15 * 60 * 1000 ? (typeof w.busy === 'string' && w.busy ? ' busy' : ' on') : ''}`;
    const u = S.usage;
    $('tb-storage').textContent = u && num(u.bytes) != null && num(u.maxBytes) ? `Storage: ${mb(u.bytes)} of ${u.maxBytes >= 1073741824 ? `${(u.maxBytes / 1073741824).toFixed(1)} GB` : mb(u.maxBytes)}, ${u.files} ${u.files === 1 ? 'file' : 'files'}` : '';
    $('tb-who').textContent = S.owner === false ? 'Read only: only the owner can start or delete tests' : 'Private: only you can start or delete tests';
    tickTimes($('tb-strip'));
    $('tb-strip').title = $('tb-worker').textContent;
  }
  function tickTimes(root = document) {
    for (const el of root.querySelectorAll('[data-ago]')) el.textContent = ago(el.dataset.ago) || 'not yet';
    for (const el of root.querySelectorAll('[data-ago-short]')) el.textContent = ago(el.dataset.agoShort).replace(' ago', '');
  }
  function renderAll() { renderForm(); renderStrip(); renderJobs(); renderBar(); }

  
  async function onList(e) {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const li = b.closest('[data-job]'), id = li && li.dataset.job, j = id && S.jobs.get(id);
    if (!j) return;
    const act = b.dataset.act;
    if (act === 'open') openMuse(id);
    else if (act === 'focus') { S.ui.focus = id; S.ui.focusFrom = 'history'; renderJobs(); window.scrollTo({ top: 0, behavior: 'auto' }); }
    else if (act === 'lib') {
      const k = `${id}:lib`;
      if (S.ui.libAll) { S.ui.libAll = false; prefs.set('tb-lib-all', null); for (const x of S.jobs.keys()) if (x !== id) S.ui.opened.delete(`${x}:lib`); S.ui.opened.add(k); }
      if (S.ui.opened.has(k)) S.ui.opened.delete(k); else S.ui.opened.add(k);
      renderJobs();
      const r = document.querySelector(`.tb-job[data-job="${id}"] ${b.classList.contains('tb-lib-more') ? '.tb-lib-more' : '.tb-lib-row'}`);
      if (r) r.focus({ preventScroll: true });
    }
    else if (act === 'del') { S.ui.confirm.add(id); S.ui.delErr.delete(id); renderJob(id); const y = li.querySelector('[data-act="del-yes"]'); if (y) y.focus(); }
    else if (act === 'del-no') { S.ui.confirm.delete(id); renderJob(id); const d = li.querySelector('[data-act="del"]'); if (d) d.focus(); }
    else if (act === 'del-yes') del(id);
    else if (act === 'rewake') {
      b.disabled = true;
      const w = await wake('job', id);
      await noteWake(`jobs/${id}`, w);
      S.ui.wakeMsg.set(id, w);
      renderJob(id);
    } else if (act === 'rewake-s') {
      b.disabled = true;
      const w = await wake('sample', id);
      await noteWake(`jobs/${id}`, w);
      renderJob(id);
    } else if (act === 'rewake-q') {
      const q = b.dataset.q;
      if (!MSG_ID.test(q)) return;
      b.disabled = true;
      const w = await wake('chat', `${id}/${q}`);
      await noteWake(`jobs/${id}/chat/${q}`, w);
      renderJob(id);
    }
  }
  async function del(id) {
    const j = S.jobs.get(id);
    if (!j || !S.db) return;
    S.ui.deleting.add(id); S.ui.delErr.delete(id); renderJob(id);
    let done = false, marked = false;
    try {
      await dbWrite(() => S.db.doc(`jobs/${id}`).update({ deleting: true }));   
      marked = true;
      const r = j.result || {}, ids = new Set([j.source && j.source.kind === 'asset' ? j.source.assetId : null, r.resultAsset, r.videoAsset,
        ...(j.source && j.source.kind === 'parts' && j.source.example !== true && Array.isArray(j.source.parts) ? j.source.parts.map((p) => p && p.assetId) : []),
        j.midi && j.midi.assetId, ...(Array.isArray(j.assets) ? j.assets : [])].filter((a) => assetOk(a) && !EX_IDS.has(a)));
      if (ids.size && !S.assets) throw { message: "this view cannot delete files from this page's storage; open the test bench as its owner" };
      for (const a of ids) await assetCall(() => S.assets.delete(a));          
      const chat = await S.db.collection(`jobs/${id}/chat`).get();
      for (const d of chat.docs) await dbWrite(() => S.db.doc(`jobs/${id}/chat/${d.id}`).delete());
      await dbWrite(() => S.db.doc(`jobs/${id}`).delete());
      const un = S.chatSubs.get(id);
      if (un) { un(); S.chatSubs.delete(id); }
      S.chats.delete(id); S.results.delete(id); delete window.__MV_VIDEO[id];
      formMsg(`Deleted ${jobName(j)}.`, 'ok');
      loadUsage();
      done = true;
    } catch (e) {
      
      
      const cur = S.jobs.get(id);
      if (marked && cur) cur.deleting = true;
      const why = explain(e);
      S.ui.delErr.set(id, `It was not fully deleted: ${why}${/[.!?]$/.test(why) ? '' : '.'} Press Finish deleting to try again.`);
    } finally {
      S.ui.deleting.delete(id); S.ui.confirm.delete(id);
      renderJob(id);
    }
    
    
    if (done) wake('delete', id).catch(() => null);
  }

  

  
  
  async function openMuse(id) {
    const j = S.jobs.get(id);
    if (!j || j.status !== 'done' || !j.result || !assetOk(j.result.resultAsset)) return;
    if (!window.TBMuse) { if (!PRODUCT) openTeacher(id); return; }      
    let res = null;
    try { res = await shimApi.result(id); } catch (e) { formMsg(PRODUCT ? (e && e.message) || explain(e) : explain(e), 'err'); return; }
    if (!res || !S.jobs.get(id)) return;
    if (PRODUCT) { openMuseProduct(id, S.jobs.get(id), res); return; }
    if (S.jobs.get(id) !== j) return;
    if (S.view === 'teacher') backToBench();
    S.open = id; S.view = 'muse';
    store.set('tb-open', id);
    followChats();
    $('tb').hidden = true;
    $('tb-teacher').hidden = true;
    wave(false);
    window.TBMuse.open({
      id, name: jobName(j), video: blobUrl(j.result.videoAsset), res, rows: S.chats.get(id) || [], muse: routeOf(j) === 'meta',
      
      voice: assetOk(j.result.voiceAsset) ? blobUrl(j.result.voiceAsset) : null,
      ask: (q) => shimApi.ask(id, q),
      back: () => showBench(),
      details: () => { window.TBMuse.close(); S.view = 'bench'; openTeacher(id); },
      
      retake: () => {
        const pid = res.lesson && res.lesson.piece && res.lesson.piece.id;
        showBench();
        const sel = $('tb-piece');
        if (pid && sel && [...sel.options].some((o) => o.value === pid)) sel.value = pid;
        const box = $('tb-up-box');
        if (box) { box.scrollIntoView({ block: 'center' }); box.classList.add('over'); setTimeout(() => box.classList.remove('over'), 1600); }
      },
    });
    document.title = `${jobName(j)} - Museverse`;
  }
  
  
  async function openMuseProduct(id, j, res) {
    const sample = !!j.sample;
    const [video, voice] = await Promise.all([PRODUCT.mediaUrl(id, 'video.mp4', res),
      !sample && res.voicePack && typeof res.voicePack === 'object' ? PRODUCT.mediaUrl(id, 'voice.mp4', res) : Promise.resolve(null)]);
    if (S.view === 'teacher') backToBench();
    S.open = id; S.view = 'muse';
    store.set('tb-open', id);
    $('tb').hidden = true;
    $('tb-teacher').hidden = true;
    wave(false);
    if (hasView08(res)) { openLesson08(id, j, res, video, voice); return; }
    window.TBMuse.open({
      id, name: jobName(j), video, res, rows: [], muse: true, voice, ask: null,
      score: (tile) => PRODUCT.scoreUrl(id, tile),
      back: () => showBench(),
      retake: () => {
        const pid = res.lesson && res.lesson.piece && res.lesson.piece.id;
        showBench();
        const sel = $('tb-piece');                       
        if (pid && sel && [...sel.options].some((o) => o.value === pid)) sel.value = pid;
        show('form', 'video');
        focusStep();
      },
    });
    document.title = `${titleOf(j)} - Museverse`;
  }
  
  
  
  
  
  
  const hasView08 = (res) => !!(window.MVMuse && res && res.lesson && res.lesson.view && typeof res.lesson.view === 'object'
    && Array.isArray(res.lesson.view.fixes) && Array.isArray(res.lesson.view.lines));
  
  
  function lessonRoot08(id, j, res, video) {
    if (window.TBMuse && typeof window.TBMuse.shell08 === 'function') {
      
      const pid = res.lesson && res.lesson.piece && typeof res.lesson.piece.id === 'string' ? res.lesson.piece.id : null;
      const cover = pid && CFG.covers && typeof CFG.covers[pid] === 'string' && /^covers\/[a-z0-9_-]+\.webp$/.test(CFG.covers[pid]) ? CFG.covers[pid] : null;
      
      
      return window.TBMuse.shell08({ id, name: jobName(j), res, video, cover, score: (tile) => PRODUCT.scoreUrl(id, tile), back: () => showBench(),
        pieceScore: PRODUCT.pieceScore }).player;
    }
    let r = document.getElementById('tb-v08');
    if (!r) { r = document.createElement('div'); r.id = 'tb-v08'; r.hidden = true; document.body.append(r); }
    return r;
  }
  function closeLesson08() {
    if (window.MVMuse && window.MVMuse.openId) { try { window.MVMuse.close(); } catch (e) { console.warn('MVMuse close:', e); } }
    if (window.TBMuse && typeof window.TBMuse.close08 === 'function') window.TBMuse.close08();
  }
  function openLesson08(id, j, res, video, voice) {
    if (window.TBMuse) window.TBMuse.close();
    const pid = res.lesson && res.lesson.piece && res.lesson.piece.id;
    try {
      window.MVMuse.open({
        root: lessonRoot08(id, j, res, video), id, name: jobName(j), video, voice, res, shell: true,
        models: PRODUCT.health && PRODUCT.health.modelTable && typeof PRODUCT.health.modelTable === 'object' ? PRODUCT.health.modelTable : null,
        tile: (tid) => PRODUCT.scoreUrl(id, tid),
        
        endChart: (r) => (window.TBMuse && typeof window.TBMuse.endView === 'function' ? window.TBMuse.endView(r, { portrait: portraitOf(r) }) : null),
        back: () => showBench(),
        retake: () => {
          showBench();
          const sel = $('tb-piece');                     
          if (pid && sel && [...sel.options].some((o) => o.value === pid)) sel.value = pid;
          show('form', 'video');
          focusStep();
        },
      });
      
      const lib = document.querySelector('#tb-v08 .mv2-lib');
      if (lib) {
        const w = lib.querySelector('.mv2-lib-t');
        if (w) w.textContent = 'History';
        lib.setAttribute('aria-label', 'Back to History');
      }
    } catch (e) {
      
      console.error('MVMuse.open:', e);
      closeLesson08();
      window.TBMuse.open({ id, name: jobName(j), video, res, rows: [], muse: true, voice, ask: null, score: (tile) => PRODUCT.scoreUrl(id, tile),
        back: () => showBench(), retake: () => { showBench(); show('form', 'video'); focusStep(); } });
    }
    document.title = `${titleOf(j)} - Museverse`;
  }
  function openTeacher(id) {
    const j = S.jobs.get(id);
    if (!j || j.status !== 'done' || !j.result || !assetOk(j.result.resultAsset)) return;
    S.open = id; S.view = 'teacher';
    store.set('tb-open', id);
    const v = PRODUCT ? null : blobUrl(j.result.videoAsset);       
    if (v) window.__MV_VIDEO[id] = v;
    followChats();
    $('tb').hidden = true;
    $('tb-teacher').hidden = false;
    wave(false);
    renderBar();
    window.scrollTo(0, 0);
    window.__MV_SEARCH = PRODUCT ? `${PRODUCT.search(id)}&view=details` : `?job=${id}`;
    window.dispatchEvent(new PopStateEvent('popstate'));
    addGlance(id);
  }
  
  
  async function addGlance(id) {
    if (!window.TBMuse || !window.TBMuse.statsFor) return;
    let res = null;
    try { res = await shimApi.result(id); } catch { return; }
    for (let k = 0; k < 80; k++) {
      if (!res || S.view !== 'teacher' || S.open !== id) return;
      const host = document.getElementById('r-meta'), pane = document.getElementById('v-results');
      if (host && pane && !pane.hidden) {
        document.querySelectorAll('#tb-teacher .tb-glance, #tb-teacher .tb-hc').forEach((n) => n.remove());
        const glance = window.TBMuse.statsFor(res);
        host.after(glance);
        
        const hc = window.TBMuse.handsFor ? window.TBMuse.handsFor(res) : null;
        if (hc) glance.after(hc);
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  function backToBench() {
    if (S.view !== 'teacher') return;
    window.__MV_SEARCH = '';
    window.dispatchEvent(new PopStateEvent('popstate'));   
    showBench();
  }
  function showBench() {
    if (S.view === 'bench') return;
    const id = S.open;
    if (window.TBMuse) window.TBMuse.close();
    closeLesson08();
    S.view = 'bench'; S.open = null;
    store.set('tb-open', null);
    $('tb-teacher').hidden = true;
    $('tb').hidden = false;
    wave(true);
    if (id) show('tests');
    document.title = TITLE;
    followChats();
    const li = id && document.querySelector(`.tb-job[data-job="${id}"]`);
    if (li) { li.scrollIntoView({ block: 'nearest' }); const b = li.querySelector('[data-act="open"]'); if (b) b.focus({ preventScroll: true }); }
  }
  
  window.__TB_HOME = () => { if (S.view === 'teacher') setTimeout(() => { showBench(); document.title = TITLE; }, 0); };
  function renderBar() {
    const id = S.open, j = id && S.jobs.get(id);
    if (!j) { $('tb-bar-wait').hidden = true; return; }
    $('tb-bar-name').textContent = jobName(j);
    const rows = S.chats.get(id) || [];
    const answered = new Set(rows.filter((r) => r.role === 'teacher').map((r) => r.replyTo));
    const waiting = rows.filter((r) => r.role === 'user' && r.status !== 'failed' && !answered.has(r.id));
    const el = $('tb-bar-wait');
    if (!waiting.length) {
      el.hidden = !S.barFlash;
      el.textContent = S.barFlash || '';
      return;
    }
    const q = waiting[waiting.length - 1], w = q.wake;
    const late = Date.now() - (ms((w && w.at) || q.at) || Date.now()) > NUDGE_MS;
    el.hidden = false;
    el.innerHTML = `Waiting for the teacher. ${w && w.ok ? `the teacher was notified at ${esc(clock(w.at))}.` : w ? 'the teacher could not be notified from this view.' : 'Notifying the teacher...'}`
      + (late || (w && !w.ok) ? ` If no answer comes, ${esc(TELL)} <button type="button" class="btn btn-sm" data-act="bar-rewake" data-q="${esc(q.id)}">Notify the teacher again</button>` : '');
  }
  async function onBar(e) {
    const b = e.target.closest('button[data-act="bar-rewake"]');
    if (!b || !S.open || !MSG_ID.test(b.dataset.q || '')) return;
    b.disabled = true;
    const w = await wake('chat', `${S.open}/${b.dataset.q}`);
    await noteWake(`jobs/${S.open}/chat/${b.dataset.q}`, w);
    renderBar();
  }

  

  function sanitizedSteps(j) {
    return (Array.isArray(j.steps) ? j.steps : []).filter((s) => s && typeof s === 'object').map((s) => ({
      id: str(s.id, 40), label: str(s.label, 120), state: STEP_STATES.includes(s.state) ? s.state : 'waiting', ms: num(s.ms), note: str(s.note, 300) || null,
    }));
  }
  function transcript(jobId) {
    const rows = S.chats.get(jobId) || [];
    const ans = new Map(rows.filter((r) => r.role === 'teacher').map((r) => [r.replyTo, r]));
    const turns = [];
    for (const q of rows) if (q.role === 'user' && ans.has(q.id)) turns.push({ role: 'user', text: str(q.text, MAX_Q) }, { role: 'teacher', text: str(ans.get(q.id).text, 2000) });
    const out = [];
    let chars = 0;
    for (let i = turns.length - 1; i >= 0 && out.length < HISTORY_TURNS; i--) {
      chars += turns[i].text.length;
      if (chars > HISTORY_CHARS) break;
      out.unshift(turns[i]);
    }
    return out;
  }
  function answerOf(row) {
    
    
    const moments = (Array.isArray(row.moments) ? row.moments : []).filter((m) => m && typeof m === 'object' && num(m.fromS) != null)
      .slice(0, 3).map((m) => ({ fromS: num(m.fromS), toS: num(m.toS) ?? num(m.fromS) + 3, at: str(m.at, 12) }));
    return { answer: str(row.text, 4000), source: /^[a-z][a-z-]{0,39}$/.test(str(row.source, 40)) ? row.source : 'unknown', model: str(row.model, 120) || null,
      findingIds: Array.isArray(row.findingIds) ? row.findingIds.filter((x) => typeof x === 'string').slice(0, 20) : [],
      lookups: Array.isArray(row.lookups) ? row.lookups.map((x) => str(x, 80)).filter(Boolean).slice(0, 6) : [],
      moments, author: str(row.author, 60) || null };
  }
  function settleAnswers(jobId) {
    const rows = S.chats.get(jobId) || [];
    for (const [msgId, p] of S.pending) {
      if (p.jobId !== jobId) continue;
      const a = rows.find((r) => r.role === 'teacher' && r.replyTo === msgId);
      const q = rows.find((r) => r.id === msgId);
      if (a) { S.pending.delete(msgId); p.resolve(answerOf(a)); } else if (q && q.status === 'failed') {
        S.pending.delete(msgId);
        p.reject({ status: 502, message: str(q.error, 300) || 'the teacher could not answer this question.' });
      }
    }
  }
  
  
  function benchWait() {
    const t = timing(), spf = t.samSPerFrame + t.keyboardSPerFrame, frames = Math.ceil(NORMAL_S * CFG.fps);
    const running = S.order.filter((id) => ['running', 'fetching'].includes(S.jobs.get(id).status));
    const queued = S.order.filter((id) => S.jobs.get(id).status === 'queued');
    const left = running.reduce((a, id) => a + (num(S.jobs.get(id).etaS) || 0), 0);
    const ahead = left + queued.reduce((a, id) => a + estimateS((S.jobs.get(id).options || {}).windowS || QUICK_S), 0);
    return { samBackend: 'meta', sPerFrame: Math.round(spf * 100) / 100, measured: t.measured ? 1 : 0, windowS: NORMAL_S, frames,
      jobS: Math.round(estimateS(NORMAL_S)), coldStartS: 0, queued: queued.length, running: running.length > 0, runningLeftS: Math.round(left),
      aheadS: Math.round(ahead), totalS: Math.round(ahead + estimateS(NORMAL_S)) };
  }
  const shimApi = {
    
    
    health(jobId) {
      const h = S.worker && S.worker.health && typeof S.worker.health === 'object' ? S.worker.health : {};
      
      const mi = h.metaOptIn && h.metaOptIn.meta === true ? h.metaOptIn : null;
      const route = jobId ? routeOf(S.jobs.get(jobId)) : null;
      const muse = route === 'meta' && !!mi;
      const chat = { hosted: muse, route: muse ? 'meta' : null };
      return {
        samBackend: str(h.samBackend, 80) || 'meta', voiceModel: str(h.voiceModel, 120) || 'fixed wording', transcriber: str(h.transcriber, 200) || 'piano transcription',
        stt: false, auth: false, queue: S.order.filter((id) => S.jobs.get(id).status === 'queued').length, keepDays: null,
        meta: { sam: true, muse, stt: false }, replicate: { sam: false }, adultRequired: true,
        chat: { ...chat, glimmer: false },
        openrouter: null, openWeights: { muse: false },
        
        framingTip: { available: false },
        voice: { realtime: false, file: false }, questDataOk: false, questDataOpenRouter: false, metaKey: 'none',
        library: CFG.library, windowS: NORMAL_S, wait: benchWait(),
        
        showDemos: false, samples: 0, judgeCode: false, judge: null,
      };
    },
    status(id) {
      const j = S.jobs.get(id);
      if (!j || j.deleting === true) return null;
      const st = j.status === 'done' ? 'done' : j.status === 'failed' ? 'failed' : j.status === 'queued' ? 'queued' : 'running';
      return { id, status: st, step: str(j.step, 120) || null, progress: num(j.progress) ?? (st === 'done' ? 1 : 0), steps: sanitizedSteps(j),
        error: str(j.error, 600) || null, etaS: num(j.etaS), name: jobName(j) };
    },
    async result(id) {
      if (PRODUCT) return PRODUCT.result(id);
      const j = S.jobs.get(id);
      const a = j && j.status === 'done' && j.result && assetOk(j.result.resultAsset) ? j.result.resultAsset : null;
      if (!a) return null;
      if (S.results.has(a)) return S.results.get(a);
      const r = await fetch(blobUrl(a));
      if (!r.ok) throw { status: 502, message: `The result file could not be loaded from this page (${r.status}).` };
      let res;
      try { res = await r.json(); } catch { throw { status: 502, message: 'The result file is not readable.' }; }
      if (!res || typeof res !== 'object' || Array.isArray(res)) throw { status: 502, message: 'The result file is not readable.' };
      delete res.trace;
      res.source = res.source || 'upload';
      res.stage = res.stage && typeof res.stage === 'object' ? res.stage : { kind: 'video' };
      
      res.policy = { dataOrigin: 'upload', hostedMuse: routeOf(j) === 'meta', openrouterMuse: false, openWeightsMuse: false };
      S.results.set(a, res);
      return res;
    },
    videoUrl(id) { const j = S.jobs.get(id); return j && j.result ? blobUrl(j.result.videoAsset) : null; },
    
    async plan(id) { const r = await shimApi.result(id); return r && r.plan && typeof r.plan === 'object' ? r.plan : null; },
    async ask(jobId, question) {
      const j = S.jobs.get(jobId);
      if (!S.db || !j || j.status !== 'done') throw { status: 404, message: 'This test is not on the bench any more.' };
      if (!S.writable) throw { status: 403, message: 'Only the owner of this test bench can ask questions here.' };
      const msgId = newMsgId(), text = question.slice(0, MAX_Q);
      const row = { role: 'user', text, at: iso(), by: S.userId, history: transcript(jobId), status: 'waiting' };
      try { await dbWrite(() => S.db.doc(`jobs/${jobId}/chat/${msgId}`).set(row)); } catch (e) { throw { status: 503, message: explain(e) }; }
      const answer = new Promise((resolve, reject) => S.pending.set(msgId, { jobId, resolve, reject }));
      S.barFlash = '';
      renderBar();
      wake('chat', `${jobId}/${msgId}`).then((w) => noteWake(`jobs/${jobId}/chat/${msgId}`, w)).then(renderBar);
      return answer;
    },
  };

  
  

  
  
  
  const STEPS = ['video'];
  const STEP_NAMES = { video: 'Your video' };
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  
  function portraitOf(res) {
    const L = res && res.lesson, ids = [L && L.piece && L.piece.id, L && L.view && L.view.piece && L.view.piece.id].filter(Boolean);
    const c = (CFG.pieceCards || []).find((x) => ids.some((id) => [x.id, ...(x.ids || [])].includes(id) || [x.id, ...(x.ids || [])].includes(`${id}-opening`)));
    return c && c.art ? c.art : null;
  }
  
  
  function renderHello() {
    const box = $('tb-pieces');
    if (!box) return;
    const lib = CFG.library || [], ids = new Set(lib.map((p) => p.id));
    
    const cards = (Array.isArray(CFG.pieceCards) && CFG.pieceCards.length
      ? CFG.pieceCards.map((c) => ({ ...c, id: (Array.isArray(c.ids) && c.ids.length ? c.ids : [c.id]).find((x) => !lib.length || ids.has(x)) })).filter((c) => c.id)
      : lib.map((p) => ({ id: p.id, who: p.title, what: '' })));
    const now = $('tb-piece').value;
    box.replaceChildren(...cards.map((c) => {
      const lab = document.createElement('label'), inp = document.createElement('input');
      lab.className = 'tb-pc'; lab.htmlFor = inp.id = `tb-pc-${c.id}`;
      inp.type = 'radio'; inp.name = 'tb-pc'; inp.value = c.id; inp.checked = c.id === now;
      inp.addEventListener('change', () => { helloMsg(''); $('tb-start-btn').disabled = false; });
      let art;
      if (c.art) { art = document.createElement('img'); art.className = 'tb-pc-art'; art.src = c.art; art.alt = c.alt || ''; art.decoding = 'async'; }
      else {
        art = document.createElement('span'); art.className = 'tb-pc-art tb-pc-art-none'; art.setAttribute('aria-hidden', 'true');
        art.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      }
      const t = document.createElement('span'); t.className = 'tb-pc-t';
      const b = document.createElement('b'); b.textContent = c.who || '';
      const w = document.createElement('span'); w.textContent = c.what || '';
      t.append(b, w);
      lab.append(inp, art, t);
      return lab;
    }));
    
    $('tb-start-btn').disabled = !box.querySelector('input[name="tb-pc"]:checked');
  }
  function helloMsg(t) { const m = $('tb-hello-msg'); if (m) { m.textContent = t || ''; m.className = t ? 'tb-msg err' : 'tb-msg'; } }
  
  function startHello() {
    const r = document.querySelector('#tb-pieces input[name="tb-pc"]:checked');
    if (!r) { helloMsg('Choose the piece you are playing.'); const f = document.querySelector('#tb-pieces input[name="tb-pc"]'); if (f) f.focus({ preventScroll: true }); return; }
    helloMsg('');
    const sel = $('tb-piece');
    if (![...sel.options].some((o) => o.value === r.value)) { const o = document.createElement('option'); o.value = r.value; o.textContent = r.value; sel.appendChild(o); }
    if (S.example && exampleNow() && exampleNow().pieceId !== r.value) pick(null);   
    sel.value = r.value;
    renderExample();
    show('form', 'video');
    focusStep();
  }
  function show(view, step) {
    if (!['hello', 'form', 'tests'].includes(view)) view = 'hello';
    
    if (view === 'form' && PRODUCT && !$('tb-piece').value) view = 'hello';
    if (view === 'hello') renderHello();
    S.ui.view = view;
    $('tb').dataset.on = view;                       
    if (view === 'form' && STEPS.includes(step)) S.ui.step = step;
    store.set('tb-view', view === 'form' ? null : view);
    for (const v of document.querySelectorAll('#tb [data-view]')) v.hidden = v.dataset.view !== view;
    for (const p of document.querySelectorAll('#tb-form [data-step]')) p.hidden = p.dataset.step !== S.ui.step;
    $('tb-to-tests').setAttribute('aria-current', view === 'tests' ? 'page' : 'false');
    
    $('tb-new-btn').hidden = view === 'hello' || view === 'form';
    renderNav();
    if (view !== 'form' && $('tb-msg').classList.contains('err')) formMsg('');
    
    
    
    if (view === 'tests' && anim.job && !$('tb-anim').getAttribute('src')) $('tb-anim').setAttribute('src', $('tb-anim').dataset.src);
    animSend(false);
    requestAnimationFrame(fitRun);
  }
  function renderNav() {
    const i = STEPS.indexOf(S.ui.step);
    [...$('tb-dots').children].forEach((li, k) => { li.className = k < i ? 'done' : k === i ? 'now' : ''; });
    $('tb-stepno').textContent = S.ui.view === 'form' ? `Step ${i + 1} of ${STEPS.length}: ${STEP_NAMES[S.ui.step]}` : '';
    const last = S.ui.step === STEPS[STEPS.length - 1];
    $('tb-dots').hidden = STEPS.length < 2;
    $('tb-next').hidden = last;
    $('tb-go').hidden = !last;
    if (last) renderSummary();
  }
  
  function renderSummary() {
    const route = modelRoute();
    const piece = $('tb-piece').value && CFG.library.find((p) => p.id === $('tb-piece').value);
    const chips = [
      srcKind() === 'drive' ? 'Drive link' : S.example && exampleNow() ? 'The example' : S.picked ? cleanName(S.picked.name) : null,
      piece && piece.title, S.midi ? 'MIDI' : null,
      route === 'meta' && !museDown() ? 'Muse Spark + Muse Wonder' : 'Fixed lines',
    ].filter(Boolean);
    $('tb-sum').innerHTML = chips.map((c) => `<li>${esc(c)}</li>`).join('');
  }
  
  async function stepProblem(step) {
    if (step === 'video') {
      if (srcKind() === 'asset' && S.example && exampleNow()) {
        
      } else if (srcKind() === 'asset') {
        const c = checkFile(S.picked);
        if (!c.ok) return { text: c.error, tips: c.tips, el: 'tb-file' };
        if (S.connected && !S.assets) return { text: 'Uploading is not available in this view. Paste a drive link instead.', el: 'tb-src-drive' };
      } else {
        const d = driveFile($('tb-drive').value);
        if (d.error) return { text: d.error, el: 'tb-drive' };
      }
      const st = parseStart($('tb-start').value);
      if (st.error) return { text: st.error, el: 'tb-start' };
      if (S.midi) {                                
        const c = await checkMidi(S.midi);
        if (c.error) return { text: c.error, el: 'tb-midi' };
      }
    }
    return null;
  }
  function focusStep() {
    const p = document.querySelector(`#tb-form [data-step="${S.ui.step}"]`);
    const h = p && p.querySelector('h2');
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' });
  }
  async function next() {
    const step = S.ui.step, problem = await stepProblem(step);
    if (S.ui.step !== step) return;
    if (problem) { formMsg(problem.text, 'err', problem.tips); at(problem.el); return; }
    formMsg('');
    show('form', STEPS[STEPS.indexOf(step) + 1] || STEPS[STEPS.length - 1]);
    focusStep();
  }
  function prev() {
    const i = STEPS.indexOf(S.ui.step);
    formMsg('');
    if (i > 0) { show('form', STEPS[i - 1]); focusStep(); } else show('hello');
  }
  
  function reveal(target) {
    const el = typeof target === 'string' ? (document.getElementById(target) || document.querySelector(target)) : target;
    const v = el && el.closest('[data-view]');
    if (!v) return null;
    
    const p = el.closest('[data-step]') || (el.id === 'tb-go' ? document.querySelector(`#tb-form [data-step="${STEPS[STEPS.length - 1]}"]`) : null);
    if (el.closest('#tb-terms-full')) { $('tb-terms-full').hidden = false; $('tb-terms-open').setAttribute('aria-expanded', 'true'); }
    if (S.ui.view !== v.dataset.view || (p && p.dataset.step !== S.ui.step)) show(v.dataset.view, p && p.dataset.step);
    const d = el.closest('details');
    if (d && !d.open && !el.matches('summary')) d.open = true;
    return el;
  }
  function at(id) {
    const el = reveal(id);
    if (!el) return;
    
    const f = el.matches('input[type="file"]') ? document.querySelector(`label[for="${el.id}"]`) : el;
    if (f) { if (!f.matches('input, select, button, a, textarea')) f.tabIndex = -1; f.focus(); }
  }
  
  function wave(on) {
    const w = window.TBWave;
    if (w) { if (on) w.play(); else w.pause(); }
    animSend(false);
  }
  window.TBSteps = { show, next, prev, reveal, get view() { return S.ui.view; }, get step() { return S.ui.step; } };

  
  if (!PRODUCT) window.__TB_HEALTH = (target) => Promise.resolve(shimApi.health(target && target.kind === 'job' ? target.id : null));

  
  
  async function productInit() {
    const back = $('tb-back');
    if (back && back.dataset.word) back.lastChild.textContent = back.dataset.word;
    const sh = $('tb-start-hint');
    if (sh) sh.textContent = `Leave it empty and the teacher finds the best ${lenWords(lenS())} of a longer video itself.`;
    const h = await PRODUCT.healthReady;
    if (!h) return;
    
    const sam = String(h.samBackend || (h.wait && h.wait.samBackend) || '');
    const on = { meta: !!(h.meta && (h.meta.sam || h.meta.muse)), voice: !!(h.voiceOut && h.voiceOut.on),
      samMeta: /^meta/.test(sam), samReplicate: /^replicate/.test(sam), samHere: /^local/.test(sam) };
    for (const el of document.querySelectorAll('#tb [data-if]')) el.hidden = !on[el.dataset.if];
    for (const el of document.querySelectorAll('.tb-keep-days')) el.textContent = num(h.keepDays) ? String(h.keepDays) : 'a few';
    
    {
      CFG.library = (Array.isArray(h.library) ? h.library : []).filter((p) => p && typeof p.id === 'string').map((p) => ({ id: p.id, title: str(p.title, 120) || p.id, kind: p.kind }));
      const sel = $('tb-piece'), was = sel.value;
      sel.replaceChildren(sel.options[0]);
      for (const p of CFG.library) {
        const o = document.createElement('option');
        o.value = p.id; o.textContent = `${p.title}${p.kind === 'exercise' ? ' (exercise)' : ''}`;
        sel.appendChild(o);
      }
      if ([...sel.options].some((o) => o.value === was)) sel.value = was;
    }
    renderHello();
    renderAll();
  }

  

  function wire() {
    for (const id of ['tb-src-up', 'tb-src-drive']) $(id).addEventListener('change', () => { formMsg(''); renderForm(); });
    $('tb-start').addEventListener('input', renderEstimates);
    $('tb-file').addEventListener('change', (e) => pick(e.target.files && e.target.files[0]));
    $('tb-ex-use').addEventListener('click', () => { if (!S.busy) useExample(!S.example); });
    $('tb-midi').addEventListener('change', (e) => pickMidi(e.target.files && e.target.files[0]));
    $('tb-midi-clear').addEventListener('click', () => { $('tb-midi').value = ''; pickMidi(null); $('tb-midi').focus(); });
    $('tb-midi-max').textContent = kb(CFG.midiMaxBytes);
    
    for (const ul of [$('tb-list'), $('tb-lib')]) ul.addEventListener('input', onSampleInput);
    for (const ul of [$('tb-list'), $('tb-lib')]) ul.addEventListener('change', onSampleInput);
    for (const ul of [$('tb-list'), $('tb-lib')]) ul.addEventListener('submit', (e) => {
      const f = e.target.closest && e.target.closest('form[data-sample]');
      if (!f) return;
      e.preventDefault();
      offerSample(f.dataset.sample);
    });
    const drop = $('tb-up-box');
    let depth = 0;
    drop.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.classList.remove('over'); } });
    drop.addEventListener('dragover', (e) => e.preventDefault());
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      depth = 0; drop.classList.remove('over');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && !S.busy) pick(f);
    });
    $('tb-form').addEventListener('submit', submit);
    
    document.getElementById('tb').addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-go]');
      if (!b) return;
      const to = b.dataset.go;
      formMsg('');
      if (to === 'tests') {
        if (S.ui.view === 'tests' && S.ui.focus) toLibrary();          
        else { S.ui.focus = null; show(S.ui.view === 'tests' ? 'hello' : 'tests'); renderJobs(); }
      }
      else if (to === 'hello') { S.ui.focus = null; show('hello'); window.scrollTo({ top: 0, behavior: 'auto' }); }
      else { show('form', to); focusStep(); }
    });
    $('tb-start-btn').addEventListener('click', startHello);
    
    
    $('tb-home').addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      formMsg(''); S.ui.focus = null; show('hello'); window.scrollTo({ top: 0, behavior: 'auto' });
    });
    $('tb-next').addEventListener('click', next);
    
    $('tb-terms-open').addEventListener('click', (e) => {
      e.preventDefault();
      const box = $('tb-terms-full'), open = box.hidden;
      box.hidden = !open;
      $('tb-terms-open').setAttribute('aria-expanded', String(open));
    });
    $('tb-prev').addEventListener('click', prev);
    $('tb-piece').addEventListener('change', renderNav);
    
    $('tb-lib-all').addEventListener('click', () => {
      S.ui.libAll = !S.ui.libAll;
      prefs.set('tb-lib-all', S.ui.libAll ? '1' : null);
      if (!S.ui.libAll) for (const x of S.jobs.keys()) S.ui.opened.delete(`${x}:lib`);
      renderJobs();
    });
    
    window.addEventListener('message', (e) => {
      const f = $('tb-anim');
      if (f && e.source === f.contentWindow && e.data && e.data.mvCalibReady) { $('tb-now').classList.add('ready'); animSend(true); }
    });
    $('tb-anim').addEventListener('load', () => {
      
      let href = ''; try { href = $('tb-anim').contentWindow.location.href; } catch { href = ''; }
      piano.loadedAt = /calibration\.html/.test(href) ? Date.now() : 0;
      animSend(true); setTimeout(() => $('tb-now').classList.add('ready'), 6000);
    });
    setInterval(pianoHealth, 1000);
    
    setTimeout(warmPiano, 1500);
    document.addEventListener('visibilitychange', () => animSend(false));
    for (const ul of [$('tb-list'), $('tb-lib'), $('tb-run-top')]) ul.addEventListener('click', onList);
    $('tb-run-back').addEventListener('click', toLibrary);
    $('tb-run-top').addEventListener('click', onUpload, true);
    window.addEventListener('resize', fitRun);
    for (const ul of [$('tb-list'), $('tb-lib')]) ul.addEventListener('toggle', (e) => {
      const d = e.target.closest && e.target.closest('details[data-d]');
      if (!d) return;
      if (d.open) S.ui.opened.add(d.dataset.d); else S.ui.opened.delete(d.dataset.d);
    }, true);
    $('tb-back').addEventListener('click', backToBench);
    $('tb-bar-wait').addEventListener('click', onBar);
    const sel = $('tb-piece');
    for (const p of CFG.library) {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = `${p.title}${p.kind === 'exercise' ? ' (exercise)' : ''}`;
      sel.appendChild(o);
    }
    
    setInterval(() => { tickTimes(); for (const id of S.order) renderJob(id); renderBar(); }, 20000);
  }

  document.title = TITLE;
  wire();
  if (PRODUCT) productInit().catch((e) => console.error('product page:', e));
  if (PRODUCT) $('tb-ok').checked = true;            
  pick(null);
  show(store.get('tb-view') === 'tests' ? 'tests' : 'hello');
  renderAll();
  connect().catch((e) => {
    console.error('test bench:', e);
    S.connected = true; S.dbProblem = `The test bench could not start: ${explain(e)}`;
    renderAll();
  });
})();
