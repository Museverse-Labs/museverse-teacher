"""The framing check: SAM 3.1 on a few frames first, before it runs on all of them, so a video that cannot
place the hands on the keys is told so in minutes rather than after an hour (pipeline.py's "hands" step).

    idx = sample(n)                                # which of the n analysed frames to segment first (FRAMES)
    fr = classify(records, notes=len(notes), frames_total=n)   # those frames' SAM 3.1 records -> the verdict and why
    m = mode(job)                                  # TEACHER_FRAMING (or job.json "framing"): skip | warn | off

Why a first look can tell. The first real take on the test bench (a 32 s Fur Elise clip, a 20 s window)
ran 61.6 minutes on a 4-core CPU (SAM 3.1 at 30.7 s a frame) and placed no hand: the keyboard ran out of
both sides of the picture in every frame, so no end of it was in view and the video could not tell the
octave (realvideo/track.mjs votes it from frames that see an end), and the hands touched the edge of the
picture in nearly every frame, so the notes could not tell it either (analysis.resolve_octave counts only
notes played while both hands are fully in view, realvideo/hands.py "atEdge"). Both are plain in any few
frames of SAM's own output, so the long run is decided after FRAMES of them.

What each record is read for (one frame; sam31/segment.py's format, in the frames' pixels):
  keyboard   a "piano keyboard" match (seen); with six or more "black piano key" matches it is a frame
             video.analyse can find the keyboard's pose in (its black-key pattern), and only such a
             frame is read for an end
  an end     the keyboard (its own mask and its black keys together: SAM often splits the keyboard at a
             hand) stops END_MARGIN of the width or more short of the left or the right side of the
             picture, and what lies between it and that side is not mostly an arm or a hand (OCCLUDED):
             on the four saved first-person takes the keyboard stopped that short of a side in 16 of 620
             frames, every time under a forearm that went on to the side (the arms covered 32 to 95 % of
             that strip), and none of them ever showed an end
  hands      "hand" matches as hands.py measures them (HAND_MIN_SCORE, MIN_HAND_PX, the same pairing of a
             hand with the hand-and-forearm SAM also returns), the two largest; each touches an image border
             when its mask comes within EDGE_PX of it (hands.py's atEdge), and on which side. hands.py tests
             that on the frames video.analyse undistorted (realvideo/lens.py: zoomed out so the side borders
             stay, which pulls the top and bottom of the picture inward, 3 to 5 px in the middle third of the
             saved takes), so the hands are undistorted first by the lens the long run will fit, fitted here on
             the frames read (lens_of): a hand the picture cuts in the middle of its bottom is then in view, as
             it will be for hands.py and analysis.resolve_octave
Verdict, over the frames read:
  no_keyboard  no "piano keyboard" match in any of them (video.analyse fails then too)
  no_octave    the keyboard there, but no end in view in any of them, and two hands fully inside the picture
               (in a frame with the keyboard) in fewer than half of them, or fewer notes heard than
               octaveMinNotes, which the sound needs played with both hands in view: neither the video nor
               the sound can then tell the octave, and the hands are judged in two parts split at middle C
               whatever the long run finds. cause says which: "keyboard" (it was in under half of them),
               "hands" (at the edge, or not both in the picture) or "notes" (the hands were fine)
  ok           anything else (the long run may still fail; nothing is decided for it here)
  unknown      fewer than half the frames have a record (a stand-in SAM, a hosted run that wrote none), or the
               keyboard was matched but six black keys in none of them (the long run may still lock it in
               other frames, so the few read cannot say)
Thresholds were set on the saved real runs (README.md "Framing check" has them, run by run); the classifier
reads only the records, so it is a pure function of them (it rasterises the masks with OpenCV, as hands.py does).

The filming tip (framing_tip.py asks a model to choose one; nothing here sends anything):
    cause, fixed, allowed = tip_cause(fr, portrait)    # what SAM's records say went wrong, its fixed tip, the tips that fit
    TIP_WORDS[tip]                                     # our own words for a tip: the page and the teacher say only these
A tip is one of TIPS. tip_cause maps a verdict that is not ok (no_keyboard; no_octave by its cause and, for the
hands, by the image sides they touched; unknown when the keyboard was seen but its black keys in no frame) to a fixed
tip and the set a model's choice must be in: a choice outside it, or "none", gives the fixed tip. The tip never changes
the verdict, the cause or any finding. A portrait video adds turn_landscape where the keyboard or the hands were cut at
the sides, and makes it the fixed tip when the keyboard was."""
import importlib.util
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
LENS_PY = os.path.join(os.path.dirname(HERE), "realvideo", "lens.py")

