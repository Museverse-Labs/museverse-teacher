#!/usr/bin/env python3
"""Museverse Teacher (web test): upload a video of your playing, get the teacher's remarks.

    TEACHER_TOKEN=<long random string> python server.py [--host 127.0.0.1] [--port 8780] [--data ./data]

Environment:
  TEACHER_TOKEN     required for anything off this machine, and at least 24 characters there (32 or more advised, a
                    warning under that; 24 is what the deploy workflow checks the secret for): every /api call except
                    /api/health and the demos (GET /api/demos...: public read-only content) needs "Authorization: Bearer
                    <token>". Unset = open (local testing only).
  TEACHER_SAM       local (SAM 3.1 on this machine, CUDA if present) | meta (hosted sam-3.1 on
                    Meta's Model API, needs MODEL_API_KEY) | replicate (our own SAM 3.1 detector,
                    replicate/, as a private model on Replicate)
  REPLICATE_API_TOKEN  for TEACHER_SAM=replicate: sent to api.replicate.com only, never logged
  REPLICATE_OWNER   our Replicate account or organisation: frames go only to a private model it owns
  REPLICATE_DEPLOYMENT owner/name of a Replicate deployment, or REPLICATE_MODEL owner/name[:version]
                    (one of the two; without a version the latest is used, the same for a whole job)
  REPLICATE_BATCH   frames per Replicate run (1-120, default 30); REPLICATE_TIMEOUT_S one run at most
                    (at least 5, default 900)
  REPLICATE_API_BASE  Replicate's API address (only api.replicate.com or a loopback test server)
                    With TEACHER_SAM=replicate the server refuses to start while any of these is
                    missing or malformed, rather than failing every job after the upload
  MODEL_API_KEY     Meta Model API: Muse Spark wording and chat, Muse Voice Transcribe for spoken
                    questions (live over WS /api/voice/ws, or a recording to POST /api/voice/stt)
  MUSE_STT_KEYWORDS on (the default) | off: a spoken question is biased with its take's own words (the piece, the
                    findings' titles, their notes and bars, "left hand", "right hand": voice.stt_terms, capped by
                    meta_api.stt_keywords) when that take's analysis may go to Meta's API; off sends the standing list
                    only. Any other value stops the server at start-up
  OPENROUTER_API_KEY  Muse Spark wording and chat through OpenRouter instead (openrouter_api.py: every
                    request pinned to Meta as the only provider; OPENROUTER_MODEL, default
                    meta/muse-spark-1.3; the practice plan by OPENROUTER_PLAN_MODEL, default
                    meta/muse-wonder). Spoken questions still need MODEL_API_KEY
  OPEN_WEIGHTS_HOST baseten | fireworks | modal | openrouter | custom: Muse Spark Open, Meta's open-weights
                    model, at an inference partner or our own server (open_api.py), for TEACHER_MUSE=open.
                    BASETEN_API_KEY, FIREWORKS_API_KEY, MODAL_ENDPOINT_KEY (a Proxy Token) are the partners' keys,
                    sent to their own host only, never logged; openrouter uses OPENROUTER_API_KEY with only
                    the open-weights providers of OPEN_WEIGHTS_PROVIDERS (default fireworks,modal,baseten,together),
                    no fallbacks, data_collection deny; custom takes OPEN_WEIGHTS_BASE_URL and
                    OPEN_WEIGHTS_KEY_ENV (the name of the variable holding its key)
  OPEN_WEIGHTS_MODEL  a Muse Spark Open or Muse Glimmer id (never a -contributor one); default
                    meta-models/muse-spark-open on baseten (unconfirmed), meta/muse-spark-open on
                    openrouter, required on fireworks, modal and custom
  OPEN_WEIGHTS_BASE_URL  https only (a loopback test server aside): required for modal (the Endpoints URL;
                    /v1 is added when it does not end in it) and custom, whose agreement names its host;
                    baseten and fireworks keep their own address
  TEACHER_MUSE      off | meta | openrouter | open | on (the default): which hosted route words and answers. Meta's
                    Model API only (voice.meta_only, 2026-10-31): openrouter and open, and TEACHER_SAM=replicate,
                    stop the server at start-up; OpenRouter, open-weights, Glimmer and Replicate settings are ignored.
                    on: Meta's API when MODEL_API_KEY is set, else OpenRouter when OPENROUTER_API_KEY is,
                    else the open-weights host when OPEN_WEIGHTS_HOST is set (voice.py hosted_route). With
                    open the server refuses to start while any OPEN_WEIGHTS_* setting, its key or its model
                    is missing or wrong, saying which. With openrouter the server refuses to start while
                    OPENROUTER_API_KEY is missing or malformed, or OPENROUTER_MODEL is not allowed; any
                    other value (a typo) stops it too. A MODEL_API_KEY that Meta refuses (401 or 403 to
                    one GET /models at start-up, or 401 to the first request; a 403 to a request is about
                    that model, so the next one is tried and nothing else changes) counts as unset from
                    then on: the route, the upload agreement and speech-to-text say so, and so does
                    /api/health (metaKey: none, unchecked, ok, refused or unknown). TEACHER_META_PROBE=0
                    skips the start-up check
  MUSE_BASE_URL     a self-hosted Muse Glimmer (live/muse.py): sends nothing to Meta, so it may word
                    and chat about any take, the demos included
  MUSE_QUEST_DATA_OK=1  only after Meta's written OK: lets questions about a demo (a Quest recording)
                    reach hosted Muse. A Quest recording's hands are data about its player, so without it
                    nothing derived from a demo goes to Meta's hosted API
  MUSE_QUEST_OPENROUTER_OK=1  only after Meta's written OK names OpenRouter: with MUSE_QUEST_DATA_OK=1, lets
                    questions about a demo reach Muse Spark through OpenRouter. OpenRouter is a third
                    party that sees what it passes on to Meta, which an OK to Meta's own API may not cover
  TEACHER_FRAMING   skip (the default) | warn | off: the framing check SAM runs on 4 frames before all of
                    them (framing.py). skip: a take that shows no keyboard, or no end of it with the hands
                    at the edge of the picture, is judged from the sound at once, saying why; warn: every
                    step runs anyway; off: no check. Any other value stops the server at start-up
  TEACHER_FRAMING_TIP  on (the default) | off: offers the upload's own, default-off consent to let the hosted
                    route's vision model (Muse Spark at Meta or through OpenRouter, or Muse Spark Open) look
                    at the framing check's 4 frames and choose a filming tip (framing_tip.py; "framingTip" in
                    /api/health). TEACHER_FRAMING_TIP_TIMEOUT: seconds for that call (default 15), then the
                    fixed tip
  DEMOS_DIR         the built demo takes (default web/data/demos; demos/build_demos.py builds them)
  TEACHER_SHOW_DEMOS  1 (the default) lists the demos on the home page and in GET /api/demos; 0 hides them from both
                    (their own links still open, for the team). Any other value stops the server at start-up
  TEACHER_PRO       off (the default) | team | public: the comparison of a take with a private reference recording of its
                    library piece (proref.py, refcompare.py). team: only takes uploaded with the token on a server with
                    TEACHER_LIBRARY_INTERNAL=1; public: only references whose pianist's consent is public with "derived".
                    TEACHER_PRO_DIR: where they are kept, outside the repository and every folder this server serves (it
                    refuses to start otherwise). TEACHER_PRO_SOUND team (the default) | public: rows from the sound alone on a
                    public upload. Any other value stops the server at start-up; /api/health says the mode and how many are
                    loaded, only when it is not off
  SAMPLES_DIR       the sample lessons (default web/data/samples, which git ignores): finished phone-video jobs that
                    make_sample.py copied in, each a folder with result.json, video.mp4, sample.json and plan.json.
                    Public like the demos: listed, opened, their plan and their video streamed with no token
  TEACHER_SAMPLE_CHAT_MAX, TEACHER_SAMPLE_CHAT_WINDOW_S  questions about the samples one client (an IPv6 one by its /64)
                    may ask without the token that a model could answer: 20 (the default) in 600 s, ten times that for
                    those only the fixed answers take. A hosted model answers only when the sample's player agreed to it
                    (sample.json consent.hostedModels: meta, openrouter, or open with consent.openWeights naming the
                    open-weights host, which must be this server's route and host now) and, without the token, the person
                    asking confirmed 18+ ("adult" in the question), else Glimmer or the fixed answers
  TEACHER_OPEN_HOSTED_DAY  questions without the token (samples, judge codes) that may reach a hosted model in a day,
                    server-wide (default 300); past it they get Glimmer or the fixed answers, so nobody can spend the credits
  TEACHER_JUDGE_CODE  one or more judge codes (8 to 128 letters, digits, - or _; separated by commas), with
                    TEACHER_TOKEN set: an upload sent with a code (the X-Teacher-Code header, which the page's form
                    fills) is taken without the token, and that code then opens only its own uploads (their status,
                    result, plan, video and questions); the upload's answer also carries a key that opens that job alone
                    (X-Teacher-Job-Key), so the wrong-code throttle never locks a judge out of a take they made. Limits per
                    code: TEACHER_JUDGE_UPLOADS a day (default 10, and three times that in attempts, refused ones too),
                    TEACHER_JUDGE_MAX_MB per upload (default 150), TEACHER_JUDGE_MAX_S of video (default 120),
                    TEACHER_JUDGE_AT_ONCE takes waiting or running (default 2), TEACHER_JUDGE_QUESTIONS a day (default 60);
                    all codes together keep TEACHER_JUDGE_DISK_MB in DATA at most (default 3000). A token's take is queued
                    ahead of every judge's. The token keeps every power it has; /api/health says whether codes are on,
                    never which
  TEACHER_COLD_START_S  the start-up allowance in the wait the page shows (default: 60 s for SAM 3.1 here before
                    this process has run a take, 240 s on Replicate when it ran none in the last 10 minutes)
  TEACHER_VOICE     browser (the default) | elevenlabs: who speaks the teacher's words (speech.py). elevenlabs: ElevenLabs
                    (elevenlabs_api.py, ELEVENLABS_API_KEY) says the lines about an upload whose player agreed to it at
                    upload (consent.voiceAtUpload, 18+) and a sample whose player did (make_sample --voice elevenlabs),
                    through POST /api/jobs/<id>/speak and /api/samples/<id>/speak; only the take's own words, each line made
                    once and kept with the take (TEACHER_VOICE_DAY_CHARS a day, server-wide, for new ones). Never a demo
                    (a Quest recording). The page falls back to the browser's own voice for any line it cannot get
                    ("voiceOut" in /api/health). Any other value, or elevenlabs without a working key, stops the server
                    at start-up
  TEACHER_JOB_MAX_S  how long one take may run, in seconds (60 to 86400): past it the job fails with plain words and the
                    worker goes on to the next (_run_limited). Default: three times what this backend should take for the
                    take's analysed seconds plus the start-up allowance, at least half an hour (_job_max_s, "jobMaxS" in
                    /api/health)
  TEACHER_REPLAY    on (the default) | off: an upload whose video was analysed before (the same bytes, sent with the same
                    piece, score, piano MIDI, start and window), or is a sample's, gets that lesson after a mock run of every
                    step instead of the pipeline (the mock run, below _enqueue); off analyses it again. TEACHER_REPLAY_S: the
                    mock run's length in seconds (default 20). POST /api/jobs with sample=<id> and no video is that sample's
                    mock run (the page's example take). Any other TEACHER_REPLAY value stops the server at start-up
  TEACHER_KEEP_DAYS days to keep an upload and its results, and a voice consent (default 7)
  TRANSCRIBE_THREADS  the note transcriber's threads (transcribe.py; default half this machine's cores, which a local
                    SAM 3.1 shares; deploy/modal sets all four, as no SAM 3.1 runs there)
  TEACHER_CHAT      off (the default) | on: the lesson is one-way feedback for now (the lesson's design, rule 4), so with off
                    the conversation and the spoken questions are not there at all: POST /api/chat, /api/jobs/<id>/ask,
                    /api/jobs/<id>/stt and every /api/voice/ route answer 404 (the WebSocket closes). on brings them back.
                    Any other value stops the server at start-up
  TEACHER_GHOST_CAP   the share of a piece's bars its recorded performance may ever be served for, over every job and
                    sample together (ghost_guard.py; default 0.15)
  TEACHER_GHOST_LINK_S  how long a link to a cut of the recorded performance holds, in seconds (default 900)
  TEACHER_GHOST_SECRET  the secret the cuts' keys and links are made from; unset, one made once and kept on the data folder

Every POST that takes JSON needs Content-Type: application/json (415 otherwise), so another site cannot make its visitors'
browsers ask the samples' questions with a simple form or text/plain fetch. Scripts are served without their comments, and
so are the pages and the style sheets (_PageFiles); every answer carries a Content-Security-Policy (default-src 'self', the
pages' own inline scripts by their hash, frame-ancestors 'none'), nosniff and no referrer.

After the pipeline (in the job's own time limit, never failing the take): the lesson's view (lesson_view.build, as
result.lesson.view), its cuts of the recorded performance (ghost_guard.build: the taught bars only, capped per job and per
piece, encrypted per job), then "Muse's voice" (voicepack.build: every line the view says, in ElevenLabs' voice, into
work/voice.mp4 and result.voicePack), only for a take whose player agreed to ElevenLabs at upload; that step is in the job's
steps whether it ran, was skipped or failed. Each of those modules is used when it is here (another part of the build adds
it), and the server runs without it. A job's reader gets each cut as {url, key, exp} in result.lesson.view.fixes[].ghost
(GET /api/jobs/<id>/ghost/<n>?exp=&sig=: signed, expiring, no-store) and each score tile of the job's window as a link (GET
/api/jobs/<id>/score/<tile>, with the media key); a sample's the same at /api/samples/<id>/..., its cuts counted against the
same cap. A judge code and a sample's visitor get the result without the exercise options, the rules' reasons, the stop and
octave rules' workings, any inline recorded performance (no caller gets that) and any exception's text (plain words; the
exception stays in the log).

After the pipeline's last weighted step the lesson is still being composed (lesson.build, Muse Wonder's judge, the lesson's
lines): a job's status names that as its own step, "Composing the lesson" (LESSON_STEP), rather than "running" at 100 %.
The upload form's windowS (30 or 60, the most of the video analysed, never a minimum) is kept in job.json options.windowS for
the pipeline; every upload has its options, so refusals apply to uploads and not to jobs re-queued from before them. A take
the pipeline refuses (pipeline.TakeRefused: too_short, no_piano_heard, wrong_piece, hands_not_found) has status "refused"
and refusal {code, message}, the message the player's own words. result.modelCalls (every model call: model, purpose,
time, used or fell back) comes with the job's result; a judge code gets it without tokens and cost. /api/health's
modelTable says which model each step runs on now (voice.model_table).

One job runs at a time: SAM 3.1 takes the whole machine (about 11 s a frame on a 4-core CPU with AMX, about 40 s without,
well under a second on a GPU), so jobs queue; jobs a restart interrupted are queued again. /api/health's "wait" says how
long a new upload would take: this backend's seconds per analysed frame, measured on the last finished takes (RATES, seeded
from DATA at start-up; until one exists a default per backend), times the frames in the analysed window, plus the takes
ahead (each by its own analysed seconds) and a start-up allowance; a queued job's status says how many takes are ahead of it.
Uploads and results are stored on this machine, in --data, and deleted after TEACHER_KEEP_DAYS: the video, the score file and
the MIDI the player's piano recorded while they filmed (the form's "performance": performance.mid, whose notes the pipeline
lines up with the video and uses as the take's notes). That MIDI file never leaves this machine; its notes are then the
take's, and go only where the take's analysis may go.
What goes to Meta's hosted Model API depends on the settings, and /api/health says which ("meta"):
the video without its sound with TEACHER_SAM=meta, the decided remarks and typed questions when
Muse words them, spoken questions with MODEL_API_KEY. When Muse Spark is reached through OpenRouter
("openrouter" in /api/health) the remarks and typed questions go to OpenRouter, which passes them only to
Meta; that is still Meta, so it is gated at least as Meta's own API is (a demo also needs
MUSE_QUEST_OPENROUTER_OK=1), with its own consent at upload
(openrouterAtUpload: a consent to Meta's API does not cover OpenRouter). With TEACHER_MUSE=open ("openWeights" in
/api/health) they go to the open-weights host instead (Muse Spark Open at Baseten, Fireworks, Modal, OpenRouter's
open-weights providers, or our own server): a third party that is not Meta, so it has its own consent at upload
(openWeightsAtUpload, naming the host; policy.openWeightsMuse), 18+, and never a demo, whatever flag is set. A
consent to one route never stands in for another's. The framing check's frames go to the route's vision model only on a
separate consent that is off by default (framingTipAtUpload; the page's "Let a Meta model look at 4 still frames" box),
and only to choose a filming tip. With TEACHER_SAM=replicate the analysed frames
(5 a second, no sound) go to Replicate instead, in batches, and the SAM records come back
("replicate" in /api/health); the server deletes each uploaded batch as soon as its run ends (a job
a restart interrupted deletes what it left when it resumes), Replicate deletes a run's input, output
and logs after an hour, and any uploaded batch the server could not delete within 24 hours of its
upload (its Files API's expiry). TEACHER_KEEP_DAYS does not cover Meta's, OpenRouter's or Replicate's own copy. When anything goes to any of them, an upload needs the player's 18+
confirmation (Meta's Terms 10.1; Replicate's Terms let an end user under 18 in only on the
customer's consent as their parent, which this server cannot give), and the upload
records what the player was told (job.json consent: metaAtUpload, openrouterAtUpload, openWeightsAtUpload,
replicateAtUpload, framingTipAtUpload), so a take uploaded while its frames stayed here is never sent after a restart
with another setting. The page sends the list it showed ("told": /api/health's meta, openrouter, replicate, and
openWeights and framingTip when it has them), and an upload whose list no longer matches this server's settings is
refused (409), so nobody agrees to a list they were not shown. An upload that is a sample's own video, byte for byte (its
download, or the stream the page plays), is that sample's player's take: it is recorded with their agreement in place of
the boxes ticked (job.json sampleOf, _sample_consent: a route they agreed to, never hosted SAM or the filming tip), and a
server that sends frames out (hosted SAM) refuses it. The access
log records requests and timings, with the per-job media key, the voice tickets and the consent ids
hidden.

Who may call what, on a server with TEACHER_TOKEN: anyone, GET /api/health, the demos (GET /api/demos and a demo's result,
plan and media; the list is empty with TEACHER_SHOW_DEMOS=0), the samples (GET /api/samples, a sample's result, plan,
compare, media/video.mp4 and download, POST /api/chat about a sample and POST /api/samples/<id>/speak, rate-limited per
client) and GET /api/code; a judge code, POST /api/jobs and its own jobs (GET /api/jobs/<id>, /result, /plan, /compare,
/media/video.mp4, POST /ask, /speak, POST /api/chat); the token, everything, spoken questions (/api/voice/*, /api/jobs/<id>/stt) included. A static file is served
to anyone, but never a README, .md or .txt (_PageFiles); a script without its comments, except the copy of three.js
under static/vendor/, served as published.

A re-take (the page's "Film this part again"): an upload may name the job it films part of again (the form's retakeOf),
which job.json records only when the uploader could open that job then (the token, or the judge code both are uploaded
with) and the two have the same score, or one of them none (_same_score); with sameScore=yes and no score of its own it takes that job's score (its reference.mid, or its library piece).
GET /api/jobs/<id>/compare is the comparison with that first take (compare.py: from the two takes' measurements only, with
fixed thresholds), for a caller who may open both (the token; the same judge code, or the re-take's own key, which opens it
for that code); 404 for any other job. A sample whose sample.json names retakeOf (make_sample.py --retake-of) is the
"after" of a pair: GET /api/samples lists the two as one card (the after's, with "before"), and GET
/api/samples/<id>/compare compares them with no token. A re-take's conversation can look the comparison up (its first
take's numbers only for a route that take's player agreed to: voice.compare_for), and its plan opens with what changed
(practice_plan.progress, fixed words).

The practice plan (GET /api/jobs/<id>/plan, GET /api/demos/<id>/plan; practice_plan.py) is made once per take: in the
pipeline's voice step, or on first view for a result from before it (kept as DATA/<id>/plan.json); Muse Wonder writes it
under the conversation's own gates, else Muse Spark, else the deterministic plan, which a demo always gets.

The conversation (POST /api/chat, voice.chat) is about one take, a job or a demo: hosted Muse (at Meta's
API or through OpenRouter) only for a take whose policy allows that route (an upload that agreed to it at
upload and confirmed 18+; a demo only with MUSE_QUEST_DATA_OK=1, through OpenRouter also MUSE_QUEST_OPENROUTER_OK=1,
and a voice consent that confirmed 18+), else Glimmer, else the fixed
answers. Spoken questions are the web user's own microphone, not Quest data: they go to Muse Voice
Transcribe only after a voice consent (POST /api/voice/consent: 18+ and "my voice goes to Meta"),
kept as DATA/consents/<id>.json and deleted after TEACHER_KEEP_DAYS like the jobs. A browser cannot
send the bearer header on a WebSocket, so the page trades its consent for a one-use ticket that
lasts a minute (POST /api/voice/ticket), and the relay (WS /api/voice/ws) opens one Meta realtime
session per spoken turn (meta_api.asr_realtime); the key never reaches the browser.
"""
import argparse
import asyncio
import base64
import functools
import glob
import hashlib
import hmac
import importlib.util
import ipaddress
import itertools
import json
import logging
import math
import os
import queue
import re
import secrets
import shutil
import threading
import time
import uuid

import anyio
from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_UPLOAD = 400 * 1024 * 1024
MAX_REF = 5 * 1024 * 1024          # the reference MIDI
MAX_PERFORMANCE = 512 * 1024       # the MIDI the player's piano recorded while they filmed (a long recording with the pedal
                                   # is about 100 KB; the test bench's MIDI_MAX)
MAX_STT = 10 * 1024 * 1024         # one spoken question
MAX_ASK = 64 * 1024                # one typed question, as JSON (and a consent or ticket request)
MAX_CHAT = 64 * 1024               # one question with the conversation so far, as JSON
FPS = 5                            # the keyboard tracker and hands.py are tuned for 5 frames a second
CONSENT_VERSION = "2026-11-01.1"   # the consent text on the page that this server records (Muse Spark Open at a named
                                   # host, and the separate filming-tip box, added; then the piano's MIDI, its file kept here with
                                   # the take and its notes going where the lesson goes; then ElevenLabs speaking the teacher's
                                   # words, when TEACHER_VOICE=elevenlabs)
VOICE_CONSENT_VERSION = "2026-10-21"   # the voice consent text on the page (18+, the voice goes to Meta)
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".3gp"}
DEMO_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")
DEMO_MEDIA = {"hands.bin": "application/octet-stream", "hands-rot.bin": "application/octet-stream", "audio.mp3": "audio/mpeg"}
CHAT_MODELS = 4                    # questions answered at once (each may be a model call); more get the fixed answer at once
PLANS = {}                         # demo id -> its practice plan (deterministic: a demo's plan never goes to a model)
PLAN_LOCKS = {}                    # job id -> the lock its first plan is built under
PLAN_TASKS = {}                    # job id -> its plan being built now: a second view waits for that one (the event loop only)
PLAN_MODELS = 2                    # plans built at once (each up to TEACHER_PLAN_TIMEOUT of model calls), on threads of
                                   # their own, so they never hold the conversation's (CHAT_THREADS)
# the live voice relay (WS /api/voice/ws)
TICKET_S = 60                      # a ticket opens one WebSocket within a minute, once
MAX_TICKETS = 1000                 # tickets waiting to be used, server-wide
CONSENT_TICKETS = 4                # and for one voice consent (the page uses each within a second or two)
VOICE_SESSIONS = 8                 # Meta realtime sessions open at once, server-wide (Meta allows 256 per tenant)
VOICE_TURN_S = 60                  # one spoken question: the turn ends by itself after a minute of audio,
VOICE_TURN_GRACE_S = 5             # or this much later by the clock, however little audio came
VOICE_FRAME = 48000                # the largest audio frame taken: one second at 24 kHz (the page sends 80 ms)
VOICE_IDLE_S = 120                 # a conversation with nothing from the page for this long is closed
VOICE_MAX_S = 30 * 60              # and one that has run for this long
CONSENT_SOCKETS = 2                # conversations open at once on one voice consent (two tabs; more would let
                                   # one browser hold the server's VOICE_SESSIONS)
CONSENTS_PER_CLIENT = 20           # voice consents one client address may create in CONSENT_WINDOW_S
CONSENT_WINDOW_S = 3600
# the judge codes (TEACHER_JUDGE_CODE): sent as this header, by the page's upload form and every call after it
CODE_HEADER = "x-teacher-code"
CODE_RE = re.compile(r"[A-Za-z0-9_-]{8,128}")
CODE_FAILS_PER_CLIENT = 20         # wrong codes one client address may send in CODE_FAIL_WINDOW_S, then 429
CODE_FAIL_WINDOW_S = 900
CODE_DAY_S = 86400                 # TEACHER_JUDGE_UPLOADS counts a code's uploads over the last day
# a judge's upload is answered with a key of its own (an HMAC under the token), which the page sends back as this header
# to open that one job: reading a code's own takes never goes through the wrong-code throttle (_auth_job)
JOB_KEY_HEADER = "x-teacher-job-key"
CODE_TRIES_PER_UPLOAD = 3          # upload attempts a code may make a day, refused ones too, per upload it is allowed
TOKEN_MIN = 24                     # TEACHER_TOKEN's length at least, to listen beyond this machine (main): what the deploy
                                   # workflow's secret check lets through, so a secret it passes never stops the live app
TOKEN_ADVISED = 32                 # a TEACHER_TOKEN under this many characters is warned about at start-up
CODE_MIN_ADVISED = 22              # a judge code under this many characters is warned about at start-up
STORE_MAX = 5000                   # client addresses a rate limit remembers (_recent); past it the quietest are dropped
OPEN_DAY_S = 86400                 # TEACHER_OPEN_HOSTED_DAY counts the hosted questions without the token over a day
SAMPLE_MODELS = ("none", "openrouter", "meta", "open")   # sample.json consent.hostedModels: what the player agreed may answer
                                                        # (open: Muse Spark Open at the host consent.openWeights names)
