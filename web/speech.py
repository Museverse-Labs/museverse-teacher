"""Who speaks the teacher's words, and which words may be spoken (ElevenLabs as the voice of Muse, on
by default, with subtitles and a mute). The words are the teacher's own (Meta's models, or fixed in code); this module
decides whether a take's lines may be turned into sound by ElevenLabs (elevenlabs_api.py) and keeps what it made.

TEACHER_VOICE   browser (the default): every page speaks with the browser's own voice, and nothing is sent anywhere
                for it. elevenlabs: the teacher's lines about an upload whose player agreed to it (and confirmed 18+)
                are spoken by ElevenLabs in the piano course's voice (elevenlabs_api.COURSE): a lesson's lines once,
                after the analysis, into its voice pack (voicepack.py), and a line the page asks for here (spoken).
                Needs ELEVENLABS_API_KEY, or on a machine of ours ELEVENLABS_KEYCHAIN=1 (elevenlabs_api.py); any other
                value, or elevenlabs without a key, stops the server at start-up (check_env).
TEACHER_VOICE_DAY_CHARS  characters this server may send to ElevenLabs in a day, all takes together (default 60000;
                a lesson is about 1,500); past it the page speaks with the browser's voice. Lines already spoken are kept
                and cost nothing again.

What may be spoken (allowed): only words the teacher wrote for this take. The take's result (its summary, findings,
strengths, plan, lesson, comparison: every string under them), the answers this server gave about the take (remember),
and the page's own few joining words (TEMPLATES: "Try this:", "Your practice plan starts with this, for 5 minutes:").
Every sentence of a line must be a whole sentence of those, word for word (case, spaces and punctuation aside), so the
voice is never a way to have anything else said, nor to spend the account on text that is not a lesson's.

Never a Quest take (Meta's Developer Data Use Policy 4.11 keeps what is calculated about a Quest user's hands away from
anyone without Meta's written OK; ElevenLabs is not named in any), never a video, a sound or a question: only the
teacher's words.
"""
from __future__ import annotations

import collections
import hashlib
import json
import os
import re
import threading
import time

import elevenlabs_api as E

MODES = ("browser", "elevenlabs")
DAY_CHARS = 60000
MAX_LINE = 900                       # one spoken line: the page sends a line at a time
KEYS = ("summary", "findings", "strengths", "plan", "lesson", "compare", "reference")
# the page's own joining words, after norm(): app.js tourRun's practice-plan line, the finding's "Try this:", the
# walkthrough's opening and end, and testbench-muse.js's bridges between a lesson's steps
TEMPLATES = [re.compile(p) for p in (
    r"try this", r"here is what i noticed", r"that s everything", r"ask me about any of it below",
    r"your practice plan starts with this for \d{1,3} minutes?",
    r"to make it stick", r"set aside for now", r"your turn", r"now you", r"listen", r"watch",
    r"let s start", r"next", r"well done", r"that s the lesson", r"try it again",
)]
_LOCK = threading.Lock()
_SPENT = collections.deque()          # (time, characters) sent to ElevenLabs over the last day
_SAID = {}                            # take key -> deque of the answers this server gave about it (remember)


def mode():
    v = (os.environ.get("TEACHER_VOICE") or "browser").strip().lower() or "browser"
    return v if v in MODES else "invalid"


def check_env():
    """Raise ValueError on a TEACHER_VOICE that cannot work (server.py stops at start-up with it)."""
    m = mode()
    if m == "invalid":
        raise ValueError("TEACHER_VOICE must be browser (the browser's own voice) or elevenlabs")
    if m == "elevenlabs":
        why = E.problem()
        if why:
            raise ValueError(f"TEACHER_VOICE=elevenlabs: {why}")
    day_chars()


def day_chars():
    raw = os.environ.get("TEACHER_VOICE_DAY_CHARS")
    try:
        v = int(raw) if raw not in (None, "") else DAY_CHARS
    except ValueError:
        raise ValueError("TEACHER_VOICE_DAY_CHARS must be a whole number of characters, such as 60000") from None
    if not 0 <= v <= 10**8:
        raise ValueError("TEACHER_VOICE_DAY_CHARS must be between 0 and 100000000")
    return v


def offer():
    """What the page tells the player before an upload, and what the upload records (job.json consent.voiceAtUpload):
    {"on": False}, or {"on": True, "by": "ElevenLabs", "model"}. Never the key, never the voice id."""
    if mode() != "elevenlabs":
        return dict(on=False)
    d = E.describe()
    return dict(on=True, by="ElevenLabs", model=d["model"]) if d else dict(on=False)


def consent_covers(c):
    """Whether an upload's consent (job.json) lets ElevenLabs speak its lines now: its player confirmed 18+ and was told
    ElevenLabs would (voiceAtUpload), and this server's voice is ElevenLabs."""
    if not (isinstance(c, dict) and c.get("adult") is True):
        return False
    v = c.get("voiceAtUpload")
    return bool(isinstance(v, dict) and v.get("on") is True and v.get("by") == "ElevenLabs" and offer()["on"])


# ------------------------------------------------------------------ which words may be spoken

def norm(s):
    """Lower case, every run of anything but letters and digits one space: what a line is compared by."""
    return re.sub(r"[^a-z0-9]+", " ", str(s or "").lower().replace("’", "'")).strip()


# app.js and chat.js say a line one sentence at a time, split by this same pattern (their sentences()): a time like 0:42
# has no full stop to split on, and "3.5" splits as they split it, so a part the page sends is a part of the take's own
JS_SENTENCE = re.compile(r"[^.!?]+(?:[.!?]+[\"')\]]*|$)")


