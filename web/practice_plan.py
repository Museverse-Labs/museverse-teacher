"""The practice plan for one take: about ten minutes in three to five blocks, each an exercise from the pool of a finding
the take's measurements decided (teacher_tools.pool), with its minutes and one reason in the finding's own words.

    plan = make(res)          # res: the result as voice.word leaves it (the advice fields filled), with its policy
    plan["blocks"]            # [{findingId, exerciseId, exercise, minutes, reason, title, kind, fromS, toS, new}]
    plan["source"], plan["by"]    # "muse-wonder" | "muse-spark" | "muse-spark-open" | "fixed"; "Muse Wonder (Meta)",
                                  # "Muse Spark (Meta)", "Muse Spark Open (open weights, served by <host>)" or None
    plan["none"]              # instead of blocks, when there is nothing to work on: why, in words

Who plans, under the conversation's own gates (voice._backend: the hosted route only when hosted_allowed() allows this
take, and never for a take with a fingering finding or strength; a Quest take only with the Quest flags and an adult):
  1. Muse Wonder (OPENROUTER_PLAN_MODEL, default meta/muse-wonder; on Meta's API MUSE_PLAN_MODEL, default
     muse-wonder-1.0), with a json_schema response_format whose enums are this take's own exercise and finding ids;
  2. else, or when its plan fails the checks, the conversation's Muse Spark, the same way (on the open-weights route,
     voice.py's TEACHER_MUSE=open, only Muse Spark Open, with the same enum schema and checks: Muse Wonder is not open
     weights, and where the host has no response_format the plan is asked for in the prompt and read strictly from
     the text, open_api.parse_json);
  3. else the deterministic plan: the top findings' own exercises, as their advice lists them, never one twice
     (TEACHER_PLAN=fixed always gives it; TEACHER_PLAN_TIMEOUT bounds 1 and 2 together, default 40 s).
A hosted model plans only for a take whose player agreed to text that names the plan (consent_names_plan: an upload
agreed from PLAN_CONSENT on); an older upload gets the deterministic plan. A keep-doing block (a strength) is the item's
own check, kept listening for, never a drill for a problem the player does not have.
A model only chooses and words. The findings, the pool and the limits are ours, and validate() checks every id, that
each exercise is from the pool of the finding it is for, the minutes (whole, 1 to 6 a block, 8 to 12 in all), 3 to 5
blocks with the first finding in them, at most one keep-doing block (a strength, never first), and every reason by the
spoken rules (voice.check: no number but that finding's own times and bars, no comparison, no banned or medical word,
no "perfect", no hand the finding is not about). A plan that fails any of it is not used; the opening line (intro) is
only dropped.
Nothing to work on (no finding of kind mistake or tip, and no octave run lane L1 reported; on a take too short to judge
the technique, none against the score): no plan, saying why, and no week (a "none" plan has no
days, and a plan with days never says nothing stood out).
A reported octave run (voice.worked_findings) is a target like any finding: its exercises are the exercise library's for a
passage in another register, in voice.OCTAVE_RUN's words (octave_pool: the register anchor, hearing it first, the ladder).
"""
import hashlib
import json
import os
import re
import time

import teacher_tools as TT
import voice as V

VERSION = 1
PLAN_TIMEOUT_S = 40.0
PLAN_CONSENT = "2026-10-27"    # the upload agreement (server.CONSENT_VERSION) from which it names the plan and Muse Wonder
MINUTES = 10                   # what the plan is for
MIN_TOTAL, MAX_TOTAL = 8, 12   # what a model's plan may add up to
BLOCK_MIN, BLOCK_MAX = 1, 6
MIN_BLOCKS, MAX_BLOCKS = 3, 5
TARGETS = 4                    # findings a model is offered, the most important first
KEEPS = 2                      # strengths a model may give a keep-doing block to (one at most is used)
REASON_WORDS = 25
ASK_MINUTES = 2                # a finding asked as a question: one block, to play it both ways and choose
NONE = {
    "no notes": "[private: Museverse teaching text, not in this repository]",
    "too short": "[private: Museverse teaching text, not in this repository]",
    "nothing judged": "[private: Museverse teaching text, not in this repository]",
    "nothing": "[private: Museverse teaching text, not in this repository]",
    # the lesson could not settle every note (lesson.unsure): never "nothing stood out" beside it (FR8; lesson.agree)
    "unsure": "[private: Museverse teaching text, not in this repository]",
    # no score chosen and no library piece recognised (lesson.NOTHING_UNKNOWN): the notes were compared with nothing
    "unknown": "[private: Museverse teaching text, not in this repository]",
}
# NONE["too short"] on a short re-take with what changed since the first take (server.py, with progress)
NONE_RETAKE = "A short re-take: what changed since your first take is in the plan; a full plan needs a few phrases or more of playing."
SYSTEM_PLAN = "[private: Museverse teaching text, not in this repository]"


def targets(res, hosted=False):
    """The findings a plan works on (kind mistake or tip, with exercises), the most important first. hosted: none of the
    fingering ones (a take with any never goes to a hosted model anyway), and no remark of a comparison with a reference
    recording whose pianist's consent has no "hostedModels" (voice.reference_block). On a take too short to judge the technique, only
    the findings against the score, which are measured on a take of any length."""
    out = []
    short = V.not_judged(res) in ("too short", "nothing judged")
    for f in V.worked_findings(res):              # mistakes, tips and reported octave runs; never an unreported run
        if not f.get("id"):
            continue
        if short and f.get("item") not in V.SCORE and not V.is_octave_run(f):
            continue                               # an octave run is measured against the score, on a take of any length
        if hosted and f.get("item") in V.FINGER_ITEMS:
            continue
        if hosted and f.get("item") in V.REF_ITEMS and not V.reference_block(res, hosted=True):
            continue                               # a reference remark its pianist's consent keeps from hosted models
        if pool_of(res, f):
            out.append(f)
    return out


