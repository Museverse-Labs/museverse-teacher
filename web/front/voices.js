











(() => {
  'use strict';
  const MARKS = [[/\b(natural|neural)\b/i, 100], [/\bpremium\b/i, 90], [/\benhanced\b/i, 80]];
  const KNOWN = /\b(ava|zoe|samantha|allison|evan|nathan|serena|daniel|moira|karen|tessa|aria|jenny|emma|andrew|brian|sonia|libby|ryan|michelle|steffan|natasha|william|clara|ana)\b/i;
  const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe organ|fred|junior|ralph|kathy|espeak|compact)\b/i;
  function score(v) {
    if (!v || !/^en([-_]|$)/i.test(String(v.lang || ''))) return -1;
    const name = String(v.name || '');
    let s = 0;
    for (const [re, n] of MARKS) if (re.test(name)) s = Math.max(s, n);
    if (!s && v.localService === false) s = 60;
    if (!s && KNOWN.test(name)) s = 40;
    if (NOVELTY.test(name)) s -= 80;
    if (/^en[-_](us|gb)$/i.test(String(v.lang || ''))) s += 3;
    return s;
  }
  function ranked(voices) {
    return (Array.isArray(voices) ? voices : []).map((v, i) => [score(v), i, v]).filter((x) => x[0] >= -80 && x[0] !== -1)
      .sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[2]);
  }
  const best = (voices) => ranked(voices).find((v) => score(v) >= 0) || null;
  window.MVVoices = { score, ranked, best };
})();
