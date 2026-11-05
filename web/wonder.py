"""Muse Wonder judges the take's lesson (the Meta model judges the performance, with the
teacher's know-how passed to it, not the program's fixed order).

lesson.py measures and offers; Muse Wonder decides; the program checks:
  1. lesson.build finds every part it could teach (the candidates: the take's findings, the slips repeated, measured
     or put right) and the evidence for each, and passes them here (judge_fn(res) is its judge);
  2. Muse Wonder gets teacher_knowhow.md (the know-how, as the team edits it) and the evidence, and answers with
     what to teach and in what order, why each part comes when it does, one exercise for each from the options the
     program offered for that part (our exercise library and the piece's pedagogy: exercises.options_for),
     or for a part with none one drill from DRILLS, what it sets aside and why, and a short verdict on the take;
  3. validate() holds it to the evidence and to a piano teacher's priorities (lesson.TIERS: structure, then habits,
     then what breaks the line, then one-offs, then a slip put right): only offered ids, at most lesson.MAX_PARTS parts,
     never a part of a lower tier taught while one of a higher tier is left out, as many parts as there is room for
     (a slip put right is the only thing it may leave out), and every line it
     wrote says nothing the evidence does not (voice.facts_check: no number, note, finger or step that is not in that
     part's own lines, no hand but its own, no banned, medical or comparing word; the verdict names no hand and no
     quality nothing measured). A choice that fails is not used and the program's own order stands; a line that
     fails is only dropped.
What Muse Wonder can never do here: add a part, hear a note, or teach a one-off from the sound alone (lesson.py does
not offer one: the pro-null rule). It runs under the conversation's own gates (voice._backend: the hosted route only
when hosted_allowed() lets this take go there, never for a take with a fingering read) and only for an upload whose
player agreed to text that names Muse Wonder (practice_plan.consent_names_plan), on Meta's Model API
(voice.purpose_models("judge"): TEACHER_MODEL_JUDGE, default muse-wonder-1.0, then the route's Muse Spark, so a judge
that does not answer, or whose choice fails validate(), is asked of the next before the program's order stands; every
call is in result.modelCalls). TEACHER_JUDGE=fixed keeps the program's order whatever is set.
"""
import hashlib
import json
import os
import re
import time

import voice as V

HERE = os.path.dirname(os.path.abspath(__file__))
KNOWHOW = os.path.join(HERE, "teacher_knowhow.md")
TIMEOUT_S = 60.0
WHY_WORDS = 28
VERDICT_WORDS = 40
SET_ASIDE_WORDS = 24
STRONG = ("repeated", "measured", "clear", "finding")     # what must be taught while there is room
# the drills' words, spoken after the player's turn: Muse Wonder chooses one by id (teacher_knowhow.md says when), for a
# part with no exercise options (exercises.options_for: a piece core has no score for, a technique finding). No tempo
# ratio (the 2026-11-02 call: no numbers for the learner, so not "two thirds of your speed"), and no naming the notes
# aloud: "name-it" is gone, and a reply naming it is refused.
DRILLS = {
    "slow-loop": "[private: Museverse teaching text, not in this repository]",
    "hand-alone": "[private: Museverse teaching text, not in this repository]",
    "run-up": "[private: Museverse teaching text, not in this repository]",
    "target-first": "[private: Museverse teaching text, not in this repository]",
    "look-ahead": "[private: Museverse teaching text, not in this repository]",
}
# qualities nothing here measures (teacher_knowhow.md, "What cannot be judged"): never in the verdict
UNMEASURED = re.compile(r"\b(dynamic\w*|tone|tonal|express\w*|phrasing|pedal\w*|musical\w*|feeling|emotion\w*|touch|"
                          r"loud\w*|soft\w*|legato|staccato|posture|wrists?|curv\w*|relax\w*|tempo|rhythm\w*|timing|steady|"
                          r"rush\w*|drag\w*|fluent\w*|flow\w*|beautiful\w*|lovely)\b", re.I)


def knowhow():
    with open(KNOWHOW, encoding="utf-8") as f:
        return f.read()


def system():
    return knowhow() + "[private: Museverse teaching text, not in this repository]" + str(MAX_PARTS()) + "[private: Museverse teaching text, not in this repository]"


def MAX_PARTS():
    import lesson as LS
    return LS.MAX_PARTS


