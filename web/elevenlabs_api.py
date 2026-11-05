"""ElevenLabs text-to-speech: the voice of Muse. The
teacher's words are written by Meta's models (Muse Wonder judges, Muse Spark words and answers) or fixed in code; this
module only turns a line that is already written into sound. server.py, voicepack.py and the test bench's worker decide
which take may be spoken this way (an upload whose player agreed to it, never a Quest take); this module only makes the call.

    audio, info = speak("Let's take this one first.")      # MP3 bytes; info {"model", "voice", "format", "seconds", "chars"}
    pcm, info = speak(text, output_format="pcm_24000")       # 16-bit mono little-endian samples at 24 kHz (the bench's packs)
    problem()          # why this voice cannot be used with the current settings (None when it can); sends nothing
    describe()         # for /api/health and the pages: {"by": "ElevenLabs", "model", "voice"}, or None
    request()          # what decides a line's sound besides its words: {voice, model, settings, outputFormat}

THE VOICE IS THE COURSE'S. COURSE below is the
request our course tools make for every line of the piano course and its feedback videos: the voice
"David - American Narrator" (v9LgF91V36LGgbLX3iHW), the model eleven_v4, stability 0.5, similarity_boost 0.75, speed 0.9,
and mp3_44100_128. test_elevenlabs_api.py holds these equal to vo.py's own when the course is beside this folder. A
request is exactly vo.synthesize's: {text, model_id, voice_settings}, nothing else (no previous_text or next_text, no
style or speaker boost), so a line sounds as the course's would. There is no fallback model: a model the account or the
API refuses is an error, and the page then has
no clip for that line rather than one in another voice.

Environment (read at call time):
  ELEVENLABS_API_KEY   sent as the xi-api-key header to api.elevenlabs.io only. Stripped; never logged or put in an
                       error message (scrub), and a value with a space, a quote or anything outside letters, digits,
                       "_" and "-" is refused without being echoed. It is added in the environment's settings, never in a
                       chat or a commit.
  ELEVENLABS_KEYCHAIN=1  on a machine of ours, with ELEVENLABS_API_KEY unset: the key is read the way core's
                       tools/elevenlabs_key.py reads it (this Mac's login Keychain item museverse-elevenlabs-api-key, else
                       its 0600 file), once a process, and goes to api.elevenlabs.io only (never a loopback test server).
                       Off unless set, so no test and no server reads the Keychain by surprise.
  ELEVENLABS_VOICE_ID  another voice than the course's (an account without David). Letters and digits only.
  ELEVENLABS_MODEL     the course's eleven_v4 by default; only a v4 model is accepted (MODELS).
  ELEVENLABS_API_BASE  default https://api.elevenlabs.io. Only that host or a loopback test server, and redirects are
                       not followed, so a typo or a 3xx cannot send the key or the words anywhere else.
  ELEVENLABS_ZERO_RETENTION=1  asks for zero retention (enable_logging=false): ElevenLabs keeps nothing of the request.
                       Their docs say it is for enterprise accounts; leave it off otherwise (an account without it gets an
                       error, which says so).

What this module relies on, from ElevenLabs' pages read on 2026-11-01 (elevenlabs.io/docs/api-reference/text-to-speech/
convert and /docs/overview/models; it is tested against a loopback stand-in of those shapes, test_elevenlabs_api.py,
never the live API): POST /v1/text-to-speech/{voice_id}?output_format=..., header xi-api-key, JSON {text (required),
model_id, voice_settings {stability, similarity_boost, speed}}; the reply is the audio itself. output_format:
mp3_44100_128 and the others up to 128 kb/s on every plan (192 kb/s from Creator; PCM and WAV at 44.1 kHz from Pro),
pcm_24000 among them. A 422 carries {"detail": [{"loc", "msg", "type"}]}; other errors are read as {"detail":
{"status", "message"}} or plain text, whichever comes.

Their terms (elevenlabs.io/terms-of-use, read 2026-11-01; our reading, not legal advice): ElevenLabs may use what it is
sent and what it makes to improve its models unless the account opts out (the account's Terms and Privacy, Data use); the
customer owns the output; the free plan is not for commercial use, and the account holder must be 18 or older. So: the
account opts out of training, is on a paid plan, and only the teacher's words go (never a video, a sound, a name or a
question someone asked), only for a take whose player agreed to it.
"""
from __future__ import annotations

import json
import logging
import os
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request

log = logging.getLogger("elevenlabs_api")   # status, model, characters and timing only; never headers, keys or words