FRAMES = 4               # frames read first: the middle of each quarter of the window (2 minutes at 30 s a frame on a 4-core CPU)
KB_MIN_SCORE = 0.3       # sam31/segment.py's confidence floor and clean_sam.py's: the records hold nothing under it
BLACK_KEYS_MIN = 6       # video.analyse: a frame shows the keyboard when it has six or more black keys
HAND_MIN_SCORE = 0.5     # realvideo/hands.py HAND_MIN: the hands it measures
MIN_HAND_PX = 3000       # hands.py: smaller "hands" are fragments, reflections of fingertips, or the player's knees
COVER_MIN_SCORE = 0.4    # realvideo/frames.mjs HAND_MIN_SCORE: the hands and forearms the keyboard tracker blanks out
EDGE_PX = 3              # hands.py: a mask within 3 px of the image border is cut by it (atEdge)
# an end in view: the keyboard stops at least this share of the picture's width short of a side (26 px at 1280 wide;
# the left end of a top-down 88-key photo, real_images/01, sat 22 px from a 1024 px side); the solver needs a key's
# width or so of what lies past the last key to see the end, so a smaller gap could not show one anyway
END_MARGIN = 0.02
# ... and arms or hands cover less than this share of the strip between it and that side, at the keyboard's height
# (an arm over the keys hides where they go on): 0.32 to 0.95 in the 16 such frames of the saved takes, none of
# which showed an end
OCCLUDED = 0.25
LENS_MIN_EDGES = 5       # video.analyse: fewer frames with a long front edge of the keyboard, and the frames are used as they are
SIDES = ("left", "right", "top", "bottom")
MODES = ("skip", "warn", "off")
# hosted SAM on Meta's API (video.segment_meta) segments the whole video per prompt, so a few frames of it are not
# part of the long run: the check would be image requests of its own on every take
META_WHY = ("not run for hosted SAM on Meta's API: it segments the whole video per prompt, so a first look "
            "would be requests of its own on every take rather than the first frames of the run")


# ------------------------------------------------------------------ the filming tip

TIPS = ("turn_landscape", "move_back", "raise_phone", "tilt_down", "show_left_end", "show_right_end", "show_one_end",
        "hands_inside", "more_light", "steady_phone", "none")