def strength(p):
    """How sure a candidate part is, in teacher_knowhow.md's words. A reported octave run is a "finding": the analysis
    confirmed it and its rule decided it matters to the piece (lane L1's octave_runs); a stop, a slow bar, a tied note
    struck again and an early entry are measured against the score and the reference ("finding"), and a habit when they
    came at the same place more than once ("repeated")."""
    if p.get("kind") in ("stop", "slow-bar", "tie", "early"):
        return "repeated" if (p.get("occurrences") or 0) >= 2 and p.get("kind") != "slow-bar" else "finding"
    if p.get("kind") in ("finding", "octave-run"):
        return "finding"
    if p.get("exact"):
        return "measured"
    if (p.get("occurrences") or 0) >= 2:
        return "repeated"
    if p.get("putRight"):
        return "put right"
    if p.get("clean"):
        return "clear"
    return "once"


def facts(p):
    """Everything a candidate's own lines say: what a line Muse Wonder writes about it may repeat."""
    lines = [p.get("title") or ""] + list(p.get("intro") or []) + list(p.get("watch") or []) + [p.get("tryIt") or ""]
    n = p.get("occurrences") or 0
    if n >= 2:                                    # how many times it happened, as a teacher says it ("twice")
        lines.append({2: "twice two", 3: "three times", 4: "four times"}.get(n, ""))
    return " ".join(x for x in lines if isinstance(x, str))


def evidence(cands, opening, hands, piece, stats, short, has_next):
    """The packet Muse Wonder judges (no take id, no name, no video: only what was measured)."""
    import lesson as LS
    hs = {}
    for h in ("L", "R"):
        s = ((hands or {}).get("summary") or {}).get(h) or {}
        hs[{"L": "left hand", "R": "right hand"}[h]] = dict(state=s.get("state"), barsGood=s.get("good"), barsToFix=s.get("fix"),
                                                            barsUnsure=s.get("unsure"))
    # musical terms only: the take by its bars, never its length or its count of notes
    return dict(
        piece=piece, take=dict(short=bool(short)),
        alreadySaid=list(opening),
        hands=hs if hands else None,
        parts=[dict(id=p["cid"], evidence=strength(p), priority=LS.tier_of(p), kind=KIND_WORDS.get(p.get("teachKind") or p.get("kind"), p.get("kind")),
                    title=p.get("title"), hand={"L": "left hand", "R": "right hand"}.get(p.get("hand")), bar=p.get("bar"),
                    bars=list(p.get("bars") or []), times=p.get("occurrences") or 1,
                    lines=[x for x in (p.get("intro") or []) if x],
                    **({"exercises": exercise_evidence(p)} if p.get("options") else {}))
               for p in cands if LS.tier_of(p) is not None],
        nextBarsAvailable=bool(has_next))


# a part's kind as the know-how names it (teacher_knowhow.md, "How a good teacher chooses")
KIND_WORDS = {"wrong": "a wrong note", "slip": "a wrong note", "chord": "a wrong note in a chord", "missed": "a note not heard",
              "corrected": "a wrong key put right", "stop": "a stop", "slow-bar": "a slow bar (more than one stop in it)",
              "octave-run": "a passage in another octave", "tie": "a tied note struck again", "early": "a note that came in early",
              "finding": "a technique finding"}


def exercise_evidence(p):
    """A part's exercise options as Muse Wonder sees them (exercises.options_for): the id it may choose, what the player
    does, the line the player hears, and why the rule offers it. No windows, tempo or steps: those are the program's."""
    return [dict(id=o["id"], does=o.get("does"), line=o.get("say"), why=o.get("why")) for o in p.get("options") or []]


def schema(cands):
    """The reply's shape, with this take's own part ids as the only ones it may name (no ids, no parts: a take with
    nothing to teach still gets a verdict), and, when any part has exercise options, an exerciseId from the ids offered
    ("none" for a part offered none; validate() holds each to its own part's). cands: the candidates (or their ids)."""
    cands = list(cands or [])
    ids = [c if isinstance(c, str) else c["cid"] for c in cands]
    offered = list(dict.fromkeys(o["id"] for c in cands if isinstance(c, dict) for o in c.get("options") or []))
    idt = {"type": "string", "enum": ids} if ids else {"type": "string"}
    item = {"id": idt, "why": {"type": "string"}, "drill": {"type": "string", "enum": list(DRILLS)}}
    req = ["id", "why", "drill"]
    if offered:
        item["exerciseId"] = {"type": "string", "enum": offered + ["none"]}
        req.append("exerciseId")
    return {"type": "object", "properties": {
        "teach": {"type": "array", "maxItems": len(ids), "items": {"type": "object", "properties": item, "required": req}},
        "setAside": {"type": "array", "maxItems": len(ids), "items": {"type": "object", "properties": {
            "id": idt, "why": {"type": "string"}}, "required": ["id", "why"]}},
        "verdict": {"type": "string"}},
        "required": ["teach", "setAside", "verdict"]}


