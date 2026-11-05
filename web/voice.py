"""The voice teacher for one take, an uploaded video or a Quest demo: the spoken opening, the advice
for each finding (what I saw, why it matters, how to practise, how to check yourself, when it is
fine), the praise for each strength, and the conversation about the take, all grounded in the
analysis' result.

    note = word(res)                                   # fills res["findings"], res["strengths"], res["summary"]
    reply = chat(res, history, question)               # {"answer", "source", "model", "findingIds"} (+ "lookups", "moments", "author")
    reply = ask(res, question)                         # chat() with no history
    st = probe_meta_key()                              # once, at start-up: a MODEL_API_KEY Meta refuses routes as if unset

The conversation through a hosted route (Meta's API, OpenRouter, or the open-weights host) is Muse Spark (Muse Spark Open
on the open-weights route) with lookups (agent_chat): read-only
tools over the result (teacher_tools.py: the take, a finding, a bar of the score, the notes between two times, a
phrase, the exercise pool, a moment to play), at most MAX_TOOL_ROUNDS rounds within agent_timeout(). Its answer must
pass validate_answer() with that turn's evidence: every time, bar, note, count and measured number it says must be in
what its lookups returned or in the take's context (evidence_problems), and every other rule here still holds. Any
failure (a timeout, an error, a lookup gone wrong, a refused answer) gives the fixed answer. The findings stay decided
by measurement: a lookup reports what was measured, played and compared, never a new finding. The practice plan
(practice_plan.py: Muse Wonder, then Muse Spark, then a deterministic plan) goes through the same gates (_backend).

The advice is advice.json (researched, with its sources; every spoken field passes check()). Two
score items, wrong_notes and missed_notes, are about the notes rather than technique and live in
SCORE below.

Which model does what ("which model for what" below): every step has a purpose (judge, plan, word,
lesson-lines, chat, tip), and on Meta's API each asks Muse Wonder (muse-wonder-1.0, TEACHER_MODEL_<PURPOSE>) first, then
the route's Muse Spark, then the program's fixed words; every call, whoever makes it, is recorded as result.modelCalls
has it (provider, model, purpose, ms, tokens, cost at meta_api.TOKEN_USD's price, ok, used). Every model line also
passes the learner-text rules (learner_problems: no percentage, tempo ratio, score or naming aloud; "the pickup").

Who may word it (settings read at call time):
  hosted Muse Spark  MODEL_API_KEY, at META_API_BASE (https://api.meta.ai/v1 or a loopback test
                     server, as in meta_api.py), model MUSE_HOSTED_MODEL (default muse-spark-1.3).
                     Only for a take whose result says policy.hostedMuse, and:
                       - an upload (policy.dataOrigin "upload"): the server sets hostedMuse only
                         when the player confirmed 18+ and agreed to Muse at upload;
                       - a Quest recording (a demo): Meta's Developer Data Use Policy 4.11 bars
                         sending Quest Device User Data to Meta (11A: data calculated about a user's
                         hands), so only with MUSE_QUEST_DATA_OK=1 (after Meta's written OK) and a
                         caller who confirmed the person asking is 18+ (adult=True; Terms 10.1).
  Muse Spark via     the same model through OpenRouter (openrouter_api.py): OPENROUTER_API_KEY,
  OpenRouter         model OPENROUTER_MODEL (default meta/muse-spark-1.3), every request pinned to
                     Meta as the only provider. OpenRouter then Meta is still Meta, so it is gated
                     at least as hosted Muse is, on its own consent: policy.openrouterMuse instead of
                     policy.hostedMuse (an upload's player agreed to OpenRouter and Meta at upload,
                     and confirmed 18+; a Quest take only with MUSE_QUEST_DATA_OK=1, adult=True and,
                     on top, MUSE_QUEST_OPENROUTER_OK=1: Meta's written OK to its own API need not
                     cover OpenRouter, a third party, seeing Quest data on the way, so that takes
                     an OK that names OpenRouter).
                     meta/muse-glimmer-30b (OPENROUTER_ALLOW_GLIMMER=1) runs at DeepInfra or Together:
                     uploads only, never a Quest take.
  Muse Spark Open    Meta's open weights at an inference partner or our own server (open_api.py:
  (open weights)     OPEN_WEIGHTS_HOST baseten | fireworks | modal | openrouter | custom, OPEN_WEIGHTS_MODEL a
                     Muse Spark Open or Muse Glimmer id). A third party that is not Meta sees the take there,
                     so it has its own consent: policy.openWeightsMuse (an upload's player confirmed 18+ and
                     agreed at upload to that host by name; job.json openWeightsAtUpload). Uploads only: a
                     Quest take never goes this way, whatever flag is set. It answers with lookups, words and
                     plans like the hosted routes (Muse Wonder is not open weights, so Muse Spark Open plans
                     too), and the page says "Answered by Muse Spark Open (open weights, served by <host>)".
  Muse Glimmer       MUSE_BASE_URL (our own server, open weights, never a meta.ai host), model
                     MUSE_MODEL (default muse-glimmer), MUSE_LOCAL_KEY if it needs one. Nothing
                     goes to Meta, so it may word anything, demos included.
  fixed wording      everything else, and any reply that fails the checks.
Meta's Model API only (meta_only()): every model call goes to Meta's Model API with
MODEL_API_KEY, and the other routes above stay in the code but are never set up: OpenRouter, the open-weights hosts
and Glimmer count as unset, whatever their settings say. TEACHER_META_ONLY=0 lifts it, for the tests of those routes
only: no deployment sets it.
One hosted route at a time (hosted_route()), by TEACHER_MUSE:
  off         no model at all (not Glimmer either);
  meta        hosted Muse at Meta's API only (MODEL_API_KEY), never OpenRouter;
  openrouter  Muse Spark via OpenRouter only (OPENROUTER_API_KEY), never Meta's API directly;
  open        Muse Spark Open at OPEN_WEIGHTS_HOST only, never Meta's API nor OpenRouter's Meta-served
              Muse Spark (with OPEN_WEIGHTS_HOST=openrouter it is OpenRouter, but only its open-weights
              providers, open_api.py);
  on / unset  Meta's API when MODEL_API_KEY is set (with META_API_BASE fine and a Standard model), as
              before; else OpenRouter when OPENROUTER_API_KEY is set and well formed; else the open-weights
              route when OPEN_WEIGHTS_HOST is set and works. Meta first: one company fewer holds the take.
              So with OPEN_WEIGHTS_HOST=openrouter, "on" picks OpenRouter's Meta-served Muse Spark (the same
              key): TEACHER_MUSE=open is how to use Muse Spark Open there. A MODEL_API_KEY that Meta refuses (401 or 403, learnt once:
              probe_meta_key() at server start-up, or the first request Meta refuses, which is then
              tried again through OpenRouter when the take allows that route) counts as unset from then
              on, and /api/health says so (metaKey).
  anything else (a typo, "0", "false") counts as off here, so it never picks a route by accident;
              server.py refuses to start with it.
Glimmer stays available beside either route. A Contributor model id (Meta may train on what it is sent,
and it bars personal data) is never called, and a reply that says it came from one is not used.
Questions about pain, about what the take cannot judge, and about a take too short to judge get
the fixed answers and never reach a model. The browser speaks the lines (Meta has no
text-to-speech yet).

Fingering (DESIGN-v2 2.3, 3) follows the take's fingering stage (result.fingering.stage, fingering_stage()):
  none    "Is my fingering ok?" gets the fixed "I can't judge which finger played each note", with the
          reason, and for a library piece the fingering the lesson shows for a bar (fingering_answer)
  shown   the fixed FINGER_SHOWN: the replay shows the fingers read, fingering is not judged yet (on a
          professional's take FINGER_SUREST, and a hand whose fingers are not on the replay is named:
          finger_shown_words), plus the lesson's bar as at none
  tip     the fingering findings (FINGER_ITEMS, report.py's fingering half), worded as what the fingers
          seemed to do ("From what I could see, ...") with the replay moment to
          check, or the fixed "I didn't see a fingering habit to change in the notes I could read";
          never "your fingering is fine" unless a fingering strength says so (validate_answer)
  spoken  as tip, without the hedge (measured)
The fingering block itself is in no prompt, the fingering findings keep their fixed wording (no
model rewords them: a fingering question is answered in the fixed, hedged words, and validate_answer
refuses a model's line about a rough fingering finding without "from what I could see"), and a take
with any fingering finding or strength never goes to the hosted API, whatever its policy says
(_backend): it is data calculated about the player's hands (DDUP 11A). Under the hosted API the
limits' fingering line is the generic one, with no stage or reason read from the block
(context(hosted=True)), and a fixed fingering answer said earlier in the conversation goes as the generic
FINGER_GENERIC (hosted_turns). The reasons are said in their spoken words (SPOKEN_REASON), the first only.

Times said are the player's own video's: a long upload is analysed in a window (video.prepare), whose
times count from the window's start, and result.media.clipStartS is where that start is in the
upload. clock() adds it to every moment said ("around 2:22"); a length ("1:00 of your playing") stays
as it is. The entry points (word, chat, ask, context, validate_answer, _fixed_answer, fixed_summary)
read it from the take they are given (on_clip); a demo has none and says its own times.
"""
import contextlib
import contextvars
import functools
import hashlib
import json
import logging
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
log = logging.getLogger("teacher.voice")   # what happened and why, never a key, a take or a question
sys.path.insert(0, os.path.join(HERE, "..", "live"))
import muse as _muse  # noqa: E402  (server.py reads _muse.HOSTED: the base URL the live teacher uses)

with open(os.path.join(HERE, "advice.json"), encoding="utf-8") as _f:
    ADVICE = json.load(_f)

HAND = {"L": "left", "R": "right", None: None}
# an upload whose hands could not be placed is judged in two parts split at middle C, and names no hand for them
# (analysis.unname_pitch_hands): a finding or strength there has part "lower" or "upper" and hand None
PART_WORDS = {"lower": "below middle C", "upper": "from middle C up"}
BANNED = re.compile(r"\b(wrong|bad|terrible|incorrect|pain|painful|injur\w*|tension|tense|tight\w*|stiff\w*|locked|small hands?|camera|sensor|track\w*|AI|algorithm)\b", re.I)
# measurements in words ("fifty milliseconds", "twice as much"): the packet gives no amounts. "one"
# is left out (it is "one sound", "this one"), and "half speed" is a practice step, not a measurement
NUMBER_WORDS = re.compile(r"\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|"
                          r"seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|"
                          r"twice|thrice|half(?![- ](speed|tempo|pace))|percent|per cent|milli\w*|seconds|ms)\b", re.I)
OTHERS = re.compile(r"\b(professional\w*|experts?|concert pianists?|beginners?|everyone else|(other|most) (players|pianists|people|students|learners)|"
                    r"(an?|the) average (player|pianist|student))\b", re.I)
SAY_ANYWAY = re.compile(r"\b(your |the )?two hands\b", re.I)    # "your two hands" is not a measurement
# a conversation answer never diagnoses: pain questions get the fixed stop-and-rest answer instead; nor gives a body
# part's effort as a cause ("your forearm may be working too hard"), which nothing measured
MEDICAL = re.compile(r"\b(diagnos\w*|tendin\w*|tendons?|strain\w*|sprain\w*|damag\w*|hurt\w*|medic\w*|doctors?|physio\w*|therap\w*|"
                     r"disorders?|dystonia|carpal|syndromes?|inflam\w*|arthrit\w*|symptoms?|nerves?|risks?|clinic\w*|"
                     r"fatigu\w*|exhaust\w*|overwork\w*|overus\w*|work(?:s|ing|ed)? too hard)\b", re.I)

# wrong_notes, missed_notes and extra_notes: found against a score (the player's own MIDI file or a library
# piece: scorealign.py), so about the notes, not technique (advice.json has none). Same fields and
# placeholders as advice.json, where {when} is the place: "in bar 12, the second time" when the score has
# bar numbers (when_phrase), else "around 0:12". Two wordings, because the two sources differ: a Quest
# take's notes come from the piano itself, so what_we_saw says what was played; an upload's come from the
# sound through the transcriber, which mishears and misses notes on its own, so the "heard" wording says
# so, and its findings must first clear the transcriber's error (pipeline.REF_MIN). A finding about one
# hand names it (what_we_saw_hand). Wrong notes are the team's first priority, so these rank first.
SCORE = {
    "wrong_notes": dict(
        title="[private: Museverse teaching text, not in this repository]",
        what_we_saw="[private: Museverse teaching text, not in this repository]",
        what_we_saw_hand="[private: Museverse teaching text, not in this repository]",
        what_we_saw_heard="[private: Museverse teaching text, not in this repository]",
        what_we_saw_heard_hand="[private: Museverse teaching text, not in this repository]",
        why_it_matters="[private: Museverse teaching text, not in this repository]",
        why_heard="[private: Museverse teaching text, not in this repository]",
        how_to_practise=["[private: Museverse teaching text, not in this repository]",
                         "[private: Museverse teaching text, not in this repository]",
                         "[private: Museverse teaching text, not in this repository]"],
        check_yourself="[private: Museverse teaching text, not in this repository]",
        fine_when="[private: Museverse teaching text, not in this repository]",
        fine_when_heard="[private: Museverse teaching text, not in this repository]",
        praise="[private: Museverse teaching text, not in this repository]"),
    "missed_notes": dict(          # the transcriber also misses quiet notes, so on an upload: not heard, not "missing"
        title="[private: Museverse teaching text, not in this repository]",        # never "left out": check() would read it as the left hand
        title_heard="[private: Museverse teaching text, not in this repository]",
        what_we_saw="[private: Museverse teaching text, not in this repository]",
        what_we_saw_hand="[private: Museverse teaching text, not in this repository]",
        what_we_saw_heard="[private: Museverse teaching text, not in this repository]",
        what_we_saw_heard_hand="[private: Museverse teaching text, not in this repository]",
        why_it_matters="[private: Museverse teaching text, not in this repository]",
        why_heard="[private: Museverse teaching text, not in this repository]",
        how_to_practise=["[private: Museverse teaching text, not in this repository]",
                         "[private: Museverse teaching text, not in this repository]",
                         "[private: Museverse teaching text, not in this repository]"],
        check_yourself="[private: Museverse teaching text, not in this repository]",
        fine_when="[private: Museverse teaching text, not in this repository]",
        fine_when_heard="[private: Museverse teaching text, not in this repository]"),
    "extra_notes": dict(           # exact MIDI only: on an upload an added note is the transcriber's as often as the player's
        title="Notes not in the score",
        what_we_saw="[private: Museverse teaching text, not in this repository]",
        what_we_saw_hand="[private: Museverse teaching text, not in this repository]",
        what_we_saw_heard="[private: Museverse teaching text, not in this repository]",
        what_we_saw_heard_hand="[private: Museverse teaching text, not in this repository]",
        why_it_matters="[private: Museverse teaching text, not in this repository]",
        why_heard="[private: Museverse teaching text, not in this repository]",
        how_to_practise=["[private: Museverse teaching text, not in this repository]",
                         "[private: Museverse teaching text, not in this repository]",
                         "[private: Museverse teaching text, not in this repository]"],
        check_yourself="[private: Museverse teaching text, not in this repository]",
        fine_when="[private: Museverse teaching text, not in this repository]",
        fine_when_heard="[private: Museverse teaching text, not in this repository]"),
    "stops": dict(                 # scorealign.flow_finding: stops inside an even run, and passages played again
        title="Stops and going back",
        what_we_saw="[private: Museverse teaching text, not in this repository]",
        what_we_saw_hand="[private: Museverse teaching text, not in this repository]",
        what_we_saw_heard="[private: Museverse teaching text, not in this repository]",
        what_we_saw_heard_hand="[private: Museverse teaching text, not in this repository]",
        why_it_matters="[private: Museverse teaching text, not in this repository]",
        why_heard="[private: Museverse teaching text, not in this repository]",
        how_to_practise=["[private: Museverse teaching text, not in this repository]",
                         "[private: Museverse teaching text, not in this repository]",
                         "[private: Museverse teaching text, not in this repository]"],
        check_yourself="[private: Museverse teaching text, not in this repository]",
        fine_when="[private: Museverse teaching text, not in this repository]"),
}
# a passage played in another octave than written, which lane L1's analysis confirmed and reported (our course's
# findings.octave_runs and its report rule): fixed words only, never a model's, since the notes matched
# the score and only their place on the keyboard did not. Same fields as SCORE; octave_finding fills them per run ("An
# octave down", "two octaves higher"), and its three exercises are the exercise library's for a run in another register
# (exercises RULES "register": the register anchor, hearing it first; then the ladder every exercise sits on), which the
# practice plan offers under these ids (OCTAVE_EXERCISES). Only a run lane L1 reported is ever said (reported, below).
OCTAVE_ITEM = "octave_run"
OCTAVE_RUN = dict(
    title="An octave up",
    what_we_saw="[private: Museverse teaching text, not in this repository]",
    why_it_matters="[private: Museverse teaching text, not in this repository]",
    how_to_practise=["[private: Museverse teaching text, not in this repository]",
                     "[private: Museverse teaching text, not in this repository]",
                     "[private: Museverse teaching text, not in this repository]"],
    check_yourself="[private: Museverse teaching text, not in this repository]",
    fine_when="[private: Museverse teaching text, not in this repository]")
OCTAVE_EXERCISES = ("register-anchor", "hear-it-first", "slow-ladder")     # how_to_practise's, in order
# set once this module words a reported octave run itself : lane L1's pipeline then puts the
# reported runs into the findings BEFORE word() and the practice plan, so the summary, the plan and the lesson agree
OCTAVE_RUN_WORDS = True
ORDINAL = {1: "the first time", 2: "the second time", 3: "the third time"}
# other names an item goes by: the live engine's chord_spread, and the Quest report's one "wrist
# height" strength (neither wrist item flagged, every phrase inside the band)
ALIAS = dict({a: k for k, it in ADVICE["items"].items() for a in it.get("also_called", [])}, wrist_height="wrist_low")
# the items about how the hand sits, which a demo may not judge for one hand (demo.handsPosture)
POSTURE = ("wrist_low", "wrist_high", "wrist_height", "roll_little", "little_lift")
# the hand-position items (wrist, roll, little finger, the hand held open) have no title here: they are never praised
# (PRAISE below), and an absolute "level with the knuckles" or "close to the keys" sits inside the hand tracking's error
STRENGTH_TITLE = {
    "late_leap": "[private: Museverse teaching text, not in this repository]", "rolled_chords": "Chords together",
    "hands_apart": "Hands together", "uneven_run": "Even runs", "uneven_touch": "Even loudness in runs",
    "wrong_notes": "Notes as written",
    "finger_same_step": "[private: Museverse teaching text, not in this repository]", "finger_no_passage": "Thumb passing under",
    "finger_differs": "The lesson's fingering", "finger_inconsistent": "[private: Museverse teaching text, not in this repository]",
}
# the fingering remarks (report.py's fingering half, fingering/rules.py), said only from stage "tip"
FINGER_ITEMS = ("finger_same_step", "finger_no_passage", "finger_differs", "finger_inconsistent")
# the remarks of the comparison with a reference recording (refcompare.py), promoted to What to work on: their words are
# the block's fixed ones (refWords), never reworded by a model, and named "the reference recording", never a person
REF_ITEMS = ("ref_stop", "ref_tempo_bar", "ref_even", "ref_pedal", "ref_contrast", "ref_voicing")
REF_NAMED = re.compile(r"\b(?:the\s+)?reference(?:\s+recording)?(?:'s)?\b", re.I)
# on a take with no comparison block "reference" alone is the player's own uploaded score ("my reference MIDI"): only
# the full name is taken for the recording there
REF_RECORDING = re.compile(r"\breference\s+recording(?:'s)?\b", re.I)
# what is never said about the reference recording (the procompare design, 5.3 and 6 rule 5): a model of how to play
# ("like", "copy", "should sound", "closer to", "shape it as"), a verdict on people or playing, a rightness, a size or a
# grade. Within 40 characters of "reference" in a sentence; a sentence that is one of the block's fixed lines is exempt
REF_FORBID = re.compile(r"\b(like|copy|copying|imitat\w*|should sound|closer to|as good as|better than|worse than|"
                        r"phrase it as|shape it as|shap\w+ (?:it|this|that|the \w+) as)\b|\bmatch(?:es|ing)? (?:the|its)\b|"
                        r"\b(?:is|was|sounds?) (?:right|correct)\b|\bcorrect(?:ly)?\b|\d+\s*%|\b(?:percent|per cent|grade[sd]?|rating|"
                        r"points|out of (?:ten|a hundred))\b|\b(?:slower|faster|louder|softer|quieter) than\b|"
                        # a model to follow, said any other way ("the way it does", "aim for its pace", "mirror it")
                        r"\bthe way\b|\bfollow\w*\b|\baim(?:s|ing)? (?:for|at)\b|\bmodel\b|\bmirror\w*\b|\bemulat\w*\b|"
                        r"\bsound(?:s|ing)? (?:like|as)\b|"
                        # taste said as fact: tone, style, phrasing, beauty are never compared
                        r"\bmusical\w*|\bexpressiv\w*|\bbeautiful\w*|\btone\b|\bsinging\b|\bphras\w*|\bstyl\w*|\belegan\w*|"
                        # the speed said as a size or as blame
                        r"\b(?:much|far|a lot) (?:slower|faster|more slowly|more quickly)\b|"
                        r"\bspeed (?:it )?up\b|\bgo faster\b|\bplay faster\b|\bpick up the (?:pace|tempo|speed)\b|\bup to speed\b|"
                        r"\bcatch up\b", re.I)
FINGER_WORDS_DEFAULT = dict(fingers="the same finger", finger="the last finger", move="moved on", passage="a passage", instead="", again="")
HEDGE = HEDGE_PRAISE = "From what I could see, "
REPLAY_CHECK = " Check that moment on the replay."


def advice(item):
    """The advice entry for an item id (advice.json, or SCORE for the two score items)."""
    item = ALIAS.get(item, item)
    return ADVICE["items"].get(item) or (OCTAVE_RUN if item == OCTAVE_ITEM else SCORE[item])


# the templates as single lines, for anything that wants one: {hand} and {when} as in advice.json
LINES = {k: dict(title=a["title"], say=a["what_we_saw"], tip=a["how_to_practise"][0])
         for k, a in {**ADVICE["items"], **SCORE, OCTAVE_ITEM: OCTAVE_RUN}.items()}
# the hand-position items have no praise (the sci-fi audit, DESIGN.md 7 A7 and A8: an absolute "nicely level" or "close to
# the keys" sits inside the hand tracking's own error, and the wrist is only ever compared with the player's own playing)
PRAISE = {k: a["praise"] for k, a in ADVICE["items"].items() if a.get("praise")}
LIMITS = [
    "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]",
]
# an upload whose notes are the MIDI the player's piano recorded while they filmed (pipeline.performance_notes): this line
# takes the place of LIMITS' line on notes from the sound
LIMIT_SOUND = LIMITS[3]
LIMIT_MIDI = ("Notes come from the MIDI your piano recorded, lined up with the video by their timing: they are the keys "
              "as the piano recorded them, and the video still shows the hands.")
# ... and on notes from the sound, this takes the place of LIMITS' pedalling line (A14: a key let go under the pedal sounds on,
# and 97 % of one pianist's key releases are under it, so how long a note is held is not heard either)
LIMIT_PEDAL = LIMITS[4]
LIMIT_HELD_SOUND = "How long notes are held, and the pedal, are not heard."
# what an input cannot judge (analysis.take_inputs "off": the item and why), in the lesson's limits and in a fixed answer
# about it, in plain words (A14; the audit's numbers are in analysis.py's module notes). A Quest take adds "tracking" for
# every hand-position item (demos/report.py: the hand tracking under its TRACKING_MIN_HZ); "stamps" is worded by
# input_limits from STAMP_WORDS
OFF_LINES = {
    ("uneven_touch", "sound"): "[private: Museverse teaching text, not in this repository]",
    ("uneven_run", "sound"): ("[private: Museverse teaching text, not in this repository]"),
    ("held_open", "phone"): ("[private: Museverse teaching text, not in this repository]"),
    ("uneven_touch", "flat_velocity"): "[private: Museverse teaching text, not in this repository]",
}
OFF_LINES[("late_leap", "phone")] = OFF_LINES[("held_open", "phone")]
OFF_LINES[("held_open", "quest")] = ("How far your hand stretches is not judged: the hand tracking places each fingertip only to within "
                                     "a centimetre or two, about the difference between a hand held open and one that has closed up "
                                     "a little.")
TRACKING_LINE = ("The hand tracking updated too slowly in this take to judge how the hands sit and move, so none of that is "
                 "judged.")
# the same lines as a fixed answer says them aloud: the spoken rules (check()) allow no "tracking" and no amounts in
# words (as SPOKEN_REASON does for the fingering); test_voice.py checks every input_limits line, as said, passes check()
SPOKEN_LINE = {
    OFF_LINES[("held_open", "quest")]: ("How far your hand stretches is not judged: I can place each fingertip only roughly, by "
                                        "about as much as a hand held open differs from one that has closed up a little."),
    TRACKING_LINE: "Your hands were followed too seldom in this take to judge how they sit and move, so none of that is judged.",
}
# the items timed on the notes' onsets, as the stamps line names them (analysis ITEMS timing)
STAMP_WORDS = {"rolled_chords": "chords landing together", "hands_apart": "the hands landing together",
               "uneven_run": "how evenly runs are spaced"}


def notes_source(res):
    """Where an upload's notes came from: "midi" (the piano's own MIDI, lined up with the video: result.notesFrom) or
    "sound" (the transcriber; results from before notesFrom say nothing, and are that). A Quest take: "piano"."""
    if _quest(res):
        return "piano"
    nf = res.get("notesFrom") if isinstance(res.get("notesFrom"), dict) else {}
    return "midi" if nf.get("source") == "midi" else "sound"


def exact_notes(res):
    """The notes are the piano's own, with no transcriber in between: a Quest take, or an upload with its piano's MIDI."""
    return notes_source(res) in ("piano", "midi")


def notes_limits(base, res):
    """The limits with the notes' line for where they came from (LIMIT_MIDI in place of LIMIT_SOUND on MIDI notes), and on
    notes from the sound the pedalling line saying that note lengths are not heard either (LIMIT_HELD_SOUND)."""
    src = notes_source(res)
    return [LIMIT_MIDI if x == LIMIT_SOUND and src == "midi" else LIMIT_HELD_SOUND if x == LIMIT_PEDAL and src == "sound" else x
            for x in base]


def take_inputs(res):
    """A result's inputs (analysis.take_inputs, kept in result.analysis.inputs; a Quest take's report adds "tracking"), or
    for a result from before they were recorded, what its notes' source rules out (an upload's sound: the runs and their
    loudness; any upload: the stretch and the jumps of a phone video)."""
    an = res.get("analysis") if isinstance(res.get("analysis"), dict) else {}
    inp = res.get("inputs") if isinstance(res.get("inputs"), dict) else an.get("inputs")
    if isinstance(inp, dict) and isinstance(inp.get("off"), list):
        return inp
    src = notes_source(res)
    off = [] if src == "piano" else [dict(item="held_open", why="phone"), dict(item="late_leap", why="phone")]
    if src == "sound":
        off = [dict(item="uneven_run", why="sound"), dict(item="uneven_touch", why="sound")] + off
    return dict(notes=src, off=off)


def off_items(res):
    """{item: why} of what this take's inputs could not judge (take_inputs)."""
    return {o.get("item"): o.get("why") for o in take_inputs(res).get("off") or [] if isinstance(o, dict)}


def input_limits(res, items=None):
    """The limits' lines for what this take's inputs could not judge, one per reason (OFF_LINES, TRACKING_LINE, the
    stamps line), in plain words; items: only the lines about these items (a fixed answer about one topic)."""
    off = off_items(res)
    if items is not None:
        off = {k: v for k, v in off.items() if k in set(items)}
    out = []
    for (item, why), line in OFF_LINES.items():
        if off.get(item) == why and line not in out:
            out.append(line)
    stamped = [STAMP_WORDS[k] for k in STAMP_WORDS if off.get(k) == "stamps"]
    if stamped:
        what = stamped[0] if len(stamped) == 1 else ", ".join(stamped[:-1]) + " or " + stamped[-1]
        who = "The recording" if notes_source(res) == "piano" else "Your piano's MIDI"
        out.append(f"{who} marks each note's time too coarsely to judge {what}, so {'that is' if len(stamped) == 1 else 'those are'} not judged.")
    if "tracking" in off.values():
        out.append(TRACKING_LINE)
    return out


# for a recording made in the Museverse Quest app (the demos): the headset saw both hands in 3D and
# the piano sent the notes, so wrist height, hand roll and the little finger are judged there
QUEST_LIMITS = [
    "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]",
]
TOO_SHORT = "That was too little playing to judge your technique: a few phrases or more of playing gives enough."
# a short take that was judged all the same (analysis coverage pools an item over its phrases): said after what was
# judged, so the player knows how much of the take it rests on
SHORT_JUDGED = "This was a short take, so I judged only part of it: a few phrases or more of playing lets me tell a habit from a one-off."
# a take with nothing judged that still had enough playing (enough_playing: ENOUGH_PLAYING phrases and seconds, as app.js
# has them) is not "too little playing": nothing its input can judge came up often enough in it. From the sound without the
# hands only chords played together are judged, and only chords heard clearly enough: the first minute of a pianist's Debussy
# studio recording, 14 phrases of quiet playing, judged nothing and was told it was too little playing
ENOUGH_PLAYING = dict(phrases=4, seconds=30.0)
NOTHING_JUDGED = "This take had enough playing, but nothing I can judge came up often enough in it to say anything about your technique."
LIMIT_NOTHING_JUDGED = ("The technique is not judged in this take: there was enough playing, but nothing that can be judged came "
                        "up often enough in it.")
# TOO_SHORT on a short re-take whose bars were compared with the first take (server.py): what the take was filmed for
RETAKE_SHORT = ("This short re-take is compared with your first take bar by bar, below; judging the technique needs a few "
                "phrases or more of playing.")
COUNT = {1: "One thing is", 2: "Two things are", 3: "Three things are", 4: "Four things are"}
NO_NOTES = "I heard no piano notes in this take, so there was nothing I could judge."
NO_NOTES_TRY = "Try again with the piano clearly audible, with a few phrases or more of playing."


def mmss(s):
    s = max(0, int(round(s)))
    return f"{s // 60}:{s % 60:02d}"


# where the analysed window starts in the player's video (seconds), for the take being worded now
_CLIP = contextvars.ContextVar("clip_start_s", default=0.0)


def clip_start(res):
    """result.media.clipStartS (or the analysis' own clipStartS, as the pipeline sets it before
    wording): where the analysed window starts in the upload, 0 for a take analysed whole."""
    v = ((res.get("media") or {}).get("clipStartS") if isinstance(res.get("media"), dict) else None) or res.get("clipStartS")
    try:
        v = float(v or 0.0)
    except (TypeError, ValueError):
        return 0.0
    return v if v > 0 and v == v and v != float("inf") else 0.0


def on_clip(fn):
    """fn(res, ...) with clock() on res's window, and place() on res's bars and notes, for the length of the call."""
    @functools.wraps(fn)
    def wrapped(res, *a, **k):
        tok = _CLIP.set(clip_start(res) if isinstance(res, dict) else 0.0)
        tok2 = _PLACE.set(take_place(res) if isinstance(res, dict) else None)
        try:
            return fn(res, *a, **k)
        finally:
            _PLACE.reset(tok2)
            _CLIP.reset(tok)
    return wrapped