def octave_pool(f):
    """A reported octave run's exercises, as TT.pool gives a finding's ({id, text, tags, new}): the exercise library's
    for a run in another register (voice.OCTAVE_EXERCISES: the register anchor, hearing it first, the ladder) in
    voice.OCTAVE_RUN's words, the first the one its advice leads with."""
    tags = (dict(tempo="slow", hand="separate" if f.get("hand") in ("L", "R") else "any", kind="drill"),
            dict(tempo="slow", hand="any", kind="listening"), dict(tempo="slow", hand="any", kind="drill"))
    return [dict(id=xid, text=t, tags=dict(tag), new=False)
            for xid, t, tag in zip(V.OCTAVE_EXERCISES, V.OCTAVE_RUN["how_to_practise"], tags)]


def pool_of(res, f):
    """A finding's exercises: a reported octave run's (octave_pool), else teacher_tools.pool's."""
    return octave_pool(f) if V.is_octave_run(f) else TT.pool(res, f)


def order_of(res, f):
    """The ids of a finding's exercises in its advice's order (teacher_tools.default_order; an octave run's own order)."""
    return [p["id"] for p in octave_pool(f)] if V.is_octave_run(f) else TT.default_order(res, f)


def keep_id(g):
    return f"keep-{g.get('item')}-{g.get('hand') or g.get('part') or 'both'}"


def keep_exercise(g):
    """A strength's keep-doing block: its item's own check (check_yourself), to keep listening for, as the one exercise
    a keep block may have ({id: "<item>.check", text, tags, new}); None for an item with none."""
    item = V.ALIAS.get(g.get("item"), g.get("item"))
    a = V.ADVICE["items"].get(item) or {}
    if not a.get("check_yourself"):
        return None
    text = V._fill(a["check_yourself"], V.HAND.get(g.get("hand")), "", g.get("part"))
    return dict(id=f"{item}.check", text=text, tags=dict(tempo="any", hand="any", kind="listening"), new=False)


def consent_names_plan(consent):
    """Whether what the player agreed to at upload names the practice plan, so a hosted model may write it: job.json's
    consent from PLAN_CONSENT on (the test bench's "testbench-<date>" too). No consent record (a run outside the
    server, whose policy sends nothing anywhere): True."""
    if not isinstance(consent, dict):
        return True
    m = re.match(r"(?:testbench-)?(\d{4}-\d{2}-\d{2})", str(consent.get("version") or ""))
    return bool(m and m.group(1) >= PLAN_CONSENT)


def keeps(res):
    """The strengths a keep-doing block may be for, with their ids: technique ones only (never fingering, nor the score's
    "notes as written", whose exercises are for notes that slipped), and none on a take too short to judge the technique."""
    out = []
    if V.not_judged(res):
        return out
    for g in res.get("strengths") or []:
        if (isinstance(g, dict) and g.get("item") not in V.FINGER_ITEMS and g.get("item") not in V.SCORE and keep_exercise(g)
                and keep_id(g) not in [keep_id(x) for x in out]):
            out.append(g)
    return out[:KEEPS]


def source_of(model):
    m = str(model or "").lower()
    return ("muse-wonder" if "wonder" in m else "muse-glimmer" if "glimmer" in m else "muse-spark-open" if "muse-spark-open" in m
            else "muse-spark")


def _pool(res, x, keep=False):
    """What a block for x may take: a finding's pool, or a strength's one check."""
    return [keep_exercise(x)] if keep else pool_of(res, x)


def _title(res, f, keep, ts):
    """A block's title: the finding's (a strength's), with its hand or part when another finding the plan works on
    has the same item ("Wrist lower than usual, right hand"), so two blocks never read as one."""
    t = (f.get("title") or V.praise(f)["title"]) if keep else (f.get("title") or V.fixed_finding(f)["title"])
    if not keep and any(x is not f and x.get("item") == f.get("item") for x in ts):
        side = V.HAND.get(f.get("hand")) and f"{V.HAND[f['hand']]} hand" or V.PART_WORDS.get(f.get("part"))
        if side:
            t = f"{t}, {side}"
    return t


def _block(res, f, xid, minutes, reason, keep=False, ts=()):
    p = next(p for p in _pool(res, f, keep) if p["id"] == xid)
    out = dict(findingId=keep_id(f) if keep else f["id"], exerciseId=xid, exercise=p["text"], minutes=int(minutes),
               reason=V.clean(reason) if reason else None, title=_title(res, f, keep, ts), kind="keep" if keep else "work",
               new=bool(p["new"]))
    if not keep and isinstance(f.get("fromS"), (int, float)):
        out.update(fromS=f["fromS"], toS=f.get("toS", f["fromS"]))
    return out


def unplanned(res):
    """Whether the take gets no plan (none_plan): no notes heard, or nothing to work on (targets: on a take too short to
    judge the technique, only a finding against the score, which is measured on a take of any length)."""
    return V.not_judged(res) == "no notes" or not targets(res)


def none_plan(res):
    why = V.not_judged(res)
    return dict(version=VERSION, blocks=[], none=NONE[why] if why else NONE["nothing"], source="fixed", model=None, by=None)


