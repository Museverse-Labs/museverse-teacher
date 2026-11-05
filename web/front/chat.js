



























































(() => {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const mmss = (s) => { s = Math.max(0, Math.round(+s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const HERE = (document.currentScript && document.currentScript.src) || location.href;

  const RATE = 24000;             
  const FRAME_MS = 80;            
  const PREROLL = 5;              
  const ONSET_FRAMES = 2;         
  const END_SILENCE_MS = 900;     
  const MAX_TURN_MS = 20000;      
  const IDLE_STOP_MS = 60000;     
  const FINAL_WAIT_MS = 15000;    
  const GUARD_MS = 350;           
  const MIN_ON = 0.008, MIN_OFF = 0.005;   
  const MAX_FLOOR = 0.03;         
  const NO_WORDS_STOP = 3;        
  const HISTORY_TURNS = 8, HISTORY_CHARS = 4000;   
  const MAX_Q = 500;
  const CONSENT_KEY = 'museverse-teacher-voice-consent';

  const WHO = { muse: 'Muse Spark (Meta)', openrouter: 'Muse Spark (Meta) via OpenRouter', 'openrouter-glimmer': 'Muse Glimmer via OpenRouter',
    open: 'Muse Spark Open (open weights)', glimmer: 'Muse Glimmer (our server)', fixed: 'Fixed answers' };
  const HEARD = { realtime: "heard by Meta's speech-to-text", file: "heard by Meta's speech-to-text", browser: "heard by your browser's speech recognition" };
  const META_VOICE = "Your voice goes to Meta's speech-to-text (Muse Voice Transcribe), which turns it into words for your teacher. "
    + 'This server does not keep the recording. Meta keeps its copy under its own terms. Only for people 18 or older.';
  const BROWSER_VOICE = "The mic uses your browser's own speech recognition, which may send your voice to the browser's maker.";
  
  const SUGGEST = ['What should I practise first?', 'What did I do well?', 'How do I practise it?'];
  const NEED_TOKEN = 'This server needs an access token. Ask the person who runs it for one.';
  const BAD_TOKEN = 'That access token was not accepted. Please check it and try again.';
  const ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  const ICON_STOP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  const ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
  const ICON_SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const ICON_MUTED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
  
  const micFace = (on) => `<span class="ring" aria-hidden="true">${on ? ICON_STOP : ICON_MIC}</span><span class="lbl" aria-hidden="true">${on ? 'Stop' : 'Talk'}</span>`;

  
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {   } },
  };
  let browserSrOk = false;        
  let consentMem = null;          
  let speechPrimed = false;       

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canMic = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const canWorklet = () => !!(canMic() && window.AudioWorkletNode && (window.AudioContext || window.webkitAudioContext));
  const canRecord = () => !!(canMic() && window.MediaRecorder);

  
  const sentences = (t) => (String(t || '').match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) || []).map((s) => s.trim()).filter(Boolean);

  
  function windowed(history) {
    const h = history.slice(-HISTORY_TURNS);
    let n = h.reduce((a, t) => a + t.text.length, 0);
    while (h.length && n > HISTORY_CHARS) n -= h.shift().text.length;
    return h;
  }

  
  function wavBlob(frames, rate) {
    const n = frames.reduce((a, f) => a + f.byteLength, 0), buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n, true);
    let o = 44;
    for (const f of frames) { new Uint8Array(buf, o, f.byteLength).set(new Uint8Array(f)); o += f.byteLength; }
    return new Blob([buf], { type: 'audio/wav' });
  }

  
  
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  function ownSpeak(text) {
    return new Promise((resolve) => {
      const readMs = 900 + text.split(/\s+/).length * 380;
      let done = false, started = false, t1 = 0;
      const finish = (said = true) => { if (!done) { done = true; clearTimeout(t1); clearTimeout(t2); resolve(said); } };
      const t2 = setTimeout(finish, readMs * 2.5 + 5000);             
      if (!synth) { setTimeout(finish, readMs); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = document.documentElement.lang || 'en';
      u.onstart = () => { started = true; };
      u.onend = () => (started ? finish() : setTimeout(finish, readMs));
      u.onerror = (e) => finish(!(e && (e.error === 'interrupted' || e.error === 'canceled')));
      t1 = setTimeout(() => { if (!started) { u.onend = u.onerror = null; synth.cancel(); setTimeout(finish, readMs); } }, 2500);
      synth.speak(u);
    });
  }
  
  
  function primeSpeech() {
    if (speechPrimed || !synth) return;
    speechPrimed = true;
    if (synth.speaking || synth.pending) return;                     
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch {   }
  }

  
  const CSS = `
/* single-column tracks are minmax(0, 1fr): an auto track grows to the text box's intrinsic width.
   The root is a size container, so the wide layout follows the panel's width, not the window's. */
.mvc { display: grid; gap: 18px; min-width: 0; grid-template-columns: minmax(0, 1fr); container-type: inline-size; }
.mvc .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* the conversation: the teacher on the left, the player on the right */
.mvc-log { list-style: none; margin: 0; padding: 2px; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); max-height: min(30rem, 70vh); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.mvc-log:empty { display: none; }
.mvc-msg { position: relative; display: grid; gap: 8px; max-width: min(88%, 40rem); padding: 12px 16px; border-radius: 20px; overflow-wrap: anywhere; font-size: 16px; line-height: 1.55; }
.mvc-msg.teacher { justify-self: start; border-bottom-left-radius: 6px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--line, rgba(255, 255, 255, 0.08)); }
.mvc-msg.you { justify-self: end; border-bottom-right-radius: 6px; background: rgba(168, 85, 247, 0.18); border: 1px solid rgba(168, 85, 247, 0.3); }
.mvc-msg .txt { color: var(--fg, #F3F4F6); }
.mvc-msg .txt [data-s] { border-radius: 4px; -webkit-box-decoration-break: clone; box-decoration-break: clone; transition: background-color 0.2s ease; }
.mvc-msg .txt .now { background: rgba(236, 72, 153, 0.2); }
.mvc-msg .err { color: #FCA5A5; }
/* who answered: said to a screen reader on every answer, shown only once the answers came from more than one */
.mvc-msg .who, .mvc-mixed .mvc-msg.teacher .who .lead { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.mvc-mixed .mvc-msg.teacher .who { position: static; width: auto; height: auto; margin: 0; overflow: visible; clip: auto; white-space: normal; font-size: 12px; font-weight: 600; line-height: 1.3; letter-spacing: 0.02em; color: var(--muted, #9CA3AF); }
.mvc-msg .heard { display: flex; align-items: center; gap: 6px; font-size: 13px; line-height: 1.4; color: var(--body, #D1D5DB); }
.mvc-msg .heard svg { width: 14px; height: 14px; flex: none; opacity: 0.8; }
.mvc-msg .links { display: flex; flex-wrap: wrap; gap: 8px; }
.mvc .mvc-seek { min-height: 40px; padding: 6px 16px 6px 6px; gap: 10px; font-size: 14px; white-space: normal; text-align: left; }
.mvc-seek .play { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; flex: none; background: rgba(168, 85, 247, 0.2); color: var(--lilac, #E9D5FF); }
.mvc .mvc-seek .play svg { width: 12px; height: 12px; margin-left: 2px; }
.mvc-seek .t { color: var(--muted, #9CA3AF); font-weight: 500; font-variant-numeric: tabular-nums; }
/* who wrote a model's answer, and what it looked up in the take: small, under the answer */
.mvc-by { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0; font-size: 12px; line-height: 1.4; color: var(--muted, #9CA3AF); }
.mvc-by .by { font-weight: 600; }
.mvc-fb { margin: 0; font-size: 12px; line-height: 1.4; color: var(--muted, #9CA3AF); }
.mvc-mixed .mvc-by .by { display: none; }   /* the answer's own header names its author then */
.mvc-by .looked { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.mvc-slow { font-size: 13px; color: var(--muted, #9CA3AF); }
.mvc-lk { display: inline-block; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line-2, rgba(255, 255, 255, 0.12)); color: var(--body, #D1D5DB); }
/* the teacher is thinking: three dots (still when motion is reduced) */
.mvc-dots { display: inline-flex; align-items: center; gap: 5px; height: 1.55em; }
.mvc-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted, #9CA3AF); opacity: 0.4; animation: mvc-dot 1.2s ease-in-out infinite; }
.mvc-dots i:nth-child(2) { animation-delay: 0.15s; }
.mvc-dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes mvc-dot { 0%, 60%, 100% { opacity: 0.4; transform: none; } 30% { opacity: 1; transform: translateY(-3px); } }
/* the words of a spoken question as they come in: the player's next message, still being written */
.mvc-caption { justify-self: end; max-width: min(88%, 40rem); margin: 0; padding: 10px 16px; border-radius: 20px; border-bottom-right-radius: 6px; border: 1px dashed rgba(192, 132, 252, 0.5); color: var(--body, #D1D5DB); font-style: italic; overflow-wrap: anywhere; }

/* asking: the suggested questions, the text box, and the big round Talk button */
.mvc-ctl { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr); }
.mvc-suggest { display: flex; flex-wrap: wrap; gap: 8px; }
.mvc .mvc-chip { min-height: 40px; padding: 8px 16px; font-size: 14px; font-weight: 500; white-space: normal; text-align: left; color: var(--body, #D1D5DB); background: transparent; }
.mvc .mvc-chip:hover { color: var(--fg, #F3F4F6); background: rgba(255, 255, 255, 0.05); }
.mvc-form { display: flex; align-items: center; gap: 6px; min-height: 54px; padding: 4px; border-radius: 999px; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--line-2, rgba(255, 255, 255, 0.12)); transition: border-color 0.2s ease; }
.mvc-form:focus-within { border-color: rgba(192, 132, 252, 0.5); }
.mvc .mvc-form input[type="text"] { flex: 1 1 auto; min-width: 0; min-height: 44px; padding: 10px 14px; border: 0; border-radius: 999px; background: transparent; }
.mvc .mvc-send { width: 44px; min-height: 44px; padding: 0; flex: none; }
.mvc .mvc-voice { width: 44px; min-height: 44px; padding: 0; flex: none; border-color: transparent; background: transparent; color: var(--fg, #F3F4F6); }
.mvc .mvc-voice svg { width: 22px; height: 22px; }
.mvc .mvc-voice[aria-pressed="false"] { color: var(--muted, #9CA3AF); }
.mvc .mvc-send svg { width: 20px; height: 20px; }
@supports selector(:has(a)) {
  /* the ring goes round the whole box, not the field inside it; the send button lights up once there is a question */
  .mvc .mvc-form input[type="text"]:focus-visible { outline: none; }
  .mvc-form:has(input:focus-visible) { outline: 2px solid var(--grad-a, #C084FC); outline-offset: 2px; }
  .mvc-form:has(input:not(:placeholder-shown)) .mvc-send:not([disabled]) { background: #FFFFFF; color: var(--ground, #1A1918); border-color: transparent; }
}
.mvc-talk { display: grid; justify-items: center; gap: 10px; text-align: center; padding-top: 6px; }
.mvc-nomic .mvc-talk { display: none; }
.mvc-mic { display: grid; justify-items: center; gap: 8px; padding: 0; margin: 0; border: 0; background: none; color: var(--fg, #F3F4F6); font: 600 15px/1.2 var(--font, inherit); cursor: pointer; -webkit-tap-highlight-color: transparent; }
.mvc-mic .ring { width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; background: #FFFFFF; color: var(--ground, #1A1918); transition: background-color 0.2s ease, transform 0.15s ease; }
.mvc-mic .ring svg { width: 30px; height: 30px; }
.mvc-mic:hover .ring { background: #E5E7EB; }
.mvc-mic:active .ring { transform: scale(0.96); }
.mvc-mic:focus-visible { outline: none; }
.mvc-mic:focus-visible .ring { outline: 2px solid var(--grad-a, #C084FC); outline-offset: 4px; }
.mvc-mic[aria-pressed="true"] .ring { background: var(--pink, #EC4899); color: #FFFFFF; }
.mvc-mic[aria-pressed="true"] .ring svg { width: 24px; height: 24px; }
/* the mic is open: a soft ring breathes round the button (a still ring when motion is reduced) */
.mvc[data-talk="listening"] .mvc-mic .ring, .mvc[data-talk="hearing"] .mvc-mic .ring { animation: mvc-breathe 1.8s ease-out infinite; }
@keyframes mvc-breathe { 0% { box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.45); } 100% { box-shadow: 0 0 0 18px rgba(236, 72, 153, 0); } }
.mvc-hint { max-width: 22rem; font-size: 14px; line-height: 1.5; color: var(--muted, #9CA3AF); }
.mvc-live:not([hidden]) ~ .mvc-hint { display: none; }
.mvc-live { display: grid; justify-items: center; gap: 10px; max-width: 26rem; }
.mvc-live-line { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px 10px; }
.mvc-meter { width: 48px; height: 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.1); overflow: hidden; flex: none; }
.mvc-meter > span { display: block; height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, var(--grad-a, #C084FC), var(--grad-b, #F472B6)); }
.mvc-state { min-width: 0; font-size: 15px; line-height: 1.45; color: var(--fg, #F3F4F6); }
.mvc-live .mvc-btns { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.mvc-live .mvc-btns:not(:has(> :not([hidden]))) { display: none; }
@container (min-width: 600px) {
  /* wide: the text box and the questions on the left, the Talk button beside them */
  .mvc-ctl { grid-template-columns: minmax(0, 1fr) 14rem; column-gap: 32px; align-items: center; }
  .mvc-ctl > .mvc-suggest, .mvc-ctl > .mvc-form { grid-column: 1; }
  .mvc-ctl > .mvc-talk { grid-column: 2; grid-row: 1 / span 2; padding-top: 0; }
  .mvc-nomic .mvc-ctl { grid-template-columns: minmax(0, 1fr); }
}

/* the voice agreements, inline and plain */
.mvc-panel { display: grid; gap: 12px; padding: 18px 20px; border-radius: 16px; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--line-2, rgba(255, 255, 255, 0.12)); }
.mvc-panel .ttl { font-size: 16px; font-weight: 700; color: var(--fg, #F3F4F6); }
.mvc-panel .why { font-size: 15px; line-height: 1.55; color: var(--body, #D1D5DB); }
.mvc-panel .checks { display: grid; gap: 2px; }
.mvc .mvc-panel .check { display: flex; gap: 12px; align-items: flex-start; min-height: 44px; padding: 10px 0; color: var(--fg, #F3F4F6); }
.mvc .mvc-panel .check input { width: 22px; height: 22px; margin: 0; accent-color: var(--purple, #A855F7); flex: none; }
.mvc-panel .acts { display: flex; flex-wrap: wrap; gap: 10px; }

/* under it all: what just happened, who answered, and where questions go */
.mvc-foot { display: grid; gap: 6px; }
.mvc-foot .mvc-note { font-size: 14px; line-height: 1.5; color: var(--body, #D1D5DB); }
.mvc-foot .fine { font-size: 13px; line-height: 1.5; color: var(--muted, #9CA3AF); }
.mvc-foot .mvc-age { display: flex; gap: 10px; align-items: center; min-height: 44px; color: var(--fg, #F3F4F6); }
.mvc-foot .mvc-age[hidden] { display: none; }
.mvc-foot .mvc-age input { width: 20px; height: 20px; margin: 0; accent-color: var(--purple, #A855F7); flex: none; }
@media (pointer: coarse) { .mvc .mvc-chip, .mvc .mvc-seek { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) {
  .mvc-dots i { animation: none; opacity: 0.7; }
  .mvc[data-talk="listening"] .mvc-mic .ring, .mvc[data-talk="hearing"] .mvc-mic .ring { animation: none; box-shadow: 0 0 0 6px rgba(236, 72, 153, 0.28); }
  .mvc-mic .ring, .mvc-msg .txt [data-s], .mvc-form { transition: none; }
}
`;
  function addStyle() {
    if (document.getElementById('mvc-style')) return;
    const s = document.createElement('style');
    s.id = 'mvc-style';
    s.textContent = CSS;
    document.head.prepend(s);           
  }

  let seq = 0;

  

  function mount(el, opts = {}) {
    if (!el || !opts.target || !opts.target.kind || !opts.target.id) throw new Error('MVChat.mount needs an element and a target {kind, id}');
    addStyle();
    const uid = `mvc${++seq}`;
    const target = { kind: opts.target.kind, id: String(opts.target.id) };
    const base = typeof opts.api === 'function' || !opts.api ? new URL('api/', location.href) : new URL(String(opts.api).replace(/\/?$/, '/'), location.href);
    const pageFetch = typeof opts.api === 'function' ? opts.api : null;
    const speak = typeof opts.speak === 'function' ? opts.speak : ownSpeak;
    let tokenNow = opts.token;
    let result = opts.result || null;
    let health = null;
    let destroyed = false;

    const root = document.createElement('div');
    root.className = 'mvc';
    root.innerHTML = `
      <ol class="mvc-log" id="${uid}-log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Your conversation with the teacher"></ol>
      <p class="mvc-caption" id="${uid}-cap" hidden></p>
      <div class="mvc-ctl">
        <div class="mvc-suggest" id="${uid}-sug" role="group" aria-label="Suggested questions">${SUGGEST.map((q) => `<button type="button" class="btn mvc-chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <form class="mvc-form" id="${uid}-form" autocomplete="off">
          <button type="button" class="btn icon-btn mvc-voice" id="${uid}-spk" aria-pressed="true" hidden></button>
          <label for="${uid}-in" class="sr-only">Your question for the teacher</label>
          <input type="text" id="${uid}-in" maxlength="${MAX_Q}" placeholder="Type a question">
          <button type="submit" class="btn icon-btn mvc-send" id="${uid}-go" aria-label="Ask" title="Ask">${ICON_SEND}</button>
        </form>
        <div class="mvc-talk">
          <button type="button" class="mvc-mic" id="${uid}-mic" aria-pressed="false" aria-label="Talk to your teacher" title="Talk to your teacher" hidden>${micFace(false)}</button>
          <div class="mvc-live" id="${uid}-live" hidden>
            <p class="mvc-live-line"><span class="mvc-meter" aria-hidden="true"><span></span></span><span class="mvc-state" id="${uid}-state" role="status"></span></p>
            <div class="mvc-btns">
              <button type="button" class="btn btn-sm" data-act="done" hidden>Done talking</button>
              <button type="button" class="btn btn-sm" data-act="skip" hidden>Skip the answer</button>
            </div>
          </div>
          <p class="mvc-hint">Tap to talk. I answer when you pause.</p>
        </div>
      </div>
      <div class="mvc-panel" id="${uid}-consent" role="group" aria-labelledby="${uid}-ch" hidden>
        <p class="ttl" id="${uid}-ch">Before you talk</p>
        <p class="why" id="${uid}-cwhy"></p>
        <div class="checks">
          <label class="check"><input type="checkbox" id="${uid}-adult"><span>I am 18 or older.</span></label>
          <label class="check"><input type="checkbox" id="${uid}-voice"><span>I agree that my voice goes to Meta's speech-to-text.</span></label>
        </div>
        <p class="msg err" id="${uid}-cerr" role="alert" hidden></p>
        <div class="acts">
          <button type="button" class="btn btn-primary" data-act="agree">Start talking</button>
          <button type="button" class="btn" data-act="cancel">Not now</button>
        </div>
      </div>
      <div class="mvc-panel" id="${uid}-sr" role="group" aria-labelledby="${uid}-sh" hidden>
        <p class="ttl" id="${uid}-sh">Use your browser's speech recognition?</p>
        <p class="why">${esc(BROWSER_VOICE)}</p>
        <div class="acts">
          <button type="button" class="btn btn-primary" data-act="sr-ok">Use it and start talking</button>
          <button type="button" class="btn" data-act="cancel">Not now</button>
        </div>
      </div>
      <div class="mvc-foot">
        <p class="mvc-note" id="${uid}-note" aria-live="polite"></p>
        <label class="fine mvc-age" id="${uid}-age" hidden><input type="checkbox" id="${uid}-age-in"><span id="${uid}-age-t">I am 18 or older.</span></label>
        <p class="fine" id="${uid}-who"></p>
        <p class="fine" id="${uid}-forget" hidden>Your spoken questions go to Meta's speech-to-text. <button type="button" class="linkbtn" data-act="forget">Forget my agreement</button></p>
      </div>`;
    el.appendChild(root);
    const $ = (s) => root.querySelector(`#${uid}-${s}`);
    const logEl = $('log'), liveEl = $('live'), stateEl = $('state'), capEl = $('cap'), micEl = $('mic'), inEl = $('in'), goEl = $('go');
    const meterEl = liveEl.querySelector('.mvc-meter > span');
    const doneBtn = liveEl.querySelector('[data-act="done"]'), skipBtn = liveEl.querySelector('[data-act="skip"]');

    

    class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
    const tokenValue = () => (typeof tokenNow === 'function' ? tokenNow() : tokenNow) || '';
    function errorFrom(body, status) {
      const m = body && (body.error || (typeof body.detail === 'string' ? body.detail : null));
      if (m) return cap(String(m));
      return ({ 0: 'Could not reach the server. Check your connection and try again.', 404: 'Not found.', 413: 'That is too long.' })[status]
        || `The server answered ${status}.`;
    }
    async function call(path, { method = 'GET', json, body, type } = {}) {
      for (let tries = 0; ; tries++) {
        const headers = new Headers();
        if (json !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(json); } else if (type) headers.set('Content-Type', type);
        let r;
        try {
          if (pageFetch) r = await pageFetch(path, { method, headers, body });
          else {
            const tk = tokenValue();
            if (tk) headers.set('Authorization', `Bearer ${tk}`);
            const cd = typeof opts.code === 'function' ? opts.code() : opts.code;   
            if (cd) headers.set('X-Teacher-Code', cd);
            const jk = typeof opts.jobKey === 'function' ? opts.jobKey() : opts.jobKey;   
            if (jk) headers.set('X-Teacher-Job-Key', jk);
            r = await fetch(new URL(path, base), { method, headers, body });
          }
        } catch (e) {
          if (e && typeof e.status === 'number') throw new ApiError(e.status, e.message);   
          throw new ApiError(0, errorFrom(null, 0));
        }
        if (r.status === 401 && !pageFetch && tries < 3 && typeof opts.askToken === 'function') {
          
          try { const t = await opts.askToken(tokenValue() ? BAD_TOKEN : NEED_TOKEN, { codeHere: target.kind === 'job' }); if (t && typeof tokenNow !== 'function') tokenNow = t; } catch (e) { throw new ApiError(401, (e && e.message) || NEED_TOKEN); }
          continue;
        }
        if (!r.ok) {
          let b = null;
          try { b = await r.json(); } catch {   }
          throw new ApiError(r.status, r.status === 401 ? NEED_TOKEN : errorFrom(b, r.status));
        }
        return r.json();
      }
    }

    

    const history = [];
    let busy = false, askSeq = 0, speakSeq = 0, saying = false, sayRuns = 0;
    let holds = 0, ownCall = false;     
    function note(t) { $('note').textContent = t || ''; }
    const scrollEnd = () => { logEl.scrollTop = logEl.scrollHeight; };

    
    function addYou(text, how) {
      const li = document.createElement('li');
      li.className = 'mvc-msg you';
      li.innerHTML = `<span class="who">You</span><p class="txt">${esc(text)}</p>`
        + (how ? `<p class="heard">${ICON_MIC}<span>Spoken, ${esc(HEARD[how])}</span></p>` : '');
      logEl.appendChild(li); scrollEnd();
    }
    function addTeacher() {
      const li = document.createElement('li');
      li.className = 'mvc-msg teacher';
      li.setAttribute('aria-busy', 'true');
      li.innerHTML = '<span class="who">Teacher</span><p class="txt"><span class="mvc-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">Thinking...</span></p>';
      logEl.appendChild(li); scrollEnd();
      return li;
    }
    const findings = () => (result && Array.isArray(result.findings) ? result.findings : []);
    
    const clip = () => { const v = +(result && result.media && result.media.clipStartS); return Number.isFinite(v) && v > 0 ? v : 0; };
    
    
    const answered = [];
    
    function modelName() {
      const h = health || {}, c = h.chat || {}, ori = h.openrouter || {};
      if (!c.hosted) return c.glimmer ? 'Muse Glimmer' : 'The model';
      if (c.route === 'open') return (h.openWeights || {}).family || 'Muse Spark Open';
      return c.route === 'openrouter' && /glimmer/i.test(ori.model || '') ? 'Muse Glimmer' : 'Muse Spark';
    }
    
    const FALLBACK = {
      unavailable: (m) => `${m} could not answer just now, so this is our fixed answer.`,
      busy: (m) => `${m} was busy with other questions, so this is our fixed answer.`,
      rejected: (m) => `${m}'s answer did not pass our checks against what the analysis found, so this is our fixed answer.`,
    };
    function fillTeacher(li, res) {
      
      const who = res.source === 'open' && typeof res.author === 'string' && res.author ? res.author : WHO[res.source] || 'The teacher';
      const parts = sentences(res.answer);
      const fs = findings();
      const links = typeof opts.onSeek === 'function'
        ? [...new Set(res.findingIds || [])].map((id) => [id, fs.findIndex((f) => f.id === id)]).filter(([, i]) => i >= 0) : [];
      
      const moments = typeof opts.onMoment === 'function' ? (Array.isArray(res.moments) ? res.moments : [])
        .filter((m) => m && Number.isFinite(+m.fromS)).slice(0, 3) : [];
      const looked = (Array.isArray(res.lookups) ? res.lookups : []).filter((x) => typeof x === 'string' && x).slice(0, 6);
      const by = res.author && res.source !== 'fixed' ? `Answered by ${res.author}${res.source === 'openrouter' ? ' via OpenRouter' : ''}` : '';
      li.innerHTML = `<span class="who"><span class="lead">Your teacher, answered by </span><span title="${esc(res.model ? `Model: ${res.model}` : who)}">${esc(who)}</span></span>`
        + `<p class="txt">${parts.map((s, i) => `<span data-s="${i}">${esc(s)}</span>`).join(' ') || esc(res.answer || '')}</p>`
        + (links.length || moments.length ? `<div class="links">${links.map(([, i]) => {
          const f = fs[i], when = f.fromS != null ? ` <span class="t">${esc(mmss(+f.fromS + clip()))}</span>` : '';
          return `<button type="button" class="btn btn-sm mvc-seek" data-act="seek" data-i="${i}"><span class="play" aria-hidden="true">${ICON_PLAY}</span>`
            + `<span><span class="sr-only">Play the moment: </span>${esc(f.title || 'the finding')}${when}</span></button>`;
        }).join('')}${moments.map((m) => `<button type="button" class="btn btn-sm mvc-seek" data-act="moment" data-a="${+m.fromS}" data-b="${Number.isFinite(+m.toS) ? +m.toS : +m.fromS + 3}">`
          + `<span class="play" aria-hidden="true">${ICON_PLAY}</span><span><span class="sr-only">Play the moment </span><span class="t">${esc(mmss(+m.fromS + clip()))}</span></span></button>`).join('')}</div>` : '')
        
        
        + (by || looked.length ? `<p class="mvc-by">${by ? `<span class="by" aria-hidden="true">${esc(by)}</span>` : ''}${looked.length
          ? `<span class="looked"><span class="lk">Looked up:</span> ${looked.map((x) => `<span class="mvc-lk">${esc(x)}</span>`).join(' ')}</span>` : ''}</p>` : '')
        
        + (res.source === 'fixed' && FALLBACK[res.fallback] ? `<p class="mvc-fb">${esc(FALLBACK[res.fallback](modelName()))}</p>` : '');
      li.removeAttribute('aria-busy');
      if (!answered.includes(who)) answered.push(who);
      root.classList.toggle('mvc-mixed', answered.length > 1);
      whoLine();
      scrollEnd();
      return parts;
    }
    function failTeacher(li, msg) {
      li.removeAttribute('aria-busy');
      li.innerHTML = `<span class="who">Teacher</span><p class="txt err">No answer: ${esc(msg)}</p>`;
      scrollEnd();
    }
    
    function stopVoice(force = false) {
      if (!saying && !force) return;
      speakSeq++;
      if (typeof opts.stopSpeaking === 'function') { try { opts.stopSpeaking(); } catch {   } } else if (speak === ownSpeak && synth) synth.cancel();
    }

    
    
    async function sayAnswer(li, parts) {
      const my = ++speakSeq, run = ++sayRuns;
      if (live(conv)) {
        const st = conv.state;
        if (st === 'listening' || st === 'hearing' || st === 'waiting') abandonTurn(conv);
        setState('speaking');
      }
      saying = true;
      try {
        for (let i = 0; i < parts.length; i++) {
          if (my !== speakSeq || destroyed) break;
          const s = li.querySelector(`[data-s="${i}"]`);
          if (s) s.classList.add('now');
          let said, p;
          ownCall = true;                              
          try { p = speak(parts[i]); } catch { p = null; } finally { ownCall = false; }
          try { said = await p; } catch {   }
          if (s) s.classList.remove('now');
          if (said === false) break;                    
        }
      } finally {
        if (run === sayRuns) {
          saying = false;
          if (live(conv) && conv.state === 'speaking') listen(conv);
        }
      }
    }

    
    
    
    async function ask(q, how = null) {
      q = String(q || '').trim().slice(0, MAX_Q);
      if (!q) { inEl.focus(); return false; }
      if (destroyed) return false;
      if (busy) { note('Still thinking about the last question; ask again in a moment.'); return false; }
      const mine = ++askSeq, c = conv;
      stopVoice();
      busy = true; goEl.disabled = true;
      if (c && !how) abandonTurn(c);
      addYou(q, how);
      const li = addTeacher();
      
      const slow = setTimeout(() => {
        const t = li.getAttribute('aria-busy') === 'true' && li.querySelector('.txt');
        if (t && !t.querySelector('.mvc-slow')) t.insertAdjacentHTML('beforeend', ' <span class="mvc-slow">Looking it up in your take...</span>');
      }, 3000);
      if (c) setState('thinking');
      const cid = consentId();
      let parts = null;
      try {
        const body = { target, history: windowed(history), question: q };
        if (cid) body.consentId = cid;                  
        if (target.kind === 'sample' && $('age-in').checked) body.adult = true;   
        const res = await call('chat', { method: 'POST', json: body });
        if (destroyed) return false;
        history.push({ role: 'user', text: q }, { role: 'teacher', text: String(res.answer || '') });
        parts = fillTeacher(li, res);
      } catch (e) {
        if (!destroyed) failTeacher(li, e.message);
      } finally {
        clearTimeout(slow);
        busy = false; goEl.disabled = false;
      }
      
      
      if (parts && mine === askSeq && (!c || live(c))) await sayAnswer(li, parts);
      if (mine === askSeq && live(c) && c.state === 'thinking') listen(c);
      return !!parts;
    }

    

    
    const broken = { realtime: false, file: false, browser: false };
    let noKey = false;        
    let mode = 'none';
    function pickMode() {
      const h = health, v = (h && h.voice) || {};
      const key = !noKey && !(h && h.stt === false);
      if (key && !broken.realtime && canWorklet() && window.WebSocket && v.realtime !== false) return 'realtime';
      if (key && !broken.file && (canWorklet() || (canRecord() && v.file !== false))) return 'file';
      if (SR && !broken.browser) return 'browser';
      return 'none';
    }
    const metaMode = (m) => m === 'realtime' || m === 'file';
    function micUi() {
      micEl.hidden = mode === 'none' && !conv;
      const on = !!conv;
      micEl.setAttribute('aria-pressed', on ? 'true' : 'false');
      const label = on ? 'Stop the conversation' : mode === 'browser' ? "Talk to your teacher (your browser's speech recognition)" : 'Talk to your teacher';
      micEl.setAttribute('aria-label', label);
      micEl.title = label;
      micEl.innerHTML = micFace(on);
      root.classList.toggle('mvc-nomic', micEl.hidden);   
      $('forget').hidden = !(metaMode(mode) && consentId());
      whoLine();                                        
    }
    function setMode(m) { mode = m; micUi(); }

    
    
    function whoLine() {
      const h = health, n = answered.length;
      const by = !n ? '' : `Who answered: ${n > 1 ? `${answered.slice(0, -1).join(', ')} and ${answered[n - 1]} (each answer says which)` : answered[0]}.`;
      if (!h || !h.chat) { $('who').textContent = by; return; }
      
      
      const quest = !!(result && (result.source === 'quest' || (result.policy && result.policy.dataOrigin === 'quest')));
      
      
      
      const or = h.chat.route === 'openrouter', ori = h.openrouter || {}, ow = h.chat.route === 'open' ? (h.openWeights || {}) : null;
      
      const could = !!(h.chat.hosted && result && result.policy && result.policy[ow ? 'openWeightsMuse' : or ? 'openrouterMuse' : 'hostedMuse'] === true
        && (!quest || (!ow && consentId() && !(or && ori.uploadsOnly))));
      const ageGate = could && target.kind === 'sample' && !!h.auth && !tokenValue();
      $('age').hidden = !ageGate;
      if (ageGate) $('age-t').textContent = `I am 18 or older: let ${ow ? `Muse Spark Open (open weights, served by ${ow.host === 'openrouter' ? 'OpenRouter' : ow.host === 'custom' ? 'our own model server' : ow.hostName || 'its host'})` : or ? `${/glimmer/i.test(ori.model || '') ? 'Muse Glimmer' : 'Muse Spark'} via OpenRouter` : "Meta's Muse Spark"} answer my typed questions.`;
      const hosted = could && (!ageGate || $('age-in').checked);
      const orTo = (ori.providers || ['Meta']).join(' or ');
      const owSays = ow ? `${ow.family || 'Muse Spark Open'}, Meta's open-weights model, served by ${ow.servedBy || 'its host'}` : '';
      
      const spoken = metaMode(mode) && consentId();
      const owMeta = spoken ? "Meta does not, except that spoken questions go to Meta's speech-to-text first." : 'Meta does not.';
      const hostedSays = ow ? `${owSays} receives your questions and what the analysis found in this take; ${owMeta}`
        : !or ? "Meta's Muse Spark receives your questions and what the analysis found in this take."
        : `${/glimmer/i.test(ori.model || '') ? 'Muse Glimmer' : 'Muse Spark'} answers through OpenRouter, which passes your questions and what the analysis found in this take to ${orTo}.`;
      const not = spoken ? ": the answers do not use Meta. Spoken questions go to Meta's speech-to-text first; typed ones do not go to Meta."
        : ': your questions do not go to Meta.';
      const tick = ageGate && !hosted ? ` Tick the box above if you are 18 or older to have ${ow ? ow.family || 'Muse Spark Open' : 'Muse Spark'} answer.` : '';
      if (by) {
        $('who').textContent = `${by} ${hosted ? hostedSays : cap(not.slice(2))}${tick}`;
        return;
      }
      $('who').textContent = hosted
        ? (ow ? `Answers come from ${owSays}, which receives your questions and what the analysis found in this take; ${owMeta}`
          : !or ? "Answers come from Meta's Muse Spark, which receives your questions and what the analysis found in this take."
          : `Answers come from ${/glimmer/i.test(ori.model || '') ? 'Muse Glimmer' : 'Muse Spark'} via OpenRouter, which passes your questions and what the analysis found in this take to ${orTo}.`)
        : (h.chat.glimmer ? `Answers come from Muse Glimmer on our own server${not}` : `Answers come from fixed lines on this server${not}`)
          + tick;
    }

    

    function openPanel(which, why) {
      closePanels();
      if (which === 'meta') {
        $('cwhy').textContent = (why ? `${why} ` : '') + META_VOICE;
        $('cerr').hidden = true;
        $('consent').hidden = false;
        $('adult').focus();
      } else {
        $('sr').hidden = false;
        $('sr').querySelector('[data-act="sr-ok"]').focus();
      }
    }
    function closePanels() { $('consent').hidden = true; $('sr').hidden = true; }
    async function agree() {
      const err = (t, focus) => { $('cerr').textContent = t; $('cerr').hidden = false; focus.focus(); };
      if (!$('adult').checked) return err('Please confirm you are 18 or older: Meta\'s speech-to-text is for adults only.', $('adult'));
      if (!$('voice').checked) return err("Please agree that your voice goes to Meta's speech-to-text, or type your question instead.", $('voice'));
      primeAudio();                                   
      primeSpeech();
      const btn = $('consent').querySelector('[data-act="agree"]');
      btn.disabled = true;
      try {
        const got = await call('voice/consent', { method: 'POST', json: { adult: true, voice: true } });
        if (destroyed) return;
        const id = String((got && got.consentId) || '');
        if (!/^[0-9a-f]{32}$/.test(id)) throw new ApiError(500, 'The server did not record the agreement.');
        store.set(CONSENT_KEY, id);
        consentMem = id;
        whoLine();
        closePanels();
        $('adult').checked = $('voice').checked = false;
        micEl.focus();
        start();
      } catch (e) {
        if (primed && !conv) { primed.close().catch(() => {}); primed = null; }   
        err(`The agreement was not recorded: ${e.message}`, btn);
      } finally { btn.disabled = false; }
    }
    
    const consentId = () => store.get(CONSENT_KEY) || consentMem;
    function forget() {
      store.set(CONSENT_KEY, null); consentMem = null;
      if (conv && metaMode(mode)) stop('Stopped: your agreement is forgotten on this browser. Tap Talk to agree again.');
      else note("Forgotten on this browser. I'll ask again before your voice goes to Meta.");
      micUi();
      whoLine();
      inEl.focus();
    }

    

    
    
    let conv = null, convSeq = 0, primed = null;
    const live = (c) => c && conv === c && !destroyed;
    const STATE = {
      starting: 'Starting the mic...',
      listening: 'Listening... ask your question.',
      hearing: "Hearing you... I'll answer when you pause.",
      waiting: 'Turning your words into text...',
      thinking: 'Thinking...',
      speaking: 'Answering... the mic is paused while I speak.',
      held: 'Paused... the mic waits while this plays, then listens again.',
      recording: 'Recording... tap Done talking when you have finished.',     
    };
    function setState(s) {
      if (!conv) return;
      conv.state = s;
      root.dataset.talk = s;                            
      liveEl.hidden = false;
      stateEl.textContent = STATE[s === 'hearing' && conv.noVad ? 'recording' : s] || '';
      const doneOff = !(s === 'hearing' || (s === 'listening' && conv.noVad)), skipOff = s !== 'speaking';
      
      const a = document.activeElement;
      if ((a === doneBtn && doneOff) || (a === skipBtn && skipOff)) micEl.focus();
      doneBtn.hidden = doneOff;
      skipBtn.hidden = skipOff;
      if (s !== 'hearing') caption('');
      if (s !== 'listening' && s !== 'hearing') meter(0);
      
      meterEl.parentNode.hidden = mode === 'browser' || !(s === 'listening' || s === 'hearing');
    }
    function caption(t) { capEl.textContent = t ? `"${t}"` : ''; capEl.hidden = !t; }
    function meter(rms) { meterEl.style.width = `${Math.min(100, Math.sqrt(Math.max(0, rms) / 0.25) * 100).toFixed(0)}%`; }

    
    function primeAudio() {
      if (primed || !canWorklet() || (mode !== 'realtime' && mode !== 'file')) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      try { primed = new AC({ latencyHint: 'interactive' }); } catch { primed = null; }
    }

    function micClick() {
      if (conv) { stop('Stopped. Tap Talk to start again.'); return; }
      if (mode === 'none') return;
      if (metaMode(mode) && !consentId()) { openPanel('meta'); return; }
      if (mode === 'browser' && !browserSrOk) { openPanel('browser'); return; }
      primeAudio();
      primeSpeech();
      start();
    }

    async function start() {
      if (conv || destroyed || mode === 'none') return;
      closePanels();
      stopVoice();                                      
      const c = conv = { seq: ++convSeq, state: 'starting', frames: [], preroll: [], levels: [], vad: null, quietMs: 0, sttFails: 0, noSpeech: 0, turn: 0, stale: 0 };
      micUi();
      setState('starting');
      note('');
      
      
      stateEl.removeAttribute('role');
      if (synth) logEl.setAttribute('aria-live', 'off');   
      document.addEventListener('visibilitychange', onHidden);
      
      const ready = () => { if (saying) setState('speaking'); else listen(c); };
      if (mode === 'browser') { ready(); return; }
      try {
        c.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      } catch (e) {
        if (!live(c)) return;
        const blocked = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        stop(blocked ? 'The microphone is blocked for this page. Allow it in the browser, or type your question.' : 'No microphone was found. Please type your question.');
        return;
      }
      if (!live(c)) { c.stream.getTracks().forEach((t) => t.stop()); return; }
      
      c.stream.getAudioTracks().forEach((t) => t.addEventListener('ended', () => {
        if (live(c)) stop('The microphone was disconnected. Tap Talk to try again, or type your question.');
      }));
      if (canWorklet()) {
        try { await startWorklet(c); } catch (e) { c.node = null; console.warn('MVChat: no AudioWorklet,', e && e.message); }
        if (!live(c)) return;
      }
      if (!c.node) {                                    
        const v = (health && health.voice) || {};
        if (canRecord() && v.file !== false) { broken.realtime = true; setMode('file'); c.noVad = true; } else {
          broken.realtime = broken.file = true;
          switchFrom(mode, 'The microphone could not be read here.');
          return;
        }
      }
      if (mode === 'realtime') openSocket(c);           
      ready();
    }

    async function startWorklet(c) {
      const ctx = primed || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      primed = null;
      c.ctx = ctx;
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch {   } }
      await ctx.audioWorklet.addModule(opts.workletUrl || new URL('pcm-worklet.js', HERE).href);
      const node = new AudioWorkletNode(ctx, 'mv-pcm-frames', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers',
        processorOptions: { targetRate: RATE, frameMs: FRAME_MS },
      });
      const src = ctx.createMediaStreamSource(c.stream), mute = ctx.createGain();
      mute.gain.value = 0;                              
      src.connect(node); node.connect(mute); mute.connect(ctx.destination);
      node.port.onmessage = (e) => { if (live(c) && e.data && e.data.pcm) onFrame(c, e.data.pcm, +e.data.rms || 0); };
      c.node = node; c.src = src;
    }

    
    function listen(c) {
      if (!live(c)) return;
      caption('');
      if (holds) { c.preroll = []; c.frames = []; setState('held'); return; }
      if (mode === 'browser') { srListen(c); return; }
      c.preroll = []; c.frames = []; c.turnMs = 0; c.silentMs = 0; c.above = 0;
      c.guardUntil = performance.now() + GUARD_MS;
      c.vad = c.vad || { floor: 0.002 };
      setState('listening');
      if (c.noVad) recStart(c);
    }

    
    function onFrame(c, pcm, rms) {
      if (holds) return;                                
      const st = c.state;
      if (st === 'listening' || st === 'hearing') meter(rms);
      if (c.noVad) return;
      if (st === 'listening') {
        if (performance.now() < c.guardUntil) return;
        const v = c.vad, on = Math.max(MIN_ON, v.floor * 3);
        c.preroll.push(pcm);
        if (c.preroll.length > PREROLL) c.preroll.shift();
        if (rms > on) c.above++;
        else { c.above = 0; v.floor = Math.min(MAX_FLOOR, Math.max(0.0005, v.floor * 0.95 + rms * 0.05)); }
        if (c.above >= ONSET_FRAMES) { beginTurn(c); return; }
        c.quietMs += FRAME_MS;
        if (c.quietMs >= IDLE_STOP_MS) stop("Stopped listening after a minute of quiet. Tap Talk when you want to ask again.");
      } else if (st === 'hearing') {
        const off = Math.max(MIN_OFF, c.vad.floor * 2);
        c.turnMs += FRAME_MS;
        c.silentMs = rms < off ? c.silentMs + FRAME_MS : 0;
        c.levels.push(rms);
        if (mode === 'realtime') sockSend(c, pcm); else c.frames.push(pcm);
        if (c.silentMs >= END_SILENCE_MS || c.turnMs >= MAX_TURN_MS) endTurn(c);
      }
    }

    function beginTurn(c) {
      c.quietMs = 0; c.silentMs = 0; c.turnMs = c.preroll.length * FRAME_MS; c.levels = [];
      setState('hearing');
      if (mode === 'realtime') {
        if (c.stale) dropSocket(c);                     
        sockSend(c, JSON.stringify({ type: 'start', sampleRate: RATE }));
        for (const f of c.preroll) sockSend(c, f);
      } else c.frames = c.preroll.slice();
      c.preroll = [];
    }

    function endTurn(c) {
      if (!live(c) || c.state !== 'hearing') return;
      setState('waiting');
      clearTimeout(c.finalTimer);
      if (c.levels && c.levels.length) {               
        const lv = c.levels.slice().sort((a, b) => a - b);
        c.roomLevel = lv[Math.floor(lv.length / 5)];
        c.levels = [];
        if (c.turnMs >= MAX_TURN_MS) learnFloor(c);     
      }
      if (mode === 'realtime') {
        sockSend(c, JSON.stringify({ type: 'end' }));
        c.finalTimer = setTimeout(() => {
          if (c.sock) c.stale++;                        
          turnFailed(c, "Meta's speech-to-text did not answer in time.");
        }, FINAL_WAIT_MS);
      } else if (c.noVad) recStop(c);
      else sendClip(c, wavBlob(c.frames, RATE));
      c.frames = [];
    }

    
    
    
    
    function learnFloor(c) {
      if (!c.vad || c.noVad || !(c.roomLevel > 0)) return;
      c.vad.floor = Math.min(MAX_FLOOR, Math.max(c.vad.floor, c.roomLevel));
      c.roomLevel = 0;
    }

    
    
    function abandonTurn(c) {
      clearTimeout(c.finalTimer); clearTimeout(c.recTimer);
      c.turn = (c.turn || 0) + 1;                       
      if (mode === 'realtime' && c.sock && (c.state === 'hearing' || c.state === 'waiting')) {
        if (c.state === 'hearing') sockSend(c, JSON.stringify({ type: 'end' }));
        c.stale = (c.stale || 0) + 1;                   
      }
      if (c.rec) { const r = c.rec; c.rec = null; r.onstop = null; try { r.stop(); } catch {   } }
      if (c.sr) { const r = c.sr; c.sr = null; try { r.abort(); } catch {   } }
      c.frames = []; c.preroll = []; c.levels = [];
    }

    
    
    function noWords(c) {
      if (++c.noSpeech < NO_WORDS_STOP) return false;
      stop('Stopped listening: three tries in a row brought no words. Tap Talk to try again, or type your question.');
      return true;
    }

    
    function turnFailed(c, why) {
      if (!live(c)) return;
      clearTimeout(c.finalTimer);
      if (noWords(c)) return;
      note(`${why} Say it again, or type your question.`);
      listen(c);
    }

    
    async function heard(c, text, how) {
      if (!live(c)) return;
      clearTimeout(c.finalTimer);
      text = String(text || '').trim();
      if (!text) {
        learnFloor(c);
        if (noWords(c)) return;
        note("I didn't catch that. Say it again, or type your question.");
        listen(c);
        return;
      }
      c.sttFails = 0; c.noSpeech = 0;
      note('');
      if (busy) { note('Still thinking about the last question; ask again in a moment.'); listen(c); return; }
      setState('thinking');
      ask(text, how);                                   
    }

    
    function switchFrom(from, why) {
      broken[from] = true;
      const was = mode, next = pickMode();
      setMode(next);
      const c = conv;
      if (next === 'file' && c && c.node && was !== 'file') {
        dropSocket(c);
        note(`${why} I'll send each question as a recording when you pause.`);
        if (c.state === 'hearing' || c.state === 'waiting') listen(c);
        return;
      }
      if (c) stop(null);
      if (next === 'browser') note(`${why} Tap Talk to use your browser's own speech recognition instead, or type your question.`);
      else if (next === 'none') { note(`${why} Please type your question.`); inEl.focus(); }
      else note(`${why} Tap Talk to try again, or type your question.`);
    }

    function consentLapsed() {
      store.set(CONSENT_KEY, null); consentMem = null;
      if (conv) stop(null);
      openPanel('meta', 'Your agreement to send your voice to Meta has expired.');
      micUi();
      whoLine();
    }

    

    function sockSend(c, data) {
      if (!c.sock || c.sock.closed) openSocket(c);
      const s = c.sock;
      if (s.ws && s.ws.readyState === 1) s.ws.send(data);
      else s.queue.push(data);                          
    }
    function dropSocket(c) {
      const s = c && c.sock;
      if (!s) return;
      s.closed = true; s.queue = [];
      c.sock = null; c.stale = 0;                       
      if (s.ws) { try { s.ws.close(1000); } catch {   } }
    }
    async function openSocket(c) {
      const s = c.sock = { ws: null, queue: [], closed: false, opened: false };
      c.stale = 0;
      let ticket;
      try {
        
        ({ ticket } = await call('voice/ticket', { method: 'POST', json: { consentId: consentId(), target } }));
      } catch (e) {
        if (!live(c) || c.sock !== s) return;
        dropSocket(c);
        if (e.status === 403) { consentLapsed(); return; }
        if (c.state === 'hearing' || c.state === 'waiting') turnFailed(c, `The voice link could not start: ${e.message}`);
        else note(`The voice link could not start: ${e.message}`);
        return;
      }
      if (!live(c) || c.sock !== s) return;
      const u = new URL('voice/ws', base);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.searchParams.set('ticket', ticket);
      let ws;
      try { ws = new WebSocket(u); } catch (e) { dropSocket(c); switchFrom('realtime', 'The live voice link is not possible here.'); return; }
      ws.binaryType = 'arraybuffer';
      s.ws = ws;
      ws.onopen = () => {
        if (s.closed) { ws.close(1000); return; }
        s.opened = true;
        c.sockFails = 0;
        for (const d of s.queue) ws.send(d);
        s.queue = [];
      };
      ws.onmessage = (e) => {
        if (s.closed || typeof e.data !== 'string') return;
        let m = null;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m && live(c)) onServer(c, s, m);
      };
      ws.onclose = () => {
        if (c.sock === s) { c.sock = null; c.stale = 0; }
        if (s.closed || !live(c)) return;
        s.closed = true;
        if (!s.opened) {                                
          c.sockFails = (c.sockFails || 0) + 1;
          if (c.sockFails >= 2) { switchFrom('realtime', 'The live voice link could not connect.'); return; }
        }
        if (c.state === 'hearing' || c.state === 'waiting') turnFailed(c, 'The voice link closed.');
      };
    }
    function onServer(c, s, m) {
      
      
      if (m.type === 'partial') { if (!c.stale && (c.state === 'hearing' || c.state === 'waiting')) caption(String(m.text || '')); return; }
      if (m.type === 'final') {
        if (c.stale) { c.stale--; return; }
        if (c.state !== 'hearing' && c.state !== 'waiting') return;
        heard(c, m.text, 'realtime');
        return;
      }
      if (m.type !== 'error') return;
      if (c.stale && (m.code === 'stt' || m.code === 'busy')) { c.stale--; return; }   
      const msg = cap(String(m.message || 'the voice link failed')) + '.';
      if (m.code === 'no-stt') { noKey = true; dropSocket(c); switchFrom('realtime', "Speech-to-text isn't set up on this server."); return; }
      if (m.code === 'consent') { dropSocket(c); consentLapsed(); return; }
      if (m.code === 'ticket' || m.code === 'timeout') {      
        dropSocket(c);
        if (c.state === 'hearing' || c.state === 'waiting') turnFailed(c, 'The voice link expired.');
        return;
      }
      if (m.code === 'stt' && ++c.sttFails >= 2) { dropSocket(c); switchFrom('realtime', `Live speech-to-text failed twice (${m.message || 'stt'}).`); return; }
      if (c.state === 'hearing' || c.state === 'waiting') turnFailed(c, msg);
      else note(msg);
    }

    

    async function sendClip(c, blob) {
      if (!live(c)) return;
      if (blob.size < 1000) { turnFailed(c, "That was too short; I didn't catch anything."); return; }
      const turn = c.turn;                              
      try {
        const q = `consent=${encodeURIComponent(consentId() || '')}&kind=${encodeURIComponent(target.kind)}&id=${encodeURIComponent(target.id)}`;
        const res = await call(`voice/stt?${q}`, { method: 'POST', body: blob, type: blob.type.split(';')[0] || 'audio/webm' });
        if (!live(c) || c.turn !== turn) return;
        heard(c, res.text, 'file');
      } catch (e) {
        if (!live(c) || c.turn !== turn) return;
        if (e.status === 403) { consentLapsed(); return; }
        if (e.status === 501) { noKey = true; switchFrom('file', "Speech-to-text isn't set up on this server."); return; }
        if (++c.sttFails >= 2) { switchFrom('file', `Speech-to-text failed twice (${e.message})`); return; }
        turnFailed(c, `Speech-to-text failed: ${e.message}`);
      }
    }
    
    function recStart(c) {
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      let rec;
      try { rec = new MediaRecorder(c.stream, mime ? { mimeType: mime } : undefined); } catch (e) { switchFrom('file', `Recording is not possible here (${e.name}).`); return; }
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => { if (live(c) && c.rec === rec) { c.rec = null; sendClip(c, new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })); } };
      c.rec = rec;
      rec.start();
      c.state = 'hearing';
      setState('hearing');
      clearTimeout(c.recTimer);
      c.recTimer = setTimeout(() => endTurn(c), MAX_TURN_MS);
    }
    function recStop(c) {
      clearTimeout(c.recTimer);
      if (c.rec && c.rec.state === 'recording') c.rec.stop();
    }

    

    function srListen(c) {
      let r;
      try { r = new SR(); } catch { switchFrom('browser', "Your browser's speech recognition is not available."); return; }
      r.lang = navigator.language || 'en-US';
      r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
      let fin = '', fatal = null, quiet = false;
      r.onspeechstart = () => { if (live(c) && c.sr === r) setState('hearing'); };
      r.onresult = (e) => {
        if (!live(c) || c.sr !== r) return;
        let part = '';
        fin = '';
        for (const res of e.results) { if (res.isFinal) fin += res[0].transcript; else part += res[0].transcript; }
        caption((fin + ' ' + part).trim());
      };
      r.onerror = (e) => {
        if (e.error === 'no-speech') quiet = true;
        else if (e.error !== 'aborted') fatal = e.error;
      };
      r.onend = () => {
        if (!live(c) || c.sr !== r) return;
        c.sr = null;
        if (fin.trim()) { heard(c, fin, 'browser'); return; }
        if (fatal) {
          const why = { 'not-allowed': 'The microphone is blocked for this page.', 'service-not-allowed': "Your browser's speech recognition is turned off.",
            network: "Your browser's speech recognition needs a connection.", 'audio-capture': 'No microphone was found.' }[fatal] || `Your browser's speech recognition stopped (${fatal}).`;
          switchFrom('browser', why);
          return;
        }
        if (quiet && ++c.noSpeech >= 3) { stop("Stopped listening: I didn't hear anything. Tap Talk to try again."); return; }
        listen(c);
      };
      c.sr = r;
      setState('listening');
      try { r.start(); } catch (e) { c.sr = null; switchFrom('browser', `Your browser's speech recognition could not start (${e.name}).`); }
    }

    

    function onHidden() { if (document.hidden && conv) stop('Stopped listening because the page was hidden. Tap Talk to start again.'); }

    function stop(msg) {
      const c = conv;
      if (!c) { if (msg) note(msg); return; }
      conv = null;
      document.removeEventListener('visibilitychange', onHidden);
      clearTimeout(c.finalTimer); clearTimeout(c.recTimer);
      dropSocket(c);
      if (c.rec && c.rec.state === 'recording') { c.rec.onstop = null; try { c.rec.stop(); } catch {   } }
      if (c.sr) { const r = c.sr; c.sr = null; try { r.abort(); } catch {   } }
      if (c.node) { try { c.node.port.postMessage({ type: 'stop' }); c.node.disconnect(); } catch {   } }
      if (c.src) { try { c.src.disconnect(); } catch {   } }
      if (c.stream) c.stream.getTracks().forEach((t) => t.stop());
      if (c.ctx) c.ctx.close().catch(() => {});
      if (primed) { primed.close().catch(() => {}); primed = null; }
      stopVoice();                                      
      if (liveEl.contains(document.activeElement)) micEl.focus();
      liveEl.hidden = true;
      root.removeAttribute('data-talk');
      stateEl.setAttribute('role', 'status');
      logEl.setAttribute('aria-live', 'polite');
      caption('');
      meter(0);
      if (msg !== undefined && msg !== null) note(msg);
      micUi();
    }

    

    function holdOn() {
      holds++;
      if (saying) speakSeq++;                           
      const c = conv;
      if (live(c) && (c.state === 'listening' || c.state === 'hearing')) { abandonTurn(c); setState('held'); }
    }
    function holdOff() {
      if (holds <= 0) return;
      holds--;
      if (!holds && live(conv) && conv.state === 'held') listen(conv);   
    }
    
    
    let owed = 0;
    function hold(x) {
      const thenable = !!x && typeof x.then === 'function';
      if (x === false) { if (owed) owed--; else holdOff(); return undefined; }
      if (ownCall) {
        if (thenable) return x;
        owed++;
        let paid = false;
        return () => { if (!paid) { paid = true; if (owed) owed--; } };
      }
      holdOn();
      let once = false;
      const off = () => { if (!once) { once = true; holdOff(); } };
      if (thenable) { x.then(off, off); return x; }
      return off;
    }
    
    
    function seekMs(f) {
      const mo = f && f.evidence && Array.isArray(f.evidence.moments) && f.evidence.moments[0];
      const a = +((mo || f).fromS), b = +((mo || f).toS);
      const s = Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a + 1 : 4;
      return Math.min(12, s) * 1000 + 500;
    }

    

    
    const voiceOpt = opts.voice && typeof opts.voice.on === 'function' && typeof opts.voice.set === 'function' ? opts.voice : null;
    function voiceFace() {
      const b = $('spk');
      if (!b || !voiceOpt) return;
      let on = true;
      try { on = !!voiceOpt.on(); } catch {   }
      b.hidden = false;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', "Muse's voice");
      b.title = on ? "Muse's voice is on. Tap to mute it; the words stay on screen." : "Muse is muted: words on screen only. Tap to hear Muse.";
      b.innerHTML = on ? ICON_SPEAKER : ICON_MUTED;
    }
    function onClick(e) {
      const b = e.target.closest('button');
      if (!b || !root.contains(b)) return;
      if (b === micEl) { micClick(); return; }
      if (b.id === `${uid}-spk` && voiceOpt) {
        let on = true;
        try { on = !!voiceOpt.on(); } catch {   }
        if (!on) primeSpeech();                        
        try { voiceOpt.set(!on); } catch (err) { console.warn('MVChat voice:', err); }
        voiceFace();
        return;
      }
      if (b.dataset.q) { primeSpeech(); ask(b.dataset.q); return; }
      const act = b.dataset.act;
      if (act === 'done' && conv) {
        if (conv.sr) conv.sr.stop(); else endTurn(conv);
      } else if (act === 'skip') stopVoice(true);
      else if (act === 'agree') agree();
      else if (act === 'sr-ok') { browserSrOk = true; primeSpeech(); closePanels(); micEl.focus(); start(); }
      else if (act === 'cancel') { closePanels(); micEl.focus(); }
      else if (act === 'forget') forget();
      else if (act === 'moment' && typeof opts.onMoment === 'function') {
        stopVoice(true);
        const a = +b.dataset.a, z = +b.dataset.b;
        const r = opts.onMoment(a, z);
        hold(r && typeof r.then === 'function' ? r : new Promise((ok) => setTimeout(ok, Math.min(12, Math.max(1, z - a)) * 1000 + 500)));
      } else if (act === 'seek') {
        const i = +b.dataset.i, f = findings()[i];
        if (f && typeof opts.onSeek === 'function') {
          stopVoice(true);
          
          
          const r = opts.onSeek(f, i);
          hold(r && typeof r.then === 'function' ? r : new Promise((ok) => setTimeout(ok, seekMs(f))));
        }
      }
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (!$('consent').hidden || !$('sr').hidden) { closePanels(); micEl.focus(); e.preventDefault(); } else if (conv) { stop('Stopped. Tap Talk to start again.'); micEl.focus(); e.preventDefault(); }
    }
    function onSubmit(e) {
      e.preventDefault();
      const q = inEl.value;
      if (!q.trim()) { inEl.focus(); return; }
      if (busy) { note('Still thinking about the last question; ask again in a moment.'); return; }
      inEl.value = '';
      primeSpeech();
      ask(q);
    }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    $('form').addEventListener('submit', onSubmit);
    $('age-in').addEventListener('change', whoLine);   

    (async () => {
      try {
        const h = typeof opts.health === 'function' ? opts.health() : opts.health;
        health = (await h) || null;
      } catch { health = null; }
      if (!health) {
        try { const r = await fetch(new URL('health', base)); if (r.ok) health = await r.json(); } catch {   }
      }
      if (!result) {
        const kind = target.kind === 'demo' ? 'demos' : target.kind === 'sample' ? 'samples' : 'jobs';
        try { result = await call(`${kind}/${encodeURIComponent(target.id)}/result`); } catch {   }
      }
      if (destroyed) return;
      if (!conv) setMode(pickMode());
      whoLine();
    })();
    setMode(pickMode());
    voiceFace();

    return {
      ask: (q) => ask(q),
      voice: () => voiceFace(),
      stop: () => stop(null),
      hold,
      quiet: () => stopVoice(true),
      destroy() {
        if (destroyed) return;
        stop(null);
        stopVoice();
        if (primed) { primed.close().catch(() => {}); primed = null; }   
        destroyed = true;
        root.removeEventListener('click', onClick);
        root.removeEventListener('keydown', onKey);
        root.remove();
      },
    };
  }

  window.MVChat = { mount };
})();
