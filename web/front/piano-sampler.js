



(() => {
  'use strict';
  if (window.MVPiano && window.MVPiano.splendid) return;
  if ([...document.scripts].some((x) => /(?:^|\/)splendid-piano\.js(?:[?#]|$)/.test(x.getAttribute('src') || ''))) return;
  const me = document.currentScript;
  const s = document.createElement('script');
  s.src = new URL('splendid-piano.js', (me && me.src) || location.href).href;
  s.async = false;
  s.onerror = () => console.info('MVPiano: splendid-piano.js did not load, so the replay is silent.');
  document.head.append(s);
})();