def fixed_plan(res, note=None):
    """The deterministic plan: the first finding's first exercises, then the next findings' first ones, 10 minutes in
    all, and a minute for the first strength when there is one; a finding asked as a question (hands_apart's lead
    that may be meant) has one ASK_MINUTES block, playing it both ways to choose, never the drills that remove it.
    No exercise twice: a finding whose next default is already in the plan (the same item for the other hand) takes
    its next one. A finding's reason is its own what-I-saw line, said on its first block only."""
    ts = targets(res)[:3]
    if unplanned(res):
        return none_plan(res)
    order = {f["id"]: order_of(res, f) for f in ts}
    # a finding asked as a question (the lead may be meant) gets one short block, its choice exercise, and no drills
    asks = [f for f in ts if f.get("question")][:1]
    work = [f for f in ts if not f.get("question")]
    if not work:
        slots = []
    elif len(work) == 1:
        slots = [(work[0], 4), (work[0], 3), (work[0], 3)]
    elif len(work) == 2 and work[0].get("item") == work[1].get("item"):
        # the same item in both hands (both wrists lower than usual): each hand its own first exercise, and the
        # first hand's next one (on a relative wrist tip the seat check, said as "if it is low everywhere") short
        slots = [(work[0], 4), (work[1], 4), (work[0], 2)]
    elif len(work) == 2:
        slots = [(work[0], 4), (work[0], 2), (work[1], 4)]
    else:
        slots = [(work[0], 4), (work[1], 3), (work[2], 3)]
    if asks:
        if slots:
            slots[0] = (slots[0][0], slots[0][1] - ASK_MINUTES)
        slots.insert(0 if ts[0] in asks else len(slots), (asks[0], ASK_MINUTES))
    picks, used = [], set()
    for f, m in slots:
        texts = {p["id"]: p["text"] for p in pool_of(res, f)}
        x = next((i for i in order[f["id"]] if i not in used and texts.get(i) not in {b[3] for b in picks}), None)
        if x is None:                              # nothing left for it: its minutes go to the block before
            if picks:
                picks[-1][2] += m
            continue
        used.add(x)
        picks.append([f, x, m, texts.get(x)])
    blocks, said = [], set()
    for f, x, m, _ in picks:
        reason = None if f["id"] in said else (f.get("what") or f.get("say") or V.fixed_finding(f)["what"])
        said.add(f["id"])
        blocks.append(_block(res, f, x, m, reason, ts=ts))
    ks = keeps(res)
    if ks and blocks[-1]["minutes"] > 1:
        k = ks[0]
        blocks[-1]["minutes"] -= 1
        blocks.append(_block(res, k, keep_exercise(k)["id"], 1, k.get("say") or V.praise(k)["say"], keep=True))
    out = dict(version=VERSION, blocks=blocks, minutes=sum(b["minutes"] for b in blocks), intro=None, source="fixed", model=None, by=None)
    if note:
        out["note"] = note
    return out


def _packet(res):
    ts, ks = targets(res, hosted=True)[:TARGETS], keeps(res)

    def pool(x):
        return [dict(id=p["id"], text=p["text"], tags=p["tags"]) for p in pool_of(res, x)]
    findings = [{k: v for k, v in dict(id=f["id"], title=f.get("title"), kind=f.get("kind"), confidence=f.get("confidence"),
                                       hand=V.HAND.get(f.get("hand")), part=V.PART_WORDS.get(f.get("part")), when=V.when_phrase(f),
                                       what=f.get("what") or f.get("say"), pool=pool(f)).items() if v is not None}
                for f in ts]
    strengths = [dict(id=keep_id(g), title=g.get("title") or V.praise(g)["title"], say=g.get("say") or V.praise(g)["say"],
                      pool=[{k: v for k, v in keep_exercise(g).items() if k != "new"}]) for g in ks]
    return dict(minutes=MINUTES, findings=findings, strengths=strengths), ts, ks


def schema(ts, ks, res):
    """The plan's response_format: blocks whose ids are enums of this take's own findings, strengths and pool."""
    fids = [f["id"] for f in ts] + [keep_id(g) for g in ks]
    xids = list(dict.fromkeys([p["id"] for x in ts for p in pool_of(res, x)] + [keep_exercise(g)["id"] for g in ks]))
    block = {"type": "object", "properties": {"exerciseId": {"type": "string", "enum": xids},
                                              "findingId": {"type": "string", "enum": fids},
                                              "minutes": {"type": "integer", "minimum": BLOCK_MIN, "maximum": BLOCK_MAX},
                                              "reason": {"type": "string"}},
             "required": ["exerciseId", "findingId", "minutes", "reason"], "additionalProperties": False}
    return {"type": "object", "properties": {"intro": {"type": "string"},
                                             "blocks": {"type": "array", "items": block, "minItems": MIN_BLOCKS, "maxItems": MAX_BLOCKS}},
            "required": ["intro", "blocks"], "additionalProperties": False}


def line_problems(res, text, f=None, words=REASON_WORDS):
    """Why a reason (or the intro: f None) must not be shown: the spoken rules, with only this finding's own times and bars
    (a strength's reason: f the strength, which gives no time)."""
    t = V.clean(text if isinstance(text, str) else "")
    if not t:
        return ["empty"]
    times, bars, lead = [], [], False
    if f is not None and isinstance(f.get("fromS"), (int, float)) and isinstance(f.get("toS", f.get("fromS")), (int, float)):
        w = V.when(f)
        times = sorted({w, *w.split(" to "), V.clock(f["fromS"]), V.clock(f.get("toS", f["fromS"]))}, key=len, reverse=True)
        bars = V.bar_numbers(f)
        lead = V.lead_hand(f) if f.get("item") == "hands_apart" else False
    # a reason never names the reference recording (only the comparison's own lines do); on a take with no comparison,
    # "reference" is the player's own score and is the player's word to use
    why = V.check(t, None, times, words, lead=lead, bars=bars, reference=False if isinstance(res.get("proCompare"), dict) else None)
    m = V.MEDICAL.search(t)
    if m:
        why.append(f"a medical word: {m.group(0)}")
    m = V.FLAWLESS.search(t)
    if m:
        why.append(f"a verdict no measurement gives: {m.group(0)}")
    hand = V.HAND.get(f.get("hand")) if f else None
    split = f is not None and (f.get("part") or (V.split_at_middle_c(res) and not V._quest(res)))
    for h in ("left", "right"):
        if re.search(rf"\b{h}\b", t, re.I) and (split or h != hand):
            why.append(f"names the {h} hand, which this finding is not about")
    return why