# ---------------------------------------------------------------- places in musical terms
# the lesson's rule (the design's rules 5 and 10): every line the learner reads or hears is in
# musical terms, as a piano teacher says it: bars, notes, keys, fingers, beats; never seconds and never a clock ("a long
# stop in bar 7", never "a 1.3 s stop"; never "I listened to 0:28 of your playing"). A moment of the take is said as the
# written bar it was in (the aligner's barStats: which bar the take was playing when), and on a take with no score in it
# as where it came in the take ("near the start", "in the middle", "near the end"). clock() stays for the Details view,
# the judges and the conversation's own lookups, never for a line the lesson says.
_PLACE = contextvars.ContextVar("take_place", default=None)


def take_place(res):
    """What place() reads for one take: {"bars": [(fromS, toS, written bar)] in take order (the located piece's barStats,
    when its score has bar numbers), "span": (first note, last note) on the take's clock, "notes": the take's notes}."""
    rr = res.get("reference") if isinstance(res.get("reference"), dict) else {}
    pieces = [p for p in rr.get("pieces") or [] if isinstance(p, dict) and p.get("located")]
    named = bool(pieces) and all(p.get("barNumbers", True) is not False for p in pieces)
    ids = {p.get("id") for p in pieces}
    bars = []
    if named and rr.get("level") == "note":
        for b in rr.get("barStats") or []:
            if isinstance(b, dict) and b.get("piece") in ids | {None} and isinstance(b.get("fromS"), (int, float)) \
                    and isinstance(b.get("toS"), (int, float)) and isinstance(b.get("bar"), int):
                bars.append((float(b["fromS"]), float(b["toS"]), int(b["bar"])))
    bars.sort()
    notes = [n for n in res.get("notes") or [] if isinstance(n, (list, tuple)) and len(n) >= 3]
    span = (float(notes[0][0]), max(float(n[1]) for n in notes)) if notes else None
    ph = [p for p in res.get("phrases") or [] if isinstance(p, dict) and isinstance(p.get("s"), (int, float))
          and isinstance(p.get("e"), (int, float))]
    if span is None and ph:                        # a result with its phrases and no notes: the phrases' span
        span = (min(float(p["s"]) for p in ph), max(float(p["e"]) for p in ph))
    return dict(bars=bars, span=span, notes=notes)


def bars_at(t0, t1=None, pl=None):
    """The written bars the take was in from t0 to t1 (one moment when t1 is None), in order, each once; [] when the
    take has no bars placed there."""
    pl = pl if pl is not None else (_PLACE.get() or {})
    t1 = t0 if t1 is None else t1
    out = []
    for a, b, m in pl.get("bars") or []:
        hit = (a - 1e-6 <= t0 < b) if t1 <= t0 else (a < t1 and b > t0)
        if hit and m not in out:
            out.append(m)
    return out


def place(t0, t1=None, pl=None):
    """A moment (t0), or a stretch (t0 to t1), of the take in musical terms: "in bar 12", "in bars 3 to 5", "in the
    pickup"; with no bars placed there, where it came in the take: "near the start", "in the middle", "near the end";
    with nothing to place it by at all (no notes, no phrases), "there" (the replay shows where)."""
    import exercises as EX
    pl = pl if pl is not None else (_PLACE.get() or {})
    bs = bars_at(t0, t1, pl)
    if bs:
        return "in " + EX.bars_label(bs)
    span = pl.get("span")
    if not span or span[1] <= span[0]:
        return "there"                             # nothing to place it by: the replay shows where
    x = (float(t0) - span[0]) / (span[1] - span[0])
    return "near the start" if x < 0.34 else "in the middle" if x < 0.67 else "near the end"


def note_before(t, pl=None):
    """The note the take played at t (the last one before a stop), as said ("C", "D sharp"): the highest key struck within
    STRUCK_S of t, which is the melody's in a chord; None when nothing was struck there."""
    pl = pl if pl is not None else (_PLACE.get() or {})
    at = [n for n in pl.get("notes") or [] if abs(float(n[0]) - float(t)) <= STRUCK_S]
    if not at:
        return None
    return CLASS_WORDS[int(max(at, key=lambda n: int(n[2]))[2]) % 12]


STRUCK_S = 0.03            # notes this close to a stop's start were struck together with its last note


def clock(s):
    """A moment of the take as the player's own video shows it (mmss on the upload's clock)."""
    return mmss(s + _CLIP.get())


def take_window(res):
    """The part of a long upload that was analysed, on the upload's clock: the analysis' own
    res["window"] (the pipeline sets it before wording) or the result's job.video.window; None for a
    take analysed whole, a demo or a Quest take."""
    w = res.get("window")
    if not isinstance(w, dict):
        job = res.get("job") if isinstance(res.get("job"), dict) else {}
        w = (job.get("video") or {}).get("window") if isinstance(job.get("video"), dict) else None
    ok = isinstance(w, dict) and all(isinstance(w.get(k), (int, float)) and not isinstance(w.get(k), bool) for k in ("startS", "endS", "fromS"))
    return w if ok else None


def window_times(w):
    """The window's times as said: its start, its end and the whole video's length."""
    return [mmss(w["startS"]), mmss(w["endS"]), mmss(w["fromS"])] if w else []


def window_opening(w, notes=None, where=""):
    """The summary's first sentence for a take analysed in a window: that a part was picked, in musical terms (the
    bars it holds, `where`: "from the pickup to bar 8"), never its clock times or how many notes it had."""
    tail = f": {where}" if where else ""
    if w.get("how") == "your start":
        return "[private: Museverse teaching text, not in this repository]"
    if w.get("how") == "first, no sound" or w["fromS"] - (w["endS"] - w["startS"]) < 5:
        return "[private: Museverse teaching text, not in this repository]"
    if w.get("how") == "[private: Museverse teaching text, not in this repository]":
        return "[private: Museverse teaching text, not in this repository]"
    return "[private: Museverse teaching text, not in this repository]"


def played_span(rr, p):
    """(the lowest, the highest) written bar a take played of located piece p (a reference block's piece row), from its
    barStats rows: a take that goes back over a repeat ends on a bar it had already passed (Für Elise's bars 10 to 16 the
    second time, after bar 23), so its last bar is not how far it got. firstBar and lastBar when there are no rows;
    (None, None) without them."""
    bars = [b["bar"] for b in (rr or {}).get("barStats") or [] if isinstance(b, dict) and isinstance(b.get("bar"), int)
            and not isinstance(b.get("bar"), bool) and b.get("piece") in (None, p.get("id")) and b.get("fromS") is not None]
    if bars:
        return min(bars), max(bars)
    a, b = (p.get("firstBar") or {}).get("bar"), (p.get("lastBar") or {}).get("bar")
    return (a, b) if isinstance(a, int) and isinstance(b, int) else (None, None)


def heard_where(res):
    """The bars a take played, as the summary opens with them: "Fur Elise, from the pickup to bar 8" (played_span: the
    lowest to the highest written bar); "" with no piece placed in it."""
    import exercises as EX
    rr = res.get("reference") if isinstance(res.get("reference"), dict) else {}
    p = next((p for p in rr.get("pieces") or [] if isinstance(p, dict) and p.get("located")), None)
    if not p:
        return ""
    title = str(p.get("title") or rr.get("name") or "").split(",")[0].strip()
    a, b = played_span(rr, p)
    if p.get("barNumbers", True) is False or not isinstance(a, int) or not isinstance(b, int):
        return title
    span = EX.bar_label(a) if a == b else f"from {EX.bar_label(a)} to {EX.bar_label(b)}"
    return f"{title}, {span}" if title else span


def when(f):
    a, b = f["fromS"], f["toS"]
    return clock(a) if b - a < 4 else f"{clock(a)} to {clock(b)}"


def when_phrase(f):
    """A finding's place as advice.json's {when}, in musical terms (place(): "in bar 12", "in bars 3 to 5"). A score finding
    names its bars when the score has bar numbers (bars_phrase: "in bar 12, the second time"), else where
    the biggest cluster of its notes starts; so does a fingering finding against the lesson's fingering. A reported
    octave run says its written bars ("in bars 5 to 7"; bar 0 is "the pickup")."""
    if is_octave_run(f):
        import exercises as EX
        where = EX.bars_label(written_bars(f)) if f.get("barNumbers", True) else ""
        return f"in {where}" if where else (place(f["fromS"], f.get("toS")) if isinstance(f.get("fromS"), (int, float)) else "")
    if f["item"] in SCORE or f["item"] in REF_ITEMS or (f["item"] == "finger_differs" and f.get("barNumbers")):
        return bars_phrase(f) or place(f["fromS"])
    if f["toS"] - f["fromS"] < 4:
        return place(f["fromS"])
    return place(f["fromS"], f["toS"])


def bar_said(n):
    """A written bar as the player hears it: "bar 12", and bar 0 "the pickup" (exercises.bar_label)."""
    import exercises as EX
    return EX.bar_label(n)


def _upper_first(t):
    return t[:1].upper() + t[1:] if t else t


def bars_phrase(f, most=3):
    """A score finding's bars in words, "" when its score has no bar numbers: "in bar 12", "in bar 7,
    the second time", "in bars 3, 7 and 12", "in bars 3, 7, 12 and others". A bar the piece plays more
    than once (a repeat: the bar's "of") says which time, or "both times"."""
    if not f.get("barNumbers") or not f.get("bars"):
        return ""
    order, passes, of = [], {}, {}
    for b in f["bars"]:
        n = b.get("bar")
        if n is None:
            return ""
        if n not in passes:
            order.append(n)
        passes.setdefault(n, set()).add(int(b.get("pass") or 1))
        of[n] = max(of.get(n, 1), int(b.get("of") or 1))
    order.sort()

    def which(n):
        ps, k = passes[n], of[n]
        if k <= 1:
            return ""
        if len(ps) == k:
            return "both times" if k == 2 else "each time"
        if len(ps) == 1:
            return ORDINAL.get(next(iter(ps)), "one of the times")
        return "more than once"
    if 0 in order:                                 # bar 0 is the pickup, said before the numbered bars
        rest = dict(f, bars=[b for b in f["bars"] if b.get("bar") != 0])
        tail = bars_phrase(rest, most - 1) if rest["bars"] and most > 1 else ""
        return "in the pickup" + (f" and {tail[3:]}" if tail else "")
    named = order[:most]
    ws = [which(n) for n in named]
    more = " and others" if len(order) > most else ""
    if len(set(ws)) == 1:                          # one pass for all of them: said once, at the end
        nums = [str(n) for n in named]
        listed = nums[0] if len(nums) == 1 else (", ".join(nums) + more if more else ", ".join(nums[:-1]) + " and " + nums[-1])
        return f"in bar{'s' if len(order) > 1 else ''} {listed}" + (f", {ws[0]}" if ws[0] else "")
    shown = [f"{n}, {w}" if w else f"{n}" for n, w in zip(named, ws)]
    if more:
        return "in bars " + ", ".join(shown) + more
    return "in bars " + ", ".join(shown[:-1]) + " and " + shown[-1]


def also_phrase(f):
    """Where the same music comes back note for note (scorealign.same_music), said after a bar number:
    the notes cannot tell which time was played, so the bar named is the first place they match."""
    also = f.get("alsoAt") or []
    if not also or not f.get("barNumbers"):
        return ""
    bars = []
    for a in also:
        n = (a.get("firstBar") or {}).get("bar")
        if n is not None and n not in bars:
            bars.append(n)
    if not bars:
        return ""
    nz = [b for b in bars if b != 0]               # bar 0 is the pickup, said first
    body = "" if not nz else bar_said(nz[0]) if len(nz) == 1 else "bars " + ", ".join(map(str, nz[:-1])) + f" and {nz[-1]}"
    where = ("the pickup" + (" and " if body else "") if 0 in bars else "") + body
    return f" The same music also comes at {where}, so it may have been there."


# a pitch class as said ("D sharp"; sharps, as teacher_tools names pitches), and how many times
CLASS_WORDS = ("C", "C sharp", "D", "D sharp", "E", "F", "F sharp", "G", "G sharp", "A", "A sharp", "B")
TIMES_WORDS = {1: "", 2: "twice"}


def _slip_bars(f, most=3):
    """A score finding's notes played different from the score (its "slips", scorealign.slips: on exact notes, and from the
    sound its clear wrong keys only), bar
    by bar: [(the bar as said, "E instead of D sharp, twice", ...)] in bar order, at most `most` bars; [] without bar
    numbers or slips."""
    ss = [x for x in f.get("slips") or [] if isinstance(x, dict) and isinstance(x.get("bar"), int)
          and isinstance(x.get("expected"), int) and isinstance(x.get("played"), int)]
    if not ss or not f.get("barNumbers"):
        return []
    bars, order = {}, []
    for x in ss:
        key = (str(x.get("piece")), int(x.get("pass") or 1), x["bar"])
        if key not in bars:
            order.append(key)
            bars[key] = (x, [])
        n = int(x.get("times") or 1)
        times = TIMES_WORDS.get(n, f"{n} times")
        bars[key][1].append(f"{CLASS_WORDS[x['played'] % 12]} instead of {CLASS_WORDS[x['expected'] % 12]}" + (f", {times}" if times else ""))
    out = []
    for key in order[:most]:
        x, said = bars[key]
        p = int(x.get("pass") or 1)
        label = bar_said(x['bar']) + (f" ({ORDINAL.get(p, 'one of the times')})" if int(x.get("of") or 1) > 1 else "")
        out.append((label, ", and ".join(said)))
    return out


def slips_words(f, most=3):
    """The notes played different from the score, as the score comparison names them: "bar 9: E instead of D sharp,
    twice"; more bars after a semicolon ("...; bar 12: G instead of F sharp"); "" when the finding names none."""
    return "; ".join(f"{b}: {w}" for b, w in _slip_bars(f, most))


def _say_list(xs):
    xs = list(xs)
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1]


def stop_groups(f):
    """The stops finding's stops (scorealign.flow_finding's "flow", kind "stop"), grouped by place as a teacher names
    them ("No stop after the C" in bars 1 and 5, "Keep bar 7 moving"): stops after the same note going on to
    the same note, wherever the music came round, are one group; the others by the bar they start in. [{bars (written,
    in order), after (the note before the stop, as said, or None), stops [events]}], the longest group's stop first
    within it, in take order."""
    st = [dict(e) for e in f.get("flow") or [] if isinstance(e, dict) and e.get("kind", "stop") == "stop" and isinstance(e.get("t"), (int, float))]
    for e in st:
        e_from = e.get("fromBar")
        if not isinstance(e_from, int):
            here = bars_at(float(e["t"]))
            e_from = here[0] if here else e.get("bar")
        e["_from"], e["_after"] = e_from, note_before(e["t"])
        e["_to"] = note_before(e["until"]) if isinstance(e.get("until"), (int, float)) else None
    groups = []
    for e in sorted(st, key=lambda e: e["t"]):
        key = (e["_after"], e["_to"])
        g = next((g for g in groups if e["_after"] and key == g["key"] and e["_from"] not in g["bars"]), None) \
            or next((g for g in groups if e["_from"] is not None and g["bars"] == [e["_from"]] and g["key"] != key), None)
        if g is None:
            groups.append(dict(key=key, bars=[e["_from"]] if e["_from"] is not None else [], after=e["_after"], stops=[e]))
            continue
        g["stops"].append(e)
        if g["key"] != key:                    # two different stops in one bar: the bar, not a note
            g["after"] = None
        elif e["_from"] is not None and e["_from"] not in g["bars"]:
            g["bars"].append(e["_from"])
    return [dict(bars=g["bars"], after=g["after"], stops=g["stops"]) for g in groups]


def stop_place(g, named=True):
    """One stop group in words: "after the C in bars 1 and 5", "twice in bar 7", "after the E in bar 7"; with no bar
    numbers, where it came in the take."""
    import exercises as EX
    bars = [b for b in g["bars"] if isinstance(b, int)] if named else []
    where = ("in " + EX.bars_label(bars)) if bars else place(g["stops"][0]["t"])
    if g.get("after"):
        return f"after the {g['after']} {where}"
    return f"twice {where}" if len(g["stops"]) == 2 else f"{where}, more than once" if len(g["stops"]) > 2 else where


def flow_words(f):
    """What the stops finding's {when} does not say (scorealign.flow_finding's "flow"), in musical terms: where the
    longest stop was, and each passage played again: "The longest was in bar 7. After bar 17 you went back to bar 14 and
    played it again." Never how long a stop lasted (a stop is long or not; seconds are not a musical term). "" with
    none."""
    ev = [e for e in f.get("flow") or [] if isinstance(e, dict)]
    st = [e for e in ev if e.get("kind") == "stop"]
    back = [e for e in ev if e.get("kind") == "back"]
    named = bool(f.get("barNumbers"))
    out = []
    if len(st) > 1:
        long = max(st, key=lambda e: float(e.get("lostS") or 0))
        here = [long.get("fromBar")] if isinstance(long.get("fromBar"), int) else bars_at(float(long["t"]))
        where = ("in " + bar_said(here[0])) if named and here else place(float(long["t"]))
        out.append(f"The longest was {where}.")
    for e in back:
        if named and e.get("stoppedBar") is not None:
            out.append(f"After {bar_said(e['stoppedBar'])} you went back to {bar_said(e['fromBar'])} and played it again.")
        else:
            out.append(f"{_upper_first(place(e['t']))}, you went back and played a passage again.")
    return " ".join(out)


def stops_when(f):
    """The stops finding's places as its {when} says them: each group of stop_groups ("after the C in bars 1 and 5 and
    twice in bar 7"), at most three; "" when its flow has none (the bars it landed in then say it, as before)."""
    gs = stop_groups(f)
    if not gs:
        return ""
    named = bool(f.get("barNumbers"))
    ws = [stop_place(g, named) for g in gs[:3]]
    return _say_list(ws) + (" and elsewhere" if len(gs) > 3 else "")


def _score_finding(f):
    """The advice for a score finding: the Quest wording when its notes are the piano's own (confidence
    measured), the upload's "heard" wording when they come from the sound, the hand when it is one hand. On exact
    notes the notes played different are named too (slips_words): "...in bar 9: E instead of D sharp, twice." The stops
    finding names its stops and the passages played again (flow_words)."""
    a = SCORE[f["item"]]
    heard = f.get("confidence") != "measured"
    h, at = HAND.get(f.get("hand")), when_phrase(f)
    if f["item"] == "stops":                       # named by place, as a teacher does: "after the C in bars 1 and 5"
        at = stops_when(f) or at
    what = a[("what_we_saw_heard" if heard else "what_we_saw") + ("_hand" if h else "")]
    what = _fill(what, h, at)
    if f["item"] == "stops":
        fw = flow_words(f)
        what = f"{what} {fw}" if fw else what
    # from the sound, a finding carries slips only for its clear wrong keys (pipeline.judge: scorealign.clean_wrong), so
    # those are named too; the rest of what was heard different may be the transcriber's and is not
    sb = _slip_bars(f)
    if len(sb) == 1 and len({b.get("bar") for b in f.get("bars") or []}) == 1:
        what = f"{what[:-1]}: {sb[0][1]}."             # "...in bar 9: E instead of D sharp, twice."
    elif sb:
        said = slips_words(f)
        what = f"{what} {said[0].upper()}{said[1:]}."
    if f["item"] != "stops":                       # a stop is where it happened, not a note another bar could explain
        what += also_phrase(f)
    why = a["why_it_matters"] + (" " + a["why_heard"] if heard and a.get("why_heard") else "")
    practise = [_fill(p, h, at) for p in a["how_to_practise"]]
    fine = (a.get("fine_when_heard") if heard else None) or a["fine_when"]
    title = (a.get("title_heard") if heard else None) or a["title"]
    if f["item"] == "stops" and not any(isinstance(e, dict) and e.get("kind") == "back" for e in f.get("flow") or []):
        title = "Stops"                            # no passage was played again: not "Stops and going back"
    out = dict(title=title, what=what, why=why, practise=practise, check=_fill(a["check_yourself"], h, at), fine=fine,
               say=what, tip=practise[0])
    if sb:
        out["slipsSay"] = slips_words(f)
    return out


def lead_hand(f):
    """The hand that came first in a hands_apart finding, or None when neither clearly did
    (leftLeads is the share of pairs where the left hand came first; 0.5 when unknown)."""
    v = f.get("leftLeads")
    if v is None:
        return None
    return "left" if v >= 0.7 else "right" if v <= 0.3 else None


def _fill(text, hand, at, part=None):
    """advice.json's placeholders; with no hand, "your {hand}-hand chords" reads "your chords", and with a part
    (a take split at middle C) "your chords below middle C"."""
    if not hand and part in PART_WORDS:
        text = re.sub(r"\{hand\}-hand (\w+)", lambda m: f"{m.group(1)} {PART_WORDS[part]}", text)
    if not hand:
        text = re.sub(r"\{hand\}(-hand)? ?", "", text)
    return text.replace("{hand}", hand or "").replace("{when}", at)


def _hedged(f):
    """A fingering finding or strength at stage "tip": rough, so said as what the fingers seemed to do."""
    return f.get("item") in FINGER_ITEMS and f.get("confidence") != "measured"


def _lower_first(t):
    return t[:1].lower() + t[1:] if t and not t.startswith(("I ", "I'")) else t


def _finger_finding(f):
    """The advice for a fingering finding (advice.json), its placeholders filled from the finding's words (fingers in
    words, never digits); at stage "tip" the what-I-saw line says it is what the fingers seemed to do, with the
    replay moment to check."""
    a = advice(f["item"])
    h, at = HAND.get(f.get("hand")), when_phrase(f)
    words = dict(FINGER_WORDS_DEFAULT, **{k: v for k, v in (f.get("words") or {}).items() if isinstance(v, str)})

    def fill(t):
        t = _fill(t, h, at)
        for k, v in words.items():
            t = t.replace("{" + k + "}", v)
        return re.sub(r"\{\w+\}", "", t)
    what = fill(a.get("what_we_saw_both_ok") if (f.get("words") or {}).get("bothOk") and a.get("what_we_saw_both_ok") else a["what_we_saw"])
    if _hedged(f):
        what = HEDGE + _lower_first(what) + REPLAY_CHECK
    practise = [fill(p) for p in a["how_to_practise"]]
    return dict(title=a["title"], what=what, why=fill(a["why_it_matters"]), practise=practise, check=fill(a["check_yourself"]),
                fine=fill(a["fine_when"]), say=what, tip=practise[0])


# a reported octave run (OCTAVE_RUN above): the lesson teaches it as a part (lesson.octave_parts) with the register anchor
# among its exercises. A run lane L1 did NOT report was judged not to matter to the piece: it lives only in
# result.analysis.octaveRuns (the Details), and every reader of the findings here (word, fixed_finding, the summary,
# context, the fixed answers, chat, validate_answer) skips it (said_findings), so it is never words for the learner
OCTAVE_WAY = {1: "an octave up", -1: "an octave down", 2: "two octaves up", -2: "two octaves down"}


def is_octave_run(f):
    return isinstance(f, dict) and (f.get("kind") == "octave-run" or f.get("item") == OCTAVE_ITEM)


def unreported_run(f):
    """An octave run whose reported is not True: never said (the notes above)."""
    return is_octave_run(f) and f.get("reported") is not True


def said_findings(res):
    """The findings the learner may hear of: every finding but an octave run lane L1 did not report."""
    return [f for f in res.get("findings") or [] if isinstance(f, dict) and not unreported_run(f)]


def worked_findings(res):
    """The findings there is something to work on in, in the result's order: kind mistake or tip, and a reported octave
    run (kind "octave-run"), which the summary counts, the plan works on and the lesson teaches."""
    return [f for f in said_findings(res) if f.get("kind") in ("mistake", "tip") or is_octave_run(f)]


def written_bars(f):
    """An octave run's written bars, sorted and each once: lane L1 gives them as {bar, pass, piece, of} rows, a lesson
    part as numbers."""
    out = set()
    for b in f.get("bars") or []:
        n = b.get("bar") if isinstance(b, dict) else b
        if isinstance(n, int) and not isinstance(n, bool):
            out.add(n)
        elif isinstance(n, float) and n.is_integer():
            out.add(int(n))
    return sorted(out)


def octave_way(f):
    """"an octave up" (the run sounded higher than written), "an octave down", "two octaves up" ..."""
    try:
        s = int(f.get("shift") or 0)
    except (TypeError, ValueError):
        s = 0
    return OCTAVE_WAY.get(s) or ("an octave up" if s > 0 else "an octave down")


def octave_finding(f):
    """The fixed words for a reported octave run (OCTAVE_RUN): title ("An octave up"), what was heard where, why it
    matters, the practice (the register anchor, hearing it first, the ladder), the check and when it is fine. The notes
    themselves matched the score (that is what makes it an octave run), so nothing here calls them wrong."""
    a = OCTAVE_RUN
    way = octave_way(f)
    hand = HAND.get(f.get("hand"))
    where = when_phrase(f)
    who = f"your {hand} hand" if hand else "you"
    up = "higher" if way.endswith("up") else "lower"
    amount = "two octaves" if way.startswith("two") else "an octave"
    what = (f"{where[:1].upper() + where[1:]}, I heard {who} play {amount} {up} than the score has it." if where
            else f"I heard {who} play a passage {amount} {up} than the score has it.")
    practise = list(a["how_to_practise"])
    return dict(title=way[:1].upper() + way[1:], what=what, why=a["why_it_matters"], practise=practise,
                check=a["check_yourself"], fine=a["fine_when"], say=what, tip=practise[0])


# the detection lane's findings a teacher teaches as their own kind (lesson.detect_parts): a tied note struck again and a
# note that came in early. Fixed words only, in musical terms; any other item this module has no words for is said in
# the finding's own words (never a crash: word() runs on every upload)
TIE_ITEMS = ("tied_restrike", "tie_restruck", "tied_restruck", "restruck_ties", "ties", "tie", "tied_notes")
EARLY_ITEMS = ("early_entry", "early_entries", "early", "early_note")


def note_said(x):
    """A note named by the detection lane, as said: 61, "C#4", "C#", "C sharp", "Db" -> "C sharp"; None."""
    if isinstance(x, bool) or x is None:
        return None
    if isinstance(x, (int, float)):
        return CLASS_WORDS[int(x) % 12]
    m = re.match(r"^\s*([A-Ga-g])\s*(#|♯|b(?![a-z])|♭|[- ]?sharp|[- ]?flat)?", str(x))
    if not m:
        return None
    acc = (m.group(2) or "").strip(" -")
    return m.group(1).upper() + (" sharp" if acc in ("#", "♯", "sharp") else " flat" if acc in ("b", "♭", "flat") else "")


def _teacher_finding(f):
    """The fixed words for a tied note struck again or an early entry (the notes above)."""
    import exercises as EX
    bars = written_bars(f) if f.get("barNumbers", True) else []
    where = ("In " + EX.bars_label(bars)) if bars else _upper_first(place(f["fromS"])) if isinstance(f.get("fromS"), (int, float)) else "There"
    want = next((note_said(f.get(k)) for k in ("written", "note", "midi", "pitch", "expected") if note_said(f.get(k))), "note")
    if f["item"] in TIE_ITEMS:
        title, what = f"Hold the tied {want}", "[private: Museverse teaching text, not in this repository]"
        why = "[private: Museverse teaching text, not in this repository]"
        practise = ["[private: Museverse teaching text, not in this repository]"]
        check, fine = "[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"
    else:
        other = {"R": "left", "L": "right"}.get(f.get("hand") or "R")
        title, what = f"Wait for the {other} hand", "[private: Museverse teaching text, not in this repository]"
        why = "[private: Museverse teaching text, not in this repository]"
        practise = ["[private: Museverse teaching text, not in this repository]"]
        check, fine = "[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"
    return dict(title=title, what=what, why=why, practise=practise, check=check, fine=fine, say=what, tip=practise[0])


def fixed_finding(f):
    """The advice for one finding, filled in: title, what, why, practise (the exercises), check,
    fine, and say / tip for older readers (say = what, tip = the first exercise). A tip (flagged
    against the player's own playing, not past an absolute band) of an item with a "relative"
    wording (the wrists, the hand's roll) says it against the rest of the take, and leads with the
    exercise that suits a passage rather than the whole take (not the seat check). A reported octave run: octave_finding;
    one lane L1 did not report has no words at all ({}: it is never said)."""
    if is_octave_run(f):
        return octave_finding(f) if not unreported_run(f) else {}
    if f["item"] in SCORE:
        return _score_finding(f)
    if f["item"] in FINGER_ITEMS:
        return _finger_finding(f)
    if f["item"] in REF_ITEMS:                     # the comparison's own fixed words (pipeline.reference_step)
        return dict(f.get("refWords") or {})
    if f["item"] in TIE_ITEMS + EARLY_ITEMS:
        return _teacher_finding(f)
    if ALIAS.get(f["item"], f["item"]) not in ADVICE["items"] and f["item"] not in SCORE:
        # an item with no words here (a new kind from the detection lane): its own words, never a crash, and only when
        # they pass the learner-text gate (an older result's "I lost sight of your left hand around 0:17" says nothing)
        import exercises as EX
        what = str(f.get("what") or f.get("say") or "").strip()
        what = "" if EX.learner_problems(what) else what
        return dict(title=str(f.get("title") or f["item"].replace("_", " ").capitalize()), what=what, why=str(f.get("why") or ""),
                    practise=[], check="", fine="", say=what, tip="")
    a = advice(f["item"])
    h, at, pt = HAND.get(f.get("hand")), when_phrase(f), f.get("part")
    rel = (a.get("relative") if f.get("kind") == "tip" else None) or {}
    if f["item"] == "hands_apart" and f.get("question"):
        # under correctFrom the lead may be meant (a bass placed first on purpose, A16): asked, not corrected
        qa, lead = a["question"], lead_hand(f)
        what = _fill(qa["what_we_saw_" + (lead or "no_lead")], lead, at)
        # the bass first, the melody first, or a lead with no hand measured: each its own fine-when
        fine = qa.get({"right": "fine_when_right", None: "fine_when_no_lead"}.get(lead, "fine_when")) or qa["fine_when"]
        rel = dict(title=qa["title"], fine_when=fine)
    elif f["item"] == "hands_apart":               # names a hand only when the one that led was measured
        lead = lead_hand(f)
        what = _fill(a["what_we_saw"], lead, at) if lead else _fill(a.get("what_we_saw_no_lead", a["what_we_saw"]), None, at)
    else:
        what = _fill(rel.get("what_we_saw", a["what_we_saw"]), h, at, pt)
    steps = rel.get("how_to_practise") or a["how_to_practise"]     # the wrists' tip words name no absolute height
    order = rel.get("practise_order") or range(len(steps))
    practise = [_fill(steps[i], h, at, pt) for i in order]
    return dict(title=rel.get("title", a["title"]), what=what, why=_fill(a["why_it_matters"], h, at, pt), practise=practise,
                check=_fill(a["check_yourself"], h, at, pt), fine=_fill(rel.get("fine_when", a["fine_when"]), h, at, pt), say=what, tip=practise[0])


def _said(f, key):
    """A finding's field as word() fills it, else its fixed words (a result whose finding was never worded, such as a
    reported octave run added after word() ran): "" when there is none."""
    v = f.get(key)
    if v:
        return v
    try:
        return fixed_finding(f).get(key) or ([] if key == "practise" else "")
    except (KeyError, TypeError):
        return [] if key == "practise" else ""