# what the page shows and the teacher says for each tip (spoken too: no digits, nothing a check() would refuse)
TIP_WORDS = {
    "turn_landscape": "Next time, turn the phone sideways, so the keyboard runs across the picture.",
    "move_back": "Next time, move the phone further back, so the keyboard and both hands fit in the picture.",
    "raise_phone": "Next time, hold the phone higher, looking down on the keys from above and behind your hands.",
    "tilt_down": "Next time, tilt the phone down a little, so your hands are fully in the picture.",
    "show_left_end": "Next time, keep the left end of the keyboard in the picture.",
    "show_right_end": "Next time, keep the right end of the keyboard in the picture.",
    "show_one_end": "Next time, keep one end of the keyboard in the picture.",
    "hands_inside": "Next time, keep both hands fully inside the picture while you play.",
    "more_light": "Next time, film in brighter light, so the keys stand out clearly.",
    "steady_phone": "Next time, rest the phone on something steady, so the picture stays still.",
    "none": None,
}
ENDS = ("show_one_end", "show_left_end", "show_right_end")
# SAM's cause -> (the fixed tip, the tips a model's choice must be in). no_octave means no end of the keyboard in view as
# well as the hands' or the notes' trouble, so showing an end fits every one of its causes; light and a steady phone fit
# only a keyboard SAM could not find or read
TIP_CAUSES = {
    "no_keyboard": ("raise_phone", ("raise_phone", "move_back", "tilt_down", "more_light", "steady_phone")),
    "keys_unclear": ("more_light", ("more_light", "steady_phone", "raise_phone", "tilt_down")),
    "keyboard": ("move_back", ("move_back", "raise_phone", "tilt_down", "steady_phone") + ENDS),
    "hands_left": ("move_back", ("move_back", "hands_inside", "show_left_end", "show_one_end")),
    "hands_right": ("move_back", ("move_back", "hands_inside", "show_right_end", "show_one_end")),
    "hands_sides": ("move_back", ("move_back", "raise_phone", "hands_inside", "show_one_end")),
    "hands_top": ("move_back", ("move_back", "raise_phone", "hands_inside") + ENDS),
    "hands_bottom": ("tilt_down", ("tilt_down", "raise_phone", "move_back", "hands_inside") + ENDS),
    "hands_missing": ("hands_inside", ("hands_inside", "move_back", "raise_phone", "tilt_down") + ENDS),
    "notes": ("show_one_end", ENDS),
}
PORTRAIT_FIXED = ("no_keyboard", "keyboard", "hands_sides")      # a portrait video: turn it, first
PORTRAIT_ALSO = PORTRAIT_FIXED + ("hands_left", "hands_right")   # ... and turning it fits these too


def tip_cause(fr, portrait=False):
    """(cause, fixed tip, allowed tips) for a framing check's verdict (classify's dict), or None when there is nothing to
    advise: ok, an unknown verdict for want of records, or a silent take whose hands were fine. portrait: the frames were
    taller than wide."""
    if not isinstance(fr, dict):
        return None
    v = fr.get("verdict")
    if v == "no_keyboard":
        cause = "no_keyboard"
    elif v == "unknown":
        cause = "keys_unclear" if fr.get("keyboardSeen") and not fr.get("keyboardFrames") else None
    elif v == "no_octave":
        c = fr.get("cause")
        if c == "keyboard":
            cause = "keyboard"
        elif c == "notes":
            cause = "notes" if fr.get("notes") else None
        else:
            sides = [s for s in edge_sides(fr) if (fr.get("edges") or {}).get(s)]
            if "left" in sides and "right" in sides:
                cause = "hands_sides"
            elif sides:
                cause = f"hands_{sides[0]}"
            else:
                cause = "hands_missing"
    else:
        cause = None
    if cause is None:
        return None
    fixed, allowed = TIP_CAUSES[cause]
    if portrait and cause in PORTRAIT_ALSO:
        allowed = ("turn_landscape",) + allowed
        if cause in PORTRAIT_FIXED:
            fixed = "turn_landscape"
    return cause, fixed, allowed


def accept_tip(choice, fixed, allowed):
    """The tip to show: the model's choice when it is in the set allowed for SAM's cause (tip_cause), else the cause's
    fixed tip, so "none", an id outside TIPS and a tip for another trouble all give the fixed one. (tip, accepted)."""
    ok = isinstance(choice, str) and choice in TIPS and choice != "none" and choice in allowed
    return (choice if ok else fixed), ok