def sentences(text):
    """A line's parts, normalized: its sentences as the pages split them, each split again at a colon, a semicolon or a
    dash (the page's "Try this: ...")."""
    out = []
    for piece in JS_SENTENCE.findall(str(text or "")):
        for x in re.split(r"(?<=[:;])\s+|\s+[-\u2013\u2014]\s+", piece):
            n = norm(x)
            if n:
                out.append(n)
    return out


def _strings(x, out, depth=0):
    if depth > 8:
        return
    if isinstance(x, str):
        if len(x) >= 2:
            out.append(x)
    elif isinstance(x, dict):
        for v in x.values():
            _strings(v, out, depth + 1)
    elif isinstance(x, list):
        for v in x[:400]:
            _strings(v, out, depth + 1)


def corpus(result, extra=()):
    """The take's own words, as the set of its parts (sentences()) and its whole strings, normalized: every string under
    its summary, findings, strengths, plan, lesson and comparison, and extra (the answers given about it)."""
    out = []
    if isinstance(result, dict):
        for k in KEYS:
            _strings(result.get(k), out)
    out.extend(x for x in extra if isinstance(x, str))
    words = set()
    for x in out:
        words.update(sentences(x))
        n = norm(x)
        if n:
            words.add(n)
    return words


TAIL = re.compile(r"^(?:try this|to make it stick|set aside for now|your practice plan starts with this for \d{1,3} minutes?) ")


def allowed(text, words):
    """Whether every part of text (sentences()) is a whole part of the take's own words (words: corpus()), or one of the
    page's joining words. Whole parts only: a piece of a sentence is not one, so the voice cannot be fed variations."""
    parts = sentences(text)
    if not parts or len(str(text)) > MAX_LINE:
        return False
    for p in parts:
        if any(t.fullmatch(p) for t in TEMPLATES):
            continue
        if p not in words and TAIL.sub("", p) not in words:
            return False
    return True


def remember(key, text):
    """An answer this server gave about a take (key: "job:<id>", "sample:<id>"), so the page may have it spoken; the
    last 40 a take, for as long as this process runs."""
    if not (isinstance(text, str) and text.strip()):
        return
    with _LOCK:
        _SAID.setdefault(key, collections.deque(maxlen=40)).append(text)
        if len(_SAID) > 5000:                       # a long-running server forgets the oldest takes' answers
            _SAID.pop(next(iter(_SAID)))


def said(key):
    with _LOCK:
        return list(_SAID.get(key) or ())


# ------------------------------------------------------------------ making the sound, once

def cache_key(text, fmt=None):
    """sha256 of the whole request a line is made with: its words and the voice, model, settings and format
    (elevenlabs_api.request()), as canonical JSON, the same key the course's own voice cache gives its lines. So
    a change to any of them makes the line anew, and the same request is never paid for twice."""
    try:
        req = E.request(fmt)
    except E.ElevenLabsError:
        req = dict(voice="", model="", settings={}, outputFormat=fmt or E.DEFAULT_FORMAT)
    doc = dict(text=re.sub(r"\s+", " ", str(text)).strip(), voice=req["voice"], model=req["model"], settings=req["settings"],
               outputFormat=req["outputFormat"])
    return hashlib.sha256(json.dumps(doc, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


def cache_name(text, fmt=None):
    """The file a line is kept in: cache_key() and the format's extension."""
    return cache_key(text, fmt) + (".pcm" if (fmt or "").startswith("pcm_") else ".mp3")


def _budget_take(n):
    """Count n characters against TEACHER_VOICE_DAY_CHARS; False when they would go past it."""
    now = time.time()
    with _LOCK:
        while _SPENT and now - _SPENT[0][0] > 86400:
            _SPENT.popleft()
        if sum(c for _, c in _SPENT) + n > day_chars():
            return False
        _SPENT.append((now, n))
        return True


def _budget_give_back(n):
    """A line that could not be made costs nothing: its characters come off today's count again."""
    with _LOCK:
        for i in range(len(_SPENT) - 1, -1, -1):
            if _SPENT[i][1] == n:
                del _SPENT[i]
                return


class Unavailable(RuntimeError):
    """The line cannot be spoken by ElevenLabs now (budget, the service): the page speaks it with the browser's voice."""


RETRY_WAIT_S = 1.5                    # before the one retry of a line refused for too many requests, or timed out


def spoken(text, folder, fmt=None, retry=0, **kw):
    """(audio bytes, "cached" | "made") for one allowed line, kept in folder; Unavailable when it cannot be made now.
    retry: how many more times a line refused for too many requests (429) or timed out is asked for, after a short wait."""
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    path = os.path.join(folder, cache_name(text, fmt))
    try:
        with open(path, "rb") as f:
            return f.read(), "cached"
    except OSError:
        pass
    if not _budget_take(len(text)):
        raise Unavailable("today's characters for the voice are used up")
    for attempt in range(retry + 1):
        try:
            audio, _info = E.speak(text, output_format=fmt, **kw)
            break
        except E.ElevenLabsError as e:
            if attempt < retry and (e.status == 429 or e.type == "timeout"):
                time.sleep(RETRY_WAIT_S)
                continue
            _budget_give_back(len(text))
            raise Unavailable(e.message) from None
    os.makedirs(folder, exist_ok=True)
    tmp = path + f".{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp, "wb") as f:
        f.write(audio)
    os.replace(tmp, path)
    return audio, "made"