def validate(res, out, ts, ks):
    """Why a model's plan must not be used ([] when it may): the ids, the pool, the minutes and the reasons."""
    blocks = out.get("blocks") if isinstance(out, dict) else None
    if not isinstance(blocks, list) or not blocks:
        return ["no blocks"]
    why = []
    if not MIN_BLOCKS <= len(blocks) <= MAX_BLOCKS:
        why.append(f"{len(blocks)} blocks, not {MIN_BLOCKS} to {MAX_BLOCKS}")
    by = {f["id"]: (f, False) for f in ts}
    by.update({keep_id(g): (g, True) for g in ks})
    pools = {k: {p["id"] for p in _pool(res, x, keep)} for k, (x, keep) in by.items()}
    seen, total, kept = set(), 0, 0
    for i, b in enumerate(blocks):
        if not isinstance(b, dict):
            why.append(f"block {i + 1} is not an object")
            continue
        fid, xid, mins = b.get("findingId"), b.get("exerciseId"), b.get("minutes")
        if fid not in by:
            why.append(f"block {i + 1}: no finding or strength {str(fid)[:40]!r}")
            continue
        x, keep = by[fid]
        if xid not in pools[fid]:
            why.append(f"block {i + 1}: {str(xid)[:40]!r} is not in the pool of {fid}")
        if xid in seen:
            why.append(f"block {i + 1}: {xid} twice")
        seen.add(xid)
        if not isinstance(mins, int) or isinstance(mins, bool) or not BLOCK_MIN <= mins <= BLOCK_MAX:
            why.append(f"block {i + 1}: minutes {mins!r}")
        else:
            total += mins
        if keep:
            kept += 1
            if i == 0:
                why.append("a keep-doing block first")
        bad = line_problems(res, b.get("reason"), x)
        if bad:
            why.append(f"block {i + 1}'s reason: {'; '.join(bad)}")
    if kept > 1:
        why.append(f"{kept} keep-doing blocks")
    if not MIN_TOTAL <= total <= MAX_TOTAL:
        why.append(f"{total} minutes in all, not {MIN_TOTAL} to {MAX_TOTAL}")
    if ts and not any(isinstance(b, dict) and b.get("findingId") == ts[0]["id"] for b in blocks):
        why.append("the first finding is not in the plan")
    return why


def _deadline():
    """When the plan's models must have answered: voice.purpose_timeout("plan") from now (TEACHER_TIMEOUT_PLAN, else
    TEACHER_PLAN_TIMEOUT, else PLAN_TIMEOUT_S)."""
    return time.monotonic() + V.purpose_timeout("plan")


def hosted_plan(res, b, adult=None):
    """(the plan from the hosted route b, or None; what happened, model by model)."""
    packet, ts, ks = _packet(res)
    notes = []
    if not ts:
        return None, notes
    sch = schema(ts, ks, res)
    msgs = [{"role": "developer", "content": SYSTEM_PLAN}, {"role": "user", "content": json.dumps(packet, ensure_ascii=False)}]
    tid = V._target_id(res)
    extra = dict(safety_identifier=hashlib.sha256(tid.encode()).hexdigest()[:32]) if tid else None
    end = _deadline()
    models = V.plan_models(b)
    with V.purpose("plan"):
        return _hosted_tries(res, b, adult, models, end, msgs, sch, extra, ts, ks, notes)


def _hosted_tries(res, b, adult, models, end, msgs, sch, extra, ts, ks, notes):
    """hosted_plan's models in turn, until one's plan passes validate() (each call in the call log, the one used marked)."""
    k = 0
    while k < len(models):
        m = models[k]
        left = end - time.monotonic()
        if left < 1.0:
            notes.append(dict(model=m, error="no time left"))
            break
        t0 = time.monotonic()
        mark = V.call_mark()
        try:
            r = V._turn(b, msgs, sch, min(left, 45.0), extra, model=m, max_tokens=4000)
            out = V._reply_json(r["content"])
            bad = validate(res, out, ts, ks)
        except V.MetaKeyRefused:
            b2 = V._hosted()                      # the refused Meta key counts as unset now: OpenRouter, when allowed
            if b2 and b2.get("route") == "openrouter" and V.hosted_allowed(res, adult, "openrouter") and not V._fingering_content(res):
                b, models, k = b2, V.plan_models(b2), 0
                notes.append(dict(model=m, error="Meta's API refused the key; trying OpenRouter"))
                continue
            notes.append(dict(model=m, error="Meta's API refused the key"))
            break
        except V.ContributorReply as e:           # never asked again, as word, word_lesson, the judge and chat do
            notes.append(dict(model=m, error=V._scrub(f"{type(e).__name__}: {e}")[:200]))
            break
        except Exception as e:                    # network, timeout, bad JSON, a refused request: the next model
            notes.append(dict(model=m, error=V._scrub(f"{type(e).__name__}: {e}")[:200]))
            k += 1
            continue
        if bad:
            notes.append(dict(model=r["model"], rejected=bad[:6], usage=r.get("usage")))
            k += 1
            continue
        by = {f["id"]: (f, False) for f in ts}
        by.update({keep_id(g): (g, True) for g in ks})
        blocks = [_block(res, by[x["findingId"]][0], x["exerciseId"], x["minutes"], x["reason"], keep=by[x["findingId"]][1], ts=ts)
                  for x in out["blocks"]]
        intro = V.clean(out.get("intro")) if isinstance(out.get("intro"), str) else None
        if intro and line_problems(res, intro, None, 25):
            notes.append(dict(model=r["model"], intro="dropped: " + "; ".join(line_problems(res, intro, None, 25))))
            intro = None
        notes.append(dict(model=r["model"], ok=True, seconds=round(time.monotonic() - t0, 2), usage=r.get("usage")))
        V.mark_used(mark)
        return dict(version=VERSION, blocks=blocks, minutes=sum(x["minutes"] for x in blocks), intro=intro or None,
                    source=source_of(r["model"]), model=V.label(dict(b, model=r["model"], servedBy=r.get("servedBy") or b.get("servedBy"))),
                    by=V.author(r["model"], r.get("servedBy")),
                    seconds=round(time.monotonic() - t0, 2), usage=r.get("usage") or {}), notes
    return None, notes


