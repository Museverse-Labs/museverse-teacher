"""Meta Model API clients for the web teacher: SAM 3.1 on video and images, Muse Voice Transcribe for
the player's spoken questions, and a cost estimate.

    frames = sam_segment_video("video.mp4", "hand")        # [{frame_index, time_s, width, height, objects}]
    summary = sam_video_to_records("video.mp4", times, prompts, "frames/sam")   # rf_0001.sam.json, ...
    det = sam_segment_image("frame.png", "piano keyboard")  # {width, height, objects}
    text = transcribe_speech(webm_bytes, "audio/webm")
    text = await asr_realtime(pcm_frames, on_event)        # live: one spoken turn over Meta's realtime WebSocket
    est_cost(frames=1800, prompts=4, images=300)["usd"]
    token_cost("muse-wonder-1.0", 1200, 300)                # one Muse text call at its list price (TOKEN_USD)

Environment: MODEL_API_KEY (sent as a Bearer token, never logged or put in an error message),
META_API_BASE (default https://api.meta.ai/v1) and META_ASR_WS (default wss://api.meta.ai/v1/asr/realtime).
Each must be Meta's host or a loopback test server, and redirects are not followed, so a typo or a 3xx
cannot send the key anywhere else.

HTTP is stdlib only (urllib); the realtime client uses websockets (asyncio); masks use numpy, media use
ffmpeg / ffprobe. Every API fact here comes
from Meta's docs saved on 2026-10-15 and is cited by page (docs/... = dev.meta.ai/docs/...). There was
no API key, so all of it is tested against a local mock of the documented shapes (test_meta_api.py),
never against the live API.

What the docs leave open, and what this module does about it:
  - Mask bytes. docs/sam/reading-segmentation gives the token grammar (raster height and width, the
    marker "~" lossless or "!" one_bit, a base85 payload "not base64"), but not the bytes behind the
    payload. Its alphabet is not a standard base85 either: the documented payloads hold "w x y z {",
    which Ascii85 lacks, and "' . / [ :", which RFC 1924 and Z85 lack. Meta's answer is its parser
    (docs/sam/client-libraries: "In Python, the same conversions are decode_mask_to_raster, ... from
    meta_sam_parser"). So masks are decoded by meta_sam_parser when it is installed
    (pip install meta_sam_parser; not installed or tried here), or by MASK_DECODER when a caller sets
    one. Otherwise a mask stays undecoded and sam_video_to_records writes the box as the outline,
    marked "mask": "box" on the detection.
  - Where the mask sits. Every documented example has a raster of (y2 - y1 + 1) x (x2 - x1 + 1), the
    box with both corners inclusive (x1=211 x2=270 -> 60 columns), and the cookbook's parser output
    has right - left = width (751 to 925, width 174), so boxes here are [x1, y1, x2 + 1, y2 + 1] and
    the raster covers exactly that box. A raster of another size is stretched onto the box.
  - Scores. The wire format has no confidence. Each match SAM returns gets score None in
    sam_segment_video and 1.0 in the records, because the realvideo steps filter and sort on it.
  - Video can hold 16 objects per frame. docs/sam/segmenting "Limits": "image requests return every
    matching instance. Video tracks up to 16 objects per frame." A full keyboard has 36 black keys (local
    SAM 3.1 returned up to 99 detections per frame on the test footage, before cleaning), so
    sam_video_to_records sends IMAGE_PROMPTS as one image request per analysed frame ($2.50 per 1,000)
    instead of video.

Data terms that matter for a web upload product (from Meta's pages):
  - Standard, not Contributor. Contributor mode trains on what you send and bars personal data
    (Terms of Service 6.1, 6.2, on what may be submitted
    to the Contributor Services"; help/policies-and-privacy/contributor-tier: "If your use case involves
    processing personal information, please use Standard Services"). Contributor exists only for
    muse-spark-1.3/1.2 as "-contributor" ids (docs/pricing-rate-limits); sam-3.1 and
    muse-voice-transcribe-1.0 are Standard only ("Contributor mode isn't available for Muse Voice
    Transcribe"). Under Standard, Meta acts as processor and "will not use Content submitted in a
    request to the Standard Services to train Meta Models" (Terms 5.1). A player's video of their
    hands and their voice is personal information: never route it to a "-contributor" model.
  - 18+. Terms 10.1: "You and your End Users must be at least 18 years of age to use the Services and
    Integrated Products, and you will not create Integrated Products targeted at individuals under
    the age of 18." A piano-learning product will have children: the upload flow needs an 18+ gate
    for the Meta-backed path (the local SAM 3.1 backend is not under these terms).
  - Rights and a privacy policy. Terms 4.1: we warrant we have "all rights required under applicable
    data protection laws" to submit the Inputs. Terms 6.2 and the contributor-tier help page require a
    privacy policy telling End Users what is collected and how it is used and shared; they say it for
    the Contributor tier, and a product that takes users' video needs one anyway.
  - Retention. Without ZDR Meta keeps Content "as needed" to run the service, for the law, flagged
    policy review, and safety (Terms 4.4); uploaded files "don't expire" (docs/file-handling). So
    uploads here set expires_after (1 hour, the minimum) and are deleted after use, and Responses
    are sent with store=False: responses are stored by default (docs/protocols/responses), and the
    413 that docs/error-handling gives for "a store=true request with large inline base64 media"
    implies the stored copy would hold that media.
  - Zero data retention. help/policies-and-privacy/zero-data-retention: "available for qualified Meta
    Model API accounts", enabled per organization by Meta through sales, "ZDR support may vary by
    model"; under ZDR "File uploads" and background and stateful requests are rejected. With ZDR use
    upload=False (inline only, 50 MB). ZDR transcription is priced as Standard (docs/speech-to-text).
  - Quest data never goes to the hosted API. A video here is the player's own phone or camera video,
    uploaded through the page, so the upload page asks for one.
"""
from __future__ import annotations

import asyncio
import base64
import inspect
import io
import json
import logging
import math
import os
import random
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import wave
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction

import numpy as np

log = logging.getLogger("meta_api")   # method, path, status and timing only; never headers or bodies

HERE = os.path.dirname(os.path.abspath(__file__))
SAM31 = os.path.join(os.path.dirname(HERE), "sam31")
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")

DEFAULT_BASE = "https://api.meta.ai/v1"      # docs/api-reference: "Base URL https://api.meta.ai/v1"
# a named agent, not Python's default "Python-urllib/3.x", which bot filters in front of APIs refuse
#
USER_AGENT = "museverse-teacher/1.0 (+https://museverse.xyz)"
SAM_MODEL = "sam-3.1"                        # docs/sam/overview: "The sam-3.1 model ... over POST /v1/responses"
ASR_MODEL = "muse-voice-transcribe-1.0"      # docs/api-reference/voice/transcribe curl: "model":"muse-voice-transcribe-1.0"

# docs/sam/segmenting "Limits"
MAX_VIDEO_FRAMES = 15_000    # "Clip length: up to 15,000 frames (about 10 minutes) per request."
MAX_VIDEO_OBJECTS = 16       # "Video tracks up to 16 objects per frame."
VIDEO_CODECS = ("h264", "hevc", "mpeg4")     # "MP4 or MOV containers with H.264, H.265, or MPEG-4 video. VP9 and WebM are not accepted."
# docs/file-handling "Size limits": inline "50 MB (50,000,000 bytes)", Files API upload "1 GiB (1,073,741,824 bytes)".
# The docs do not say whether 50 MB counts the file or its base64, so the data URL is held to it.
INLINE_MAX = 50_000_000
UPLOAD_MAX = 1_073_741_824
UPLOAD_TTL_S = 3600          # docs/file-handling "File expiration": seconds "from 3600 (1 hour) to 2592000 (30 days)"
# docs/api-reference/voice/transcribe: 400 when "the audio exceeds 10 minutes", 413 when "The request body
# exceeds the maximum of 32 MB" (32,000,000 here; 32 MiB would be the looser reading).
ASR_MAX_S = 600
ASR_MAX_BYTES = 32_000_000
ASR_RATE = 24_000            # docs/speech-to-text: "-ar 24000 uses the model's native sample rate"
# the realtime endpoint (docs/api-reference/voice/realtime, docs/speech-to-text "Advanced")
ASR_WS = "wss://api.meta.ai/v1/asr/realtime"           # "Connect to wss://api.meta.ai/v1/asr/realtime"
ASR_ENCODING = {24_000: "PCM_24KHZ", 16_000: "PCM_16KHZ"}   # schemas "Realtime Handshake Request": audioEncoding
ASR_HANDSHAKE_S = 10.0       # "Send the handshake as the first JSON text frame, within 10 seconds of connecting"
ASR_LEAD_S = 1.0             # audio sent ahead of real time at most: "do not send audio more than five seconds ahead of processing"
ASR_FINAL_S = 15.0           # after endStream, the wait for the final transcript ("Idle output": Meta closes a stalled session too)
ASR_AFTER_FINAL_S = 2.0      # after the final transcript, the wait for Meta's close ("The server closes the socket after the completed transcript")
# realtime "Close codes": 1000 normal completion; the others, as MetaAPIError.type, with what the docs say they mean
ASR_CLOSE = {1008: ("invalid_request", "invalid request, or a streaming-policy failure such as backlog or below-real-time ingress"),
             1011: ("server_error", "internal or backend failure"),
             1013: ("rate_limited", "rate limited")}
# "Set keywords for product names, people, places, acronyms, and other terms the model might mishear": what a
# player asks a piano teacher about
ASR_KEYWORDS = ("piano", "wrist", "wrists", "knuckles", "chord", "chords", "scale", "scales", "arpeggio", "legato",
                "staccato", "fingering", "thumb", "little finger", "phrase", "tempo", "metronome", "octave", "pedal",
                "Debussy", "Museverse")
# A spoken question about one take is biased with that take's own words too (stt_keywords: voice.stt_terms gives them, the
# server only for a take whose analysis may go to Meta). The parameter is documented: docs/api-reference/voice/schemas,
# "Transcribe Request" and "Realtime Handshake Request", keywords "array of string", "Terms to bias recognition toward,
# such as names, jargon, and product words the model would otherwise mishear. Biasing does not guarantee an exact
# spelling"; docs/speech-to-text: "Set them when the session starts ... Neither can change once a session is running."
# Neither page (read again on 2026-10-27) sets a maximum count or length, so the cap is ours, not Meta's: a take's words
# first, then the standing list, at most ASR_KEYWORDS_MAX terms of ASR_KEYWORD_CHARS characters (biasing toward many terms
# dilutes it, and a short list keeps the handshake small). MUSE_STT_KEYWORDS=off sends only what was sent before.
ASR_KEYWORDS_MAX = 50
ASR_KEYWORD_CHARS = 40

# docs/pricing-rate-limits, saved 2026-10-15
PRICE_VIDEO_FRAME = 0.20 / 1000   # "Video segmentation | $0.20 per 1,000 frames"
PRICE_IMAGE = 2.50 / 1000         # "Image segmentation | $2.50 per 1,000 images"
PRICE_AUDIO_HOUR = 0.18           # "Audio processed | $0.18 per hour", "rounded down to whole seconds"
# the Muse text models, USD per input token and per output token (standard tier, never "-contributor": the teacher never
# calls one). Muse Spark 1.x from docs/pricing-rate-limits (2026-11-02); Muse
# Wonder 1.0 at USD 4 per million in and 20 per million out (Meta's list prices, November 2026). Estimates, not invoices:
# result.modelCalls carries them so a job's cost can be summed (token_cost).
TOKEN_USD = {"muse-wonder-1.0": (4.00e-6, 20.00e-6),
             "muse-spark-1.3": (1.25e-6, 4.25e-6), "muse-spark-1.2": (1.25e-6, 4.25e-6), "muse-spark-1.1": (1.25e-6, 4.25e-6)}

# prompts that can match more than the 16 objects a video frame holds, sent per frame as images instead
IMAGE_PROMPTS = ("black piano key",)

# docs/error-handling "Retry strategy": "For transient errors (429, 500, 503), use exponential backoff
# with jitter"; 504: "Do not simply retry"; "Do not retry 400, 401, 402, 403, 404, or 413 errors".
RETRY_STATUS = (429, 500, 503)
RETRY_AFTER_CAP_S = 60.0
# A 500 or 503 is retried after a short jittered wait, never its Retry-After: one 503 "The backend is temporarily
# overloaded" came with Retry-After 60 and cost a take 58 s (1 of 6 hosted runs, our speed study), and the
# other requests of that run answered in about 4 s. RETRY_5XX_PATIENT: the tries a take's own requests get (patient).
RETRY_5XX_S = (2.0, 5.0)
RETRY_5XX_PATIENT = 4
# A take's own requests (patient) never end on a 429: they wait it out (Retry-After, capped above) and go again, for at
# most this long in all. Three 429s used to fail a take after SAM had been paid for.
PATIENT_429_S = 900.0
# The key's request limit a minute, until a response states it (x-ratelimit-limit-requests). docs/pricing-rate-limits
# says 3,000 for sam-3.1; this key's responses said 60 on 2026-11-03, and 16 image requests at once ran into 429s
# after about 75 (our speed study). TEACHER_META_RPM sets it; PACER_SPARE requests a minute are left for the
# key's other callers (the Muse text calls).
DEFAULT_RPM = 60
PACER_SPARE = 2

MASK_DECODER = None   # callable(h, w, encoding, payload) -> (h, w) array of 0/1; None = the compiled one_bit decoder, or
                      # meta_sam_parser, when installed (_fast_decoder, _parser_decoder)


# ------------------------------------------------------------------ errors and transport