def praised(g):
    """Whether a strength's item may be praised at all (it has praise words; the hand-position items have none)."""
    try:
        return bool(advice(g["item"]).get("praise"))
    except KeyError:
        return False


def praise(g):
    """A strength's title and praise line (a fingering strength at stage "tip" said as what the fingers seemed to do)."""
    say = _fill(advice(g["item"]).get("praise") or "", HAND.get(g.get("hand")), "", g.get("part"))
    if _hedged(g):
        say = HEDGE_PRAISE + _lower_first(say)
    return dict(title=STRENGTH_TITLE.get(g["item"]) or STRENGTH_TITLE.get(ALIAS.get(g["item"], g["item"])) or "", say=say)


def _stats(res):
    return res.get("stats") or (res.get("summary") or {}).get("stats") or {}


def _quest(res):
    """A take recorded in the Museverse Quest app (a demo): hands in 3D from the headset, notes from
    the piano. Results from before this field existed are uploads."""
    pol = res.get("policy") if isinstance(res.get("policy"), dict) else {}
    st = res.get("stage") if isinstance(res.get("stage"), dict) else {}
    return res.get("source") == "quest" or pol.get("dataOrigin") == "quest" or bool(res.get("demo")) or st.get("kind") == "hands"


def enough_playing(cov, st):
    """Whether a take whose coverage judged nothing still had enough playing to judge (ENOUGH_PLAYING): then it is not
    too short, nothing it can judge came up often enough."""
    return (cov.get("phrases") or 0) >= ENOUGH_PLAYING["phrases"] and (st.get("durationS") or 0) >= ENOUGH_PLAYING["seconds"]


def not_judged(res):
    """"no notes" when nothing was heard, "too short" when no item was measured in enough phrases
    (analysis coverage; for results without it, fewer than two phrases), "nothing judged" when none was although the
    take had enough playing (enough_playing), else None."""
    st = _stats(res)
    if "notes" in st and not st["notes"]:
        return "no notes"
    cov = res.get("coverage") or (res.get("analysis") or {}).get("coverage")
    if cov is not None:
        return ("nothing judged" if enough_playing(cov, st) else "too short") if cov.get("tooShort") else None
    return "too short" if "phrases" in st and st["phrases"] < 2 else None


def _seen_once(res):
    """An item flagged in a phrase that did not become a finding (findings need it in two), as
    (title, where in musical terms: place()); None if there is none."""
    for p in res.get("phrases") or []:
        for lab in p.get("flagged") or []:
            item = lab.split(":")[0]
            L = LINES.get(ALIAS.get(item, item))
            if L:
                return L["title"], place(p["s"])
    return None


# what an item judged, in words, for "nothing stood out in ...": (one hand, both hands)
JUDGED = {
    "rolled_chords": ("your {h}-hand chords", "your chords"),
    "hands_apart": ("[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"),
    "uneven_run": ("your {h}-hand runs", "your runs"),
    "uneven_touch": ("[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"),
    "held_open": ("[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"),
    "late_leap": ("your {h}-hand jumps", "your jumps"),
    "wrong_notes": ("[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"),
    "missed_notes": ("[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"),
    "extra_notes": ("[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"),
    "wrist_low": ("how your {h} wrist sits", "how your wrists sit"),
    "wrist_high": ("how your {h} wrist sits", "how your wrists sit"),
    "roll_little": ("[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"),
    "little_lift": ("your {h} little finger", "your little fingers"),
    "finger_same_step": ("[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"),
    "finger_no_passage": ("[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"),
    "finger_differs": ("[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"),
    "finger_inconsistent": ("[private: Museverse teaching text, not in this repository]", "[private: Museverse teaching text, not in this repository]"),
}


def score_judged(res):
    """Whether the take's notes were compared with a score note by note, over two phrases or more (what a
    score finding needs), so "the notes against the score" were judged. Never for a score made from the
    take itself (sameNotesAs: Hit the Road's set is the demo's own MIDI), which matches by construction."""
    rr = res.get("reference") if isinstance(res.get("reference"), dict) else None
    if not rr or rr.get("level") != "note":
        return False
    located = [p for p in rr.get("pieces") or [] if p.get("located")]
    if not located or any(p.get("sameNotesAs") for p in located):
        return False
    return sum(len(p.get("phrases") or []) for p in located) >= 2 or any(not p.get("phrases") for p in located)


# on notes from the sound the score comparison catches only large differences (REF_MIN: half the notes missed, a fifth
# wrong), so "nothing stood out" names it so (the sci-fi audit, section 8); said last in the list, where "and" cannot
# join it to the next item ("between your notes and the score and your chords")
SCORE_SOUND_WORDS = "large differences between your notes and the score"


def judged_words(res):
    """The judged items (analysis coverage) as a list in words, both hands of an item merged; the notes
    against the score first when they were compared note by note (on the sound last, as large differences only). Only
    items this take's inputs could judge (take_inputs; a result from before it may still list one)."""
    cov = res.get("coverage") or (res.get("analysis") or {}).get("coverage") or {}
    off = off_items(res)
    hands = {}
    for j in cov.get("judged") or []:
        if j["item"] in off:
            continue
        hands.setdefault(ALIAS.get(j["item"], j["item"]), set()).add(j.get("hand"))
    sound = notes_source(res) == "sound"
    out = ["the notes against the score"] if score_judged(res) and not sound else []
    for item, hs in hands.items():
        one, both = JUDGED.get(item, (None, None))
        if not one:
            continue
        w = both if len(hs) > 1 or None in hs else one.format(h=HAND[next(iter(hs))])
        if w not in out:                           # the two wrist items read the same
            out.append(w)
    if score_judged(res) and sound:
        out.append(SCORE_SOUND_WORDS)
    if len(out) > 4:                               # spoken: name the ends, not all of it
        return f"everything from {out[0]} to {out[-1]}"
    if len(out) > 1:
        return ", ".join(out[:-1]) + " and " + out[-1]
    return out[0] if out else ""


@on_clip
def ref_hidden(res, hosted=True):
    """Whether a route must not hear the take's comparison with a reference recording: hosted, the take has remarks of
    it, and its pianist's consent has no "hostedModels" (reference_block). Such a route gets the take without them, the
    summary too (fixed_summary(hosted=True)), and the reference is said only in the fixed words."""
    return bool(hosted) and not reference_block(res, True) and any(
        isinstance(f, dict) and f.get("item") in REF_ITEMS for f in res.get("findings") or [])


@on_clip
def fixed_summary(res, hosted=False):
    """The take's opening summary in fixed words. hosted: for a hosted model's packet or context, which leaves out the
    remarks of a comparison with a reference recording its pianist's consent does not let that route hear (ref_hidden)."""
    st = _stats(res)
    short = not_judged(res)
    if short == "no notes":
        return " ".join(p for p in (NO_NOTES, res.get("videoNote"), NO_NOTES_TRY) if p)
    # musical terms only: what was played, by its bars, never how long or how many notes
    heard = "I followed" if exact_notes(res) else "I listened to"      # the piano's own notes (a Quest take, or its MIDI)
    w = None if _quest(res) else take_window(res)
    where = heard_where(res)
    parts = [window_opening(w, where=where) if w else (f"{heard} your {where}." if where else f"{heard} your playing.")]
    if res.get("videoNote"):
        parts.append(res["videoNote"])
    hide = ref_hidden(res, hosted)
    # a reported octave run is something to work on too (worked_findings), so a take with one never says "nothing stood out"
    fs = [f for f in worked_findings(res) if not (hide and f.get("item") in REF_ITEMS)]
    once = None if fs else _seen_once(res)
    if fs:
        top = fixed_finding(fs[0])["title"].lower()
        said = fixed_finding(fs[0]).get("slipsSay")
        if said:                                   # exact notes: the bars and notes named ("bar 9: E instead of D sharp, twice")
            top = f"{top} ({said})"
        count = COUNT.get(len(fs), f"{len(fs)} things are")
        # one finding is the main one by itself: "the main one" only picks one out of several
        if len(fs) == 1 and fs[0].get("question"):  # a lead that may be meant (hands_apart under correctFrom): asked
            parts.append("[private: Museverse teaching text, not in this repository]")
        else:
            parts.append("[private: Museverse teaching text, not in this repository]" if len(fs) == 1 else "[private: Museverse teaching text, not in this repository]")
    if short == "nothing judged":
        parts.append(NOTHING_JUDGED)
        if once:
            parts.append("[private: Museverse teaching text, not in this repository]")
    elif short:
        parts.append(TOO_SHORT)
        if once:
            parts.append("[private: Museverse teaching text, not in this repository]")
    elif not fs:
        what = judged_words(res)
        parts.append("[private: Museverse teaching text, not in this repository]" if what else "[private: Museverse teaching text, not in this repository]")
        if once:
            parts.append("[private: Museverse teaching text, not in this repository]")
        cov = res.get("coverage") or (res.get("analysis") or {}).get("coverage")
        if cov and not cov.get("tooShort") and not enough_playing(cov, _stats(res)):
            parts.append(SHORT_JUDGED)
    if res.get("strengths"):
        parts.append(praise(res["strengths"][0])["say"])
    return " ".join(p for p in parts if p)


# ---------------------------------------------------------------- the models

LOOPBACK = ("127.0.0.1", "localhost", "::1")
# a named agent on every request, not Python's default "Python-urllib/3.x", which bot filters refuse (replicate_api.USER_AGENT)
USER_AGENT = "museverse-teacher/1.0 (+https://museverse.xyz)"
# the policy flag each hosted route needs: a consent to Meta's API does not cover OpenRouter, nor the other way, and
# neither covers the open-weights host (a third party that is not Meta), nor it them
POLICY_KEY = {"meta": "hostedMuse", "openrouter": "openrouterMuse", "open": "openWeightsMuse"}


def _off():
    return _mode() == "off"


def meta_only():
    """Every model call on Meta's Model API, nothing else (the module docstring): on unless TEACHER_META_ONLY=0, which
    only the tests of the routes kept in the code set."""
    return (os.environ.get("TEACHER_META_ONLY") or "1").strip() != "0"


MODES = ("off", "meta", "openrouter", "open", "on")


def _mode():
    """TEACHER_MUSE: off, meta, openrouter, open, or on (also when unset) for the automatic choice. Any other value
    is off: a typo must not send a take anywhere (server.py's start-up refuses it, saying so)."""
    m = (os.environ.get("TEACHER_MUSE") or "on").strip().lower() or "on"
    return m if m in MODES else "off"


def _contributor_id(model):
    """A Contributor tier model id: Meta may train on what it is sent and it bars personal data,
    and the players' takes and questions are theirs, so it is never called."""
    return "contributor" in str(model or "").lower()


def _hosted_base():
    """META_API_BASE, the same rule as meta_api.py: Meta's API or a loopback test server only, so a
    typo cannot send the key or a take anywhere else. None when it is neither."""
    b = os.environ.get("META_API_BASE", "https://api.meta.ai/v1").strip().rstrip("/")
    u = urllib.parse.urlsplit(b)
    ok = (u.scheme == "https" and u.hostname == "api.meta.ai") or (u.scheme == "http" and u.hostname in LOOPBACK)
    return b if ok else None


def _glimmer_base():
    """MUSE_BASE_URL when it is our own server. A meta.ai address is Meta's hosted API, and taking it
    for Glimmer would send Quest data to Meta, so it never counts as Glimmer."""
    b = (os.environ.get("MUSE_BASE_URL") or "").strip().rstrip("/")
    host = (urllib.parse.urlsplit(b).hostname or "").lower()
    return b if b and not (host == "meta.ai" or host.endswith(".meta.ai")) else None


def _hosted_model():
    # MUSE_MODEL names the live teacher's one model (live/muse.py): the hosted one unless Glimmer is set up
    return os.environ.get("MUSE_HOSTED_MODEL") or (None if _glimmer_base() else os.environ.get("MUSE_MODEL")) or "muse-spark-1.3"


def plan_models(b):
    """The models that write the practice plan on hosted backend b, best first (practice_plan.py): purpose_models("plan",
    b), so Muse Wonder (TEACHER_MODEL_PLAN, else MUSE_PLAN_MODEL on Meta's API, default muse-wonder-1.0; through OpenRouter
    OPENROUTER_PLAN_MODEL), then the conversation's own Muse Spark. Muse Glimmer through OpenRouter (uploads that agreed to
    DeepInfra or Together, not Meta) and the open-weights route (Muse Spark Open at its host) plan with themselves only.
    Never a Contributor id."""
    return purpose_models("plan", b)


# ---------------------------------------------------------------- which model for what, and every call recorded
#
# Every model step has a purpose, and each purpose its own model and time limit (2026-11-03:
# every LLM step on Muse Wonder, then measured). On Meta's API a purpose tries its own model first
# (TEACHER_MODEL_<PURPOSE>, "-" as "_": TEACHER_MODEL_LESSON_LINES; default Muse Wonder), then the route's own Muse Spark
# (TEACHER_MODEL_FALLBACK, else MUSE_HOSTED_MODEL, default muse-spark-1.3), and the caller's fixed wording when neither
# gives a reply that passes its checks: a model only ever words or chooses, so a step that falls all the way back loses
# nothing the program decided. The routes kept in the code but off under meta_only() keep the models their own consent
# names: through OpenRouter only the plan is Muse Wonder (the upload agreement says "Muse Spark, and Muse Wonder for the
# plan"), and Muse Glimmer and the open-weights host answer every purpose with themselves.
# Each purpose's seconds: TEACHER_TIMEOUT_<PURPOSE>, else the older setting that already bounded that step, else
# PURPOSES' own; the conversation keeps a short one (a player is waiting), the judge a long one (it reasons).
# The filming tip (framing_tip.py) keeps the route's Muse Spark by default: its own consent names the model that sees the
# frames ("The model is Muse Spark (Meta)": framing_tip.offer and covers), so moving it to Muse Wonder waits for the offer
# and the upload page to name Muse Wonder; its calls are recorded under "tip" all the same.
#
# Every call (_complete and _turn, whoever makes it) is recorded in this context's call log (calls(): the pipeline's
# worker thread for a job, one request's thread for a question) as result.modelCalls has it: {provider, model, purpose,
# ms, tokensIn, tokensOut, usd, ok, used}. usd is what the route reports (OpenRouter's usage.cost), else the tokens at
# meta_api.TOKEN_USD's list price, else None; ok whether a reply came back and parsed; used "model" when the step used
# what it said (at least one line, or the choice), else "fallback" (the next model's, or the program's own words, stood).
# Each record also carries "_seq", a number this process gives every call in turn: a step takes call_mark() before it
# asks and marks or reads the calls after that mark (mark_used, model_calls(start=)), never a list index, since the log
# drops its oldest records past CALLS_MAX and a long-lived worker thread would otherwise mark nothing after a few dozen
# jobs. pipeline.run_job starts each job's log with begin_calls().
WONDER = "muse-wonder-1.0"
SPARK = "muse-spark-1.3"
PURPOSES = {        # purpose: (what it is, its seconds by default, the older setting that also sets them, its model by default)
    "judge": ("what the lesson teaches, in what order, and each part's exercise (wonder.py)", 60.0, None, WONDER),
    "plan": ("the practice plan and the week's words (practice_plan.py)", 40.0, "TEACHER_PLAN_TIMEOUT", WONDER),
    "word": ("the opening summary and each finding's line (word)", 40.0, "TEACHER_MUSE_TIMEOUT", WONDER),
    "lesson-lines": ("the lesson's lines in Muse's own voice (word_lesson)", 40.0, "TEACHER_MUSE_TIMEOUT", WONDER),
    "chat": ("an answer to the player's question (chat, agent_chat)", 20.0, "TEACHER_AGENT_TIMEOUT", WONDER),
    "tip": ("the filming tip (framing_tip.py; its consent names the model)", 15.0, "TEACHER_FRAMING_TIP_TIMEOUT", SPARK),
}
CALLS_MAX = 400               # records one context keeps (a job makes a handful; a long-lived thread never grows past this)
_CALLS = contextvars.ContextVar("teacher_model_calls", default=None)
_PURPOSE = contextvars.ContextVar("teacher_model_purpose", default=None)
CALL_KEYS = ("provider", "model", "purpose", "ms", "tokensIn", "tokensOut", "usd", "ok", "used")
_SEQ = [0]                    # the last call's sequence number in this process (_record), under _SEQ_LOCK
_SEQ_LOCK = threading.Lock()


def _purpose_env(purpose, what):
    return f"TEACHER_{what}_" + purpose.upper().replace("-", "_")


def purpose_model(purpose):
    """The model a purpose asks first on Meta's API: TEACHER_MODEL_<PURPOSE>, for the plan also MUSE_PLAN_MODEL (its
    older name), else its own default (PURPOSES: Muse Wonder; the filming tip Muse Spark, as its consent names it)."""
    v = (os.environ.get(_purpose_env(purpose, "MODEL")) or "").strip()
    if not v and purpose == "plan":
        v = (os.environ.get("MUSE_PLAN_MODEL") or "").strip()
    return v or PURPOSES.get(purpose, ("", 0, None, WONDER))[3]


def purpose_models(purpose, b):
    """The models a purpose tries on backend b, in order (the notes above): on Meta's API its own model, then the route's
    Muse Spark; through OpenRouter the plan's Muse Wonder (OPENROUTER_PLAN_MODEL) then the route's model, and every other
    purpose the route's model; Glimmer and the open-weights route their own model. Never a Contributor id; [] with no
    backend."""
    if not b:
        return []
    if b.get("uploadsOnly") or not b.get("hosted") or b.get("route") == "open":
        out = [b["model"]]
    elif b.get("route") == "openrouter":
        import openrouter_api as OR
        out = [OR.plan_model(), b["model"]] if purpose == "plan" else [b["model"]]
    else:
        out = [purpose_model(purpose), (os.environ.get("TEACHER_MODEL_FALLBACK") or "").strip() or b["model"]]
    return [m for m in dict.fromkeys(out) if m and not _contributor_id(m)]


def purpose_timeout(purpose):
    """Seconds a purpose may take, every model it tries included: TEACHER_TIMEOUT_<PURPOSE>, else its older setting
    (PURPOSES), else PURPOSES' default; 1 to 180."""
    _what, default, older, _model = PURPOSES.get(purpose, ("", 40.0, None, WONDER))
    for name in (_purpose_env(purpose, "TIMEOUT"), older):
        raw = (os.environ.get(name) or "").strip() if name else ""
        if raw:
            try:
                return min(180.0, max(1.0, float(raw)))
            except ValueError:
                pass
    return default


def model_table():
    """Every purpose as it is set now, for /api/health and the submission: {purpose: {model, fallback, seconds}} on Meta's
    API (the fallback is the route's Muse Spark)."""
    fb = (os.environ.get("TEACHER_MODEL_FALLBACK") or "").strip() or _hosted_model()
    return {p: dict(model=purpose_model(p), fallback=fb, seconds=purpose_timeout(p)) for p in PURPOSES}


@contextlib.contextmanager
def purpose(name):
    """with purpose("word"): the calls made inside the block are recorded under that purpose (a call may name its own)."""
    tok = _PURPOSE.set(name)
    try:
        yield name
    finally:
        _PURPOSE.reset(tok)


def begin_calls():
    """A fresh call log for this context (the start of a job, or after one's calls were written out); returns it."""
    out = []
    _CALLS.set(out)
    return out


def calls():
    """This context's call log, the records as they are kept (each with "_at", the epoch second its call started, and
    "_seq", its sequence number)."""
    out = _CALLS.get()
    return out if out is not None else begin_calls()


def call_mark():
    """The sequence number of the last call made so far: the calls a step makes after taking it are the ones after it
    (mark_used, model_calls(start=)), whatever the log dropped from its front in between."""
    with _SEQ_LOCK:
        return _SEQ[0]


def model_calls(since=None, start=0, fresh=False):
    """The call log as result.modelCalls has it (CALL_KEYS only): the records made after mark start (call_mark(); 0, all of
    them); with since (epoch seconds) only the calls that started then or later; with fresh, none already written into a
    result (taken)."""
    return [{k: r.get(k) for k in CALL_KEYS} for r in calls()
            if r.get("_seq", 0) > start and (since is None or r.get("_at", 0) >= since) and not (fresh and r.get("_taken"))]


def taken():
    """Marks every call in the log as written into a result (word_lesson, a job's last model step), so the next job in
    this worker thread never counts it as its own."""
    for r in calls():
        r["_taken"] = True


def mark_used(start, used="model", models=None):
    """Says of the calls recorded after mark start (call_mark(); of models, when given) whether their reply was used."""
    for r in calls():
        if r.get("_seq", 0) > start and (models is None or r.get("model") in models):
            r["used"] = used


def _provider(b):
    route = b.get("route")
    if route == "open":
        return str(b.get("host") or "open")
    return route or ("meta" if b.get("hosted") else "self")


def _record(b, model, purpose_, seconds, usage, ok):
    """One call into the call log (the notes above); returns the record."""
    import meta_api as M
    u = usage if isinstance(usage, dict) else {}
    num = lambda v: v if isinstance(v, (int, float)) and not isinstance(v, bool) else None     # noqa: E731
    tin, tout = num(u.get("prompt_tokens")), num(u.get("completion_tokens"))
    usd = num(u.get("cost"))
    if usd is None:
        usd = M.token_cost(model, tin, tout)
    rec = dict(provider=_provider(b), model=model, purpose=purpose_ or _PURPOSE.get() or "other", ms=int(round(seconds * 1000)),
               tokensIn=int(tin) if tin is not None else None, tokensOut=int(tout) if tout is not None else None,
               usd=round(float(usd), 6) if usd is not None else None, ok=bool(ok), used="fallback", _at=round(time.time() - seconds, 3))
    with _SEQ_LOCK:
        _SEQ[0] += 1
        rec["_seq"] = _SEQ[0]
    log_ = calls()
    log_.append(rec)
    if len(log_) > CALLS_MAX:
        del log_[:len(log_) - CALLS_MAX]
    return rec


def job_start(res):
    """When this result's job started, in epoch seconds (its createdAt less every step's time, and half a minute's
    margin for the time between steps), or None: the call log of a worker thread that ran a job before this one is cut
    there (attach_calls), for a job that stopped before its calls were taken."""
    import datetime
    job = res.get("job") if isinstance(res.get("job"), dict) else {}
    try:
        end = datetime.datetime.fromisoformat(str(job.get("createdAt"))).timestamp()
    except (TypeError, ValueError):
        return None
    steps = ((res.get("pipeline") or {}).get("steps") or []) if isinstance(res.get("pipeline"), dict) else []
    ms = sum(float(s.get("ms") or 0) for s in steps if isinstance(s, dict))
    return end - ms / 1000.0 - 30.0


def attach_calls(res):
    """result.modelCalls: every call this context made for this result's job so far (model_calls: from job_start, none a
    result already took). The lesson's build calls it (after the plan and the judge), and word_lesson adds its own after
    and marks them all taken."""
    res["modelCalls"] = model_calls(since=job_start(res), fresh=True)
    return res["modelCalls"]


def _glimmer_model():
    return os.environ.get("MUSE_MODEL") or "muse-glimmer"


def _meta_hosted():
    """Hosted Muse Spark at Meta's API as a backend, or None when it is not set up (or its model is a Contributor one)."""
    key, base, model = os.environ.get("MODEL_API_KEY", "").strip(), _hosted_base(), _hosted_model()
    if _off() or not key or not base or _contributor_id(model):
        return None
    return dict(name="muse", base=base, model=model, key=key, hosted=True, route="meta")


def _openrouter():
    """Muse Spark through OpenRouter (pinned to Meta) as a backend, or None when it is not set up: no key or a
    malformed one, another host than OpenRouter's, a model that is not Muse Spark, or a Contributor one
    (openrouter_api.problem). The key stays in openrouter_api, read at call time."""
    import openrouter_api as OR
    if _off() or meta_only() or OR.problem():
        return None
    model = OR.model()
    glim = OR.is_glimmer(model)
    return dict(name="openrouter-glimmer" if glim else "openrouter", base=OR.base(), model=model, key=None, hosted=True,
                route="openrouter", uploadsOnly=glim)


def _open():
    """Muse Spark Open (or Muse Glimmer) at the open-weights host as a backend, or None when it is not set up
    (open_api.problem: no OPEN_WEIGHTS_HOST, a missing or malformed key, a base that is not https, a model that is not
    open weights). The key stays in open_api, read at call time. Uploads only."""
    import open_api as OW
    if _off() or meta_only() or OW.problem():
        return None
    d = OW.describe()
    return dict(name="open", base=None, model=d["model"], key=None, hosted=True, route="open", uploadsOnly=True,
                host=d["host"], hostName=d["hostName"], servedBy=d["servedBy"], baseHost=d.get("baseHost"))


# MODEL_API_KEY as Meta's API took it, by the key's hash (never the key): probe_meta_key() at start-up (401 or 403 to
# GET /models), or the first request that Meta answered 401 (_complete, _turn; a 403 there is about one model). A refused key routes as if it were unset (hosted_route), so a
# key that does not work cannot silently keep a working OpenRouter route from answering
_META_KEY = {}


def _key_id():
    k = os.environ.get("MODEL_API_KEY", "").strip()
    return hashlib.sha256(k.encode()).hexdigest()[:16] if k else None


def meta_key_status():
    """MODEL_API_KEY as Meta's API took it: "none" (not set), "unchecked", "ok", "refused" (401 or 403 to GET /models,
    401 to a request: wording, questions and speech-to-text route as if it were unset) or "unknown" (the check could
    not tell)."""
    kid = _key_id()
    if not kid:
        return "none"
    return (_META_KEY.get(kid) or {}).get("state") or "unchecked"


def meta_key_refused():
    return meta_key_status() == "refused"


def _note_meta_key(state, status=None, how=""):
    kid = _key_id()
    if not kid:
        return
    before = (_META_KEY.get(kid) or {}).get("state")
    if before == "refused" and state != "refused":
        return                                     # a refusal stands until the key changes (or a restart)
    _META_KEY[kid] = dict(state=state, status=status, at=time.time())
    if state == "refused" and before != "refused":
        log.warning("Meta's Model API refused MODEL_API_KEY (HTTP %s, %s): wording, questions and speech-to-text now route "
                    "as if it were unset", status, how)


class MetaKeyRefused(RuntimeError):
    """Meta's API answered 401 to MODEL_API_KEY on a request, or 401 or 403 to GET /models (noted: meta_key_refused()
    is now True)."""


class ContributorReply(ValueError):
    """A reply that says a Contributor model wrote it (Meta may train on what it was sent): never used, and the step's
    other models are not asked either (what was sent has gone to a route that should never have taken it)."""


class MetaModelRefused(RuntimeError):
    """Meta's API answered 403 to one request: about that model or that request (muse-wonder-1.0 is a preview the key
    may not reach), not the key, so nothing global changes and the next model may be tried."""


def probe_meta_key(timeout=5.0):
    """One cheap authenticated GET {META_API_BASE}/models, to learn whether Meta takes MODEL_API_KEY (server.py at
    start-up; nothing about any take goes with it). A 401 or 403 is a refused key; 200 a working one; anything else
    (a timeout, a network failure, another status) leaves it "unknown", routed as before. Returns meta_key_status()."""
    key, base = os.environ.get("MODEL_API_KEY", "").strip(), _hosted_base()
    if not key or not base:
        return meta_key_status()
    url = base + "/models"
    req = urllib.request.Request(url, method="GET", headers={"Authorization": f"Bearer {key}", "User-Agent": USER_AGENT})
    try:
        with _opener(url).open(req, timeout=timeout) as r:
            _note_meta_key("ok" if 200 <= r.status < 300 else "unknown", r.status, "GET /models")
    except urllib.error.HTTPError as e:
        _note_meta_key("refused" if e.code in (401, 403) else "unknown", e.code, "GET /models")
        e.close()
    except Exception as e:                        # a timeout or network failure says nothing about the key
        _note_meta_key("unknown", None, f"GET /models: {type(e).__name__}")
    return meta_key_status()


def hosted_route():
    """Which hosted route words and answers, by TEACHER_MUSE (the module docstring): "meta", "openrouter", "open" or
    None. A MODEL_API_KEY that Meta refused (meta_key_refused) counts as unset. "on" takes the open-weights route only
    when OPEN_WEIGHTS_HOST is set and neither Meta's API nor OpenRouter is."""
    mode = _mode()
    if mode == "off":
        return None
    if mode == "openrouter":
        return "openrouter" if _openrouter() else None
    if mode == "open":
        return "open" if _open() else None
    meta_ok = bool(_meta_hosted()) and not meta_key_refused()
    if mode == "meta" or meta_ok:
        return "meta" if meta_ok else None
    if _openrouter():
        return "openrouter"
    return "open" if _open() else None


def _hosted():
    """The hosted backend (Meta's API, OpenRouter or the open-weights host, hosted_route()), or None."""
    return {"meta": _meta_hosted, "openrouter": _openrouter, "open": _open}.get(hosted_route(), lambda: None)()


def _glimmer():
    """Self-hosted Muse Glimmer as a backend, or None."""
    base, model = _glimmer_base(), _glimmer_model()
    if _off() or meta_only() or not base or _contributor_id(model):
        return None
    return dict(name="glimmer", base=base, model=model, key=os.environ.get("MUSE_LOCAL_KEY"), hosted=False)


def backends():
    """Which models are set up, for /api/health: {"hosted": bool, "glimmer": bool, "route": "meta" | "openrouter" | "open" | None}."""
    route = hosted_route()
    return dict(hosted=bool(route), glimmer=bool(_glimmer()), route=route)


def openrouter_info():
    """What the OpenRouter route sends where, for /api/health ({"model", "providers", "dataCollection",
    "uploadsOnly"}), or None unless it is the hosted route now."""
    if hosted_route() != "openrouter":
        return None
    import openrouter_api as OR
    return OR.describe()


def open_info():
    """What the open-weights route sends where, for /api/health ({"host", "hostName", "servedBy", "model", "family",
    "structured", "uploadsOnly", and for OpenRouter "providers" and "dataCollection"}), or None unless it is the hosted
    route now."""
    if hosted_route() != "open":
        return None
    import open_api as OW
    return OW.describe()


def open_consent_covers(told):
    """Whether what a player agreed to at upload about the open-weights route (job.json openWeightsAtUpload: /api/health's
    "openWeights" then) covers it as it is set up now: they agreed, to the same host, for the same model family (a consent
    naming Muse Spark Open does not cover Muse Glimmer), at the same address for modal and custom (baseHost: any https
    address is taken there, so a consent to one endpoint never covers another), and through OpenRouter only to providers
    named then. With the route not set up at all, only the agreement counts (nothing can go there)."""
    if not (isinstance(told, dict) and told.get("muse") is True):
        return False
    import open_api as OW
    now = OW.describe() if _open() else None
    if now is None:
        return True
    return (told.get("host") == now["host"] and told.get("family") == now["family"] and told.get("baseHost") == now.get("baseHost")
            and set(now.get("providers") or []) <= set(told.get("providers") or []))


def openrouter_consent_covers(told):
    """Whether what a player agreed to at upload about OpenRouter (job.json openrouterAtUpload: /api/health's
    "openrouter" then) covers OpenRouter as it is set up now: they agreed, and every provider OpenRouter may now
    pass the take to was named then. A consent to OpenRouter then Meta does not cover Muse Glimmer at DeepInfra or
    Together. Checked against OpenRouter's settings even while Meta's API is the route: a Meta key refused on first
    use moves the take to OpenRouter in the middle of a request, on the policy computed before it (agent_chat,
    word, the plan). With OpenRouter not set up at all, only the agreement counts (nothing can go there)."""
    if not (isinstance(told, dict) and told.get("muse") is True):
        return False
    import openrouter_api as OR
    now = OR.describe() if _openrouter() else None
    return now is None or set(now["providers"]) <= set(told.get("providers") or [])