def _still(b):
    """A compared bar the re-take still has work in: worse, or about the same with slips. On a video only the notes different
    from the score, or as many not heard as the bar's margin (compare.bar_margins): fewer may be the transcriber's own misses."""
    if b["verdict"] == "worse":
        return True
    if b["verdict"] != "same" or not b["after"]["slips"]:
        return False
    mg = b.get("minChange") or {}
    if not mg or "slips" in mg:                     # exact notes: every slip is the player's
        return True
    return b["after"].get("wrong", 0) > 0 or b["after"].get("missed", 0) >= mg.get("missed", 0)


@V.on_clip
def progress(cmp):
    """A re-take's plan opens with what changed since the first take, in fixed words from the comparison (compare.py), never
    a model's: the bars better (clean now where they had slips), the bars still worth the work (worse, or the same with
    slips: _still), and a finding under its limit now. At most three lines; None when nothing could be compared."""
    import compare as C
    if not isinstance(cmp, dict):
        return None
    bars, rows = cmp.get("bars") or [], cmp.get("findings") or []
    out = []
    better = [b for b in bars if b["verdict"] == "better"]
    if better:
        out.append(f"Better since your first take: {C.bar_labels(better, bars)}.")
    still = [b for b in bars if _still(b)]
    if still:
        out.append(f"Still worth the work: {C.bar_labels(still, bars)}.")
    cleared = [r for r in rows if r.get("cleared")]
    if cleared:
        out.append(f"{C.finding_title(cleared[0])}: under its limit now.")
    elif not bars:
        judged = [r for r in rows if r["verdict"] != "not measured"]
        if judged:
            out.append(f"{C.finding_title(judged[0])}: {C.VERDICT_WORDS[judged[0]['verdict']]} since your first take.")
    if not out and bars:
        out.append(f"{C.bars_span(bars)[0].upper()}{C.bars_span(bars)[1:]}: about the same as your first take.")
    return out[:3] or None


# ---------------------------------------------------------------- the week
# The 2026-11-02 call organised the feedback as a multi-day practice cycle. The session above becomes day 1 of a week
# planned by our course's week rules (its Für Elise drills are
# not carried over, the lesson's own exercises are):
#   - per exercise and tempo, play until 5 clean passes in a row; the next session 10 faster, and the same tempo again
#     when it did not get there (CLEAN_IN_A_ROW, STEP; one finish line, never "3 more");
#   - days 1-2: each exercise in two visits; day 1's run-through only the bars the lesson worked on, day 2's the whole
#     stretch the take played, twice;
#   - days 3-6: a first try (once through before anything else, no pausing to fix), then the exercises in turns (one
#     pass each; a clean pass earns a tick, a slip wipes that exercise's ticks; done at 5 ticks each, the one that
#     wobbled in the first try first), then a run-through at the slowest exercise's tempo; days 5-6 a count-in and then
#     the click off;
#   - day 7: film it again, the same bars the same way (the first full take counts), so the re-take can be compared.
# The tempos: the piece's own drill block (pedagogy.json: startClicksPerMin, ladder, clickUnitQ) when core has one; else
# a quarter below the player's own steady tempo (the lesson's ghost plays at it), rounded down to 10, on the piece's
# beat; else 60, 70, 80. A tempo is a click a minute, said as one ("at 60 on the click"), never as a share of anything.
# Muse Wonder words the items (purpose "plan", under the same schema-and-check pattern as the session: every number,
# note, hand and step kept, voice.lesson_check, and the learner-text rules); a line that fails keeps the program's.

CLEAN_IN_A_ROW = 5
STEP = 10
RULE = f"{CLEAN_IN_A_ROW} clean in a row, then {STEP} faster next session"
NOT_YET = f"not yet {CLEAN_IN_A_ROW} clean in a row: the same tempo again next session"
LADDER_DEFAULT = (60, 70, 80)
LADDER_MIN, LADDER_MAX = 40, 160              # a start tempo read from the take stays within these clicks a minute
WEEK_DAY_MINUTES = 15
WEEK_LINE_WORDS = 45
SYSTEM_WEEK = "[private: Museverse teaching text, not in this repository]"
SCHEMA_WEEK = {"type": "object", "properties": {"lines": {"type": "array", "items": {"type": "object", "properties": {
    "id": {"type": "string"}, "text": {"type": "string"}}, "required": ["id", "text"]}}}, "required": ["lines"]}