# the honest wait (/api/health "wait"): seconds per analysed frame for each SAM backend until this server has timed a take of
# its own (the whole job, all steps, over its frames). SAM 3.1 itself: 11 s a frame on a CPU with native bf16, about 40 without
# (sam31_detector runs float32 there), well under a second on a GPU; placing the hands on the keys is CPU work, about 2 s a frame
# on 4 cores (README.md), and the listening and the rest add a little
S_PER_FRAME = {"local (cuda)": 3.0, "local (cpu)": 13.5, "local (cpu, no bf16)": 42.5, "replicate": 3.5, "meta": 3.5}
RATE_KEEP = 5                      # the median of a backend's last 5 timed takes
WINDOWS = (30, 60)                 # the upload form's choice of how much of the video is analysed (job.json options.windowS)
JOB_MAX_MIN_S = 1800               # a job's time limit is at least half an hour (TEACHER_JOB_MAX_S overrides _job_max_s)
JOB_MAX_FACTOR = 3                 # and three times what this backend should take for it, so a slow CPU host is not cut short
# the step after the pipeline's last weighted one: lesson.build, Muse Wonder's judge and the lesson's lines run after the
# progress reaches 100 %, which the page showed as "running" at a full bar; it is its own step on the page (_with_lesson)
LESSON_STEP = dict(id="lesson", label="Composing the lesson")
# after the lesson: its lines said in ElevenLabs' voice (voicepack.build), for a take whose player agreed to it; shown as a
# step of its own whether it ran, was skipped or failed, and never a reason for the take to fail
VOICE_STEP = dict(id="museVoice", label="Muse's voice")
# the files of the recorded performance's cuts and the score's tiles are a job's own: see ghost_guard.py
GHOST_DIR = "ghost"
SAMPLE_GHOSTS = "sample-ghosts"            # in DATA: a sample's cuts, made the first time its lesson is opened
TILE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}")
TILE_ROOT = os.path.join(HERE, "library")  # a score tile is served only from under here (score_assets.tile's files)
TILE_TYPES = {".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
LIMITS_FILE = "limits.json"                # in DATA: the judge codes' and the open questions' daily counts (_save_limits)
PERSIST = dict(limits=False)               # main() turns it on: the counts are then kept in DATA/LIMITS_FILE
# result.modelCalls as a judge code sees it: which model ran, what for, how long, and whether its words were used or the
# program's own took over (the page's "How this was measured"); its tokens and cost stay with the token, as the plan's do
MODEL_CALL_PUBLIC = ("provider", "model", "purpose", "ms", "ok", "used")
COLD_LOCAL_S = 60.0                # loading SAM 3.1 before this process's first take (25 s from the page cache, longer cold)
COLD_REPLICATE_S = 240.0           # a Replicate model that ran nothing for REPLICATE_IDLE_S boots again
REPLICATE_IDLE_S = 600

app = FastAPI(title="Museverse Teacher (web test)", docs_url=None, redoc_url=None)
DATA = os.environ.get("TEACHER_DATA", os.path.join(HERE, "data"))
DEMOS = os.environ.get("DEMOS_DIR", os.path.join(HERE, "data", "demos"))
SAMPLES = os.environ.get("SAMPLES_DIR", os.path.join(HERE, "data", "samples"))
JOBS = {}                      # id -> status dict (in memory; results are on disk)
# (0 for a take uploaded with the token, 1 for a judge code's; the order it came in; the job): the team's own takes go
# first, so a judge code's queue never holds up a live demo
QUEUE = queue.PriorityQueue()
QSEQ = itertools.count()
LOCK = threading.Lock()
WAITING = []                   # the queued job ids in the queue's order (for "N takes ahead of yours")
JOB_INFO = {}                  # queued or running job id -> {code: its judge code id or None, analysedS: seconds it analyses}
RUNNING = dict(id=None, t0=None)   # the job the worker runs now, and when it started (time.time())
RATES = []                     # [{backend, sPerFrame, at}] of the last finished takes (_measure), newest last
WARM = dict(at=None)           # when SAM 3.1 was last at work in this process (a take's hands step): no start-up allowance
CODE_PENDING = {}              # judge code id -> its uploads being received now (counted against its daily limit)
CODE_TRIED = {}                # judge code id -> times it started an upload (refused ones too: TEACHER_JUDGE_UPLOADS x 3 a day)
CODE_ASKED = {}                # judge code id -> times it asked about its own takes (TEACHER_JUDGE_QUESTIONS a day)
CODE_FAILS = {}                # client address -> times it sent a wrong judge code
SAMPLE_ASKED = {}              # client address -> times it asked about a sample without the token
SAMPLE_SPOKEN = {}             # client address -> times it had a sample's line spoken that was not made yet (no token)
OPEN_HOSTED = []               # times a question without the token was let reach a hosted model (TEACHER_OPEN_HOSTED_DAY)
SAMPLE_PLANS = {}              # (sample id, result mtime) -> its deterministic plan, for a sample saved without one
TICKETS = {}                   # voice ticket -> (consent id, expiry on time.monotonic()); in memory, one use each
TICKET_KEYWORDS = {}           # voice ticket -> the take's words its spoken turns are biased with (_stt_keywords), gone with it
VOICE = dict(open=0)           # Meta realtime sessions open now
SOCKETS = {}                   # voice consent id -> conversations (WebSockets) open on it now
CONSENT_MADE = {}              # client address -> times (time.monotonic()) it created a voice consent
CHAT = dict(open=0)            # questions being answered now (changed on the event loop only)
CHAT_THREADS = anyio.CapacityLimiter(CHAT_MODELS)   # their own threads, not starlette's shared pool
PLAN_THREADS = anyio.CapacityLimiter(PLAN_MODELS)
log = logging.getLogger("teacher")


class _HideMediaKey(logging.Filter):
    """The access log keeps each request's path but not the per-job media key (?k=): anyone who
    can read the log could otherwise stream that player's video. Nor a voice ticket (?ticket=, which
    uvicorn logs on its error logger when a WebSocket opens) or a voice consent id (?consent=)."""
    KEY = re.compile(r"([?&](?:k|ticket|consent)=)[^&\s\"]*")

    def filter(self, record):
        if isinstance(record.args, tuple):
            record.args = tuple(self.KEY.sub(r"\1hidden", a) if isinstance(a, str) else a for a in record.args)
        return True


logging.getLogger("uvicorn.access").addFilter(_HideMediaKey())
logging.getLogger("uvicorn.error").addFilter(_HideMediaKey())


def _token_ok(request: Request):
    """The request carries the full token (or this server has none: open, local testing only)."""
    token = os.environ.get("TEACHER_TOKEN")
    if not token:
        return True
    got = request.headers.get("authorization", "")
    # bytes: compare_digest raises on a str with non-ASCII characters (a 500 instead of a 401)
    return hmac.compare_digest(got.encode("latin-1", "replace"), f"Bearer {token}".encode())


def _auth(request: Request):
    if not _token_ok(request):
        raise HTTPException(401, "a valid access token is needed")


def _client(request):
    """The client's address as the rate limits count it: an IPv6 address by its /64, which one subscriber is usually given
    whole (rotating addresses inside it would otherwise slip every limit)."""
    host = request.client.host if request.client else "?"
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return host
    if ip.version == 6:
        if ip.ipv4_mapped:
            return str(ip.ipv4_mapped)
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return str(ip)


def _env_num(name, default, lo, hi=None, integer=False):
    """A number setting: default when unset or empty; ValueError (main() refuses to start) when it is not a number in range."""
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        v = float(raw)
    except ValueError:
        v = math.nan
    if not math.isfinite(v) or v < lo or (hi is not None and v > hi) or (integer and v != int(v)):
        raise ValueError(f"{name} must be a number from {lo:g}{f' to {hi:g}' if hi is not None else ' up'}, not {raw.strip()[:20]!r}")
    return int(v) if integer else v


def _setting(name, default, lo, hi=None, integer=False):
    """_env_num at run time: a bad value (main() refuses it at start-up) counts as the default."""
    try:
        return _env_num(name, default, lo, hi, integer)
    except ValueError:
        return default


def _codes():
    """The judge codes in TEACHER_JUDGE_CODE (separated by commas or spaces); main() refuses one that is not 8 to 128 of
    [A-Za-z0-9_-], and this drops it at run time too."""
    return [c for c in re.split(r"[\s,]+", os.environ.get("TEACHER_JUDGE_CODE") or "") if CODE_RE.fullmatch(c)]


def _codes_on():
    """Judge codes only mean something on a server with a token: an open one takes every upload anyway."""
    return bool(os.environ.get("TEACHER_TOKEN")) and bool(_codes())


def _judge_limits():
    """A judge code's limits, as GET /api/code and /api/health give them: uploads a day, bytes and seconds an upload, takes
    waiting or being analysed at once, questions a day about its own takes."""
    return dict(perDay=_setting("TEACHER_JUDGE_UPLOADS", 10, 1, 1000, integer=True),
                maxBytes=int(_setting("TEACHER_JUDGE_MAX_MB", 150, 1, MAX_UPLOAD / 2**20) * 2**20),
                maxS=_setting("TEACHER_JUDGE_MAX_S", 120, 5, 3600),
                atOnce=_setting("TEACHER_JUDGE_AT_ONCE", 2, 1, 100, integer=True),
                questionsPerDay=_setting("TEACHER_JUDGE_QUESTIONS", 60, 1, 100000, integer=True))


def _judge_disk_bytes():
    """TEACHER_JUDGE_DISK_MB (default 3000): how much the judge codes' uploads, with their results, may take of DATA."""
    return int(_setting("TEACHER_JUDGE_DISK_MB", 3000, 10, 10**7) * 2**20)


def _code_jobs_bytes():
    """The bytes the judge codes' job folders take now (every code together)."""
    n = 0
    for jid in os.listdir(DATA) if os.path.isdir(DATA) else []:
        d = os.path.join(DATA, jid)
        if _is_id(jid) and _job_file(d).get("codeId"):
            for root, _, files in os.walk(d):
                for f in files:
                    try:
                        n += os.path.getsize(os.path.join(root, f))
                    except OSError:
                        pass
    return n


def _save_limits():
    """The daily counts a restart must not reset (CODE_TRIED, CODE_ASKED, OPEN_HOSTED: wall-clock times) kept in
    DATA/limits.json, so Modal scaling the container to zero never hands a judge code a fresh day: by a server main()
    started (PERSIST["limits"]), never by one a test drives without it. Called with LOCK held."""
    if not PERSIST["limits"]:
        return
    try:
        os.makedirs(DATA, exist_ok=True)
        tmp = os.path.join(DATA, LIMITS_FILE + ".tmp")
        with open(tmp, "w") as f:
            json.dump(dict(codeTried=CODE_TRIED, codeAsked=CODE_ASKED, openHosted=OPEN_HOSTED), f)
        os.replace(tmp, os.path.join(DATA, LIMITS_FILE))
    except OSError as e:
        log.warning("the daily counts were not saved: %s", e)


def _load_limits(now=None):
    """At start-up: the counts _save_limits kept, those of the last day only; nothing when there are none."""
    now = now or time.time()
    try:
        with open(os.path.join(DATA, LIMITS_FILE)) as f:
            got = json.load(f)
    except (OSError, ValueError):
        return
    if not isinstance(got, dict):
        return

    def recent(ts):
        return [t for t in ts if isinstance(t, (int, float)) and 0 <= now - t < CODE_DAY_S] if isinstance(ts, list) else []
    with LOCK:
        for name, store in (("codeTried", CODE_TRIED), ("codeAsked", CODE_ASKED)):
            for k, ts in (got.get(name) or {}).items() if isinstance(got.get(name), dict) else ():
                if recent(ts):
                    store[str(k)] = recent(ts)
        OPEN_HOSTED[:] = recent(got.get("openHosted"))


def _code_active(cid):
    """This judge code's takes waiting or being analysed now, and its uploads being received."""
    return sum(1 for j in JOB_INFO.values() if j.get("code") == cid) + CODE_PENDING.get(cid, 0)


def _recent(store, who, window_s, now):
    """store[who]'s times inside the window. The store is kept small (called under LOCK): past STORE_MAX keys, the clients
    gone quiet are dropped and, if that is not enough, the longest quiet down to three quarters, so the scan runs once per
    STORE_MAX / 4 new clients at most rather than on every request."""
    if len(store) > STORE_MAX:
        for k in [k for k, ts in store.items() if not ts or now - ts[-1] >= window_s]:
            del store[k]
        if len(store) > STORE_MAX * 3 // 4:
            for k in sorted(store, key=lambda k: store[k][-1])[:len(store) - STORE_MAX * 3 // 4]:
                del store[k]
    return [t for t in store.get(who, []) if now - t < window_s]


GATE_VISITOR_RE = re.compile(r"gv-([0-9a-f]{32})-([0-9a-f]{16})")


def gate_visitor_code(gate_token, visitor):
    """The judge code of one browser behind the password gate (the hosted deploy's gate sends it): its
    visitor id (a random cookie) signed with TEACHER_GATE_TOKEN, so every browser that typed the password has its own
    takes and its own caps (TEACHER_JUDGE_*), and no code can be made without the gate's secret."""
    sig = hmac.new(gate_token.encode(), b"museverse-gate-visitor:" + visitor.encode(), "sha256").hexdigest()[:16]
    return f"gv-{visitor}-{sig}"


def gate_visitor_code_ok(code):
    """Whether code is a browser's gate code signed with this server's TEACHER_GATE_TOKEN (32 characters or more)."""
    gate = os.environ.get("TEACHER_GATE_TOKEN") or ""
    m = GATE_VISITOR_RE.fullmatch(code or "")
    return bool(m) and len(gate) >= 32 and hmac.compare_digest(code.encode(), gate_visitor_code(gate, m.group(1)).encode())


def _code_id(request):
    """The id of the valid judge code in the request's X-Teacher-Code header, else None: an HMAC of the code under the
    token (job.json "codeId"), never the code itself, so a job folder does not hold a code that works. A client that has
    sent CODE_FAILS_PER_CLIENT wrong codes within CODE_FAIL_WINDOW_S is refused (429) before its next one is looked at; a
    value that cannot be a code (not 8 to 128 of [A-Za-z0-9_-]) or is the token itself (the page's one box takes both)
    is not counted as a guess."""
    got = request.headers.get(CODE_HEADER)
    if not got or not _codes_on():
        return None
    who, now = _client(request), time.monotonic()
    with LOCK:
        if len(_recent(CODE_FAILS, who, CODE_FAIL_WINDOW_S, now)) >= CODE_FAILS_PER_CLIENT:
            raise HTTPException(429, f"too many wrong judge codes from here; please try again in {CODE_FAIL_WINDOW_S // 60} minutes")
    b = got.strip().encode("utf-8", "replace")
    match = None
    for c in _codes():                             # every code compared, in constant time
        if hmac.compare_digest(b, c.encode()):
            match = c
    if match is None and gate_visitor_code_ok(got.strip()):
        match = got.strip()                        # a browser's own code behind the password gate: its own takes and caps
    if match is None:
        if CODE_RE.fullmatch(got.strip()) and not hmac.compare_digest(b, os.environ["TEACHER_TOKEN"].encode()):
            with LOCK:
                CODE_FAILS[who] = _recent(CODE_FAILS, who, CODE_FAIL_WINDOW_S, now) + [now]
        return None
    return hmac.new(os.environ["TEACHER_TOKEN"].encode(), b"judge-code:" + match.encode(), "sha256").hexdigest()[:24]


def _need_access():
    return "a valid access token or judge code is needed" if _codes_on() else "a valid access token is needed"


def _job_key(jid):
    """The key POST /api/jobs gives a judge's upload: it opens that job alone (X-Teacher-Job-Key), with no code and no
    throttle, so 20 wrong codes from a shared venue address cannot lock a judge out of a take they made. A re-take's key
    also opens its comparison with the first take (GET .../compare, and the block its conversation looks up), which holds
    that take's numbers: the two were uploaded with the same judge code (_retake_of), but the first take's own result,
    plan and video still need its own key or the code. Derived from the token, like the media key, but not the same: a
    video link does not open the result."""
    return hmac.new(os.environ.get("TEACHER_TOKEN", "").encode(), b"job-access:" + jid.encode(), "sha256").hexdigest()[:32]


def _auth_job(request, jid):
    """The full token (-> None), or what a judge code's upload carries (-> its code id): the job's own key
    (X-Teacher-Job-Key, from the upload's answer) or the code it was uploaded with. A code opens its own uploads only
    (another job, or one that does not exist, is 404 to it, as it is not its business which ids exist)."""
    if _token_ok(request):
        return None
    key = request.headers.get(JOB_KEY_HEADER)
    if key and _codes_on() and _is_id(jid) and hmac.compare_digest(key.encode("utf-8", "replace"), _job_key(jid).encode()):
        cid = _job_file(_job_dir(jid)).get("codeId")
        if cid:
            return cid
    cid = _code_id(request)
    if not cid:
        raise HTTPException(401, _need_access())
    if _job_file(_job_dir(jid)).get("codeId") != cid:
        raise HTTPException(404, "no such job")
    return cid


def _code_used(cid, now=None):
    """Uploads this judge code made over the last day: its jobs still on disk (job.json "codeId"), and those being
    received now. A refused upload leaves no folder, so it does not count, and nor does a sample's mock run (job.json
    "sample": the page's example take costs nothing and uploads nothing)."""
    now = now or time.time()
    n = 0
    for jid in os.listdir(DATA) if os.path.isdir(DATA) else []:
        if _is_id(jid):
            j = _job_file(os.path.join(DATA, jid))
            created = j.get("created")
            n += (j.get("codeId") == cid and not j.get("sample") and isinstance(created, (int, float))
                  and now - created < CODE_DAY_S)
    return n + CODE_PENDING.get(cid, 0)


def _length(request: Request, limit, too_large):
    """Refuse a body before any of it is read: one that does not declare its length (the server
    frames the body by it, so a declared length also bounds what is read) or declares too much."""
    try:
        n = int(request.headers["content-length"])
    except (KeyError, ValueError):
        raise HTTPException(411, "please send the request with a Content-Length") from None
    if n > limit:
        raise HTTPException(413, too_large)


def _keep_days():
    """TEACHER_KEEP_DAYS as a number of days; main() refuses to start when it is not one."""
    v = float(os.environ.get("TEACHER_KEEP_DAYS", "7"))
    if not (math.isfinite(v) and v > 0):
        raise ValueError(f"TEACHER_KEEP_DAYS={v}")
    return v


def _meta():
    """Which features would send the player's data to Meta's hosted Model API with the current
    settings: hosted SAM (the video without sound), Muse wording (the decided remarks and typed
    questions), Muse Voice Transcribe (spoken questions). Meta's API terms make any of them 18+."""
    import voice as V
    return dict(sam=os.environ.get("TEACHER_SAM", "local") == "meta",
                muse=V.backends()["route"] == "meta",
                stt=_stt_key())


def _stt_key():
    """Speech-to-text needs MODEL_API_KEY, and one Meta has not refused (voice.meta_key_refused)."""
    import voice as V
    return bool(os.environ.get("MODEL_API_KEY")) and not V.meta_key_refused()


def _openrouter():
    """What would go to OpenRouter with the current settings: Muse wording (the decided remarks and typed
    questions) when Muse Spark is reached through it, with the model, the providers OpenRouter may pass them
    to (Meta only, for Muse Spark), its data_collection filter, and whether only uploads may use it. 18+ like
    Meta's API: OpenRouter passes it to Meta."""
    import voice as V
    info = V.openrouter_info()
    return dict(muse=True, **info) if info else dict(muse=False)


def _open_weights():
    """What would go to the open-weights host with the current settings: Muse wording, the plan and the typed questions
    when it is the hosted route (TEACHER_MUSE=open, or on with nothing else set up), with the host, who runs the model
    there, the model and its family (open_api.describe; never a key). 18+ like the other outside services."""
    import voice as V
    info = V.open_info()
    return dict(muse=True, **info) if info else dict(muse=False)


def _framing_tip():
    """What the upload form's separate filming-tip box offers now (framing_tip.offer): {"available": False}, or the
    route, the model, who chooses and who receives the 4 frames."""
    import framing_tip as FT
    return FT.offer()


def _replicate():
    """What would go to Replicate with the current settings: the analysed frames (TEACHER_SAM=replicate,
    our own SAM 3.1 model there). Its Terms accept an end user under 18 only on the customer's consent
    as their parent, which this server cannot give, so it is 18+ like Meta's Model API."""
    return dict(sam=os.environ.get("TEACHER_SAM", "local") == "replicate")


def _replicate_config_problem():
    """Why TEACHER_SAM=replicate cannot run with these settings (token, owner, target, API address,
    batch size, time limit), or None. Read-only: nothing is sent."""
    import replicate_api as R
    import video
    try:
        R._token()
        R.owner_from_env()
        R.target_from_env()
        R.base()
        video.replicate_limits()
    except R.ReplicateError as e:
        return e.message
    return None


def _outside(meta, rep, orr=None, ow=None):
    """The outside services an upload's data goes to, named as the page names them."""
    ow = ow or {}
    own = ("OpenRouter" if ow.get("host") == "openrouter" else "our own model server" if ow.get("host") == "custom"
           else ow.get("hostName") or "the open-weights host")
    import speech as SP
    return [n for n, on in (("Meta's Model API", any(meta.values())), ("OpenRouter", bool((orr or {}).get("muse"))),
                            (own, bool(ow.get("muse"))), ("Replicate", any(rep.values())),
                            ("ElevenLabs", SP.offer()["on"])) if on]


def _quest_ok():
    """MUSE_QUEST_DATA_OK=1: Meta has said in writing that Quest data may go to its hosted API."""
    return os.environ.get("MUSE_QUEST_DATA_OK") == "1"


def _quest_openrouter_ok():
    """MUSE_QUEST_OPENROUTER_OK=1 as well: Meta's written OK names OpenRouter, the third party that would see Quest
    data on its way to Meta (an OK to Meta's own API may not cover it)."""
    return _quest_ok() and os.environ.get("MUSE_QUEST_OPENROUTER_OK") == "1"


def _is_id(x):
    """A job, consent or ticket id this server made: 32 lowercase hex characters."""
    return isinstance(x, str) and len(x) == 32 and all(c in "0123456789abcdef" for c in x)


def _media_key(jid):
    """A per-job key for the video link, so a <video> element (which cannot send the bearer
    header) can stream with byte ranges. Derived from the token: it changes when the token does."""
    token = os.environ.get("TEACHER_TOKEN", "")
    return hmac.new(token.encode(), jid.encode(), "sha256").hexdigest()[:32]


def _job_dir(jid):
    if not _is_id(jid):
        raise HTTPException(404, "no such job")
    d = os.path.join(DATA, jid)
    if not os.path.isdir(d):
        raise HTTPException(404, "no such job")
    return d


def _job_file(d):
    """The job's job.json ({} when it is missing or unreadable)."""
    try:
        with open(os.path.join(d, "job.json")) as f:
            j = json.load(f)
        return j if isinstance(j, dict) else {}
    except (OSError, ValueError):
        return {}


def _queued(jid, name):
    return dict(id=jid, status="queued", step=None, progress=0.0, steps=[], error=None, etaS=None, name=name)


def _refusal_of(x):
    """A refused take's {code, message} as the page is told it (pipeline.TakeRefused, result.json job.refusal), or None
    when x is not one. Its evidence (the numbers behind it) stays in result.json."""
    if not isinstance(x, dict) or not isinstance(x.get("code"), str) or not isinstance(x.get("message"), str):
        return None
    return dict(code=x["code"][:40], message=x["message"][:600])


def _status(jid):
    with LOCK:
        st = JOBS.get(jid)
        st = dict(st) if st else None
    if st:
        place = _place(jid) if st.get("status") == "queued" else None
        if place:                              # "N takes ahead of yours", and when it should start
            st.update(ahead=place["ahead"], startS=place["startS"], jobS=place["jobS"])
        return st
    d = _job_dir(jid)
    name = _job_file(d).get("name")
    rp = os.path.join(d, "result.json")
    if os.path.exists(rp):
        r = json.load(open(rp))
        jb = r.get("job", {})
        ok = jb.get("status") == "done"
        refusal = _refusal_of(jb.get("refusal") or r.get("refusal")) if jb.get("status") == "refused" else None
        st = dict(id=jid, status="done" if ok else "refused" if refusal else "failed", step=None, progress=1.0 if ok else 0.0,
                  steps=r.get("pipeline", {}).get("steps", []), error=jb.get("error"), etaS=None, name=name)
        if refusal:
            st["refusal"] = refusal
        return st
    return dict(id=jid, status="failed", step=None, progress=0.0, steps=[], error="this job was interrupted; please upload again",
                etaS=None, name=name)


_DEVICE = {}


def _torch_device(probe=True):
    """"cuda", "cpu" or "unknown": what torch says this machine has, asked once and kept. Importing torch takes seconds
    and holds the interpreter while it does, so main() asks at start-up; probe=False never asks (None when nobody has)."""
    if "v" not in _DEVICE:
        if not probe:
            return None
        try:
            import torch
            dev = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            dev = "unknown"
        _DEVICE["v"] = dev
    return _DEVICE["v"]


def _sam_backend(probe=True):
    """Where SAM 3.1 runs, as /api/health names it: "local (cuda)", "local (cpu)", "replicate" or "meta". probe=False:
    a bare "local" when torch has not been asked yet (_torch_device), rather than importing it."""
    sam = os.environ.get("TEACHER_SAM", "local")
    if sam != "local":
        return sam
    dev = _torch_device(probe)
    return f"{sam} ({dev})" if dev else sam


_BF16 = {}


def _native_bf16():
    """Whether this CPU computes bf16 natively (AMX or AVX512-BF16): SAM 3.1 runs about 4 times faster on it."""
    if "v" not in _BF16:
        try:
            flags = open("/proc/cpuinfo").read()
            _BF16["v"] = bool(re.search(r"\b(amx_bf16|avx512_bf16)\b", flags))
        except OSError:
            _BF16["v"] = True
    return _BF16["v"]


def _rate_key(label=None):
    """The key a timed take is kept under: the backend, and for SAM 3.1 here whether it had a GPU. A result's own label
    ("local (cpu)", "replicate (cuda, ...)", or a bare "local" when every frame was segmented before) is read the same way,
    a bare one as this server's current device."""
    s = str(label or "").strip().lower()
    if not s or s == "local":
        s = _sam_backend().lower()
    if s.startswith("local"):
        return "local (cuda)" if "cuda" in s else "local (cpu)"
    return s.split(" ")[0]


def _default_s_per_frame(key):
    if key == "local (cpu)" and not _native_bf16():
        return S_PER_FRAME["local (cpu, no bf16)"]
    return S_PER_FRAME.get(key, S_PER_FRAME["local (cpu)"])


def _measure(d, at=None):
    """A finished job's seconds per analysed frame (its run's own time, pipeline.wallMs, else its steps' times added up,
    over its frames), kept in RATES; None (nothing kept)
    for a failed take, one the framing check cut short (4 frames looked at, not all of them), one too short to say, and
    one that reused SAM's output: a take a restart interrupted and the worker ran again (its attempts file), whose frames
    were segmented before (the hands step's note), would read as a few times faster than any take is."""
    try:
        with open(os.path.join(d, "result.json")) as f:
            r = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(r, dict) or (r.get("job") or {}).get("status") != "done" or (r.get("framing") or {}).get("skipped"):
        return None
    if _job_file(d).get("replayOf"):           # a repeat upload's mock run (_replay): another take's times, not its own
        return None
    steps = (r.get("pipeline") or {}).get("steps") or []
    frames = len((r.get("media") or {}).get("frameTimes") or [])
    hands = next((s for s in steps if isinstance(s, dict) and s.get("id") == "hands"), None)
    # the whole run's own time when the pipeline gives it (pipeline.wallMs: its steps overlap, so their sum overstates it)
    wall = (r.get("pipeline") or {}).get("wallMs")
    ms = float(wall) if isinstance(wall, (int, float)) and not isinstance(wall, bool) and wall > 0 else \
        sum(float(s.get("ms") or 0) for s in steps if isinstance(s, dict) and isinstance(s.get("ms"), (int, float)))
    if frames < 10 or not hands or hands.get("state") != "done" or ms <= 0:
        return None
    if _attempts(d) > 1 or "segmented before" in str(hands.get("note") or ""):
        return None
    got = dict(backend=_rate_key((r.get("pipeline") or {}).get("samBackend")), sPerFrame=ms / 1000.0 / frames, at=at or time.time())
    with LOCK:
        RATES.append(got)
        del RATES[:-4 * RATE_KEEP]
    return got


def _seed_rates():
    """At start-up: the timed takes still in DATA, oldest first, so the wait is measured from the first page view."""
    found = []
    for jid in os.listdir(DATA) if os.path.isdir(DATA) else []:
        p = os.path.join(DATA, jid, "result.json")
        if _is_id(jid) and os.path.isfile(p):
            found.append((os.path.getmtime(p), os.path.join(DATA, jid)))
    for mt, d in sorted(found)[-4 * RATE_KEEP:]:
        _measure(d, at=mt)


def _s_per_frame(key):
    """(seconds per analysed frame, how many timed takes it is the median of: 0 for the backend's default)."""
    with LOCK:
        got = [r["sPerFrame"] for r in RATES if r["backend"] == key][-RATE_KEEP:]
    if not got:
        return _default_s_per_frame(key), 0
    got = sorted(got)
    mid = len(got) // 2
    return (got[mid] if len(got) % 2 else (got[mid - 1] + got[mid]) / 2), len(got)


def _cold_s(key, now=None):
    """The start-up allowance: SAM 3.1 loading here before this process has run a take, a Replicate model booting after
    REPLICATE_IDLE_S with nothing run; none for Meta's hosted SAM, nor while the take running now has reached its hands
    step (SAM 3.1 is loaded, or the model awake, for the takes after it). TEACHER_COLD_START_S replaces the allowance."""
    now = now or time.time()
    last = WARM["at"]
    with LOCK:
        t0 = RUNNING["t0"] if RUNNING["id"] else None
    if t0 is not None and last is not None and last >= t0:
        return 0.0
    if key.startswith("local"):
        cold = last is None
        dflt = COLD_LOCAL_S
    elif key == "replicate":
        cold = last is None or now - last > REPLICATE_IDLE_S
        dflt = COLD_REPLICATE_S
    else:
        return 0.0
    return _setting("TEACHER_COLD_START_S", dflt, 0, 3600) if cold else 0.0


def _analysed_s(video_s, start_s=None, win=None):
    """The seconds of a video the analysis looks at: the window (window_s(), 60 s by default) at most, from the asked
    start; the whole window when the video's length is not known."""
    win = win or _window_s() or 60.0
    if not isinstance(video_s, (int, float)) or not video_s > 0:
        return win
    return max(1.0, min(win, video_s - (start_s or 0.0)))


def _wait(now=None):
    """How long an upload made now would take: the takes ahead (the one running, by what is left of its expected time,
    and the queued ones, each by its own analysed seconds, JOB_INFO), a start-up allowance, then its own window (the
    frames analysed at most, window_s() at FPS, times the backend's seconds per frame: the page prices a picked video by
    its own length, min(its length, windowS) x frames / windowS). Times in seconds."""
    now = now or time.time()
    label = _sam_backend()
    key = _rate_key(label)
    spf, n = _s_per_frame(key)
    win = _window_s() or 60.0
    frames = int(round(win * FPS))
    job_s = spf * frames

    def cost(jid):
        return spf * round(float((JOB_INFO.get(jid) or {}).get("analysedS") or win) * FPS)
    with LOCK:
        ahead = [cost(j) for j in WAITING]
        rid, t0 = RUNNING["id"], RUNNING["t0"] if RUNNING["id"] else None
        run_s = cost(rid) if t0 else 0.0
    left = max(run_s - (now - t0), 0.1 * run_s) if t0 else 0.0
    cold = _cold_s(key, now)
    return dict(samBackend=label, sPerFrame=round(spf, 2), measured=n, windowS=win, frames=frames, jobS=round(job_s),
                coldStartS=round(cold), queued=len(ahead), running=t0 is not None, runningLeftS=round(left),
                aheadS=round(left + sum(ahead)), totalS=round(cold + left + sum(ahead) + job_s), aheadEach=[round(a) for a in ahead])


def _job_max_s(analysed_s=None, now=None):
    """How long one job may run before it is failed, in seconds: TEACHER_JOB_MAX_S when set (60 to 86400), else
    JOB_MAX_FACTOR times what this backend should take for its analysed seconds (the window by default) plus the start-up
    allowance, and never under JOB_MAX_MIN_S. A judge watching a take that will never finish (a step that hangs, a model
    that never answers) is told so plainly instead of a bar that stops moving; a slow CPU host's normal take still fits."""
    fixed = _setting("TEACHER_JOB_MAX_S", 0, 60, 86400)
    if fixed:
        return float(fixed)
    # priced without importing torch: the worker asks this as a job starts, and seconds spent importing it there held up
    # the server (main() has asked already; a server started otherwise prices SAM 3.1 here as the CPU, the longer limit)
    label = _sam_backend(probe=False)
    key = _rate_key("local (cpu)" if label == "local" else label)
    spf, _ = _s_per_frame(key)
    win = float(analysed_s or _window_s() or 60.0)
    return max(float(JOB_MAX_MIN_S), JOB_MAX_FACTOR * (spf * win * FPS + _cold_s(key, now)))


def _timed_out_words(limit_s):
    """What the page says about a job stopped by its time limit: plain words, no error class (the page reads a class
    name as our fault and a missing piece as the video's)."""
    m = round(limit_s / 60)
    span = f"{round(limit_s)} seconds" if limit_s < 90 else f"{m} minutes"
    return (f"This take was stopped: it ran past the {span} one take may take on this server. Please try again later, "
            "or choose 30 s to analyse a shorter part of your video.")


def _with_lesson(steps, progress, done=False):
    """The pipeline's steps with LESSON_STEP after them (unless the pipeline names its own): "waiting" until every step
    is over, then "running" (the lesson being composed past 100 %), "done" when the job is. [] stays []. A step is over
    in any state but waiting or running: the pipeline carries on past a step that failed (the fingertips, the octave
    vote), so "done or skipped" alone would leave the lesson waiting at 100 % while it is being composed."""
    steps = [dict(s) for s in steps or [] if isinstance(s, dict)]
    if done:                                   # the job is done: so is the lesson, whoever named its step
        steps = [dict(s, state="done") if s.get("id") == LESSON_STEP["id"] else s for s in steps]
    if not steps or any(s.get("id") == LESSON_STEP["id"] for s in steps):
        return steps
    over = all(s.get("state") not in ("waiting", "running") for s in steps) and (progress or 0) >= 0.999
    state = "done" if done else "running" if over else "waiting"
    return steps + [dict(LESSON_STEP, state=state, ms=None)]


# ---------------------------------------------------------------- after the pipeline: the view, the cuts, Muse's voice

_LANES = {}


def _lane(name):
    """A module another part of the build adds (lesson_view, score_assets, voicepack), or None while it is not here: the
    server runs with whichever have landed. A module that is here but fails to import is logged once and counts as absent."""
    if name not in _LANES:
        try:
            _LANES[name] = importlib.import_module(name)
        except ModuleNotFoundError as e:
            if e.name != name:
                log.warning("%s could not be imported: %s", name, e)
            _LANES[name] = None
        except Exception as e:
            log.warning("%s could not be imported: %s: %s", name, type(e).__name__, e)
            _LANES[name] = None
    return _LANES[name]


def _lane_fn(module, fn):
    mod = _lane(module)
    got = getattr(mod, fn, None) if mod is not None else None
    return got if callable(got) else None


def _with_view(r):
    """result.lesson.view from lesson_view.build(result), when that module is here and the result has a lesson; True when
    the result has a view now. A view that cannot be built is left out (logged), never failing the take."""
    lesson = r.get("lesson") if isinstance(r, dict) else None
    if not isinstance(lesson, dict):
        return False
    build = _lane_fn("lesson_view", "build")
    if build is not None:
        try:
            v = build(r)
        except Exception as e:
            log.warning("lesson view not built: %s: %s", type(e).__name__, e)
            v = None
        if isinstance(v, dict):
            lesson["view"] = v
    return isinstance(lesson.get("view"), dict)


def _with_ghosts(r, kind, oid, folder):
    """The view's cuts of the recorded performance (ghost_guard.build: the taught bars under the per-job and per-piece cap,
    encrypted with the job's own key, into folder); each fix gets its marker or the fallback. Never fails the take."""
    import ghost_guard as GG
    view = ((r.get("lesson") or {}).get("view")) if isinstance(r.get("lesson"), dict) else None
    if not isinstance(view, dict) or not view.get("fixes"):
        return None
    try:
        return GG.build(DATA, kind, oid, view, folder)
    except Exception as e:
        log.warning("the recorded hands' cuts for %s %s not made: %s: %s", kind, oid, type(e).__name__, e)
        for f in view.get("fixes") or []:
            if isinstance(f, dict):
                f["ghost"] = dict(fallback="3d", reason="none")
        return None


def _voice_step(d, r, report, before):
    """Muse's voice: voicepack.build(job_dir, result) says every line of result.lesson.view.lines in ElevenLabs' voice into
    work/voice.mp4 and result.voicePack, for a take whose player agreed to ElevenLabs at upload (speech.consent_covers),
    never a Quest take. Returns the step as it ended (done, skipped with why, or failed: the take is done either way).
    report(**k): the job's progress callback, told the step is running first."""
    import speech as SP
    build = _lane_fn("voicepack", "build")
    view = ((r.get("lesson") or {}).get("view")) if isinstance(r.get("lesson"), dict) else None
    why = ("no voice pack on this server" if build is None
           else "a Quest take is not spoken" if r.get("source") == "quest"
           else "its player did not agree to ElevenLabs at upload" if not SP.consent_covers(_job_file(d).get("consent"))
           else "the lesson has no lines to say" if not (isinstance(view, dict) and view.get("lines")) else None)
    if why:
        return dict(VOICE_STEP, state="skipped", ms=None, note=why)
    # the module's own reasons (TEACHER_VOICE, ElevenLabs not set up): a skip, in plain words, the reason in the log
    why_not = _lane_fn("voicepack", "why_not")
    try:
        why = why_not(d, r) if why_not is not None else None
    except Exception as e:
        why = f"{type(e).__name__}: {e}"
    if why:
        log.info("Muse's voice for %s skipped: %s", os.path.basename(d), str(why)[:300])
        return dict(VOICE_STEP, state="skipped", ms=None, note="the voice is not set up on this server")
    if report:
        report(step=VOICE_STEP["label"], progress=1.0, steps=before + [dict(VOICE_STEP, state="running", ms=None)], etaS=None)
    t0 = time.perf_counter()
    try:
        got = build(d, r)
    except JobTimedOut:
        raise
    except Exception as e:                     # the lesson stands without its voice; what went wrong stays in the log
        log.warning("Muse's voice for %s: %s: %s", os.path.basename(d), type(e).__name__, e)
        return dict(VOICE_STEP, state="failed", ms=round((time.perf_counter() - t0) * 1000, 1), note="the voice could not be made")
    if isinstance(got, dict) and isinstance(got.get("clips"), dict):
        r["voicePack"] = got
    ms = round((time.perf_counter() - t0) * 1000, 1)
    if isinstance(r.get("voicePack"), dict) and os.path.isfile(os.path.join(d, "work", "voice.mp4")):
        return dict(VOICE_STEP, state="done", ms=ms, note=f"{len(r['voicePack'].get('clips') or {})} lines")
    return dict(VOICE_STEP, state="failed", ms=ms, note="the voice could not be made")


def _write_result(d, r):
    tmp = os.path.join(d, f"result.json.{threading.get_ident()}.tmp")
    with open(tmp, "w") as f:
        json.dump(r, f)
    os.replace(tmp, os.path.join(d, "result.json"))


def _after_pipeline(d, jid, report=None):
    """A finished take's last steps (the module notes): the view, the cuts, Muse's voice, written into result.json with the
    voice step in its steps. Nothing here fails the take; a take that did not finish is left as it is."""
    try:
        with open(os.path.join(d, "result.json")) as f:
            r = json.load(f)
    except (OSError, ValueError):
        return
    if not isinstance(r, dict) or (r.get("job") or {}).get("status") != "done":
        return
    pipe = r.setdefault("pipeline", {}) if isinstance(r.get("pipeline", {}), dict) else {}
    steps = [s for s in pipe.get("steps") or [] if isinstance(s, dict) and s.get("id") != VOICE_STEP["id"]]
    if _with_view(r):
        _with_ghosts(r, "job", jid, os.path.join(d, GHOST_DIR))
    before = steps + [dict(LESSON_STEP, state="done", ms=None)]
    voice = _voice_step(d, r, report, before)
    if report:
        report(step=None, progress=1.0, steps=before + [voice], etaS=None)
    pipe["steps"] = steps + [voice]
    r["pipeline"] = pipe
    _write_result(d, r)


def _chat_on():
    """TEACHER_CHAT=on: the conversation and the spoken questions are there (off, the default: the module notes)."""
    return (os.environ.get("TEACHER_CHAT") or "off").strip().lower() == "on"


def _need_chat():
    if not _chat_on():
        raise HTTPException(404, "Not Found")


def _place(jid, w=None):
    """A queued job's place: how many takes are ahead of it (the running one too), when it should start and how long it
    should take itself, in seconds; None when it is not waiting."""
    with LOCK:
        if jid not in WAITING:
            return None
        pos, running = WAITING.index(jid), RUNNING["id"] is not None
    w = w or _wait()
    each = w["aheadEach"]
    return dict(ahead=pos + running, startS=round(w["coldStartS"] + w["runningLeftS"] + sum(each[:pos])),
                jobS=each[pos] if pos < len(each) else w["jobS"])


@app.get("/api/health")
def health():
    import speech as SP
    import voice as V
    meta, rep, orr, ow, ft = _meta(), _replicate(), _openrouter(), _open_weights(), _framing_tip()
    key = _stt_key()
    codes = _codes_on()
    return dict(samBackend=_sam_backend(), voiceModel=V.model_name(),
                transcriber=os.environ.get("TEACHER_TRANSCRIBER", "piano transcription"),
                stt=key, auth=bool(os.environ.get("TEACHER_TOKEN")), queue=QUEUE.qsize(),
                # what leaves this machine, and to whom: Meta ("meta"), OpenRouter, which passes it on to the
                # providers it names ("openrouter"), the open-weights host ("openWeights"), and Replicate ("replicate");
                # "framingTip": the separate box for the framing check's frames
                keepDays=_keep_days(), meta=meta, openrouter=orr, openWeights=ow, replicate=rep, framingTip=ft,
                # who speaks the teacher's words: {"on": false} (the browser's own voice), or ElevenLabs and its model
                voiceOut=SP.offer(),
                adultRequired=bool(_outside(meta, rep, orr, ow)),
                # who may answer a question (hosted only for takes whose policy allows it), and how a
                # spoken one is heard: live over the WebSocket, or a recording (a browser recording needs ffmpeg)
                chat=V.backends(), questDataOk=_quest_ok(), questDataOpenRouter=_quest_openrouter_ok(),
                # whether the conversation and spoken questions are there at all (TEACHER_CHAT; off: the lesson is one-way)
                conversation=_chat_on(),
                # who writes the practice plan, best first, before the deterministic one (_plan)
                plan=_plan(),
                # MODEL_API_KEY as Meta took it: a refused one routes as if it were unset (voice.hosted_route)
                metaKey=V.meta_key_status(),
                # the pieces the upload form offers instead of a MIDI file: the Muse Teacher's two supported pieces this
                # server may use (the Rondo, internal, only on a server run with TEACHER_LIBRARY_INTERNAL=1)
                library=_library(),
                # how much of a longer video is analysed: the part with the most playing (window.py)
                windowS=_window_s(),
                # the choice the upload form offers instead (the form's windowS), and a job's time limit (_job_max_s)
                windows=list(WINDOWS), jobMaxS=round(_job_max_s()),
                # which model each step of the lesson runs on now, its fallback and time limit (voice.model_table)
                modelTable=_model_table(),
                # the MIDI the player's piano recorded while they filmed: the largest file the upload takes
                performanceMaxBytes=MAX_PERFORMANCE,
                # how long a new upload would take, from this backend's measured seconds per frame (_wait)
                wait={k: v for k, v in _wait().items() if k != "aheadEach"},
                # the Quest demos on the home page (TEACHER_SHOW_DEMOS), and how many sample lessons there are
                showDemos=_show_demos(), samples=len(_sample_ids()),
                # whether judge codes are taken (never which), and their limits
                judgeCode=codes, judge=_judge_limits() if codes else None,
                # TEACHER_PRO team or public and how many reference recordings are loaded (never which); nothing while it
                # is off, so a public build's health is what it was before the comparison existed
                **_reference_health(),
                voice=dict(realtime=key and importlib.util.find_spec("websockets") is not None,
                           file=key and shutil.which(os.environ.get("FFMPEG", "ffmpeg")) is not None))


HOW_REFERENCE = os.path.join(HERE, "how_reference.html")


@app.get("/api/reference/how")
def reference_how():
    """The How it works page's section on the comparison with a reference recording (how_reference.html, outside every
    folder this server serves), only while TEACHER_PRO is team or public: with it off, nothing of it is served at all."""
    import proref
    if proref.health()["mode"] == "off":
        raise HTTPException(404, "not found")
    with open(HOW_REFERENCE, encoding="utf-8") as fh:
        return Response(fh.read(), media_type="text/html; charset=utf-8", headers={"Cache-Control": "no-store"})


def _reference_health():
    """{"reference": TEACHER_PRO, "referencesLoaded": how many} when TEACHER_PRO is team or public; {} when it is off."""
    import proref
    h = proref.health()
    return {} if h["mode"] == "off" else dict(reference=h["mode"], referencesLoaded=h["loaded"])


def _plan():
    """Who writes the practice plan with the current settings (practice_plan.make): {"fixed": TEACHER_PLAN=fixed, "by":
    the hosted route's plan models as the page names them, best first (voice.plan_models: Muse Wonder, then the route's
    Muse Spark; the route's own model alone on the open-weights route and for Muse Glimmer through OpenRouter)}. "by" is
    empty when only the deterministic plan is made: no hosted route (a self-hosted Muse Glimmer does not plan), or
    TEACHER_PLAN=fixed. A take that may not go to the route gets
    the deterministic plan whatever this says."""
    import voice as V
    fixed = (os.environ.get("TEACHER_PLAN") or "").strip().lower() == "fixed"
    h = None if fixed else V._hosted()
    return dict(fixed=fixed, by=[V.author(m, h.get("servedBy")) or m for m in V.plan_models(h)] if h else [])


def _model_table():
    """voice.model_table() as /api/health gives it ({purpose: {model, fallback, seconds}}: plain JSON), or None when this
    voice.py has none or it cannot be read; never a reason for health to fail."""
    import voice as V
    mt = getattr(V, "model_table", None)
    try:
        t = mt() if callable(mt) else None
        return json.loads(json.dumps(t)) if isinstance(t, dict) else None
    except Exception:
        return None


def _window_s():
    import window as W
    try:
        return W.window_s()
    except ValueError:              # main() refuses to start with a bad TEACHER_WINDOW_S
        return None


def _library():
    """[{id, title, kind}] of the pieces the upload form offers: the Muse Teacher's supported pieces this server may use
    (library.supported: Fur Elise's opening and the Nocturne No. 20; internal ones only with
    TEACHER_LIBRARY_INTERNAL=1); [] when the library cannot be read."""
    try:
        import library
        import pipeline
        return [dict(id=p["id"], title=p["title"], kind=p["kind"]) for p in library.supported(internal=pipeline.library_internal())]
    except Exception:
        return []


def _offered():
    """The ids of every library piece an upload may still name (library.listing: the scales and Hit the Road too, for a
    caller that names one; internal ones only with TEACHER_LIBRARY_INTERNAL=1), though the form offers only _library's."""
    try:
        import library
        import pipeline
        return {p["id"] for p in library.listing(internal=pipeline.library_internal())}
    except Exception:
        return set()


def _save(src, path, limit, h=None):
    """Copy an uploaded part to `path`; False when it is longer than `limit` bytes. h: a hashlib object the bytes are
    also fed to, as they are written (the video's sha256, job.json "sha256": _replay_source)."""
    size = 0
    src.seek(0)
    with open(path, "wb") as f:
        while chunk := src.read(1 << 20):
            size += len(chunk)
            if size > limit:
                return False
            f.write(chunk)
            if h is not None:
                h.update(chunk)
    return True


def _midi_problem(path):
    """Why the reference cannot be used, or None. Read now with the pipeline's own reader, so a file
    that is not MIDI (or a type-2 file) is refused here rather than failing the job after SAM."""
    import pipeline
    try:
        notes = pipeline.read_midi(path)
    except Exception:
        return "the reference could not be read as a MIDI file"
    if len(notes) > pipeline.MAX_REF_NOTES:
        return f"the reference MIDI has more than {pipeline.MAX_REF_NOTES} notes; a score of just the passage you play works"
    return None if notes else "the reference MIDI has no notes"


def _performance_problem(path, ref=None):
    """Why the MIDI the player's piano recorded cannot be used, or None: a MIDI file starts with "MThd", and it is read now
    with eval_take's own reader (the one the pipeline lines it up with), so a file that is not one is refused here rather
    than left for the job to say so; one longer than pipeline.MAX_PERFORMANCE_S is refused too (lining it up costs in
    proportion, and a file of a few hundred bytes can claim days), and so is the score file again (ref: this take's
    reference.mid, the same bytes: the two buttons sit side by side)."""
    try:
        with open(path, "rb") as f:
            head = f.read(4)
    except OSError:
        head = b""
    if head != b"MThd":
        return "the MIDI from your piano is not a MIDI file (.mid)"
    import eval_take
    import pipeline
    try:
        _notes, _pedal, rec = eval_take.read_truth(path)
    except ValueError as e:
        return "the MIDI from your piano has no notes" if "has no notes" in str(e) else "the MIDI from your piano could not be read"
    if rec["endS"] - rec["startS"] > pipeline.MAX_PERFORMANCE_S:
        return (f"the MIDI from your piano is over {pipeline.MAX_PERFORMANCE_S / 3600:.0f} hours long: add the MIDI of just "
                "this take")
    if ref and os.path.isfile(ref) and os.path.getsize(ref) == os.path.getsize(path):
        with open(ref, "rb") as a, open(path, "rb") as b:
            if a.read() == b.read():
                return ("the score and the MIDI from your piano are the same file: the score is the music as written, the "
                        "piano's MIDI is what you played. Add the MIDI your piano recorded while you filmed, or leave it out")
    return None


def _start_s(v):
    """The form's "start": seconds ("130", "130.5") or a clock time ("2:10", "1:02:10"; the seconds,
    and the minutes after hours, in two digits), as seconds; None when it is empty. Anything else
    (other digits than 0-9, "2:5", "1:75", a file) is refused (400), before the video is stored."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    bad = HTTPException(400, "the start must be a time in your video, like 2:10, or empty")
    if not isinstance(v, str):
        raise bad
    m = re.fullmatch(r"(?:(?:([0-9]{1,2}):)?([0-9]{1,4}):)?([0-9]{1,5}(?:\.[0-9]{1,3})?)", v.strip(), re.ASCII)
    if not m:
        raise bad
    h, mi, sec = m.groups()
    if mi is not None and (len(sec.split(".")[0]) != 2 or float(sec) >= 60):
        raise bad                                # "2:5" or "1:75": not a clock time
    if h is not None and (len(mi) != 2 or int(mi) >= 60):
        raise bad
    secs = (int(h or 0) * 60 + int(mi or 0)) * 60 + float(sec)
    if secs >= 86400:
        raise HTTPException(400, "the start is later than any video this server takes")
    return round(secs, 3)


def _window_choice(v):
    """The form's "windowS": how many seconds of a longer video to analyse, one of WINDOWS (30 or 60), or None when it is
    not sent (the server's own TEACHER_WINDOW_S then). Anything else is refused (400) before the video is stored. It is kept
    in job.json as options.windowS, which the pipeline reads; the wait the page is told prices the job by it."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    if isinstance(v, str) and v.strip() in {str(w) for w in WINDOWS}:
        return int(v.strip())
    raise HTTPException(400, f"how much to analyse must be {' or '.join(str(w) for w in WINDOWS)} seconds")


def _name(filename):
    """The player's file name without any folders a browser put in front of it (shown on the page)."""
    return re.split(r"[\\/]", filename or "")[-1][:200] or None


@app.post("/api/jobs")
async def create_job(request: Request):
    """Form fields: video, reference (optional .mid) or piece (optional: a library piece's id, one of
    /api/health's library; not both), performance (optional .mid, MAX_PERFORMANCE at most, an MThd header: the MIDI the
    player's digital piano recorded while they filmed, kept as performance.mid, whose notes the pipeline lines up with the
    video and uses in place of the heard ones; job.json "performance": true), start (optional: where to start analysing, in seconds or m:ss,
    instead of the part the teacher picks; job.json "startS"), windowS (optional: 30 or 60, how many seconds of a longer
    video to analyse; job.json options.windowS, which the pipeline reads), consent=yes, adult=yes (when /api/health says
    adultRequired), framingTip=yes (optional, off unless ticked: the framing check's frames may go to the route's
    vision model to choose a filming tip; recorded only when /api/health offers it, and only with adult=yes), told
    (JSON {"meta", "replicate", "openrouter", and "openWeights" and "framingTip" when /api/health had them}: what it
    said when the page drew the agreement; refused with 409 unless it is what this server would do now, as after a
    restart with other settings under an open page; a page that sends no openWeights or framingTip was shown
    neither, which matches only while neither is on). The token and the declared size are checked before any of the
    body is read, so the form is parsed here and not by FastAPI, which would store the whole body
    before this ran. Without the token, a judge code (X-Teacher-Code, TEACHER_JUDGE_CODE) is taken instead, checked
    before the body too: its own size cap, its uploads over the last day, and the video's length once stored."""
    code = None if _token_ok(request) else _code_id(request)
    if not code and not _token_ok(request):
        raise HTTPException(401, _need_access())
    lim = _judge_limits() if code else None
    cap = lim["maxBytes"] if code else MAX_UPLOAD
    too_big = (f"that video is over {cap / 2**20:.0f} MB, the most this server takes with a judge code. Trim it to the part you "
               "want feedback on, or record at 1080p or lower" if code else
               "that upload is over 400 MB. A long video is fine, but this file is too big: record at 1080p or lower, or trim it to the part you want feedback on")
    _length(request, cap + MAX_REF + MAX_PERFORMANCE + (1 << 20), too_big)
    if code:
        if await run_in_threadpool(_code_jobs_bytes) + int(request.headers["content-length"]) > _judge_disk_bytes():
            raise HTTPException(503, "this server has no room for more judges' uploads just now; please open a sample lesson, "
                                     "or try again later")
        now = time.time()
        with LOCK:                                 # counted and reserved together: two uploads at once cannot both pass
            if _code_used(code) >= lim["perDay"]:
                raise HTTPException(429, f"this judge code has made its {lim['perDay']} uploads for today; please try again tomorrow, "
                                         "or open a sample lesson meanwhile")
            if _code_active(code) >= lim["atOnce"]:
                raise HTTPException(429, f"this judge code has {lim['atOnce']} takes waiting or being analysed; please wait for one "
                                         "to finish, then upload the next")
            tried = _recent(CODE_TRIED, code, CODE_DAY_S, now)
            if len(tried) >= CODE_TRIES_PER_UPLOAD * lim["perDay"]:
                raise HTTPException(429, "this judge code has tried too many uploads today; please try again tomorrow, or open a "
                                         "sample lesson meanwhile")
            CODE_TRIED[code] = tried + [now]
            CODE_PENDING[code] = CODE_PENDING.get(code, 0) + 1
            _save_limits()
    try:
        return await _create_job(request, code, lim, cap, too_big)
    finally:
        if code:
            with LOCK:
                CODE_PENDING[code] -= 1
                if not CODE_PENDING[code]:
                    del CODE_PENDING[code]


def _video_s(path):
    """The stored upload's length in seconds (ffprobe), or None when it cannot be read: the wait prices a queued take by it."""
    import video
    try:
        dur = video.probe(path).get("durationS")
    except Exception:
        return None
    return float(dur) if isinstance(dur, (int, float)) and dur > 0 else None


def _judge_length_problem(path, max_s):
    """Why a video sent with a judge code is refused once stored (too long, or not a video ffmpeg reads), or None."""
    dur = _video_s(path)
    if dur is None:
        return "that file could not be read as a video; please send an MP4, MOV or WebM recording"
    if dur > max_s + 0.5:
        return (f"that video is {int(dur // 60)}:{int(dur % 60):02d} long; with a judge code this server takes videos of up to "
                f"{int(max_s // 60)}:{int(max_s % 60):02d}. Trim it to the part you want feedback on")
    return None


async def _create_job(request, code, lim, cap, too_big):
    import speech as SP
    meta, rep, orr, ow, ft, vo = _meta(), _replicate(), _openrouter(), _open_weights(), _framing_tip(), SP.offer()
    outside = _outside(meta, rep, orr, ow)
    async with request.form(max_files=3, max_fields=12) as form:
        if form.get("consent") != "yes":
            raise HTTPException(400, "please agree to how your video is used before uploading")
        try:
            told = json.loads(form.get("told") or "null")
        except (TypeError, ValueError):
            told = None
        if not _told_matches(told, dict(meta=meta, replicate=rep, openrouter=orr, openWeights=ow, framingTip=ft, voiceOut=vo)):
            raise HTTPException(409, "this server's settings changed since this page was loaded: please read the "
                                     "updated list and agree again")
        adult = form.get("adult") == "yes"
        if outside and not adult:
            raise HTTPException(400, f"please confirm you are 18 or older: this server uses {' and '.join(outside)}")
        tip = form.get("framingTip") == "yes" and bool(ft.get("available"))
        if tip and not adult:
            raise HTTPException(400, "please confirm you are 18 or older: the frames for the filming tip go to "
                                     f"{' and '.join(ft.get('to') or ['an outside service'])}")
        video, reference, performance = form.get("video"), form.get("reference"), form.get("performance")
        consent = dict(version=CONSENT_VERSION, adult=adult, metaAtUpload=meta, replicateAtUpload=rep,
                       openrouterAtUpload=orr, openWeightsAtUpload=ow,
                       # the separate, default-off box: the offer it agreed to, else None
                       framingTipAtUpload=ft if tip else None,
                       # the teacher's words spoken by ElevenLabs (TEACHER_VOICE): what the list said, else None
                       voiceAtUpload=vo if vo["on"] and adult else None)
        sample = form.get("sample")
        if isinstance(sample, str) and sample.strip():  # the page's example take: that sample's mock run, no video
            if isinstance(video, UploadFile) and video.filename:
                raise HTTPException(400, "please send either your video or a sample, not both")
            return await run_in_threadpool(_create_sample_job, sample.strip(), code, consent)
        ext = os.path.splitext(video.filename or "")[1].lower() if isinstance(video, UploadFile) else ""
        if ext not in VIDEO_EXT:
            raise HTTPException(400, f"please upload a video file ({', '.join(sorted(VIDEO_EXT))})")
        if not (isinstance(reference, UploadFile) and reference.filename):
            reference = None
        elif os.path.splitext(reference.filename)[1].lower() not in (".mid", ".midi"):
            raise HTTPException(400, "the reference must be a MIDI file (.mid)")
        if not (isinstance(performance, UploadFile) and performance.filename):
            performance = None
        elif os.path.splitext(performance.filename)[1].lower() not in (".mid", ".midi"):
            raise HTTPException(400, "the MIDI from your piano must be a MIDI file (.mid)")
        piece = form.get("piece")
        piece = piece.strip() if isinstance(piece, str) and piece.strip() else None
        if piece is not None:
            if reference is not None:
                raise HTTPException(400, "please give either your score file or a piece from the library, not both")
            if piece not in _offered():
                raise HTTPException(400, "that piece is not in this server's library")
        start = _start_s(form.get("start"))
        win = _window_choice(form.get("windowS"))
        # a re-take: the job it films part of again, recorded only when this uploader may open it (the token, or the judge
        # code that job was uploaded with); any other id is left out, saying nothing of which ids exist
        retake = form.get("retakeOf")
        retake = retake.strip() if isinstance(retake, str) else ""
        orig_dir = os.path.join(DATA, retake) if _is_id(retake) else None
        if orig_dir and not (os.path.isdir(orig_dir) and (code is None or _job_file(orig_dir).get("codeId") == code)):
            orig_dir = None
        # sameScore=yes: no score sent, so the first take's own (its score file, or its library piece if still offered)
        same = form.get("sameScore") == "yes" and orig_dir is not None and reference is None and piece is None
        same_ref = os.path.join(orig_dir, "reference.mid") if same and os.path.isfile(os.path.join(orig_dir, "reference.mid")) else None
        if same and not same_ref and _job_file(orig_dir).get("piece") in _offered():
            piece = _job_file(orig_dir)["piece"]
        jid = uuid.uuid4().hex
        d = os.path.join(DATA, jid)
        os.makedirs(d)
        try:                                   # an upload that fails half way leaves nothing behind
            up = os.path.join(d, "upload" + ext)
            sha = hashlib.sha256()             # the video's bytes, hashed as they are written (a repeat upload: _replay_job)
            if not await run_in_threadpool(_save, video.file, up, cap, sha):
                raise HTTPException(413, too_big)
            digest = sha.hexdigest()
            if code:                           # a judge's video: its length too (the queue is shared)
                problem = await run_in_threadpool(_judge_length_problem, up, lim["maxS"])
                if problem:
                    raise HTTPException(413 if "long" in problem else 400, problem)
            # a sample's own video uploaded again (its download, or its stream), or the upload a sample was made from: the
            # take is its player's, so their agreement holds (_sample_consent), and its frames never leave this server
            by_video = await run_in_threadpool(_samples_of, up)
            again = by_video + [x for x in await run_in_threadpool(_samples_by_take, digest) if x[0] not in {i for i, _ in by_video}]
            video_s = await run_in_threadpool(_video_s, up)    # what the wait prices this take at (never a refusal here)
            ref = None
            if reference is not None:
                ref = os.path.join(d, "reference.mid")
                if not await run_in_threadpool(_save, reference.file, ref, MAX_REF):
                    raise HTTPException(413, "the reference MIDI is too large (5 MB at most)")
                problem = await run_in_threadpool(_midi_problem, ref)
                if problem:
                    raise HTTPException(400, problem)
            elif same_ref:                     # read when that take was uploaded: copied as it is
                ref = os.path.join(d, "reference.mid")
                await run_in_threadpool(shutil.copyfile, same_ref, ref)
            if performance is not None:        # this take's own: never copied from another one, as the score may be
                perf = os.path.join(d, "performance.mid")
                if not await run_in_threadpool(_save, performance.file, perf, MAX_PERFORMANCE):
                    raise HTTPException(413, f"the MIDI from your piano is too large ({MAX_PERFORMANCE // 1024} KB at most)")
                problem = await run_in_threadpool(_performance_problem, perf, ref)
                if problem:
                    raise HTTPException(400, problem)
            # a video analysed before with these options (an earlier job, else a sample): its mock run, not the pipeline
            key = (piece, await run_in_threadpool(_file_sha, ref) if ref else None,
                   await run_in_threadpool(_file_sha, perf) if performance is not None else None, start, win)
            size = os.path.getsize(up)
            replay = await run_in_threadpool(_replay_job, jid, digest, size, key) if _replay_on() else None
            replay = ("job", replay) if replay else next(
                (("sample", sid) for sid, sm in again if _sample_take_matches(sid, sm or {}, digest, key, sid in {i for i, _ in by_video})),
                None) if _replay_on() else None
            sends = [n for n, on in (("Meta's Model API", meta.get("sam")), ("Replicate", rep.get("sam"))) if on]
            if again and sends and not replay:  # a sample's take analysed again would send its frames, which its player did not agree to
                raise HTTPException(400, f"that video is one of the sample lessons, and this server sends videos to {' and '.join(sends)}, "
                                         "which its player did not agree to; open the sample lesson on the home page to see its lesson")
            job = dict(id=jid, created=time.time(), name=_name(video.filename),
                       referenceName=_name(reference.filename) if reference is not None else
                       (_job_file(orig_dir).get("referenceName") if same_ref else None), fps=FPS, consent=consent, sha256=digest)
            if replay:                         # for diagnostics only (the module section notes)
                job["replayFrom"], job["replayOf"] = replay
            if again:                          # which sample it is, and its player's agreement in place of the boxes ticked
                job["consent"] = _sample_consent(job["consent"], again)
                job["sampleOf"] = [sid for sid, _ in again]
            if piece is not None:
                job["piece"] = piece
            if performance is not None:        # that one was added: its file name is never kept (nothing would read it)
                job["performance"] = True
            if start is not None:
                job["startS"] = start
            if code:                           # the code that may open it (an HMAC of it, never the code)
                job["codeId"] = code
            else:                              # the token's (or an open local server's) upload: a team take (proref.team_job)
                job["by"] = "token"
            if orig_dir and _same_score(orig_dir, piece, ref):
                job["retakeOf"] = retake
            # what the upload form chose, for the pipeline: always a dict, so an upload is told apart from a job re-queued
            # from before the form had it (pov/refuse.enabled: refusals are on for uploads only), and windowS, when
            # chosen, the 30 or 60 as a number (window.asked_s reads numbers only): a cap on the part analysed
            job["options"] = dict(windowS=int(win)) if win is not None else {}
            job["analysedS"] = round(_analysed_s(video_s, start, win), 2)
            with open(os.path.join(d, "job.json"), "w") as f:
                json.dump(job, f)
        except BaseException:
            shutil.rmtree(d, ignore_errors=True)
            raise
    if replay:
        try:
            await run_in_threadpool(_start_replay, jid, d, replay[0], replay[1], job["name"])
        except Exception as e:                 # the source could not be copied: the take is analysed as any other
            log.warning("mock run of %s %s for %s not started: %s: %s", replay[0], replay[1], jid, type(e).__name__, e)
            job.pop("replayOf", None)
            job.pop("replayFrom", None)
            for x in ("result.json", "plan.json"):
                try:
                    os.remove(os.path.join(d, x))
                except OSError:
                    pass
            with open(os.path.join(d, "job.json"), "w") as f:
                json.dump(job, f)
            replay = None
    if not replay:
        _enqueue(jid, up, ref, job["name"], code, job["analysedS"])
    # a judge's upload: the key that opens this job alone, whatever the wrong-code throttle says (_auth_job)
    return dict(id=jid, key=_job_key(jid)) if code else dict(id=jid)


def _create_sample_job(sid, code, consent):
    """POST /api/jobs with sample=<id> and no video: a job that is that sample's mock run (the module section on the mock
    run), with the upload's agreement bounded by the sample's player's (_sample_consent), as an upload of its video is.
    404 for a sample this server does not serve."""
    sd = _sample_dir(sid)
    s = _sample_meta(sd)
    try:
        with open(os.path.join(sd, "result.json")) as f:
            dur = ((json.load(f).get("job") or {}).get("video") or {}).get("durationS")
    except (OSError, ValueError, AttributeError):
        dur = None
    jid = uuid.uuid4().hex
    d = os.path.join(DATA, jid)
    os.makedirs(d)
    name = _sample_info(sid, s)["title"] or None
    job = dict(id=jid, created=time.time(), name=name, referenceName=None, fps=FPS, consent=_sample_consent(consent, [(sid, s)]),
               sampleOf=[sid], sample=sid, replayFrom="sample", replayOf=sid, options={},
               analysedS=round(float(dur), 2) if isinstance(dur, (int, float)) else None)
    if code:
        job["codeId"] = code
    else:
        job["by"] = "token"
    try:
        with open(os.path.join(d, "job.json"), "w") as f:
            json.dump(job, f)
        _start_replay(jid, d, "sample", sid, name)
    except BaseException:
        shutil.rmtree(d, ignore_errors=True)
        raise
    return dict(id=jid, key=_job_key(jid)) if code else dict(id=jid)


def _same_score(orig_dir, piece, ref):
    """Whether a re-take may be compared with the take in orig_dir as the same music: both with the same library piece or
    the same score file (byte for byte), or one of them with no score (its bars are then not compared, compare.py). Two
    different scores are two pieces, whose measures say nothing of each other."""
    oj = _job_file(orig_dir)
    oref = os.path.join(orig_dir, "reference.mid")
    o_piece, o_ref = oj.get("piece"), oref if os.path.isfile(oref) else None
    if not (piece or ref) or not (o_piece or o_ref):
        return True
    if piece or o_piece:
        return piece is not None and piece == o_piece
    try:
        with open(ref, "rb") as a, open(o_ref, "rb") as b:
            return hashlib.sha256(a.read()).digest() == hashlib.sha256(b.read()).digest()
    except OSError:
        return False


def _enqueue(jid, up, ref, name, code=None, analysed_s=None):
    """Queue a job: a token's take after the other token takes and before any judge code's (QUEUE's priority, mirrored in
    WAITING's order), a judge code's at the end."""
    with LOCK:
        JOBS[jid] = _queued(jid, name)
        JOB_INFO[jid] = dict(code=code, analysedS=analysed_s)
        at = len(WAITING) if code else next((i for i, j in enumerate(WAITING) if (JOB_INFO.get(j) or {}).get("code")), len(WAITING))
        WAITING.insert(at, jid)
        QUEUE.put((1 if code else 0, next(QSEQ), (jid, up, ref, FPS)))


# ---------------------------------------------------------------- a video already analysed: the mock run
#
# the rule (2026-11-04): "If the user uploads a video we've already processed, it should do a 'mock processing' where
# it spends 20 seconds going through the motions (each stage, as if it were processing a new video) and then shows the
# existing output." An upload whose bytes (sha256, kept as job.json "sha256" while it is saved) are an earlier finished
# job's, sent with the same piece, score file, piano MIDI, start and window (_options_key), or a sample's (its video.mp4, or
# the upload it was made from: sample.json take.sha256, _sample_take_matches), is not analysed again. Its job gets that
# result as its own (_replay_prepare: the video and the voice pack linked, the cuts of the recorded hands made again under
# its own key, the plan copied, result.json written before anything is reported, so GET /result never 404s once the status
# says done), then its status steps through every step a real job reports, with their labels and a progress like theirs,
# over TEACHER_REPLAY_S (default 20 s), and turns done (_replay_run). POST /api/jobs with sample=<id> and no video does the
# same from that sample (the page's example take). job.json replayOf and replayFrom ("job" or "sample") say which, for
# diagnostics only: nothing the learner sees says so. Nothing is sent anywhere, the job is not queued behind a real one,
# and the wait the page is told is not measured from it (_measure). Its access is any upload's: the token, or the judge
# code it was made with.

REPLAY_S = 20.0                    # TEACHER_REPLAY_S: the mock run's length, in seconds (0 to 600)
# each step's part of the run (start, end as shares of it): the notes start while the video is read, as a real job's do
REPLAY_PLAN = (("prepare", 0.0, 0.08), ("notes", 0.04, 0.18), ("hands", 0.18, 0.52), ("keyboard", 0.52, 0.62),
               ("fingers", 0.62, 0.67), ("analysis", 0.67, 0.72), ("voice", 0.72, 0.80), ("lesson", 0.80, 0.92),
               ("museVoice", 0.92, 1.0))
REPLAY_TICK_S = 0.25
_UPLOAD_SHA = {}                   # an earlier job's upload -> ((size, mtime), sha256), for jobs from before job.json kept it


def _replay_s():
    return _setting("TEACHER_REPLAY_S", REPLAY_S, 0, 600)


def _replay_on():
    """TEACHER_REPLAY: on (the default) gives a repeat upload its mock run; off analyses every upload again (after a change
    to the pipeline, say, when the earlier result is not what this code would make). A sample's own job (sample=<id>) is a
    mock run either way."""
    return (os.environ.get("TEACHER_REPLAY") or "on").strip().lower() != "off"


def _file_sha(p):
    try:
        return _sha256_file(p) if os.path.isfile(p) else None
    except OSError:
        return None


def _options_key(d, job):
    """What a take's analysis depends on besides its video: (its library piece, its score file's and its piano MIDI's
    sha256, its start, its window), each None when it has none."""
    opts = job.get("options") if isinstance(job.get("options"), dict) else {}
    return (job.get("piece"), _file_sha(os.path.join(d, "reference.mid")), _file_sha(os.path.join(d, "performance.mid")),
            job.get("startS"), opts.get("windowS"))


def _upload_sha(d, job, size):
    """An earlier job's video's sha256: job.json's, else its upload's, hashed only when it is `size` bytes (and kept)."""
    if isinstance(job.get("sha256"), str):
        return job["sha256"]
    ups = sorted(glob.glob(os.path.join(d, "upload.*")))
    try:
        st = os.stat(ups[0]) if ups else None
    except OSError:
        st = None
    if st is None or st.st_size != size:
        return None
    got = _UPLOAD_SHA.get(ups[0])
    if not got or got[0] != (st.st_size, st.st_mtime):
        got = _UPLOAD_SHA[ups[0]] = ((st.st_size, st.st_mtime), _sha256_file(ups[0]))
    return got[1]


def _replay_job(jid, digest, size, key):
    """The finished job (not jid) whose video is these bytes, sent with the same options key: the first one analysed
    rather than a mock run of it, the earliest of those; None when there is none."""
    found = []
    for oid in os.listdir(DATA) if os.path.isdir(DATA) else []:
        if oid == jid or not _is_id(oid):
            continue
        d = os.path.join(DATA, oid)
        job = _job_file(d)
        if job.get("sample") or _upload_sha(d, job, size) != digest:
            continue
        with LOCK:
            live = (JOBS.get(oid) or {}).get("status") in ("queued", "running")
        if live or not os.path.isfile(os.path.join(d, "work", "video.mp4")) or _done_result(d) is None:
            continue
        if _options_key(d, job) != key:
            continue
        found.append((1 if job.get("replayOf") else 0, job.get("created") or 0, oid))
    return min(found)[2] if found else None


def _sample_take_matches(sid, s, digest, key, by_video):
    """Whether an upload (its sha256 and options key) may be sample sid's mock run: its video.mp4 (by_video: the download
    or the stream) sent with no score file, piano MIDI or start, the sample's own piece or none, and a window that takes
    all of it; or the upload the sample was made from (sample.json take, make_sample.py) sent with the options it was."""
    piece, ref, perf, start, win = key
    if ref or perf:
        return False
    if by_video:
        try:
            with open(os.path.join(SAMPLES, sid, "result.json")) as f:
                r = json.load(f)
        except (OSError, ValueError):
            return False
        lp = ((r.get("lesson") or {}).get("piece") or {}) if isinstance(r.get("lesson"), dict) else {}
        dur = ((r.get("job") or {}).get("video") or {}).get("durationS") if isinstance(r.get("job"), dict) else None
        return (start is None and (piece is None or piece == lp.get("id"))
                and (win is None or not isinstance(dur, (int, float)) or dur <= win + 0.5))
    t = s.get("take") if isinstance(s.get("take"), dict) else {}
    return (t.get("sha256") == digest and not t.get("scoreFile") and not t.get("performance")
            and (t.get("piece"), t.get("startS"), t.get("windowS")) == (piece, start, win))


def _samples_by_take(digest):
    """[(id, sample.json)] of the samples made from an upload of these bytes (sample.json take.sha256)."""
    out = []
    for sid in _sample_ids():
        s = _sample_meta(os.path.join(SAMPLES, sid))
        if s and isinstance(s.get("take"), dict) and s["take"].get("sha256") == digest:
            out.append((sid, s))
    return out


def _link(src, dst):
    """dst as a hard link to src (the same bytes, no more disk), else a copy."""
    try:
        os.link(src, dst)
    except OSError:
        shutil.copyfile(src, dst)


def _replay_prepare(jid, d, kind, oid, name):
    """Job jid's result (in d) as the finished job or sample oid's: the module section notes. Returns the steps its mock
    run ends with (the source's own, Muse's voice skipped when there is no voice pack to give)."""
    src = os.path.join(DATA, oid) if kind == "job" else _sample_dir(oid)
    with open(os.path.join(src, "result.json")) as f:
        r = json.load(f)
    if not (isinstance(r, dict) and (r.get("job") or {}).get("status") == "done"):
        raise ValueError(f"{kind} {oid} has no finished result")
    work = os.path.join(d, "work")
    os.makedirs(work, exist_ok=True)
    _link(os.path.join(src, "work", "video.mp4") if kind == "job" else os.path.join(src, "video.mp4"), os.path.join(work, "video.mp4"))
    voice = os.path.join(src, "work", "voice.mp4") if kind == "job" else os.path.join(src, "voice.mp4")
    pipe = dict(r["pipeline"]) if isinstance(r.get("pipeline"), dict) else {}
    steps = [dict(x) for x in pipe.get("steps") or [] if isinstance(x, dict)]
    if isinstance(r.get("voicePack"), dict) and os.path.isfile(voice):
        _link(voice, os.path.join(work, "voice.mp4"))
    else:                                      # no voice pack to give (a sample made without it): the page's own voice
        r.pop("voicePack", None)
        steps = [dict(VOICE_STEP, state="skipped", ms=None, note="the voice is not set up on this server")
                 if x.get("id") == VOICE_STEP["id"] else x for x in steps]
    plan = os.path.join(src, "plan.json")
    if os.path.isfile(plan):
        shutil.copyfile(plan, os.path.join(d, "plan.json"))
    job = dict(r["job"]) if isinstance(r.get("job"), dict) else {}
    video = dict(job.get("video")) if isinstance(job.get("video"), dict) else {}
    if name:
        video["name"] = name
    else:
        video.pop("name", None)
    r["job"] = dict(job, id=jid, createdAt=time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()), status="done", error=None,
                    video=video)
    if isinstance(r.get("media"), dict):
        r["media"] = {k: v for k, v in r["media"].items() if k != "videoKey"}
    pipe["steps"] = steps
    r["pipeline"] = pipe
    if _view_of(r) is not None:                # the cuts of the recorded hands under this job's own key (the ledger's bars)
        _refresh_view(r)                       # ... for the phrases its fixes play now (lesson_view.refresh)
        _with_ghosts(r, "job", jid, os.path.join(d, GHOST_DIR))
    _write_result(d, r)
    return steps


def _replay_plan(final):
    """[(step id, label, start, end, its final dict)] of a mock run ending with the steps `final` (REPLAY_PLAN; with no
    Muse's voice step in them, the lesson runs to the end)."""
    import pipeline
    by = {x.get("id"): x for x in final if isinstance(x, dict)}
    labels = {sid: lab for sid, lab, _ in pipeline.STEPS}
    labels.update({LESSON_STEP["id"]: LESSON_STEP["label"], VOICE_STEP["id"]: VOICE_STEP["label"]})
    plan = [x for x in REPLAY_PLAN if x[0] != VOICE_STEP["id"] or VOICE_STEP["id"] in by]
    plan[-1] = (plan[-1][0], plan[-1][1], 1.0)
    out = []
    for sid, a, b in plan:
        fin = dict(LESSON_STEP, state="done", ms=None) if sid == LESSON_STEP["id"] else \
            dict(by.get(sid) or dict(state="done", ms=None), id=sid)
        fin["label"] = fin.get("label") or labels.get(sid, sid)
        out.append((sid, fin["label"], a, b, fin))
    return out


def _replay_status(plan, e, total):
    """(the status fields a real job would report at share e of its run: step, progress, steps, etaS)."""
    import pipeline
    w = {sid: wt for sid, _, wt in pipeline.STEPS}
    end_pipe = max((b for sid, _, _, b, _ in plan if sid in w), default=1.0)
    steps, prog, cur, eta = [], 0.0, None, None
    for sid, label, a, b, fin in plan:
        if e >= b:
            steps.append(dict(fin))
            prog += w.get(sid, 0.0)
        elif e >= a:
            steps.append(dict(id=sid, label=label, state="running", ms=None))
            prog += w.get(sid, 0.0) * (e - a) / max(b - a, 1e-9)
            cur = label
            if sid == "hands":                 # SAM's own estimate, as the hands step reports one
                eta = round(max(0.0, (end_pipe - e) * total))
        elif sid != VOICE_STEP["id"]:          # Muse's voice is in a real job's steps only once it starts
            steps.append(dict(id=sid, label=label, state="waiting", ms=None))
    return dict(step=cur, progress=round(min(1.0, prog), 4), steps=steps, etaS=eta)


def _replay_run(jid, plan, total):
    """The mock run's clock (its own thread): the status every REPLAY_TICK_S, then done (its result is on disk already)."""
    t0 = time.monotonic()
    try:
        while True:
            e = (time.monotonic() - t0) / total if total > 0 else 1.0
            if e >= 1.0:
                break
            st = _replay_status(plan, e, total)
            with LOCK:
                if jid in JOBS:
                    JOBS[jid].update(status="running", **st)
            time.sleep(min(REPLAY_TICK_S, total / 200))
    except Exception as e:                     # the result is there whatever the clock did
        log.warning("mock run %s: %s: %s", jid, type(e).__name__, e)
    with LOCK:
        if jid in JOBS:
            JOBS[jid].update(status="done", progress=1.0, step=None, etaS=None, steps=[dict(f) for *_, f in plan])


def _start_replay(jid, d, kind, oid, name):
    """Job jid becomes a mock run of `kind` ("job" or "sample") oid: queued in the page's eyes first (so no list shows it
    done before it ran), its result written, then its clock started. Raises when the source cannot be copied."""
    with LOCK:
        JOBS[jid] = _queued(jid, name)
    try:
        plan = _replay_plan(_replay_prepare(jid, d, kind, oid, name))
    except BaseException:
        with LOCK:
            JOBS.pop(jid, None)
        raise
    threading.Thread(target=_replay_run, args=(jid, plan, _replay_s()), name=f"replay-{jid[:8]}", daemon=True).start()


@app.get("/api/code")
def code_check(request: Request):
    """Whether the X-Teacher-Code header holds a judge code this server takes -> {ok, uploadsLeft, perDay, maxBytes,
    maxS}; 401 when it does not, 404 when this server takes no codes. The page checks a code here before an upload."""
    if not _codes_on():
        raise HTTPException(404, "this server takes no judge codes")
    cid = _code_id(request)
    if not cid:
        raise HTTPException(401, "that judge code was not accepted")
    lim = _judge_limits()
    with LOCK:
        used = _code_used(cid)
    return dict(ok=True, uploadsLeft=max(0, lim["perDay"] - used), **lim)


def _told_matches(told, now):
    """Whether the list the page showed ("told") is what this server would do now. openWeights, framingTip and voiceOut
    came later: a page that sends none of them was shown none, which is right only while they are off."""
    if not isinstance(told, dict) or set(told) - set(now):
        return False
    off = dict(openWeights=dict(muse=False), framingTip=dict(available=False), voiceOut=dict(on=False))
    return all(told.get(k, off.get(k)) == v for k, v in now.items())


@app.get("/api/jobs/{jid}")
def job_status(jid: str, request: Request):
    cid = _auth_job(request, jid)
    st = _status(jid)
    if cid is not None or not _token_ok(request):     # a judge code: plain words, never an exception's text
        st = dict(st, error=_plain_error(st.get("error")), steps=_plain_steps(st.get("steps")))
    return st


# an exception's text as the pipeline or the worker keeps it ("ValueError: ..."): what a judge is told instead, in plain words
_EXCEPTION = re.compile(r"^[A-Za-z_][\w.]*(?:Error|Exception|Exit|Interrupt|TimedOut|Refused|Warning)\b:?\s*")
_INTERNALS = re.compile(r"[/\\]|\.py\b|Traceback|\b[a-z]+_[a-z_]+\b|\b0x[0-9a-f]+")
PLAIN_FAILED = ("Something went wrong while this take was being analysed, so it has no lesson. Please try again in a while, "
                "or film it again.")


def _plain_error(err):
    """What a judge code is told of a failure: the server's and the pipeline's own plain sentences as they are (the time
    limit, an interrupted job, a take uploaded under other settings); an exception's text becomes PLAIN_FAILED. The
    exception itself stays in the log and, for the token, in the job's status and result."""
    if not isinstance(err, str) or not err.strip():
        return err
    m = _EXCEPTION.match(err)
    if not m:
        return err
    rest = err[m.end():].strip()
    if err.startswith("RuntimeError") and rest and len(rest) < 400 and not _INTERNALS.search(rest):
        return rest                                 # the pipeline's own words for the player (pipeline._run)
    return PLAIN_FAILED


def _plain_steps(steps):
    """The steps with any note that is an exception's text replaced by "stopped"."""
    return [dict(s, note="stopped") if isinstance(s, dict) and isinstance(s.get("note"), str) and _EXCEPTION.match(s["note"]) else s
            for s in steps or []]


@app.get("/api/jobs/{jid}/result")
def job_result(jid: str, request: Request):
    cid = _auth_job(request, jid)
    d = _job_dir(jid)
    rp = os.path.join(d, "result.json")
    if not os.path.exists(rp):
        raise HTTPException(409, "the analysis is not finished yet")
    r = json.load(open(rp))
    r.pop("trace", None)
    _refresh_measures(r)                           # a lesson from before the timing per hand and touch gets them
    r = _public(_strip_recorded(r))                # the fingertip reader's gates name where they were measured
    if not _token_ok(request):                     # a judge code: the diagnostics the page never shows on a video stay here,
        import make_sample as MS                   # and what the models did (tries, usage, cost, provider errors), as a sample
        from fingering import phone as PH          # the fingering: only its per-hand agreement summary (PH.public_block)
        pub = PH.public_block(r.pop("fingering", None))
        if pub:
            r["fingering"] = pub
        r["pipeline"] = MS.public_pipeline(r.get("pipeline"))   # who worded it on the open route stays (voiceAuthor)
        if isinstance(r.get("plan"), dict):
            r["plan"] = {k: v for k, v in r["plan"].items() if k not in ("note", "usage")}
        if isinstance(r.get("modelCalls"), list):
            r["modelCalls"] = [{k: c[k] for k in MODEL_CALL_PUBLIC if k in c} for c in r["modelCalls"] if isinstance(c, dict)]
        r = _thin(r)
    if os.environ.get("TEACHER_TOKEN") and isinstance(r.get("media"), dict):
        r["media"]["videoKey"] = _media_key(jid)
    _job_reader_view(r, jid, d)
    r.setdefault("source", "upload")              # results from before the demos: an upload, on the video stage
    r.setdefault("stage", dict(kind="video"))
    r["policy"] = _job_policy(d, r)
    if not isinstance(r.get("plan"), dict):        # a result from before the plan: the one made on first view, if any
        cached = _plan_file(d)
        if cached:
            r["plan"] = cached
    orig = _retake_of(jid, cid)
    if orig:                                       # a re-take this caller may compare: the page asks for /compare
        r["retakeOf"] = orig
        r = _retake_view(r, _once(lambda: _job_compare(jid, cid)))
    return JSONResponse(r)


def _plan_file(d):
    try:
        with open(os.path.join(d, "plan.json")) as f:
            p = json.load(f)
        return p if isinstance(p, dict) else None
    except (OSError, ValueError):
        return None


def _make_plan(jid):
    """A job's plan for a result from before the pipeline made one: made once (practice_plan.make, under the job's
    policy and its player's 18+, and by a model only when the upload's agreement names the plan:
    practice_plan.consent_names_plan), kept as plan.json."""
    import practice_plan as PP
    d = _job_dir(jid)
    with LOCK:
        lock = PLAN_LOCKS.setdefault(jid, threading.Lock())
    with lock:
        got = _plan_file(d)
        if got:
            return got
        res, adult = _job_take(jid)
        if isinstance(res.get("plan"), dict):
            return res["plan"]
        plan = PP.make(res, adult, model=PP.consent_names_plan(_job_file(d).get("consent")))
        tmp = os.path.join(d, "plan.json.tmp")
        with open(tmp, "w") as f:
            json.dump(plan, f)
        os.replace(tmp, os.path.join(d, "plan.json"))
        return plan


@app.get("/api/jobs/{jid}/plan")
async def job_plan(jid: str, request: Request):
    """The job's practice plan: the one the pipeline made, else the one made on first view (plan.json), else made now,
    on the plans' own threads (PLAN_THREADS); a second view while it is being made waits for the same build."""
    cid = _auth_job(request, jid)
    _job_dir(jid)
    t = PLAN_TASKS.get(jid)
    if t is None:
        t = asyncio.ensure_future(anyio.to_thread.run_sync(lambda: _make_plan(jid), limiter=PLAN_THREADS))
        PLAN_TASKS[jid] = t
        t.add_done_callback(lambda _t: PLAN_TASKS.pop(jid, None))
    plan = await asyncio.shield(t)                 # a view that goes away leaves the build to finish for the next one
    plan = await run_in_threadpool(_with_progress, plan, lambda: _job_compare(jid, cid))
    return JSONResponse(_public_plan(plan))


def _public_plan(plan):
    """The plan as the page gets it: what happened to each model stays in the log."""
    if plan.get("note"):
        log.info("plan: %s", json.dumps(plan["note"])[:600])
    return {k: v for k, v in plan.items() if k not in ("note", "usage")}


def _strip_recorded(r):
    """The result without any inline recorded performance (ghost_guard.strip_recorded): for every caller, the token too."""
    import ghost_guard as GG
    return GG.strip_recorded(r)


# what a judge code and a sample's visitor never get of a result: the exercise library's options for every part (the
# chosen practice's own line, bars and steps stay), the rules' reasons, the stop and octave rules' workings
OCTAVE_RUN_INTERNALS = ("why", "rule", "rules", "detail", "tried")


def _thin(r):
    """A result as a judge code or a sample's visitor gets it (the module notes): no lesson part's exercise options, no
    practice's rule reason, no analysis.stopRule, no octave vote's workings or the octave runs' reasons and rules, no
    octave confirmation's reasoning on a note (reference.octave.notes[].audio.why) or rule, no note judge's rule text
    (reference.pov.rule), and a failure's exception as plain words (_plain_error). The labels and numbers How this was
    measured shows stay (the octave's shift, source and rule name), and so does the practice plan's own rule (plan.rule,
    "5 clean in a row, then 10 faster": what the week tells the learner)."""
    lesson = r.get("lesson")
    if isinstance(lesson, dict):
        for p in lesson.get("parts") or []:
            if isinstance(p, dict):
                p.pop("options", None)
                if isinstance(p.get("practice"), dict):
                    p["practice"].pop("why", None)
    a = r.get("analysis")
    if isinstance(a, dict):
        a.pop("stopRule", None)
        if isinstance(a.get("octave"), dict):
            a["octave"].pop("vote", None)
        for x in a.get("octaveRuns") or []:
            if isinstance(x, dict):
                for k in OCTAVE_RUN_INTERNALS:
                    x.pop(k, None)
    ref = r.get("reference")
    if isinstance(ref, dict):
        if isinstance(ref.get("pov"), dict):
            ref["pov"].pop("rule", None)
        oc = ref.get("octave")
        if isinstance(oc, dict):
            for k in ("rule", "why"):
                oc.pop(k, None)
            for n in oc.get("notes") or []:
                if isinstance(n, dict) and isinstance(n.get("audio"), dict):
                    n["audio"].pop("why", None)
    job = r.get("job")
    if isinstance(job, dict) and job.get("error"):
        job["error"] = _plain_error(job["error"])
    if isinstance(r.get("pipeline"), dict) and isinstance(r["pipeline"].get("steps"), list):
        r["pipeline"]["steps"] = _plain_steps(r["pipeline"]["steps"])
    return r


def _view_of(r):
    lesson = r.get("lesson") if isinstance(r, dict) else None
    v = lesson.get("view") if isinstance(lesson, dict) else None
    return v if isinstance(v, dict) else None


def _tile_links(view, base, key=None):
    """Each score tile of the view's window (_window_tiles) as a link its page can show (an <img> sends no header: the
    media key); a listed tile outside the window gets none."""
    score = view.get("score") if isinstance(view.get("score"), dict) else None
    mine = _window_tiles(view) if score else set()
    for t in (score or {}).get("tiles") or []:
        if isinstance(t, dict) and isinstance(t.get("id"), str) and TILE_ID.fullmatch(t["id"]) and t["id"] in mine:
            t["url"] = f"{base}/{t['id']}" + (f"?k={key}" if key else "")


def _refresh_measures(r):
    """A stored lesson's measures brought up to this code where they are only older (lesson.refresh_measures: the timing
    per hand and touch, which the end shows), against the result's own library piece; in place and not saved, before
    _public strips the rows it reads; never fails the reader."""
    try:
        import lesson as LS
        import library
        import pipeline
        lp = LS.located(r.get("reference")) if isinstance(r.get("reference"), dict) else None
        if not (lp and lp.get("id")):
            return
        LS.refresh_measures(r, library.load(lp["id"], internal=pipeline.library_internal()))
    except Exception as e:
        log.warning("lesson measures not refreshed: %s: %s", type(e).__name__, e)


def _refresh_view(r):
    """A stored view brought up to lesson_view's reference windows (lesson_view.refresh: the phrase each fix's correct
    version and exercise play), in place and not saved; never fails the reader."""
    fn = _lane_fn("lesson_view", "refresh")
    if fn is None:
        return
    try:
        fn(r)
    except Exception as e:
        log.warning("lesson view not refreshed: %s: %s", type(e).__name__, e)


def _job_reader_view(r, jid, d):
    """The job's view as its reader gets it: each ready cut's {url, key, exp} (ghost_guard.attach, the job's own key) and
    each score tile's link. A result from before the view was built gets it now when it can (not saved), and one from
    before the phrase windows gets those (_refresh_view)."""
    import ghost_guard as GG
    view = _view_of(r)
    if view is None and isinstance(r.get("lesson"), dict) and _with_view(r):
        view = _view_of(r)
    if view is None:
        return
    _refresh_view(r)
    GG.attach(view, DATA, "job", jid, f"/api/jobs/{jid}/ghost", index=GG.read_index(os.path.join(d, GHOST_DIR)) or {})
    _tile_links(view, f"/api/jobs/{jid}/score", _media_key(jid) if os.environ.get("TEACHER_TOKEN") else None)


# ---------------------------------------------------------------- a re-take against the take it films again (compare.py)

def _retake_of(jid, cid):
    """The job this one films again (job.json retakeOf, recorded at upload only when the uploader could open it), when this
    caller may open it too: the token (cid None) any, a judge code only one uploaded with that same code. Else None."""
    orig = _job_file(_job_dir(jid)).get("retakeOf")
    od = os.path.join(DATA, orig) if _is_id(orig) and orig != jid else None
    if not (od and os.path.isdir(od)):
        return None
    if cid is not None and _job_file(od).get("codeId") != cid:
        return None
    return orig


def _done_result(d):
    """A finished result as the conversation reads it (no trace, nothing internal), or None (missing, failed, unreadable)."""
    try:
        with open(os.path.join(d, "result.json")) as f:
            r = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(r, dict) or (r.get("job") or {}).get("status") != "done":
        return None
    r.pop("trace", None)
    return _public(r)


def _job_compare(jid, cid):
    """(the comparison of job jid with the job it films again, what may go to a hosted model about that first take: its
    policy). 404 when it is not a re-take of a job this caller may open, or that job has no finished result; 409 while
    this one is not finished, or when it failed."""
    import compare as C
    orig = _retake_of(jid, cid)
    if not orig:
        raise HTTPException(404, "this take is not a re-take of one you can open")
    d = _job_dir(jid)
    after = _done_result(d)
    if after is None:
        raise HTTPException(409, "the analysis is not finished yet" if not os.path.exists(os.path.join(d, "result.json"))
                            else "this analysis failed; there is nothing to compare")
    od = os.path.join(DATA, orig)
    before = _done_result(od)
    if before is None:
        raise HTTPException(404, "the take this one films again has no result to compare with")
    block = C.compare(before, after)
    block["before"].update(kind="job", id=orig)
    block["after"].update(kind="job", id=jid)
    return block, _job_policy(od, before)


def _attach_compare(res, make):
    """res with its comparison (compare, and beforePolicy: what may go to a hosted model about the first take, which
    voice.compare_for reads) when it is a re-take the caller may compare; res as it is otherwise."""
    try:
        block, pol = make()
    except HTTPException:
        return res
    return dict(res, compare=dict(block, beforePolicy=pol))


def _once(make):
    """make() worked out once however often it is asked for (its answer, or the HTTPException it raised)."""
    memo = []

    def get():
        if not memo:
            try:
                memo.append((make(), None))
            except HTTPException as e:
                memo.append((None, e))
        if memo[0][1] is not None:
            raise memo[0][1]
        return memo[0][0]
    return get


def _with_progress(plan, make):
    """A re-take's plan with what changed since the first take (practice_plan.progress: fixed words from the comparison,
    never a model's), and for a re-take too short to plan from, that it is one; the plan as it is otherwise."""
    import practice_plan as PP
    try:
        block, _ = make()
    except HTTPException:
        return plan
    lines = PP.progress(block)
    if not lines:
        return plan
    return dict(plan, progress=lines, **({"none": PP.NONE_RETAKE} if plan.get("none") == PP.NONE["too short"] else {}))


def _retake_view(r, make):
    """A re-take's result as the page shows it: its plan with what changed (_with_progress), and when the take was too short
    to judge the technique but its bars were compared with the first take, a headline that says it is a short re-take
    (voice.RETAKE_SHORT, fixed words) rather than that it was filmed wrong."""
    import voice as V
    if isinstance(r.get("plan"), dict):
        r["plan"] = _with_progress(r["plan"], make)
    sm = r.get("summary")
    if isinstance(sm, dict) and isinstance(sm.get("say"), str) and V.TOO_SHORT in sm["say"]:
        try:
            block, _ = make()
        except HTTPException:
            return r
        if any(b.get("verdict") != "not measured" for b in block.get("bars") or []):
            r["summary"] = dict(sm, say=sm["say"].replace(V.TOO_SHORT, V.RETAKE_SHORT))
    return r


@app.get("/api/jobs/{jid}/compare")
def job_compare(jid: str, request: Request):
    """A re-take against the take it films again (compare.py's block), for a caller who may open both: the token, or the
    judge code both were uploaded with (the re-take's own key opens it for that code). 404 for a take that is not one."""
    cid = _auth_job(request, jid)
    return JSONResponse(_job_compare(jid, cid)[0])


@app.get("/api/jobs/{jid}/media/video.mp4")
def job_video(jid: str, request: Request, k: str = ""):
    if not (k and os.environ.get("TEACHER_TOKEN") and hmac.compare_digest(k.encode("utf-8", "replace"), _media_key(jid).encode())):
        _auth_job(request, jid)
    p = os.path.join(_job_dir(jid), "work", "video.mp4")
    if not os.path.exists(p):
        raise HTTPException(404, "no video yet")
    return FileResponse(p, media_type="video/mp4")


@app.get("/api/jobs/{jid}/media/voice.mp4")
def job_voice(jid: str, request: Request, k: str = ""):
    """The lesson's voice pack (every line of it said once, audio only; result.voicePack says where each line is), when
    the job has one in work/voice.mp4: 404 otherwise, and the page says the lines in the browser's own voice. The same
    access as the video, its media key included (an <audio> element cannot send the bearer header either)."""
    if not (k and os.environ.get("TEACHER_TOKEN") and hmac.compare_digest(k.encode("utf-8", "replace"), _media_key(jid).encode())):
        _auth_job(request, jid)
    p = os.path.join(_job_dir(jid), "work", "voice.mp4")
    if not os.path.exists(p):
        raise HTTPException(404, "this lesson has no voice pack")
    return FileResponse(p, media_type="audio/mp4")


def _ghost_response(kind, oid, folder, n, exp, sig):
    """One encrypted cut, for a link ghost_guard signed and that has not expired: never cached, never sniffed."""
    import ghost_guard as GG
    if not GG.verify(DATA, kind, oid, n, exp, sig):
        raise HTTPException(403, "this link has expired: open the lesson again")
    b = GG.blob(folder, n)
    if b is None:
        raise HTTPException(404, "no such part")
    return Response(b, media_type="application/octet-stream", headers={"Cache-Control": "no-store"})


@app.get("/api/jobs/{jid}/ghost/{n}")
def job_ghost(jid: str, n: int, exp: str = "", sig: str = ""):
    """Fix n's cut of the recorded performance, encrypted with the job's key (ghost_guard.py): the signed, expiring link the
    job's result gave its reader is the only way in (a fetch from the page, which sends no header)."""
    if not _is_id(jid):
        raise HTTPException(404, "no such job")
    return _ghost_response("job", jid, os.path.join(DATA, jid, GHOST_DIR), n, exp, sig)


def _num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _window_tiles(view):
    """The ids of the score tiles a view's window shows, which are the only ones its routes serve. A tile is 2048 px of
    the score, so the window's first and last tiles reach past it: a tile is the window's when it overlaps it. Worked out
    again here from the window's played bars (score_assets.window(piece, kFrom, kTo)) when that module is here, so a
    result's own tile list is never what decides; without it, the tiles the view lists that overlap the window (by the
    window's span of the score, geom.x0..x1, else by its written bars)."""
    import ghost_guard as GG
    score = view.get("score") if isinstance(view, dict) and isinstance(view.get("score"), dict) else {}
    win = score.get("window") if isinstance(score.get("window"), dict) else {}
    listed = {t["id"]: t for t in score.get("tiles") or [] if isinstance(t, dict) and isinstance(t.get("id"), str)}
    pid, fn = GG.piece_of(view), _lane_fn("score_assets", "window")
    k0, k1 = win.get("kFrom"), win.get("kTo")
    if fn is not None and pid and isinstance(k0, int) and isinstance(k1, int) and not isinstance(k0, bool):
        try:
            got = fn(pid, k0, k1)
        except Exception as e:
            log.warning("score_assets.window(%s, %s, %s): %s: %s", pid, k0, k1, type(e).__name__, e)
            got = None
        ids = {t.get("id") for t in (got or {}).get("tiles") or [] if isinstance(t, dict)} if isinstance(got, dict) else set()
        return ids & set(listed)
    geom = score.get("geom") if isinstance(score.get("geom"), dict) else {}
    gx0, gx1 = geom.get("x0"), geom.get("x1")
    if _num(gx0) and _num(gx1):
        return {i for i, t in listed.items() if _num(t.get("x0")) and _num(t.get("x1")) and t["x1"] > gx0 and t["x0"] < gx1}
    lo, hi = win.get("fromBar"), win.get("toBar")
    if not (isinstance(lo, int) and isinstance(hi, int)):
        return set()
    lo, hi = min(lo, hi), max(lo, hi)
    return {i for i, t in listed.items() if isinstance(t.get("fromBar"), int) and isinstance(t.get("toBar"), int)
            and t["fromBar"] <= hi and t["toBar"] >= lo}


def _tile_response(view, tile):
    """A score tile (score_assets.tile) of the view's window (_window_tiles): a file under the library, an image, sent
    with its own Content-Security-Policy (an SVG opened on its own runs nothing). 404 for any other."""
    if not TILE_ID.fullmatch(tile) or ".." in tile or tile not in _window_tiles(view):
        raise HTTPException(404, "no such tile")
    import ghost_guard as GG
    pid, fn = GG.piece_of(view), _lane_fn("score_assets", "tile")
    try:
        p = fn(pid, tile) if fn and pid else None
    except Exception:
        p = None
    lib = os.path.realpath(TILE_ROOT) + os.sep
    real = os.path.realpath(p) if isinstance(p, str) else ""
    kind = TILE_TYPES.get(os.path.splitext(real)[1].lower())
    if not (real.startswith(lib) and os.path.isfile(real) and kind):
        raise HTTPException(404, "no such tile")
    return FileResponse(real, media_type=kind, headers={
        "Cache-Control": "private, max-age=600",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; sandbox"})


@app.get("/api/jobs/{jid}/score/{tile}")
def job_score(jid: str, tile: str, request: Request, k: str = ""):
    """A score tile of the job's own window (result.lesson.view.score.tiles): the media key (an <img> sends no header), the
    token or the job's judge code; a tile the view does not list, or one outside its window, is 404."""
    if not (k and os.environ.get("TEACHER_TOKEN") and hmac.compare_digest(k.encode("utf-8", "replace"), _media_key(jid).encode())):
        _auth_job(request, jid)
    d = _job_dir(jid)
    try:
        with open(os.path.join(d, "result.json")) as f:
            r = json.load(f)
    except (OSError, ValueError):
        raise HTTPException(404, "no such tile") from None
    if _view_of(r) is None:
        _with_view(r)
    return _tile_response(_view_of(r), tile)


def _muse_ok(d, at="metaAtUpload"):
    """Whether this job's questions may go to hosted Muse by one route: Meta's API (metaAtUpload) or
    OpenRouter (openrouterAtUpload), only when the player was told so at upload and confirmed 18+. Other
    jobs, and jobs from before consent was recorded, never reach Meta (our own Glimmer, or the fixed
    answers); a job uploaded before OpenRouter was named has no openrouterAtUpload, so it never reaches
    OpenRouter."""
    import voice as V
    c = _job_file(d).get("consent") or {}
    if at == "openrouterAtUpload":                 # and only for the providers named then (Meta, for Muse Spark)
        return bool(c.get("adult") and V.openrouter_consent_covers(c.get(at)))
    if at == "openWeightsAtUpload":                # the open-weights host named then, for the model family named then
        return bool(c.get("adult") and V.open_consent_covers(c.get(at)))
    return bool(c.get("adult") and (c.get(at) or {}).get("muse"))


def _job_policy(d, res):
    """What may go to hosted Muse about this job, by route (voice.hosted_allowed reads it): hostedMuse for
    Meta's API, openrouterMuse for OpenRouter. An uploaded phone or camera video is not Quest Device User
    Data, so the player's own 18+ and consent to that route at upload decides (job.json); the policy the
    pipeline wrote from that same consent can only narrow it. Results from before the policy was written
    are uploads."""
    pol = res.get("policy") if isinstance(res.get("policy"), dict) else {}
    return dict(dataOrigin=pol.get("dataOrigin") or "upload",
                hostedMuse=bool(_muse_ok(d) and pol.get("hostedMuse", True) is True),
                openrouterMuse=bool(_muse_ok(d, "openrouterAtUpload") and pol.get("openrouterMuse", True) is True),
                openWeightsMuse=bool(_muse_ok(d, "openWeightsAtUpload") and pol.get("openWeightsMuse", True) is True))


def _job_take(jid):
    """A finished job's result for the conversation, its policy filled in, and adult: True when its
    player confirmed 18+ at upload (else None)."""
    d = _job_dir(jid)
    rp = os.path.join(d, "result.json")
    if not os.path.exists(rp):
        raise HTTPException(409, "the analysis is not finished yet")
    res = json.load(open(rp))
    if res.get("job", {}).get("status") != "done":
        raise HTTPException(409, "this analysis failed; there is nothing to ask about")
    res.pop("trace", None)
    res["policy"] = _job_policy(d, res)
    return res, (True if (_job_file(d).get("consent") or {}).get("adult") else None)


async def _json_object(request, limit, too_large, wrong):
    """The request's JSON object, its declared length checked first; 400 with `wrong` for anything else, 415 unless it is
    sent as application/json: a page on another site can POST text/plain to here with no preflight, and so make its
    visitors' browsers ask the samples' questions, but application/json needs a preflight this server never answers."""
    if (request.headers.get("content-type") or "").split(";")[0].strip().lower() != "application/json":
        raise HTTPException(415, "please send this as JSON (Content-Type: application/json)")
    _length(request, limit, too_large)
    try:
        body = await request.json()
    except ValueError:
        body = None
    if not isinstance(body, dict):
        raise HTTPException(400, wrong)
    return body


def _answer(out):
    """voice.chat's reply as the page gets it: with what the teacher looked up, the moments it pointed at and who wrote
    it. A fixed answer given because a model was tried and could not be used says why in one word (fallback: "busy",
    "unavailable" or "rejected", its answer failing our checks), so the page can say a model was tried; the error itself,
    what was refused and what it cost stay in the log."""
    if out.get("error") or out.get("rejected"):
        log.info("chat: the fixed answer instead of the model's: %s", out.get("error") or "; ".join(map(str, out["rejected"])))
    if out.get("usage"):
        log.info("chat: %s in %s s, %s lookups, usage %s", out.get("model"), out.get("seconds"), len(out.get("lookups") or []), out["usage"])
    got = dict(answer=out.get("answer"), source=out.get("source"), model=out.get("model"), findingIds=list(out.get("findingIds") or []))
    if got["source"] == "fixed" and (out.get("error") or out.get("rejected")):
        got["fallback"] = ("rejected" if out.get("rejected") else "busy" if str(out.get("error")).startswith("busy:") else "unavailable")
    for k in ("lookups", "moments", "author"):
        if out.get(k):
            got[k] = out[k]
    return got


async def _chat(V, res, history, question, adult, target, token_ok=True):
    """voice.chat off the event loop, on threads of its own: a model over the network can take
    TEACHER_MUSE_TIMEOUT a question, and on starlette's shared pool a flood of questions held up the
    demos, health, uploads and speech-to-text with it. While CHAT_MODELS questions are being answered
    another gets the fixed answer at once, with no model call, so a flood costs no more model calls; a caller without
    the token gets it at CHAT_MODELS - 1 already, so one place is always kept for the team's own questions."""
    if CHAT["open"] >= CHAT_MODELS - (0 if token_ok else 1):      # checked and counted with no await between: one event loop
        answer, ids = V._fixed_answer(res, V.clean(question if isinstance(question, str) else "")[:500])
        out = dict(answer=answer, source="fixed", model=None, findingIds=ids)
        if _would_reach_hosted(V, res, adult) or V.backends()["glimmer"]:   # "busy" only where a model would have answered
            out["error"] = f"busy: {CHAT['open']} questions being answered"
        return out
    CHAT["open"] += 1
    try:
        return await anyio.to_thread.run_sync(lambda: V.chat(res, history, question, adult=adult, target=target), limiter=CHAT_THREADS)
    finally:
        CHAT["open"] -= 1


def _no_hosted(res):
    """res with every hosted route shut in its policy (voice.POLICY_KEY): Glimmer answers, else the fixed answers."""
    import voice as V
    return dict(res, policy=dict(res.get("policy") or {}, **{k: False for k in V.POLICY_KEY.values()}))


def _would_reach_hosted(V, res, adult):
    """Whether voice.chat could send this question to the hosted route (voice._backend's test, before the pain and
    can't-judge lines that answer without a model)."""
    h = V._hosted()
    return bool(h and V.hosted_allowed(res, adult, h.get("route", "meta")) and not V._fingering_content(res))


def _code_ask_limit(cid):
    """TEACHER_JUDGE_QUESTIONS questions a day from one judge code about its own takes; 429 past that."""
    n = _judge_limits()["questionsPerDay"]
    now = time.time()
    with LOCK:
        asked = _recent(CODE_ASKED, cid, CODE_DAY_S, now)
        if len(asked) >= n:
            raise HTTPException(429, f"this judge code has asked its {n} questions for today; please try again tomorrow.")
        CODE_ASKED[cid] = asked + [now]
        _save_limits()


def _open_budget(V, res, adult):
    """A question from a caller without the token (a sample's visitor, a judge code) that could reach a hosted model is
    counted against TEACHER_OPEN_HOSTED_DAY (default 300) across the server over the last day; past it, res comes back
    with the hosted routes shut, so Glimmer or the fixed answers reply and nothing more is spent."""
    if not _would_reach_hosted(V, res, adult):
        return res
    n = _setting("TEACHER_OPEN_HOSTED_DAY", 300, 0, 10**6, integer=True)
    now = time.time()
    with LOCK:
        OPEN_HOSTED[:] = [t for t in OPEN_HOSTED if now - t < OPEN_DAY_S]
        if len(OPEN_HOSTED) >= n:
            full = True
        else:
            full = False
            OPEN_HOSTED.append(now)
            _save_limits()
    if full:
        log.info("chat: TEACHER_OPEN_HOSTED_DAY (%s) reached: a question without the token gets Glimmer or the fixed answer", n)
        return _no_hosted(res)
    return res


@app.post("/api/jobs/{jid}/ask")
async def job_ask(jid: str, request: Request):
    """One question about a job with no conversation before it: POST /api/chat, kept for older pages."""
    _need_chat()
    cid = _auth_job(request, jid)
    import voice as V
    d = _job_dir(jid)
    if not os.path.exists(os.path.join(d, "result.json")):
        raise HTTPException(409, "the analysis is not finished yet")
    body = await _json_object(request, MAX_ASK, "that question is too long", 'please send the question as JSON: {"question": "..."}')
    res, adult = _job_take(jid)
    res = _attach_compare(res, lambda: _job_compare(jid, cid))
    question = str(body.get("question", ""))
    if cid:                                        # a judge code: its own budget, and the server's for hosted models
        _code_ask_limit(cid)
        res = _open_budget(V, res, adult)
    return _answer(await _chat(V, res, [], question, adult, dict(kind="job", id=jid), token_ok=not cid))


@app.post("/api/chat")
async def chat(request: Request):
    """{"target": {"kind": "job" | "demo" | "sample", "id"}, "history": [{"role": "user" | "teacher", "text"}],
    "question", "consentId" (optional), "adult" (optional, a sample)} -> {"answer", "source": "muse" | "openrouter" |
    "open" | "glimmer" | "fixed", "model", "findingIds"}. voice.chat answers: the fixed answers first for pain and what the
    take cannot judge, then hosted Muse (Meta's API, OpenRouter or the open-weights host) only when the take's policy allows
    that route, else our own Glimmer, else the fixed answers;
    it keeps the last 8 turns of the history, 4,000 characters at most. consentId: a voice consent,
    which says the person asking confirmed 18+ (Terms 10.1); a demo has no upload consent, so hosted
    Muse needs it on top of MUSE_QUEST_DATA_OK=1. While CHAT_MODELS questions are being answered, the
    next gets the fixed answer (_chat).
    Who may ask: a job, with the token or the judge code it was uploaded with (TEACHER_JUDGE_QUESTIONS a day for the code);
    a demo, with the token; a sample ("kind": "sample"), anyone: without the token TEACHER_SAMPLE_CHAT_MAX questions per
    TEACHER_SAMPLE_CHAT_WINDOW_S from one client that could reach a model (ten times that for the ones only the fixed
    answers can take), 429 past that. A hosted model answers about a sample only when its player agreed to that route
    (sample.json) and, without the token, the person asking confirmed 18+ ("adult": true; Meta's Terms 10.1). Without the
    token, every question that could reach a hosted model counts against TEACHER_OPEN_HOSTED_DAY (_open_budget)."""
    import voice as V
    _need_chat()
    # a request with neither credential is refused before its body is read, unless it may be about a sample: then the
    # body (MAX_CHAT at most, its length declared first) says which
    token_ok = _token_ok(request)
    if not token_ok and not request.headers.get(CODE_HEADER) and not request.headers.get(JOB_KEY_HEADER) and not _sample_ids():
        raise HTTPException(401, _need_access())
    body = await _json_object(request, MAX_CHAT, "that conversation is too long",
                              'please send JSON: {"target": {"kind": "job", "demo" or "sample", "id": "..."}, "history": [...], "question": "..."}')
    t = body.get("target")
    if not (isinstance(t, dict) and t.get("kind") in ("job", "demo", "sample") and isinstance(t.get("id"), str)):
        raise HTTPException(400, 'please say which take the question is about: {"target": {"kind": "job", "demo" or "sample", "id": "..."}}')
    cid = None
    if t["kind"] == "job":
        cid = await run_in_threadpool(_auth_job, request, t["id"])
    elif t["kind"] == "demo" and not token_ok:
        raise HTTPException(401, "a question about a demo needs the access token" + ("; the sample lessons take questions without it"
                                                                                    if _sample_ids() else ""))
    question, history = body.get("question"), body.get("history", [])
    if not isinstance(question, str) or not question.strip():
        raise HTTPException(400, "please send a question")
    if not isinstance(history, list):
        raise HTTPException(400, 'the history must be a list of turns: [{"role": "user" or "teacher", "text": "..."}]')
    if t["kind"] == "job":
        res, adult = _job_take(t["id"])
        res = _attach_compare(res, lambda: _job_compare(t["id"], cid))
        if cid:
            _code_ask_limit(cid)
    elif t["kind"] == "sample":
        res = _attach_compare(_sample_result(t["id"]), lambda: _sample_compare(t["id"]))
        # the player agreed for their own take (make_sample --adult yes with a hosted route): the policy carries it. The
        # person asking is the team (the token) or a visitor, who must say they are 18+ before a hosted model hears them
        asker = token_ok or body.get("adult") is True
        if not asker:
            res = _no_hosted(res)
        adult = True if asker and any(res["policy"].get(k) for k in V.POLICY_KEY.values()) else None
        if not token_ok:
            _sample_ask_limit(request, _would_reach_hosted(V, res, adult) or bool(V._glimmer()))
    else:
        res = _demo_result(t["id"])
        adult = True if _consent(body.get("consentId")) else None
    if not token_ok:
        res = _open_budget(V, res, adult)
    got = _answer(await _chat(V, res, history, question, adult, dict(kind=t["kind"], id=t["id"]), token_ok=token_ok))
    if t["kind"] in ("job", "sample"):             # its words may be spoken (POST .../speak), as the take's own are
        import speech as SP
        SP.remember(f"{t['kind']}:{t['id']}", got.get("answer"))
    return got


# ---------------------------------------------------------------- the voice of Muse (speech.py, elevenlabs_api.py)

def _speak_text(body):
    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(400, 'please send JSON: {"text": "the line to say"}')
    return text


async def _speak(key, res, folder, text):
    """One of the teacher's lines about a take as ElevenLabs says it (audio/mpeg), made once and kept in folder. Only the
    take's own words (speech.allowed); 503 when it cannot be made now (today's characters, the service), and the page
    then says it with the browser's own voice."""
    import speech as SP
    if res.get("source") == "quest" or (res.get("policy") or {}).get("dataOrigin") == "quest":
        raise HTTPException(403, "a Quest take is spoken with the browser's own voice")
    words = SP.corpus(res, SP.said(key))
    if not SP.allowed(text, words):
        raise HTTPException(422, "only the teacher's own words about this take are spoken")
    try:
        audio, how = await run_in_threadpool(SP.spoken, text, folder)
    except SP.Unavailable as e:
        log.info("voice: %s", e)
        raise HTTPException(503, "the voice is not available just now: the page says it with the browser's own voice") from None
    log.info("voice: a line of %d characters, %s", len(text), how)
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=86400",
                                                             "X-Teacher-Voice": "ElevenLabs"})


@app.post("/api/jobs/{jid}/speak")
async def job_speak(jid: str, request: Request):
    """{"text"} -> audio/mpeg: one of the teacher's lines about this upload, spoken by ElevenLabs (TEACHER_VOICE=elevenlabs),
    for who may open the job, only when its player agreed to it at upload (consent.voiceAtUpload, 18+). 404 while the
    voice is the browser's; 403 for a take whose player did not agree; 422 for words that are not the take's own."""
    import speech as SP
    if not SP.offer()["on"]:
        raise HTTPException(404, "this server speaks with the browser's own voice")
    await run_in_threadpool(_auth_job, request, jid)
    body = await _json_object(request, MAX_ASK, "that line is too long", 'please send JSON: {"text": "the line to say"}')
    text = _speak_text(body)
    d = _job_dir(jid)
    if not SP.consent_covers(_job_file(d).get("consent")):
        raise HTTPException(403, "this take's player did not agree to ElevenLabs speaking its lesson; it is spoken with the "
                                 "browser's own voice")
    try:
        with open(os.path.join(d, "result.json")) as f:
            res = json.load(f)
    except (OSError, ValueError):
        raise HTTPException(409, "the analysis is not finished yet") from None
    if not isinstance(res.get("plan"), dict):
        res["plan"] = _plan_file(d)
    return await _speak(f"job:{jid}", res, os.path.join(d, "speech"), text)


@app.post("/api/samples/{sid}/speak")
async def sample_speak(sid: str, request: Request):
    """{"text"} -> audio/mpeg: one of the teacher's lines about a sample lesson, spoken by ElevenLabs, only when the
    sample's player agreed to it (sample.json consent.voice, 18+). Open to anyone like the sample, counted as a question
    about the samples (_sample_ask_limit) when it is not made yet, and against TEACHER_VOICE_DAY_CHARS."""
    import speech as SP
    if not SP.offer()["on"]:
        raise HTTPException(404, "this server speaks with the browser's own voice")
    body = await _json_object(request, MAX_ASK, "that line is too long", 'please send JSON: {"text": "the line to say"}')
    text = _speak_text(body)
    res = _sample_result(sid)
    if not _sample_voice_ok(_sample_meta(_sample_dir(sid)) or {}):
        raise HTTPException(403, "this sample's player did not agree to ElevenLabs speaking its lesson; it is spoken with the "
                                 "browser's own voice")
    folder = os.path.join(DATA, "speech-samples", sid)
    if not _token_ok(request) and not os.path.isfile(os.path.join(folder, SP.cache_name(text))):
        _sample_speak_limit(request)
    return await _speak(f"sample:{sid}", res, folder, text)


def _sample_speak_limit(request):
    """Lines of the samples not spoken yet that one client may have made without the token: ten times
    TEACHER_SAMPLE_CHAT_MAX in TEACHER_SAMPLE_CHAT_WINDOW_S (a lesson is about a dozen lines; once made, a line is
    served from its file and counts nothing). 429 past that, and the page says it with the browser's voice."""
    n = _setting("TEACHER_SAMPLE_CHAT_MAX", 20, 1, 10000, integer=True) * 10
    win = _setting("TEACHER_SAMPLE_CHAT_WINDOW_S", 600, 10, 86400)
    who, now = _client(request), time.monotonic()
    with LOCK:
        asked = _recent(SAMPLE_SPOKEN, who, win, now)
        if len(asked) >= n:
            raise HTTPException(429, "that is enough new lines from here for now; the page says them with the browser's own voice")
        SAMPLE_SPOKEN[who] = asked + [now]


def _sample_ask_limit(request, model=True):
    """TEACHER_SAMPLE_CHAT_MAX questions about the samples in TEACHER_SAMPLE_CHAT_WINDOW_S from one client without the
    token (an address, an IPv6 one by its /64: behind a proxy on this machine, uvicorn takes it from X-Forwarded-For), for
    the questions a model could answer (model: hosted or Glimmer); ten times that for those only the fixed answers take,
    which cost nothing. 429 past that."""
    n = _setting("TEACHER_SAMPLE_CHAT_MAX", 20, 1, 10000, integer=True) * (1 if model else 10)
    win = _setting("TEACHER_SAMPLE_CHAT_WINDOW_S", 600, 10, 86400)
    who, now = _client(request) + ("" if model else " fixed"), time.monotonic()
    with LOCK:
        asked = _recent(SAMPLE_ASKED, who, win, now)
        if len(asked) >= n:
            wait = max(1, int(win - (now - asked[0])))
            raise HTTPException(429, f"that is {n} questions about the samples from here in {int(win // 60)} minutes; please ask again "
                                     f"in {max(1, round(wait / 60))} minute{'s' if round(wait / 60) > 1 else ''}.")
        SAMPLE_ASKED[who] = asked + [now]


# ---------------------------------------------------------------- the demos (public read-only content)

def _demo_policy():
    """A demo is a Quest recording: nothing derived from it goes to Meta's hosted API without
    MUSE_QUEST_DATA_OK=1, nor to OpenRouter (which passes it to Meta) without MUSE_QUEST_OPENROUTER_OK=1 on top
    (voice.hosted_allowed also wants the person asking to be 18+, and keeps a demo away from a model OpenRouter
    does not run at Meta). The server's settings decide, not the ones the demo was built with. Never the open-weights
    host: no flag unlocks a Quest recording there."""
    return dict(dataOrigin="quest", hostedMuse=_quest_ok(), openrouterMuse=_quest_openrouter_ok(), openWeightsMuse=False)


def _demo_dir(did):
    if not (isinstance(did, str) and DEMO_ID.fullmatch(did)):
        raise HTTPException(404, "no such demo")
    d = os.path.join(DEMOS, did)
    if not os.path.isfile(os.path.join(d, "result.json")):
        raise HTTPException(404, "no such demo")
    return d


def _demo_result(did):
    """A demo's result.json, as a Quest recording with the policy of this server's settings."""
    try:
        with open(os.path.join(_demo_dir(did), "result.json")) as f:
            r = json.load(f)
    except (OSError, ValueError):
        r = None
    if not isinstance(r, dict):
        raise HTTPException(500, "this demo could not be read; build it again with demos/build_demos.py")
    r.pop("trace", None)
    r = _public(r)                                 # a provenance note naming another repo or a partner never leaves
    r["source"], r["policy"] = "quest", _demo_policy()
    return r


# what a served result must never name: our other repositories, a branch, a ticket, a partner, another company whose
# name a reader at Meta should not meet, a word that marks a document private (test_public_surface.py checks every public
# file and endpoint for these and more). Kept as the first 16 hex digits of the sha256 of each word, phrase or
# hyphenated name, lower-cased with every run of digits as 0 (_deny_words), so this file, which the public repository
# carries, names none of them
DENY = frozenset({"1c1f4c48d20e7f33", "3151084286f59511", "356e9063e54778b0", "375425b1daa88de8", "4b6af7521e8e696d",
                  "5388bc10736a0eff", "5e25812b64b920c1", "640937d10df7e053", "6d7c0eb420852d2e", "7072481935bd8844",
                  "8189e7dc78f582b0", "97004e1d8c454736", "9ea2483b344bb5c5", "bbdefa2950f49882", "c2cb0c90043578a6",
                  "ec0da28fd34b46c2", "f1db0895409c1a03"})
_WORD = re.compile(r"[a-z0-9]+")
_HYPHENATED = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)+")
_SLASHED = re.compile(r"([a-z0-9]+)/")


def _deny_words(s):
    """The forms of s compared with DENY: each word, each two words in a row, each two and three parts of a hyphenated
    name, and each word followed by a slash (a branch's prefix); lower-cased, digits as 0."""
    t = re.sub(r"\d+", "0", s.lower())
    words = _WORD.findall(t)
    out = set(words)
    out.update(f"{a} {b}" for a, b in zip(words, words[1:]))
    for h in _HYPHENATED.findall(t):
        parts = h.split("-")
        out.update("-".join(parts[i:i + k]) for k in (2, 3) for i in range(len(parts) - k + 1))
    out.update(m + "/" for m in _SLASHED.findall(t))
    return out


@functools.lru_cache(maxsize=1 << 15)
def _internal(s):
    """Whether a string names one of DENY's (a result repeats its short strings: each is worked out once)."""
    return any(hashlib.sha256(w.encode()).hexdigest()[:16] in DENY for w in _deny_words(s))


def _public(x):
    """x with every string that names one of DENY's left out (_internal): a dict's value becomes None, a list's item is
    dropped. The demos' build notes (which file of another of our apps a model came from, at which commit) are for the
    team, not the page."""
    if isinstance(x, dict):
        return {k: (None if isinstance(v, str) and _internal(v) else _public(v)) for k, v in x.items()}
    if isinstance(x, list):
        return [_public(v) for v in x if not (isinstance(v, str) and _internal(v))]
    return x


def _show_demos():
    """TEACHER_SHOW_DEMOS: 1 (the default) lists the Quest demos, 0 hides them (their links still open, for the team)."""
    return (os.environ.get("TEACHER_SHOW_DEMOS") or "1").strip() != "0"


def _demo_order():
    """The demo ids in demos.json's order (the gallery's order); [] when it cannot be read."""
    try:
        with open(os.path.join(HERE, "demos", "demos.json")) as f:
            return [d["id"] for d in json.load(f)["demos"]]
    except (OSError, ValueError, KeyError, TypeError):
        return []


def _demo_card(did, r):
    """One gallery card: the demo's words, its length, and how many notes, findings and strengths;
    audio: whether it comes with an audio file, audioKind: "recording" (the take's own) or "backing" (the song's
    audio from the app, not a recording of the take)."""
    demo = r.get("demo") if isinstance(r.get("demo"), dict) else {}
    stage = r.get("stage") if isinstance(r.get("stage"), dict) else {}
    summary = r.get("summary") if isinstance(r.get("summary"), dict) else {}
    stats = summary.get("stats") or r.get("stats")
    stats = stats if isinstance(stats, dict) else {}
    return dict(id=did, title=demo.get("title") or did, player=demo.get("player"), piece=demo.get("piece"), blurb=demo.get("blurb"),
                durationS=stage.get("durationS", stats.get("durationS")), notes=stats.get("notes", len(r.get("notes") or [])),
                findings=len(r.get("findings") or []), strengths=len(r.get("strengths") or []), caveat=demo.get("caveat"),
                audio=bool(stage.get("audio")), audioKind=(stage.get("audioKind") or "recording") if stage.get("audio") else None)


@app.get("/api/demos")
def demos():
    """The built demo takes (DEMOS_DIR/<id>/result.json), in demos.json's order, then any others by id; none with
    TEACHER_SHOW_DEMOS=0."""
    if not _show_demos():
        return []
    order = _demo_order()
    found = [x for x in (os.listdir(DEMOS) if os.path.isdir(DEMOS) else [])
             if DEMO_ID.fullmatch(x) and os.path.isfile(os.path.join(DEMOS, x, "result.json"))]
    out = []
    for did in sorted(found, key=lambda x: (order.index(x) if x in order else len(order), x)):
        try:
            out.append(_demo_card(did, _demo_result(did)))
        except HTTPException:                  # one that cannot be read is left out, not the whole gallery
            log.warning("demo %s: result.json could not be read", did)
    return out


@app.get("/api/demos/{did}/result")
def demo_result(did: str):
    return JSONResponse(_demo_result(did))


@app.get("/api/demos/{did}/plan")
def demo_plan(did: str):
    """A demo's practice plan: always the deterministic one (a Quest take's measurements go to no model from here)."""
    import practice_plan as PP
    res = _demo_result(did)
    if did not in PLANS:
        PLANS[did] = PP.fixed_plan(res) if not PP.V.not_judged(res) else PP.none_plan(res)
    return JSONResponse(_public_plan(PLANS[did]))


@app.get("/api/demos/{did}/media/{name}")
def demo_media(did: str, name: str):
    """hands.bin, hands-rot.bin (the joints' rotations, for the 3D ghost hands) or audio.mp3, with byte ranges."""
    if name not in DEMO_MEDIA:
        raise HTTPException(404, "no such file")
    p = os.path.join(_demo_dir(did), name)
    if not os.path.isfile(p):
        raise HTTPException(404, "no such file")
    return FileResponse(p, media_type=DEMO_MEDIA[name])


# ---------------------------------------------------------------- the sample lessons (public read-only content)
#
# Finished phone-video jobs of the team's own takes, copied in by make_sample.py with everything personal taken out
# (sample.json: id, title, player, piece, recorded, consent {public, hostedModels, adult, openWeights}, downloadable, order). Each opens
# as an upload's result does, with no token: the judges' first click. A hosted model answers questions about one only
# when its player agreed to that route; the plan is the one saved with it.

def _sample_ids():
    """The sample ids in SAMPLES_DIR that have their four files, by order then id; [] when there are none."""
    try:
        names = os.listdir(SAMPLES)
    except OSError:
        return []
    ok = [s for s in names if DEMO_ID.fullmatch(s)
          and all(os.path.isfile(os.path.join(SAMPLES, s, f)) for f in ("sample.json", "result.json", "video.mp4"))]
    meta = {s: _sample_meta(os.path.join(SAMPLES, s)) for s in ok}
    ok = [s for s in ok if meta[s]]
    return sorted(ok, key=lambda s: (meta[s]["order"] if isinstance(meta[s].get("order"), int) else 1000, s))


def _sample_meta(d):
    """sample.json, or None when it is unreadable or its player did not agree to showing it (consent.public)."""
    try:
        with open(os.path.join(d, "sample.json")) as f:
            s = json.load(f)
    except (OSError, ValueError):
        return None
    if not (isinstance(s, dict) and isinstance(s.get("consent"), dict) and s["consent"].get("public") is True
            and isinstance(s.get("title"), str) and s["title"].strip()):
        return None
    return s


def _sample_dir(sid):
    if not (isinstance(sid, str) and DEMO_ID.fullmatch(sid)):
        raise HTTPException(404, "no such sample")
    d = os.path.join(SAMPLES, sid)
    if not (all(os.path.isfile(os.path.join(d, f)) for f in ("sample.json", "result.json", "video.mp4")) and _sample_meta(d)):
        raise HTTPException(404, "no such sample")
    return d


def _sample_policy(s):
    """What may go to a hosted model about this sample: the route its player agreed to (consent.hostedModels, with
    their 18+), through OpenRouter only while OpenRouter passes it to Meta alone, the provider they agreed to, and to the
    open-weights host only while it is the route now and is the host they agreed to (consent.openWeights: the same host,
    model family, address for modal and custom, and OpenRouter providers; voice.open_consent_covers)."""
    import voice as V
    c = s.get("consent") or {}
    hm = c.get("hostedModels") if c.get("adult") is True and c.get("hostedModels") in SAMPLE_MODELS else "none"
    ow = c.get("openWeights") if hm == "open" else None
    return dict(dataOrigin="upload", hostedMuse=hm == "meta",
                openrouterMuse=hm == "openrouter" and V.openrouter_consent_covers(dict(muse=True, providers=["Meta"])),
                openWeightsMuse=bool(isinstance(ow, dict) and V.hosted_route() == "open"
                                     and V.open_consent_covers(dict(ow, muse=True))))


_SAMPLE_SHA = {}                    # a sample's video.mp4 -> ((size, mtime), its sha256)


def _sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while chunk := f.read(1 << 22):
            h.update(chunk)
    return h.hexdigest()


def _samples_of(up):
    """The samples whose video an upload is, byte for byte (what their download or their stream gives), as [(id, sample.json)];
    [] for any other video. Only an upload of a sample video's own size is hashed."""
    try:
        size = os.path.getsize(up)
    except OSError:
        return []
    out, digest = [], None
    for sid in _sample_ids():
        v = os.path.join(SAMPLES, sid, "video.mp4")
        try:
            st = os.stat(v)
        except OSError:
            continue
        if st.st_size != size:
            continue
        got = _SAMPLE_SHA.get(v)
        if not got or got[0] != (st.st_size, st.st_mtime):
            got = _SAMPLE_SHA[v] = ((st.st_size, st.st_mtime), _sha256_file(v))
        digest = digest or _sha256_file(up)
        if got[1] == digest:
            out.append((sid, _sample_meta(os.path.join(SAMPLES, sid))))
    return out


def _sample_consent(consent, samples):
    """The consent an upload of a sample's own video is recorded with (_create_job): the take is that sample's player's, so
    what they agreed to (sample.json consent, as _sample_policy reads it) bounds what the uploader's boxes may send. Its
    wording and questions go only by a route the player agreed to (each sample's, when the same video is more than one
    sample), and none of its frames leave this server: hosted SAM and the filming tip are never in a sample's agreement.
    The uploader's own 18+ and their spoken questions (their own voice) are kept."""
    pols = [_sample_policy(s or {}) for _, s in samples]
    m = consent.get("metaAtUpload") or {}
    return dict(consent, metaAtUpload=dict(m, sam=False, muse=bool(m.get("muse") and all(p["hostedMuse"] for p in pols))),
                replicateAtUpload=None, framingTipAtUpload=None,
                openrouterAtUpload=consent.get("openrouterAtUpload") if all(p["openrouterMuse"] for p in pols) else None,
                openWeightsAtUpload=consent.get("openWeightsAtUpload") if all(p["openWeightsMuse"] for p in pols) else None,
                voiceAtUpload=consent.get("voiceAtUpload") if all(_sample_voice_ok(s or {}) for _, s in samples) else None)


def _sample_voice_ok(s):
    """Whether a sample's player agreed that ElevenLabs may speak the teacher's words about it (sample.json consent.voice,
    make_sample --voice elevenlabs, with their 18+)."""
    c = s.get("consent") if isinstance(s.get("consent"), dict) else {}
    return c.get("adult") is True and c.get("voice") == "elevenlabs"


def _sample_info(sid, s):
    """The sample's own words for the page (result.sample, and its card); a value of the wrong type in a hand-edited
    sample.json counts as left out."""
    def text(k, n):
        v = s.get(k)
        return v.strip()[:n] if isinstance(v, str) else ""
    rec = s.get("recorded")
    return dict(id=sid, title=text("title", 120), player=text("player", 80) or "anonymous", piece=text("piece", 120) or None,
                recorded=rec if isinstance(rec, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", rec) else None,
                downloadable=s.get("downloadable") is True)


def _sample_result(sid):
    """A sample's result.json as the page opens an upload's: source upload on the video stage, the video at media/video.mp4,
    the policy its player agreed to, its plan (plan.json) when the result has none, and "sample" (its title and the rest)."""
    d = _sample_dir(sid)
    s = _sample_meta(d)
    try:
        with open(os.path.join(d, "result.json")) as f:
            r = json.load(f)
    except (OSError, ValueError):
        r = None
    if not (isinstance(r, dict) and (r.get("job") or {}).get("status") == "done"):
        raise HTTPException(500, "this sample could not be read; make it again with make_sample.py")
    r.pop("trace", None)
    _refresh_measures(r)                           # a sample made before the timing per hand and touch gets them
    r = _thin(_public(_strip_recorded(r)))         # public: what a judge code gets of a result, never more
    r["source"], r["stage"], r["policy"] = "upload", dict(kind="video"), _sample_policy(s)
    r["media"] = dict(r.get("media") if isinstance(r.get("media"), dict) else {}, video="media/video.mp4")
    r["media"].pop("videoKey", None)
    if not os.path.isfile(os.path.join(d, "voice.mp4")):
        r.pop("voicePack", None)                   # no voice.mp4 to play it from (a sample made without --voice elevenlabs)
    r["sample"] = _sample_info(sid, s)
    before = _sample_retake_of(sid, s)
    if before:                                     # the after of a pair: the page asks for /compare
        r["sample"]["retakeOf"] = r["retakeOf"] = before
    if not isinstance(r.get("plan"), dict):
        cached = _plan_file(d)
        if cached:
            r["plan"] = cached
    return r


def _sample_retake_of(sid, s):
    """The sample this one films again (sample.json retakeOf, which make_sample.py --retake-of checked: the same piece),
    while that sample is served and is a first take itself; else None. A pair is a first take and a re-take of it: a
    before that names a before of its own (a chain, or two samples naming each other) is no before, so every sample is
    still listed, alone or in one pair, and none compares with a take that is itself a re-take."""
    b = _named_before(sid, s)
    return b if b and not _named_before(b, _sample_meta(os.path.join(SAMPLES, b))) else None


def _named_before(sid, s):
    """The served sample sid's sample.json s names as its before (retakeOf), or None."""
    b = s.get("retakeOf") if isinstance(s, dict) else None
    return b if isinstance(b, str) and b != sid and DEMO_ID.fullmatch(b) and b in _sample_ids() else None


def _sample_compare(sid):
    """(the comparison of a sample pair's after with its before, the before's policy); 404 for a sample that is no pair's after."""
    import compare as C
    before = _sample_retake_of(sid, _sample_meta(_sample_dir(sid)))
    if not before:
        raise HTTPException(404, "this sample is not a re-take of another")
    block = C.compare(_sample_result(before), _sample_result(sid))
    block["before"].update(kind="sample", id=before)
    block["after"].update(kind="sample", id=sid)
    return block, _sample_policy(_sample_meta(_sample_dir(before)))


def _sample_card(sid, r):
    """One sample on the home page: durationS and sizeBytes are the original file's as it was saved (sample.json take,
    make_sample.py: the card says "46.8 MB, 0:26 long, as the glasses saved it"), analysedS the video's that opens
    (job.video.durationS: the part analysed, which is what video.mp4 holds; durationS too for a sample made before take
    was recorded), never the span the notes were played in."""
    stats = (r.get("summary") or {}).get("stats") if isinstance(r.get("summary"), dict) else None
    stats = stats if isinstance(stats, dict) else {}
    v = (r.get("job") or {}).get("video") or {}
    v = v if isinstance(v, dict) else {}
    lp = (r.get("lesson") or {}).get("piece") if isinstance(r.get("lesson"), dict) else None
    thumb = os.path.isfile(os.path.join(SAMPLES, sid, "thumb.jpg"))
    take = (_sample_meta(os.path.join(SAMPLES, sid)) or {}).get("take")
    take = take if isinstance(take, dict) else {}
    analysed = v.get("durationS") or stats.get("durationS")
    return dict(r["sample"], durationS=take.get("durationS") if _num(take.get("durationS")) else analysed, analysedS=analysed,
                notes=stats.get("notes", len(r.get("notes") or [])),
                findings=len(r.get("findings") or []), strengths=len(r.get("strengths") or []),
                # the library piece its lesson teaches, and a still of its video (make_sample.py), for the page's example take
                pieceId=lp.get("id") if isinstance(lp, dict) else None,
                thumbnail=f"/api/samples/{sid}/media/thumb.jpg" if thumb else None,
                # the original file as it was saved (sample.json take, make_sample.py): the card's "46.8 MB, 0:26 long"
                sizeBytes=take.get("sizeBytes") if isinstance(take.get("sizeBytes"), int) else None)


@app.get("/api/samples")
def samples():
    """The sample lessons (SAMPLES_DIR/<id>/), by sample.json's order then id; [] when there are none. A pair (a sample that
    films part of another again: retakeOf) is one card, the after's, with the before's own in "before"."""
    cards = {}
    for sid in _sample_ids():
        try:
            cards[sid] = _sample_card(sid, _sample_result(sid))
        except Exception:                      # one that cannot be read is left out, not the whole list
            log.warning("sample %s could not be read", sid)
    befores = {c.get("retakeOf") for c in cards.values() if c.get("retakeOf") in cards}
    out = []
    for sid, c in cards.items():
        if sid in befores:
            continue
        b = cards.get(c.get("retakeOf"))
        if b:
            c = dict(c, before={k: b.get(k) for k in ("id", "title", "recorded", "durationS", "notes", "findings")})
        out.append(c)
    # one is the default (the page's example take, POST /api/jobs sample=<id>): the first whose sample.json says
    # "default": true (make_sample.py --default), else the first listed
    first = next((c for c in out if (_sample_meta(os.path.join(SAMPLES, c["id"])) or {}).get("default") is True), out[0] if out else None)
    return [dict(c, default=c is first) for c in out]


SAMPLE_GHOST_LOCK = threading.Lock()


def _sample_view(sid, r):
    """A sample's view with its own cuts (made the first time it is opened, or again when its result changed, into
    DATA/sample-ghosts/<id>/, counted against the same per-piece cap as every job's: ghost_guard.build) and its links;
    the view the job had is built again when the sample's result has none. None when there is no view."""
    import ghost_guard as GG
    view = _view_of(r)
    if view is None and isinstance(r.get("lesson"), dict) and _with_view(r):
        view = _view_of(r)
    if view is None:
        return None
    _refresh_view(r)
    folder = os.path.join(DATA, SAMPLE_GHOSTS, sid)
    made = os.path.join(_sample_dir(sid), "result.json")
    with SAMPLE_GHOST_LOCK:
        idx = GG.read_index(folder)
        try:
            stale = idx is None or os.path.getmtime(os.path.join(folder, GG.INDEX_FILE)) < os.path.getmtime(made)
        except OSError:
            stale = True
        if stale:
            idx = _with_ghosts(r, "sample", sid, folder) or {}
    for f in view.get("fixes") or []:              # the sample's own cuts, never the job's it was made from
        if isinstance(f, dict):
            f["ghost"] = (idx or {}).get(str(f.get("n"))) or dict(fallback="3d", reason="none")
    GG.attach(view, DATA, "sample", sid, f"/api/samples/{sid}/ghost", index=idx or {})
    _tile_links(view, f"/api/samples/{sid}/score")
    return view


@app.get("/api/samples/{sid}/result")
def sample_result(sid: str):
    r = _sample_result(sid)
    _sample_view(sid, r)
    if r.get("retakeOf"):
        r = _retake_view(r, _once(lambda: _sample_compare(sid)))
    after = next((x for x in _sample_ids() if x != sid and _sample_retake_of(x, _sample_meta(_sample_dir(x))) == sid), None)
    if after:                                      # the before of a pair: the page links its after
        r["sample"]["retakenBy"] = after
    return JSONResponse(r)


@app.get("/api/samples/{sid}/compare")
def sample_compare(sid: str):
    """A sample pair's after against its before (compare.py's block), with no token; 404 for a sample that is no pair's after."""
    return JSONResponse(_sample_compare(sid)[0])


@app.get("/api/samples/{sid}/plan")
def sample_plan(sid: str):
    """A sample's practice plan: the one saved with it (make_sample.py keeps the job's, or makes the deterministic one),
    else the deterministic one, made here once. Never a model call: a public page must not spend on every view."""
    import practice_plan as PP
    r = _sample_result(sid)
    if isinstance(r.get("plan"), dict):
        plan = r["plan"]
    else:
        k = (sid, os.path.getmtime(os.path.join(_sample_dir(sid), "result.json")))
        if k not in SAMPLE_PLANS:
            SAMPLE_PLANS[k] = PP.make(r, model=False)
        plan = SAMPLE_PLANS[k]
    if r.get("retakeOf"):
        plan = _with_progress(plan, lambda: _sample_compare(sid))
    return JSONResponse(_public_plan(plan))


@app.get("/api/samples/{sid}/ghost/{n}")
def sample_ghost(sid: str, n: int, exp: str = "", sig: str = ""):
    """A sample's cut n, as a job's (job_ghost): the signed link its result gave is the only way in."""
    if not (isinstance(sid, str) and DEMO_ID.fullmatch(sid)):
        raise HTTPException(404, "no such sample")
    return _ghost_response("sample", sid, os.path.join(DATA, SAMPLE_GHOSTS, sid), n, exp, sig)


@app.get("/api/samples/{sid}/score/{tile}")
def sample_score(sid: str, tile: str):
    """A score tile of the sample's own window, with no token as the sample is."""
    r = _sample_result(sid)
    if _view_of(r) is None:
        _with_view(r)
    return _tile_response(_view_of(r), tile)


@app.get("/api/samples/{sid}/media/video.mp4")
def sample_video(sid: str):
    """The sample's video, streamed with byte ranges (FileResponse answers Range requests)."""
    return FileResponse(os.path.join(_sample_dir(sid), "video.mp4"), media_type="video/mp4")


@app.get("/api/samples/{sid}/media/thumb.jpg")
def sample_thumb(sid: str):
    """A still of the sample's video (make_sample.py's thumb.jpg), for its card; 404 for a sample made without one."""
    p = os.path.join(_sample_dir(sid), "thumb.jpg")
    if not os.path.isfile(p):
        raise HTTPException(404, "this sample has no still")
    return FileResponse(p, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=600"})


@app.get("/api/samples/{sid}/media/voice.mp4")
def sample_voice(sid: str):
    """The sample's voice pack (make_sample.py copies the job's work/voice.mp4 with --voice elevenlabs: its player agreed
    ElevenLabs speaks the teacher's words about it), as a job's is served; 404 for a sample without one."""
    p = os.path.join(_sample_dir(sid), "voice.mp4")
    if not os.path.isfile(p):
        raise HTTPException(404, "this sample has no voice pack")
    return FileResponse(p, media_type="audio/mp4")


@app.get("/api/samples/{sid}/download")
def sample_download(sid: str):
    """The sample's video as a file to keep (the part analysed, as video.mp4 holds it: to upload it again), only when its player
    allowed it (sample.json downloadable); 404 otherwise."""
    d = _sample_dir(sid)
    if _sample_meta(d).get("downloadable") is not True:
        raise HTTPException(404, "this sample's video is not offered for download")
    return FileResponse(os.path.join(d, "video.mp4"), media_type="video/mp4", filename=f"museverse-sample-{sid}.mp4")


# ---------------------------------------------------------------- spoken questions

def _consent_path(cid):
    return os.path.join(DATA, "consents", cid + ".json")


def _consent(cid):
    """The voice consent record for cid; None when there is none, it did not agree to both, or it is
    older than TEACHER_KEEP_DAYS (the sweep deletes it within the hour)."""
    if not _is_id(cid):
        return None
    try:
        with open(_consent_path(cid)) as f:
            c = json.load(f)
    except (OSError, ValueError):
        return None
    if not (isinstance(c, dict) and c.get("adult") is True and c.get("voice") is True and isinstance(c.get("created"), (int, float))):
        return None
    return c if time.time() - c["created"] <= _keep_days() * 86400 else None


@app.post("/api/voice/consent")
async def voice_consent(request: Request):
    """{"adult": true, "voice": true}: the person at this browser confirmed 18+ and agreed that their
    voice goes to Meta's speech-to-text -> {"consentId"} (32 hex). Kept as DATA/consents/<id>.json with
    the time and the consent text's version; deleted after TEACHER_KEEP_DAYS, as the jobs are."""
    _need_chat()
    _auth(request)
    body = await _json_object(request, MAX_ASK, "that request is too long", 'please send JSON: {"adult": true, "voice": true}')
    if body.get("adult") is not True or body.get("voice") is not True:
        raise HTTPException(400, "please confirm you are 18 or older and agree that your voice goes to Meta's speech-to-text")
    who, now = _client(request), time.monotonic()
    with LOCK:                                 # one client cannot mint consents to get round CONSENT_SOCKETS
        made = _recent(CONSENT_MADE, who, CONSENT_WINDOW_S, now)
        if len(made) >= CONSENTS_PER_CLIENT:
            raise HTTPException(429, "too many voice agreements from this browser; please try again later")
        CONSENT_MADE[who] = made + [now]
    cid = uuid.uuid4().hex
    os.makedirs(os.path.join(DATA, "consents"), exist_ok=True)
    tmp = _consent_path(cid) + ".tmp"
    with open(tmp, "w") as f:
        json.dump(dict(id=cid, created=time.time(), version=VOICE_CONSENT_VERSION, adult=True, voice=True), f)
    os.replace(tmp, _consent_path(cid))
    return dict(consentId=cid)


def _stt_take(kind, tid):
    """The take a spoken question is about, as the conversation opens it (its policy filled in by this server), or None
    (no such take, not finished, or not one of the three kinds). Only behind the token: the voice routes take nothing else."""
    try:
        if kind == "job":
            return _job_take(tid)[0]
        if kind == "demo":
            return _demo_result(tid)
        if kind == "sample":
            return _sample_result(tid)
    except HTTPException:
        return None
    return None


def _stt_keywords(kind=None, tid=None, live=True):
    """The keywords for a spoken question about one take (meta_api.stt_keywords): its own words (voice.stt_terms: the piece,
    the findings' titles, their notes and bars, the hands) and the standing list, but only for a take whose analysis may go
    to Meta's API (voice.hosted_allowed with route "meta": its player's consent at upload, a sample's player's, a demo only
    with MUSE_QUEST_DATA_OK=1; the voice consent confirmed 18+), never for one with a fingering finding or strength (as
    voice._backend keeps it off every hosted route), and only with MUSE_STT_KEYWORDS on. Otherwise what was sent
    before: the standing list live (live=True), nothing with a recording (None)."""
    import meta_api
    import voice as V
    plain = list(meta_api.ASR_KEYWORDS) if live else None
    if not (kind and isinstance(tid, str) and meta_api.take_keywords_on()):
        return plain
    res = _stt_take(kind, tid)
    # a take with a fingering finding or strength never goes to a hosted route, its words included (voice._backend)
    if not res or not V.hosted_allowed(res, adult=True, route="meta") or V._fingering_content(res):
        return plain
    return meta_api.stt_keywords(V.stt_terms(res)) or plain


def _stt_target(t):
    """(kind, id) of a {"kind", "id"} the page names a spoken question's take with, else (None, None)."""
    if isinstance(t, dict) and t.get("kind") in ("job", "demo", "sample") and isinstance(t.get("id"), str) and len(t["id"]) <= 64:
        return t["kind"], t["id"]
    return None, None


@app.post("/api/voice/ticket")
async def voice_ticket(request: Request):
    """{"consentId", "target" (optional: {"kind": "job" | "demo" | "sample", "id"}, the take the conversation is about)} ->
    {"ticket", "expiresS"}: opens WS /api/voice/ws once, within a minute. A browser cannot send the bearer header on a
    WebSocket, so the token is checked here instead. The target's words bias its spoken turns (_stt_keywords)."""
    _need_chat()
    _auth(request)
    body = await _json_object(request, MAX_ASK, "that request is too long", 'please send JSON: {"consentId": "..."}')
    cid = body.get("consentId")
    if not _consent(cid):
        raise HTTPException(403, "please agree to sending your voice to Meta's speech-to-text first")
    keywords = await run_in_threadpool(_stt_keywords, *_stt_target(body.get("target")))
    now = time.monotonic()
    with LOCK:
        for t in [t for t, (_, exp) in TICKETS.items() if exp <= now]:
            del TICKETS[t]
        if len(TICKETS) >= MAX_TICKETS:
            raise HTTPException(429, "too many voice conversations are starting at once; please try again in a minute")
        if sum(c == cid for c, _ in TICKETS.values()) >= CONSENT_TICKETS:    # one consent cannot take them all
            raise HTTPException(429, "too many voice links are waiting to be used; please try again in a minute")
        ticket = secrets.token_hex(16)
        TICKETS[ticket] = (cid, now + TICKET_S)
        for t in [t for t in TICKET_KEYWORDS if t not in TICKETS]:
            del TICKET_KEYWORDS[t]
        TICKET_KEYWORDS[ticket] = keywords
    return dict(ticket=ticket, expiresS=TICKET_S)


def _take_ticket(ticket):
    """The consent id a ticket was issued for, using the ticket up; None when it is unknown, used or expired."""
    if not _is_id(ticket):
        return None
    with LOCK:
        got = TICKETS.pop(ticket, None)
    return got[0] if got and got[1] > time.monotonic() else None


def _ticket_keywords(ticket):
    """The keywords a ticket was issued with (used up with it); the standing list for one issued before them."""
    import meta_api
    with LOCK:
        kw = TICKET_KEYWORDS.pop(ticket, None) if isinstance(ticket, str) else None
    return kw if kw is not None else list(meta_api.ASR_KEYWORDS)


def _stt_failed(e):
    """What the page is told when Meta's speech-to-text failed: the kind, the HTTP status or close code,
    and the session id to quote to Meta's support (never Meta's own words, never the key)."""
    kind = getattr(e, "type", None) or type(e).__name__
    status, close, sid = getattr(e, "status", None), getattr(e, "close_code", None), getattr(e, "session_id", None)
    return (f"speech-to-text failed ({kind}{', HTTP ' + str(status) if status else ''}{', close ' + str(close) if close else ''}"
            f"{', session ' + sid if sid else ''})")


@app.websocket("/api/voice/ws")
async def voice_ws(ws: WebSocket, ticket: str = ""):
    """The live voice relay: the page's microphone to Muse Voice Transcribe, one Meta realtime session
    per spoken turn (meta_api.asr_realtime, PUSH_TO_TALK). The page sends {"type": "start",
    "sampleRate": 24000}, binary frames of s16le mono PCM (about 80 ms each, in real time; frames sent
    before "ready" wait, they are not lost), then {"type": "end"}. It gets {"type": "ready"} when Meta
    has opened the session, {"type": "partial", "text"} as the words arrive (each replaces the last),
    {"type": "final", "text"}, or {"type": "error", "code", "message"}; then it may start the next turn
    on the same socket. Codes: ticket (unknown, used or expired), no-stt (no MODEL_API_KEY), consent
    (the voice consent is gone), all three closing the socket (1008); bad-request, busy (too many
    sessions here, or Meta's rate limit), stt (Meta's speech-to-text failed), timeout (idle for two
    minutes, or open for half an hour; closes it too). A turn ends by itself after a minute of audio,
    or VOICE_TURN_GRACE_S later by the clock (a page trickling a few bytes would otherwise keep Meta's
    session, and one of the VOICE_SESSIONS, for the whole conversation)."""
    await ws.accept()
    lock = asyncio.Lock()

    async def send(msg):
        async with lock:
            try:
                await ws.send_text(json.dumps(msg))
            except Exception:                  # the page has gone; the receive loop sees the disconnect
                pass

    async def refuse(code, message):
        await send(dict(type="error", code=code, message=message))
        try:
            await ws.close(1008)
        except Exception:
            pass

    if not _chat_on():                           # TEACHER_CHAT=off: no spoken questions at all
        return await refuse("off", "this server takes no spoken questions")
    keywords = _ticket_keywords(ticket)
    cid = _take_ticket(ticket)
    if not cid:
        return await refuse("ticket", "this voice link has expired or was already used; please try again")
    if not _stt_key():                           # no key, or one Meta refused: nothing is sent with it
        return await refuse("no-stt", "no speech-to-text is configured on this server")
    if not _consent(cid):
        return await refuse("consent", "please agree to sending your voice to Meta's speech-to-text first")
    with LOCK:
        busy = SOCKETS.get(cid, 0) >= CONSENT_SOCKETS
        if not busy:
            SOCKETS[cid] = SOCKETS.get(cid, 0) + 1
    if busy:
        return await refuse("busy", "a voice conversation is already open in another tab; close it, then try again")
    try:
        await _voice_conversation(ws, cid, send, refuse, keywords)
    finally:
        with LOCK:
            SOCKETS[cid] -= 1
            if not SOCKETS[cid]:
                del SOCKETS[cid]


async def _voice_conversation(ws, cid, send, refuse, keywords=None):
    """voice_ws once the ticket, the key and the consent are checked: the turns until the page leaves, each biased with
    the ticket's keywords (the standing list when None)."""
    import meta_api
    turn, running = None, set()            # the open turn; every turn's task still running

    def end(t):
        if not t["ended"]:
            t["ended"] = True
            t["queue"].put_nowait(None)

    async def run_turn(t):
        """One spoken turn. It is over for the page ("over": the next start may come) as soon as its
        final or error is sent, though Meta's session may take a moment more to close."""
        async def frames():
            while (b := await t["queue"].get()) is not None:
                yield b

        async def on_event(ev):
            if ev.get("type") == "ready":
                await send(dict(type="ready"))
            elif ev.get("type") == "transcript" and isinstance(ev.get("transcript"), str) and not t["over"]:
                final = ev.get("final") is True
                t["over"] = final
                await send(dict(type="final" if final else "partial", text=ev["transcript"].strip()))
        try:
            text = await meta_api.asr_realtime(frames(), on_event, sample_rate=t["rate"],
                                               keywords=keywords if keywords is not None else meta_api.ASR_KEYWORDS)
            if not t["over"]:                  # Meta closed normally without a final: its last partial
                t["over"] = True
                await send(dict(type="final", text=text))
        except meta_api.MetaAPIError as e:
            t["over"] = True
            await send(dict(type="error", code="busy" if e.type == "rate_limited" else "stt", message=_stt_failed(e)))
        except Exception as e:                 # not Meta's: say so rather than leave the page waiting
            log.exception("voice relay")
            t["over"] = True
            await send(dict(type="error", code="stt", message=_stt_failed(e)))
        finally:
            t["ended"] = t["over"] = True
            t["timer"].cancel()

    def _turn_done(task):
        running.discard(task)
        with LOCK:
            VOICE["open"] -= 1

    loop = asyncio.get_running_loop()
    until = loop.time() + VOICE_MAX_S
    try:
        while True:
            try:
                left = min(VOICE_IDLE_S, until - loop.time())
                if left <= 0:
                    raise TimeoutError
                msg = await asyncio.wait_for(ws.receive(), left)
            except TimeoutError:
                await send(dict(type="error", code="timeout", message="this conversation was idle too long or ran for half an hour; "
                                                                      "please start again"))
                break
            except RuntimeError:                  # the socket is no longer connected (a send to the page failed)
                break
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:      # audio: for the open turn, else dropped (the tail after "end")
                data = msg["bytes"]
                if not turn or turn["ended"]:
                    continue
                if len(data) > VOICE_FRAME:
                    await send(dict(type="error", code="bad-request", message="each audio frame must be under a second long"))
                    continue
                turn["bytes"] += len(data)
                turn["queue"].put_nowait(data)
                if turn["bytes"] >= VOICE_TURN_S * turn["rate"] * 2:
                    end(turn)                      # a minute of audio: the turn ends by itself
                continue
            try:
                m = json.loads(msg.get("text") or "")
            except ValueError:
                m = None
            kind = m.get("type") if isinstance(m, dict) else None
            if kind == "start":
                rate = m.get("sampleRate", meta_api.ASR_RATE)
                if turn and not turn["over"]:
                    await send(dict(type="error", code="bad-request", message="a turn is already open; send end first"))
                elif isinstance(rate, bool) or rate not in meta_api.ASR_ENCODING:
                    await send(dict(type="error", code="bad-request", message="sampleRate must be 24000 or 16000"))
                elif not _consent(cid):            # it can lapse during a long conversation
                    return await refuse("consent", "please agree to sending your voice to Meta's speech-to-text again")
                else:
                    with LOCK:
                        free = VOICE["open"] < VOICE_SESSIONS
                        if free:
                            VOICE["open"] += 1
                    if not free:
                        await send(dict(type="error", code="busy", message="too many people are talking to the teacher; please try again soon"))
                        continue
                    turn = dict(queue=asyncio.Queue(), ended=False, over=False, bytes=0, rate=int(rate))
                    turn["timer"] = loop.call_later(VOICE_TURN_S + VOICE_TURN_GRACE_S, end, turn)   # the clock's cap
                    task = asyncio.create_task(run_turn(turn))
                    running.add(task)
                    task.add_done_callback(_turn_done)       # also for a task cancelled before it ever ran
            elif kind == "end":
                if turn:
                    end(turn)
            else:
                await send(dict(type="error", code="bad-request", message='send {"type": "start"}, audio frames, then {"type": "end"}'))
    finally:
        if turn:                               # a turn cancelled before it ran never reached its own finally
            turn["timer"].cancel()
        for task in list(running):             # the page went away mid-turn: close Meta's session too
            task.cancel()
        await asyncio.gather(*running, return_exceptions=True)
        try:
            await ws.close()
        except Exception:
            pass


async def _transcribe(request, keywords=None):
    """A recorded spoken question in the request body -> {"text", "source"}, through Muse Voice Transcribe, biased with
    keywords (None: none, as before the take's words were sent)."""
    import meta_api
    _length(request, MAX_STT, "that recording is too long")
    audio = bytearray()
    async for chunk in request.stream():
        audio += chunk
        if len(audio) > MAX_STT:
            raise HTTPException(413, "that recording is too long")
    try:                                        # ffmpeg and Meta's API: off the event loop
        # keywords only when there are some: the call is then exactly what it was before the take's words were sent
        text = await run_in_threadpool(meta_api.transcribe_speech, bytes(audio), request.headers.get("content-type", "audio/webm"),
                                       **({"keywords": keywords} if keywords else {}))
    except ValueError as e:                     # audio the player can fix: unreadable, too long
        raise HTTPException(400, str(e)[:200])
    except Exception as e:
        status = getattr(e, "status", None)
        sid = getattr(e, "session_id", None)
        raise HTTPException(502, f"speech-to-text failed ({type(e).__name__}{', HTTP ' + str(status) if status else ''}{', session ' + sid if sid else ''})")
    return dict(text=text, source="muse-voice-transcribe")


@app.post("/api/voice/stt")
async def voice_stt(request: Request, consent: str = "", kind: str = "", id: str = ""):
    """A recorded spoken question (the page's fallback when the live relay cannot be used) -> {"text",
    "source"}: the job route below, tied to a voice consent (?consent=<id>) instead of a job; &kind=&id= name the take it
    is about, whose words bias it (_stt_keywords)."""
    _need_chat()
    _auth(request)
    if not _stt_key():
        return JSONResponse(dict(error="no speech-to-text configured"), status_code=501)
    if not _consent(consent):
        return JSONResponse(dict(error="please agree to sending your voice to Meta's speech-to-text first"), status_code=403)
    keywords = await run_in_threadpool(_stt_keywords, *_stt_target(dict(kind=kind, id=id)), False)
    return await _transcribe(request, keywords)


def _stt_ok(d):
    """Whether this job's spoken questions may go to Muse Voice Transcribe: only when the player was
    told so at upload and confirmed 18+, as for Muse wording (_muse_ok)."""
    c = _job_file(d).get("consent") or {}
    return bool(c.get("adult") and (c.get("metaAtUpload") or {}).get("stt"))


@app.post("/api/jobs/{jid}/stt")
async def stt(jid: str, request: Request):
    _need_chat()
    _auth(request)
    d = _job_dir(jid)
    if not _stt_key():
        return JSONResponse(dict(error="no speech-to-text configured"), status_code=501)
    if not _stt_ok(d):                          # the page falls back to typing or the browser's own
        return JSONResponse(dict(error="this upload did not agree to sending speech to Meta"), status_code=403)
    return await _transcribe(request, await run_in_threadpool(_stt_keywords, "job", jid, False))


def _attempts(d):
    """How many times the worker has started this job (see _requeue)."""
    try:
        with open(os.path.join(d, "attempts")) as f:
            return int(f.read())
    except (OSError, ValueError):
        return 0


class JobTimedOut(Exception):
    """Raised into a job's own progress callback once its time limit has passed: the pipeline stops at its next report."""


def _write_failed(d, jid, error, steps):
    """result.json as a failed job's (the page's words and the steps so far), written whole (a temporary file renamed
    over it), since the pipeline's own thread may write it at the same moment."""
    out = dict(job=dict(id=jid, status="failed", error=error), pipeline=dict(steps=steps or []))
    tmp = os.path.join(d, f"result.json.{threading.get_ident()}.tmp")
    with open(tmp, "w") as f:
        json.dump(out, f)
    os.replace(tmp, os.path.join(d, "result.json"))


def _stopped_steps(steps, why):
    """The steps as they stood, the one running (and the lesson being composed) marked failed with why."""
    return [dict(s, state="failed", note=why[:200]) if isinstance(s, dict) and s.get("state") == "running" else s
            for s in steps or []]


def _refused_steps(steps, code):
    """The steps of a refused take: as the pipeline left them (the step that refused it "refused", those after "skipped",
    each noting "refused: <code>"), the lesson's own step skipped likewise, since no lesson is composed."""
    return [dict(s, state="skipped", note=f"refused: {code}") if isinstance(s, dict) and s.get("id") == LESSON_STEP["id"] else s
            for s in steps or []]


def _run_limited(d, jid, up, ref, fps, cb, limit_s):
    """pipeline.safe_run, then _after_pipeline (the view, the cuts, Muse's voice), in a thread of its own for at most
    limit_s seconds -> None when it finished in time (its own
    exception raised again here), else _timed_out_words. Past the limit the job is failed at once (its status here, its
    result.json on disk) and the worker goes on to the next take; the pipeline's thread is stopped through its progress
    callback (JobTimedOut at its next report), and should it still finish, its result is replaced by the failed one, so a
    take never turns "done" after the page was told it stopped. cb(**k) is called with LOCK held (it must not take it):
    the check that the limit has not passed and the update are one step, so a report the pipeline made just as the limit
    passed can never set the job back to running after it was failed."""
    import pipeline
    over = threading.Event()
    words = _timed_out_words(limit_s)
    out = {}

    def report(**k):
        with LOCK:
            late = over.is_set() or (JOBS.get(jid) or {}).get("status") == "failed"
            if not late:
                cb(**k)
        if late:
            raise JobTimedOut(words)

    def stopped():
        with LOCK:
            steps = _stopped_steps((JOBS.get(jid) or {}).get("steps"), "stopped at the time limit")
        _write_failed(d, jid, words, [s for s in steps if s.get("id") != LESSON_STEP["id"]])

    def run():
        try:
            pipeline.safe_run(d, up, ref, fps, progress=report)
            _after_pipeline(d, jid, report)    # the view, the cuts and Muse's voice, inside the same time limit
        except BaseException as e:             # (JobTimedOut included: the pipeline wrote its own failed result first)
            out["error"] = e
        finally:
            if over.is_set():
                stopped()

    t = threading.Thread(target=run, name=f"job-{jid[:8]}", daemon=True)
    t.start()
    t.join(limit_s)
    if not t.is_alive():
        if "error" in out:
            raise out["error"]
        return None
    with LOCK:                                 # (report holds it while it checks and updates)
        over.set()
    stopped()
    log.warning("job %s stopped at its time limit (%.0f s)", jid, limit_s)
    return words


def _worker():
    while True:
        _, _, (jid, up, ref, fps) = QUEUE.get()
        d = os.path.join(DATA, jid)
        with LOCK:
            if jid in WAITING:
                WAITING.remove(jid)
            RUNNING.update(id=jid, t0=time.time())
            analysed = (JOB_INFO.get(jid) or {}).get("analysedS")
        limit = _job_max_s(analysed)           # (outside LOCK: the rates it reads take it themselves)

        def cb(**k):                           # (called with LOCK held: _run_limited's report)
            JOBS[jid].update(status="running", **{x: k[x] for x in ("step", "progress", "steps", "etaS") if x in k})
            if "steps" in k:                   # the lesson's own step after the pipeline's (_with_lesson)
                st = _with_lesson(k["steps"], k.get("progress"))
                JOBS[jid]["steps"] = st
                if st and st[-1].get("id") == LESSON_STEP["id"] and st[-1].get("state") == "running":
                    JOBS[jid].update(step=LESSON_STEP["label"], etaS=None)
            # the hands step is at work: SAM 3.1 is loading or loaded (or the Replicate model awake) for the takes after
            if any(isinstance(s, dict) and s.get("id") == "hands" and s.get("state") == "running" for s in k.get("steps") or []):
                WARM["at"] = time.time()
        import pipeline
        # a take that cannot give a lesson (pov/refuse.py): told so in its own words, not as a failure. By name, so a
        # pipeline without refusals still runs here (an except of () catches nothing)
        refused = getattr(pipeline, "TakeRefused", ())
        try:
            n = _attempts(d) + 1
            with open(os.path.join(d, "attempts"), "w") as f:
                f.write(str(n))
            stopped = _run_limited(d, jid, up, ref, fps, cb, limit)
            with LOCK:
                if stopped:
                    JOBS[jid].update(status="failed", error=stopped, step=None, etaS=None,
                                     steps=_stopped_steps(JOBS[jid].get("steps"), "stopped at the time limit"))
                else:
                    JOBS[jid].update(status="done", progress=1.0, step=None, etaS=None,
                                     steps=_with_lesson(JOBS[jid].get("steps"), 1.0, done=True))
        except refused as e:
            why = _refusal_of(dict(code=getattr(e, "code", None), message=getattr(e, "message", None) or str(e))) \
                or dict(code="refused", message=str(e)[:600])
            with LOCK:
                JOBS[jid].update(status="refused", refusal=why, error=why["message"], step=None, etaS=None,
                                 steps=_refused_steps(JOBS[jid].get("steps"), why["code"]))
        except Exception as e:
            log.warning("job %s failed: %s: %s", jid, type(e).__name__, str(e)[:2000])
            with LOCK:
                JOBS[jid].update(status="failed", error=f"{type(e).__name__}: {e}"[:400], etaS=None)
        finally:
            with LOCK:
                RUNNING.update(id=None, t0=None)
                JOB_INFO.pop(jid, None)
                # SAM 3.1 is loaded (or its host awake) once a take reached it: no start-up allowance for the next
                if any(isinstance(s, dict) and s.get("id") == "hands" and s.get("state") in ("running", "done", "failed")
                       for s in JOBS[jid].get("steps") or []):
                    WARM["at"] = time.time()
            try:
                _measure(d)                    # the wait the next player is told comes from this take's own times
            except Exception:
                log.exception("timing job %s", jid)
            QUEUE.task_done()


def _requeue():
    """Queue again, oldest first, the jobs a restart interrupted: the upload and job.json are still
    here and every step is safe to run twice. A job already started twice stays failed, so a take
    that brings the server down cannot do it on every restart; one from before consent was recorded,
    or past TEACHER_KEEP_DAYS, is left alone too."""
    keep = _keep_days() * 86400
    found = []
    for jid in os.listdir(DATA) if os.path.isdir(DATA) else []:
        d = os.path.join(DATA, jid)
        job = _job_file(d)
        ups = sorted(glob.glob(os.path.join(d, "upload.*")))
        created = job.get("created")
        if (len(jid) != 32 or not all(c in "0123456789abcdef" for c in jid) or not job.get("consent") or not ups
                or not isinstance(created, (int, float)) or time.time() - created > keep
                or os.path.exists(os.path.join(d, "result.json")) or _attempts(d) >= 2):
            continue
        ref = os.path.join(d, "reference.mid")
        found.append((created, jid, ups[0], ref if os.path.exists(ref) else None, job.get("name"), job.get("codeId"), job.get("analysedS")))
    for _, jid, up, ref, name, code, an in sorted(found, key=lambda x: x[0]):
        _enqueue(jid, up, ref, name, code, an)
    return len(found)


def _sweep(keep_s, now=None):
    """Delete every job folder older than keep_s seconds: by its job.json or, for an upload that
    failed before job.json was written, by the folder itself; and every voice consent older than
    that. Nothing else in DATA is touched: the demos are built into web/data/demos, which is inside
    the default DATA."""
    now = now or time.time()
    for jid in os.listdir(DATA) if os.path.isdir(DATA) else []:
        if not _is_id(jid):
            continue
        d = os.path.join(DATA, jid)
        jp = os.path.join(d, "job.json")
        try:
            if now - os.path.getmtime(jp if os.path.exists(jp) else d) > keep_s:
                shutil.rmtree(d, ignore_errors=True)
                with LOCK:
                    JOBS.pop(jid, None)
        except OSError:
            pass
    cdir = os.path.join(DATA, "consents")
    for name in os.listdir(cdir) if os.path.isdir(cdir) else []:
        p = os.path.join(cdir, name)
        try:
            if now - os.path.getmtime(p) > keep_s:
                os.remove(p)
        except OSError:
            pass


def _open_config_note(mode, route):
    """The open-weights part of _muse_config_note: SystemExit for TEACHER_MUSE=open whose settings cannot work, and for
    "on" when the open-weights host would be the route (nothing else is set up) but cannot work; a line otherwise when
    OPEN_WEIGHTS_HOST is set (used, or not, and why). None when it is not set."""
    import open_api as OW
    import voice as V
    set_ = bool(OW.host())
    if mode == "open" and not set_:
        raise SystemExit("TEACHER_MUSE=open: OPEN_WEIGHTS_HOST is not set (baseten, fireworks, modal, openrouter or custom)")
    if not set_:
        return None
    problem = OW.problem()
    if mode == "open" or (mode == "on" and route not in ("meta", "openrouter")):
        if problem:
            raise SystemExit(f"{'TEACHER_MUSE=open' if mode == 'open' else 'OPEN_WEIGHTS_HOST'}: {problem}")
        d = OW.describe()
        return (f"wording, plan and questions: {d['family']} (open weights, {d['model']}), served by {d['servedBy']}; "
                "uploads that agreed to it only, never a demo")
    why = f"TEACHER_MUSE={mode}" if mode != "on" else f"TEACHER_MUSE=on chose {V.label(V._hosted())} (TEACHER_MUSE=open uses it)"
    return f"OPEN_WEIGHTS_HOST is set but not used: {why}" + (f"; and it could not work: {problem}" if problem else "")


def _muse_config_note():
    """What to say at start-up about the hosted Muse route: raises SystemExit for a TEACHER_MUSE that is not one
    of off, meta, openrouter, open or on (voice.py counts it as off), for TEACHER_MUSE=openrouter whose settings
    cannot work (a missing or malformed key, another host, a refused model), and for TEACHER_MUSE=open (or on, when it
    would be the route) whose OPEN_WEIGHTS_* settings cannot work (_open_config_note); a line for an OpenRouter key or
    an OPEN_WEIGHTS_HOST that is set but not used, or not usable; else None. Read-only: nothing is sent."""
    import openrouter_api as OR
    import voice as V
    raw = (os.environ.get("TEACHER_MUSE") or "on").strip().lower() or "on"
    if raw not in V.MODES:
        raise SystemExit(f"TEACHER_MUSE must be off, meta, openrouter, open or on, not {raw[:40]!r}")
    if V.meta_only():
        # every model call on Meta's Model API (voice.meta_only): another route would silently be the fixed lines
        if raw in ("openrouter", "open"):
            raise SystemExit(f"TEACHER_MUSE={raw}: this server runs on Meta's Model API only (set TEACHER_MUSE=meta, on or off)")
        unused = [n for n in ("OPENROUTER_API_KEY", "OPEN_WEIGHTS_HOST", "MUSE_BASE_URL", "REPLICATE_API_TOKEN")
                  if os.environ.get(n, "").strip()]
        return f"{', '.join(unused)} {'is' if len(unused) == 1 else 'are'} set but not used: Meta's Model API only" if unused else None
    mode, route = V._mode(), V.hosted_route()
    ow_note = _open_config_note(mode, route)
    if mode == "open":
        return ow_note
    note = _openrouter_config_note(mode, route)
    return "; ".join(n for n in (note, ow_note) if n) or None


def _openrouter_config_note(mode, route):
    """The OpenRouter part of _muse_config_note."""
    import openrouter_api as OR
    import voice as V
    or_key = bool(os.environ.get("OPENROUTER_API_KEY", "").strip())
    meta_key = _stt_key()                         # set, and not refused by Meta (the start-up check, or a first request)
    problem = OR.problem() if (mode == "openrouter" or or_key) else None

    def using():
        return f"wording and questions: {V.label(V._hosted())}, pinned to {' or '.join(V.openrouter_info()['providers'])}"
    if mode == "openrouter":
        if problem:
            raise SystemExit(f"TEACHER_MUSE=openrouter: {problem}")
        return using() + ("; spoken questions still go to Meta's API with MODEL_API_KEY" if meta_key else "")
    if not or_key or mode == "off":
        return None
    if mode == "meta":
        return "OPENROUTER_API_KEY is set but not used: TEACHER_MUSE=meta"
    if route == "meta":
        return ("OPENROUTER_API_KEY is set but not used: MODEL_API_KEY is set too, and Meta's API comes first. If "
                "MODEL_API_KEY is not a working Meta key, unset it (it also turns on Meta's speech-to-text and puts "
                "Meta's Model API in the upload agreement), or let the start-up check find it refused; to keep a working "
                "Meta key for speech-to-text and word through OpenRouter, set TEACHER_MUSE=openrouter")
    if problem:
        return f"OPENROUTER_API_KEY is set but not used: {problem}"
    return using()


def _cleanup():
    keep = _keep_days() * 86400
    while True:
        _sweep(keep)
        time.sleep(3600)


_JS_REGEX_AFTER = set("(,=:[!&|?{};+-*%<>~^")
_JS_REGEX_WORDS = {"return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"}


def strip_js_comments(src):
    """JavaScript source without its comments, every newline kept (a stack trace's line numbers match the source):
    strings, template literals (with their ${...}, nested), and regular expression literals pass through unchanged.
    The served stage files' comments are the team's notes on where each piece came from, which the page has no use for;
    test_public_surface.py checks every served script tokenizes exactly as its source does."""
    out, i, n = [], 0, len(src)
    depth = []                     # for each template literal's open ${: the braces opened inside it since
    last = ""                      # the last token's kind, to tell a regular expression from a division

    def template(i):               # from just after a backtick or a closing }, to the end of the template or a ${
        j = i
        while j < n:
            c = src[j]
            if c == "\\":
                j += 2
            elif c == "`":
                return j + 1, False
            elif c == "$" and src.startswith("${", j):
                return j + 2, True
            else:
                j += 1
        return n, False
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append("\n" * src.count("\n", i, j) or " ")
            i = j
        elif c in "'\"":
            j = i + 1
            while j < n and src[j] != c and src[j] != "\n":
                j += 2 if src[j] == "\\" else 1
            out.append(src[i:j + 1])
            i, last = j + 1, "x"
        elif c == "`" or (c == "}" and depth and depth[-1] == 0):
            if c == "}":
                depth.pop()
            j, more = template(i + 1)
            out.append(src[i:j])
            if more:
                depth.append(0)
                last = "("
            else:
                last = "x"
            i = j
        elif c == "/" and (not last or last in _JS_REGEX_AFTER or last in _JS_REGEX_WORDS):
            j, cls = i + 1, False
            while j < n and src[j] != "\n":
                ch = src[j]
                if ch == "\\":
                    j += 2
                    continue
                if ch == "[":
                    cls = True
                elif ch == "]":
                    cls = False
                elif ch == "/" and not cls:
                    break
                j += 1
            j += 1
            while j < n and (src[j].isalnum() or src[j] in "_$"):
                j += 1
            out.append(src[i:j])
            i, last = j, "x"
        elif c.isalnum() or c in "_$" or ord(c) > 127:
            j = i
            while j < n and (src[j].isalnum() or src[j] in "_$." or ord(src[j]) > 127) and not src.startswith("..", j):
                j += 1
            word = src[i:j]
            out.append(word)
            i, last = j, (word if word in _JS_REGEX_WORDS else "x")
        else:
            if c == "{" and depth:
                depth[-1] += 1
            elif c == "}" and depth:
                depth[-1] -= 1
            out.append(c)
            i += 1
            if not c.isspace():
                last = c
    return "".join(out)


_CSS_PARTS = re.compile(r"""("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(/\*.*?(?:\*/|\Z))""", re.S)
_HTML_PARTS = re.compile(r"(?is)(<script\b[^>]*>)(.*?)(</script\s*>)|(<style\b[^>]*>)(.*?)(</style\s*>)|(<!--.*?-->)")


def strip_css_comments(src):
    """CSS without its comments, every newline kept; strings pass through unchanged. The style sheets' comments are the
    team's notes (who asked for what, and when), which the page has no use for."""
    return _CSS_PARTS.sub(lambda m: m.group(1) if m.group(1) else ("\n" * m.group(2).count("\n") or " "), src)


def strip_html_comments(src):
    """A page without its comments: <!-- --> outside its scripts and styles, its style blocks' CSS comments and its
    inline scripts' comments (strip_js_comments), every newline kept -> (the page, ["'sha256-...'" of each inline script as
    served], for its Content-Security-Policy)."""
    hashes = []

    def sub(m):
        if m.group(1):
            if re.search(r"\bsrc\s*=", m.group(1), re.I):
                return m.group(0)
            body = strip_js_comments(m.group(2))
            h = "'sha256-" + base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode() + "'"
            if body.strip() and h not in hashes:
                hashes.append(h)
            return m.group(1) + body + m.group(3)
        if m.group(4):
            return m.group(4) + strip_css_comments(m.group(5)) + m.group(6)
        return "\n" * m.group(7).count("\n")
    return _HTML_PARTS.sub(sub, src), hashes


def csp(hashes=()):
    """The Content-Security-Policy every answer carries (a page's with its own inline scripts' hashes): this site only, the
    media, images and workers the lesson makes as blob: and data: URLs, no framing. The same as deploy/vercel/make_front.py
    gives the pages there."""
    return "; ".join([
        "default-src 'self'",
        "script-src 'self'" + "".join(" " + h for h in hashes),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' blob: data:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",   # our own pages may frame ours (the analysing screen's calibration animation); no other site
    ])


SECURITY_HEADERS = ((b"content-security-policy", csp().encode()), (b"x-content-type-options", b"nosniff"),
                    (b"referrer-policy", b"no-referrer"), (b"x-frame-options", b"SAMEORIGIN"))


def _note_first_client(scope):
    """Once a process, in the log: what the first request's client address is (a public one, or a private one, which
    would be a proxy's) and whether it came with forwarding headers. Every per-client limit (the wrong-code throttle, the
    sample limits) keys on that address, so behind a proxy that hides it they would be one limit for everyone: this is
    how a deploy shows which it is (DEPLOY.md, during judging). The address itself is never written."""
    if _FIRST_CLIENT:
        return
    _FIRST_CLIENT.append(True)
    host = (scope.get("client") or ("?", 0))[0]
    try:
        ip = ipaddress.ip_address(host)
        kind = "this machine's" if ip.is_loopback else "private (a proxy's?)" if ip.is_private else "public"
    except ValueError:
        kind = "not an address"
    fwd = sorted({k.decode("latin-1").lower() for k, _ in scope.get("headers") or []} & {"x-forwarded-for", "forwarded", "x-real-ip"})
    # a warning, so it shows where only warnings are printed (this logger has no handler of its own)
    log.warning("the first request's client address is %s; forwarding headers: %s", kind, ", ".join(fwd) or "none")


_FIRST_CLIENT = []


class _SecurityHeaders:
    """Every HTTP answer's SECURITY_HEADERS, each unless the answer set its own (a page's policy carries its scripts'
    hashes; a score tile's is stricter). no-referrer: a link's media key or signature never travels in a Referer."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        _note_first_client(scope)

        async def with_headers(m):
            if m.get("type") == "http.response.start":
                h = list(m.get("headers") or [])
                have = {k.lower() for k, _ in h}
                m = dict(m, headers=h + [(k, v) for k, v in SECURITY_HEADERS if k not in have])
            await send(m)
        await self.app(scope, receive, with_headers)


app.add_middleware(_SecurityHeaders)


class _PageFiles(StaticFiles):
    """static/ as the page uses it, and nothing else: a provenance note (README*, *.md, *.txt) or a source file left
    beside an asset is never served, wherever it is in the tree (the notes live in static-notes/, next to static/); a
    script, a style sheet and a page are served without their comments (strip_js_comments, strip_css_comments,
    strip_html_comments; a page with its own Content-Security-Policy naming its inline scripts by hash), kept by the
    file's size and time. Under vendor/ (another project's code, copied as its publisher ships it: three.js) a file is
    served byte for byte, its licence header included, so it is the file whose sha256 static-notes/README.txt records."""
    HIDDEN = re.compile(r"(?:^|/)(?:README[^/]*|[^/]*\.(?:md|txt|py|sh|orig|bak|diff|log))$", re.I)
    VENDOR = re.compile(r"^vendor/")
    STRIPPED = {}                  # path -> ((size, mtime), the file without its comments, its policy or None)

    @staticmethod
    def _strip(p, text):
        if p.endswith((".js", ".mjs")):
            return strip_js_comments(text), None
        if p.endswith(".css"):
            return strip_css_comments(text), None
        page, hashes = strip_html_comments(text)
        return page, csp(hashes)

    async def get_response(self, path, scope):
        rel = path.replace("\\", "/")
        if self.HIDDEN.search(rel):
            raise HTTPException(404, "Not Found")
        resp = await super().get_response(path, scope)
        p = getattr(resp, "path", None)
        if (resp.status_code != 200 or scope["method"] != "GET" or not isinstance(p, str)
                or not p.endswith((".js", ".mjs", ".css", ".html")) or self.VENDOR.match(rel)):
            return resp
        st = os.stat(p)
        got = self.STRIPPED.get(p)
        if not got or got[0] != (st.st_size, st.st_mtime_ns):
            with open(p, encoding="utf-8") as f:
                body, policy = self._strip(p, f.read())
            got = self.STRIPPED[p] = ((st.st_size, st.st_mtime_ns), body.encode("utf-8"), policy)
        headers = {k: v for k, v in resp.headers.items() if k.lower() in ("last-modified", "cache-control")}
        if got[2]:
            headers["Content-Security-Policy"] = got[2]
        return Response(got[1], media_type=resp.media_type, headers=headers)


def _lane_routes():
    """The routes another part of the build adds (the voice and piano module's routes(app): the Splendid Grand's samples),
    put in before the page's own files so "/" cannot shadow them; a module that is not here adds none."""
    for name in ("voicepack", "splendid_piano", "splendid"):
        fn = _lane_fn(name, "routes")
        if fn is None:
            continue
        try:
            fn(app)
        except Exception as e:
            log.warning("%s.routes did not add its routes: %s: %s", name, type(e).__name__, e)


_lane_routes()
# the lesson app is the product's front end, at / (front.py: the page, its files, /classic/ for the
# older page, GET /api/jobs for the Library); TEACHER_FRONT=classic keeps static/ at / alone
import sys  # noqa: E402
import front  # noqa: E402
if front.mode() == "bench":
    front.routes(app, sys.modules[__name__])
app.mount("/", _PageFiles(directory=os.path.join(HERE, "static"), html=True, check_dir=False), name="static")


def _check_settings():
    """Refuse to start (SystemExit, never echoing a code) on a setting this build reads that cannot work."""
    show = (os.environ.get("TEACHER_SHOW_DEMOS") or "1").strip()
    if show not in ("0", "1"):
        raise SystemExit("TEACHER_SHOW_DEMOS must be 1 (show the Quest demos) or 0 (hide them)")
    if (os.environ.get("TEACHER_CHAT") or "off").strip().lower() not in ("on", "off"):
        raise SystemExit("TEACHER_CHAT must be off (no conversation, the default) or on")
    if (os.environ.get("TEACHER_REPLAY") or "on").strip().lower() not in ("on", "off"):
        raise SystemExit("TEACHER_REPLAY must be on (a repeat upload gets its earlier lesson in a mock run, the default) or off")
    try:
        _env_num("TEACHER_SAMPLE_CHAT_MAX", 20, 1, 10000, integer=True)
        _env_num("TEACHER_SAMPLE_CHAT_WINDOW_S", 600, 10, 86400)
        _env_num("TEACHER_JUDGE_UPLOADS", 10, 1, 1000, integer=True)
        _env_num("TEACHER_JUDGE_MAX_MB", 150, 1, MAX_UPLOAD / 2**20)
        _env_num("TEACHER_JUDGE_MAX_S", 120, 5, 3600)
        _env_num("TEACHER_COLD_START_S", 0, 0, 3600)
        _env_num("TEACHER_JUDGE_AT_ONCE", 2, 1, 100, integer=True)
        _env_num("TEACHER_JUDGE_QUESTIONS", 60, 1, 100000, integer=True)
        _env_num("TEACHER_JUDGE_DISK_MB", 3000, 10, 10**7)
        _env_num("TEACHER_OPEN_HOSTED_DAY", 300, 0, 10**6, integer=True)
        _env_num("TEACHER_JOB_MAX_S", 0, 60, 86400)
        _env_num("TEACHER_REPLAY_S", REPLAY_S, 0, 600)
    except ValueError as e:
        raise SystemExit(str(e)) from None
    raw = [c for c in re.split(r"[\s,]+", os.environ.get("TEACHER_JUDGE_CODE") or "") if c]
    bad = sum(not CODE_RE.fullmatch(c) for c in raw)
    if bad:
        raise SystemExit(f"TEACHER_JUDGE_CODE: {bad} of its {len(raw)} codes {'is' if bad == 1 else 'are'} not 8 to 128 letters, digits, - "
                         "or _ (separate codes with commas)")
    if raw and not os.environ.get("TEACHER_TOKEN"):
        print("TEACHER_JUDGE_CODE is set without TEACHER_TOKEN: this server takes every upload anyway, so the codes change "
              "nothing", flush=True)
    import meta_api
    try:
        meta_api.take_keywords_on()
    except ValueError as e:
        raise SystemExit(str(e)) from None
    import proref                                  # TEACHER_PRO, TEACHER_PRO_DIR, TEACHER_PRO_SOUND (proref.py)
    try:
        proref.check(served=_served())
    except ValueError as e:
        raise SystemExit(str(e)) from None


def _served():
    """The folders this server serves files from (the jobs, the samples, the demos), which TEACHER_PRO_DIR must stay out of."""
    return [DATA, SAMPLES, DEMOS]


def main():
    global DATA, DEMOS, SAMPLES
    import uvicorn
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8780)
    ap.add_argument("--data", default=DATA)
    ap.add_argument("--demos", default=DEMOS, help="the built demo takes (demos/build_demos.py --out)")
    ap.add_argument("--samples", default=SAMPLES, help="the sample lessons (make_sample.py --samples)")
    a = ap.parse_args()
    DATA = os.path.abspath(a.data)
    DEMOS = os.path.abspath(a.demos)
    SAMPLES = os.path.abspath(a.samples)
    os.makedirs(DATA, exist_ok=True)
    PERSIST["limits"] = True
    _load_limits()                                 # a judge code's day goes on across a restart
    if a.host not in ("127.0.0.1", "localhost") and not os.environ.get("TEACHER_TOKEN"):
        raise SystemExit("set TEACHER_TOKEN before listening beyond this machine")
    if a.host not in ("127.0.0.1", "localhost") and len(os.environ["TEACHER_TOKEN"]) < TOKEN_MIN:
        # the token opens everything (every job, the voice routes, the costs): a short one can be guessed
        raise SystemExit(f"TEACHER_TOKEN must be at least {TOKEN_MIN} characters to listen beyond this machine "
                         "(python3 -c \"import secrets; print(secrets.token_urlsafe(32))\")")
    if a.host not in ("127.0.0.1", "localhost") and len(os.environ["TEACHER_TOKEN"]) < TOKEN_ADVISED:
        print(f"TEACHER_TOKEN is under {TOKEN_ADVISED} characters: replace it with a longer one when you can "
              "(python3 -c \"import secrets; print(secrets.token_urlsafe(32))\")", flush=True)
    short = sum(len(c) < CODE_MIN_ADVISED for c in _codes())
    if a.host not in ("127.0.0.1", "localhost") and short:
        print(f"TEACHER_JUDGE_CODE: {short} code(s) under {CODE_MIN_ADVISED} characters; give each judge a long random code of "
              "their own", flush=True)
    _check_settings()
    try:
        _keep_days()
    except ValueError:
        raise SystemExit("TEACHER_KEEP_DAYS must be a number of days above 0, such as 7") from None
    try:
        import speech as SP
        SP.check_env()
        import window as W
        W.window_s()
        import framing as F
        F.check_env()
        import framing_tip as FT
        FT.check_env()
    except ValueError as e:
        raise SystemExit(str(e)) from None
    import voice as V
    if os.environ.get("TEACHER_SAM", "local") == "replicate" and V.meta_only():
        raise SystemExit("TEACHER_SAM=replicate: this server runs on Meta's Model API only (TEACHER_SAM=meta)")
    if os.environ.get("TEACHER_SAM", "local") == "replicate":
        problem = _replicate_config_problem()
        if problem:
            raise SystemExit(f"TEACHER_SAM=replicate: {problem}")
    # hosted SAM 3.1 runs every take: without a key, or without Meta's mask parser, each one would fail after its
    # upload, so the server does not start
    sam_meta = os.environ.get("TEACHER_SAM", "local") == "meta"
    if sam_meta:
        if not os.environ.get("MODEL_API_KEY", "").strip():
            raise SystemExit("TEACHER_SAM=meta needs MODEL_API_KEY, a working Meta Model API key (check one with "
                             "python check_meta_key.py)")
        import meta_api
        if meta_api._parser_decoder() is None:
            raise SystemExit("TEACHER_SAM=meta needs meta_sam_parser (web/requirements.txt) to decode SAM 3.1's masks: "
                             "from boxes alone the keyboard cannot be followed")
    _muse_config_note()                            # a TEACHER_MUSE that cannot work stops here, before anything is sent
    import voice as V
    if os.environ.get("MODEL_API_KEY", "").strip() and (V._mode() != "off" or sam_meta) and os.environ.get("TEACHER_META_PROBE") != "0":
        st = V.probe_meta_key()                    # one GET /models with the key, nothing about any take
        if st == "refused" and sam_meta:
            raise SystemExit("MODEL_API_KEY was refused by Meta's Model API (401 or 403), and TEACHER_SAM=meta needs it "
                             "for every take")
        if st == "refused":
            print("MODEL_API_KEY was refused by Meta's Model API: wording, questions and speech-to-text route as if it "
                  "were unset (OpenRouter when OPENROUTER_API_KEY is set, else the open-weights host when "
                  "OPEN_WEIGHTS_HOST is)", flush=True)
    note = _muse_config_note()
    if note:
        print(note, flush=True)
    import proref
    try:                                           # the reference recordings this server may compare takes with (never their contents)
        proref.load(served=_served(), log=lambda m: print(m, flush=True))
    except ValueError as e:
        raise SystemExit(str(e)) from None
    if os.environ.get("TEACHER_SAM", "local") == "local":
        _torch_device()                            # once, now: never as a job starts (_job_max_s)
    _seed_rates()                                  # the wait the page shows, from the takes already timed here
    n = _requeue()
    if n:
        print(f"queued again {n} job(s) that a restart interrupted", flush=True)
    k = len(_sample_ids())
    if k:
        print(f"{k} sample lesson(s) in {SAMPLES}, open to anyone", flush=True)
    threading.Thread(target=_worker, daemon=True).start()
    threading.Thread(target=_cleanup, daemon=True).start()
    # ws_max_size: the voice relay takes frames of a second at most (VOICE_FRAME); 16 MB is uvicorn's default
    uvicorn.run(app, host=a.host, port=a.port, log_level="info", access_log=True, ws_max_size=1 << 20)


if __name__ == "__main__":
    main()