def _model_on():
    return bool(_hosted() or _glimmer())


def label(b):
    """A backend's model as the page and the logs name it."""
    if b.get("route") == "open":
        return f"{b['model']} (open weights, {b.get('servedBy') or b.get('hostName')})"
    return f"{b['model']} via OpenRouter" if b.get("route") == "openrouter" else b["model"]


def model_name():
    h, g = _hosted(), _glimmer()
    if h and g:
        to = h.get("servedBy") if h.get("route") == "open" else \
            "OpenRouter and Meta" if h.get("route") == "openrouter" and not h.get("uploadsOnly") else \
            "OpenRouter" if h.get("route") == "openrouter" else "Meta"
        return f"{g['model']} on our server, {label(h)} for uploads that agreed to {to}"
    if h or g:
        return label(h or g)
    contrib = not _off() and ((os.environ.get("MODEL_API_KEY") and _contributor_id(_hosted_model()))
                              or (_glimmer_base() and _contributor_id(_glimmer_model()))
                              or (os.environ.get("OPENROUTER_API_KEY") and _mode() != "meta"
                                  and _contributor_id(os.environ.get("OPENROUTER_MODEL")))
                              or (os.environ.get("OPEN_WEIGHTS_HOST") and _mode() in ("open", "on")
                                  and _contributor_id(os.environ.get("OPEN_WEIGHTS_MODEL"))))
    return "fixed wording (contributor models are not allowed)" if contrib else "fixed wording"


def hosted_allowed(res, adult=None, route=None):
    """Whether anything about this take may go to the hosted route (route, by default hosted_route()): Meta's
    API, or OpenRouter, which passes it to Meta. The result's policy flag for that route is required
    (POLICY_KEY: hostedMuse for Meta's API, openrouterMuse for OpenRouter; one never stands in for the
    other); then an upload is allowed (the server set the flag from the player's 18+ and consent at upload),
    and anything recorded on a Quest only with MUSE_QUEST_DATA_OK=1 and adult=True; through OpenRouter also
    only with MUSE_QUEST_OPENROUTER_OK=1 (Meta's written OK names OpenRouter: it is a third party that sees the
    take on its way to Meta), and never to a model that does not run at Meta (meta/muse-glimmer-30b: uploads only).
    The open-weights route (openWeightsMuse) takes uploads only: a Quest take never goes there, whatever is set."""
    route = route or hosted_route()
    pol = res.get("policy") if isinstance(res.get("policy"), dict) else {}
    if route not in POLICY_KEY or pol.get(POLICY_KEY[route]) is not True:
        return False
    if pol.get("dataOrigin") == "upload" and not _quest(res):
        return True
    if route == "open":
        return False
    if route == "openrouter":
        b = _openrouter()
        if not b or b.get("uploadsOnly") or os.environ.get("MUSE_QUEST_OPENROUTER_OK") != "1":
            return False
    return os.environ.get("MUSE_QUEST_DATA_OK") == "1" and adult is True


def _backend(res, adult=None):
    """The hosted backend when this take may go to it (Meta's API, OpenRouter or the open-weights host, hosted_allowed), else Glimmer,
    else None (the fixed wording). A take with a fingering finding or strength never goes to a hosted route,
    whatever its policy: those are worded from the fingering read, data calculated about the player's hands
    (DDUP 11A), which stays inside the teacher."""
    h = _hosted()
    if h and hosted_allowed(res, adult, h.get("route", "meta")) and not _fingering_content(res):
        return h
    return _glimmer()


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """urllib re-sends the Authorization header to wherever a 3xx points; refuse to follow instead."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _opener(url):
    loopback = urllib.parse.urlsplit(url).hostname in LOOPBACK
    return urllib.request.build_opener(*([_NoRedirect()] + ([urllib.request.ProxyHandler({})] if loopback else [])))


def _scrub(text):
    """No key in an error message, even if a server echoes it."""
    import open_api as OW
    for k in [os.environ.get("MODEL_API_KEY", "").strip(), (os.environ.get("MUSE_LOCAL_KEY") or "").strip(),
              os.environ.get("OPENROUTER_API_KEY", "").strip()] + [(os.environ.get(n) or "").strip() for n in OW.key_names()]:
        if len(k) >= 8:
            text = text.replace(k, "<key>")
    return text


def _complete(b, messages, schema, timeout, extra=None, max_tokens=2000, purpose=None):
    """One Chat Completions call to backend b with messages that start with a "developer" one.
    Returns (the reply's JSON object, seconds, the model that answered). Raises on anything off,
    including a reply from a Contributor model, or, through OpenRouter, from any provider but the
    pinned one (openrouter_api checks the reply), or through the open-weights host, from a listed provider or a model that
    is not open weights (open_api checks it, and reads the JSON strictly). Recorded in the call log either way (_record:
    purpose, else the block's, the tokens and the cost)."""
    if _contributor_id(b["model"]):
        raise ValueError("a contributor model is never called")
    t0, seen = time.perf_counter(), dict(model=b["model"], usage=None, ok=False)
    try:
        out = _complete_call(b, messages, schema, timeout, extra, max_tokens, seen)
        seen["ok"] = True
        return out
    finally:
        _record(b, seen["model"], purpose, time.perf_counter() - t0, seen["usage"], seen["ok"])


def _usage(use):
    use = use if isinstance(use, dict) else {}
    return {k: use[k] for k in ("prompt_tokens", "completion_tokens", "cost") if isinstance(use.get(k), (int, float))}


def _complete_call(b, messages, schema, timeout, extra, max_tokens, seen):
    """_complete's request, route by route; seen gets the model that answered and the usage as they become known."""
    if b.get("route") == "open":
        import open_api as OW
        # no response_format at hosts without it (Baseten's Muse Spark Open), so the JSON is asked for in the prompt
        # everywhere, and open_api parses it strictly from the text
        ask_json = "\nAnswer with one JSON object only, matching: " + json.dumps(schema)
        msgs = [dict(role="system", content=m["content"] + ask_json) if m["role"] == "developer" else m for m in messages]
        sid = (extra or {}).get("safety_identifier")
        r = OW.chat(msgs, schema=schema, timeout=timeout, max_tokens=max_tokens, user=sid)
        seen.update(model=r.get("model") or b["model"], usage=r.get("usage"))
        return r["json"] or {}, r["seconds"], r["model"]
    if b.get("route") == "openrouter":
        import openrouter_api as OR
        # "system" as for Glimmer, and the JSON asked for in the prompt too: whether the provider honours
        # response_format is up to it (openrouter_api); extra's safety id and cache key become OpenRouter's
        # user and session_id, both the hashed take id
        ask_json = "\nAnswer with one JSON object only, matching: " + json.dumps(schema)
        msgs = [dict(role="system", content=m["content"] + ask_json) if m["role"] == "developer" else m for m in messages]
        sid = (extra or {}).get("safety_identifier")
        r = OR.chat(msgs, schema=schema, timeout=timeout, max_tokens=max_tokens, user=sid, session_id=sid)
        seen.update(model=r.get("model") or b["model"], usage=r.get("usage"))
        if _contributor_id(r["model"]):
            raise ContributorReply(f"the reply came from a contributor model ({r['model']})")
        m = re.search(r"\{.*\}", r["content"], re.S)
        return (json.loads(m.group(0)) if m else {}), r["seconds"], r["model"]
    body = {"model": b["model"]}
    if b["hosted"]:
        body.update(messages=messages, reasoning_effort="minimal", max_completion_tokens=max_tokens, store=False,
                    response_format={"type": "json_schema", "json_schema": {"name": "Teacher", "schema": schema}}, **(extra or {}))
    else:
        # Glimmer on vLLM / SGLang (live/muse.py): "system", reasoning by chat_template_kwargs
        # (reasoning_effort is rejected there), and the JSON asked for in the prompt
        ask_json = "\nAnswer with one JSON object only, matching: " + json.dumps(schema)
        body.update(messages=[dict(role="system", content=m["content"] + ask_json) if m["role"] == "developer" else m for m in messages],
                    max_tokens=max_tokens, chat_template_kwargs={"reasoning_strength": "low"})
    headers = {"Content-Type": "application/json", "User-Agent": USER_AGENT}
    if b.get("key"):
        headers["Authorization"] = f"Bearer {b['key']}"
    url = b["base"] + "/chat/completions"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers=headers)
    t0 = time.perf_counter()
    resp = _post(b, req, timeout)
    seen.update(model=resp.get("model") or b["model"], usage=_usage(resp.get("usage")))
    if _contributor_id(resp.get("model")):
        raise ContributorReply(f"the reply came from a contributor model ({resp.get('model')})")
    ch = resp["choices"][0]
    if ch.get("finish_reason") == "length":
        raise ValueError("reply truncated")
    m = re.search(r"\{.*\}", ch["message"].get("content") or "", re.S)     # tolerate text around the JSON
    return (json.loads(m.group(0)) if m else {}), time.perf_counter() - t0, resp.get("model") or b["model"]


def _post(b, req, timeout):
    """The response to a Chat Completions request, as JSON. Meta's API answering 401 (the key) is noted and raised as
    MetaKeyRefused, so the caller can try OpenRouter instead; a 403 is about this model or request (MetaModelRefused):
    the key stays as it was, and the caller may try its next model."""
    try:
        with _opener(req.full_url).open(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if b.get("route") == "meta" and e.code == 401:
            e.close()
            _note_meta_key("refused", e.code, "POST /chat/completions")
            raise MetaKeyRefused(f"Meta's API refused MODEL_API_KEY (HTTP {e.code})") from None
        if b.get("route") == "meta" and e.code == 403:
            e.close()
            raise MetaModelRefused("Meta's API refused this request (HTTP 403)") from None
        raise


def _chat(system, user, schema, timeout=None, backend=None):
    """One request with a packet as the user message (word()). A raw call: word() and chat() decide
    who may be asked. backend None is the Glimmer at MUSE_BASE_URL, whatever TEACHER_MUSE says, and
    never the hosted API. Returns (reply, seconds)."""
    base = _glimmer_base()
    b = backend or (base and dict(name="glimmer", base=base, model=_glimmer_model(), key=os.environ.get("MUSE_LOCAL_KEY"), hosted=False))
    if not b:
        raise RuntimeError("no model set up")
    out, dt, _ = _complete(b, [{"role": "developer", "content": system}, {"role": "user", "content": json.dumps(user)}], schema,
                           timeout or float(os.environ.get("TEACHER_MUSE_TIMEOUT", "20")), max_tokens=3000)
    return out, dt


# "bar 12", "bars 3 and 7", "bars 3, 7, 12 and others", each number possibly followed by its pass (bars_phrase)
_BAR_NUM = r"\d+(?:,?\s*(?:the\s+(?:first|second|third)\s+time|both\s+times|each\s+time|more\s+than\s+once|one\s+of\s+the\s+times))?"
BAR_WORDS = re.compile(rf"\bbars?\s+{_BAR_NUM}(?:\s*(?:,|and|or)\s*(?:bar\s+)?{_BAR_NUM})*", re.I)


def bar_numbers(f):
    """The bar numbers a score finding names (its bars and where the same music comes back), which a
    model's line may say as "bar 12" or "bars 3 and 7". A reported octave run: its written bars."""
    if is_octave_run(f):
        return written_bars(f) if f.get("barNumbers", True) and not unreported_run(f) else []
    if not f.get("barNumbers"):
        return []
    out = {b.get("bar") for b in f.get("bars") or []} | {(a.get("firstBar") or {}).get("bar") for a in f.get("alsoAt") or []}
    return sorted(n for n in out if isinstance(n, int))


def check(text, hand=None, allowed=(), max_words=45, lead=False, bars=(), part=None, numbers=True, reference=None):
    """Reasons a model's line must not be used; empty = fine. Numbers, in digits or words, are
    allowed only as the times the packet gave (e.g. "0:12") and, said as "bar 12" or "bars 3 and 7",
    the bar numbers it gave (bars); no comparing with other people. numbers=False leaves every number
    to the caller (an answer written from lookups: evidence_problems).
    lead: for a hands_apart line, the hand that came first ("left"/"right", None when unknown);
    a line saying the other hand (or, when unknown, any hand) came first is refused. part: for a
    finding of a take split at middle C ("lower" / "upper"), the line must say its part in
    PART_WORDS' words and must name no hand. reference: False for a reworded finding, summary or plan line of a take
    compared with a reference recording (result.proCompare), which never names it (only the comparison's own lines do);
    True for an answer (checked by reference_problems); None (a take with no comparison) checks nothing of it, since
    "reference" there is the player's own score."""
    why = []
    t = (text or "").strip()
    if not t:
        return ["empty"]
    if reference is False and REF_NAMED.search(t):
        why.append("names the reference recording, which only the comparison's own lines do")
    if len(t.split()) > max_words:
        why.append("too long")
    rest = t
    for a in allowed:
        rest = rest.replace(a, "")
    ok_bars = {int(b) for b in bars}
    rest = BAR_WORDS.sub(lambda m: "" if ok_bars and {int(x) for x in re.findall(r"\d+", m.group(0))} <= ok_bars else m.group(0), rest)
    if numbers and re.search(r"\d", rest):
        why.append("a number that is not one of the given times")
    m = NUMBER_WORDS.search(SAY_ANYWAY.sub("", rest)) if numbers else None
    if m:
        why.append(f"an amount in words: {m.group(0)}")
    m = OTHERS.search(t)
    if m:
        why.append(f"compares with other people: {m.group(0)}")
    m = BANNED.search(t)
    if m:
        why.append(f"banned word: {m.group(0)}")
    why += learner_problems(t)
    if hand:
        other = "right" if hand == "left" else "left"
        if not re.search(rf"\b{hand}\b", t, re.I):
            why.append(f"does not say the {hand} hand")
        if re.search(rf"\b{other}\b", t, re.I):
            why.append(f"mentions the {other} hand")
    if part in PART_WORDS:
        if PART_WORDS[part].lower() not in t.lower():
            why.append(f"does not say {PART_WORDS[part]}")
        m = re.search(r"\b(left|right)\b", t, re.I)
        if m:
            why.append(f"names a hand ({m.group(0)}), which this take could not tell")
    if lead is not False:
        for h in ("left", "right"):
            if h == lead:
                continue
            # "right after", "right before", "right away" say when, not which hand, unless a hand follows ("your right
            # before your left" is a hand coming first)
            if re.search(rf"\b{h}\b(?!\s+(?:after|away|now|then|there|here|at|on|into|before|behind)\b"
                         rf"(?!\s+(?:your|the|my)\s+(?:left|right|other)\b))(?:[- ]hand)?\W+(?:\w+\W+){{0,3}}?"
                         rf"(first|lead\w*|ahead|early|earlier|before)\b", t, re.I) \
                    or re.search(rf"\b(led|leading|leads) (by|with) (the |your )?{h}\b", t, re.I):
                why.append(f"says the {h} hand came first" + ("" if lead else ", which was not measured"))
    return why


def learner_problems(text):
    """The learner-text rules every model line passes beside the fact gate (exercises.learner_problems,
    as the course's own learner-text check has them): no percentage, no tempo ratio, no score, no
    praise of the person, no drill code or exercise number, no naming the notes aloud, no finger claim about the player,
    and "the pickup", never "bar 0". Each reason is said "learner text: ..."."""
    import exercises as EX
    return [f"learner text: {w}" for w in EX.learner_problems(text)]


def clean(text):
    """Plain hyphens only in anything spoken or shown."""
    return (text or "").strip().replace("\u2014", " - ").replace("\u2013", "-")


SYSTEM_WORD = "[private: Museverse teaching text, not in this repository]"

SCHEMA_WORD = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "lines": {"type": "array", "items": {"type": "object", "properties": {"id": {"type": "string"}, "say": {"type": "string"}},
                                             "required": ["id", "say"]}},
    },
    "required": ["summary", "lines"],
}


def _count_words(res):
    """The number of findings as the opening words it ("Two things are"), which a reworded
    summary may repeat."""
    w = COUNT.get(len(worked_findings(res)), "").split(" ")[0]
    return [w, w.lower()] if w else []


@on_clip
def word(res, model=True):
    """Fills every finding with its advice (title, what, why, practise, check, fine, say, tip,
    source), every strength with its title and praise (say), and res["summary"]["say"/"source"].
    A model rewords only the summary and each finding's what-I-saw line (say = what); the
    exercises, the why and the checks are the researched text, as written. Returns a note on what
    spoke: the model name only if at least one line it wrote was used (else "fixed wording"), and
    any rejected lines; on the open-weights route also "author", who worded them as the page says it ("Muse Spark
    Open (open weights, served by Baseten)", result.json pipeline.voiceNote). model=False keeps the fixed wording
    whatever the settings. An octave run lane L1 did not report leaves the findings here: it is never said (said_findings),
    and lives only in result.analysis.octaveRuns. A reply that cannot be read (no lines, a line that is not words) is
    that model's failure, as a timeout is: the next model, then the fixed words; word() itself never raises for it."""
    if isinstance(res.get("findings"), list):
        res["findings"] = said_findings(res)
    for k, f in enumerate(res["findings"] or []):
        if is_octave_run(f):                       # lane L1's octave run: the id and item every reader of a finding needs
            f.setdefault("item", OCTAVE_ITEM)
            f.setdefault("id", f"{OCTAVE_ITEM}-{f.get('hand') or 'both'}-{k}")
    fixed = {f["id"]: fixed_finding(f) for f in res["findings"]}
    for f in res["findings"]:
        f.update(fixed[f["id"]])
        f["source"] = "fixed"
    # an item with no praise is never praised (PRAISE: the hand-position items), even in a result made before it lost it
    res["strengths"] = [g for g in res.get("strengths") or [] if praised(g)]
    for g in res["strengths"]:
        g.update(praise(g))
    summary = fixed_summary(res)
    res.setdefault("summary", {})["source"] = "fixed"
    note = dict(model="fixed wording", rejected=[])
    b = _backend(res) if model else None
    if b and res["findings"] is not None:
        # the fingering findings keep their fixed wording (the hedge and the replay moment must stay), so no model
        # is given them to reword
        packet = dict(
            played=heard_where(res) or None,        # what was played, by its bars: no length and no note count
            findings=[dict(id=f["id"], item=f["item"], hand=HAND.get(f.get("hand")), kind=f["kind"], when=when_phrase(f),
                           what=fixed[f["id"]]["what"], **({"part": PART_WORDS[f["part"]]} if f.get("part") in PART_WORDS else {}))
                      for f in res["findings"] if f["item"] not in FINGER_ITEMS + REF_ITEMS + (OCTAVE_ITEM,)
                      and not fixed[f["id"]].get("slipsSay")],
            strengths=[g["say"] for g in res.get("strengths") or [] if g.get("item") not in FINGER_ITEMS],
            # a reference remark the pianist's consent keeps from this route is not in the summary it is shown
            fixedSummary=fixed_summary(res, hosted=True) if ref_hidden(res, b.get("hosted")) else summary)
        # the purpose's models in turn (purpose_models: Muse Wonder, then Muse Spark), each until one gives a line that
        # passes; a Meta key refused moves to OpenRouter when the take allows it, with that route's own model
        models, k, end = purpose_models("word", b), 0, time.monotonic() + purpose_timeout("word")
        with purpose("word"):
            while k < len(models):
                bm, mark = dict(b, model=models[k]), call_mark()
                left = end - time.monotonic()
                if left < 1.0:
                    note["error"] = "no time left"
                    break
                try:
                    out, dt = _chat(SYSTEM_WORD, packet, SCHEMA_WORD, timeout=left, backend=bm)
                except MetaKeyRefused as e:
                    b2 = _backend(res)                # the route now, with the refused key counted as unset
                    if not (b2 and b2.get("route") == "openrouter"):
                        note["error"] = _scrub(f"{type(e).__name__}: {e}")[:300]
                        break
                    b, models, k = b2, purpose_models("word", b2), 0
                    continue
                except ContributorReply as e:     # never asked again (ContributorReply)
                    note["error"] = _scrub(f"{type(e).__name__}: {e}")[:300]
                    break
                except Exception as e:            # no model, network, timeout, bad JSON: the next model, then the fixed lines
                    note["error"] = _scrub(f"{type(e).__name__}: {e}")[:300]
                    k += 1
                    continue
                note.update(seconds=round(dt, 2))
                try:
                    used = _word_apply(res, out, fixed, packet, bm, note)
                except Exception as e:            # a reply this code could not read: that model's failure, never the job's
                    note["error"] = _scrub(f"the reply could not be used: {type(e).__name__}: {e}")[:300]
                    k += 1
                    continue
                if used:
                    mark_used(mark)
                    b = bm
                    note.pop("error", None)
                    break
                k += 1
    if res["summary"]["source"] != "fixed" or any(f["source"] != "fixed" for f in res["findings"]):
        note.update(model=label(b), backend=b["name"])
        if b.get("route") == "open":               # the page's "Worded by ..." names the model family and its host
            note["author"] = author(b["model"], b.get("servedBy"))
    res["summary"]["say"] = note.pop("summary", summary)
    return note


def _reply_lines(out, key="say"):
    """A reply's lines as {id: what it gave as `key`}: only an object's "lines" list (null or anything else: none), and
    in it only objects with a string id. The caller refuses a value that is not a string ("not words")."""
    lines = out.get("lines") if isinstance(out, dict) else None
    return {x["id"]: x.get(key) for x in lines if isinstance(x, dict) and isinstance(x.get("id"), str)} if isinstance(lines, list) else {}


def _word_apply(res, out, fixed, packet, b, note):
    """word()'s use of one model's reply out (from backend b): each finding's line that passes check() and the summary
    when it does, into res; the rest into note["rejected"]. Whether anything was used. Everything is checked before
    anything is written, so a reply that fails part way leaves res as it was."""
    by = _reply_lines(out)
    offered = {x["id"] for x in packet["findings"]}     # never a finding kept in fixed words (octave, fingering, reference)
    lines, summary, rejected = [], None, []
    for f in res["findings"]:
        if f["id"] not in by or f["id"] not in offered or f.get("source") != "fixed":
            continue
        x = by[f["id"]]
        times = [when(f)] + when(f).split(" to ")
        lead = lead_hand(f) if f["item"] == "hands_apart" else False
        bad = ["not words"] if not isinstance(x, str) else \
            check(x, HAND.get(f.get("hand")), times, lead=lead, bars=bar_numbers(f), part=f.get("part"),
                  reference=False if isinstance(res.get("proCompare"), dict) else None)
        if bad:
            rejected.append(dict(id=f["id"], why=bad, model=b["model"]))
            continue
        lines.append((f, clean(x)))
    # a take with nothing to judge keeps the fixed opening, which says so and how long to record; one whose main
    # finding names the notes played (exact notes) keeps it too: check() cannot tell a note name changed or dropped
    worked = worked_findings(res)
    top = worked[0] if worked else None
    # ... and a take whose reference remarks this route may not hear keeps its fixed summary, which names them
    if res["summary"]["source"] == "fixed" and not not_judged(res) and not (top and fixed[top["id"]].get("slipsSay")) \
            and not ref_hidden(res, b.get("hosted")):
        s = out.get("summary", "") if isinstance(out, dict) else ""
        allowed = _count_words(res)                # musical terms only: no length, no note count, no clock
        # the time of what showed up once, under the same condition as fixed_summary says it
        once = None if worked else _seen_once(res)
        if once:
            allowed.append(once[1])
        # the fixed summary it rewords is the program's own: its numbers and amounts (its bar numbers, "two things")
        # are facts the model may repeat, and its length is what it may take (a short take's fixed opening alone runs
        # past 70 words when it says how to film the next one)
        allowed += fact_words(packet["fixedSummary"])
        allowed.sort(key=len, reverse=True)       # "12:30" before "2:30", so no "1" is left behind
        cap = max(70, len(packet["fixedSummary"].split()) + 15)
        bad = (["not words"] if not isinstance(s, str) else
               check(s, None, allowed, cap, reference=False if isinstance(res.get("proCompare"), dict) else None))
        if bad:
            rejected.append(dict(id="summary", why=bad, model=b["model"]))
        else:
            summary = clean(s)
    for f, say in lines:
        f.update(say=say, what=say, source=b["name"])
    if summary is not None:
        note["summary"] = summary
        res["summary"]["source"] = b["name"]
    note["rejected"].extend(rejected)
    return bool(lines) or summary is not None


FACT_NUM = re.compile(r"\d+(?::\d\d)?(?:[.,]\d+)*")


def fact_words(text):
    """The numbers and amounts a fixed line of the program says ("0:28", "94", "30", "seconds", "two"), which a model
    rewording that line may say again: they are the program's facts, not the model's."""
    out = set(FACT_NUM.findall(text or ""))
    for m in NUMBER_WORDS.finditer(text or ""):
        w = m.group(0)
        out |= {w, w.lower(), w.capitalize()}
    return sorted(out, key=len, reverse=True)


# ---------------------------------------------------------------- the lesson, in Muse's words
#
# lesson.py writes every line the lesson says (the good news, each part's intro, what to watch, the "your turn", the
# close) from what was measured. Muse Spark may say them in its own voice, line by line, as word() lets it word a
# finding: the same gate (hosted_allowed and no fingering read, _backend), and a line it wrote is used only when
# lesson_check finds nothing changed that the program decided: the same numbers, the same notes in the same order,
# the same hands and fingers, the same things the lesson then does (the ghost hands, listening, slowly, filming again,
# comparing), no banned words, nobody else compared with. Any line that fails keeps lesson.py's wording, so a lesson is
# never worse for having asked. A finding's part keeps its intro and its exercise as they are (word() already had the
# finding's line, and the exercise is the researched text); only its "your turn" is offered.

NOTE_NAME = re.compile(r"\b([A-G])(?:\s+(sharp|flat))?\b")
FINGER_NAMES = re.compile(r"\b(thumb|second finger|index finger|middle finger|third finger|fourth finger|ring finger|"
                          r"little finger|fifth finger|pinky|pinkie)s?\b", re.I)
ACTIONS = {"ghost": re.compile(r"\bghost", re.I), "listen": re.compile(r"\blisten", re.I),
           "slow": re.compile(r"\bslow", re.I), "film": re.compile(r"\b(film|record)\w*", re.I),
           "compare": re.compile(r"\bcompar\w*", re.I)}
LESSON_MAX_WORDS = 40
# qualities nothing here measures (teacher_knowhow.md, "What cannot be judged"): a line may not add one ("lovely to hear")
QUALITIES = re.compile(r"\b(lovel\w*|beautiful\w*|gorgeous|wonderful\w*|great|amazing|brilliant|excellent|perfect\w*|"
                       r"musical\w*|express\w*|tone|tonal|dynamic\w*|phrasing|touch|feeling|emotion\w*|flow\w*|fluent\w*|"
                       r"smooth\w*|steady|confident\w*|relax\w*|graceful\w*|elegant\w*|stunning)\b", re.I)


def note_names(text):
    """The note names a line says, in order ("E, D sharp, E" -> ["E", "D sharp", "E"]). A capital A or (rarer) another
    letter that starts a sentence and runs on into a lowercase word ("A lovely start") is the article, not the note."""
    out = []
    for m in NOTE_NAME.finditer(text or ""):
        n = m.group(1)
        if not m.group(2):
            before = text[:m.start()].rstrip()
            after = text[m.end():]
            starts = not before or before[-1] in ".!?:\"'("
            if n == "A" and starts and re.match(r"\s+[a-z]", after) and not re.match(r"\s+(sharp|flat)\b", after):
                continue
        out.append(n + (f" {m.group(2).lower()}" if m.group(2) else ""))
    return out


def lesson_check(fixed, text, max_words=None):
    """Reasons a model's rewording of one lesson line must not be used; empty = fine (the notes above)."""
    why = []
    t = (text or "").strip()
    if not t:
        return ["empty"]
    cap = max_words or max(LESSON_MAX_WORDS, round(1.6 * len(fixed.split())) + 4)
    if len(t.split()) > cap:
        why.append("too long")
    if sorted(FACT_NUM.findall(t)) != sorted(FACT_NUM.findall(fixed)):
        why.append("not the same numbers")
    say_words = lambda s: sorted(m.group(0).lower() for m in NUMBER_WORDS.finditer(SAY_ANYWAY.sub("", s)))
    if say_words(t) != say_words(fixed):
        why.append("not the same amounts in words")
    if note_names(t) != note_names(fixed):
        why.append("not the same notes in the same order")
    hands = lambda s: {h for h in ("left", "right") if re.search(rf"\b{h}(?=[- ]hand)|\byour {h}\b", s, re.I)}
    if hands(t) != hands(fixed):
        why.append("not the same hands")
    fingers = lambda s: {FINGER_ALIAS.get(m.group(1).lower(), m.group(1).lower()) for m in FINGER_NAMES.finditer(s)}
    if fingers(t) != fingers(fixed):
        why.append("not the same fingers")
    acts = lambda s: {k for k, rx in ACTIONS.items() if rx.search(s)}
    if acts(t) != acts(fixed):
        why.append("not the same steps of the lesson")
    for rx, what in ((BANNED, "banned word"), (OTHERS, "compares with other people"), (MEDICAL, "a medical word")):
        m = rx.search(t)
        if m:
            why.append(f"{what}: {m.group(0)}")
    why += learner_problems(t)
    if "?" in t and "?" not in fixed:
        why.append("asks a question the lesson does not wait for")
    added = {m.group(0).lower() for m in QUALITIES.finditer(t)} - {m.group(0).lower() for m in QUALITIES.finditer(fixed)}
    if added:
        why.append(f"praise nothing measured: {', '.join(sorted(added))}")
    return why


def facts_check(facts, text, max_words, hands=frozenset()):
    """Reasons a line a model wrote about a part (or the take) must not be used, when it may say less than the facts
    but nothing more: its numbers, amounts in words, note names, fingers and lesson steps all from facts (the part's
    own lines), a hand only from hands ({"left"}, {"right"} or none), and none of the banned, medical or comparing
    words; at most max_words. Empty = fine (wonder.py)."""
    why = []
    t = (text or "").strip()
    if not t:
        return ["empty"]
    if len(t.split()) > max_words:
        why.append("too long")
    if not set(FACT_NUM.findall(t)) <= set(FACT_NUM.findall(facts)):
        why.append("a number that is not in the evidence")
    words = lambda s: {m.group(0).lower() for m in NUMBER_WORDS.finditer(SAY_ANYWAY.sub("", s))}
    if not words(t) <= words(facts):
        why.append("an amount in words that is not in the evidence")
    if not set(note_names(t)) <= set(note_names(facts)):
        why.append("a note that is not in the evidence")
    named = {h for h in ("left", "right") if re.search(rf"\b{h}(?=[- ]hand)|\byour {h}\b", t, re.I)}
    if not named <= set(hands):
        why.append("a hand the evidence is not about")
    fingers = lambda s: {FINGER_ALIAS.get(m.group(1).lower(), m.group(1).lower()) for m in FINGER_NAMES.finditer(s)}
    if not fingers(t) <= fingers(facts):
        why.append("a finger the evidence does not name")
    acts = lambda s: {k for k, rx in ACTIONS.items() if rx.search(s)}
    if not acts(t) <= acts(facts):
        why.append("a step the lesson does not take")
    for rx, what in ((BANNED, "banned word"), (OTHERS, "compares with other people"), (MEDICAL, "a medical word")):
        m = rx.search(t)
        if m:
            why.append(f"{what}: {m.group(0)}")
    why += learner_problems(t)
    if "?" in t:
        why.append("asks a question the lesson does not wait for")
    added = {m.group(0).lower() for m in QUALITIES.finditer(t)} - {m.group(0).lower() for m in QUALITIES.finditer(facts)}
    if added:
        why.append(f"praise nothing measured: {', '.join(sorted(added))}")
    return why