class MetaAPIError(RuntimeError):
    """A failed Meta Model API call. status is the HTTP status (None for a timeout or a network failure,
    200 for a failure reported inside an open event stream); type, code, param and message are Meta's
    error body (docs/error-handling: {"error": {"message", "type", "param", "code"}}). partial holds what
    a stream delivered before it failed."""

    def __init__(self, message, *, status=None, type=None, code=None, param=None, body=None,
                 retry_after=None, session_id=None, partial=None, what="Meta API"):
        self.status, self.type, self.code, self.param = status, type, code, param
        self.message = _scrub(str(message))
        self.body = _scrub(body) if isinstance(body, str) else body
        self.retry_after, self.session_id, self.partial, self.what = retry_after, session_id, partial, what
        head = f"{what}: " + (f"HTTP {status}" if status is not None else (type or "error"))
        tags = "/".join(str(x) for x in ((type if status is not None else None), code) if x)
        tail = (f" (param {param})" if param else "") + (f" [session {session_id}]" if session_id else "")
        super().__init__(f"{head}{' ' + tags if tags else ''}: {self.message}{tail}")


def _scrub(text):
    """The key never leaves this module in text, even if a server echoes it."""
    k = os.environ.get("MODEL_API_KEY", "").strip()
    return text.replace(k, "<MODEL_API_KEY>") if (k and len(k) >= 8 and isinstance(text, str)) else text


def _key():
    k = os.environ.get("MODEL_API_KEY", "").strip()
    if not k:
        raise MetaAPIError("MODEL_API_KEY is not set", type="no_key")
    return k


