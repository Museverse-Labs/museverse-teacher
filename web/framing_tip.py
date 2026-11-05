"""The filming tip (PLAN build 9): when the framing check (framing.py) finds an upload badly framed, and its player
agreed at upload to a separate consent that is off by default ("Let a Meta model look at 4 still frames from my video to
suggest how to film the next take"), the frames the check read go to a vision model on the configured route, which
chooses one tip from a fixed list. The model only chooses: our own words for that tip are shown, never its own.

    o = offer()                    # what the upload form offers now: {"available": False}, or {"available": True,
                                   #   "route", "model", "who", "to", "frames", "maxSide"} (server.py /api/health "framingTip")
    covers(told)                   # whether a job's consent (job.json consent.framingTipAtUpload) covers the offer now
    tip = choose(fr, frames, consent, portrait=False, origin="upload")   # result.json framing.tip, or None
    urls = images(frames)          # the frames as the model gets them: data: URLs of JPEGs, 768 px at most, no metadata

What is sent, and to whom: the framing check's frames (framing.FRAMES, 4), each downscaled to at most MAX_SIDE pixels on
its long side and encoded again as a JPEG in memory (OpenCV writes no EXIF or other metadata, so whatever the phone put
in the file is gone; nothing is written to disk), with what SAM measured (framing.classify's why, the cause and the
tips that fit it, framing.tip_cause), to the route's vision model: Meta's API (Muse Spark), OpenRouter's Meta-served Muse
Spark (pinned to Meta, openrouter_api.py), or the open-weights host (Muse Spark Open, open_api.py). Muse Glimmer through
OpenRouter (DeepInfra or Together) is not offered: the consent names a Meta model, and those hosts are not the ones
named for it. The frames show the player's hands, which is why this has its own consent, separate from the one for the
wording and the questions, and 18+ like every outside service here.

What may come of it: one tip id from framing.TIPS, accepted only when it is in the set allowed for SAM's cause
(framing.accept_tip); "none" or any other id gives the cause's fixed tip. The model never changes the verdict, never adds
a finding and is never quoted: the page and the teacher say framing.TIP_WORDS[tip], under "Tip chosen by Muse Spark
(Meta)" (or "Muse Spark Open (open weights, served by Baseten)") when its choice was used. The images exist only in
memory for the call and are dropped when it ends, whatever happens; result.json keeps only the tip id, its words, the
model, who chose it and the latency (never the frames, the model's reason or its text). A timeout or any failure falls
back silently to the fixed tip. A Quest recording (a demo) never gets here: no flag unlocks it (origin must be "upload").

Settings: TEACHER_FRAMING_TIP on (the default) | off; TEACHER_FRAMING_TIP_TIMEOUT seconds for the call (default 15, 1 to
60). The offer is off too with TEACHER_FRAMING=off (no frames are read first), TEACHER_SAM=meta (hosted SAM has no
framing check), or no hosted route.
"""
import base64
import json
import logging
import os
import time

import framing as F

log = logging.getLogger("teacher.framing_tip")    # what happened, never a frame, a reason or a key
MAX_SIDE = 768
JPEG_QUALITY = 85
TIMEOUT_S = 15.0
MAX_TOKENS = 1000
TIP_KEYS = ("id", "say", "cause", "source", "by", "model", "ms")     # all result.json keeps of a tip
SYSTEM_TIP = "[private: Museverse teaching text, not in this repository]"
SCHEMA_TIP = {"type": "object", "properties": {"tip": {"type": "string", "enum": list(F.TIPS)}, "reason": {"type": "string"}},
              "required": ["tip", "reason"], "additionalProperties": False}
MODES = ("on", "off")


def setting():
    return (os.environ.get("TEACHER_FRAMING_TIP") or "on").strip().lower() or "on"


def timeout():
    try:
        v = float(os.environ.get("TEACHER_FRAMING_TIP_TIMEOUT") or TIMEOUT_S)
    except ValueError:
        v = TIMEOUT_S
    return min(60.0, max(1.0, v))


def check_env():
    """For server.main(): raises ValueError with what to set when a setting is not one this module takes."""
    if setting() not in MODES:
        raise ValueError(f"TEACHER_FRAMING_TIP must be on or off, not {setting()[:40]!r}")
    raw = os.environ.get("TEACHER_FRAMING_TIP_TIMEOUT")
    if raw:
        try:
            float(raw)
        except ValueError:
            raise ValueError(f"TEACHER_FRAMING_TIP_TIMEOUT must be a number of seconds, not {raw[:20]!r}") from None


def _backend():
    """The route's backend that may look at the frames, or None: Meta's API, OpenRouter pinned to Meta (not Muse Glimmer
    through it), or the open-weights host."""
    import voice as V
    b = V._hosted()
    if not b or (b.get("route") == "openrouter" and b.get("uploadsOnly")):
        return None
    return b