def mode(job=None):
    """(mode, problem): job.json "framing" when it names a mode (one job's own choice, e.g. "warn" to run every
    step whatever the check finds), else TEACHER_FRAMING, else "skip". A TEACHER_FRAMING that is none of
    MODES (server.py refuses to start with one) gives "warn", which loses nothing, and says why."""
    j = (job or {}).get("framing") if isinstance(job, dict) else None
    if isinstance(j, str) and j.strip().lower() in MODES:
        return j.strip().lower(), None
    raw = (os.environ.get("TEACHER_FRAMING") or "skip").strip().lower() or "skip"
    if raw not in MODES:
        return "warn", f"TEACHER_FRAMING={raw[:40]!r} is not one of {', '.join(MODES)}: every step was run"
    return raw, None


def check_env():
    """For server.main(): raises ValueError with what to set when TEACHER_FRAMING is not a mode."""
    raw = (os.environ.get("TEACHER_FRAMING") or "skip").strip().lower() or "skip"
    if raw not in MODES:
        raise ValueError(f"TEACHER_FRAMING must be {', '.join(MODES[:-1])} or {MODES[-1]}, not {raw[:40]!r}")


def sample(n, k=FRAMES):
    """Indices of k of n frames spread over the window, the middle of each k-th of it, in order (all of them when
    n <= k): the playing a window was chosen for runs through it, and its first and last frames are its edges."""
    if n <= k:
        return list(range(n))
    return sorted({min(n - 1, int((j + 0.5) * n / k)) for j in range(k)})


def _raster(poly, shape):
    import cv2
    m = np.zeros(shape, np.uint8)
    if poly and len(poly) >= 3:
        cv2.fillPoly(m, [np.round(np.asarray(poly, float)).astype(np.int32)], 1)
    return m


_LENS = []


def _lens_mod():
    """realvideo/lens.py, loaded once under its own name (None where it is not installed: the frames are then read as
    they are)."""
    if not _LENS:
        try:
            spec = importlib.util.spec_from_file_location("realvideo_lens", LENS_PY)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
        except (OSError, ImportError):
            mod = None
        _LENS.append(mod)
    return _LENS[0]


def lens_of(records, frames_total=None):
    """The lens video.analyse will fit (realvideo/lens.py's division model and zoom), fitted on the keyboard's front edge
    in these records, or None when the long run will use the frames as they are: no record read shows a long front edge,
    or, of frames_total frames, fewer than LENS_MIN_EDGES would at the share the records show."""
    L = _lens_mod()
    recs = [r for r in records if isinstance(r, dict) and r.get("width") and r.get("height")]
    if L is None or not recs:
        return None
    shape = (int(recs[0]["height"]), int(recs[0]["width"]))
    sets = []
    for r in recs:
        try:
            e = L.front_edge(shape, r) if (int(r["height"]), int(r["width"])) == shape else None
        except (KeyError, TypeError, ValueError, AttributeError):   # a record without the fields lens.py reads
            e = None
        if e is not None:
            sets.append(e)
    if not sets or (frames_total is not None and len(sets) / len(recs) * frames_total < LENS_MIN_EDGES):
        return None
    res = L.fit_edges(sets, *shape)
    return res if np.isfinite(res["lambda"]) and np.isfinite(res["zoom"]) else None


def _undistort(dets, lens):
    """Detections with their polygons as lens.py apply writes them (undistorted and zoomed), for hands.py's edge test."""
    if not lens:
        return dets
    L = _lens_mod()
    return [dict(r, polygon=L.apply_pts(lens, r["polygon"]).tolist()) if r.get("polygon") else r for r in dets]


def _sides(m):
    """The image borders a mask comes within EDGE_PX of, as hands.py tests it."""
    e = EDGE_PX
    return [s for s, hit in zip(SIDES, (m[:, :e].any(), m[:, -e:].any(), m[:e].any(), m[-e:].any())) if hit]