DEFAULT_BASE = "https://api.elevenlabs.io"
# the piano course's request, line for line (tools/piano_lessons/vo.py VOICE, MODEL, SETTINGS, OUTPUT_FORMAT)
COURSE = dict(voice=dict(id="v9LgF91V36LGgbLX3iHW", name="David - American Narrator"), model="eleven_v4",
              settings=dict(stability=0.5, similarity_boost=0.75, speed=0.9), outputFormat="mp3_44100_128")
DEFAULT_VOICE = COURSE["voice"]["id"]
DEFAULT_MODEL = COURSE["model"]
MODELS = ("eleven_v4", "eleven_v4_turbo")  # the v4 family only
FORMATS = ("mp3_44100_64", "mp3_44100_96", "mp3_44100_128", "mp3_44100_32", "mp3_22050_32", "mp3_24000_48", "pcm_24000",
           "pcm_22050", "pcm_16000")
DEFAULT_FORMAT = COURSE["outputFormat"]
SETTINGS = COURSE["settings"]
MAX_CHARS = 1200                           # one line of the teacher's is far shorter; a guard, not a limit anyone meets
USER_AGENT = "museverse-teacher/1.0 (+https://museverse.xyz)"
LOOPBACK = ("127.0.0.1", "localhost", "::1")
KEY = re.compile(r"[A-Za-z0-9_-]{16,200}")
VOICE = re.compile(r"[A-Za-z0-9]{8,64}")
HERE = os.path.dirname(os.path.abspath(__file__))
KEY_HELPER = os.path.join(HERE, "..", "..", "elevenlabs_key.py")   # core tools/elevenlabs_key.py, when this is in core
_FOUND = {}                                # the key read from the Keychain this process, once ("key": value or None)


class ElevenLabsError(RuntimeError):
    """A failed call. status is the HTTP status (None for a timeout or a network failure); type is ours: no_key,
    bad_key, bad_base, bad_voice, bad_model, bad_format, too_long, empty, timeout, network, http, bad_response."""

    def __init__(self, message, *, status=None, type=None):
        self.status, self.type = status, type
        self.message = scrub(str(message))
        head = "ElevenLabs: " + (f"HTTP {status}" if status is not None else (type or "error"))
        super().__init__(f"{head}: {self.message}")


def scrub(text):
    """The key never leaves this module in text, even if a server echoes it: the environment's, or the Keychain's."""
    if not isinstance(text, str):
        return text
    for k in (os.environ.get("ELEVENLABS_API_KEY", "").strip(), _FOUND.get("key") or ""):
        if k and len(k) >= 8:
            text = text.replace(k, "<ELEVENLABS_API_KEY>")
    return text


# ------------------------------------------------------------------ settings

def _keychain_key():
    """The key as core's tools/elevenlabs_key.find_key() finds it (its Keychain item, else its 0600 file), or None. Read
    once a process; the helper never puts the key in argv, a log or an exception."""
    if "key" not in _FOUND:
        got = None
        if os.path.isfile(KEY_HELPER):
            import importlib.util
            spec = importlib.util.spec_from_file_location("elevenlabs_key", KEY_HELPER)
            mod = importlib.util.module_from_spec(spec)
            try:
                spec.loader.exec_module(mod)
                got = mod.find_key()
            except Exception:                   # never the helper's message: it could hold what it read
                got = None
        _FOUND["key"] = (got or "").strip() or None
    return _FOUND["key"]


def _key_and_source():
    k = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    src = "env"
    if not k and os.environ.get("ELEVENLABS_KEYCHAIN") == "1":
        if not os.path.isfile(KEY_HELPER):
            raise ElevenLabsError("ELEVENLABS_KEYCHAIN=1, but core's tools/elevenlabs_key.py is not beside this folder",
                                  type="no_key")
        k, src = _keychain_key() or "", "keychain"
        if not k:
            raise ElevenLabsError("ELEVENLABS_KEYCHAIN=1, but no ElevenLabs key is stored on this machine "
                                  "(scripts/set-elevenlabs-key.sh stores one)", type="no_key")
    if not k:
        raise ElevenLabsError("ELEVENLABS_API_KEY is not set", type="no_key")
    if not KEY.fullmatch(k):
        raise ElevenLabsError("the ElevenLabs key does not look like an ElevenLabs key: check it was pasted whole, with no "
                              "quotes, spaces or line breaks", type="bad_key")
    return k, src


def _key():
    return _key_and_source()[0]


