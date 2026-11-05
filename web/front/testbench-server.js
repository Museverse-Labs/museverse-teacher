


















(() => {
  'use strict';
  const API = new URL('api/', location.href);
  const TOKEN_KEY = 'museverse-teacher-token', CODE_KEY = 'museverse-teacher-code', JOBKEYS_KEY = 'museverse-teacher-job-keys';
  const JOB_ID = /^[0-9a-f]{32}$/, SAMPLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const SAMPLE_PREFIX = 's-';                     
  const FAST_MS = 3000, SLOW_MS = 30000;          
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { if (v == null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {   } },
  };
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v, n = 400) => (typeof v === 'string' ? v.slice(0, n) : '');
  const iso = (s) => (num(s) ? new Date(s * 1000).toISOString() : null);

  
  const token = () => ls.get(TOKEN_KEY) || '';
  const code = () => ls.get(CODE_KEY) || '';
  function jobKeys() { try { const m = JSON.parse(ls.get(JOBKEYS_KEY) || '{}'); return m && typeof m === 'object' ? m : {}; } catch { return {}; } }
  function keepJobKey(id, k) {
    if (!id || !k) return;
    const m = jobKeys();
    m[id] = k;
    const ids = Object.keys(m);
    for (const old of ids.slice(0, Math.max(0, ids.length - 50))) delete m[old];
    ls.set(JOBKEYS_KEY, JSON.stringify(m));
  }
  function headersFor(path) {
    const h = {};
    if (token()) h.Authorization = `Bearer ${token()}`;
    if (code()) h['X-Teacher-Code'] = code();
    const m = String(path).match(/^jobs\/([0-9a-f]{32})(?:\/|$)/);
    if (m && typeof jobKeys()[m[1]] === 'string') h['X-Teacher-Job-Key'] = jobKeys()[m[1]];
    return h;
  }
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; this.code = status === 401 ? 'needs_access' : null; } }
  async function errorOf(r) {
    let b = null;
    try { b = await r.json(); } catch {   }
    const m = b && (typeof b.detail === 'string' ? b.detail : typeof b.error === 'string' ? b.error : '');
    return new ApiError(r.status, m ? m[0].toUpperCase() + m.slice(1) : `The server answered ${r.status}.`);
  }
  
  let asking = null;
  function askAccess(why) {
    if (asking) return asking;
    asking = new Promise((resolve) => {
      const dlg = document.getElementById('token-dlg'), input = document.getElementById('token-in');
      const codes = !!(health && health.judgeCode);
      const finish = (v) => { asking = null; resolve(v); };
      if (!dlg || typeof dlg.showModal !== 'function' || !input) {
        finish((window.prompt(codes ? 'Judge code or access token' : 'Access token') || '').trim());
        return;
      }
      const t = (id, s) => { const e = document.getElementById(id); if (e) e.textContent = s; };
      t('token-h', codes ? 'Judge code' : 'Access token');
      t('token-msg', why || (codes ? 'Type the judge code from the submission, or the access token.' : 'This server needs an access token.'));
      t('token-lbl', codes ? 'Judge code or token' : 'Token');
      t('token-ok', 'Continue');
      input.value = '';
      dlg.returnValue = '';
      
      
      if (dlg.parentElement !== document.body) document.body.appendChild(dlg);
      dlg.addEventListener('close', () => finish(dlg.returnValue === 'ok' ? input.value.trim() : ''), { once: true });
      dlg.showModal();
      input.focus();
    });
    return asking;
  }
  
  
  async function keepAccess(v) {
    if (!v) return false;
    if (health && health.judgeCode) {
      try { const r = await fetch(new URL('code', API), { headers: { 'X-Teacher-Code': v } }); if (r.ok) { ls.set(CODE_KEY, v); return true; } } catch {   }
    }
    try {
      const r = await fetch(new URL(`jobs/${'0'.repeat(32)}`, API), { headers: { Authorization: `Bearer ${v}` } });
      if (r.status === 404) { ls.set(TOKEN_KEY, v); return true; }
    } catch {   }
    return false;
  }
  
  async function call(path, opts = {}, ask = true) {
    for (let tries = 0; ; tries++) {
      let r;
      try { r = await fetch(new URL(path, API), { ...opts, headers: { ...headersFor(path), ...(opts.headers || {}) } }); } catch {
        throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
      }
      if (r.status === 401 && ask && tries < 2) {
        const v = await askAccess(tries ? 'That was not accepted. Please check it and try again.' : null);
        if (!v) throw new ApiError(401, 'A judge code or an access token is needed for this.');
        await keepAccess(v);
        continue;
      }
      if (!r.ok) throw await errorOf(r);
      return r;
    }
  }
  const json = async (path, opts, ask) => (await call(path, opts, ask)).json();

  
  let health = null;
  const healthReady = fetch(new URL('health', API)).then((r) => (r.ok ? r.json() : null)).then((h) => { health = h; tell('worker'); return h; }).catch(() => null);
  
  
  function workerRow() {
    if (!health) return null;
    const w = health.wait && typeof health.wait === 'object' ? health.wait : {};
    const spf = num(w.sPerFrame), frames = num(w.frames), job = num(w.jobS);
    const timing = spf && spf > 0 ? { samSPerFrame: spf, keyboardSPerFrame: 0.001, fixedS: Math.max(1, job != null && frames ? job - frames * spf : 60) } : null;
    const busy = [...rows.values()].find((j) => j.status === 'running');
    return { seenAt: new Date().toISOString(), busy: busy ? busy.id : null, health: { ...health, metaOptIn: { meta: !!(health.meta && health.meta.muse) } },
      ...(timing ? { timing } : {}), rateSource: w.measured ? 'measured on this server' : "the server's estimate", product: true };
  }

  
  const rows = new Map();                         
  let listProblem = '', listNeedsAccess = false;
  
  
  
  
  
  function plainError(e) {
    const t = str(e, 600);
    if (!t) return null;
    if (!/^[A-Za-z_][\w.]*(?:Error|Exception|Exit|Interrupt)\b/.test(t)) return t;
    console.warn('TBServer: the take stopped on the server:', t);
    return 'The analysis stopped on the server before it finished. Try the take again.';
  }
  function jobRow(j) {
    const st = j.status === 'refused' ? 'failed' : ['queued', 'running', 'done', 'failed'].includes(j.status) ? j.status : 'queued';
    const L = j.lesson && typeof j.lesson === 'object' ? j.lesson : null;
    const row = {
      id: j.id, v: 1, status: st, backend: 'meta', product: true,
      source: { kind: 'asset', name: str(j.name, 200) || 'Your video', sizeBytes: null, durationS: num(L && L.durationS) ?? num(j.analysedS) },
      options: { windowS: num(j.windowS) || num(j.analysedS) || 60, startS: num(j.startS), piece: str(j.piece, 80) || null },
      createdAt: iso(j.created), finishedAt: iso(j.finished), updatedAt: new Date().toISOString(),
      step: str(j.step, 120) || null, progress: num(j.progress), etaS: num(j.etaS), steps: Array.isArray(j.steps) ? j.steps : [],
      error: j.refusal && j.refusal.message ? str(j.refusal.message, 600) : plainError(j.error),
      queue: num(j.ahead) != null ? { ahead: j.ahead, startS: num(j.startS), jobS: num(j.jobS) } : null,
      consent: { agreed: true, footage: 'own', adult: true, metaMuse: true },
    };
    if (st === 'done') {
      row.result = { resultAsset: j.id, videoAsset: j.id, analysedS: num(j.analysedS), piece: L && L.piece ? L.piece : null,
        toWorkOn: L && Array.isArray(L.toWorkOn) ? L.toWorkOn : null, findings: L ? num(L.findings) : null };
    }
    return row;
  }
  function sampleRow(s) {
    const id = SAMPLE_PREFIX + s.id;
    return {
      id, v: 1, status: 'done', sample: s.id, product: true, backend: 'meta',
      source: { kind: 'asset', name: str(s.title, 200) || 'Sample lesson', durationS: num(s.durationS) },
      options: { windowS: 60, piece: null }, createdAt: s.recorded ? `${s.recorded}T12:00:00Z` : null, finishedAt: s.recorded ? `${s.recorded}T12:00:00Z` : null,
      steps: [], consent: { agreed: true, footage: 'own', adult: true, metaMuse: true },
      result: { resultAsset: s.id, videoAsset: s.id, piece: { title: str(s.piece, 120) || str(s.title, 120) }, findings: num(s.findings),
        toWorkOn: null, sampleOf: str(s.player, 80) },
    };
  }
  let samples = [], samplesAt = 0;
  const mine = new Map();                         
  
  
  
  function exampleOf(pieceId) {
    const s = pieceId ? samples.find((x) => x.pieceId === pieceId) : samples.find((x) => x.default === true) || samples[0];
    if (!s) return null;
    let thumb = null;
    const t = typeof s.thumbnail === 'string' ? s.thumbnail : typeof s.poster === 'string' ? s.poster : null;
    if (t) { try { const u = new URL(t, API); if (u.origin === location.origin && !/["'()\\\s]/.test(u.href)) thumb = u.href; } catch { thumb = null; } }
    return { id: s.id, title: str(s.title, 120) || str(s.piece, 120) || 'Sample performance', piece: str(s.piece, 120) || str(s.title, 120),
      durationS: num(s.durationS), sizeBytes: num(s.sizeBytes), thumb, video: new URL(`samples/${s.id}/media/video.mp4`, API).href,
      
      pieceId: typeof s.pieceId === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(s.pieceId) ? s.pieceId : null };
  }
  async function loadSamples() {
    if (Date.now() - samplesAt < 5 * 60 * 1000) return;
    samplesAt = Date.now();
    try {
      const list = await json('samples', {}, false);
      samples = (Array.isArray(list) ? list : []).filter((s) => s && typeof s.id === 'string' && SAMPLE_ID.test(s.id)).slice(0, 30);
    } catch { samples = []; }
  }
  let polling = 0;
  async function poll() {
    clearTimeout(polling);
    await healthReady;
    await loadSamples();
    let list = null;
    try {
      list = await json('jobs', {}, false);
      listProblem = ''; listNeedsAccess = false;
    } catch (e) {
      listNeedsAccess = e && e.status === 401;
      
      listProblem = listNeedsAccess ? '' : (e && e.message) || 'Your history could not be loaded.';
    }
    const next = new Map();
    for (const j of Array.isArray(list) ? list : []) if (j && JOB_ID.test(String(j.id))) next.set(j.id, jobRow(j));
    
    
    for (const [id, m] of mine) {
      if (next.has(id)) { mine.delete(id); continue; }
      try { const st = await json(`jobs/${id}`, {}, false); next.set(id, jobRow({ ...st, id, name: st.name || m.name, created: m.created })); } catch {   }
    }
    for (const s of samples) next.set(SAMPLE_PREFIX + s.id, sampleRow(s));
    rows.clear();
    for (const [k, v] of next) rows.set(k, v);
    tell('jobs');
    tell('worker');
    const live = [...rows.values()].some((j) => j.status === 'queued' || j.status === 'running');
    polling = setTimeout(poll, document.hidden ? SLOW_MS : live ? FAST_MS : SLOW_MS);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  
  const subs = { jobs: new Set(), worker: new Set() };
  function tell(which) {
    for (const s of subs[which]) {
      try {
        if (which === 'jobs') s.cb(snapshot());
        else { const w = workerRow(); s.cb({ exists: !!w, data: () => w }); }
      } catch (e) { console.error('TBServer:', e); }
    }
  }
  function snapshot() {
    const docs = [...rows.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map((r) => ({ id: r.id, data: () => r }));
    return { docs, size: docs.length, empty: !docs.length };
  }
  const refuse = () => Promise.reject(Object.assign(new Error('This page keeps nothing itself: the server does.'), { code: 'invalid_argument' }));
  const query = (path) => {
    const q = {
      orderBy: () => q, limit: () => q, where: () => q,
      onSnapshot(cb, err) {
        if (path === 'jobs') {
          const s = { cb, err };
          subs.jobs.add(s);
          if (rows.size) cb(snapshot()); else poll();
          return () => subs.jobs.delete(s);
        }
        cb({ docs: [], size: 0, empty: true });                       
        return () => {};
      },
      get: async () => ({ docs: [], size: 0, empty: true }),
    };
    return q;
  };
  const db = {
    collection: (path) => query(String(path)),
    doc: (path) => ({
      onSnapshot(cb) {
        if (path !== 'bench/worker') { cb({ exists: false, data: () => null }); return () => {}; }
        const s = { cb };
        subs.worker.add(s);
        const w = workerRow();
        cb({ exists: !!w, data: () => w });
        return () => subs.worker.delete(s);
      },
      update: async () => ({}),                                       
      set: refuse, delete: refuse,
      get: async () => ({ exists: false, data: () => null }),
    }),
  };
  const assets = { list: async () => ({ usage: null }), upload: refuse, delete: async () => ({ deleted: false }) };
  const user = { isOwner: async () => true, id: async () => null };
  window.runtime = { use: (name) => Promise.resolve(({ db, assets, user })[name] || null) };

  
  const sampleOf = (id) => (typeof id === 'string' && id.startsWith(SAMPLE_PREFIX) ? id.slice(SAMPLE_PREFIX.length) : null);
  const base = (id) => (sampleOf(id) ? `samples/${sampleOf(id)}` : `jobs/${id}`);
  
  function told(h) {
    return JSON.stringify({ meta: h.meta || {}, replicate: h.replicate || {}, openrouter: h.openrouter || {},
      ...(h.openWeights ? { openWeights: h.openWeights } : {}), ...(h.framingTip ? { framingTip: h.framingTip } : {}),
      ...(h.voiceOut ? { voiceOut: h.voiceOut } : {}) });
  }
  
  const HEALTH_WAIT_MS = 8000, STALL_MS = 60000;
  const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
  async function healthNow() {
    if (health) return health;
    const h = await within(healthReady, HEALTH_WAIT_MS);
    if (h) return h;
    try {
      const r = await within(fetch(new URL('health', API)), HEALTH_WAIT_MS);
      if (r && r.ok) { health = await r.json(); tell('worker'); }
    } catch {   }
    return health;
  }
  
  async function create({ file = null, sample = null, name = null, piece = null, startText = null, windowS = null, onProgress = null }) {
    
    const h = await healthNow();
    if (!h) throw new ApiError(0, 'The server did not answer. Check your connection and try again.');
    const form = () => {
      const f = new FormData();
      if (sample) f.append('sample', sample);
      else f.append('video', file, file.name || 'take.mp4');
      if (piece) f.append('piece', piece);
      if (startText) f.append('start', startText);
      if (windowS && Array.isArray(h.windows) && h.windows.includes(windowS)) f.append('windowS', String(windowS));
      f.append('consent', 'yes');
      f.append('adult', 'yes');                                       
      f.append('told', told(h));
      return f;
    };
    
    if (sample && !SAMPLE_ID.test(String(sample))) throw new ApiError(0, 'That sample performance is not offered here.');
    if (h.auth && !token() && !code() && !sample) {                   
      const v = await askAccess(h.judgeCode ? 'Type the judge code from the submission to film your own take, or open a sample lesson in History.' : null);
      if (!v || !(await keepAccess(v))) throw new ApiError(401, 'A judge code or an access token is needed to add a take.');
    }
    const send = () => new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', new URL('jobs', API));
      for (const [k, v] of Object.entries(headersFor('jobs'))) x.setRequestHeader(k, v);
      
      let last = Date.now();
      const watch = setInterval(() => { if (Date.now() - last > STALL_MS) { clearInterval(watch); x.abort(); } }, 2000);
      x.upload.onprogress = (e) => { last = Date.now(); if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total); };
      x.upload.onload = () => clearInterval(watch);                    
      x.onloadend = () => clearInterval(watch);
      x.onabort = () => reject(new ApiError(0, 'The upload stopped moving: the connection may have dropped. Try again.'));
      x.ontimeout = () => reject(new ApiError(0, 'The server took too long to answer. Try again.'));
      x.onload = () => {
        let b = null;
        try { b = JSON.parse(x.responseText); } catch {   }
        if (x.status >= 200 && x.status < 300 && b && JOB_ID.test(String(b.id))) resolve(b);
        else reject(new ApiError(x.status, (b && typeof b.detail === 'string' ? b.detail[0].toUpperCase() + b.detail.slice(1) : '') || `The server answered ${x.status}.`));
      };
      x.onerror = () => reject(new ApiError(0, 'The upload did not reach the server. Check your connection and try again.'));
      x.send(form());
    });
    let got;
    try { got = await send(); } catch (e) {
      if (e.status !== 401) throw e;
      const v = await askAccess('That was not accepted. Please check it and try again.');
      if (!v || !(await keepAccess(v))) throw e;
      got = await send();
    }
    keepJobKey(got.id, got.key);
    mine.set(got.id, { name: str(name, 200) || (file && file.name) || 'Sample performance', created: Date.now() / 1000 });
    poll();
    return { id: got.id };
  }
  const results = new Map();
  async function result(id) {
    if (results.has(id)) return results.get(id);
    const r = await json(`${base(id)}/result`);
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new ApiError(502, 'The lesson could not be read.');
    results.set(id, r);
    return r;
  }
  
  
  async function mediaUrl(id, name, res) {
    const path = `${base(id)}/media/${name}`;
    const k = res && res.media && typeof res.media.videoKey === 'string' ? res.media.videoKey : null;
    if (sampleOf(id) || (health && !health.auth)) return new URL(path, API).href;
    if (k) return `${new URL(path, API).href}?k=${encodeURIComponent(k)}`;
    try { return URL.createObjectURL(await (await call(path, {}, true)).blob()); } catch { return null; }
  }
  
  async function scoreUrl(id, tile) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(tile))) return null;
    const path = `${base(id)}/score/${tile}`;
    if (sampleOf(id) || (health && !health.auth)) return new URL(path, API).href;
    try { return URL.createObjectURL(await (await call(path, {}, false)).blob()); } catch { return null; }
  }
  
  
  const pieceScore = (piece, file) => (/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(piece)) && /^(?:score-geom\.json|tile-\d{2,3}\.webp)$/.test(String(file))
    ? new URL(`pieces/${piece}/score/${file}`, API).href : null);
  
  const search = (id) => (sampleOf(id) ? `?sample=${sampleOf(id)}` : `?job=${id}`);

  window.TBServer = {
    product: true, healthReady, get health() { return health; }, get problem() { return listProblem; }, get needsAccess() { return listNeedsAccess; },
    get example() { return exampleOf(); },
    exampleFor: (pieceId) => exampleOf(pieceId),
    create, result, mediaUrl, scoreUrl, pieceScore, search, sampleOf, refresh: poll, ApiError,
  };
  
  window.__MV_VIDEO = {};
})();