def _hands(dets, shape):
    """The hands hands.py would measure: matches of HAND_MIN_SCORE or more and MIN_HAND_PX or larger, the hand and
    the hand-with-forearm SAM often returns for one hand taken as one (masks overlapping by more than half of the
    smaller; the smallest still 40 % of the largest kept), the two largest. [(mask, area)]."""
    items = []
    for r in sorted(dets, key=lambda r: -r.get("score", 0.0)):
        if r.get("score", 0.0) < HAND_MIN_SCORE or not r.get("polygon"):
            continue
        m = _raster(r["polygon"], shape)
        a = int(m.sum())
        if a >= MIN_HAND_PX:
            items.append((m, a))
    groups = []
    for it in items:
        for g in groups:
            if any((it[0] & o[0]).sum() / min(it[1], o[1]) > 0.5 for o in g):
                g.append(it)
                break
        else:
            groups.append([it])
    out = []
    for g in groups:
        big = max(o[1] for o in g)
        out.append(min((o for o in g if o[1] >= 0.4 * big), key=lambda o: o[1]))
    return sorted(out, key=lambda o: -o[1])[:2]


def frame_view(rec, lens=None):
    """One frame's record -> {"seen": a keyboard match, "keyboard": with six black keys, "ends": [side of an end in
    view], "margins": {left, right: px or None}, "hands": [[sides it touches], ...] (largest first), "bothInside": two
    hands touching no border}. lens
    (lens_of): the hands are measured on the frame undistorted by it, as hands.py measures them."""
    W, H = int(rec.get("width") or 0), int(rec.get("height") or 0)
    P = rec.get("prompts") or {}
    out = {"seen": bool(P.get("piano keyboard")),
           "keyboard": bool(P.get("piano keyboard")) and len(P.get("black piano key") or []) >= BLACK_KEYS_MIN,
           "ends": [], "margins": {"left": None, "right": None}, "hands": [], "bothInside": False}
    if W <= 0 or H <= 0:
        return out
    shape = (H, W)
    kb = np.zeros(shape, np.uint8)
    for p in ("piano keyboard", "black piano key"):
        for r in P.get(p) or []:
            if r.get("score", 0.0) >= KB_MIN_SCORE and r.get("polygon"):
                kb |= _raster(r["polygon"], shape)
    cols, rows = np.nonzero(kb.any(0))[0], np.nonzero(kb.any(1))[0]
    if out["keyboard"] and len(cols):
        cover = np.zeros(shape, np.uint8)
        for p in ("hand", "forearm"):
            for r in P.get(p) or []:
                if r.get("score", 0.0) >= COVER_MIN_SCORE and r.get("polygon"):
                    cover |= _raster(r["polygon"], shape)
        y0, y1 = int(rows[0]), int(rows[-1]) + 1
        for side, gap in (("left", (0, int(cols[0]))), ("right", (int(cols[-1]) + 1, W))):
            px = gap[1] - gap[0]
            out["margins"][side] = px
            if px >= END_MARGIN * W and float(cover[y0:y1, gap[0]:gap[1]].mean()) < OCCLUDED:
                out["ends"].append(side)
    out["hands"] = [_sides(m) for m, _ in _hands(_undistort(P.get("hand") or [], lens), shape)]
    out["bothInside"] = len(out["hands"]) == 2 and not any(out["hands"])
    return out