FINGER_ALIAS = {"index finger": "second finger", "third finger": "middle finger", "ring finger": "fourth finger",
                "fifth finger": "little finger", "pinky": "little finger", "pinkie": "little finger"}


def lesson_lines(lesson):
    """[(id, kind, text)] for every line of a lesson Muse Spark may reword, in the order the lesson says them: each fix's
    explanation (p<i>.intro.<j>, the same as its teach.explain), and the strength said at the opening (open.1). The
    designed lines stay the program's (the design's rules: the hook, "Here's how it should sound.", the exercise with its
    benefit, the title card, the week), so the lesson keeps the reference script's points at its length; a lesson from
    before the teach block (an older result) offers its parts' intro, watch, your turn and drill lines as before."""
    out = []
    v2 = (lesson.get("version") or 1) >= 2
    for k, x in enumerate(lesson.get("open") or []):
        if isinstance(x, str) and x.strip() and (not v2 or k == 1):
            out.append((f"open.{k}", "opening", x))
    for p in lesson.get("parts") or []:
        i = p.get("i")
        if not isinstance(i, int):
            continue
        if v2:
            offered = ("intro",) if p.get("kind") != "next" else ()
        else:
            offered = ("tryIt", "practice") if p.get("kind") == "finding" else ("intro", "watch", "tryIt", "practice")
        for field in offered:
            v = p.get(field)
            if field == "tryIt":
                if isinstance(v, str) and v.strip():
                    out.append((f"p{i}.tryIt", f"{p.get('kind')}: your turn", v))
                continue
            if field == "practice":
                if isinstance(v, dict) and isinstance(v.get("say"), str) and v["say"].strip():
                    out.append((f"p{i}.practice", f"{p.get('kind')}: the drill after the player's turn", v["say"]))
                continue
            for j, x in enumerate(v or []):
                if isinstance(x, str) and x.strip():
                    out.append((f"p{i}.{field}.{j}", f"{p.get('kind')}: {'the explanation' if v2 else field}", x))
    if not v2:
        for k, x in enumerate(lesson.get("close") or []):
            if isinstance(x, str) and x.strip():
                out.append((f"close.{k}", "close", x))
    return out


def _set_line(lesson, lid, text):
    head, *rest = lid.split(".")
    if head in ("open", "close"):
        lesson[head][int(rest[0])] = text
        if head == "open" and isinstance(lesson.get("strength"), dict) and int(rest[0]) == 1:
            lesson["strength"]["say"] = text
        return
    p = next(p for p in lesson["parts"] if f"p{p.get('i')}" == head)
    if rest[0] == "tryIt":
        p["tryIt"] = text
    elif rest[0] == "practice":
        p["practice"] = dict(p["practice"], say=text)
    else:
        p[rest[0]][int(rest[1])] = text
        t = p.get("teach")
        if rest[0] == "intro" and isinstance(t, dict) and isinstance(t.get("explain"), list) and int(rest[1]) < len(t["explain"]):
            t["explain"][int(rest[1])] = text      # the explanation the view says is the part's intro, one list


SYSTEM_LESSON = "[private: Museverse teaching text, not in this repository]"

SCHEMA_LESSON = {
    "type": "object",
    "properties": {"lines": {"type": "array", "items": {"type": "object", "properties": {
        "id": {"type": "string"}, "say": {"type": "string"}}, "required": ["id", "say"]}}},
    "required": ["lines"],
}


def word_lesson(res, model=True):
    """Muse's wording of res["lesson"]'s lines (the notes above; purpose "lesson-lines": Muse Wonder, then Muse Spark), in place. Returns a note: the model when at least
    one line it reworded was used (else "fixed wording"), how many lines it was offered and used, and the ones refused
    with why. The lesson says who worded it: source ("fixed", or the backend's name) and muse, the ids of the lines it
    reworded (a line it returned unchanged stays lesson.py's).""" 
    L = res.get("lesson") if isinstance(res.get("lesson"), dict) else None
    note = dict(model="fixed wording", offered=0, used=0, rejected=[])
    if not L:
        return note
    L["source"], L["muse"] = "fixed", []
    L.pop("wordedBy", None)
    b = _backend(res) if model else None
    lines = lesson_lines(L)
    if not b or not lines:
        if isinstance(res.get("job"), dict) and isinstance(res.get("modelCalls"), list):
            taken()                                # this job's calls are in its result: never the next job's
        return note
    piece = L.get("piece") if isinstance(L.get("piece"), dict) else {}
    packet = dict(piece=piece.get("title") if piece.get("recognised") else None,
                  lines=[dict(id=i, kind=k, line=t) for i, k, t in lines])
    note["offered"] = len(lines)
    start = call_mark()
    # the purpose's models in turn (Muse Wonder, then Muse Spark), the next only when one gave no line that passed
    models, end = purpose_models("lesson-lines", b), time.monotonic() + purpose_timeout("lesson-lines")
    with purpose("lesson-lines"):
        for m in models:
            bm, mark, left = dict(b, model=m), call_mark(), end - time.monotonic()
            if left < 1.0:
                note["error"] = "no time left"
                break
            try:
                out, dt = _chat(SYSTEM_LESSON, packet, SCHEMA_LESSON, timeout=left, backend=bm)
            except ContributorReply as e:         # never asked again (ContributorReply)
                note["error"] = _scrub(f"{type(e).__name__}: {e}")[:300]
                break
            except Exception as e:                # no model, network, timeout, bad JSON: the next model, then lesson.py's lines
                note["error"] = _scrub(f"{type(e).__name__}: {e}")[:300]
                continue
            note["seconds"] = round(dt, 2)
            try:
                passed, changed, rejected = _lesson_reply(lines, out)
            except Exception as e:                # a reply this code could not read: that model's failure, never the lesson's
                note["error"] = _scrub(f"the reply could not be used: {type(e).__name__}: {e}")[:300]
                continue
            note["rejected"].extend(rejected)
            if passed:
                for lid, say in changed:             # a line it kept as it was is lesson.py's, and stays credited to it
                    _set_line(L, lid, say)
                    L["muse"].append(lid)
                mark_used(mark)
                b = bm
                note.pop("error", None)
                break
    note["used"] = len(L["muse"])
    if L["muse"]:
        L["source"] = b["name"]
        L["wordedBy"] = label(b)
        note.update(model=label(b), backend=b["name"])
    # result.modelCalls: the calls before this one (lesson.build attached them), then this step's own; the log's calls
    # are then this result's, never the next job's
    if isinstance(res.get("modelCalls"), list):
        res["modelCalls"].extend(model_calls(start=start))
    else:
        attach_calls(res)
    if isinstance(res.get("job"), dict):
        taken()
    return note


def _lesson_reply(lines, out):
    """One model's reply to word_lesson, checked and nothing written: (how many lines passed, [(id, its line)] for the
    ones it said another way, [the refused, with why]). A line that is not words is refused ("not words"); a reply with
    no lines list passes none."""
    by = _reply_lines(out)
    passed, changed, rejected = 0, [], []
    for lid, kind, fixed in lines:
        if lid not in by:
            continue
        if not isinstance(by[lid], str):
            rejected.append(dict(id=lid, why=["not words"]))
            continue
        say = clean(by[lid])
        # the opening is two quick lines: said another way, never longer
        # the opening and a fix's explanation are said another way, never longer (v0.8's script is the length to keep)
        bad = lesson_check(fixed, say, max_words=len(fixed.split()) + 2 if kind in ("opening",) or kind.endswith("the explanation") else None)
        if bad:
            rejected.append(dict(id=lid, why=bad))
            continue
        passed += 1
        if say != fixed:
            changed.append((lid, say))
    return passed, changed, rejected


# ---------------------------------------------------------------- questions

# whole words only: "ache" is inside "teacher", "numb" inside "number". Jumps come before
# stretches, so "did I reach the jumps" is about the jumps; a hand leaning comes before the little
# finger, so "does my hand lean to the little finger" is about the lean.
TOPICS = [(re.compile(r, re.I), items) for r, items in (
    (r"\b(lean\w*|tilt\w*|tip(s|ped|ping)? over)\b", ("roll_little",)),
    (r"\b(little fingers?|pink(y|ie)s?|fifth fingers?)\b", ("little_lift",)),
    (r"\b(finger\w*|thumbs?)\b", FINGER_ITEMS),
    (r"\bwrists?\b", ("wrist_low", "wrist_high", "wrist_height")),
    (r"\b(posture|hand (position|shape)s?)\b", POSTURE),
    (r"\b(chord\w*|roll\w*|arpeggi\w*)\b", ("rolled_chords", "chord_spread")),
    (r"\b(together|same time|apart)\b", ("hands_apart", "rolled_chords", "chord_spread")),
    (r"\b((un)?even(ly|ness)?|rhythm\w*|timing|tempo|rush\w*|steady|unsteady|runs?|running|scales?)\b", ("uneven_run",)),
    (r"\b(loud\w*|soft(ly|er|ness)?|dynamic\w*|volume|touch\w*)\b", ("uneven_touch",)),
    (r"\b(jump\w*|leap\w*|mov\w*|positions?|shift\w*)\b", ("late_leap",)),
    (r"\b(stretch\w*|open\w*|spread\w*|reach\w*|wide\w*)\b", ("held_open",)),
    (r"\b(wrong|notes?|mistakes?|score|miss\w*|extra|bars?)\b", ("wrong_notes", "missed_notes", "extra_notes")),
)]
# what an uploaded video cannot judge (one camera, the notes from the sound)
NOT_JUDGED = [(re.compile(r, re.I), what) for r, what in (
    (r"\b(curv\w*|curl\w*)\b", "how your fingers curve"),
    (r"\b(little fingers?|pink(y|ie)s?|fifth fingers?)\b", "how your little finger moves"),
    (r"(?<!little )(?<!fifth )\bfinger\w*", "which finger played each note"),
    (r"\bwrists?\b", "your wrists"),
    (r"\b(lean\w*|tilt\w*)\b", "how your hand tilts"),
    (r"\b(tense|tension|tight\w*|stiff\w*|relax\w*)\b", "tension"),
    (r"\b(posture|shoulders?|elbows?|hand (position|shape)s?)\b", "your posture"),
    (r"\bpedal\w*", "pedalling"),
)]
# what a Quest recording cannot judge: the wrists, the hand's roll and the little finger it can
NOT_JUDGED_QUEST = [(re.compile(r, re.I), what) for r, what in (
    (r"\b(curv\w*|curl\w*)\b", "how your fingers curve"),
    (r"(?<!little )(?<!fifth )(?<!pinky )(?<!pinkie )\bfinger\w*", "which finger played each note"),
    (r"\b(tense|tension|tight\w*|stiff\w*|relax\w*)\b", "tension"),
    (r"\b(shoulders?|elbows?|sitting|seat\w*|bench)\b", "how you sit"),
    (r"\bpedal\w*", "pedalling"),
)]
# a Quest take whose fingering read passed its gates (result.fingering.stage, web/fingering/quest.py) shows the fingers
# on the replay, still unjudged at "shown": "is my fingering ok?" says so, and never routes to a model (the block is data
# calculated about the player's hands and is not in the model's context). From "tip" fingering is judged, so the
# question goes to the fingering findings like any topic (and their fixed answers when there are none)
FINGER_WHAT = "which finger played each note"
FINGER_SHOWN = ("The replay shows which finger I saw on each note where I could tell, and a question mark where I couldn't, "
                "but I don't judge fingering yet.")
# on a professional's take the replay draws a digit only where the read was surest (display.minConf 0.9, D3): the other
# read notes get a "?" too, as the legend and the limits say
FINGER_SUREST = "On this take I only show the ones I was surest of."
NO_FINGER_HABIT = "I didn't see a fingering habit to change in the notes I could read."
# the limits' line from stage "tip" (fingering/rules.py LIMITS_LINE; test_voice.py checks they are the same)
FINGER_TIP_LIMIT = ("Fingering habits are judged only where the hand tracking could read the fingers, in fast passages or in "
                    "legato runs.")
FINGER_NOT_READ = ("I couldn't judge your fingering in this take: I judge it only where I could read the fingers, in fast "
                   "passages or in legato runs.")
# a fixed fingering answer said earlier in the conversation tells what this take's read found (its stage, a hand off the
# replay, the check that failed in this take), so under the hosted API such a teacher turn is sent as FINGER_GENERIC
# instead (hosted_turns), as context(hosted=True) gives only the limits' generic fingering line (DDUP 11A). A mark is
# looked for anywhere in a turn, since history_window joins two teacher turns in a row into one
FINGER_GENERIC = "I can't judge which finger played each note from this recording."
FINGER_READ_MARKS = (FINGER_SHOWN, FINGER_SUREST, "fingers are not on the replay", "which finger played each note from this recording",
                     NO_FINGER_HABIT, FINGER_NOT_READ, "fingers could not be read often enough")
# the reasons a Quest take's fingering is not judged (fingering/quest.py REASON, as the limits write them), as they are
# said: the spoken rules (check()) allow no "tracking" and no amounts in words; test_voice.py checks every REASON has one
SPOKEN_REASON = {
    "[private: Museverse teaching text, not in this repository]": "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]":
        "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]": "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]": "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]": "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]": "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]": "[private: Museverse teaching text, not in this repository]",
    "[private: Museverse teaching text, not in this repository]": "[private: Museverse teaching text, not in this repository]",
}
FINGER_ANSWER_WORDS = 60
SHORT_FINGER = {1: "thumb", 2: "index", 3: "middle", 4: "ring", 5: "little"}
NOT_JUDGED_WORDS = ["which finger played each note", "wrist angles and how the hand tilts", "how the fingers curve",
                    "tension, pain or injury", "posture: shoulders, elbows, how the player sits", "pedalling"]
NOT_JUDGED_QUEST_WORDS = ["which finger played each note", "how the fingers curve", "the sideways bend of the wrist",
                          "tension, pain or injury", "shoulders, elbows and how the player sits", "pedalling", "the tone in the room"]
# ("tight" and "tense" go to the tension answer: NOT_JUDGED)
PAIN = re.compile(r"\b(hurts?|hurting|pain(s|ful)?|aches?|aching|achy|sore(ness)?|numb(ness)?|tingl\w*|injur\w*|cramps?|strain\w*|"
                  r"burn(s|ing)?|tired|fatigue\w*)\b", re.I)
PAIN_ANSWER = ("If playing hurts, please stop and rest, and talk to a piano teacher or a doctor or physiotherapist "
               "before you carry on. I can't see what causes pain, so I won't guess.")
# "what should I focus on first" goes to the main finding even when it names a topic ("which note");
# "how should I practise my runs" stays with the runs
FOCUS = re.compile(r"\b(focus|priorit\w*|most important|start)\b|\bfirst\b(?=\s*([?.,!]|$|thing|step))", re.I)
FOCUS_WEAK = re.compile(r"\b(practi[cs]e|work on|improve)\b", re.I)
# "how do I fix it", "what exercises": the exercises for the main finding, not just its first one
FIX = re.compile(r"\b(fix|exercises?|drills?)\b|\bhow (do|can|should) i (practi[cs]e|improve|work on|get better)\b", re.I)
# which part of a long video was looked at (job.video.window): answered with the result's own line
WHICH_PART = re.compile(r"\b(which|what) (part|bit|section|minute|stretch)\b(?=[^?.!]*\b(you|video|take|recording|analy[sz]ed|looked|listened)\b)|\bwhole (video|take|recording)\b|\ball of my video\b|"
                        r"\bdid you (look at|watch|listen to|hear|see|analy[sz]e) (all|everything|the whole)\b|\bwhere did you (start|begin)\b", re.I)
SHORT_ANSWER = {
    "no notes": "[private: Museverse teaching text, not in this repository]",
    "too short": "[private: Museverse teaching text, not in this repository]",
    "nothing judged": "[private: Museverse teaching text, not in this repository]",
}
SHORT_TOO = " Beyond that, the take was too short to judge your technique: a few phrases or more of playing gives enough."
NOTHING_TOO = " Beyond that, nothing I can judge about your technique came up often enough in this take."
# after what changed (practice_plan.progress), SHORT_ANSWER["too short"] on a re-take compared with its first take: short is
# what it was filmed for, so it is never asked to record again
RETAKE_TECHNIQUE = "Judging your technique needs a few phrases or more of playing."
# the runs named in a question: without them, "is my timing steady?" asks about a tempo no measure here covers, which is said
RUNS_WORD = re.compile(r"\b(runs?|running|scales?)\b", re.I)
# why the hands were not put on the keys (analysis.placement), in the player's words, each ending with what to do next time
# (no digits in any of it: a model may say it again, and check() refuses numbers that are not the take's own times)
PLACE_TIP = {
    "keyboard": "[private: Museverse teaching text, not in this repository]",
    "hands": "[private: Museverse teaching text, not in this repository]",
    "octave": "[private: Museverse teaching text, not in this repository]",
    "keys": "[private: Museverse teaching text, not in this repository]",
    "notes": "[private: Museverse teaching text, not in this repository]",
}
PLACE_OLD = "I couldn't place your hands on the keys in this video"    # a result from before the reason was recorded
NO_HANDS_SPLIT = "I can't tell your left hand from your right: I judged the notes below middle C and from middle C up apart instead."
FIRST_LOOK = "A first look at a few frames of your video"
# "why can't you tell my hands apart", "which hand was it", "how should I film it": on a take split at middle C, the
# placement line answers it (why no hand is named, and what to film next time)
PLACEMENT_Q = re.compile(r"\btell\b[^?.!]*\bapart\b|\bwhich hand\b|\b(film\w*|camera|framing|framed)\b|"
                         r"\bhow (should|do|can|could) i (record|set up)\b|\b(see|place|find|follow)\b[^?.!]*\bmy hands\b", re.I)


def _placement(res):
    p = res.get("placement") if isinstance(res, dict) else None
    if not isinstance(p, dict):
        a = res.get("analysis") if isinstance(res, dict) else None
        p = a.get("placement") if isinstance(a, dict) else None
    return p if isinstance(p, dict) else None


def _first_look(fr):
    """The framing check's words for what its few frames showed (framing.classify; fr: result.json's "framing"), as
    (the clause after FIRST_LOOK, the tip), or None when there is nothing to say: a silent take whose frames were fine
    (NO_NOTES says what to do). The tip is the filming tip chosen for this take (framing_tip.py: our own words for the
    tip id, framing.TIP_WORDS) when there is one, else the fixed one for what the frames showed."""
    import framing as F
    t = fr.get("tip") if isinstance(fr.get("tip"), dict) else {}
    chosen = F.TIP_WORDS.get(t.get("id")) if isinstance(t.get("id"), str) else None
    if fr.get("verdict") == "no_keyboard":
        return "found no keyboard in them", chosen or PLACE_TIP["keyboard"]
    cause = fr.get("cause")
    if cause == "keyboard":
        return "showed the keyboard in only some of them, and no end of it", chosen or PLACE_TIP["keys"]
    if cause == "notes":
        if not fr.get("notes"):
            return None
        return ("showed no end of the keyboard, and the take had too few notes for the sound to make up for it",
                chosen or PLACE_TIP["notes"])
    return f"showed no end of the keyboard and {F.hands_words(fr)}", chosen or PLACE_TIP["octave"]


def placement_reason(res):
    """Why the hands were not put on the keys (analysis.placement, at res["placement"] or the result's
    analysis.placement): (the reason as a clause, the joint to what follows, the tip for next time or None), or None
    when they were, or when there is nothing to add to what a silent take is told. A result from before the reason was
    recorded gets the old general words and no tip. A take whose framing check chose a filming tip (framing_tip.py,
    result.json framing.tip; with TEACHER_FRAMING=warn the long run went on) gets that tip in our words wherever a tip
    is said, so the line, framing.advice and the page's notice never give two different ones."""
    p = _placement(res)
    if p is None:
        return PLACE_OLD, ", so ", None
    r, why = p.get("reason"), p.get("why")
    if r == "placed":
        return None
    out = _placement_reason(res, p, r, why)
    if out is None or out[2] is None or r == "skipped":    # skipped: _first_look has said the chosen tip already
        return out
    import framing as F
    fr = next((x for x in (p.get("framing"), res.get("framing")) if isinstance(x, dict)), {})
    t = fr.get("tip") if isinstance(fr.get("tip"), dict) else {}
    chosen = F.TIP_WORDS.get(t.get("id")) if isinstance(t.get("id"), str) else None
    return (out[0], out[1], chosen) if chosen else out


def _placement_reason(res, p, r, why):
    """placement_reason's words for each reason, with the fixed tips (PLACE_TIP)."""
    if r == "skipped":                             # the framing check (pipeline.py): the long run never happened
        fr = next((x for x in (p.get("framing"), res.get("framing")) if isinstance(x, dict)), {})   # result.json keeps it apart
        fl = _first_look(dict(fr, verdict=p.get("verdict") or fr.get("verdict")))
        if fl is None:
            return None
        if p.get("verdict") == "no_keyboard":
            return "[private: Museverse teaching text, not in this repository]", "; ", fl[1]
        return "[private: Museverse teaching text, not in this repository]", "; ", fl[1]
    if r == "no_keyboard":
        if why == "fault":                         # our step failed, not the filming: no tip that would send them to film again
            return "[private: Museverse teaching text, not in this repository]", ", so ", None
        if why == "keys":
            return "[private: Museverse teaching text, not in this repository]", ", so ", PLACE_TIP["keyboard"]
        return "[private: Museverse teaching text, not in this repository]", ", so ", PLACE_TIP["keyboard"]
    if r == "no_hands":
        if why == "raised":                        # hands.py: the hand's far end lands well past the keys, which the angle does
            return "[private: Museverse teaching text, not in this repository]", ", so ", PLACE_TIP["keyboard"]
        if why == "edge":
            every = int(p.get("edgeFrames") or 0) >= int(p.get("handFrames") or 0) and not p.get("raisedFrames")
            return ("[private: Museverse teaching text, not in this repository]" + ("whenever I saw them" if every else "most of the time"),
                    ", so ", PLACE_TIP["hands"])
        return "[private: Museverse teaching text, not in this repository]", ", so ", PLACE_TIP["hands"]
    if r == "octave_unknown":
        one = p.get("handsTracked") == 1
        head = "[private: Museverse teaching text, not in this repository]" if one else "[private: Museverse teaching text, not in this repository]"
        # an end the tracker or the first look saw, though too seldom or not agreeing: never "no end was in the picture"
        end = ("[private: Museverse teaching text, not in this repository]" if p.get("endClaims") or p.get("endSeen")
               else "[private: Museverse teaching text, not in this repository]")
        n, heard = int(p.get("bothInViewNotes") or 0), p.get("notesHeard")
        tip = PLACE_TIP["octave"]
        if why == "edge":
            tail = ("both your hands were" if p.get("edgeHands") == 2 else "a hand was") + "[private: Museverse teaching text, not in this repository]"
        elif why == "unclear":
            tail = "[private: Museverse teaching text, not in this repository]"
        elif one:
            tail = "[private: Museverse teaching text, not in this repository]"
        elif heard is not None and n >= int(heard):   # every note had both hands in view: the notes were the limit, not the hands
            if not heard:
                return None                           # a silent take: NO_NOTES says what to do
            tail = "[private: Museverse teaching text, not in this repository]" + ("to tell" if notes_source(res) == "midi" else "for the sound to tell")
            tip = PLACE_TIP["notes"]
        elif n == 0:
            tail = "[private: Museverse teaching text, not in this repository]"
        else:
            tail = "[private: Museverse teaching text, not in this repository]"
        return f"{head}: {end}, and {tail}", ", so ", tip
    return PLACE_OLD, ", so ", None


def framing_advice(fr):
    """result.json framing.advice for a bad first look (framing.classify's no_keyboard or no_octave), whatever was then
    done about it: what the frames showed and what to film next time, never that the rest was skipped (with
    TEACHER_FRAMING=warn it was not). None for any other verdict, and for a silent take whose frames were fine."""
    if not isinstance(fr, dict) or fr.get("verdict") not in ("no_keyboard", "no_octave"):
        return None
    fl = _first_look(fr)
    return f"{FIRST_LOOK} {fl[0]}. {fl[1]}" if fl else None


def placement_line(res, notes=None):
    """The result's videoNote when the hands were not put on the keys, else None: why (placement_reason), how the take
    was judged instead, and what to do next time. notes: how many notes were heard (default: res["notes"])."""
    pr = placement_reason(res)
    if pr is None:
        return None
    why, joint, tip = pr
    n = len(res.get("notes") or []) if notes is None else notes
    hf = res.get("handsFrom") or (res.get("analysis") or {}).get("handsFrom")
    src = "your piano's MIDI" if notes_source(res) == "midi" else "the sound"
    how = (f"I judged it from {src}, with each note's hand taken from the score" if n and hf == "score"
           else f"I judged it from {src} alone, without saying which hand played" if n else None)
    return " ".join(x for x in (f"{why}{joint}{how}." if how else f"{why}.", tip) if x)


def no_hands(res):
    """The answer's start to a question about one hand of a take judged in two parts split at middle C: why no hand
    is named (placement_reason), and what was judged instead."""
    why, joint, _ = placement_reason(res) or (PLACE_OLD, ", so ", None)
    return f"{why}{joint}{NO_HANDS_SPLIT}"


def split_at_middle_c(res):
    """An upload whose hands could not be placed: judged in two parts split at middle C, naming no hand
    (analysis.unname_pitch_hands)."""
    hf = ((res.get("analysis") or {}).get("handsFrom") if isinstance(res.get("analysis"), dict) else None) or res.get("handsFrom") or ""
    return str(hf).startswith("pitch") or any(isinstance(x, dict) and x.get("part") for x in (res.get("findings") or []) + (res.get("strengths") or []))


def _posture_judged(res, hand):
    """Whether this take judges how one hand sits: a demo merged from two single-hand recordings
    says no for a hand ({"L": bool, "R": bool} in analysis.judgedHands.posture, as the demo builder
    writes it, or demo.handsPosture)."""
    def get(d, *keys):
        for k in keys:
            d = d.get(k) if isinstance(d, dict) else None
        return d if isinstance(d, dict) else None
    hp = get(res, "analysis", "judgedHands", "posture") or get(res, "demo", "handsPosture") or get(res, "handsPosture")
    return bool(hp.get(hand, True)) if hp else True


def _unmeasured(res, topic, named):
    """What a question's topic asks about, in words, when this take measured none of it (analysis
    coverage: an item needs enough phrases), else None. A demo that does not judge the hands landing
    together (demo.together, analysis.judgedHands.together: two recordings merged) never counts
    hands_apart as measured. Results without coverage (older ones) say None, as before."""
    if set(topic) & set(SCORE):                   # the notes against a score: judged when a score was compared
        rr = res.get("reference")
        if isinstance(rr, dict) and (rr.get("level") != "note" or score_judged(res)):
            return None
        return "your notes against a score" if not rr else JUDGED["wrong_notes"][1]
    cov = res.get("coverage") or (res.get("analysis") or {}).get("coverage")
    if not isinstance(cov, dict) or not isinstance(cov.get("judged"), list):
        return None
    judged = {}
    for j in cov["judged"]:
        if isinstance(j, dict):
            judged.setdefault(ALIAS.get(j.get("item"), j.get("item")), set()).add(j.get("hand"))
    together = (((res.get("analysis") or {}).get("judgedHands") or {}).get("together"),
                (res.get("demo") or {}).get("together") if isinstance(res.get("demo"), dict) else None)
    if False in together:
        judged.pop("hands_apart", None)
    hand = named[0] if len(named) == 1 else None
    items = list(dict.fromkeys(ALIAS.get(i, i) for i in topic))
    if any(i in judged and (hand is None or judged[i] & {hand, None}) for i in items):
        return None
    one, both = next((JUDGED[i] for i in items if i in JUDGED), (None, None))
    if not one:
        return None
    return one.format(h=HAND[hand]) if hand and "{h}" in one else both


def fingering_stage(res):
    """The fingering read's stage on this take: "none" (no block, or a failed gate), "shown", "tip" or "spoken"."""
    b = res.get("fingering") if isinstance(res.get("fingering"), dict) else {}
    return b.get("stage") if b.get("stage") in ("shown", "tip", "spoken") else "none"


def _fingering_content(res):
    """Whether anything said about this take comes from its fingering read: a fingering finding or strength."""
    return any(isinstance(x, dict) and x.get("item") in FINGER_ITEMS for x in (res.get("findings") or []) + (res.get("strengths") or []))


def lesson_bar_words(res):
    """"Here is the fingering the lesson shows for bar 1: the right hand thumb, index, middle ..." from the score
    comparison (a flagged bar first, else the first bar the take played with the lesson's fingers: scorealign's
    lessonBar), or "" when the take has no library score with fingering."""
    rr = res.get("reference") if isinstance(res.get("reference"), dict) else None
    if not rr or rr.get("level") != "note":
        return ""
    pieces = {p.get("id"): p for p in rr.get("pieces") or [] if isinstance(p, dict)}
    cand = []
    for b in rr.get("bars") or []:
        fs = {}
        for c in b.get("notes") or []:
            if c.get("finger") and c.get("hand") in ("L", "R") and c.get("judged", True):
                fs.setdefault(c["hand"], []).append(int(c["finger"]))
        if fs:
            cand.append((b.get("bar"), fs, b.get("piece")))
    for pid, p in pieces.items():
        lb = p.get("lessonBar")
        if p.get("located") and isinstance(lb, dict) and lb.get("fingers"):
            cand.append((lb.get("bar"), lb["fingers"], pid))
    if not cand:
        return ""
    bar, fs, pid = cand[0]
    where = bar_said(bar) if (pieces.get(pid) or {}).get("barNumbers") and bar is not None else "the first bar you played"
    parts = []
    for h in ("R", "L"):
        seq = fs.get(h) or []
        if seq:
            parts.append(f"the {HAND[h]} hand {', '.join(SHORT_FINGER.get(int(f), '?') for f in seq[:8])}{' and on' if len(seq) > 8 else ''}")
    return f"Here is the fingering the lesson shows for {where}: {' and '.join(parts)}." if parts else ""


def finger_shown_words(res):
    """FINGER_SHOWN; on a professional's take FINGER_SUREST (a digit only where the read was surest, a "?" on the other
    read notes); and at "shown" the hand whose fingers are not on the replay (it failed GQ-cov: the replay draws
    neither a finger nor a question mark on its notes, stage-hands.js fingerDisplay), so the answer never says the
    replay shows what it does not."""
    b = res.get("fingering") if isinstance(res.get("fingering"), dict) else {}
    d = b.get("display") if isinstance(b.get("display"), dict) else {}
    shown = d.get("hands") or {}
    base = f"{FINGER_SHOWN} {FINGER_SUREST}" if d.get("professional") is True else FINGER_SHOWN
    off = [HAND[h] for h in ("L", "R") if not shown.get(h)]
    if len(off) == 1:
        return f"{base} Your {off[0]} hand's fingers are not on the replay: I couldn't read them often enough in this take."
    return base