def offer():
    """What the upload form offers now (the consent is recorded against it): {"available": False}, or the route, the model,
    who chooses ("who", as the page names it) and who receives the frames ("to")."""
    import voice as V
    if setting() != "on" or F.mode(None)[0] == "off" or os.environ.get("TEACHER_SAM", "local") == "meta":
        return dict(available=False)
    b = _backend()
    if not b:
        return dict(available=False)
    route = b["route"]
    if route == "open":
        # modal and custom take any https address: it is named, so a consent to one never covers another (covers)
        here = b["hostName"] + (f" at {b['baseHost']}" if b.get("baseHost") else "")
        who, to = V.author(b["model"], b.get("servedBy")), ([here] if b.get("host") != "openrouter" else
                                                            ["OpenRouter"] + list((V.open_info() or {}).get("providers") or []))
    elif route == "openrouter":
        who, to = "Muse Spark (Meta) via OpenRouter", ["OpenRouter", "Meta"]
    else:
        who, to = "Muse Spark (Meta)", ["Meta"]
    return dict(available=True, route=route, model=b["model"], who=who, to=to, frames=F.FRAMES, maxSide=MAX_SIDE)


def covers(told):
    """Whether what a player agreed to at upload (job.json consent.framingTipAtUpload: the offer then) covers the route as
    it is now: the same route, and nobody receives the frames who was not named then."""
    if not (isinstance(told, dict) and told.get("available") is True):
        return False
    now = offer()
    return bool(now.get("available") and told.get("route") == now["route"]
                and set(now.get("to") or []) <= set(told.get("to") or []) and told.get("who") == now.get("who"))


def images(frames):
    """The frames as data: URLs of JPEGs at most MAX_SIDE pixels on their long side, decoded and encoded again in memory
    (no EXIF or any other metadata survives); a frame that cannot be read is left out."""
    import cv2
    import numpy as np
    out = []
    for path in frames or []:
        try:
            with open(path, "rb") as f:
                raw = f.read()
        except (OSError, TypeError):
            continue
        img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        del raw
        if img is None:
            continue
        h, w = img.shape[:2]
        s = min(1.0, MAX_SIDE / max(h, w))
        if s < 1.0:
            img = cv2.resize(img, (max(1, round(w * s)), max(1, round(h * s))), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        if ok:
            out.append("data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii"))
    return out


def choose(fr, frames, consent, portrait=False, origin="upload"):
    """result.json framing.tip for this check (fr: framing.classify's dict), or None when no tip is asked for: not an
    upload, a verdict with nothing to advise (framing.tip_cause), no consent that covers the offer now (adult and
    framingTipAtUpload), or no route. With a consent the tip is always given: the model's choice when it is allowed for
    SAM's cause, else (a choice outside the set, "none", a timeout, an error, no frame to show) the fixed tip, silently.
    Returns {id, say, cause, source "model" | "fixed", by, model, ms}."""
    if origin != "upload":
        return None                                # a Quest recording: never
    tc = F.tip_cause(fr, portrait)
    c = consent if isinstance(consent, dict) else {}
    if tc is None or c.get("adult") is not True or not covers(c.get("framingTipAtUpload")):
        return None
    b = _backend()
    if not b:
        return None
    import voice as V
    cause, fixed, allowed = tc
    out = dict(id=fixed, say=F.TIP_WORDS[fixed], cause=cause, source="fixed", by=None, model=None, ms=None)
    t0 = time.monotonic()
    urls, msgs = [], None
    try:
        urls = images(frames)
        if urls:
            packet = dict(measured=fr.get("why"), verdict=fr.get("verdict"), cause=cause, portrait=bool(portrait),
                          tipsThatFit=list(allowed), tips={k: v for k, v in F.TIP_WORDS.items() if v})
            msgs = [{"role": "developer", "content": SYSTEM_TIP},
                    {"role": "user", "content": [{"type": "text", "text": json.dumps(packet)}]
                     + [{"type": "image_url", "image_url": {"url": u}} for u in urls]}]
            r = V._turn(b, msgs, SCHEMA_TIP, timeout(), None, max_tokens=MAX_TOKENS, purpose="tip")    # in result.modelCalls
            got = V._reply_json(r["content"]).get("tip")
            tip, ok = F.accept_tip(got, fixed, allowed)
            out.update(id=tip, say=F.TIP_WORDS[tip], model=r.get("model"))
            if ok:
                out.update(source="model", by=_by(b, r))
                (r.get("call") or {})["used"] = "model"
            else:
                log.info("filming tip: the model's choice was not one that fits %s; the fixed tip instead", cause)
    except Exception as e:                         # a timeout, the network, a refused key, a reply that is not the JSON
        log.info("filming tip: the fixed tip instead (%s)", type(e).__name__)
    finally:
        urls.clear()                               # the frames live only for the call
        if msgs:
            msgs[1]["content"].clear()
        msgs = None
    out["ms"] = round((time.monotonic() - t0) * 1000, 1)
    return {k: out[k] for k in TIP_KEYS}


def _by(b, r):
    """Who chose the tip, as the page says it after "Tip chosen by"."""
    import voice as V
    if b.get("route") == "open":
        return V.author(r.get("model"), r.get("servedBy") or b.get("servedBy"))
    a = V.author(r.get("model")) or "Muse Spark (Meta)"
    return f"{a} via OpenRouter" if b.get("route") == "openrouter" else a