def classify(records, notes=None, frames_total=None):
    """The verdict on the sampled frames' records (None for a frame with no record), in the order they were taken.
    notes: how many notes the transcriber heard (None: not known, the notes are then not counted). frames_total: how
    many frames the long run would read (lens_of; None: enough to fit the lens when these frames can). Returns
    {frames, read, keyboardSeen, keyboardFrames, endInView, endFrames, bothHandsInside, bothEdgeFrames, oneHandFrames,
    noHandFrames, edges: {side: frames with a hand touching it}, notes, lens, verdict, cause, why}: why is the reason
    in a few words, for the step note; cause (no_octave only) is keyboard, hands or notes."""
    import analysis as A
    lens = lens_of(records, frames_total)
    views = [frame_view(r, lens) if isinstance(r, dict) else None for r in records]
    read = [v for v in views if v is not None]
    n = len(read)
    fr = dict(frames=len(records), read=n, keyboardSeen=sum(v["seen"] for v in read), keyboardFrames=sum(v["keyboard"] for v in read),
              # hands.py measures the hands only in frames whose keyboard the tracker locked, which it can carry through
              # frames with few black keys in view (track.mjs "tracked"), so a keyboard match is enough here
              endFrames=sum(bool(v["ends"]) for v in read), bothHandsInside=sum(v["bothInside"] and v["seen"] for v in read),
              bothEdgeFrames=sum(len(v["hands"]) == 2 and all(v["hands"]) for v in read),
              oneHandFrames=sum(len(v["hands"]) == 1 for v in read), noHandFrames=sum(not v["hands"] for v in read),
              edges={s: sum(any(s in h for h in v["hands"]) for v in read) for s in SIDES}, notes=notes,
              lens=None if lens is None else {k: round(float(lens[k]), 4) for k in ("lambda", "zoom")}, cause=None)
    fr["endInView"] = fr["endFrames"] > 0
    if not records or n < max(1, math.ceil(len(records) / 2)):
        return dict(fr, verdict="unknown", why=f"only {n} of {len(records)} frames had SAM's output")
    if not fr["keyboardSeen"]:
        return dict(fr, verdict="no_keyboard", why="no keyboard")
    if not fr["keyboardFrames"]:
        return dict(fr, verdict="unknown", why="the keyboard seen, but six of its black keys in none of the frames")
    hands_few = 2 * fr["bothHandsInside"] < n
    # the sound places the hands from octaveMinNotes notes played with both in view: with fewer notes than that in all,
    # no framing could have done it (a count from a few frames would only be a guess, so only this sure case counts)
    notes_few = notes is not None and notes < A.CFG["octaveMinNotes"]
    if not fr["endInView"] and (hands_few or notes_few):
        fr["cause"] = "keyboard" if 2 * fr["keyboardSeen"] < n else "hands" if hands_few else "notes"
        return dict(fr, verdict="no_octave", why="no end of the keyboard in view, " + hands_words(fr))
    return dict(fr, verdict="ok", why="an end of the keyboard in view" if fr["endInView"] else "both hands inside the picture")


def edge_sides(fr):
    """The image sides a hand touched in at least half the frames read (else the one it touched most), in SIDES order."""
    e, n = fr.get("edges") or {}, max(fr.get("read") or 0, 1)
    most = [s for s in SIDES if e.get(s, 0) * 2 >= n]
    if not most and any(e.values()):
        most = [max(SIDES, key=lambda s: e.get(s, 0))]
    return most


def hands_words(fr):
    """Why the frames could not tell the octave, in a few words (no digits: voice.py speaks them): the keyboard out of
    the picture in most of them, a hand or both at an edge of it (which), no hands or only one in it, or too few notes
    for the sound (cause "notes": the hands were fine)."""
    sides = edge_sides(fr)
    n = max(fr.get("read") or 0, 1)
    if fr.get("cause") == "keyboard" or (fr.get("cause") is None and fr.get("keyboardSeen") is not None and fr["keyboardSeen"] * 2 < n):
        return "the keyboard out of the picture in most of them"
    if fr.get("cause") == "notes":
        return "too few notes for the sound to tell which keys" if fr.get("notes") else "no notes for the sound to go by"
    if sides and sum((fr.get("edges") or {}).values()):
        where = sides[0] if len(sides) == 1 else ", ".join(sides[:-1]) + " and " + sides[-1]
        who = "both hands" if 2 * (fr.get("bothEdgeFrames") or 0) >= n else "a hand"
        return f"{who} at the {where} edge{'s' if len(sides) > 1 else ''} of the picture"
    if fr.get("noHandFrames", 0) * 2 >= n:
        return "no hands in the picture"
    if fr.get("oneHandFrames", 0) + fr.get("noHandFrames", 0) > 0:
        return "only one hand in the picture"
    return "both hands fully inside the picture in too few of them"