def fingering_answer(res, quest):
    """"Is my fingering ok?" below stage "tip": the replay's fingers at "shown", else why it is not judged; for a
    library piece also the fingering the lesson shows for a bar (2.3)."""
    if fingering_stage(res) == "shown":
        base = finger_shown_words(res)
    elif quest:
        b = res.get("fingering") if isinstance(res.get("fingering"), dict) else {}
        rs = [r for r in b.get("reasons") or [] if isinstance(r, str)]
        # the first reason only, in its spoken words (the limits list them all); one with no spoken words is not said
        why = SPOKEN_REASON.get(rs[0]) if rs else None
        base = "I can't judge which finger played each note from this recording" + (f": {why}." if why else ".")
    else:
        base = ("I can't judge which finger played each note from this video: I can see where each hand is on the keys "
                "and hear the notes, but not which finger went down.")
    bar = lesson_bar_words(res)
    if bar and len(f"{base} {bar}".split()) > FINGER_ANSWER_WORDS:
        bar = ""
    return " ".join(p for p in (base, bar) if p)


def _fingering_topic(res, fs, named):
    """From stage "tip": the question goes to the fingering findings (the named hand's first), else the praise a
    fingering strength gives, else NO_FINGER_HABIT when fingering was judged (never "your fingering is fine"), else
    FINGER_NOT_READ. The hands the take does not judge are said."""
    hit = [f for f in fs if f.get("item") in FINGER_ITEMS]
    if len(named) == 1:
        hit.sort(key=lambda f: f.get("hand") not in (None, named[0]))
    if hit:                                       # final: a model could drop the hedge ("from what I could see")
        return f"{hit[0]['say']} {hit[0]['tip']}", [hit[0]["id"]], "fingering"
    b = res.get("fingering") if isinstance(res.get("fingering"), dict) else {}
    shown = (b.get("display") or {}).get("hands") or {}
    off = [HAND[h] for h in ("L", "R") if not shown.get(h)]
    tail = f" Your {' and '.join(off)} hand's fingers could not be read often enough in this take to judge." if off and len(off) < 2 else ""
    good = [g for g in res.get("strengths") or [] if g.get("item") in FINGER_ITEMS and (len(named) != 1 or g.get("hand") == named[0])]
    if good:
        return " ".join([good[0].get("say") or praise(good[0])["say"]]) + tail, [], "fingering"
    cov = res.get("coverage") or (res.get("analysis") or {}).get("coverage") or {}
    judged = [j for j in cov.get("judged") or [] if isinstance(j, dict) and j.get("item") in FINGER_ITEMS
              and (len(named) != 1 or j.get("hand") == named[0])]
    if judged:
        return NO_FINGER_HABIT + tail, [], "fingering"
    return FINGER_NOT_READ, [], "not judged"


# a hand is named only with a body word ("my right wrist", "left-hand runs", "the right side"): "the right fingers",
# "is it right" mean correct, not the right hand
HAND_NAMED = {h: re.compile(rf"\b{HAND[h]}(?:[- ]?(?:hands?|wrists?|thumbs?|arms?|side|little fingers?|pink(?:y|ie)s?|fifth fingers?)\b)", re.I)
              for h in ("L", "R")}


def named_hands(ql):
    """The hands a question names: ["L"], ["R"], both or none."""
    return [h for h in ("L", "R") if HAND_NAMED[h].search(ql)]


def _fixed(res, q):
    """The fixed answer, the findings it is about, and why it is final, said as it is and never
    sent to a model: "pain", "window" (which part of a long video was looked at), "not judged",
    "no notes", "too short", "nothing judged", or None."""
    ql = q.lower()
    fs = said_findings(res)                       # never an octave run lane L1 did not report
    quest = _quest(res)
    short = not_judged(res)
    if PAIN.search(ql):
        return PAIN_ANSWER, [], "pain"
    w = None if quest else take_window(res)
    if w and WHICH_PART.search(ql):
        return (w.get("say") or w.get("replay") or "[private: Museverse teaching text, not in this repository]"), [], "window"
    asked = [what for r, what in (NOT_JUDGED_QUEST if quest else NOT_JUDGED) if r.search(ql)]
    fstage = fingering_stage(res)
    judged_fingering = fstage in ("tip", "spoken")
    if FINGER_WHAT in asked and judged_fingering:     # judged from "tip": routed with the topics below
        asked = [w for w in asked if w != FINGER_WHAT]
    if FINGER_WHAT in asked:
        rest = [w for w in asked if w != FINGER_WHAT]
        if not rest:
            return fingering_answer(res, quest), [], "not judged"
        if quest and fstage == "shown":
            what = rest[0] if len(rest) == 1 else ", ".join(rest[:-1]) + " or " + rest[-1]
            return "[private: Museverse teaching text, not in this repository]", [], "not judged"
    if asked:
        what = asked[0] if len(asked) == 1 else ", ".join(asked[:-1]) + " or " + asked[-1]
        if quest and judged_fingering:
            return ("[private: Museverse teaching text, not in this repository]"), [], "not judged"
        if quest:
            return ("[private: Museverse teaching text, not in this repository]"), [], "not judged"
        return ("[private: Museverse teaching text, not in this repository]"), [], "not judged"
    if short == "no notes":                       # anything found against a score is from no sound at all
        return SHORT_ANSWER[short], [], short
    pc = res.get("proCompare") if isinstance(res.get("proCompare"), dict) else None
    if pc and REFERENCE_Q.search(ql):                 # "how did I compare with the reference recording?": its own words
        return reference_answer(pc), [f["id"] for f in fs if f.get("item") in REF_ITEMS][:2], None
    cmp = compare_block(res)
    bars_q = asked_bars(ql)
    if cmp and (COMPARE_Q.search(ql) or bars_q):      # "what about bar 11?" on a re-take: its row in the comparison
        return compare_answer(cmp, ql), [], None      # a model may answer it from the compare lookup instead
    if not quest and PLACEMENT_Q.search(ql) and split_at_middle_c(res):   # "why can't you tell my hands apart", "how should I film"
        # what else it asks about ("which hand was uneven"): why no hand is named, then the part's finding
        about = next((items for r, items in TOPICS if r.search(PLACEMENT_Q.sub(" ", ql))), None)
        hit = [f for f in fs if about and f.get("item") in about]
        if hit:
            return f"{no_hands(res)} {_said(hit[0], 'say')}", [hit[0]["id"]], "not judged"
        line = placement_line(res)
        if line:
            return line, [], "not judged"
    topic = next((items for r, items in TOPICS if r.search(ql)), None)
    named = named_hands(ql)
    if topic is FINGER_ITEMS:                       # a thumb or fingering question the not-judged list did not answer
        if not judged_fingering:
            return fingering_answer(res, quest), [], "not judged"
        return _fingering_topic(res, fs, named)
    if named and not quest and split_at_middle_c(res):    # "my left hand": no hand was seen, so none is named
        hit = [f for f in fs if topic and f.get("item") in topic]
        return (f"{no_hands(res)} {_said(hit[0], 'say')}" if hit else no_hands(res)), [hit[0]["id"]] if hit else [], "not judged"
    if topic and len(named) == 1 and set(topic) & set(POSTURE) and not _posture_judged(res, named[0]):
        return "[private: Museverse teaching text, not in this repository]", [], "not judged"
    hit = [f for f in fs if topic and f.get("item") in topic]
    if bars_q and (topic is None or set(topic) & set(SCORE)):
        # "was bar 3 ok?": a score finding about that bar, else what the comparison says of it, never another bar's finding
        on = [f for f in hit if f.get("item") in SCORE and set(bar_numbers(f)) & bars_q]
        line = None if on else bar_answer(res, bars_q)
        if line:
            return line, [], None
        hit.sort(key=lambda f: f not in on)
    if len(named) == 1:                           # "my left wrist": that hand's finding first
        hit.sort(key=lambda f: f.get("hand") not in (None, named[0]))
    if hit:
        return f"{_said(hit[0], 'say')} {_said(hit[0], 'tip')}", [hit[0]["id"]], None
    if fs and FIX.search(ql) and not topic:
        f = fs[0]
        steps = (f.get("practise") or _said(f, "practise") or [_said(f, "tip")])[:2]
        title = (f.get("title") or _said(f, "title") or "it").lower()
        return " ".join([f"For {title}: {steps[0]}"] + ([f"Then: {steps[1]}"] if len(steps) > 1 else [])), [f["id"]], None
    if fs and (FOCUS.search(ql) or (FOCUS_WEAK.search(ql) and not topic)):
        f = fs[0]
        return (f"Start with this one: {_said(f, 'say')} {_said(f, 'tip')}"
                f"{NOTHING_TOO if short == 'nothing judged' else SHORT_TOO if short else ''}"), [f["id"]], None
    # nothing judged in a take with enough playing: a question about one thing goes on to say why that one was not judged
    if short and (short != "nothing judged" or not topic):
        if cmp and short == "too short":          # a short re-take, as it was asked for: what changed, in the plan's own words
            import practice_plan as PP
            # a question about one thing ("how were my chords?"): that finding's row in the comparison, when it has one
            rows = [r for r in cmp.get("findings") or [] if topic and r.get("item") in topic
                    and (len(named) != 1 or r.get("hand") in (None, named[0]))]
            lead = [compare_answer(cmp, ql)] if rows else (PP.progress(cmp) or [compare_answer(cmp, "")])
            return " ".join(lead + [RETAKE_TECHNIQUE]), [], short
        return SHORT_ANSWER[short], [], short
    if topic:
        good = sorted((g for g in res.get("strengths", []) if g["item"] in topic and (g.get("say") or praised(g))), key=lambda g: topic.index(g["item"]))
        if good:
            return good[0].get("say") or praise(good[0])["say"], [], None
        said = [SPOKEN_LINE.get(x, x) for x in input_limits(res, topic)]   # what this input cannot judge, and why (A14), never
        if said:                                                             # "did not stand out"; in its spoken words
            if topic == ("uneven_run",) and not RUNS_WORD.search(ql):
                said = ["[private: Museverse teaching text, not in this repository]"] + said
            return " ".join(said), [], "not judged"
        what = _unmeasured(res, topic, named)
        if what:                                  # "did not stand out" would claim it was judged
            line = "[private: Museverse teaching text, not in this repository]"
            if topic == ("uneven_run",) and not RUNS_WORD.search(ql):   # "how is my tempo?": no overall tempo is measured
                line = ("[private: Museverse teaching text, not in this repository]")
            caveat = (res.get("demo") or {}).get("caveat") if isinstance(res.get("demo"), dict) else None
            return " ".join(p for p in (line, caveat) if p), [], "not judged"
        if set(topic) & set(SCORE) and notes_source(res) == "sound" and score_judged(res):
            # from the sound only large differences from the score are caught (REF_MIN), so "nothing stood out" says so
            return "[private: Museverse teaching text, not in this repository]", [], None
        if short == "nothing judged":              # nothing was judged, so nothing "did not stand out"
            return SHORT_ANSWER[short], [], short
        if topic == ("uneven_run",) and not RUNS_WORD.search(ql):
            # "how is my tempo?" on a take whose runs were judged: "that did not stand out" alone would say the tempo was
            return ("[private: Museverse teaching text, not in this repository]"), [], None
        return "[private: Museverse teaching text, not in this repository]", [], None
    if re.search("[private: Museverse teaching text, not in this repository]", ql):
        good = [g.get("say") or praise(g)["say"] for g in [g for g in res.get("strengths") or [] if g.get("say") or praised(g)][:3]]
        if fs and re.search(r"\bhow did i\b", ql):   # "how did I do?": what went well, then the main finding and what to do
            f = fs[0]
            return " ".join(good[:2] + ["[private: Museverse teaching text, not in this repository]"]), [f["id"]], None
        if good:                                  # what went well, in the words of its strengths
            return " ".join(good), [], None
        return res["summary"]["say"], [], None
    if fs:
        names = ", ".join((f.get("title") or _said(f, "title")).lower() for f in fs[:3])
        return "[private: Museverse teaching text, not in this repository]", [], None
    return "[private: Museverse teaching text, not in this repository]", [], None


# a question about what changed since the first take ("did bar 9 improve?", "is bar 9 better?", "did I fix bar 9?", "is
# the slip in bar 9 gone?", "how is bar 9 now?", "what changed?", "compared with my last take"): answered from the
# comparison (compare.py), and asked only of a take that has one; "how can I get better", "is it better to play it
# slowly" ask for no change
_BETTER_Q = r"(?:improv\w*|better|worse|cleaner|steadier|smoother|gone|fixed|clean|any good)(?!\s+(?:to|if|when|way|ways|for|with|at)\b)"
COMPARE_Q = re.compile(rf"\b(did|has|have|was|were|is|are|am)\b[^?.!]*\b{_BETTER_Q}"
                       r"|\b(did|has|have)\b[^?.!]*\b(?:chang\w*|fix\w*)|\bwhat(?:'s| has| have)?\s+(?:\w+\s+)?chang\w*|\bany (?:change|difference)\b"
                       r"|\bhow\s+(?:is|are|was|did|does)\b[^?.!]*\bnow\b"
                       r"|\b(?:am|is|are)\b[^?.!]*\b(?:getting (?:better|worse)|improving|still there)\b"
                       r"|\b(?:first|last|other|earlier|previous|old|second|new)\s+(?:take|video|try|recording)\b|\bbefore and after\b"
                       r"|\bprogress\b|\bre-?take\b|\bcompar\w*\s+(?:\w+\s+){0,3}?(?:take|video|try|time|recording|first|last|before)\b"
                       r"|\bthan\s+(?:last time|before|my first|the first|my last|the last|earlier)\b|\bsince (?:last time|before|my first)\b", re.I)


def compare_block(res):
    """The comparison with the first take a re-take carries (server.py's res["compare"]), or None: none attached, or one
    withheld from this route (compare_for)."""
    c = res.get("compare")
    return c if isinstance(c, dict) and not c.get("withheld") and isinstance(c.get("bars"), list) else None


def asked_bars(ql):
    """The bar numbers a question names: "bar 12", "bars 3 and 7", "bar three", "the third bar", and "the pickup" (bar 0,
    as every line here says it)."""
    asked = {int(x) for m in BAR_WORDS.finditer(ql) for x in re.findall(r"\d+", m.group(0))}
    if PICKUP_SAID.search(ql):
        asked.add(0)
    return asked | {v for m in BAR_IN_WORDS.finditer(ql) for v in [_said_value(m.group(1) or m.group(2))] if v is not None}


PICKUP_SAID = re.compile(r"\bthe pick-?up\b", re.I)


def bar_answer(res, asked):
    """A question about bars no score finding names ("was bar 3 ok?"), answered from the score comparison bar by bar
    (reference.barStats): each bar asked about matched the score, had slips too few to be a finding, or is not in the part
    of the score the take covers. None when the take's bars cannot be named (no score compared note by note, a score with
    no bar numbers, or one made from the take itself, which matches by construction)."""
    import compare as C
    stats = C.bar_stats(res)
    pieces = [p for p in ((res.get("reference") or {}).get("pieces") or []) if isinstance(p, dict) and p.get("located")]
    if not stats or not C.bar_numbers_on(res) or any(p.get("sameNotesAs") for p in pieces):
        return None
    rows = list(stats.values())
    out = []
    for n in sorted(asked)[:3]:
        bs = [b for b in rows if b["bar"] == n]
        if not bs:
            continue
        slips = sum(int(b.get("wrong") or 0) + int(b.get("missed") or 0) for b in bs)
        if exact_notes(res):                       # a video's added notes are the transcriber's as often as not
            slips += sum(int(b.get("extra") or 0) for b in bs)
        head = _upper_first(bar_said(n))             # bar 0 is "The pickup"
        if not slips:
            out.append("[private: Museverse teaching text, not in this repository]")
        else:
            # in words, never a count (the learner hears bars, notes and beats, never how many)
            out.append("[private: Museverse teaching text, not in this repository]"
                       + ("" if exact_notes(res) else "[private: Museverse teaching text, not in this repository]"))
    gone = sorted(n for n in asked if not any(b["bar"] == n for b in rows))
    if gone:
        out.append("[private: Museverse teaching text, not in this repository]")
    return " ".join(out) or None


def compare_answer(cmp, ql):
    """The comparison's own words for a question about what changed: the bar asked about (its row), else the finding asked
    about (by its topic, and its hand when one is named), else the summary. A bar asked about that both takes did not
    play is not said back: which bars were compared is."""
    import compare as C
    bars = cmp.get("bars") or []
    asked = asked_bars(ql)
    if asked:
        rows = [b for b in bars if b["bar"] in asked]
        if rows:
            return " ".join(C.row_say(b, bars) for b in rows[:3])
        return (f"I compared {C.bars_span(bars)} with your first take; the bar you asked about is not among them." if bars
                else (cmp.get("summary") or {}).get("say") or "I could not compare any bar of this take with your first one.")
    topic = next((items for r, items in TOPICS if r.search(ql) and items is not FINGER_ITEMS), None)
    named = named_hands(ql)
    if topic:
        rows = [r for r in cmp.get("findings") or [] if r["item"] in topic and (len(named) != 1 or r.get("hand") in (None, named[0]))]
        if rows:
            return " ".join(C.finding_say(r) for r in rows[:2])
    return (cmp.get("summary") or {}).get("say") or "I could not compare this take with your first one."


@on_clip
def _fixed_answer(res, q):
    answer, ids, _ = _fixed(res, q)
    return answer, ids


# ---------------------------------------------------------------- the conversation

SYSTEM_CHAT = "[private: Museverse teaching text, not in this repository]"
SCHEMA_CHAT = {"type": "object", "properties": {"answer": {"type": "string"}, "findingIds": {"type": "array", "items": {"type": "string"}}},
               "required": ["answer", "findingIds"]}
HISTORY_TURNS, HISTORY_CHARS = 8, 4000
TAKE_UPLOAD = "A video the player uploaded: where each hand was over the keys comes from the picture, the notes from the sound."
TAKE_UPLOAD_MIDI = ("A video the player uploaded with the MIDI their digital piano recorded while they filmed: where each hand was "
                    "over the keys comes from the picture, the notes from the piano's own MIDI, lined up with the video.")
RETAKE_HINT = ("This take films part of an earlier take of the player's again. The compare lookup says, from the measurements, "
               "what got better, stayed about the same or got worse, bar by bar and finding by finding: say a change only as it does.")
# compare_for kept the comparison from this route: the take is still a re-take, and the model says it cannot compare
RETAKE_WITHHELD = ("This take films part of an earlier take of the player's again, but the comparison with that take cannot be "
                   "shown here. If asked what changed, say you cannot compare the two takes here; never judge a change yourself.")
TAKE_QUEST = "A recording made in the Museverse Quest app: the headset followed both hands over the keys, and the piano sent the notes."


def stt_terms(res):
    """The words a spoken question about this take is likely to use, to bias Meta's Voice Transcribe toward them
    (meta_api.stt_keywords caps the list): the piece's title (a library piece's, a demo's or a sample's own words; never
    the title of a player's own score file, which is their file name), each finding's title, the note names its notes
    name ("D sharp", "E": the notes played different, as written and as played, and the notes missed, in its bars), "bar"
    and each bar number present ("bar 9"), "left hand" and "right hand". In that order, each once. Only what the
    take's own result says: the server sends them only for a take whose analysis may go to Meta (hosted_allowed)."""
    out = []

    def add(t):
        t = " ".join(str(t or "").split())
        if t and t.lower() not in {x.lower() for x in out}:
            out.append(t)
    demo = res.get("demo") if isinstance(res.get("demo"), dict) else {}
    sample = res.get("sample") if isinstance(res.get("sample"), dict) else {}
    rr = res.get("reference") if isinstance(res.get("reference"), dict) else {}
    for t in (demo.get("piece"), demo.get("title"), sample.get("piece")):
        add(t)
    for p in rr.get("pieces") or []:
        if isinstance(p, dict) and p.get("located") and p.get("id"):
            add(p.get("title"))
    fs = said_findings(res)
    for f in fs:
        add(f.get("title") or (LINES.get(ALIAS.get(f.get("item"), f.get("item"))) or {}).get("title"))
    classes = []
    for f in fs:
        if f.get("item") not in SCORE:
            continue
        for x in f.get("slips") or []:
            if isinstance(x, dict):
                classes += [x.get("played"), x.get("expected")]
        named = set(bar_numbers(f))
        for key, cols in (("wrong", (2, 1)), ("missed", (1,))):
            bar_col = 3 if key == "wrong" else 2
            for r in rr.get(key) or []:
                if isinstance(r, list) and len(r) > bar_col and r[bar_col] in named:
                    classes += [r[c] for c in cols]
    for c in classes:
        if isinstance(c, int) and not isinstance(c, bool):
            add(CLASS_WORDS[c % 12])
    bars = sorted({n for f in fs for n in bar_numbers(f)})
    if bars:
        add("bar")
        for n in bars:
            add(bar_said(n))
    add("left hand")
    add("right hand")
    return out


def history_window(history):
    """The conversation so far as (role, text) for the model: "user" and "teacher" turns only
    (teacher becomes "assistant"), the last HISTORY_TURNS of them, the oldest dropped until they
    hold HISTORY_CHARS characters or fewer, starting with the player, one role after the other."""
    turns = []
    for h in history if isinstance(history, list) else []:
        if not isinstance(h, dict):
            continue
        role = {"user": "user", "teacher": "assistant"}.get(h.get("role"))
        text = clean(h.get("text") if isinstance(h.get("text"), str) else "")[:HISTORY_CHARS]
        if role and text:
            turns.append((role, text))
    turns = turns[-HISTORY_TURNS:]
    while turns and sum(len(t) for _, t in turns) > HISTORY_CHARS:
        turns.pop(0)
    while turns and turns[0][0] != "user":
        turns.pop(0)
    out = []
    for role, text in turns:                      # two turns of one role in a row (an answer that failed): one turn
        if out and out[-1][0] == role:
            out[-1] = (role, out[-1][1] + "\n" + text)
        else:
            out.append((role, text))
    return out


def hosted_turns(turns):
    """history_window's turns as the hosted API gets them: a teacher turn holding a fixed fingering answer (any of
    FINGER_READ_MARKS) becomes FINGER_GENERIC, so nothing the take's fingering read found reaches Meta through the
    conversation either (DDUP 11A; context(hosted=True) keeps it out of the developer message)."""
    return [(r, FINGER_GENERIC if r == "assistant" and any(m in t for m in FINGER_READ_MARKS) else t) for r, t in turns]


@on_clip
def context(res, hosted=False):
    """What the model knows about the take, built from the result alone, so the developer message
    is byte-identical on every turn (the prompt cache keeps it). hosted: for Meta's hosted API, where
    nothing calculated from a Quest take's fingering read may go (DDUP 11A; _backend already keeps any
    take with a fingering finding or strength away): the limits' fingering line is the generic one,
    with no stage and no reasons, and notJudged is the stage-free list."""
    quest = _quest(res)
    demo = res.get("demo") if isinstance(res.get("demo"), dict) else {}
    st = _stats(res)
    fs = []
    pc = reference_block(res, hosted)
    for f in said_findings(res):                   # never an octave run lane L1 did not report
        if f.get("item") in REF_ITEMS and not pc:
            continue                               # a route the reference's consent does not reach: only the fixed answers say it
        a = fixed_finding(f) if f.get("item") in LINES or f.get("item") in ALIAS else {}
        fs.append({k: v for k, v in dict(
            id=f["id"], title=f.get("title") or a.get("title"), kind=f.get("kind"), confidence=f.get("confidence"),
            hand=HAND.get(f.get("hand")), part=PART_WORDS.get(f.get("part")),
            lead=lead_hand(f) if f.get("item") == "hands_apart" else None, when=when_phrase(f),
            what=f.get("what") or f.get("say") or a.get("what"), why=f.get("why") or a.get("why"),
            practise=f.get("practise") or a.get("practise") or ([f["tip"]] if f.get("tip") else None),
            check=f.get("check") or a.get("check"), fine=f.get("fine") or a.get("fine")).items() if v is not None})
    ctx = dict(
        take=TAKE_QUEST if quest else TAKE_UPLOAD_MIDI if notes_source(res) == "midi" else TAKE_UPLOAD,
        piece=demo.get("piece") or demo.get("title"),
        caveat=demo.get("caveat"),
        length=mmss(st["durationS"]) if st.get("durationS") is not None else None,
        summary=fixed_summary(res, hosted=True) if ref_hidden(res, hosted) else (res.get("summary") or {}).get("say"),
        findings=fs,
        strengths=[{k: v for k, v in dict(title=g.get("title") or praise(g)["title"], say=g.get("say") or praise(g)["say"],
                                          confidence=g.get("confidence")).items() if v is not None} for g in res.get("strengths") or []],
        limits=list(res.get("limits") or stage_limits(res, QUEST_LIMITS if quest else LIMITS)),
        notJudged=not_judged_words(res, quest),
        # a re-take (server.py attaches its comparison; compare_for keeps it from a route the first take did not agree to):
        # only the compare lookup says what changed
        retake=(RETAKE_HINT if compare_block(res) else RETAKE_WITHHELD if isinstance(res.get("compare"), dict) else None) if hosted else None,
        # the comparison with a reference recording, in its fixed words only (never a number or note of the reference's),
        # and only for a route its pianist's consent reaches (reference_block)
        reference=reference_context(pc) if pc else None)
    if hosted and isinstance(res.get("fingering"), dict):
        base = QUEST_LIMITS if quest else LIMITS
        lim = [x for x in ctx["limits"] if not _fingering_limit(x)]
        ctx["limits"] = [base[0]] + lim
        ctx["notJudged"] = list(NOT_JUDGED_QUEST_WORDS if quest else NOT_JUDGED_WORDS)
    return {k: v for k, v in ctx.items() if v not in (None, "", [])}


def reference_context(pc):
    """A block as the model's context gives it: the rows' fixed words by bar, the tempo and steady-speed lines, what was
    not compared. Nothing of the reference's own."""
    if not pc.get("compared"):
        return dict(comparedWith="the reference recording of this piece", compared=False,
                    notCompared=[x.get("say") for x in pc.get("notCompared") or [] if isinstance(x, dict)])
    rows = []
    for r in pc.get("rows") or []:
        w = r.get("say") or {}
        rows.append({k: v for k, v in dict(kind="reference", bars=[b.get("bar") for b in r.get("bars") or []], item=r.get("item"), verdict=r.get("verdict"),
                                            what=w.get("what"), reference=w.get("reference"), step=w.get("step")).items() if v})
    return dict(comparedWith="the reference recording of this piece", tempo=(pc.get("tempo") or {}).get("say"), rows=rows,
                notCompared=[x.get("say") for x in (pc.get("aspects") or {}).get("notCompared") or [] if isinstance(x, dict)],
                how="a remark only where this take's own timing breaks and the reference recording goes on wherever that music recurs")


# the one exception to "never with other people" (the procompare design, 6; D1), added to the prompt only for a take whose
# context carries a comparison with a reference recording
REFERENCE_RULE = ("[private: Museverse teaching text, not in this repository]")


def system_for(system, ctx):
    """The prompt with REFERENCE_RULE when the context carries a comparison with a reference recording."""
    return system + REFERENCE_RULE if isinstance(ctx, dict) and ctx.get("reference") else system


def reference_answer(pc):
    """The fixed answer to a question about the reference recording: the rows' own words (the first two remarks, or the
    tempo and that nothing else was remarked), or why it was not compared."""
    if not pc.get("compared"):
        nc = [x.get("say") for x in pc.get("notCompared") or [] if isinstance(x, dict) and x.get("say")]
        return nc[0] if nc else "This take was not compared with the reference recording."
    said = []
    for r in pc.get("rows") or []:
        w = r.get("say") or {}
        if r.get("verdict") == "differs":
            said.append(f"{w.get('what')} {w.get('reference')}")
        if len(said) == 2:
            break
    if not said:
        said = [(pc.get("tempo") or {}).get("say") or "", "Where this take's timing was compared with the reference recording, "
                "I found nothing to remark on."]
    return " ".join(x for x in said if x).strip()


REFERENCE_Q = re.compile(r"\breference\b|\b(?:the|your|our|that) pianist\b|\bprofessional\w*\b", re.I)


# the limits lines written from a fingering read (fingering/quest.py limits_line, fingering/phone.py, the defaults'
# first line): the hosted context drops them for the generic one
FINGER_LIMIT_RE = re.compile(r"^(Which finger played each note|Fingers are shown on the replay|Fingering habits are judged)", re.I)


def _fingering_limit(line):
    return isinstance(line, str) and bool(FINGER_LIMIT_RE.match(line))


def stage_limits(res, base):
    """The default limits with the fingering line of this take's stage first (2.3): a result normally carries its own
    limits (the builder and the pipeline write them per stage)."""
    out = list(base)
    if fingering_stage(res) == "shown":
        out[0] = "Fingers are shown on the replay as the hand tracking read them; fingering is not judged yet."
    elif fingering_stage(res) in ("tip", "spoken"):
        out[0] = FINGER_TIP_LIMIT
    return out


def not_judged_words(res, quest):
    """What the take cannot judge, for the model: fingering leaves the list from stage "tip"."""
    words = NOT_JUDGED_QUEST_WORDS if quest else NOT_JUDGED_WORDS
    if fingering_stage(res) in ("tip", "spoken"):
        words = [w for w in words if w != FINGER_WHAT]
    return list(words)


# an answer saying the fingering is fine, good or right (only a fingering strength may)
FINGER_FINE = re.compile(r"\bfinger(ing|s)?\b[^.?!]{0,60}\b(fine|good|great|right|correct|ok|okay|perfect|solid|nice\w*|well)\b|"
                         r"\b(fine|good|great|correct|perfect|solid|nice)\b[^.?!]{0,30}\bfinger(ing|s)\b", re.I)


def _times(res):
    """The times the context gives, as an answer may say them."""
    out = set()
    for f in said_findings(res):
        if isinstance(f.get("fromS"), (int, float)) and isinstance(f.get("toS"), (int, float)):
            out.update([when(f), clock(f["fromS"]), clock(f["toS"])])
    st = _stats(res)
    if st.get("durationS") is not None:
        out.add(mmss(st["durationS"]))
    out.update(window_times(take_window(res)))     # the part of a long video analysed: the context's limits say it
    return sorted(out, key=len, reverse=True)


# number words an answer from lookups may say when a lookup gave that number ("one" is never an amount here: "this one",
# except before a counted noun: COUNTED)
NUM_WORD = dict(zip(("two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen "
                     "eighteen nineteen twenty").split(), range(2, 21)), twice=2, thrice=3, thirty=30, forty=40, fifty=50, sixty=60,
                seventy=70, eighty=80, ninety=90)
UNIT_WORD = dict(zip("one two three four five six seven eight nine".split(), range(1, 10)))
TENS = "twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety"
ORDINAL_WORD = dict(zip(("first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth "
                         "fifteenth sixteenth seventeenth eighteenth nineteenth twentieth").split(), range(1, 21)))