def base():
    b = os.environ.get("ELEVENLABS_API_BASE", DEFAULT_BASE).strip().rstrip("/")
    u = urllib.parse.urlsplit(b)
    try:
        port = u.port
    except ValueError:
        port = -1
    if not ((u.scheme == "https" and u.hostname == "api.elevenlabs.io" and port in (None, 443))
            or (u.scheme == "http" and u.hostname in LOOPBACK)):
        raise ElevenLabsError(f"ELEVENLABS_API_BASE must be https://api.elevenlabs.io or a loopback test server, not "
                              f"{u.scheme}://{u.hostname}", type="bad_base")
    if u.username or u.password or u.query or u.fragment or (u.path not in ("", "/")):
        raise ElevenLabsError("ELEVENLABS_API_BASE must be the host alone: no path, credentials, query or fragment",
                              type="bad_base")
    return b


def _base_for(source):
    """base(), and a key from the Keychain goes nowhere but ElevenLabs itself."""
    b = base()
    if source == "keychain" and urllib.parse.urlsplit(b).hostname in LOOPBACK:
        raise ElevenLabsError("a key read from the Keychain is sent to api.elevenlabs.io only, never to a test server",
                              type="bad_base")
    return b


def voice():
    v = (os.environ.get("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE).strip()
    if not VOICE.fullmatch(v):
        raise ElevenLabsError("ELEVENLABS_VOICE_ID must be a voice id: letters and digits only", type="bad_voice")
    return v


def model():
    m = (os.environ.get("ELEVENLABS_MODEL") or DEFAULT_MODEL).strip()
    if m not in MODELS:
        raise ElevenLabsError(f"ELEVENLABS_MODEL must be one of {', '.join(MODELS)} (an ElevenLabs v4 model)", type="bad_model")
    return m


def request(output_format=None):
    """What decides a line's sound besides its words, as the course's cache keys it:
    {voice: id, model, settings, outputFormat}. Raises ElevenLabsError on a setting that cannot work."""
    return dict(voice=voice(), model=model(), settings=dict(SETTINGS), outputFormat=output_format or DEFAULT_FORMAT)


def problem():
    """Why the voice cannot be used with the current settings, or None. Sends nothing."""
    try:
        _base_for(_key_and_source()[1])
        voice()
        model()
    except ElevenLabsError as e:
        return e.message
    return None


def describe():
    """Who speaks, for /api/health and the pages; None when it is not set up."""
    if problem():
        return None
    return dict(by="ElevenLabs", model=model(), voice=voice())


# ------------------------------------------------------------------ transport

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """urllib re-sends headers (the key) to wherever a 3xx points; refuse to follow instead."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _opener(url):
    loopback = urllib.parse.urlsplit(url).hostname in LOOPBACK
    return urllib.request.build_opener(*([_NoRedirect()] + ([urllib.request.ProxyHandler({})] if loopback else [])))


def _is_timeout(e):
    return isinstance(e, (TimeoutError, socket.timeout)) or (
        isinstance(e, urllib.error.URLError) and isinstance(e.reason, (TimeoutError, socket.timeout)))


def _error_body(raw):
    """A short message from {"detail": {"status", "message"}}, {"detail": [{"loc", "msg"}]} or the raw text."""
    text = raw.decode("utf-8", "replace").strip() if isinstance(raw, bytes) else str(raw or "")
    try:
        j = json.loads(text)
        d = j.get("detail") if isinstance(j, dict) else None
        if isinstance(d, dict):
            return " ".join(str(d.get(k)) for k in ("status", "message") if d.get(k))[:300] or "no message"
        if isinstance(d, list) and d:
            return "; ".join(f"{'.'.join(str(x) for x in (e.get('loc') or []))}: {e.get('msg')}" for e in d[:3]
                             if isinstance(e, dict))[:300] or "a validation error"
        if isinstance(j, dict) and j.get("message"):
            return str(j["message"])[:300]
    except ValueError:
        pass
    return text[:200] or "no error body"


def _post(url, body, key, timeout):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers={
        "xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg, audio/*, application/octet-stream",
        "User-Agent": USER_AGENT})
    try:
        with _opener(url).open(req, timeout=timeout) as r:
            ctype = r.headers.get("Content-Type", "")
            return r.status, ctype, r.read()
    except urllib.error.HTTPError as e:
        try:
            raw = e.read()
        except Exception:
            raw = b""
        return e.code, e.headers.get("Content-Type", "") if e.headers else "", raw


def align(audio, text, *, timeout=30.0):
    """Each word of text with its start and end in audio (seconds): ElevenLabs' forced alignment, POST /v1/forced-alignment
    (multipart: file, the audio; text, its words). For the lesson page to show a named note or a finger as it is said
. Only the teacher's own words and the clip ElevenLabs made of them are sent. Returns
    [[word, startS, endS]]; raises ElevenLabsError on any failure (the caller keeps the line without word times)."""
    import uuid as _uuid
    key, source = _key_and_source()
    url = _base_for(source) + "/v1/forced-alignment"
    b = _uuid.uuid4().hex
    body = b"".join([f"--{b}\r\nContent-Disposition: form-data; name=\"text\"\r\n\r\n".encode(), text.encode("utf-8"), b"\r\n",
                     f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"line.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n".encode(),
                     audio, f"\r\n--{b}--\r\n".encode()])
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "xi-api-key": key, "Content-Type": f"multipart/form-data; boundary={b}", "Accept": "application/json", "User-Agent": USER_AGENT})
    try:
        with _opener(url).open(req, timeout=timeout) as r:
            j = json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            raw = e.read()
        except Exception:
            raw = b""
        raise ElevenLabsError(f"forced alignment refused: HTTP {e.code}: {_error_body(raw)}") from None
    except Exception as e:
        raise ElevenLabsError(f"forced alignment failed: {'timed out' if _is_timeout(e) else type(e).__name__}") from None
    words = j.get("words") if isinstance(j, dict) else None
    if not isinstance(words, list):
        raise ElevenLabsError("forced alignment: no words in the answer")
    out = []
    for w in words:
        if isinstance(w, dict) and isinstance(w.get("text"), str) and w["text"].strip() and isinstance(w.get("start"), (int, float)):
            out.append([w["text"].strip(), round(float(w["start"]), 3), round(float(w.get("end", w["start"])), 3)])
    return out


def speak(text, *, output_format=None, timeout=20.0, previous_text=None, next_text=None):
    """(audio bytes, info) for one line of the teacher's, in the course's request (COURSE, request()). output_format: one
    of FORMATS (default the course's mp3_44100_128); pcm_* comes back as raw 16-bit mono little-endian samples.
    previous_text and next_text are accepted for older callers and never sent: the course says each line on its own, as
    tools/piano_lessons/vo.py does. Raises ElevenLabsError; a model the API refuses is an error, never another model."""
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if not text:
        raise ElevenLabsError("nothing to say", type="empty")
    if len(text) > MAX_CHARS:
        raise ElevenLabsError(f"a line of {len(text)} characters is longer than {MAX_CHARS}", type="too_long")
    fmt = output_format or DEFAULT_FORMAT
    if fmt not in FORMATS:
        raise ElevenLabsError(f"output_format must be one of {', '.join(FORMATS)}", type="bad_format")
    key, src = _key_and_source()
    b, v, m = _base_for(src), voice(), model()
    q = {"output_format": fmt}
    if os.environ.get("ELEVENLABS_ZERO_RETENTION") == "1":
        q["enable_logging"] = "false"
    url = f"{b}/v1/text-to-speech/{urllib.parse.quote(v)}?{urllib.parse.urlencode(q)}"
    t0 = time.monotonic()
    body = dict(text=text, model_id=m, voice_settings=dict(SETTINGS))
    try:
        status, ctype, raw = _post(url, body, key, timeout)
    except Exception as e:                              # never the request object: it holds the key
        if _is_timeout(e):
            raise ElevenLabsError(f"no reply within {timeout:.0f} s", type="timeout") from None
        raise ElevenLabsError(f"{type(e).__name__}: {getattr(e, 'reason', e)}", type="network") from None
    log.info("text-to-speech %s %s %d chars %.2f s", status, m, len(text), time.monotonic() - t0)
    if status == 200:
        if not raw or "json" in ctype.lower():
            raise ElevenLabsError("the reply was not audio", type="bad_response")
        if fmt.startswith("pcm_") and len(raw) % 2:
            raw = raw[:-1]
        return raw, dict(model=m, voice=v, format=fmt, seconds=round(time.monotonic() - t0, 2), chars=len(text))
    msg = _error_body(raw)
    if status in (400, 404, 422) and re.search(r"model", msg, re.I) and "voice" not in msg.lower():
        raise ElevenLabsError(f"{msg} (the model {m}: no other model is tried, the course's voice stays on v4)",
                              status=status, type="bad_model")
    hint = {401: " (check ELEVENLABS_API_KEY)", 402: " (the account's plan or credits)",
            404: " (check ELEVENLABS_VOICE_ID: the course's voice must be in the account's voices)" if "voice" in msg.lower() else "",
            429: " (too many requests, or the plan's concurrency)"}.get(status, "")
    raise ElevenLabsError(msg + hint, status=status, type="http")