def ladder_for(lesson, drill=None, beat_q=1.0):
    """(the tempo ladder, clicks a minute, and the click's unit in quarters): the piece's drill block, else one note a
    click a quarter below the take's own pace (lesson.pace), else from the player's own steady tempo (the lesson's ghost
    spq) on the piece's beat, else LADDER_DEFAULT on the quarter."""
    d = drill if isinstance(drill, dict) else {}
    if d.get("startClicksPerMin"):
        lad = [int(x) for x in d.get("ladder") or []] or [int(d["startClicksPerMin"]) + STEP * i for i in range(3)]
        return lad, float(d.get("clickUnitQ") or beat_q or 1.0)
    pc_ = (lesson or {}).get("pace") if isinstance((lesson or {}).get("pace"), dict) else None
    if pc_ and isinstance(pc_.get("clicksPerMin"), (int, float)) and pc_["clicksPerMin"] > 0:
        # one note a click (v0.8: "100 -> 110", one note per click), a quarter below the take's own pace, rounded down to 10
        start = int(min(LADDER_MAX, max(LADDER_MIN, (0.75 * pc_["clicksPerMin"]) // STEP * STEP)))
        return [start, start + STEP, start + 2 * STEP], float(pc_.get("unitQ") or beat_q or 1.0)
    spqs = sorted(float(p["ghost"]["spq"]) for p in (lesson or {}).get("parts") or []
                  if isinstance(p.get("ghost"), dict) and isinstance(p["ghost"].get("spq"), (int, float)) and p["ghost"]["spq"] > 0)
    if spqs:
        own = 60.0 / (spqs[len(spqs) // 2] * (beat_q or 1.0))
        start = int(min(120, max(40, (0.75 * own) // STEP * STEP)))
        return [start, start + STEP, start + 2 * STEP], float(beat_q or 1.0)
    return list(LADDER_DEFAULT), float(beat_q or 1.0)


def _work(lesson):
    """The lesson's parts with something to practise (its exercise or drill), numbered as the timeline numbers them."""
    out = []
    for p in (lesson or {}).get("parts") or []:
        pr = p.get("practice")
        if p.get("kind") == "next" or not isinstance(pr, dict) or not isinstance(p.get("i"), int):
            continue
        bars = [int(b) for b in (pr.get("bars") or p.get("bars") or ([p["bar"]] if p.get("bar") is not None else []))]
        out.append(dict(n=p["i"] + 1, exerciseId=pr.get("id"), say=(pr.get("say") or "").strip(), bars=sorted(set(bars)),
                        title=p.get("title"), findingId=p.get("findingId"), target=(p.get("teach") or {}).get("target")))
    return out


def _bars_words(bars):
    import exercises as EX
    w = EX.bars_label(bars)
    return w[:1].upper() + w[1:] if w else ""


def finding_bars(f):
    """A finding's written bars, sorted, each once : a reported octave run's, a score finding's own
    bars when its score has bar numbers (not where the same music comes back), else []."""
    if not isinstance(f, dict):
        return []
    if V.is_octave_run(f):
        return V.bar_numbers(f)
    if not f.get("barNumbers"):
        return []
    return sorted({b["bar"] for b in f.get("bars") or [] if isinstance(b, dict) and isinstance(b.get("bar"), int)})


RUN_MINUTES = (3, 4, 7, 8, 9, 9)   # each day's run-throughs, days 1 to 6 (v0.8's week card: the whole passage's share
                                  # of the day grows as the exercises settle, C25); the exercises take the rest of the day


def week_days(res, lesson, plan=None, ladder=None):
    """The deterministic week (the rules above, after v0.8's week card): [{day, minutes, items [{kind, partN, exerciseId,
    bars, tempo, minutes, text, first?}]}], [] when there is nothing to practise or the plan is "none" (nothing to work on:
    no week). It practises the lesson's fixes only (1 to 3, numbered as on the score; the re-take checks only them, and
    nothing dormant reaches the learner, PP5 and PP8): days 1-2 each exercise in two visits, days 3-6 a first try, the
    exercises in turns and the whole passage, day 7 film it again. Every day is WEEK_DAY_MINUTES. Every item's bars are a
    sorted list of distinct WRITTEN bars (amendment 3), the run-throughs' too: every bar they span. A take whose lesson
    has no fix but whose plan has blocks (an older result) practises those, as before."""
    if (plan or {}).get("none"):
        return []
    lad = list(ladder or LADDER_DEFAULT)
    work = _work(lesson)
    blocks = [b for b in (plan or {}).get("blocks") or [] if isinstance(b, dict)] if not work else []
    if not work and not blocks:
        return []
    worked = sorted({b for w in work for b in w["bars"]})
    piece = (lesson or {}).get("piece") or {}
    played = [b for b in (piece.get("fromBar"), piece.get("toBar")) if isinstance(b, int)]
    stretch = list(range(played[0], played[1] + 1)) if len(played) == 2 and played[1] >= played[0] else worked
    run_bars = list(range(worked[0], worked[-1] + 1)) if worked else []      # a run-through plays every bar between
    if run_bars and run_bars[0] == 1 and 0 in stretch:
        run_bars.insert(0, 0)              # bar 1's phrase starts on the pickup the take played: never "Bars 1 to 7" without it
    whole = list(range(stretch[0], stretch[-1] + 1)) if stretch else []
    span = lambda bs: _bars_words(bs) if bs else "The passage"      # noqa: E731
    low = lambda t: t[:1].lower() + t[1:]                             # noqa: E731
    by_id = {f["id"]: f for f in V.said_findings(res) if f.get("id")}

    def share(total, k):
        """total minutes over k items, whole minutes, the first ones a minute more when it does not divide."""
        return [total // k + (1 if j < total % k else 0) for j in range(k)] if k else []

    def ex(w, day, t, minutes):
        how = ("[private: Museverse teaching text, not in this repository]"
               + (" In two visits." if day <= 2 else ""))
        return dict(kind="exercise", partN=w["n"], exerciseId=w["exerciseId"], bars=list(w["bars"]), tempo=t, minutes=minutes, text=how)

    def blk(b, minutes=None):
        return dict(kind="exercise", partN=None, exerciseId=b.get("exerciseId"), findingId=b.get("findingId"),
                    bars=finding_bars(by_id.get(b.get("findingId"))), tempo=None, minutes=int(minutes or b.get("minutes") or 2),
                    text=(b.get("exercise") or "").strip())
    units = work or blocks
    days = []
    # day 1: each exercise in two visits at the ladder's first tempo; the bars the lesson worked on, three times
    run1 = RUN_MINUTES[0] if run_bars else 0
    mins = share(WEEK_DAY_MINUTES - run1, len(units))
    items = [ex(w, 1, lad[0], m) for w, m in zip(work, mins)] if work else [blk(b, m) for b, m in zip(blocks, mins)]
    if run_bars:
        items.append(dict(kind="run-through", partN=None, exerciseId=None, bars=list(run_bars), tempo=lad[0], minutes=run1,
                          text="[private: Museverse teaching text, not in this repository]"))
    days.append(dict(day=1, items=items))
    # day 2: the next tempo when day 1 ended clean, the same when not; the whole stretch, twice
    t2 = lad[min(1, len(lad) - 1)]
    run2 = RUN_MINUTES[1] if whole else 0
    mins = share(WEEK_DAY_MINUTES - run2, len(units))
    items = [dict(ex(w, 2, t2, m), text=("[private: Museverse teaching text, not in this repository]"))
             for w, m in zip(work, mins)] if work else [blk(b, m) for b, m in zip(blocks, mins)]
    if whole:
        items.append(dict(kind="run-through", partN=None, exerciseId=None, bars=list(whole), tempo=lad[0], minutes=run2,
                          text="[private: Museverse teaching text, not in this repository]"))
    days.append(dict(day=2, items=items))
    # days 3-6: a first try, the turns, a run-through at the slowest exercise's tempo (days 5-6 a count-in, then no click)
    for d in range(3, 7):
        t = lad[min(d - 1, len(lad) - 1)]
        click_off = d >= 5
        run = RUN_MINUTES[d - 1] if whole else 0
        items = []
        if whole:
            items.append(dict(kind="run-through", partN=None, exerciseId=None, bars=list(whole), tempo=None, minutes=2, first=True,
                              text="[private: Museverse teaching text, not in this repository]"))
        names = [w["exerciseId"] for w in work] + [b.get("exerciseId") for b in blocks]
        if names:
            items.append(dict(kind="turns", partN=None, exerciseId=None, members=[w["n"] for w in work], bars=list(worked), tempo=t,
                              minutes=WEEK_DAY_MINUTES - run,
                              text=("[private: Museverse teaching text, not in this repository]") if len(names) > 1 else
                                   ("[private: Museverse teaching text, not in this repository]")))
        if whole:
            items.append(dict(kind="run-through", partN=None, exerciseId=None, bars=list(whole), tempo=None, minutes=run - 2,
                              text=("[private: Museverse teaching text, not in this repository]" if click_off
                                    else "[private: Museverse teaching text, not in this repository]")))
        days.append(dict(day=d, items=items))
    # day 7: film it again, the same bars the same way (the first full take counts), after one warm-up pass of each
    fa = film_again(work, whole or worked, lad)
    days.append(dict(day=7, items=[dict(kind="retake", partN=None, exerciseId=None, bars=list(whole or worked), tempo=lad[0],
                                        minutes=WEEK_DAY_MINUTES, text=" ".join(fa["conditions"]))]))
    for d in days:
        d["minutes"] = sum(int(it.get("minutes") or 0) for it in d["items"])
    return days


def film_again(work, bars, lad):
    """Day 7's re-take and its conditions (v0.8's "On day 7, film it again." and the conditions phase 3b settled with
    the course's rule): a warm-up pass of each exercise with no holds, a count-in at the first tempo and then the click off (a
    beginner cannot tell which tempo is their best clean one), the same camera and the same bars as this take, and the
    first full take counts, so the two takes can be compared bar by bar. {day, say, bars, countIn, conditions}."""
    ns = [w["n"] for w in work]
    warm = (f"Warm up with exercise {ns[0]} once, with no holds." if len(ns) == 1 else
            f"Warm up with exercises {', '.join(str(n) for n in ns[:-1])} and {ns[-1]} once each, with no holds.") if ns else \
        "Warm up with the passage once, slowly."
    where = _bars_words(bars) if bars else "The same passage"
    conds = [warm, f"A count-in at {lad[0]}, then the click off.",
             f"Film it the same way as this take, with the same glasses or phone: {where[:1].lower() + where[1:]}.",
             "The first full take counts."]
    return dict(day=7, say=FILM_AGAIN, bars=list(bars or []), countIn=lad[0], conditions=conds)


FILM_AGAIN = "On day 7, film it again."


def week_say(lesson, days):
    """The week's two spoken lines, from the same schedule as its days (PP4, v0.8's v15 and v16): "15 minutes a day. Each
    day, play more of the whole opening." and "On day 7, film it again."; [] with no week."""
    if not days:
        return []
    piece = (lesson or {}).get("piece") or {}
    opening = isinstance(piece.get("fromBar"), int) and piece["fromBar"] <= 1
    return [f"{WEEK_DAY_MINUTES} minutes a day. Each day, play more of the whole {'opening' if opening else 'passage'}.", FILM_AGAIN]


def _week_lines(days):
    return [(f"d{d['day']}.i{k}", it["text"]) for d in days for k, it in enumerate(d["items"]) if it.get("text")]


def week_words(res, days, b):
    """Muse Wonder's words for the week's items (the module notes above), in place: (who wrote them, or None, the note).
    A reply is read line by line: a line that is not words is refused ("not words") and the rest still count, and a
    reply that cannot be read at all is that model's failure (the next model, then ours); the days themselves are never
    touched but for a line that passed."""
    lines = _week_lines(days)
    note = dict(offered=len(lines), used=0, rejected=[])
    if not lines:
        return None, note
    packet = dict(rule=RULE, notYet=NOT_YET, lines=[dict(id=i, line=t) for i, t in lines])
    end = time.monotonic() + V.purpose_timeout("plan")
    with V.purpose("plan"):
        for m in V.purpose_models("plan", b):
            left = end - time.monotonic()
            if left < 1.0:
                note["error"] = "no time left"
                break
            mark = V.call_mark()
            try:
                out, _dt = V._chat(SYSTEM_WEEK, packet, SCHEMA_WEEK, timeout=left, backend=dict(b, model=m))
                passed, rejected = _week_reply(days, out)
            except Exception as e:                # a refused key or model, the network, bad JSON, an unreadable reply: the next model, then ours
                note["error"] = V._scrub(f"{type(e).__name__}: {e}")[:200]
                if isinstance(e, (V.ContributorReply, V.MetaKeyRefused)):
                    break
                continue
            note["rejected"].extend(rejected)
            if passed:
                for it, t in passed:
                    it["text"], it["words"] = t, "model"
                V.mark_used(mark)
                note.update(used=len(passed), model=m)
                note.pop("error", None)
                return m, note
    return None, note


def _week_reply(days, out):
    """One model's reply to week_words, checked and nothing written: ([(item, its line)] that passed, [the refused, with
    why])."""
    by = V._reply_lines(out, "text")
    passed, rejected = [], []
    for d in days:
        for k, it in enumerate(d["items"]):
            lid = f"d{d['day']}.i{k}"
            if lid not in by or not it.get("text") or it.get("words") == "model":
                continue
            if not isinstance(by[lid], str):
                rejected.append(dict(id=lid, why=["not words"]))
                continue
            t = V.clean(by[lid])
            bad = V.lesson_check(it["text"], t, max_words=max(WEEK_LINE_WORDS, len(it["text"].split()) + 10))
            if bad:
                rejected.append(dict(id=lid, why=bad))
                continue
            passed.append((it, t))
    return passed, rejected


def week(res, lesson, plan=None, model=True, drill=None, beat_q=1.0):
    """result.plan's week (the page's interface): {rule, notYet, ladder, clickUnitQ, days, weekSource, weekBy}; days []
    when there is nothing to practise. model: whether a hosted model may word it (the same consent as the session's
    plan); never raises (a week that cannot be planned is no week, never a lost lesson)."""
    try:
        lad, unit = ladder_for(lesson, drill, beat_q)
        days = week_days(res, lesson, plan, lad)
    except Exception as e:                        # a week is an extra: the session plan and the lesson stand without it
        return dict(rule=RULE, notYet=NOT_YET, ladder=list(LADDER_DEFAULT), days=[], weekSource="fixed", weekBy=None,
                    weekNote=dict(error=f"{type(e).__name__}: {e}"[:200]))
    work = _work(lesson)
    out = dict(rule=RULE, notYet=NOT_YET, ladder=lad, clickUnitQ=unit, days=days, weekSource="fixed", weekBy=None,
               say=week_say(lesson, days),
               filmAgain=film_again(work, (days[-1]["items"][0]["bars"] if days else []), lad) if days else None,
               # the re-take's targets: one per fix, relative to the learner's own take (PP2), never in seconds
               targets=[dict(n=w["n"], text=w["target"]) for w in work if w.get("target")] if days else [])
    try:
        b = V._backend(res) if model and days and (os.environ.get("TEACHER_PLAN") or "").strip().lower() != "fixed" else None
        if b and b.get("hosted"):
            m, note = week_words(res, days, b)
            if m:
                out.update(weekSource=source_of(m), weekBy=V.author(m))
            out["weekNote"] = note
    except Exception as e:                        # the wording failed: the program's own days stand, as planned
        out["weekNote"] = dict(error=V._scrub(f"{type(e).__name__}: {e}")[:200])
    return out


@V.on_clip
def make(res, adult=None, model=True):
    """The practice plan for this take (the module docstring): a model's when one may see the take and its plan passes
    validate(), else the deterministic one; no plan (none) when there is nothing to work on. model=False (an upload
    whose agreement does not name the plan: consent_names_plan) gives the deterministic one whatever the settings."""
    out = _make(res, adult, model)
    if isinstance(res.get("lesson"), dict):      # a result whose lesson is already built (server.py's plan on first view)
        import exercises as EX
        piece = (res["lesson"].get("piece") or {}).get("id")
        _score, ped = EX.piece_files(piece) if piece else (None, None)
        out.update(week(res, res["lesson"], out, model=model, drill=(ped or {}).get("drill")))
    return out


def _make(res, adult=None, model=True):
    if unplanned(res):
        return none_plan(res)
    off = not model or (os.environ.get("TEACHER_PLAN") or "").strip().lower() == "fixed"
    b = None if off else V._backend(res, adult)
    if b and b.get("hosted"):
        got, notes = hosted_plan(res, b, adult)
        if got:
            if len(notes) > 1:
                got["note"] = notes[:-1]
            return got
        return fixed_plan(res, note=notes)
    return fixed_plan(res)