WORD_SAID = rf"(?:{TENS})[- ](?:{'|'.join(UNIT_WORD)})|one|{'|'.join(NUM_WORD)}"
NUMBER_SAID = rf"\d+|{WORD_SAID}"
COMPOUND_WORDS = re.compile(rf"\b({TENS})[- ]({'|'.join(UNIT_WORD)})\b", re.I)
AMOUNT_WORDS = re.compile(r"\b(" + "|".join(NUM_WORD) + r"|hundreds?|thousands?|dozens?|half(?![- ](speed|tempo|pace)))\b", re.I)
# "twice as uneven", "missed it twice": a ratio or a count of events no lookup gives, so never grounded by a 2 or a 3
# that some lookup returned for something else (check() refuses them in every other line too)
RATIO_WORDS = re.compile(r"\b(twice|thrice)\b", re.I)
MEASURE_WORDS = re.compile(r"\bmeasures?\s+\d+(?:\s*(?:,|and|or|to)\s*\d+)*", re.I)
# a bar said in words: "bar three", "measure twelve", "the third bar"
BAR_IN_WORDS = re.compile(rf"\b(?:bars?|measures?)\s+({WORD_SAID})\b|\b(?:the|that|your)\s+({'|'.join(ORDINAL_WORD)}|\d+(?:st|nd|rd|th))\s+(?:bar|measure)s?\b", re.I)
PITCH_SAID = re.compile(r"\b[A-G](?:#|♯|b|♭)?-?\d\b|\b[A-G] (?:sharp|flat) ?-?\d\b")
MIDDLE_C = re.compile(r"\bmiddle C\b", re.I)
# a note's letter alone: "the D sharp", "played E"; lower case only where it cannot be the article ("an e", "of a g.")
CLASS_SAID = re.compile(r"\b[A-G](?:#|♯|♭)(?![\w#])|\b[A-G]b\b|\b[A-G][ -](?:sharp|flat)\b|"
                        r"\b(?:an?|the|played|play|playing|hit|heard|missed|miss|expected|instead of|not|of|on|to)\s+([A-G]|(?<=an )e|[b-g](?=\s+(?:instead|where|for)\b|\s*[.,;!?]))\b"
                        r"(?![\'’-]|\s+(?:major|minor|hand|section|part|sharp|flat))")
FINDING_ID = re.compile(r"\b[a-z]+(?:_[a-z]+)+(?:-[A-Za-z]+)?-\d+\b")
# a note said with what happened to it ("missed the G3", "added an F#4", "played E4 where the score has D#4", "the D#4
# came out as E4"): it must be a note a lookup returned with that status (teacher_tools.evidence records)
# (the note names are case-sensitive: "missed a chance" names no A)
_P = r"(?:[A-G](?:#|♯|b|♭)?-?\d|[A-G] (?:sharp|flat) ?-?\d|[A-G][ -](?:sharp|flat)\b|[A-G](?:#|♯|♭|b)?(?![\w#]))"
_ART = r"(?:(?i:the|an?|your)\s+)?"
SAID_MISSED = re.compile(rf"\b(?i:missed|didn'?t hear|did not hear|couldn'?t hear|left out|skipped|dropped)\s+{_ART}({_P})")
SAID_ADDED = re.compile(rf"\b(?i:added|an? extra|the extra)\s+{_ART}({_P})")
SAID_FOR = re.compile(rf"\b(?i:played|heard|hit|playing)\s+{_ART}({_P})\s+(?i:where|instead of|for|in place of)\s+"
                      rf"(?:(?i:the score (?:has|had|wrote|writes)|the written|the score's|it says)\s+)?{_ART}({_P})")
SAID_AS = re.compile(rf"({_P})\s+(?i:came out as|was played as|sounded as|became)\s+{_ART}({_P})")
STATUS_SAID = (("missed", SAID_MISSED), ("added", SAID_ADDED))
# what a sentence says happened to its notes, by its words however they are put ("the G5 was missing", "E5 as an extra
# note", "where the score has C5, I heard E5", "I heard E5 around 0:04 where the score has C5"): every note a sentence
# with a slip's words names must be one a lookup returned with that status (the patterns above pair the plain forms; a
# note "as written" in the same sentence may be any note played). Taken in order: "as written" is not "written"
SLIP_CUES = (
    (("as written", "played"), re.compile(r"\b(as written|as the score (?:has|had) it|match(?:ed|es|ing)?)\b", re.I)),
    (("missed",), re.compile(r"\b(miss(?:ed|es|ing)?|skip\w*|left out|leaves? out|leaving out|dropp\w*|"
                             r"(?:didn'?t|did not|couldn'?t|could not) hear)\b", re.I)),
    (("added",), re.compile(r"\b(added|adding|an? additional|extra)\b(?!\s+(?:care|time|attention|practice|minutes?|slowly))", re.I)),
    (("different",), re.compile(r"\b(instead|in place of|rather than|where the score|the score (?:has|had|wrote|writes|says|shows|asks for)|"
                                r"written|came out as|(?:was )?played as|sounded as|became|should (?:have )?been|differ\w*)\b", re.I)),
)
# a count of things: "4 notes", "one slip", "3 of your jumps". It must be a count a lookup gave for that noun (keyed,
# by these fields); a noun no lookup counts (jumps, chords, runs) takes no count at all
COUNTED = {"note": ("notes", "count", "asWritten", "different", "missed", "added", "moreNotes", "matched", "slips"),
           "slip": ("slips", "different", "missed", "added", "count", "moreSlips"),
           "phrase": ("phrases", "of", "phrasesFlagged", "phrasesMeasured"),
           "time": ("timesInPiece",), "jump": (), "leap": (), "chord": (), "run": (), "bar": (), "measure": (), "pass": ()}
_NOUN = r"(notes?|slips?|phrases?|times|jumps?|leaps?|chords?|runs?|bars|measures|pass(?:es)?)"
COUNT_SAID = re.compile(rf"\b({NUMBER_SAID})\s+(?:(?:of\s+)?(?:the|your|my|those|these)\s+)?(?:[\w-]+\s+){{0,2}}?{_NOUN}\b(?!\s+at\s+a\s+time)", re.I)
# an ordinal of a counted thing ("the fourth note", "your 3rd jump"): only a phrase's number or a pass a lookup gave
ORDINAL_SAID = re.compile(rf"\b(?:the|your|my|that)\s+({'|'.join(ORDINAL_WORD)}|\d+(?:st|nd|rd|th))\s+(?:[\w-]+\s+)?"
                          r"(notes?|chords?|jumps?|leaps?|slips?|runs?|phrases?|time|pass|exercises?)\b", re.I)


def _said_value(w):
    """A number as said ("4", "four", "twenty-five", "third", "3rd") as an int, or None."""
    w = w.strip().lower()
    if re.fullmatch(r"\d+", w):
        return int(w)
    m = re.fullmatch(r"(\d+)(?:st|nd|rd|th)", w) or COMPOUND_WORDS.fullmatch(w)
    if m and m.re is COMPOUND_WORDS:
        return NUM_WORD[m.group(1)] + UNIT_WORD[m.group(2)]
    if m:
        return int(m.group(1))
    return dict(NUM_WORD, one=1, **ORDINAL_WORD).get(w)


def _pitch_said(name):
    """A note as said: (MIDI number, or None for a bare class like "D sharp"; its pitch class), or None."""
    import teacher_tools as TT
    n = name.strip().replace("-", " ")
    m = TT.midi_of(n)
    if m is not None:
        return m, m % 12
    c = TT.midi_of(n[:1].upper() + n[1:] + "4") if n else None
    return (None, c % 12) if c is not None else None


def _record_has(ev, status, said, field):
    """Whether a lookup returned a note with this status whose field (pitch, expected, played) is the note said."""
    if not said:
        return False
    full, pc = said
    for r in ev.get("records") or []:
        v = r.get(field)
        if r["status"] == status and v is not None and (v == full if full is not None else v % 12 == pc):
            return True
    return False


def evidence_problems(text, ev):
    """Why an answer written from lookups says something no lookup of that turn (nor the take's context) gave: ev is
    teacher_tools.evidence(...). Every time ("0:12"), bar ("bar 12", "measure 12", "bar three", "the third bar"), note
    ("D#5", "E flat 5", "middle C", "the D sharp"), count and measured number ("68 ms", "three notes") must be one of
    them; a note said with what happened to it (missed, added, played for another) must be one returned with that
    status, and one said in a sentence about a bar must be one of that bar's; a count must be one returned for that
    noun ("4 notes"; jumps and chords are never counted); a finding id is never said; any digit left over (a number
    with letters stuck to it: "80ms", "3x", "2nd") is refused."""
    import teacher_tools as TT
    why = []
    t = text or ""
    texts = " ".join(ev.get("texts") or ()).lower()

    def quoted(s):                                 # the exact words of a returned text (an exercise, a practise step)
        return bool(texts) and s.lower() in texts
    for m in re.finditer(r"\b\d{1,2}:\d{2}(?::\d{2}|\.\d+)+\b", t):
        why.append(f"a time no lookup gave: {m.group(0)}")
    t = re.sub(r"\b\d{1,2}:\d{2}(?::\d{2}|\.\d+)+\b", " ", t)
    for m in TT.TIME_RE.finditer(t):
        if m.group(0) not in ev["times"]:
            why.append(f"a time no lookup gave: {m.group(0)}")
    t = TT.TIME_RE.sub(" ", t)
    # the notes with what happened to them, and the notes of a sentence about a bar, before the bars are taken out
    for status, rx in STATUS_SAID:
        for m in rx.finditer(t):
            said = _pitch_said(m.group(1))
            if not (_record_has(ev, status, said, "pitch") or _record_has(ev, status, said, "expected")):
                why.append(f"a note no lookup gave as {status}: {m.group(1)}")
    for rx, played, written in ((SAID_FOR, 1, 2), (SAID_AS, 2, 1)):
        for m in rx.finditer(t):
            p, w = _pitch_said(m.group(played)), _pitch_said(m.group(written))
            if not any(r["status"] == "different" and p and w and r.get("played") is not None and r.get("expected") is not None
                       and (r["played"] == p[0] if p[0] is not None else r["played"] % 12 == p[1])
                       and (r["expected"] == w[0] if w[0] is not None else r["expected"] % 12 == w[1]) for r in ev.get("records") or []):
                why.append(f"a note no lookup gave as played for another: {m.group(played)} for {m.group(written)}")
    for sentence in re.split(r"(?<=[.!?;])\s+", t):
        statuses, rest = set(), sentence
        for sts, rx in SLIP_CUES:
            if rx.search(rest):
                statuses.update(sts)
                rest = rx.sub(" ", rest)
        if not statuses - {"as written", "played"}:
            continue                               # no slip said: the notes are checked as any note below
        allowed = {v for r in ev.get("records") or [] if r.get("status") in statuses
                   for v in (r.get("pitch"), r.get("expected"), r.get("played")) if v is not None}
        said = [x.group(0) for x in PITCH_SAID.finditer(sentence)] + ["C4" for _ in MIDDLE_C.finditer(sentence)]
        said += [x.group(1) or x.group(0) for x in CLASS_SAID.finditer(MIDDLE_C.sub(" ", PITCH_SAID.sub(" ", sentence)))]
        for name in said:
            ps = _pitch_said(name)
            if ps and not (ps[0] in allowed if ps[0] is not None else ps[1] in {v % 12 for v in allowed}):
                why.append(f"a note no lookup gave as {' or '.join(sorted(statuses - {'played'}))}: {name.strip()}")
    for sentence in re.split(r"(?<=[.!?;])\s+", t):
        bars = {int(x) for m in list(BAR_WORDS.finditer(sentence)) + list(MEASURE_WORDS.finditer(sentence))
                for x in re.findall(r"\d+", m.group(0))}
        bars |= {v for m in BAR_IN_WORDS.finditer(sentence) for v in [_said_value(m.group(1) or m.group(2))] if v is not None}
        if not bars:
            continue
        mine = [r for r in ev.get("records") or [] if r.get("bar") in bars]
        full = {v for r in mine for v in (r.get("pitch"), r.get("expected"), r.get("played")) if v is not None}
        said = [x.group(0) for x in PITCH_SAID.finditer(sentence)] + [x.group(1) or x.group(0) for x in CLASS_SAID.finditer(PITCH_SAID.sub(" ", sentence))]
        for name in said:
            ps = _pitch_said(name)
            if ps and not (ps[0] in full if ps[0] is not None else ps[1] in {v % 12 for v in full}):
                why.append(f"a note no lookup gave in bar {', '.join(map(str, sorted(bars)))}: {name.strip()}")
    for m in BAR_IN_WORDS.finditer(t):
        v = _said_value(m.group(1) or m.group(2))
        if v is None or v not in ev["bars"]:
            why.append(f"a bar no lookup gave: {m.group(0)}")
    t = BAR_IN_WORDS.sub(" ", t)
    for rx in (BAR_WORDS, MEASURE_WORDS):
        for m in rx.finditer(t):
            got = {int(x) for x in re.findall(r"\d+", m.group(0))}
            if not got <= ev["bars"]:
                why.append(f"a bar no lookup gave: {m.group(0)}")
        t = rx.sub(" ", t)
    for m in PITCH_SAID.finditer(t):
        p = TT.midi_of(m.group(0))
        if p is None or p not in ev["pitches"]:
            why.append(f"a note no lookup gave: {m.group(0)}")
    t = PITCH_SAID.sub(" ", t)
    for m in MIDDLE_C.finditer(t):
        if 60 not in ev["pitches"]:
            why.append(f"a note no lookup gave: {m.group(0)}")
    t = MIDDLE_C.sub(" ", t)
    classes = {p % 12 for p in ev["pitches"]}
    for m in CLASS_SAID.finditer(t):
        name = (m.group(1) or m.group(0)).strip().replace("-", " ")
        p = TT.midi_of(name[:1].upper() + name[1:] + "4")
        if p is None or p % 12 not in classes:
            why.append(f"a note no lookup gave: {name}")
    t = CLASS_SAID.sub(" ", t)
    m = FINDING_ID.search(t)
    if m:
        why.append(f"says a finding id: {m.group(0)}")
        t = FINDING_ID.sub(" ", t)
    # counts and ordinals of things, before the bare numbers
    for m in ORDINAL_SAID.finditer(t):
        v, noun = _said_value(m.group(1)), m.group(2).lower().rstrip("s") if m.group(2).lower() != "pass" else "pass"
        ok = (noun == "phrase" and v is not None and str(v) in ev["keyed"].get("phrases", set()) | ev["keyed"].get("number", set())) or \
             (noun in ("time", "pass") and v is not None and (v == 1 or str(v) in ev["keyed"].get("pass", set())))
        if not ok and not quoted(m.group(0)):
            why.append(f"a position no lookup gave: {m.group(0)}")
    t = ORDINAL_SAID.sub(" ", t)
    for m in COUNT_SAID.finditer(t):
        v, noun = _said_value(m.group(1)), m.group(2).lower()
        noun = "pass" if noun.startswith("pass") else "time" if noun == "times" else noun.rstrip("s")
        keys = COUNTED.get(noun, ())
        if quoted(m.group(0)):
            continue
        if v is None or not any(str(v) in ev["keyed"].get(k, set()) for k in keys):
            why.append(f"a count no lookup gave: {m.group(0)}")
    t = COUNT_SAID.sub(" ", t)
    for m in TT.NUMBER_RE.finditer(t):
        n = m.group(0).replace(",", "")
        if n not in ev["numbers"] and str(TT._num(float(n))) not in ev["numbers"]:
            why.append(f"a number no lookup gave: {m.group(0)}")
    t = TT.NUMBER_RE.sub(" ", t)
    m = re.search(r"\S*\d\S*", t)
    if m:                                          # "80ms", "0.08s", "3x", "2nd": a number with letters stuck to it
        why.append(f"a number said with letters stuck to it: {m.group(0)}")
    for m in RATIO_WORDS.finditer(t):
        why.append(f"a ratio or a count in words no lookup gives: {m.group(0)}")
    t = RATIO_WORDS.sub(" ", t)
    for m in COMPOUND_WORDS.finditer(t):
        v = _said_value(m.group(0))
        if str(v) not in ev["numbers"]:
            why.append(f"an amount in words no lookup gave: {m.group(0)}")
    t = COMPOUND_WORDS.sub(" ", t)
    for m in AMOUNT_WORDS.finditer(SAY_ANYWAY.sub(" ", t)):
        n = NUM_WORD.get(m.group(1).lower())
        if n is None or str(n) not in ev["numbers"]:
            why.append(f"an amount in words no lookup gave: {m.group(0)}")
    return why


# an answer from lookups: a measure's unit only when the player asked for an amount (SYSTEM_AGENT), and the hedge where
# what is said is rough or comes from the sound
UNIT_SAID = re.compile(r"%|\b(percent|per cent|percentage|milli\w*|ms|degrees?)\b", re.I)
ASKED_AMOUNT = re.compile(r"\bhow (much|many|late|early|far|long|big|wide|uneven|loud|fast|slow|apart|often|close)\b|\bby how\b|"
                          r"\b(percent\w*|per cent|milli\w*|ms|numbers?|measure(d|ment)?s?|exactly|amount)\b", re.I)
HEARD = re.compile(r"\b(I heard|I didn'?t hear|I did not hear|I couldn'?t hear|from what I could (see|hear|tell)|(it|that|this) "
                   r"(sounded|looked|seemed)|sounded like|looked like|seemed to)\b", re.I)
CERTAIN = re.compile(r"\b(definitely|certainly|for sure|surely|undoubtedly|without (a )?doubt|no doubt)\b", re.I)
# a verdict no measurement gives ("you played it perfectly", "no mistakes"): the findings say what stood out, never that
# nothing could be better (a player who asks for that is asking the model to drop a finding)
FLAWLESS = re.compile(r"\b(perfect\w*|flawless\w*|impeccabl\w*|no mistakes?|no errors?|without (a single |any )?(mistake|error)s?)\b", re.I)


# what changed since another take: "improved", "got better", "is worse now", "the slip in bar 11 is gone", "was clean this
# time", "is about the same as in your first take". Only the comparison says it (compare.py, through the compare lookup);
# a model never decides what improved. A comparative with nothing to say it is about another take ("it is better to play
# it slowly", "less even than usual", "sounds smoother when you relax") is advice, not a change
_MORE = r"(?:much\s+|a\s+lot\s+|a\s+little\s+|a\s+bit\s+|far\s+|clearly\s+|even\s+|slightly\s+|way\s+)?"
_GOOD = r"(?:better|cleaner|clean|steadier|smoother|more even|more together|tighter|neater)"
_BAD = r"(?:worse|messier|less steady|less even|less clean|less together|sloppier|shakier)"
# another take, or this one against it: "than before", "now", "this time", "since your first take"
_THEN = (r"(?:than (?:before|last time|earlier|then|the first (?:time|take|one)|your first(?: take| one| try)?|in your first(?: take| one)?|"
         r"the other (?:take|one|video)|your (?:last|other|earlier|previous) (?:take|one|video|try|recording))|now\b|this time|"
         r"in this (?:take|one|re-?take|video)|since (?:your first take|the first take|your first one|last time|before|then))")
_SAME_AS = r"the same as (?:(?:in |on )?(?:your |the )?(?:first|last|other|earlier|previous) (?:take|one|time|try|video)|before|last time|then)"
CHANGE_SAID = dict(
    better=re.compile(rf"\b(?:improv(?:ed|ing|es)|(?:got|gotten|getting|became|has become|have become)\s+{_MORE}{_GOOD}|"
                      rf"(?:is|are|was|were|sounds?|sounded|looks?|looked|came out|comes out|feels?|felt)\s+(?:now\s+)?{_MORE}{_GOOD}\s+{_THEN}|"
                      rf"{_GOOD}\s+than\s+(?:before|last time|earlier|then|your first|the first|in your first|the other|your (?:last|other|earlier|previous))|"
                      r"(?:is|are|was|were|has been|have been)\s+(?:now\s+)?(?:gone|fixed|sorted(?: out)?|cleaned up|disappeared)|"
                      r"(?:you|you've|you have)\s+(?:now\s+)?(?:fixed|sorted out|cleaned up|got rid of)|no longer|"
                      r"no (?:slips?|mistakes?|errors?)\s+(?:now|this time|any ?more))\b", re.I),
    worse=re.compile(rf"\b(?:(?:got|gotten|getting|became|has become|have become)\s+{_MORE}{_BAD}|"
                     rf"(?:is|are|was|were|sounds?|sounded|looks?|looked|came out|comes out|feels?|felt)\s+(?:now\s+)?{_MORE}{_BAD}\s+{_THEN}|"
                     rf"{_BAD}\s+than\s+(?:before|last time|earlier|then|your first|the first|in your first|the other|your (?:last|other|earlier|previous))|"
                     r"slipped back|went backwards?|(?:has|have|had)\s+come back|crept back)\b", re.I),
    same=re.compile(rf"\b(?:no (?:real )?(?:change|difference)|(?:didn'?t|did not|hasn'?t|has not|haven'?t|have not) (?:improve|change|get (?:any )?(?:better|worse))\w*|"
                    rf"(?:stayed|stays|remained|remains|is still|are still|was still|were still|still)\s+(?:about |roughly |pretty much |much )?the same|"
                    rf"(?:is|are|was|were|sounds?|sounded)\s+(?:about |roughly |pretty much |much )?{_SAME_AS}|"
                    rf"(?:about|roughly) the same\s+{_THEN}|unchanged)\b", re.I),
)
CHANGE_VERDICT = {"better": "better", "worse": "worse", "same": "about the same"}
# a sentence about the two takes: what each measured, to be checked against the comparison's own numbers
_TAKES_SAID = re.compile(r"\b(?:first (?:take|one|try)|re-?take|last time|other take|earlier take|previous take|this time|"
                         r"in this (?:one|take))\b|\bfrom\b[^.;]*\bto\b", re.I)
_FIRST_SIDE = re.compile(r"\b(?:first (?:take|one|try)|before|earlier|last time|other take|previous take|then)\b", re.I)
_NOW_SIDE = re.compile(r"\b(?:now|this time|this one|this take|re-?take|today|in this)\b", re.I)
_QTY = re.compile(rf"\b(?:(?P<n>\d+(?:\.\d+)?)(?:\s*(?P<u>ms|milliseconds?|percent|per cent|%|slips?|mistakes?|errors?|notes?)\b)?|"
                  rf"(?P<w>{WORD_SAID})\s+(?P<wu>ms|milliseconds?|percent|slips?|mistakes?|errors?|notes?)\b|"
                  r"(?P<z>none|no (?:slips?|mistakes?|errors?)|zero (?:slips?|mistakes?|errors?)))", re.I)
_QTY_KEYS = {"slip": ("slips",), "mistake": ("slips",), "error": ("slips",), "note": ("slips", "different", "missed", "added", "notesCompared"),
             "ms": ("offBeatMs",), "millisecond": ("offBeatMs",)}
# what a claim may be about besides a bar: a finding the comparison compared, by its topic (TOPICS) and a hand
_HAND_SAID = re.compile(r"\b(left|right)[- ]hand(?:ed)?\b|\byour (left|right)\b", re.I)
_SCORE_TOPIC = ("wrong_notes", "missed_notes", "extra_notes")
# "bars 9 to 12", "bars 9-12": every bar of the range (BAR_WORDS reads its first number only)
_BAR_RANGE = re.compile(r"\b(?:bars|measures)\s+(\d+)\s*(?:to|-|through)\s*(\d+)\b", re.I)
# the findings a comparison has rows for (compare.py: analysis.ITEMS and the score's; test_compare checks they are the same)
CMP_ITEMS = ("rolled_chords", "hands_apart", "uneven_run", "uneven_touch", "held_open", "late_leap") + _SCORE_TOPIC


def _sides(row, side):
    """The numbers a compare row gave for one take ("first", "re") or both (None): [(key, value)]."""
    out = []
    for sd in (("first", "re") if side is None else (side,)):
        v = row.get(sd)
        if isinstance(v, dict):
            out += [(k, x) for k, x in v.items() if isinstance(x, (int, float)) and not isinstance(x, bool)]
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            out.append((None, v))
    return out


def _qty_value(m):
    if m.group("z"):
        return 0.0, "slip"
    raw, unit = (m.group("n"), m.group("u")) if m.group("n") else (m.group("w"), m.group("wu"))
    v = float(raw) if re.fullmatch(r"\d+(?:\.\d+)?", raw) else _said_value(raw)
    u = (unit or "").lower().rstrip("s")
    return (None if v is None else float(v)), ({"%": "percent", "per cent": "percent"}.get(u, u) or None)


def _number_problems(sentence, rows):
    """A sentence about the two takes saying each take's numbers ("2 slips in your first take and none now", "from 90 ms to
    20 ms"): each number said of one take must be that take's own in a row the sentence is about (rows)."""
    why = []
    masked = sentence
    for rx in (_BAR_RANGE, BAR_WORDS, BAR_IN_WORDS, MEASURE_WORDS, re.compile(r"\b\d{1,2}:\d{2}(?::\d{2}|\.\d+)?\b")):
        masked = rx.sub(lambda m: " " * len(m.group(0)), masked)
    qs = list(_QTY.finditer(masked))
    for j, m in enumerate(qs):
        v, unit = _qty_value(m)
        if v is None:
            continue
        tail = re.split(r",|;|:|\band\b|\bbut\b", masked[m.end():(qs[j + 1].start() if j + 1 < len(qs) else len(masked))])[0]
        side = "first" if _FIRST_SIDE.search(tail) else "re" if _NOW_SIDE.search(tail) else None
        if side is None and re.search(r"\bfrom\s*$", masked[:m.start()]):
            side = "first"
        elif side is None and j and re.search(r"\bto\s*$", masked[:m.start()]) and re.search(r"\bfrom\s*$", masked[:qs[j - 1].start()]):
            side = "re"
        if side is None:
            continue                                   # a number said of neither take: checked as any number is
        keys = _QTY_KEYS.get(unit) if unit else None
        ok = any((keys is None or k is None or k in keys) and abs(float(x) - v) <= (0.5 if abs(float(x)) >= 1 else 0.005)
                 for r in rows for k, x in _sides(r, side))
        if not ok:
            why.append(f"a number that is not {'the first take' if side == 'first' else 'the re-take'}'s in the comparison: {m.group(0).strip()}")
    return why


def change_problems(answer, ev):
    """Why an answer's words about what changed since another take are not the comparison's: each claim of a change must
    have its verdict from a compare lookup of that turn (ev: teacher_tools.evidence's cmpRows), for what it is about,
    found as the bar or the finding nearest to its words in the sentence ("Bar 9 improved and bar 11 got worse": bar 9
    better and bar 11 worse); a claim about nothing named needs the comparison's overall direction (some better and none
    worse); and a sentence giving the two takes' numbers must give each take's own. With no compare lookup (ev None, or no
    rows) nothing may be said to have changed."""
    why = []
    rows = (ev or {}).get("cmpRows") or []
    for sentence in re.split(r"(?<=[.!?;])\s+", answer or ""):
        claims = sorted(((m.start(), m.end(), kind, m.group(0)) for kind, rx in CHANGE_SAID.items() for m in rx.finditer(sentence)),
                        key=lambda c: c[0])
        if not claims and not _TAKES_SAID.search(sentence):
            continue
        if claims and not rows:
            why += [f"says what changed since another take, which only the comparison gives: {c[3]}" for c in claims]
            continue
        # what the sentence names: bars (not a lead-in: "Bars 9 and 10: bar 9 improved"), findings by topic, hands
        named = []
        for m in _BAR_RANGE.finditer(sentence):
            a_, b_ = int(m.group(1)), int(m.group(2))
            if 0 < b_ - a_ <= 40 and not re.match(r"\s*:", sentence[m.end():]):
                named.append((m.start(), m.end(), "bars", set(range(a_, b_ + 1))))
        for rx in (BAR_WORDS, MEASURE_WORDS):
            for m in rx.finditer(sentence):
                if not re.match(r"\s*:", sentence[m.end():]) and not any(a <= m.start() < b for a, b, _, _ in named):
                    named.append((m.start(), m.end(), "bars", {int(x) for x in re.findall(r"\d+", m.group(0))}))
        for m in BAR_IN_WORDS.finditer(sentence):
            v = _said_value(m.group(1) or m.group(2))
            if v is not None and not re.match(r"\s*:", sentence[m.end():]):
                named.append((m.start(), m.end(), "bars", {v}))
        for r_, items in TOPICS:
            if items is FINGER_ITEMS or not set(items) & set(CMP_ITEMS):
                continue
            for m in r_.finditer(sentence):
                if not any(a <= m.start() < b for a, b, k, _ in named if k == "bars") and not any(a <= m.start() < b for a, b, _, _ in claims):
                    named.append((m.start(), m.end(), "topic", tuple(items)))
        for m in _HAND_SAID.finditer(sentence):
            named.append((m.start(), m.end(), "hand", (m.group(1) or m.group(2)).lower()))
        about = {i: dict(bars=set(), topics=[], hands=set()) for i in range(len(claims))}
        for a, b, kind, val in named:
            if not claims:
                break
            i = min(range(len(claims)), key=lambda i: max(0, claims[i][0] - b, a - claims[i][1]))
            if kind == "bars":
                about[i]["bars"] |= val
            elif kind == "topic":
                about[i]["topics"].append(val)
            else:
                about[i]["hands"].add(val)
        subject_rows = []
        for i, (_, _, kind, said) in enumerate(claims):
            want, ab = CHANGE_VERDICT[kind], about[i]
            for bar in sorted(ab["bars"]):
                mine = [r for r in rows if r["bar"] == bar and r["item"] is None]
                subject_rows += mine
                if not mine:
                    why.append(f"says bar {bar} changed, which the comparison did not compare")
                elif want not in {r["verdict"] for r in mine}:
                    why.append(f"says bar {bar} {want}, which the comparison did not give")
            if ab["bars"]:
                continue
            t = ab["topics"][0] if ab["topics"] else None          # the finding nearest its words
            mine = [r for r in rows if r["item"] is not None and (t is None or r["item"] in t)
                    and (not ab["hands"] or r["hand"] in ab["hands"] or (t is not None and r["hand"] is None))] if t or ab["hands"] else []
            if mine:
                subject_rows += mine
                if want not in {r["verdict"] for r in mine}:
                    why.append(f"says {want} of {mine[0]['item'].replace('_', ' ')}, which the comparison did not give: {said}")
            elif (t and not set(t) <= set(_SCORE_TOPIC)) or ab["hands"]:
                why.append(f"says what changed of something the comparison did not compare: {said}")
            else:                                  # about nothing it names: the comparison's direction overall
                vs = {r["verdict"] for r in rows}
                fine = {"better": "better" in vs and "worse" not in vs, "worse": "worse" in vs and "better" not in vs,
                        "same": "about the same" in vs and not vs & {"better", "worse"}}[kind]
                if not fine:
                    why.append(f"says {want} overall, which the comparison did not give: {said}")
        if rows:
            if not subject_rows:                       # a sentence of numbers about the takes: the bars it names, else any row
                bars = {v for a, b, kind, val in named if kind == "bars" for v in val}
                subject_rows = [r for r in rows if r["bar"] in bars and r["item"] is None] or rows
            if subject_rows:
                why += _number_problems(sentence, subject_rows)
    return why


# the topic words of a sentence about the reference recording, and the rows they name (the procompare design, 6 rule 2)
REF_TOPICS = [(re.compile(r, re.I), items) for r, items in (
    (r"\b(stop(s|ped|ping)?|break(s)?|gap(s)?|paus(e|es|ed|ing))\b", ("ref_stop",)),
    (r"\b(slow(s|ed|ing)?|slow(?:s|ed)? down|rush(es|ed|ing)?|hurr(y|ies|ied|ying)|pace)\b", ("ref_tempo_bar",)),
    (r"\b(even(ly)?|uneven(ly)?|pairs?|early|late)\b", ("ref_even",)),
    (r"\b(pedal\w*|bass)\b", ("ref_pedal",)),
    (r"\b(loud\w*|soft\w*|quiet\w*|contrast\w*|level|dynamic\w*)\b", ("ref_contrast",)),
    (r"\b(top note|melody|tune|voic\w*)\b", ("ref_voicing",)),
    (r"\b(spread|rolled|roll(s|ing)?|together|first)\b", ("ref_choice",)))]