def _base():
    b = os.environ.get("META_API_BASE", DEFAULT_BASE).rstrip("/")
    u = urllib.parse.urlsplit(b)
    if not ((u.scheme == "https" and u.hostname == "api.meta.ai")
            or (u.scheme == "http" and u.hostname in ("127.0.0.1", "localhost", "::1"))):
        raise MetaAPIError(f"META_API_BASE must be https://api.meta.ai/... or a loopback test server, "
                           f"not {u.scheme}://{u.hostname}", type="bad_base")
    return b


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """urllib re-sends the Authorization header to wherever a 3xx points; refuse to follow instead."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _opener(url):
    loopback = urllib.parse.urlsplit(url).hostname in ("127.0.0.1", "localhost", "::1")
    handlers = [_NoRedirect()] + ([urllib.request.ProxyHandler({})] if loopback else [])
    return urllib.request.build_opener(*handlers)


def _http_error(e, what, session_id=None):
    raw = b""
    try:
        raw = e.read(65536)
    except Exception:
        pass
    text = raw.decode("utf-8", "replace").strip()
    retry_after = e.headers.get("Retry-After") if e.headers else None
    err = None
    try:
        j = json.loads(text)
        if isinstance(j, dict):
            err = j["error"] if isinstance(j.get("error"), dict) else (j if "message" in j else None)
    except ValueError:
        pass
    if err:   # docs/error-handling "Error response format"
        msg, typ, code, param = err.get("message") or "", err.get("type"), err.get("code"), err.get("param")
    else:
        # docs/error-handling: an unknown path "returns HTTP 404 with an empty response body"; the Files
        # list endpoint can answer 400 "with a plain-text body"
        msg, typ, code, param = (text[:500] if text else f"no error body ({e.reason})"), None, None, None
    return MetaAPIError(msg, status=e.code, type=typ, code=code, param=param, body=text[:2000] or None,
                        retry_after=retry_after, session_id=session_id, what=what)


def _is_timeout(e):
    return isinstance(e, (TimeoutError, socket.timeout)) or (
        isinstance(e, urllib.error.URLError) and isinstance(e.reason, (TimeoutError, socket.timeout)))


class Stopped(Exception):
    """A request that was never sent: its call was stopped (another request of the take failed)."""


def _num_header(headers, name):
    try:
        v = headers.get(name) if headers is not None else None
        return int(float(v)) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


class RatePacer:
    """One key's requests a minute, paced so they stay under its limit instead of running into 429s.

    limit - PACER_SPARE requests in any minute (window_s), counted from when each was answered (release; from when it
    was sent until then), so a take's 150 black-key requests at 60 a minute go as three bursts a minute apart. Meta's
    own count behaves so: on the Chopin take (2026-11-03) x-ratelimit-remaining-requests still said 60 with 16 requests
    sent and 2 answered, fell as they were answered, and rose again a minute after the answers. The limit is
    DEFAULT_RPM (or TEACHER_META_RPM) until a response states it (x-ratelimit-limit-requests). What the key used beyond
    this pacer's own requests (the key's other callers), as x-ratelimit-remaining-requests says it, is counted in the
    window as answered then. A 429 holds every request for its Retry-After (pause). high: the take's critical requests
    (the clip's upload and its video prompts) go before the black keys waiting. booked(n): room for n of them is kept
    in the window (_Booked), so the black keys sent from the start cannot fill the minute before the clip is up:
    without it the upload waited a minute and the video prompts another. One pacer per process (PACER): the limit is
    the key's, not a job's. clock and wait: the time and the waiting (tests give their own).

    Two earlier forms, measured on the Chopin take: a token bucket refilling one a second after a burst of 58 sent
    about 115 in the first minute and met two 429s (SAM 143.8 s); the window with that bucket still beside it, lowered
    by every remaining header, sent the black keys after the first minute one a second while Meta said about 20 were
    left (SAM 161.4 s, no 429)."""

    def __init__(self, rpm=None, clock=None, wait=None, window_s=60.0):
        self.cv = threading.Condition()
        self.clock = clock or time.monotonic
        self._wait = wait or (lambda cv, s: cv.wait(s))
        try:
            env = float(os.environ.get("TEACHER_META_RPM") or 0)
        except ValueError:
            env = 0.0
        self.limit = float(rpm or env or DEFAULT_RPM)
        self.window_s = float(window_s)
        self.hold_until, self.high_waiting = 0.0, 0
        self.reserved = 0                          # room kept for booked requests (booked)
        # [time, answered, other] per request in the window: time is when it was sent, then when it was answered
        # (release); other: the key's other callers' use, as a remaining header said it (observe)
        self.recent = []
        self.stats = dict(sent=0, waited=0, waitedS=0.0, r429=0, limit=None, remainingMin=None)

    def _cap(self):
        return max(1.0, self.limit - PACER_SPARE)

    def _expire(self, now):
        # a request still waiting for its answer stays in the window however long it takes (a clip's upload)
        self.recent = [e for e in self.recent if not e[1] or e[0] > now - self.window_s]

    def booked(self, n):
        """A view of this pacer whose requests may use room kept for them: n of them (at most half the limit), until
        they have gone or close() gives the rest back."""
        return _Booked(self, n)

    def acquire(self, high=False, stop=None, booking=None):
        """Waits for a request's turn; raises Stopped when stop is set first. Returns the request's entry in the window,
        for release() when it is answered. booking (a _Booked with room left): the request may use the room kept."""
        t0 = self.clock()
        with self.cv:
            if high:
                self.high_waiting += 1
            try:
                while True:
                    if stop is not None and stop.is_set():
                        raise Stopped("stopped before it was sent")
                    now = self.clock()
                    self._expire(now)
                    held = self.hold_until - now
                    mine = booking is not None and booking.left > 0
                    kept = 0 if mine else self.reserved      # the room kept for booked requests is not this one's
                    full = len(self.recent) >= self._cap() - kept
                    if held <= 0 and not full and (high or not self.high_waiting):
                        entry = [now, False, False]
                        self.recent.append(entry)
                        if mine:
                            booking.left -= 1
                            self.reserved -= 1
                        break
                    if held > 0:
                        wait = held
                    elif full:                     # the oldest answered leaves the window (release() wakes us too)
                        done = [e[0] for e in self.recent if e[1]]
                        wait = min(done) + self.window_s - now if done else 1.0
                    else:
                        wait = 0.05                # a critical request goes first (it notifies when it has)
                    self._wait(self.cv, min(1.0, max(0.01, wait)))
            finally:
                if high:
                    self.high_waiting -= 1
                    self.cv.notify_all()
            self.stats["sent"] += 1
            waited = self.clock() - t0
            if waited > 0.05:
                self.stats["waited"] += 1
                self.stats["waitedS"] = round(self.stats["waitedS"] + waited, 2)
            return entry

    def release(self, entry):
        """The request was answered (or failed): its minute counts from now, as the key's limit counts it."""
        if entry is None:
            return
        with self.cv:
            entry[0], entry[1] = max(entry[0], self.clock()), True
            self.cv.notify_all()

    def observe(self, headers, answered=True):
        """A response's rate-limit headers (sent with 429s too). On an answer (answered; not an error, whose own wait
        is its Retry-After), the key's use that remaining says beyond this pacer's own requests in the window is the
        key's other callers': counted as answered now. (Meta's count trails this pacer's, which holds each request from
        when it is sent, so on a key nobody else uses it adds nothing.)"""
        lim, rem = _num_header(headers, "x-ratelimit-limit-requests"), _num_header(headers, "x-ratelimit-remaining-requests")
        if lim is None and rem is None:
            return
        with self.cv:
            now = self.clock()
            self._expire(now)
            if lim and lim > 0:
                self.limit = float(lim)
                self.stats["limit"] = lim
            if rem is not None:
                m = self.stats["remainingMin"]
                self.stats["remainingMin"] = rem if m is None else min(m, rem)
            if rem is not None and answered:
                own = sum(1 for e in self.recent if not e[2])
                other = sum(1 for e in self.recent if e[2])
                more = int(self.limit) - rem - own - other
                self.recent.extend([now, True, True] for _ in range(max(0, more)))
            self.cv.notify_all()

    def pause(self, seconds):
        """A 429: no request goes for `seconds`."""
        with self.cv:
            now = self.clock()
            self.hold_until = max(self.hold_until, now + max(0.0, seconds))
            self.stats["r429"] += 1
            self.cv.notify_all()

    def snapshot(self):
        with self.cv:
            return dict(self.stats, limitNow=self.limit)


class _Booked:
    """RatePacer.booked(n): the pacer as its requests see it, with room kept for n of them (a take's clip upload, its
    video prompts and the upload's delete). Every other call goes to the pacer."""

    def __init__(self, pacer, n):
        self.pacer = pacer
        with pacer.cv:
            self.left = max(0, min(int(n), int(pacer._cap() // 2) - pacer.reserved))
            pacer.reserved += self.left

    def acquire(self, high=False, stop=None):
        return self.pacer.acquire(high, stop, booking=self)

    def close(self):
        """The room not used is given back."""
        with self.pacer.cv:
            self.pacer.reserved -= self.left
            self.left = 0
            self.pacer.cv.notify_all()

    def __getattr__(self, name):
        return getattr(self.pacer, name)


PACER = RatePacer()


def _retry_after_s(err):
    try:
        return max(0.0, float(err.retry_after))
    except (TypeError, ValueError):
        return None


def _request(method, path, *, data=None, headers=None, query=None, timeout=60.0, retries=2,
             what="Meta API", session_id=None, pacer=None, high=False, patient=False, stop=None):
    """One call with retries on 429/500/503. data is bytes or a zero-argument function returning (iterable of bytes,
    length), so a streamed upload can be replayed. Returns the open response; the caller reads and closes it.

    A 429 waits its Retry-After (capped at a minute); a 500 or 503 waits a short jittered RETRY_5XX_S, or its
    Retry-After when that is shorter. retries: the tries after the first. pacer (a RatePacer): every try waits for its
    turn (high: before the others waiting) and tells it the response's rate-limit headers; a 429 pauses it for every
    request. patient (a take's own requests): a 429 is never the end (it is waited out and tried again, not
    counted against retries, for up to PATIENT_429_S), and a 500 or 503 gets RETRY_5XX_PATIENT tries. stop (an Event):
    a try not yet sent when it is set is not sent (Stopped)."""
    key = _key()
    url = _base() + path + ("?" + urllib.parse.urlencode(query) if query else "")
    opener = _opener(url)
    attempt = 0
    t_first = time.time()
    while True:
        slot = None
        if pacer is not None:
            slot = pacer.acquire(high, stop)
        elif stop is not None and stop.is_set():
            raise Stopped("stopped before it was sent")
        body, length = data() if callable(data) else (data, None)
        h = dict(headers or {})
        h["Authorization"] = f"Bearer {key}"   # docs/api-reference: "Authorization: Bearer $MODEL_API_KEY"
        if length is not None:
            h["Content-Length"] = str(length)
        h.setdefault("User-Agent", USER_AGENT)
        req = urllib.request.Request(url, data=body, method=method, headers=h)
        t0 = time.time()
        try:
            try:
                resp = opener.open(req, timeout=timeout)
            finally:
                if pacer is not None:
                    pacer.release(slot)    # the request's minute counts from its answer
            log.debug("%s %s -> %s in %.2f s", method, path, resp.status, time.time() - t0)
            if pacer is not None:
                pacer.observe(resp.headers)
            return resp
        except urllib.error.HTTPError as e:
            if pacer is not None:
                pacer.observe(e.headers, answered=False)
            err = _http_error(e, what, session_id)
            e.close()
            log.debug("%s %s -> HTTP %s in %.2f s", method, path, e.code, time.time() - t0)
            ra = _retry_after_s(err)
            if e.code == 429 and patient and time.time() - t_first < PATIENT_429_S:
                wait = min(RETRY_AFTER_CAP_S, ra if ra is not None else 0.5 * 2 ** min(attempt, 5) + random.random() * 0.5)
                if pacer is not None:
                    pacer.pause(wait)
                else:
                    time.sleep(wait)
                continue
            tries = (RETRY_5XX_PATIENT if patient else retries) if e.code in (500, 503) else retries
            if e.code in RETRY_STATUS and attempt < tries:
                if e.code == 429:
                    wait = min(RETRY_AFTER_CAP_S, ra) if ra is not None else 0.5 * 2 ** attempt + random.random() * 0.5
                    if pacer is not None:
                        pacer.pause(wait)
                    else:
                        time.sleep(wait)
                else:
                    jitter = random.uniform(*RETRY_5XX_S)
                    time.sleep(min(ra, jitter) if ra is not None else jitter)
                attempt += 1
                continue
            raise err from None
        except Exception as e:
            if _is_timeout(e):
                raise MetaAPIError(f"no response within {timeout:g} s", type="timeout",
                                   session_id=session_id, what=what) from None
            if isinstance(e, urllib.error.URLError):
                raise MetaAPIError(f"could not reach {urllib.parse.urlsplit(url).hostname}: {e.reason}",
                                   type="network", session_id=session_id, what=what) from None
            raise


def _multipart(parts):
    """multipart/form-data, in the order given. parts: dicts with name, and data (bytes or str) or path,
    and optionally filename and type. Files stream from disk. Returns (body factory, content type)."""
    boundary = uuid.uuid4().hex
    heads, total = [], 0
    for p in parts:
        h = f'--{boundary}\r\nContent-Disposition: form-data; name="{p["name"]}"'
        if p.get("filename"):
            h += f'; filename="{re.sub(r"[^A-Za-z0-9._-]", "_", p["filename"])}"'
        h += "\r\n" + (f"Content-Type: {p['type']}\r\n" if p.get("type") else "") + "\r\n"
        h = h.encode()
        if "data" in p and isinstance(p["data"], str):
            p = dict(p, data=p["data"].encode())
        heads.append((h, p))
        total += len(h) + (os.path.getsize(p["path"]) if p.get("path") else len(p["data"])) + 2
    tail = f"--{boundary}--\r\n".encode()
    total += len(tail)

    def body():
        def gen():
            for h, p in heads:
                yield h
                if p.get("path"):
                    with open(p["path"], "rb") as f:
                        while True:
                            chunk = f.read(1 << 20)
                            if not chunk:
                                break
                            yield chunk
                else:
                    yield p["data"]
                yield b"\r\n"
            yield tail
        return gen(), total
    return body, f"multipart/form-data; boundary={boundary}"


def _sse(resp):
    """(event name, data) per server-sent event; stops at "data: [DONE]" (docs/sam/segmenting, requests
    example: 'if data == "[DONE]": break')."""
    name, buf = None, []
    for raw in resp:
        line = raw.decode("utf-8", "replace").rstrip("\r\n")
        if not line:
            if buf:
                data = "\n".join(buf)
                buf = []
                if data == "[DONE]":
                    return
                yield name, json.loads(data)
            name = None
            continue
        if line.startswith(":"):
            continue
        field, _, val = line.partition(":")
        val = val[1:] if val.startswith(" ") else val
        if field == "event":
            name = val
        elif field == "data":
            buf.append(val)
    if buf and "\n".join(buf) != "[DONE]":
        yield name, json.loads("\n".join(buf))


def _output_text(response):
    """The output_text of a Responses object (docs/protocols/responses "Example response": output[] ->
    {"type": "message", "content": [{"type": "output_text", "text": ...}]})."""
    out = []
    for item in (response or {}).get("output") or []:
        if item.get("type") == "message":
            out += [c.get("text") or "" for c in item.get("content") or [] if c.get("type") == "output_text"]
    return "".join(out)


# ------------------------------------------------------------------ SAM 3.1: request and wire format

def _sam_responses(content, *, stream=True, store=False, mask_encoding="one_bit", timeout=600.0,
                   retries=2, on_text=None, what="SAM 3.1", pacer=None, high=False, patient=False, stop=None):
    """One SAM 3.1 Responses call. content: the user message's parts. Returns the output_text. pacer, high, patient
    and stop: as _request takes them.

    Body (docs/sam/overview "Anatomy of a request"): "Send one user message: a short input_text phrase
    naming the object, plus one media part", model "sam-3.1", "stream": true, and
    docs/sam/segmenting "Choose a mask encoding": "Set the top-level metadata.mask_encoding field".
    store=False keeps the response (and its inline media) off Meta's storage; it is a Responses
    parameter (docs/protocols/responses) but no SAM example shows it, so pass store=None to send the
    exact documented SAM body if sam-3.1 should reject it."""
    body = {"model": SAM_MODEL, "input": [{"type": "message", "role": "user", "content": content}], "stream": bool(stream)}
    if mask_encoding:
        body["metadata"] = {"mask_encoding": mask_encoding}   # "lossless" (default, "~") or "one_bit" ("!")
    if store is not None:
        body["store"] = bool(store)
    data = json.dumps(body).encode()
    resp = _request("POST", "/responses", data=data, timeout=timeout, retries=retries, what=what,
                    headers={"Content-Type": "application/json",
                             "Accept": "text/event-stream" if stream else "application/json"},
                    pacer=pacer, high=high, patient=patient, stop=stop)
    text = []
    try:
        with resp:
            if not stream:
                r = json.loads(resp.read())
                if r.get("status") not in (None, "completed"):
                    e = r.get("error") or {}
                    raise MetaAPIError(e.get("message") or f"response status {r.get('status')}", status=200,
                                       type=r.get("status"), code=e.get("code"), what=what)
                return _output_text(r)
            # docs/sam/reading-segmentation: "Each frame emits one response.output_text.delta event holding
            # one line. The stream terminates on response.completed." docs/error-handling "Streaming errors":
            # failures arrive as "response.failed" (error inside the response object) or "error" (code and
            # message at the top level); docs/sam/client-libraries: "incomplete ... when the API emitted
            # response.incomplete, or eof when the event source ended without a terminal event".
            for name, ev in _sse(resp):
                t = ev.get("type") or name
                if t == "response.output_text.delta":
                    d = ev.get("delta") or ""
                    text.append(d)
                    if on_text:
                        on_text(d)
                elif t == "response.completed":
                    # "Zero matches ... the stream completes with an empty output_text"
                    return "".join(text) or _output_text(ev.get("response"))
                elif t == "response.failed":
                    e = (ev.get("response") or {}).get("error") or {}
                    raise MetaAPIError(e.get("message") or "response failed", status=200, type="response_failed",
                                       code=e.get("code"), partial="".join(text), what=what)
                elif t == "response.incomplete":
                    det = (ev.get("response") or {}).get("incomplete_details") or {}
                    raise MetaAPIError(f"response incomplete: {det.get('reason') or 'no reason given'}", status=200,
                                       type="incomplete", partial="".join(text), what=what)
                elif t == "error":
                    raise MetaAPIError(ev.get("message") or "stream error", status=200, type="stream_error",
                                       code=ev.get("code"), partial="".join(text), what=what)
            raise MetaAPIError("the stream ended without response.completed", status=200, type="incomplete",
                               partial="".join(text), what=what)
    except MetaAPIError:
        raise
    except Exception as e:
        if _is_timeout(e):
            raise MetaAPIError(f"the stream stalled for more than {timeout:g} s", type="timeout",
                               partial="".join(text), what=what) from None
        if isinstance(e, (OSError, ValueError)) or type(e).__module__ == "http.client":
            raise MetaAPIError(f"reading the response failed: {type(e).__name__}: {e}", type="network",
                               partial="".join(text), what=what) from None
        raise


# docs/sam/reading-segmentation "Line structure":
#   line ::= FRAME record ( "," record )*      FRAME ::= "<" INT "f>"   record ::= OBJECT_ID box mask
#   box  ::= "<|box;x1=" INT ";y1=" INT ";x2=" INT ";y2=" INT ";w=" INT ";h=" INT "|>"
#   mask ::= "<|mask;x=0;y=0;data=" H "," W "," ENC PAYLOAD "|>"     ENC ::= "~" lossless | "!" one_bit
# "read only the first character after H,W, as the marker" (the payload itself can hold "~" and "!").
_FRAME_RE = re.compile(r"<(\d+)f>")
_REC_RE = re.compile(r"(\d+)<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)\|>"
                     r"<\|mask;x=(\d+);y=(\d+);data=(\d+),(\d+),(.)(.*?)\|>", re.S)
_ENC = {"~": "lossless", "!": "one_bit"}


def parse_segmentation(text):
    """SAM 3.1's output_text -> (frames, diagnostics). frames: [{frame_index, width, height, objects:
    [{id, score, box, mask_xy, mask_hw, mask_encoding, mask_payload}]}] in stream order.

    Frame indices are read from the markers, never from line order: "zero-indexed but not necessarily
    contiguous. A frame on which no object is visible emits no line". Object ids are "a stable per-object
    id across frames ... not a dense 0-based sequence". As Meta's parser does, a malformed record is left
    out and reported in diagnostics rather than failing the whole response."""
    parts = _FRAME_RE.split(text or "")
    frames, diag = [], []
    if parts[0].strip():
        diag.append(f"text before the first frame marker: {parts[0][:80]!r}")
    for i in range(1, len(parts), 2):
        n, body = int(parts[i]), parts[i + 1].strip()
        objs, pos, size = [], 0, None
        for m in _REC_RE.finditer(body):
            gap = body[pos:m.start()].strip()
            if gap not in ("", ","):
                diag.append(f"frame {n}: unparsed text {gap[:80]!r}")
            pos = m.end()
            oid, x1, y1, x2, y2, fw, fh, mx, my, mh, mw = (int(m[k]) for k in range(1, 12))
            if x2 < x1 or y2 < y1:
                diag.append(f"frame {n} object {oid}: empty box")
                continue
            size = size or (fw, fh)
            objs.append({"id": oid, "score": None, "box": [x1, y1, x2 + 1, y2 + 1], "mask_xy": [x1, y1],
                         "mask_hw": [mh, mw], "mask_encoding": _ENC.get(m[12], m[12]), "mask_payload": m[13]})
        if body[pos:].strip(" ,\n"):
            diag.append(f"frame {n}: unparsed text {body[pos:][:80]!r}")
        frames.append({"frame_index": n, "width": size[0] if size else None, "height": size[1] if size else None,
                       "objects": objs})
    return frames, diag


_PARSER = {}


def _parser_decoder():
    """decode(h, w, encoding, payload) from Meta's meta_sam_parser (pip install meta_sam_parser, SAM License), or
    None when it is not installed. The wire payload is a length and a compressed body that only this parser reads,
    and without it the outlines are boxes, from which the tracker cannot find the camera (README.md).

    meta_sam_parser 0.1.0: SegmentationMask(encoding, payload, width, height), whose payload keeps the wire's
    marker as its first character (parse_segmentation splits it off), and decode_mask_to_raster returns bytes,
    row-major, exactly width * height of them, each 0 or 1 (it raises InvalidSegmentationMaskError on a payload
    that does not decode to that size)."""
    if "fn" in _PARSER:
        return _PARSER["fn"]
    try:
        import meta_sam_parser as msp
    except ImportError:
        _PARSER["fn"] = None
        return None
    marks = {v: k for k, v in _ENC.items()}

    def decode(h, w, enc, payload):
        mask = msp.SegmentationMask(enc, marks.get(enc, "") + payload, w, h)
        return np.frombuffer(msp.decode_mask_to_raster(mask), dtype=np.uint8)
    _PARSER["fn"] = decode
    return decode


def _one_bit_kernel(inp, width, height):
    """meta_sam_parser 0.1.0's one_bit decoder (_mask_codec._decode_raster: its 12-pixel context, its adaptive counts and
    its range decoder), written to be compiled (numba: _fast_decoder), with the parser's own check that the payload is
    canonical (decode_mask_to_raster encodes the raster again and wants the same payload) done in the same pass by the
    range encoder's state beside the decoder's. inp: the payload's bytes (_mask_codec._unpack). Returns (raster, 0): a
    uint8 0/1 array of width * height; or (partial raster, code) where the parser would raise: 1 no finalization, 2 a
    bad coding state, 3 the input ran out, 4 not canonical. A port of the parser (SAM License), checked against it mask
    for mask (test_speed_sam.py; 0 of 5,321 masks of a take differ, our speed study)."""
    M = 0xFFFFFFFF
    TOP = 1 << 24
    BOTTOM = 1 << 16
    n_in = inp.shape[0]
    out = np.zeros(width * height, np.uint8)
    if n_in < 4:
        return out, 1
    pos = 0
    code = 0
    for _ in range(4):
        code = ((code << 8) | np.int64(inp[pos])) & M
        pos += 1
    low = 0
    rng = M
    elow = 0                                   # the encoder's state: the bytes it would write must be inp's own
    erng = M
    o = 0
    counts = np.ones(4096 * 2, np.int64)
    pw = width + 4
    padded = np.zeros(pw * (height + 2), np.uint8)
    for y in range(height):
        row = (y + 2) * pw + 2
        for x in range(width):
            p = row + x
            pr = p - pw
            ea = p - 2 * pw
            ctx = (np.int64(padded[p - 1]) | (np.int64(padded[p - 2]) << 1) | (np.int64(padded[pr - 2]) << 2)
                   | (np.int64(padded[pr - 1]) << 3) | (np.int64(padded[pr]) << 4) | (np.int64(padded[pr + 1]) << 5)
                   | (np.int64(padded[pr + 2]) << 6) | (np.int64(padded[ea - 2]) << 7) | (np.int64(padded[ea - 1]) << 8)
                   | (np.int64(padded[ea]) << 9) | (np.int64(padded[ea + 1]) << 10) | (np.int64(padded[ea + 2]) << 11))
            off = ctx << 1
            zero = counts[off]
            one = counts[off + 1]
            total = zero + one
            scaled = rng // total
            if scaled == 0:
                return out, 2
            value = ((code - low) & M) // scaled
            if value >= total:
                value = total - 1
            if value < zero:
                bit = 0
                cum = 0
                freq = zero
            else:
                bit = 1
                cum = zero
                freq = one
            low = (low + scaled * cum) & M
            rng = scaled * freq
            while True:
                if (low ^ ((low + rng) & M)) < TOP:
                    pass
                elif rng < BOTTOM:
                    rng = ((-low) & M) & (BOTTOM - 1)
                else:
                    break
                if pos >= n_in:
                    return out, 3
                code = ((code << 8) | np.int64(inp[pos])) & M
                pos += 1
                low = (low << 8) & M
                rng = (rng << 8) & M
            escaled = erng // total
            elow = (elow + escaled * cum) & M
            erng = escaled * freq
            while True:
                if (elow ^ ((elow + erng) & M)) < TOP:
                    pass
                elif erng < BOTTOM:
                    erng = ((-elow) & M) & (BOTTOM - 1)
                else:
                    break
                if o >= n_in or np.int64(inp[o]) != ((elow >> 24) & 0xFF):
                    return out, 4
                o += 1
                elow = (elow << 8) & M
                erng = (erng << 8) & M
            padded[p] = bit
            out[y * width + x] = bit
            counts[off + bit] = (counts[off + bit] + 14) & 0xFFFF
            if counts[off] + counts[off + 1] >= 4096:
                a = counts[off] >> 1
                b = counts[off + 1] >> 1
                counts[off] = a if a else 1
                counts[off + 1] = b if b else 1
    for _ in range(4):                         # the encoder's finish: its last four bytes, then nothing more
        if o >= n_in or np.int64(inp[o]) != ((elow >> 24) & 0xFF):
            return out, 4
        o += 1
        elow = (elow << 8) & M
    return out, (0 if o == n_in else 4)


_FAST = {}


def _fast_possible():
    """Whether _fast_decoder can be had, without compiling it: meta_sam_parser and numba are here and it is not off."""
    import importlib.util
    if _parser_decoder() is None or os.environ.get("TEACHER_SAM_DECODER", "").strip().lower() == "parser":
        return False
    return _FAST["fn"] is not None if "fn" in _FAST else importlib.util.find_spec("numba") is not None


def _fast_decoder():
    """decode(h, w, encoding, payload) like _parser_decoder's, with the one_bit masks on _one_bit_kernel compiled by
    numba (a take's 5,321 masks in about 3 s against 65 s on 8 processes of the parser: our speed study), and
    meta_sam_parser deciding anything else: a lossless mask, and any payload the compiled one refuses (so a bad payload
    fails with the parser's own error). None when numba or meta_sam_parser is missing, or TEACHER_SAM_DECODER=parser.
    Compiled once per process (about 1.5 s; cached on disk where numba can write its cache)."""
    parser = _parser_decoder()
    if parser is None or os.environ.get("TEACHER_SAM_DECODER", "").strip().lower() == "parser":
        return None
    if "fn" in _FAST:
        return _FAST["fn"]
    try:
        import numba
        from meta_sam_parser import _mask_codec as codec
        kernel = numba.njit(cache=True, nogil=True)(_one_bit_kernel)
    except Exception:                          # ImportError, or a numba that cannot compile here
        _FAST["fn"] = None
        return None

    def decode(h, w, enc, payload):
        if enc == "one_bit":
            try:
                raster, err = kernel(np.frombuffer(codec._unpack(payload), np.uint8), int(w), int(h))
                if not err:
                    return raster
            except Exception:
                pass
        return parser(h, w, enc, payload)
    _FAST["fn"] = decode
    return decode


def decode_mask(obj):
    """The object's mask as a bool array the size of its box (origin obj["mask_xy"]), or None when no
    decoder is available. Raises on a payload the decoder rejects."""
    fn = MASK_DECODER or _fast_decoder() or _parser_decoder()
    if fn is None:
        return None
    mh, mw = obj["mask_hw"]
    m = np.asarray(fn(mh, mw, obj["mask_encoding"], obj["mask_payload"]), dtype=np.uint8)
    # docs/sam/client-libraries: "a row-major Uint8Array of exactly width * height entries, each 0 or 1"
    m = m.reshape(mh, mw).astype(bool)
    x0, y0, x1, y1 = obj["box"]
    bh, bw = y1 - y0, x1 - x0
    if (bh, bw) != (mh, mw):   # not seen in any documented example: stretch the raster onto the box
        m = m[(np.arange(bh) * mh) // bh][:, (np.arange(bw) * mw) // bw]
    return m


DECODE_WORKERS = max(1, min(8, os.cpu_count() or 1))   # processes for meta_sam_parser's masks (_decode_all)
DECODE_POOL_MIN = 16                                    # fewer masks than this decode in this process


def _decode_slim(o):
    """decode_mask in a worker process: ((packed bits, shape) or None, error or None), never raising."""
    try:
        m = decode_mask(o)
        return (None if m is None else (np.packbits(m, axis=None), m.shape)), None
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"[:200]


def _decode_all(objs, diag, workers=None):
    """_decode_into for every object, in this process with the compiled decoder (_fast_decoder), else on DECODE_WORKERS
    worker processes when meta_sam_parser does the decoding: it is
    pure Python, about 4 us a pixel (a keyboard mask about a second, measured 2026-10-30), and one take has thousands
    of masks, so in one process the decoding outlasts the requests. Each worker is a fresh interpreter running this
    file (--decode-masks): never a fork of this process, whose other threads (the server's, the fingertip
    reader's) a fork could leave holding a lock. MASK_DECODER (a stand-in in the tests) and short lists decode here;
    workers that fail, or outlast twice this process's own speed, are stopped and the masks decoded here, with a line
    in diag."""
    objs = list(objs)
    n = DECODE_WORKERS if workers is None else int(workers)
    if (MASK_DECODER is not None or _fast_decoder() is not None or _parser_decoder() is None or n <= 1
            or len(objs) < DECODE_POOL_MIN):
        for o in objs:
            _decode_into(o, diag)
        return
    n = min(n, len(objs))
    slim = [{k: o[k] for k in ("box", "mask_hw", "mask_encoding", "mask_payload")} for o in objs]
    limit = 60.0 + 8e-6 * sum(int(o["mask_hw"][0]) * int(o["mask_hw"][1]) for o in slim)
    tmp = tempfile.mkdtemp(prefix="meta_dec_")
    procs = []
    try:
        for j in range(n):
            src, dst = os.path.join(tmp, f"in{j}.json"), os.path.join(tmp, f"out{j}.npz")
            with open(src, "w") as fh:
                json.dump(slim[j::n], fh)
            procs.append((subprocess.Popen([sys.executable, "-I", os.path.abspath(__file__), "--decode-masks", src, dst],
                                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE), dst))
        end = time.time() + limit
        got = {}
        for j, (pr, dst) in enumerate(procs):
            _, err = pr.communicate(timeout=max(1.0, end - time.time()))
            if pr.returncode:
                raise RuntimeError(f"worker exit {pr.returncode}: {(err.decode(errors='replace').strip().splitlines() or ['?'])[-1][:160]}")
            with np.load(dst, allow_pickle=False) as z:
                errors = json.loads(str(z["errors"]))
                for k in range(len(slim[j::n])):
                    i = j + k * n
                    if str(k) in errors:
                        got[i] = (None, errors[str(k)])
                    elif f"m{k}" in z:
                        h, w = (int(v) for v in z[f"s{k}"])
                        got[i] = (np.unpackbits(z[f"m{k}"], count=h * w).reshape(h, w).astype(bool), None)
                    else:
                        got[i] = (None, None)
    except Exception as e:
        for pr, _ in procs:
            if pr.poll() is None:
                pr.kill()
        for pr, _ in procs:
            try:
                pr.wait(timeout=10)
            except Exception:
                pass
        diag.append(f"mask decoding on {n} processes failed ({type(e).__name__}: {e}"[:300] + "); decoded in one")
        for o in objs:
            _decode_into(o, diag)
        return
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    for i, o in enumerate(objs):
        m, err = got[i]
        o["mask"] = m
        if err:
            o["mask_error"] = err
            if not any(d.startswith("mask decoding failed") for d in diag):
                diag.append(f"mask decoding failed ({err}); boxes used")


def _decode_masks_main(src, dst):
    """python meta_api.py --decode-masks SRC DST (a _decode_all worker): decode_mask for each object in SRC, a JSON
    list of {box, mask_hw, mask_encoding, mask_payload}, into DST, an .npz of packed bits m<k> and shapes s<k>, with
    each one that did not decode in its "errors" (a JSON object, index to message)."""
    with open(src) as fh:
        items = json.load(fh)
    out, errors = {}, {}
    for k, o in enumerate(items):
        got, err = _decode_slim(o)
        if err:
            errors[str(k)] = err
        elif got is not None:
            out[f"m{k}"], out[f"s{k}"] = got[0], np.array(got[1], dtype=np.int64)
    np.savez(dst, errors=np.array(json.dumps(errors)), **out)


def _decode_into(obj, diag):
    """decode_mask that never raises: a payload the decoder rejects leaves mask None and says why once,
    so one bad mask neither fails nor repeats a paid request."""
    try:
        obj["mask"] = decode_mask(obj)
    except Exception as e:
        obj["mask"] = None
        obj["mask_error"] = f"{type(e).__name__}: {e}"[:200]
        if not any(d.startswith("mask decoding failed") for d in diag):
            diag.append(f"mask decoding failed ({obj['mask_error']}); boxes used")


# ------------------------------------------------------------------ media helpers

def _ffprobe_json(args, path):
    if not shutil.which(FFPROBE):
        raise RuntimeError(f"{FFPROBE} is needed to read {os.path.basename(path)}")
    p = subprocess.run([FFPROBE, "-v", "error"] + args + ["-of", "json", path], capture_output=True, text=True)
    if p.returncode:
        raise ValueError(f"not a video ffprobe can read: {(p.stderr.strip().splitlines() or ['?'])[-1]}")
    return json.loads(p.stdout or "{}")


def probe_video(path):
    """Container, codec, size, rotation and the time of every frame (t = 0 at the first) of a local file.

    How SAM's frame index maps to time: docs/sam/reading-segmentation "<Nf> ... N is the frame index,
    zero-indexed", docs/sam/segmenting "Frames and timestamps are unchanged, so boxes and masks map exactly
    onto your original video", and docs/sam/client-libraries "The frames you decode and play here match
    the frames the model segmented, so overlays line up by frame index". So frame N is the Nth frame in
    presentation order, and its time is that frame's timestamp. Times come from the packets' integer
    timestamps (sorted, discarded packets left out) and the stream time base, without decoding."""
    d = _ffprobe_json(["-select_streams", "v:0", "-show_entries",
                       "stream=codec_name,width,height,time_base:stream_side_data=rotation:format=format_name"
                       ":packet=pts,dts,flags"], path)
    st = (d.get("streams") or [None])[0]
    if st is None:
        raise ValueError("the file has no video stream")
    tb = Fraction(st.get("time_base", "1/1"))
    pts = []
    for p in d.get("packets") or []:
        if "D" in (p.get("flags") or ""):   # discarded by the edit list: never shown, never a frame
            continue
        v = p.get("pts") if p.get("pts") not in (None, "N/A") else p.get("dts")
        if v not in (None, "N/A"):
            pts.append(int(v))
    pts.sort()
    rot = 0
    for sd in st.get("side_data_list") or []:
        if "rotation" in sd:
            rot = int(round(-float(sd["rotation"]) / 90.0)) * 90 % 360
    return {"format": (d.get("format") or {}).get("format_name", ""), "codec": st.get("codec_name"),
            "width": int(st.get("width") or 0), "height": int(st.get("height") or 0), "rotation": rot,
            "frame_times": [round(float((p - pts[0]) * tb), 6) for p in pts] if pts else []}


def _nearest(frame_times, t):
    j = int(np.searchsorted(frame_times, t))
    cand = [i for i in (j - 1, j) if 0 <= i < len(frame_times)]
    return min(cand, key=lambda i: abs(frame_times[i] - t))


def _mp4_for_sam(path, info, tmp):
    """The clip as SAM gets it: the video stream alone, copied into an MP4 with faststart and no
    re-encoding, so the player's voice and room sound never go to Meta for segmentation. The copy is the
    docs' own command minus the audio (docs/sam/segmenting: "ffmpeg -i input.mp4 -c copy -movflags
    +faststart output.mp4"); MP4 because the Files API lists video/mp4 only (docs/file-handling). It must
    have the same frames at the same times as the source, or frame indices would not map back."""
    if info["codec"] not in VIDEO_CODECS:
        raise ValueError(f"SAM 3.1 takes H.264, H.265 or MPEG-4 video in MP4 or MOV, and this is "
                         f"{info['codec']} in {info['format']}. Convert it first (video.py makes an H.264 MP4).")
    out = os.path.join(tmp, "clip.mp4")
    p = subprocess.run([FFMPEG, "-y", "-v", "error", "-i", path, "-map", "0:v:0", "-c", "copy", "-an",
                        "-map_metadata", "-1", "-movflags", "+faststart", out], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(f"copying the video stream failed: {(p.stderr.strip().splitlines() or ['?'])[-1]}")
    got = probe_video(out)["frame_times"]
    want = info["frame_times"]
    if len(got) != len(want) or any(abs(a - b) > 1e-3 for a, b in zip(got, want)):
        raise RuntimeError(f"the video-only copy has {len(got)} frames, the source {len(want)}: frame "
                           f"indices would not map back")
    return out


def _data_url(path, mime):
    with open(path, "rb") as f:
        return f"data:{mime};base64," + base64.b64encode(f.read()).decode()


def _inline_size(path):
    return 4 * math.ceil(os.path.getsize(path) / 3) + 40


def upload_file(path, *, mime="video/mp4", ttl_s=UPLOAD_TTL_S, timeout=600.0, pacer=None, patient=False):
    """POST /v1/files with purpose user_data and an expiry; returns the file id.

    docs/sam/segmenting "Upload once, reference by ID": "-F purpose=user_data -F file=@/path/to/clip.mp4",
    "Upload is synchronous: a 200 means the file is ready". docs/file-handling: "send purpose and all
    expires_after fields before the file part, and make file the final multipart part"; expires_after is
    "anchor" ("The only supported value is created_at") and "seconds" (3600 to 2592000), sent as
    expires_after[anchor] / expires_after[seconds]. Response: {"id": "file-842549258569145", "object":
    "file", "bytes", "created_at", "filename", "purpose": "user_data", "status": "uploaded"}."""
    if os.path.getsize(path) > UPLOAD_MAX:
        raise ValueError(f"{os.path.getsize(path)} bytes is over the Files API's 1 GiB")
    body, ctype = _multipart([
        {"name": "purpose", "data": "user_data"},
        {"name": "expires_after[anchor]", "data": "created_at"},
        {"name": "expires_after[seconds]", "data": str(int(ttl_s))},
        {"name": "file", "path": path, "filename": os.path.basename(path), "type": mime},
    ])
    with _request("POST", "/files", data=body, headers={"Content-Type": ctype}, timeout=timeout,
                  what="Files API upload", pacer=pacer, high=True, patient=patient) as r:
        j = json.loads(r.read())
    fid = j.get("id") or ""
    if not fid.startswith("file-"):   # "a file- prefix followed by a numeric identifier"
        raise MetaAPIError(f"upload answered without a file id: {str(j)[:200]}", status=200, what="Files API upload")
    return fid


def delete_file(file_id, timeout=60.0, pacer=None):
    """DELETE /v1/files/{file_id} (docs/file-handling "Delete a file"). Returns None, or the error text."""
    try:
        with _request("DELETE", "/files/" + urllib.parse.quote(file_id), timeout=timeout, retries=1,
                      what="Files API delete", pacer=pacer, high=True) as r:
            r.read()
        return None
    except MetaAPIError as e:
        return str(e)


# ------------------------------------------------------------------ SAM 3.1: public calls

def sam_segment_video(video, prompt, *, mask_encoding="one_bit", upload="auto", stream=True, store=False,
                      frame_times=None, keep=None, decode_masks=True, timeout=600.0, retries=2, on_frame=None):
    """Every match of ONE text concept through a clip (docs/sam/segmenting: "One concept per request ...
    To segment several concepts, send one request each").

    video: a local MP4/MOV path, an http(s) URL, or a Files API id ("file-..."). A local file goes inline
    as a base64 data URL when that fits the 50 MB inline limit, else through the Files API (deleted
    afterwards); upload=True always uploads, upload=False never does (what ZDR allows). docs/sam/segmenting
    "Build the request": "input_video: a clip as video_url, or as file_id for a video uploaded through the
    Files API", "video_url: a public URL or a base64 data URL".

    Returns the frames SAM emitted, in frame order: {frame_index, time_s, width, height, objects: [{id,
    score (None: the API sends none), box [x0, y0, x1, y1] (right and bottom exclusive), mask (bool array
    the box's size, origin mask_xy; None when it cannot be decoded), mask_xy, mask_hw, mask_encoding,
    mask_payload}], capped}. A frame with no match is absent. capped marks a frame at the 16-object video
    limit, where more matches may have been dropped. time_s comes from frame_times, or from the file
    itself for a local path (probe_video), else None. keep: frame indices to return (others are parsed
    and dropped, to bound memory on long clips). on_frame(frame) is called as each frame arrives."""
    tmp, uploaded = None, None
    try:
        content_video = None
        if isinstance(video, str) and video.startswith("file-"):
            content_video = {"type": "input_video", "file_id": video}
        elif isinstance(video, str) and re.match(r"https?://", video):
            content_video = {"type": "input_video", "video_url": video}
        else:
            info = probe_video(video)
            n = len(info["frame_times"])
            if n > MAX_VIDEO_FRAMES:
                raise ValueError(f"the clip has {n} frames; SAM 3.1 takes at most {MAX_VIDEO_FRAMES} per request")
            if frame_times is None:
                frame_times = info["frame_times"]
            tmp = tempfile.mkdtemp(prefix="meta_sam_")
            clip = _mp4_for_sam(video, info, tmp)
            fits = _inline_size(clip) <= INLINE_MAX
            if upload is True or (upload == "auto" and not fits):
                uploaded = upload_file(clip, timeout=timeout)
                content_video = {"type": "input_video", "file_id": uploaded}
            elif not fits:
                raise ValueError(f"the clip is {os.path.getsize(clip)} bytes, over the 50 MB inline limit, "
                                 f"and uploads are off (upload=False)")
            else:
                content_video = {"type": "input_video", "video_url": _data_url(clip, "video/mp4")}
        return _segment_video_request(content_video, prompt, mask_encoding=mask_encoding, stream=stream,
                                      store=store, frame_times=frame_times, keep=keep, decode_masks=decode_masks,
                                      timeout=timeout, retries=retries, on_frame=on_frame)
    finally:
        if uploaded:
            delete_file(uploaded)
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)


def _segment_video_request(content_video, prompt, *, mask_encoding, stream, store, frame_times, keep,
                           decode_masks, timeout, retries, on_frame, diag=None, pacer=None, high=False, patient=False,
                           stop=None):
    frames = {}
    diag = diag if diag is not None else []
    pending, seen = [""], [False]

    def finish(text):
        fs, d = parse_segmentation(text)
        diag.extend(d)
        for f in fs:
            n = f["frame_index"]
            f["time_s"] = frame_times[n] if frame_times is not None and n < len(frame_times) else None
            f["capped"] = len(f["objects"]) >= MAX_VIDEO_OBJECTS
            if keep is not None and n not in keep:
                continue
            if n in frames:
                diag.append(f"frame {n} arrived twice; the later line is kept")
            for o in f["objects"]:
                if decode_masks:
                    _decode_into(o, diag)
                else:
                    o["mask"] = None
            frames[n] = f
            if on_frame:
                on_frame(f)

    def on_text(d):
        # a frame is complete once the next frame marker arrives ("The parser buffers text across event
        # boundaries ... Chunk boundaries don't matter")
        seen[0] = True
        pending[0] += d
        marks = [m.start() for m in _FRAME_RE.finditer(pending[0])]
        if len(marks) >= 2:
            finish(pending[0][:marks[-1]])
            pending[0] = pending[0][marks[-1]:]

    content = [{"type": "input_text", "text": prompt}, content_video]
    text = _sam_responses(content, stream=stream, store=store, mask_encoding=mask_encoding, timeout=timeout,
                          retries=retries, on_text=on_text if stream else None, what=f"SAM 3.1 video '{prompt}'",
                          pacer=pacer, high=high, patient=patient, stop=stop)
    finish(pending[0] if (stream and seen[0]) else text)
    return [frames[n] for n in sorted(frames)]


def sam_segment_image(image, prompt, *, mask_encoding="one_bit", stream=True, store=False, decode_masks=True,
                      timeout=120.0, retries=2, pacer=None, patient=False, stop=None):
    """Every match of ONE text concept in one image ("image requests return every matching instance"), for
    keyframe calibration and for prompts with more than 16 matches. image: a local PNG/JPEG/WebP/GIF path
    (sent as a base64 data URL) or an http(s) URL. docs/sam/segmenting "Segment an image":
    {"type": "input_image", "image_url": ...}; "An image returns on a single line" as frame <0f>.
    Priced at $2.50 per 1,000 images (docs/pricing-rate-limits).

    Returns {width, height, objects} with objects as in sam_segment_video. pacer, patient and stop: as _request takes
    them."""
    if re.match(r"https?://", image):
        url = image
    else:
        ext = os.path.splitext(image)[1].lower()
        mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
                ".gif": "image/gif"}.get(ext)
        if mime is None:
            raise ValueError(f"SAM 3.1 images are PNG, JPEG, WebP or GIF (docs/file-handling), not {ext or 'no extension'}")
        if _inline_size(image) > INLINE_MAX:
            raise ValueError("the image is over the 50 MB inline limit")
        url = _data_url(image, mime)
    content = [{"type": "input_text", "text": prompt}, {"type": "input_image", "image_url": url}]
    text = _sam_responses(content, stream=stream, store=store, mask_encoding=mask_encoding, timeout=timeout,
                          retries=retries, what=f"SAM 3.1 image '{prompt}'", pacer=pacer, patient=patient, stop=stop)
    frames, diag = parse_segmentation(text)
    f = frames[0] if frames else {"width": None, "height": None, "objects": []}
    for o in f["objects"]:
        if decode_masks:
            _decode_into(o, diag)
        else:
            o["mask"] = None
    return {"width": f["width"], "height": f["height"], "objects": f["objects"], "diagnostics": diag}


# ------------------------------------------------------------------ records in sam31/segment.py's format

_POLY = {}


def _mask_to_polygon():
    """sam31/sam31_detector.mask_to_polygon, imported on first use (that module imports torch)."""
    if "fn" not in _POLY:
        mod = sys.modules.get("sam31_detector")
        if mod is None:
            import importlib.util
            spec = importlib.util.spec_from_file_location("sam31_detector", os.path.join(SAM31, "sam31_detector.py"))
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            sys.modules["sam31_detector"] = mod
        _POLY["fn"] = mod.mask_to_polygon
    return _POLY["fn"]


def _detection(o, stats):
    """One object as segment.py writes it: {score, box, polygon, area, samId}. Without a decoded mask the box's
    pixel centres are the outline (what mask_to_polygon gives for a filled box) and "mask": "box" says so. samId is
    the API's own id for the object, stable across a video's frames (None from an image call): kept so a hand can be
    followed by SAM's identity as well as by the tracker's left/right (result.handsDiag)."""
    x0, y0, x1, y1 = o["box"]
    m = o.get("mask")
    if m is not None and m.any():
        poly = _mask_to_polygon()(m)
        if poly is not None and len(poly) >= 3:
            stats["decoded"] += 1
            return {"score": 1.0, "box": [x0, y0, x1, y1], "polygon": [[x + x0, y + y0] for x, y in poly],
                    "area": int(m.sum()), "samId": o.get("id")}
    stats["box"] += 1
    return {"score": 1.0, "box": [x0, y0, x1, y1],
            "polygon": [[x0, y0], [x1 - 1, y0], [x1 - 1, y1 - 1], [x0, y1 - 1]],
            "area": int((x1 - x0) * (y1 - y0)), "mask": "box", "samId": o.get("id")}


def _extract_frames(video, indices, out_dir):
    """The decoded frames at these indices (presentation order) as PNG, lossless, in index order."""
    # a balanced tree, not a flat sum: Debian 12's ffmpeg 5.1 (the Modal image's) fails on a flat one past 100 terms
    # (video.select_expr); the commas escaped, as this filter graph is not quoted
    terms = [f"eq(n\\,{int(i)})" for i in indices]

    def tree(a, b):
        return terms[a] if b - a == 1 else f"({tree(a, (a + b) // 2)}+{tree((a + b) // 2, b)})"
    sel = tree(0, len(terms)) if terms else "0"
    p = subprocess.run([FFMPEG, "-y", "-v", "error", "-i", video, "-map", "0:v:0", "-vf", f"select={sel}",
                        "-fps_mode", "passthrough", "-start_number", "0", os.path.join(out_dir, "f_%05d.png")],
                       capture_output=True, text=True)
    paths = [os.path.join(out_dir, f"f_{k:05d}.png") for k in range(len(indices))]
    if p.returncode or not all(map(os.path.exists, paths)) or os.path.exists(os.path.join(out_dir, f"f_{len(indices):05d}.png")):
        raise RuntimeError(f"extracting {len(indices)} frames failed: {(p.stderr.strip().splitlines() or ['wrong frame count'])[-1]}")
    return paths


CLIP_FPS = 5   # the clip made from the analysed frames (clip="frames") plays them at this rate; only the order matters


def _clip_from_frames(frames, tmp, crop=None):
    """The analysed frames, in order, as an H.264 MP4 at CLIP_FPS with faststart and no sound: SAM's frame k is
    frames[k], so nothing has to be mapped by time. Near-lossless (CRF 12) and padded to even sides if need be,
    at the top left, so pixel coordinates are the frames' own. crop (x0, width): only that vertical strip of each
    frame (the black keys' strips, BLACK_KEYS "strips"), its x0 even; its coordinates then start at x0."""
    d = os.path.join(tmp, "analysed")
    os.makedirs(d, exist_ok=True)
    for k, f in enumerate(frames):
        os.symlink(os.path.abspath(f), os.path.join(d, f"f_{k:05d}{os.path.splitext(f)[1].lower()}"))
    ext = os.path.splitext(frames[0])[1].lower()
    out = os.path.join(tmp, "analysed.mp4")
    vf = (f"crop={int(crop[1])}:ih:{int(crop[0])}:0," if crop else "") + "pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0"
    p = subprocess.run([FFMPEG, "-y", "-v", "error", "-framerate", str(CLIP_FPS), "-start_number", "0",
                        "-i", os.path.join(d, f"f_%05d{ext}"), "-vf", vf,
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p",
                        "-an", "-map_metadata", "-1", "-movflags", "+faststart", out], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(f"making the clip of the analysed frames failed: {(p.stderr.strip().splitlines() or ['?'])[-1]}")
    return out


# Black keys (IMAGE_PROMPTS) as one image request per analysed frame ("images", the default), or as video requests on
# STRIPS vertical strips of the frames x STRIP_CHUNKS stretches of time ("strips", TEACHER_SAM_BLACKKEYS=strips): 18
# requests for a take instead of 150, for when the key's limit stays at 60 a minute (DEFAULT_RPM). The strips change the
# output a little, which is why they are not the default: on a 30 s take 98.6 % of the image requests' keys were found,
# with about 100 small extra fragments and a matched IoU of 0.94 against a 0.999 noise floor; downstream the same 149 of
# 150 frames locked and hands within 0.8 mm (median), but the focal estimate moved (1011 to 976 px) and the video's
# octave numbering by two octaves (our speed study, run 3: 3 strips x 6 stretches, inline, CRF 12). A video
# request returns at most 16 objects over its whole clip (MAX_VIDEO_OBJECTS), so a strip covers a few keys for a few
# seconds; neighbouring strips overlap by STRIP_OVERLAP px and each keeps the keys whose middle is in its own part.
STRIPS, STRIP_CHUNKS, STRIP_OVERLAP = 3, 6, 128


def black_keys_mode():
    """TEACHER_SAM_BLACKKEYS: "images" (default) or "strips"."""
    v = os.environ.get("TEACHER_SAM_BLACKKEYS", "images").strip().lower()
    return v if v in ("images", "strips") else "images"


def _spans(n, k):
    """n frames in k stretches as equal as can be: [(first, end)], end exclusive."""
    edges = [round(i * n / k) for i in range(k + 1)]
    return [(edges[i], edges[i + 1]) for i in range(k) if edges[i + 1] > edges[i]]


def _strips(width):
    """[(x0, w, own0, own1)]: STRIPS strips of a frame width px wide, x0 even, each owning the keys whose middle is in
    [own0, own1)."""
    cuts = [round(i * width / STRIPS) for i in range(STRIPS + 1)]
    out = []
    for t in range(STRIPS):
        x0 = max(0, cuts[t] - STRIP_OVERLAP // 2)
        x1 = min(width, cuts[t + 1] + STRIP_OVERLAP // 2)
        x0 -= x0 % 2
        out.append((x0, x1 - x0, cuts[t], cuts[t + 1]))
    return out


class _LiveDecoder:
    """The masks decoded as their requests answer, on a thread of its own, while the other requests are still out
    with the compiled decoder (_fast_decoder, which does not hold the GIL) or a stand-in (MASK_DECODER).
    Without either, meta_sam_parser's pure-Python decoding is left to _decode_all's processes after the requests, as
    before."""

    def __init__(self, diag):
        self.diag, self.ms = diag, 0.0
        self.live = MASK_DECODER is not None or _fast_possible()
        self.q, self.thread = None, None
        if self.live:
            import queue
            self.q = queue.Queue()
            self.thread = threading.Thread(target=self._run, name="sam-masks", daemon=True)
            self.thread.start()

    def put(self, objs):
        if self.live:
            self.q.put(list(objs))

    def _run(self):
        if MASK_DECODER is None:
            _fast_decoder()                    # compiled (about 1.5 s) while the clip is made and sent
        while True:
            objs = self.q.get()
            if objs is None:
                return
            t = time.time()
            for o in objs:
                _decode_into(o, self.diag)
            self.ms += (time.time() - t) * 1000

    def finish(self, objs):
        """Every object of objs decoded (the ones never put, too)."""
        if self.live:
            self.q.put(None)
            self.thread.join()
            t = time.time()
            for o in objs:
                if "mask" not in o or (o["mask"] is None and "mask_error" not in o):
                    _decode_into(o, self.diag)
            self.ms += (time.time() - t) * 1000
        else:
            t = time.time()
            _decode_all(objs, self.diag)
            self.ms += (time.time() - t) * 1000

    def stop(self):
        if self.live and self.thread.is_alive():
            self.q.put(None)


def sam_video_to_records(video_path, times, prompts, out_dir, *, image_prompts=IMAGE_PROMPTS, frames=None,
                         mask_encoding="one_bit", upload="auto", workers=16, timeout=900.0, progress=None,
                         clip="video", pacer=None, black_keys=None):
    """SAM 3.1 records for the analysed frames, in sam31/segment.py's format: out_dir/rf_0001.sam.json, ...
    one per entry of times, in that order (1-based), in the video's pixels.

    Each prompt not in image_prompts runs once through the whole video (sam_segment_video); for every time
    the nearest frame is taken (probe_video says how SAM's frame index maps to time), and a frame SAM sent
    no line for has no matches. When more than one prompt goes through video, the clip is uploaded once
    and referenced by id (docs/sam/segmenting: "For a clip you segment more than once, upload it"), then
    deleted; upload=False keeps everything inline (ZDR). Prompts in image_prompts (default: black keys,
    which overflow video's 16 objects per frame) are one image request per analysed frame, on frames
    (paths aligned with times, in the video's pixels) or on frames cut losslessly from the video; or, with
    black_keys "strips" (default black_keys_mode()) and the frames given, video requests on strips of them (_strips).

    clip="frames" sends SAM the analysed frames themselves (frames, aligned with times) as a clip at CLIP_FPS
    instead of the whole video: at 5 analysed frames a second that is a sixth of a 30 fps video's frames, so a
    sixth of the video price ($0.20 per 1,000 frames, once per prompt) and of SAM's time, and a 10-minute take
    stays far under the 15,000 frames a request takes (at 30 fps it is 18,000). SAM then tracks across 0.2 s
    steps rather than 1/30 s ones.

    Overlapped (the same requests and the same records): the black-key requests go from the start, beside
    the clip's encoding and upload (they need only the frames), the clip's video prompts go together once it is up,
    each answer's masks are decoded as it arrives (_LiveDecoder), and the uploaded clip is deleted on a thread of its
    own as soon as the video prompts have answered. Every request waits for its turn on pacer (default PACER: the
    key's own limit, so no burst runs into 429s) and is patient: a 429 waits and tries again rather than failing the
    take, a 500 or 503 is retried after a few seconds. A request that fails otherwise (a 402 fails them all) stops
    those not yet sent, and the call fails with its error, with no records written.

    Returns a summary: records, requests, frame mapping error, mask decoding counts, capped frames, the
    estimated cost, warnings, the pacing (pacing: requests made to wait, the time waited, 429s, the key's limit as
    the responses stated it) and the phases' times (phasesMs)."""
    t_all = time.time()
    times = [float(t) for t in times]
    prompts = list(prompts)
    pacer = PACER if pacer is None else (pacer or None)   # False: no pacing
    os.makedirs(out_dir, exist_ok=True)
    if clip not in ("video", "frames"):
        raise ValueError(f"clip is 'video' or 'frames', not {clip!r}")
    mode = clip
    if mode == "frames" and (frames is None or len(frames) != len(times) or not frames):
        raise ValueError("clip='frames' needs the analysed frames, one per time")
    if frames is not None and len(frames) != len(times):
        raise ValueError(f"{len(frames)} frame images for {len(times)} times")
    bk = black_keys or black_keys_mode()
    vprompts = [p for p in prompts if p not in image_prompts]
    kprompts = [p for p in prompts if p in image_prompts]      # one answer per analysed frame: images, or strips
    warnings = []
    if bk == "strips" and kprompts and frames is None:
        warnings.append("black keys as image requests: strips need the analysed frames")
        bk = "images"
    iprompts = kprompts if bk == "images" else []
    sprompts = kprompts if bk == "strips" else []
    spans = _spans(len(times), STRIP_CHUNKS)
    per_prompt, timing, diag, capped = {}, {}, [], {}
    stats = {"decoded": 0, "box": 0}
    pace0 = pacer.snapshot() if pacer else {}
    done = [0]
    n_strip_req = len(sprompts) * STRIPS * len(spans)
    total = len(vprompts) + len(times) * len(iprompts) + n_strip_req
    lock = threading.Lock()
    phases = {}

    def tick():
        with lock:
            done[0] += 1
            if progress:
                progress(done[0], total)

    stop = threading.Event()   # after one failure (a 401 or 402 fails them all) send no more
    # the clip's upload, its video prompts and its delete have room kept for them in the key's minute, which the black
    # keys sent from the start would otherwise fill before the clip is up (RatePacer.booked)
    will_upload = upload is True or (upload == "auto" and len(vprompts) > 1)
    vpacer = pacer.booked(len(vprompts) + 2 * will_upload) if pacer and vprompts and kprompts else pacer
    dec = _LiveDecoder(diag)
    tmp = tempfile.mkdtemp(prefix="meta_rec_")
    own = tempfile.mkdtemp(prefix="meta_clip_") if mode == "frames" else None
    uploaded, gone = [None], {}           # gone: the background delete's thread and its answer
    clip_info = {}

    def clip_and_frames():
        """The clip SAM's video prompts see, probed: (path, info, frame times, idx: the clip frame of each time, dts)."""
        if "info" not in clip_info:
            path = _clip_from_frames(frames, own) if own else video_path
            info = probe_video(path)
            ft = info["frame_times"]
            if not ft or (own and len(ft) != len(times)):
                raise ValueError(("the clip of the analysed frames has %d frames for %d times" % (len(ft), len(times))) if own
                                 else "no video frames in " + os.path.basename(path))
            # with the analysed frames as the clip, frame k is time k: nothing is matched by time
            idx = list(range(len(times))) if own else [_nearest(ft, t) for t in times]
            dts = [0.0] * len(times) if own else [abs(ft[i] - t) for i, t in zip(idx, times)]
            clip_info.update(path=path, info=info, ft=ft, idx=idx, dts=dts)
        return clip_info

    def video_phase():
        t0 = time.time()
        c = clip_and_frames()
        ft = c["ft"]
        if not vprompts:
            return
        if len(ft) > MAX_VIDEO_FRAMES:
            raise ValueError(f"the clip has {len(ft)} frames; SAM 3.1 takes at most {MAX_VIDEO_FRAMES} per request")
        mp4 = _mp4_for_sam(c["path"], c["info"], tmp)
        fits = _inline_size(mp4) <= INLINE_MAX
        if upload is True or (upload == "auto" and (len(vprompts) > 1 or not fits)):
            uploaded[0] = upload_file(mp4, timeout=timeout, pacer=vpacer, patient=True)
            ref = {"type": "input_video", "file_id": uploaded[0]}
        elif not fits:
            raise ValueError(f"the clip is {os.path.getsize(mp4)} bytes, over the 50 MB inline limit, "
                             f"and uploads are off (upload=False)")
        else:
            ref = {"type": "input_video", "video_url": _data_url(mp4, "video/mp4")}
        phases["clipReadyMs"] = round((time.time() - t0) * 1000, 1)
        want = set(c["idx"])

        # one request per concept, all at once; each frame's masks decoded as it streams in
        def video_one(p):
            ts = time.time()
            try:
                fs = _segment_video_request(ref, p, mask_encoding=mask_encoding, stream=True, store=False,
                                            frame_times=ft, keep=want, decode_masks=False, timeout=timeout,
                                            retries=2, on_frame=lambda f: dec.put(f["objects"]), diag=diag,
                                            pacer=vpacer, high=True, patient=True, stop=stop)
            except Stopped:
                return None
            tick()
            return p, fs, round((time.time() - ts) * 1000, 1)
        try:
            with ThreadPoolExecutor(len(vprompts)) as ex:
                for got in ex.map(video_one, vprompts):
                    if got is None:
                        continue
                    p, fs, ms = got
                    timing[p] = ms
                    per_prompt[p] = {f["frame_index"]: f for f in fs}
                    capped[p] = sorted(f["frame_index"] for f in fs if f["capped"])
        finally:
            if uploaded[0]:                    # gone as soon as its prompts have answered, while the rest goes on
                def delete(fid=uploaded[0]):
                    gone["err"] = delete_file(fid, pacer=vpacer)
                gone["thread"] = threading.Thread(target=delete, name="sam-delete", daemon=True)
                gone["thread"].start()
        phases["videoMs"] = round((time.time() - t0) * 1000, 1)

    def image_phase():
        if not iprompts:
            return
        t0 = time.time()
        if frames is not None:
            cut = None
        else:                                  # the frames cut from the video: it is probed first
            c = clip_and_frames()
            want = sorted(set(c["idx"]))
            cut = dict(zip(want, _extract_frames(video_path, want, tmp)))

        def one(args):
            if stop.is_set():
                return None
            p, k = args
            ts = time.time()
            try:
                r = sam_segment_image(frames[k] if cut is None else cut[clip_info["idx"][k]], p, mask_encoding=mask_encoding,
                                      timeout=min(timeout, 180.0), decode_masks=False, pacer=pacer, patient=True, stop=stop)
            except Stopped:
                return None
            except Exception:
                stop.set()
                raise
            dec.put(r["objects"])
            tick()
            return p, k, r, (time.time() - ts) * 1000
        with ThreadPoolExecutor(max(1, int(workers))) as ex:
            for got in ex.map(one, [(p, k) for p in iprompts for k in range(len(times))]):
                if got is None:
                    continue
                p, k, r, ms = got
                per_prompt.setdefault(p, {})[("img", k)] = r
                timing[p] = round(timing.get(p, 0.0) + ms, 1)
                diag.extend(d for d in r["diagnostics"] if d not in diag)
        phases["imagesMs"] = round((time.time() - t0) * 1000, 1)

    def strip_phase():
        """The black keys on strips x stretches of the analysed frames, as video requests sent inline."""
        if not sprompts:
            return
        t0 = time.time()
        import cv2
        h0, w0 = cv2.imread(frames[0], cv2.IMREAD_UNCHANGED).shape[:2]
        jobs = [(p, t, (a, b), strip) for p in sprompts for t, strip in enumerate(_strips(w0)) for (a, b) in spans]
        got = {}

        def one(job):
            p, t, (a, b), (x0, w, lo, hi) = job
            if stop.is_set():
                return None
            d = tempfile.mkdtemp(dir=tmp)
            mp4 = _clip_from_frames(frames[a:b], d, crop=(x0, w))
            ts = time.time()
            try:
                fs = _segment_video_request({"type": "input_video", "video_url": _data_url(mp4, "video/mp4")}, p,
                                            mask_encoding=mask_encoding, stream=True, store=False,
                                            frame_times=list(range(b - a)), keep=None, decode_masks=False, timeout=timeout,
                                            retries=2, on_frame=None, diag=diag, pacer=pacer, patient=True, stop=stop)
            except Stopped:
                return None
            except Exception:
                stop.set()
                raise
            ids = set()
            kept = {}
            for f in fs:
                objs = []
                for o in f["objects"]:
                    ids.add(o["id"])
                    if not lo <= x0 + (o["box"][0] + o["box"][2]) / 2 < hi:
                        continue                # another strip's key
                    o["box"] = [o["box"][0] + x0, o["box"][1], o["box"][2] + x0, o["box"][3]]
                    o["mask_xy"] = [o["mask_xy"][0] + x0, o["mask_xy"][1]]
                    objs.append(o)
                kept[a + f["frame_index"]] = objs
                dec.put(objs)
            tick()
            return p, t, a, kept, len(ids) >= MAX_VIDEO_OBJECTS, (time.time() - ts) * 1000
        with ThreadPoolExecutor(max(1, min(int(workers), len(jobs)))) as ex:
            for r in ex.map(one, jobs):
                if r is None:
                    continue
                p, t, a, kept, full, ms = r
                got[(p, t, a)] = kept
                timing[p] = round(timing.get(p, 0.0) + ms, 1)
                if full:
                    capped.setdefault(p, []).append(f"strip {t + 1}, frames {a + 1}+")
        for p in sprompts:                     # each frame's keys in strip order, as the strips lie left to right
            for k in range(len(times)):
                objs = [o for t in range(STRIPS) for a, _ in spans for o in got.get((p, t, a), {}).get(k, [])]
                per_prompt.setdefault(p, {})[("img", k)] = {"width": None, "height": None, "objects": objs}
        phases["stripsMs"] = round((time.time() - t0) * 1000, 1)

    try:
        if mode == "video" or (iprompts and frames is None):
            clip_and_frames()                  # the image frames are cut by the video's frame index
        with ThreadPoolExecutor(3) as ex:
            futs = [ex.submit(fn) for fn in (video_phase, image_phase, strip_phase)]
            first = None
            for fu in futs:
                try:
                    fu.result()
                except BaseException as e:     # the others stop sending; the first failure is the call's
                    stop.set()
                    first = first or e
            if first is not None:
                raise first
        if not clip_info:
            clip_and_frames()
    except BaseException:
        stop.set()
        dec.stop()
        raise
    finally:
        if "thread" in gone:
            gone["thread"].join()
        if vpacer is not pacer:
            vpacer.close()
            if gone.get("err"):
                warnings.append(f"the uploaded clip could not be deleted (it expires in an hour): {gone['err']}")
        shutil.rmtree(tmp, ignore_errors=True)
        if own:
            shutil.rmtree(own, ignore_errors=True)

    info, ft, idx, dts = clip_info["info"], clip_info["ft"], clip_info["idx"], clip_info["dts"]
    step = float(np.median(np.diff(ft))) if len(ft) > 1 else 0.0
    if dts and step and max(dts) > 0.5 * step + 1e-6:
        warnings.insert(0, f"a time is {max(dts):.3f} s from its nearest frame (frame step {step:.3f} s)")
    t_dec = time.time()
    used = {id(o): o for p in prompts for k, i in enumerate(idx)
            for o in ((per_prompt[p][("img", k)]["objects"]) if p in kprompts else
                      ((per_prompt[p].get(i) or {}).get("objects") or []))}
    dec.finish(used.values())
    decode_ms = round((time.time() - t_dec) * 1000, 1)
    sizes = set()
    for k, (t, i) in enumerate(zip(times, idx)):
        res = {}
        w, h = info["width"], info["height"]
        for p in prompts:
            if p in kprompts:
                r = per_prompt[p][("img", k)]
                objs = r["objects"]
                if r["width"]:
                    sizes.add((r["width"], r["height"]))
            else:
                f = per_prompt[p].get(i)
                objs = f["objects"] if f else []
                if f and f["width"]:
                    sizes.add((f["width"], f["height"]))
            res[p] = [_detection(o, stats) for o in objs]
        rec = {"image": f"rf_{k + 1:04d}.jpg", "width": w, "height": h, "model": "sam-3.1 (Meta Model API)",
               "prompts": res, "timing_ms": {**timing, "load": 0.0}, "tiles": 1,
               "source": {"backend": "meta-model-api", "clip": mode, "videoFrame": i, "videoFrameS": ft[i],
                          "dtS": 0.0 if own else round(ft[i] - t, 6), "maskEncoding": mask_encoding,
                          "score": "the API returns no confidence; every match is written as 1.0"}}
        if sprompts:
            rec["source"]["blackKeys"] = f"strips {STRIPS} x {STRIP_CHUNKS}"
        dst = os.path.join(out_dir, f"rf_{k + 1:04d}.sam.json")
        with open(dst + ".tmp", "w") as fh:
            json.dump(rec, fh)
        os.replace(dst + ".tmp", dst)
    if sizes - {(info["width"], info["height"])}:
        warnings.append(f"SAM reported frame sizes {sorted(sizes)}, the video is {info['width']}x{info['height']}"
                        + (f" with rotation {info['rotation']}" if info["rotation"] else ""))
    if any(capped.values()):
        warnings.append("frames at the 16-object video limit (matches may be missing): "
                        + ", ".join(f"{p}: {len(v)}" for p, v in capped.items() if v))
    mask_note = next((d for d in diag if d.startswith("mask decoding failed")), None)
    if stats["box"] and not stats["decoded"] and not mask_note:
        mask_note = ("masks not decoded (meta_sam_parser is not installed and MASK_DECODER is not set): "
                     "outlines are the boxes")
    pace = pacer.snapshot() if pacer else {}
    pacing = {k: (round(pace[k] - pace0.get(k, 0), 2) if k in ("sent", "waited", "waitedS", "r429") else pace.get(k))
              for k in ("sent", "waited", "waitedS", "r429", "limit", "remainingMin")} if pacer else None
    cost = est_cost(len(ft), len(vprompts), len(times) * len(iprompts))
    if sprompts:                               # every analysed frame once per strip, as video frames
        sc = est_cost(len(times) * STRIPS, len(sprompts))
        cost = {k: (round(cost[k] + sc[k], 4) if isinstance(cost[k], float) else cost[k] + sc[k]) for k in cost}
    return {"records": len(times), "clip": mode, "videoRequests": len(vprompts), "imageRequests": len(times) * len(iprompts),
            "blackKeys": bk if kprompts else None, "stripRequests": n_strip_req,
            "clipFrames": len(ft), "maxDtS": round(max(dts), 6) if dts else None,
            "masks": dict(stats), "maskNote": mask_note,
            "capped": {p: v for p, v in capped.items() if v}, "diagnostics": diag[:50],
            "estCost": cost,
            "uploaded": uploaded[0] is not None, "warnings": warnings, "decodeMs": decode_ms,
            "pacing": pacing, "phasesMs": dict(phases, liveDecodeMs=round(dec.ms, 1)),
            "ms": round((time.time() - t_all) * 1000, 1)}


# ------------------------------------------------------------------ Muse Voice Transcribe

def _asr_wav(audio_bytes, content_type, tmp):
    """WAV bytes Muse Voice Transcribe accepts: docs/speech-to-text "The endpoint accepts a RIFF/WAVE
    container with mono, 16-bit integer PCM at 16 kHz or 24 kHz". Anything else is converted with the
    docs' own command, "ffmpeg -i input.m4a -ac 1 -ar 24000 -c:a pcm_s16le -map_metadata -1 output.wav",
    file to file (a WAV written to a pipe has no sizes in its header)."""
    if audio_bytes[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE":
        try:
            with wave.open(io.BytesIO(audio_bytes)) as w:
                if (w.getnchannels(), w.getsampwidth(), w.getcomptype()) == (1, 2, "NONE") and w.getframerate() in (16000, 24000):
                    return audio_bytes, w.getnframes() / w.getframerate()
        except (wave.Error, EOFError):
            pass
    if not shutil.which(FFMPEG):
        raise RuntimeError(f"{FFMPEG} is needed to convert {content_type} audio to WAV")
    ext = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/mpeg": ".mp3",
           "audio/wav": ".wav", "audio/x-wav": ".wav"}.get((content_type or "").split(";")[0].strip().lower(), ".bin")
    src, dst = os.path.join(tmp, "in" + ext), os.path.join(tmp, "out.wav")
    with open(src, "wb") as f:
        f.write(audio_bytes)
    # -t: decode at most one second past the limit. A few MB of compressed silence can hold hours of
    # audio, gigabytes as WAV; this way the duration check below still refuses it, from a small file.
    p = subprocess.run([FFMPEG, "-y", "-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", str(ASR_RATE),
                        "-c:a", "pcm_s16le", "-map_metadata", "-1", "-t", f"{ASR_MAX_S + 1:g}", dst],
                       capture_output=True, text=True)
    if p.returncode or not os.path.exists(dst):
        raise ValueError(f"the recording could not be read as audio: {(p.stderr.strip().splitlines() or ['?'])[-1]}")
    with open(dst, "rb") as f:
        data = f.read()
    with wave.open(dst) as w:
        return data, w.getnframes() / w.getframerate()


def take_keywords_on():
    """MUSE_STT_KEYWORDS: on (the default) biases a spoken question with its take's words (stt_keywords); off sends only
    what was sent before them (the standing ASR_KEYWORDS live, none with a recording). Any other value: ValueError (the
    server stops at start-up, saying so)."""
    v = os.environ.get("MUSE_STT_KEYWORDS", "on").strip().lower() or "on"
    if v not in ("on", "off"):
        raise ValueError(f"MUSE_STT_KEYWORDS must be on or off, not {v!r}")
    return v == "on"


def stt_keywords(take_terms=(), base=ASR_KEYWORDS, cap=ASR_KEYWORDS_MAX):
    """The keywords one spoken question is sent with: the take's own terms first (voice.stt_terms), then the standing
    list, each once (case aside), its spaces folded, at most ASR_KEYWORD_CHARS characters (a longer term is left out, not
    cut: half a title biases toward words nobody says), and at most `cap` in all. [] when there is nothing to send."""
    out, seen = [], set()
    for t in list(take_terms or ()) + list(base or ()):
        t = " ".join(str(t or "").split())
        if not t or len(t) > ASR_KEYWORD_CHARS or t.lower() in seen:
            continue
        seen.add(t.lower())
        out.append(t)
        if len(out) >= cap:
            break
    return out


def transcribe_speech(audio_bytes, content_type="audio/wav", *, mode="PUSH_TO_TALK", keywords=None,
                      language_bias=None, timeout=120.0, retries=2, session_id=None):
    """The transcript of one recording (a player's spoken question), through the non-streaming file
    endpoint POST /v1/asr/transcribe. Browser recordings (webm/opus, mp4) are converted to the WAV it takes.

    docs/api-reference/voice/transcribe: "Send multipart/form-data with two parts: request, the
    transcription settings as JSON, and audio, the clip"; curl: -F 'request={"model":
    "muse-voice-transcribe-1.0","audioEncoding":"WAV","mode":"PUSH_TO_TALK"};type=application/json'
    -F "audio=@recording.wav;type=audio/wav", "Accept: application/json"; query sessionId optional
    ("Retain the session id: it is the only correlation handle for a support request"). Request fields
    (docs/api-reference/voice/schemas "Transcribe Request"): audioEncoding "WAV" (required), mode,
    keywords, languageBias. Response (TranscribeResponse): {sessionId, transcript, audioDurationMs, turns}.
    Billed $0.18 per hour of audio in whole seconds; failed and 429 requests are not billed."""
    if not audio_bytes:
        raise ValueError("the recording is empty")
    tmp = tempfile.mkdtemp(prefix="meta_asr_")
    try:
        wav, dur = _asr_wav(audio_bytes, content_type, tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if dur > ASR_MAX_S:     # a long recording is decoded only to ASR_MAX_S + 1 s, so no exact length here
        raise ValueError(f"the recording is too long; Muse Voice Transcribe takes at most {ASR_MAX_S / 60:g} minutes")
    settings = {"model": ASR_MODEL, "audioEncoding": "WAV", "mode": mode}
    if keywords:
        settings["keywords"] = list(keywords)
    if language_bias:
        settings["languageBias"] = list(language_bias)
    body, ctype = _multipart([
        {"name": "request", "data": json.dumps(settings), "type": "application/json"},
        {"name": "audio", "data": wav, "filename": "recording.wav", "type": "audio/wav"},
    ])
    _, length = body()
    if length > ASR_MAX_BYTES:
        raise ValueError(f"the request would be {length} bytes; Muse Voice Transcribe takes at most 32 MB")
    sid = session_id or f"web-{uuid.uuid4()}"
    try:
        with _request("POST", "/asr/transcribe", data=body, query={"sessionId": sid}, timeout=timeout,
                      retries=retries, what="Muse Voice Transcribe", session_id=sid,
                      headers={"Content-Type": ctype, "Accept": "application/json"}) as r:
            j = json.loads(r.read())
    except MetaAPIError:
        raise
    except Exception as e:
        if _is_timeout(e):
            raise MetaAPIError(f"no transcript within {timeout:g} s", type="timeout", session_id=sid,
                               what="Muse Voice Transcribe") from None
        raise
    if not isinstance(j, dict) or not isinstance(j.get("transcript"), str):
        raise MetaAPIError(f"unexpected response: {str(j)[:200]}", status=200, session_id=sid,
                           what="Muse Voice Transcribe")
    return j["transcript"].strip()


# ------------------------------------------------------------------ Muse Voice Transcribe, realtime

ASR_WHAT = "Muse Voice Transcribe (realtime)"
class _NoFrameLog(logging.LoggerAdapter):
    """websockets logs every frame at DEBUG, the handshake frame with the key in it among them (cut short,
    but past the key's start); it checks isEnabledFor(DEBUG) once per connection, so this logger says no
    to DEBUG whatever the logging setup, and passes everything else to meta_api.realtime."""

    def isEnabledFor(self, level):
        return level > logging.DEBUG and self.logger.isEnabledFor(level)


_WS_LOG = _NoFrameLog(logging.getLogger("meta_api.realtime"), {})


def _asr_url(session_id):
    """META_ASR_WS (default wss://api.meta.ai/v1/asr/realtime) with the sessionId query, and whether it is
    a loopback test server. The same rule as META_API_BASE: Meta's host or loopback only, since the key
    travels in the first frame to wherever this points."""
    u = os.environ.get("META_ASR_WS", ASR_WS).strip()
    p = urllib.parse.urlsplit(u)
    loopback = p.scheme == "ws" and p.hostname in ("127.0.0.1", "localhost", "::1")
    if not ((p.scheme == "wss" and p.hostname == "api.meta.ai") or loopback):
        raise MetaAPIError(f"META_ASR_WS must be wss://api.meta.ai/... or a loopback test server, "
                           f"not {p.scheme}://{p.hostname}", type="bad_base", what=ASR_WHAT)
    # docs/api-reference/voice/realtime "Query parameters": sessionId, "returned in the handshake response"
    return u + ("&" if p.query else "?") + urllib.parse.urlencode({"sessionId": session_id}), loopback


def _asr_closed(ws, sid, event=None):
    """The MetaAPIError for a session that ended without a final transcript: by its close code and,
    when Meta sent one first, its error event (schemas "Error Event": message, sessionId, errorType,
    errorCode, errorParam; "The message is client-safe")."""
    code = ws.close_code
    ev = event if isinstance(event, dict) else {}
    if code in ASR_CLOSE:
        typ, meaning = ASR_CLOSE[code]
    elif code == 1000:
        typ, meaning = "closed", "the session closed before a transcript"
    elif code is None and ev:                    # an error event, and no close (yet)
        typ, meaning = "error", "Meta reported an error"
    else:
        typ, meaning = "network", f"the connection was lost (code {code})"
    msg = str(ev.get("message") or ws.close_reason or meaning)
    e = MetaAPIError(msg, type=typ, code=code, param=ev.get("errorParam"), body=json.dumps(ev) if ev else None,
                     session_id=str(ev.get("sessionId") or sid), what=ASR_WHAT)
    e.close_code, e.error_type, e.error_code = code, ev.get("errorType"), ev.get("errorCode")
    return e


async def _emit(on_event, ev):
    if on_event is not None:
        r = on_event(ev)
        if inspect.isawaitable(r):
            await r


async def asr_realtime(pcm_frames, on_event=None, *, sample_rate=ASR_RATE, keywords=ASR_KEYWORDS,
                       language_bias=("English",), session_id=None, lead_s=ASR_LEAD_S,
                       ack_timeout_s=ASR_HANDSHAKE_S, final_timeout_s=ASR_FINAL_S, open_timeout_s=10.0):
    """The transcript of one spoken turn streamed live, through the realtime endpoint
    wss://api.meta.ai/v1/asr/realtime: one session per turn, PUSH_TO_TALK.

    pcm_frames: an async iterator of raw s16le mono PCM at sample_rate (24000 or 16000), as it is
    captured; its end ends the turn. on_event(event): called (and awaited when it returns an awaitable)
    with {"type": "ready", "sessionId"} once Meta acknowledged the handshake, then with every event Meta
    sends, as Meta sends it: "transcript" ({transcript, final, audioProcessedMs}; CUMULATIVE, so each
    partial replaces the last), "speechStart", "speechEnd", "error", and types this module does not know.
    Returns the final transcript (the last partial when Meta closed normally without one; "" for silence).
    Raises MetaAPIError: type no_key or bad_base before connecting, network or timeout, invalid_request
    (close 1008), server_error (1011), rate_limited (1013), with close_code set; never with the key in it.

    The wire, from Meta's docs: connect with ?sessionId=; the first frame, within 10 s, is the handshake
    {"authorization": {"accessToken": "Bearer <key>"}, "audioEncoding": "PCM_24KHZ", "model":
    "muse-voice-transcribe-1.0", "mode": "PUSH_TO_TALK", "partialMode": "CUMULATIVE",
    "emitAudioProgress": false, "keywords": [...], "languageBias": ["English"]} ("This endpoint does not
    read the HTTP Authorization header; the credential travels in the handshake"); "Wait for the
    handshake acknowledgement before sending audio" ({"sessionId"}, "the only server frame with no type
    field"); binary frames "paced at real time" (here: never more than lead_s ahead of the wall clock,
    so audio buffered before the acknowledgement goes out without breaking the backlog rule); then
    {"type": "endStream"} and nothing more ("Send no further events after this"), reading on until the
    transcript with final: true ("In PUSH_TO_TALK, true marks stream completion") and the close (1000).
    Redirects are not followed, as for the HTTP calls."""
    from websockets.asyncio.client import connect
    from websockets.exceptions import ConnectionClosed, InvalidHandshake, InvalidStatus, InvalidURI

    class _Connect(connect):
        def process_redirect(self, exc):        # a 3xx is refused, not followed: the key goes in the first frame
            return exc

    key = _key()
    enc = ASR_ENCODING.get(sample_rate)
    if enc is None:
        raise ValueError(f"the realtime endpoint takes 24000 or 16000 Hz audio, not {sample_rate}")
    sid = session_id or f"web-{uuid.uuid4()}"
    url, loopback = _asr_url(sid)
    hello = {"authorization": {"accessToken": f"Bearer {key}"}, "audioEncoding": enc, "model": ASR_MODEL,
             "mode": "PUSH_TO_TALK", "partialMode": "CUMULATIVE", "emitAudioProgress": False}
    if keywords:
        hello["keywords"] = list(keywords)
    if language_bias:
        hello["languageBias"] = list(language_bias)
    host = urllib.parse.urlsplit(url).hostname
    t_start = time.time()
    try:
        ws = await _Connect(url, open_timeout=open_timeout_s, proxy=None if loopback else True, logger=_WS_LOG,
                            compression=None, close_timeout=2.0, max_size=1 << 20)
    except TimeoutError:
        raise MetaAPIError(f"could not open the session within {open_timeout_s:g} s", type="timeout",
                           session_id=sid, what=ASR_WHAT) from None
    except InvalidStatus as e:                 # the upgrade itself was refused (an HTTP status, not a close code)
        raise MetaAPIError("the WebSocket upgrade was refused", status=e.response.status_code, session_id=sid,
                           what=ASR_WHAT) from None
    except (OSError, InvalidHandshake, InvalidURI) as e:
        raise MetaAPIError(f"could not reach {host}: {type(e).__name__}", type="network", session_id=sid,
                           what=ASR_WHAT) from None
    state = dict(final=None, partial="", error=None, sent=0)
    bps = sample_rate * 2
    try:
        await ws.send(json.dumps(hello))
        try:
            first = await asyncio.wait_for(ws.recv(), ack_timeout_s)
        except TimeoutError:
            raise MetaAPIError(f"no handshake acknowledgement within {ack_timeout_s:g} s", type="timeout",
                               session_id=sid, what=ASR_WHAT) from None
        except ConnectionClosed:
            raise _asr_closed(ws, sid) from None
        try:
            ack = json.loads(first) if isinstance(first, str) else None
        except ValueError:
            ack = None
        if not (isinstance(ack, dict) and "type" not in ack and isinstance(ack.get("sessionId"), str)):
            if isinstance(ack, dict) and ack.get("type") == "error":     # "Before a fatal close, the server sends an error event"
                try:
                    await asyncio.wait_for(ws.wait_closed(), ASR_AFTER_FINAL_S)
                except TimeoutError:
                    pass
                raise _asr_closed(ws, sid, ack)
            raise MetaAPIError(f"unexpected first frame: {str(first)[:120]}", type="protocol", session_id=sid,
                               what=ASR_WHAT)
        sid = ack["sessionId"] or sid
        await _emit(on_event, {"type": "ready", "sessionId": sid})

        async def send_audio():
            loop = asyncio.get_running_loop()
            t0, carry = None, b""
            try:
                async for chunk in pcm_frames:
                    chunk = carry + bytes(chunk or b"")
                    cut = len(chunk) - len(chunk) % 2       # whole 16-bit samples per frame; a stray byte waits for the next
                    chunk, carry = chunk[:cut], chunk[cut:]
                    if not chunk:
                        continue
                    now = loop.time()
                    t0 = now if t0 is None else t0
                    ahead = state["sent"] / bps - (now - t0) - lead_s
                    if ahead > 0:
                        await asyncio.sleep(ahead)
                    await ws.send(chunk)
                    state["sent"] += len(chunk)
                await ws.send(json.dumps({"type": "endStream"}))
            except ConnectionClosed:                     # Meta ended the session; receive() says why
                pass

        async def receive():
            try:
                while True:
                    msg = await ws.recv()
                    if isinstance(msg, bytes):
                        continue
                    try:
                        ev = json.loads(msg)
                    except ValueError:
                        continue
                    if not isinstance(ev, dict) or not isinstance(ev.get("type"), str):
                        continue
                    if ev["type"] == "error":
                        state["error"] = ev
                    elif ev["type"] == "transcript" and isinstance(ev.get("transcript"), str):
                        state["final" if ev.get("final") is True else "partial"] = ev["transcript"]
                    await _emit(on_event, ev)            # every event; "Ignore unknown event types" is the caller's to do
                    if state["final"] is not None:
                        try:
                            await asyncio.wait_for(ws.wait_closed(), ASR_AFTER_FINAL_S)
                        except TimeoutError:
                            pass
                        return
            except ConnectionClosed:
                return

        sender, receiver = asyncio.create_task(send_audio()), asyncio.create_task(receive())
        try:
            done, _ = await asyncio.wait({sender, receiver}, return_when=asyncio.FIRST_COMPLETED)
            if receiver not in done:
                sender.result()                          # the audio source failed: that is the caller's error
                try:
                    await asyncio.wait_for(receiver, final_timeout_s)
                except TimeoutError:
                    raise MetaAPIError(f"no final transcript within {final_timeout_s:g} s of the end of the audio",
                                       type="timeout", session_id=sid, what=ASR_WHAT) from None
            receiver.result()
        finally:
            for t in (sender, receiver):
                if not t.done():
                    t.cancel()
            await asyncio.gather(sender, receiver, return_exceptions=True)
        if state["final"] is not None:
            return state["final"].strip()
        if state["error"] is not None or ws.close_code != 1000:
            raise _asr_closed(ws, sid, state["error"])
        return state["partial"].strip()
    finally:
        log.debug("asr realtime session %s: %d bytes of audio, close %s, %.2f s", sid, state["sent"], ws.close_code,
                  time.time() - t_start)
        await ws.close()


# ------------------------------------------------------------------ cost

def est_cost(frames, prompts, images=0, audio_s=0.0):
    """US dollars at Meta's list prices (docs/pricing-rate-limits, saved 2026-10-15): video $0.20 per
    1,000 frames, once per prompt since each request takes one concept; images $2.50 per 1,000 (each image
    request is one image and one prompt); transcription $0.18 per hour, in whole seconds rounded down.
    frames: frames in the clip; prompts: a count or a list of video prompts; images: image requests."""
    n = prompts if isinstance(prompts, int) else len(prompts)
    video = int(frames) * n * PRICE_VIDEO_FRAME
    image = int(images) * PRICE_IMAGE
    audio = int(audio_s) / 3600.0 * PRICE_AUDIO_HOUR
    return {"usd": round(video + image + audio, 4), "videoUsd": round(video, 4), "imageUsd": round(image, 4),
            "audioUsd": round(audio, 4), "videoFrames": int(frames) * n, "images": int(images),
            "audioS": int(audio_s)}


def token_price(model):
    """(USD per input token, USD per output token) for a Muse text model id, or None when TOKEN_USD has no price for it.
    An OpenRouter id ("meta/muse-wonder") or a dated one takes its family's price ("muse-wonder" -> muse-wonder-1.0); a
    Contributor id has none (it is never called)."""
    m = str(model or "").strip().lower()
    if not m or "contributor" in m:
        return None
    m = m.split("/")[-1]
    if m in TOKEN_USD:
        return TOKEN_USD[m]
    for fam, ref in (("muse-wonder", "muse-wonder-1.0"), ("muse-spark-open", None), ("muse-spark", "muse-spark-1.3")):
        if m.startswith(fam):
            return TOKEN_USD.get(ref) if ref else None
    return None


def token_cost(model, tokens_in, tokens_out):
    """US dollars for one Muse text call at TOKEN_USD's list price, rounded to a millionth; None for a model with no price
    or no token counts."""
    p = token_price(model)
    if p is None or not isinstance(tokens_in, (int, float)) or not isinstance(tokens_out, (int, float)):
        return None
    return round(float(tokens_in) * p[0] + float(tokens_out) * p[1], 6)


if __name__ == "__main__" and sys.argv[1:2] == ["--decode-masks"]:
    _decode_masks_main(sys.argv[2], sys.argv[3])