def validate(cands, out, opening):
    """(the pick to use, or None; the problems). The pick: {teach: [{id, why|None, drill, exercise|None}], setAside:
    [{id, why|None}], verdict|None, dropped: [what was dropped and why]}. exercise: the part's chosen exercise id, one of
    its own options (an id it was not offered becomes its first option, said in dropped); None for a part with none,
    which practises its drill."""
    by = {p["cid"]: p for p in cands}
    teach = out.get("teach") if isinstance(out.get("teach"), list) else None
    aside = out.get("setAside") if isinstance(out.get("setAside"), list) else []
    if teach is None:
        return None, ["no teach list"]
    ids = [x.get("id") for x in teach if isinstance(x, dict)]
    probs = []
    if len(ids) != len(teach) or any(i not in by for i in ids):
        probs.append("a part that was not offered")
    if len(set(ids)) != len(ids):
        probs.append("a part twice")
    if len(ids) > MAX_PARTS():
        probs.append("more parts than a lesson has")
    # a piano teacher's priorities (lesson.TIERS): every part the teacher would teach while there is room, and never a
    # lower priority taught over a higher one left out
    import lesson as LS
    tiers = {p["cid"]: LS.tier_of(p) for p in cands}
    fixes = [c for c, t in tiers.items() if t is not None and t <= 4]
    taught = [i for i in ids if i in by]
    if sum(1 for i in taught if (tiers.get(i) or 9) <= 4) < min(MAX_PARTS(), len(fixes)):
        probs.append("left out a part that must be taught while there is room")
    left = [tiers[c] for c in tiers if tiers[c] is not None and c not in taught]
    if left and any((tiers.get(i) or 9) > min(left) for i in taught):
        probs.append("taught a part of a lower priority over one of a higher priority")
    if any(tiers.get(i) is None or strength(by[i]) not in STRONG + ("put right", "once", "habit") for i in taught):
        probs.append("a part that is not sure enough to teach")
    if any(x.get("drill") not in DRILLS for x in teach if isinstance(x, dict)):
        probs.append("a drill that is not in the list")
    if probs:
        return None, probs
    dropped = []
    pick = dict(teach=[], setAside=[], verdict=None, dropped=dropped)
    for x in teach:
        p = by[x["id"]]
        why = V.clean(x.get("why")) if isinstance(x.get("why"), str) else ""
        bad = V.facts_check(facts(p), why, WHY_WORDS, hands=_hand_ok(p)) if why else ["empty"]
        if why and any(_same(why, y) for y in (p.get("intro") or []) + (p.get("watch") or [])):
            bad.append("repeats what the part already says")
        if bad:
            dropped.append(dict(id=x["id"], line="why", why=bad))
            why = None
        offered = [o["id"] for o in p.get("options") or []]
        ex = x.get("exerciseId")
        if offered and ex not in offered:
            # not one this part was offered (or none given): its first option, the rule's best fit
            dropped.append(dict(id=x["id"], line="exerciseId", why=[f"not offered for this part: {str(ex)[:40]}"]))
            ex = offered[0]
        pick["teach"].append(dict(id=x["id"], why=why, drill=x["drill"], exercise=ex if offered else None))
    taught = {x["id"] for x in pick["teach"]}
    for x in aside:
        if not isinstance(x, dict) or x.get("id") not in by or x["id"] in taught:
            continue
        why = V.clean(x.get("why")) if isinstance(x.get("why"), str) else ""
        bad = V.facts_check(facts(by[x["id"]]), why, SET_ASIDE_WORDS, hands=_hand_ok(by[x["id"]])) if why else ["empty"]
        if bad:
            dropped.append(dict(id=x["id"], line="setAside", why=bad))
            why = None
        pick["setAside"].append(dict(id=x["id"], why=why))
    # a part neither taught nor set aside is left for later, as the program would leave it (a lesson has MAX_PARTS)
    v = V.clean(out.get("verdict")) if isinstance(out.get("verdict"), str) else ""
    if v:
        # what it may say: the opening, every part's lines, and how many parts it chose ("two spots")
        n = ["", "one", "two", "three", "four", "five"][min(len(pick["teach"]), 5)]
        everything = " ".join(list(opening) + [facts(p) for p in cands] + [n])
        bad = V.facts_check(everything, v, VERDICT_WORDS, hands=set())
        m = UNMEASURED.search(v)
        if m:
            bad.append(f"something nothing measured: {m.group(0)}")
        if any(_same(v, x) for x in opening):
            bad.append("repeats what the lesson already says")
        if bad:
            dropped.append(dict(line="verdict", why=bad))
        else:
            pick["verdict"] = v
    return pick, []