# the aspects a block may list as not compared, and the topic words that say one
REF_ASPECT_WORDS = {"loudness": re.compile(r"\b(loud\w*|soft\w*|quiet\w*|contrast\w*|dynamic\w*|level)\b", re.I),
                    "pedal": re.compile(r"\bpedal\w*\b", re.I),
                    "voicing": re.compile(r"\b(top note|melody|voic\w*)\b", re.I),
                    "evenness": re.compile(r"\b(even(ly)?|uneven(ly)?)\b", re.I),
                    "timing": re.compile(r"\b(stop\w*|slow\w*|rush\w*|hurr\w*|pace|timing|even(ly)?|uneven(ly)?)\b", re.I)}
REF_SAME = re.compile(r"\b(the same|too|also|as well|as it does|as in the reference|as the reference)\b", re.I)
REF_DIFFERS = re.compile(r"\b(differ\w*|unlike|goes straight on|keeps the same pace|keeps (these|the) notes even|changes the pedal)\b", re.I)
REF_TEMPO_SAID = {"slower": re.compile(r"\b(more slowly|slower)\b", re.I), "faster": re.compile(r"\b(faster|quicker|more quickly)\b", re.I),
                  "same": re.compile(r"\babout the same (speed|tempo)\b", re.I)}


def reference_block(res, hosted=False):
    """The take's comparison with a reference recording as a route may see it: result.proCompare, or None when there is
    none, or (hosted) when its pianist's consent has no "hostedModels" (the block's "hosted"), where only the fixed
    answers say it."""
    pc = res.get("proCompare") if isinstance(res.get("proCompare"), dict) else None
    if not pc or (hosted and not pc.get("hosted")):
        return None
    return pc


def reference_lines(pc):
    """Every fixed line of a block (rows' words, the tempo, the not-compared lines, the lead): a sentence equal to one is
    exempt from REF_FORBID."""
    out = []
    for r in pc.get("rows") or []:
        out += [v for v in (r.get("say") or {}).values() if isinstance(v, str)]
    out += [x.get("say") for x in (pc.get("aspects") or {}).get("notCompared") or [] if isinstance(x, dict)]
    out += [x.get("say") for x in pc.get("notCompared") or [] if isinstance(x, dict)]
    out += [(pc.get("tempo") or {}).get("say"), pc.get("lead"), pc.get("footer")] + list(pc.get("praise") or [])
    lines = set()
    for t in out:
        for sent in re.split(r"(?<=[.!?;])\s+", t or ""):
            if sent.strip():
                lines.add(sent.strip().rstrip(".!;").lower())
    return lines


def reference_evidence(pc):
    """What an answer may say about the reference recording, from a block (the reference lookup's or the context's): its
    rows {bar: {items}, verdicts}, the learner's times on its rows, the aspects not compared, the tempo direction."""
    rows, times = [], set()
    for r in pc.get("rows") or []:
        item = r.get("item")
        for b in r.get("bars") or []:
            rows.append(dict(bar=b.get("bar"), item=item, verdict=r.get("verdict"), kind=r.get("kind")))
        for k in ("fromS", "toS", "atS"):
            if isinstance(r.get(k), (int, float)):
                times.add(clock(r[k]))
    nc = [x.get("aspect") for x in ((pc.get("aspects") or {}).get("notCompared") or []) + (pc.get("notCompared") or []) if isinstance(x, dict)]
    return dict(rows=rows, times=times, notCompared=set(nc), tempo=(pc.get("tempo") or {}).get("direction"), lines=reference_lines(pc),
                compared=bool(pc.get("compared")))


def reference_problems(answer, ev, res=None):
    """Why an answer's words about the reference recording are not the comparison's (the procompare design, 6): ev is
    teacher_tools.evidence's (its "reference", from a reference lookup that turn), or for an answer from the context alone
    (ev None) the take's own block. Refused: naming the reference with no lookup of it (or no block); naming it in a sentence
    about a bar the comparison has no row for, or with a topic that bar's rows do not have, or saying it does the same where
    the row says it differs (or differs where it reads as a choice); a topic the block says was not compared; a time that is
    not one of its rows' (the learner's own); REF_FORBID's words within 40 characters of it, unless the sentence is one of
    the block's fixed lines; the tempo said another way than the block says it; a performer's name without consent."""
    import proref as PR
    why = []
    if ev is None:
        pc = reference_block(res or {}) if res is not None else None
        R = reference_evidence(pc) if pc else None
    else:
        R = ev.get("reference")
    names = PR.performers()
    # on a take with no comparison and no reference lookup, "reference" alone is the player's own score (REF_RECORDING)
    named = REF_NAMED if R is not None or isinstance((res or {}).get("proCompare"), dict) else REF_RECORDING
    for sentence in re.split(r"(?<=[.!?;])\s+", answer or ""):
        for nm in names:
            if nm and re.search(rf"\b{re.escape(nm)}\b", sentence, re.I):
                why.append("names the reference recording's performer, which their consent does not allow")
        if not named.search(sentence):
            continue
        if R is None:
            why.append("names the reference recording with no reference lookup this turn")
            continue
        plain = sentence.strip().rstrip(".!;").lower()
        if plain in R["lines"]:
            continue                                  # one of the block's own fixed lines
        for m in REF_NAMED.finditer(sentence):
            around = sentence[max(0, m.start() - 40):m.end() + 40]
            f = REF_FORBID.search(around)
            if f:
                why.append(f"says the reference recording with words never said of it: {f.group(0)}")
                break
        bars = set()
        for rx in (BAR_WORDS, MEASURE_WORDS):
            for m in rx.finditer(sentence):
                bars |= {int(x) for x in re.findall(r"\d+", m.group(0))}
        for m in BAR_IN_WORDS.finditer(sentence):
            v = _said_value(m.group(1) or m.group(2))
            if v is not None:
                bars.add(v)
        topics = {it for rx, items in REF_TOPICS if rx.search(sentence) for it in items}
        for aspect in R["notCompared"]:
            rx = REF_ASPECT_WORDS.get(aspect)
            if rx is not None and rx.search(sentence) and aspect != "all":
                why.append(f"talks about {aspect} with the reference recording, which was not compared")
        for b in sorted(bars):
            mine = [r for r in R["rows"] if r["bar"] == b]
            if not mine:
                why.append(f"says the reference recording of bar {b}, which the comparison has no remark for")
                continue
            have = {r["item"] for r in mine}
            if topics and not topics & have:
                why.append(f"says something of bar {b} the comparison did not find there")
            verdicts = {r["verdict"] for r in mine}
            if REF_SAME.search(sentence) and "choice" not in verdicts:
                why.append(f"says the reference recording does the same in bar {b}, where it does not")
            if REF_DIFFERS.search(sentence) and "differs" not in verdicts:
                why.append(f"says the reference recording differs in bar {b}, where it reads as a choice")
        if not bars:
            for d, rx in REF_TEMPO_SAID.items():
                if rx.search(sentence) and d != R["tempo"]:
                    why.append("says the speed against the reference recording another way than the comparison measured")
        for t in TIME_SAID.findall(sentence):
            if t not in R["times"]:
                why.append(f"a time with the reference recording that is not one of this take's: {t}")
    return list(dict.fromkeys(why))


TIME_SAID = re.compile(r"\b\d{1,2}:\d{2}\b")


@on_clip
def validate_answer(res, answer, ids, asked="", evidence=None):
    """Reasons a model's answer must not be used; empty = fine. asked: the player's own words this
    conversation, which may name a hand the take does not. evidence: for an answer written from lookups
    (agent_chat), what that turn's lookups and the take's context gave (teacher_tools.evidence): every time,
    bar, note, count and measured number said must be one of them (evidence_problems), in place of the rule
    that allows only the context's times and bars; a percent or a milliseconds only when the player asked how
    much; an answer about a rough finding, or naming notes taken from the sound, says "I heard" or "from what I
    could see" and nothing for certain; a hand the lookups name may be said. Everything else is checked as for
    any answer."""
    if not isinstance(answer, str) or not answer.strip():
        return ["empty"]
    fs = said_findings(res)                       # an octave run lane L1 did not report is no finding an answer may cite
    apart = next((f for f in fs if f.get("item") == "hands_apart"), None)
    bars = sorted({n for f in fs for n in bar_numbers(f)})
    lead = lead_hand(apart) if apart else False
    if evidence is None:
        pc = reference_block(res)
        rbars = sorted({b.get("bar") for r in (pc or {}).get("rows") or [] for b in r.get("bars") or [] if isinstance(b.get("bar"), int)})
        rtimes = sorted(reference_evidence(pc)["times"], key=len, reverse=True) if pc else []
        why = check(answer, None, _times(res) + rtimes + _count_words(res), 60, lead=lead, bars=sorted(set(bars) | set(rbars)), reference=True)
    else:
        why = check(answer, None, (), 60, lead=lead, numbers=False, reference=True) + evidence_problems(answer, evidence)
    if len(re.findall(r"[.!?](\s|$)", answer.strip())) > 3:
        why.append("more than three sentences")
    why += change_problems(answer, evidence)
    why += reference_problems(answer, evidence, res)
    m = MEDICAL.search(answer)
    if m:
        why.append(f"a medical word: {m.group(0)}")
    if FINGER_FINE.search(answer) and not any(isinstance(g, dict) and g.get("item") in FINGER_ITEMS for g in res.get("strengths") or []):
        why.append("says the fingering is fine, which no strength says")
    if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids) or not set(ids) <= {f["id"] for f in fs}:
        why.append("unknown finding ids")
    rough = {f["id"] for f in fs if _hedged(f)}
    cites = isinstance(ids, list) and bool(rough & {i for i in ids if isinstance(i, str)})
    if (cites or (rough and re.search(r"\bfingering\b", answer, re.I))) and HEDGE.strip().rstrip(",").lower() not in answer.lower():
        why.append("a rough fingering finding said without 'from what I could see'")
    if evidence is not None:
        m = UNIT_SAID.search(answer)
        if m and not ASKED_AMOUNT.search(asked or ""):
            why.append(f"a measure the player did not ask for: {m.group(0)}")
        said = {i for i in ids if isinstance(i, str)} if isinstance(ids, list) else set()
        rough_cited = any(f.get("confidence") == "rough" and f.get("id") in said for f in fs)
        names_note = bool(PITCH_SAID.search(answer) or CLASS_SAID.search(answer) or MIDDLE_C.search(answer))
        if rough_cited or (names_note and not exact_notes(res)):
            if not HEARD.search(answer):
                why.append("a rough finding or a note taken from the sound said without 'I heard' or 'from what I could see'")
            m = CERTAIN.search(answer)
            if m:
                why.append(f"says for certain what is rough or taken from the sound: {m.group(0)}")
        m = FLAWLESS.search(answer)
        if m:
            why.append(f"a verdict no measurement gives: {m.group(0)}")
    named = {HAND.get(x.get("hand")) for x in fs + list(res.get("strengths") or [])} | ({lead_hand(apart)} if apart else set())
    if evidence is not None:
        named |= set(evidence.get("hands") or ())     # a hand a lookup names (a note's, a slip's)
    split = not _quest(res) and split_at_middle_c(res)
    for h in ("left", "right"):
        if split and re.search(rf"\b{h}\b", answer, re.I):
            why.append(f"names the {h} hand, which this video could not tell")
        elif re.search(rf"\b{h}\b", answer, re.I) and h not in named and not re.search(rf"\b{h}\b", asked, re.I):
            why.append(f"names the {h} hand, which nothing in this take is about")
    return why


# ---------------------------------------------------------------- the conversation with lookups (hosted Muse Spark)

SYSTEM_AGENT = "[private: Museverse teaching text, not in this repository]"
MAX_TOOL_ROUNDS = 3            # rounds of lookups in one answer; the next reply must answer
MAX_LOOKUPS_PER_ROUND = 4      # lookups one round may make (more get an error result, which is not counted as a failure)
MAX_TOOL_ERRORS = 3            # lookups that failed in one answer before it is given up for the fixed one
LAST_ROUND = "That was the last round of lookups: answer now, from what the lookups returned."
AGENT_TIMEOUT_S = 20.0         # one answer, every round included (TEACHER_AGENT_TIMEOUT); then the fixed answer


def agent_timeout():
    """Seconds one answer may take, every model and round included: purpose_timeout("chat") (TEACHER_TIMEOUT_CHAT, else
    TEACHER_AGENT_TIMEOUT, else AGENT_TIMEOUT_S), at most 120."""
    return min(120.0, purpose_timeout("chat"))


def author(model, served_by=None):
    """Who wrote a line, as the page says it: "Muse Spark (Meta)", "Muse Wonder (Meta)", "Muse Glimmer", or for the
    open-weights route (served_by: who ran it) "Muse Spark Open (open weights, served by Baseten)"; or None."""
    m = str(model or "").lower()
    if "muse-spark-open" in m or (served_by and "glimmer" in m):
        name = "Muse Spark Open" if "muse-spark-open" in m else "Muse Glimmer"
        return f"{name} (open weights, served by {served_by})" if served_by else f"{name} (open weights)"
    if "wonder" in m:
        return "Muse Wonder (Meta)"
    if "spark" in m:
        return "Muse Spark (Meta)"
    if "glimmer" in m:
        return "Muse Glimmer"
    return None


class AgentError(RuntimeError):
    """The lookups went wrong in a way the answer cannot recover from (too many rounds, too many failed lookups)."""


def _turn(b, messages, schema, timeout, extra=None, tools=None, model=None, max_tokens=2000, reasoning="minimal", purpose=None):
    """One Chat Completions call to the hosted backend b (Meta's API or OpenRouter), with lookups (tools) and/or a JSON
    schema: dict(content, toolCalls, assistant (the turn to send back with the lookups' results), model, seconds,
    usage). messages may carry the assistant's tool calls and the lookups' results ("tool"). model: another model than
    the backend's (the practice plan's Muse Wonder). Raises on anything off, as _complete does; Meta refusing the key
    raises MetaKeyRefused (noted: the route moves to OpenRouter). Through the open-weights host also "servedBy" (who ran
    it, for author()), and with a schema the JSON as open_api parsed it strictly (a reply that is not that JSON raises).
    Recorded in the call log either way (_record, with purpose or the block's); the reply carries its record as "call"."""
    model = model or b["model"]
    if _contributor_id(model):
        raise ValueError("a contributor model is never called")
    t0, seen = time.perf_counter(), dict(model=model, usage=None, ok=False)
    rec = None
    try:
        r = _turn_call(b, messages, schema, timeout, extra, tools, model, max_tokens, reasoning, seen)
        seen.update(ok=True, model=r.get("model") or model, usage=r.get("usage"))
        rec = _record(b, seen["model"], purpose, time.perf_counter() - t0, seen["usage"], True)
        return dict(r, call=rec)
    finally:
        if rec is None:
            _record(b, seen["model"], purpose, time.perf_counter() - t0, seen["usage"], False)


def _turn_call(b, messages, schema, timeout, extra, tools, model, max_tokens, reasoning, seen):
    """_turn's request, route by route; seen gets the model that answered and the usage as they become known."""
    if b.get("route") == "open":
        import open_api as OW
        ask_json = "\nAnswer with one JSON object only, matching: " + json.dumps(schema) if schema else ""
        msgs = [dict(m, role="system", content=m["content"] + ask_json) if m["role"] == "developer" else m for m in messages]
        sid = (extra or {}).get("safety_identifier")
        r = OW.chat(msgs, schema=schema, tools=tools, timeout=timeout, max_tokens=max_tokens, user=sid,
                    model=None if model == b["model"] else model)
        content = json.dumps(r["json"], ensure_ascii=False) if r.get("json") is not None else r["content"]
        return dict(content=content, toolCalls=r.get("toolCalls") or [], assistant=r.get("message"), model=r["model"],
                    seconds=r["seconds"], usage=r.get("usage") or {}, servedBy=r.get("servedBy"))
    if b.get("route") == "openrouter":
        import openrouter_api as OR
        ask_json = "\nAnswer with one JSON object only, matching: " + json.dumps(schema) if schema else ""
        msgs = [dict(m, role="system", content=m["content"] + ask_json) if m["role"] == "developer" else m for m in messages]
        sid = (extra or {}).get("safety_identifier")
        r = OR.chat(msgs, schema=schema, tools=tools, timeout=timeout, max_tokens=max_tokens, user=sid, session_id=sid,
                    model=None if model == b["model"] else model, reasoning=reasoning)
        seen.update(model=r.get("model") or model, usage=r.get("usage"))
        if _contributor_id(r["model"]):
            raise ContributorReply(f"the reply came from a contributor model ({r['model']})")
        return dict(content=r["content"], toolCalls=r.get("toolCalls") or [], assistant=r.get("message"), model=r["model"],
                    seconds=r["seconds"], usage=r.get("usage") or {})
    if not b.get("hosted"):
        raise ValueError("lookups are for the hosted route only")
    body = dict(model=model, messages=messages, reasoning_effort=reasoning, max_completion_tokens=max_tokens, store=False, **(extra or {}))
    if schema:
        body["response_format"] = {"type": "json_schema", "json_schema": {"name": "Teacher", "schema": schema}}
    if tools:
        body.update(tools=tools, tool_choice="auto")      # Meta's tool calling takes "auto" only (docs/tool-calling)
    headers = {"Content-Type": "application/json", "User-Agent": USER_AGENT, "Authorization": f"Bearer {b['key']}"}
    url = b["base"] + "/chat/completions"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers=headers)
    t0 = time.perf_counter()
    resp = _post(b, req, timeout)
    got = resp.get("model") or model
    seen.update(model=got, usage=_usage(resp.get("usage")))
    if _contributor_id(got):
        raise ContributorReply(f"the reply came from a contributor model ({got})")
    ch = resp["choices"][0]
    if ch.get("finish_reason") == "length":
        raise ValueError("reply truncated")
    msg = ch.get("message") or {}
    calls = [c for c in msg.get("tool_calls") or [] if isinstance(c, dict)]
    content = msg.get("content") if isinstance(msg.get("content"), str) else ""
    return dict(content=content, toolCalls=calls, model=got, seconds=time.perf_counter() - t0,
                assistant=dict(role="assistant", content=content, tool_calls=calls) if calls else None,
                usage=_usage(resp.get("usage")))


def _add_usage(total, u):
    for k, v in (u or {}).items():
        total[k] = round(total.get(k, 0) + v, 6)
    return total


def _agent(b, res, messages, deadline, extra=None):
    """The conversation turn with lookups: the model asks for lookups (teacher_tools) for at most MAX_TOOL_ROUNDS rounds,
    each answered from the result, then answers. Returns (its last reply, the lookups made [{tool, args, result}], the
    usage summed). Raises on a timeout (deadline: time.monotonic()), a failed call, too many rounds or failed lookups."""
    import teacher_tools as TT
    msgs, calls, usage = list(messages), [], {}
    rounds = errors = 0
    while True:
        left = deadline - time.monotonic()
        if left < 0.3:
            raise TimeoutError("no answer within the turn's time")
        r = _turn(b, msgs, SCHEMA_CHAT, left, extra, tools=TT.tools_for(res))
        _add_usage(usage, r["usage"])
        if not r["toolCalls"]:
            return r, calls, usage
        rounds += 1
        if rounds > MAX_TOOL_ROUNDS:
            raise AgentError(f"more than {MAX_TOOL_ROUNDS} rounds of lookups")
        msgs.append(r["assistant"])
        n = len(r["toolCalls"])
        for k, tc in enumerate(r["toolCalls"]):
            fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
            name, raw, args = fn.get("name"), fn.get("arguments"), None
            if k >= MAX_LOOKUPS_PER_ROUND:              # not made, so not a failure: the model may ask again next round
                out = {"error": f"at most {MAX_LOOKUPS_PER_ROUND} lookups at once: ask for this one again"}
            else:
                try:
                    args = json.loads(raw) if isinstance(raw, str) and raw.strip() else (raw if isinstance(raw, dict) else {})
                    out = TT.run(res, name, args)
                except (ValueError, TT.ToolError) as e:    # arguments that are not JSON; a lookup that does not exist
                    out = {"error": str(e)[:200] if isinstance(e, TT.ToolError) else "the arguments are not valid JSON"}
                except Exception as e:                    # a lookup that broke on this take: an error result, logged
                    log.warning("lookup %s failed: %s", str(name)[:40], type(e).__name__)
                    out = {"error": "this lookup could not be made on this take"}
                if "error" in out:
                    errors += 1
            calls.append(dict(tool=name, args=args, result=out))
            # the last round's last result says to answer now (the tools stay offered: Meta's API takes tool_choice
            # "auto" only), so a model that would look again answers instead
            sent = dict(out, note=LAST_ROUND) if rounds == MAX_TOOL_ROUNDS and k == n - 1 else out
            msgs.append({"role": "tool", "tool_call_id": str(tc.get("id") or f"call_{len(calls)}"),
                         "content": json.dumps(sent, ensure_ascii=False, separators=(",", ":"))})
        if errors > MAX_TOOL_ERRORS:
            raise AgentError("the lookups kept failing")


def _reply_json(content):
    m = re.search(r"\{.*\}", content or "", re.S)      # tolerate text around the JSON
    out = json.loads(m.group(0)) if m else {}
    return out if isinstance(out, dict) else {}


def agent_chat(res, msgs, b, question, turns, extra=None, adult=None):
    """chat()'s answer through the hosted route with lookups: (the reply, or None for the fixed answer, with why).
    The purpose's models in turn (purpose_models("chat"): Muse Wonder, then Muse Spark), all within one agent_timeout();
    a refused Meta key is tried once through OpenRouter, when the take allows that route. The reply and the note carry
    this answer's calls (modelCalls, as the call log has them)."""
    t0 = time.monotonic()
    deadline, start, note = t0 + agent_timeout(), call_mark(), {}
    with purpose("chat"):
        for i, m in enumerate(purpose_models("chat", b)):
            if i and deadline - time.monotonic() < 1.0:   # the first model always gets the turn's time; the next what is left
                note = dict(note, error=note.get("error") or "no time left")
                break
            mark = call_mark()
            got, note, stop = _agent_answer(res, msgs, dict(b, model=m), question, turns, extra, adult, t0, deadline)
            if got:
                mark_used(mark)
                got["modelCalls"] = model_calls(start=start)
                return got, note
            if stop:          # the key refused (the next model would be too), or a Contributor reply (ContributorReply)
                break
    return None, dict(note, modelCalls=model_calls(start=start))


def _agent_answer(res, msgs, b, question, turns, extra, adult, t0, deadline):
    """One model's try at agent_chat's answer: (the reply or None, the note, whether to stop asking: Meta refused the
    key, or the reply came from a Contributor model)."""
    import teacher_tools as TT
    refused = False
    try:
        try:
            r, looks, usage = _agent(b, res, msgs, deadline, extra)
        except MetaKeyRefused:
            refused = True
            b2 = _hosted()                             # the route now, with the refused key counted as unset
            if not (b2 and b2.get("route") == "openrouter" and hosted_allowed(res, adult, "openrouter") and not _fingering_content(res)):
                raise
            b = b2
            narrowed = compare_for(res, "openrouter")      # the first take's numbers only where its player agreed
            if narrowed is not res:                        # ... in the developer message and the history too
                nctx = context(narrowed, hosted=True)
                msgs = [dict(msgs[0], content=system_for(SYSTEM_AGENT, nctx) + "\n\nThe take:\n" + json.dumps(nctx, ensure_ascii=False))] + [
                    dict(m, content=COMPARE_GENERIC) if m["role"] == "assistant" and COMPARE_MARK.search(m["content"]) else m for m in msgs[1:]]
            res = narrowed
            r, looks, usage = _agent(b, res, msgs, deadline, extra)
        out = _reply_json(r["content"])
    except Exception as e:                        # no model, network, timeout, bad JSON, a Contributor reply, the lookups
        return None, dict(error=_scrub(f"{type(e).__name__}: {e}")[:200], model=b["model"]), refused or isinstance(e, ContributorReply)
    ctx = context(res, hosted=True)
    # only what the lookups returned counts (TT.grounds): never a failed one's error, a moment asked for, or a span echoed
    ev = TT.evidence(ctx, *[TT.grounds(c["tool"], c["result"]) for c in looks])
    asked = " ".join([question] + [t for r_, t in turns if r_ == "user"])
    seen = [dict(tool=c["tool"], label=TT.label(res, c["tool"], c["args"])) for c in looks if "error" not in c["result"]]
    bad = validate_answer(res, out.get("answer"), out.get("findingIds"), asked, evidence=ev)
    note = dict(lookups=[dict(tool=c["tool"], ok="error" not in c["result"]) for c in looks], usage=usage,
                seconds=round(time.monotonic() - t0, 2), model=r["model"])
    if bad:
        return None, dict(note, rejected=bad), False
    moments = []
    for c in looks:
        mo = c["result"].get("moment") if c["tool"] == "moment" else None
        if isinstance(mo, dict) and mo not in moments:
            moments.append(mo)
    labels = list(dict.fromkeys(x["label"] for x in seen))
    return dict(answer=clean(out["answer"]), source=b["name"], model=r["model"], findingIds=list(out["findingIds"]),
                seconds=note["seconds"], lookups=labels, moments=moments[:3], author=author(r["model"], r.get("servedBy")),
                usage=usage), note, False


def compare_for(res, route):
    """res as the hosted route may see it: a re-take's comparison with its first take (res["compare"], server.py) holds that
    take's numbers, so it stays only when that take's own policy lets the route see it (compare beforePolicy: its player
    agreed to the route, as res's own policy says for this take), else it is withheld ({"withheld": True}: the compare
    lookup says it cannot be shown here, and withheld_turns keeps what the fixed answers said of it out of the history)."""
    c = res.get("compare")
    if not isinstance(c, dict) or c.get("withheld"):
        return res
    pol = c.get("beforePolicy") if isinstance(c.get("beforePolicy"), dict) else {}
    return res if route in POLICY_KEY and pol.get(POLICY_KEY[route]) is True else dict(res, compare=dict(withheld=True))


# a teacher turn that said what the comparison found (the fixed answers and the plan's lines say "the first take" or "your
# first one"; a model on a route that may see it says it so too): on a route the comparison is withheld from it is sent
# as COMPARE_GENERIC, as hosted_turns does for the fingering read
COMPARE_MARK = re.compile(r"\bfirst (?:take|one)\b", re.I)
COMPARE_GENERIC = "I can't compare this take with the earlier one here."


def withheld_turns(res, turns):
    """turns as a route the comparison is withheld from gets them (compare_for): a teacher turn about the first take
    becomes COMPARE_GENERIC, so none of that take's numbers reach the route through the conversation either."""
    c = res.get("compare")
    if not (isinstance(c, dict) and c.get("withheld")):
        return turns
    return [(r, COMPARE_GENERIC if r == "assistant" and COMPARE_MARK.search(t) else t) for r, t in turns]


def _target_id(res, target=None):
    if isinstance(target, dict) and target.get("id"):
        return str(target["id"])
    for k in ("demo", "job"):
        if isinstance(res.get(k), dict) and res[k].get("id"):
            return str(res[k]["id"])
    return None


@on_clip
def chat(res, history=None, question="", adult=None, target=None):
    """An answer to the player's question about this take, in the conversation so far:
    {"answer", "source": "muse" | "openrouter" | "openrouter-glimmer" | "open" | "glimmer" | "fixed", "model", "findingIds"}
    (plus "rejected", "error" or "seconds" when there is something to say about the model; from the hosted route
    also "lookups" (what it looked up, as the page shows it), "moments" (moments it pointed at), "author" and "usage").
      1. pain, what the take cannot judge, and a take too short to judge: the fixed answers;
      2. a model when one may see this take (_backend: the hosted route only when hosted_allowed()): the hosted
         route answers with lookups over the result (agent_chat, teacher_tools.py: at most MAX_TOOL_ROUNDS rounds
         within agent_timeout()), every number it says checked against what they returned (evidence_problems);
         Glimmer from the context alone, as before;
      3. else, or when its answer fails validate_answer() or anything goes wrong, the fixed answer.
    history: [{"role": "user" | "teacher", "text"}] (history_window keeps the last turns).
    adult: True only when the caller confirmed the person asking is 18+ (needed for a Quest take
    on the hosted API). target: {"kind", "id"}; by default the result's demo or job id."""
    question = clean(question if isinstance(question, str) else "")[:500]
    answer, ids, final = _fixed(res, question)
    fixed = dict(answer=answer, source="fixed", model=None, findingIds=ids)
    if not question or final:
        return fixed
    b = _backend(res, adult)
    if not b:
        return fixed
    if b.get("hosted") and isinstance(res.get("proCompare"), dict) and not reference_block(res, True) and REFERENCE_Q.search(question):
        return fixed                              # the reference's consent does not reach this route: its fixed words only
    turns = history_window(history)
    if b.get("hosted"):
        turns = hosted_turns(turns)
        res = compare_for(res, b.get("route") or "meta")
        turns = withheld_turns(res, turns)
    system = SYSTEM_AGENT if b.get("hosted") else SYSTEM_CHAT      # the hosted route answers with lookups (agent_chat)
    ctx = context(res, hosted=bool(b.get("hosted")))
    msgs = [{"role": "developer", "content": system_for(system, ctx) + "\n\nThe take:\n" + json.dumps(ctx, ensure_ascii=False)}]
    for role, text in turns + [("user", question)]:
        if msgs[-1]["role"] == role:
            msgs[-1] = dict(msgs[-1], content=msgs[-1]["content"] + "\n" + text)
        else:
            msgs.append({"role": role, "content": text})
    tid = _target_id(res, target)
    # Meta's abuse checks target one end user (up to 64 characters, hashed); the cache key groups
    # the requests that share this take's developer message
    extra = dict(safety_identifier=hashlib.sha256(tid.encode()).hexdigest()[:32], prompt_cache_key=tid) if tid and b["hosted"] else None
    if b.get("hosted"):
        got, note = agent_chat(res, msgs, b, question, turns, extra, adult)
        if got:
            return got
        log.info("chat: the fixed answer instead of the model's: %s", note.get("error") or "; ".join(map(str, note.get("rejected") or [])))
        return dict(fixed, **{k: note[k] for k in ("error", "rejected", "modelCalls") if note.get(k)})
    start = call_mark()
    try:
        out, dt, model = _complete(b, msgs, SCHEMA_CHAT, float(os.environ.get("TEACHER_MUSE_TIMEOUT", "8")), extra, purpose="chat")
    except Exception as e:                        # no model, network, timeout, bad JSON, a Contributor reply
        return dict(fixed, error=_scrub(f"{type(e).__name__}: {e}")[:200], modelCalls=model_calls(start=start))
    asked = " ".join([question] + [t for r, t in turns if r == "user"])
    bad = validate_answer(res, out.get("answer"), out.get("findingIds"), asked)
    if bad:
        return dict(fixed, rejected=bad, modelCalls=model_calls(start=start))
    mark_used(start)
    return dict(answer=clean(out["answer"]), source=b["name"], model=model, findingIds=list(out["findingIds"]), seconds=round(dt, 2),
                modelCalls=model_calls(start=start))


@on_clip
def ask(res, question, adult=None):
    """One question with no conversation before it (the job page's ask box)."""
    return chat(res, [], question, adult=adult)