def _same(a, b):
    """Whether line a mostly says line b again (three quarters of b's words in a): a reason that only repeats what
    was heard is no reason."""
    wa = set(re.findall(r"[a-z0-9']+", a.lower()))
    wb = [w for w in re.findall(r"[a-z0-9']+", b.lower()) if len(w) > 2]
    return bool(wb) and sum(w in wa for w in wb) >= 0.75 * len(wb)


def _hand_ok(p):
    return {"left"} if p.get("hand") == "L" else {"right"} if p.get("hand") == "R" else set()


def wonder_backend(res):
    """The hosted route this take may go to, on Meta's API, with the judge's first model (voice.purpose_models("judge"):
    Muse Wonder unless TEACHER_MODEL_JUDGE names another), or None (the module notes)."""
    if (os.environ.get("TEACHER_JUDGE") or "").strip().lower() == "fixed":
        return None
    b = V._backend(res)
    if not b or not b.get("hosted") or b.get("route") != "meta":
        return None
    models = V.purpose_models("judge", b)
    return dict(b, model=models[0], models=models) if models else None


def judge_fn(res, model=True):
    """lesson.build's judge for this take, or None when Muse Wonder may not judge it. The judge asks the judge's models in
    turn (voice.purpose_models: Muse Wonder, then Muse Spark) within voice.purpose_timeout("judge"), the next when one
    does not answer or its choice fails validate(), and records what happened in its .note (the model whose choice
    stood, seconds, problems, dropped lines, error, and every try)."""
    b = wonder_backend(res) if model else None
    if not b:
        return None
    tid = V._target_id(res)
    extra = dict(safety_identifier=hashlib.sha256(tid.encode()).hexdigest()[:32]) if tid else None
    models = b["models"]

    def judge(cands, ev, opening):
        judge.note = dict(model=b["model"], by=V.author(b["model"]), offered=len(cands), tries=[])
        msgs = [{"role": "developer", "content": system()}, {"role": "user", "content": json.dumps(ev, ensure_ascii=False)}]
        t0 = time.monotonic()
        end = t0 + V.purpose_timeout("judge")
        with V.purpose("judge"):
            for m in models:
                left = end - time.monotonic()
                if left < 1.0:
                    judge.note["error"] = "no time left"
                    break
                mark = V.call_mark()
                try:
                    r = V._turn(b, msgs, schema(cands), left, extra, model=m, max_tokens=4000, reasoning="low")
                    out = V._reply_json(r["content"])
                except Exception as e:            # network, timeout, a refused key or model, bad JSON: the next model
                    err = V._scrub(f"{type(e).__name__}: {e}")[:300]
                    judge.note.update(error=err, seconds=round(time.monotonic() - t0, 2))
                    judge.note["tries"].append(dict(model=m, error=err))
                    if isinstance(e, (V.ContributorReply, V.MetaKeyRefused)):
                        break                     # never asked again; a refused key refuses the next model too
                    continue
                pick, probs = validate(cands, out, opening)
                judge.note.update(seconds=round(time.monotonic() - t0, 2), usage=r.get("usage") or {}, answeredBy=r.get("model"),
                                  model=m, by=V.author(m))
                if probs:
                    judge.note["rejected"] = probs
                    judge.note["tries"].append(dict(model=m, rejected=probs))
                    continue
                judge.note.pop("error", None)
                judge.note.pop("rejected", None)
                judge.note["tries"].append(dict(model=m, ok=True))
                judge.note["dropped"] = pick["dropped"]
                V.mark_used(mark)
                return pick
        return None

    judge.note = dict(model=b["model"], by=V.author(b["model"]), offered=0)
    return judge
