"""Museverse Teacher (web/server.py) on Modal: the whole app in one CPU container.

    python deploy.py          # from this folder (deploy/modal/): checks, waits for no job, then
                              # modal deploy --strategy recreate modal_app.py (see DEPLOY.md)

What runs where:
  - one container, one process: web/server.py's FastAPI app, its in-process job queue and its one
    background worker (SAM 3.1 on Meta's Model API, TEACHER_SAM=meta; the note transcription runs here, on the CPU),
    the static page and the demos. No GPU, no SAM weights and no sam3 code: every AI call goes to Meta's Model API.
    max_containers=1, because the queue, the job states and the voice tickets live in that process.
  - Volume "museverse-teacher-models", mounted read-only at /models: the piano transcription checkpoint (CC BY 4.0,
    Zenodo record 4034264), uploaded by weights.sh. It is the only model file the server reads.
  - Volume "museverse-teacher-data", mounted at /data: TEACHER_DATA (uploads, results, voice consents), kept
    TEACHER_KEEP_DAYS days by the server itself while it runs and, while it is scaled to zero, by the daily sweep
    function (the same server._sweep), and the sample lessons at /data/samples (SAMPLES_DIR, set here),
    uploaded by samples.sh after make_sample.py --check; the server's clean-up never touches them.
  - Secret "museverse-teacher" (by name only, never values in code): TEACHER_TOKEN and MODEL_API_KEY (required: a
    working Meta key, which hosted SAM 3.1, Muse Spark and Muse Wonder use for every take) and the optional
    TEACHER_JUDGE_CODE (the judges' codes: a secret, never in the image). Everything runs on Meta's Model API only
    (TEACHER_MUSE=meta, voice.meta_only): OPENROUTER_API_KEY, the OPEN_WEIGHTS_* settings and BASETEN_API_KEY,
    FIREWORKS_API_KEY or MODAL_ENDPOINT_KEY are not used (they stay in SECRET_EXPECTED so none is ever baked into the image).
  - The reference library: web/library's public pieces, each with its pinned copies of core's files (web/library/<id>/core/,
    library.core_assets), so the Nocturne's recorded ghost hands play from its GRP2 there (teacher_performances.source,
    amendment 11 of the merge plan): no performances folder is mounted and TEACHER_PERFORMANCES_DIR is not set. The
    recorded hands leave the server only as ghost_guard.py's cuts of the taught bars (capped per job and per piece, the
    ledger on /data). The public pieces' score tiles (web/library/<id>/score/) ship with them and are served only for a
    job's own window. The internal pieces are left out, folder, core copies and tiles alike (_internal_library_pieces),
    and check_deploy.py fails when the image env would open an internal build, turn the conversation on, or name a
    performances folder, when a shipped performance is not cleared for the public, and when the sample lessons' cuts
    would go past the cap.
  - The note transcriber runs on TRANSCRIBE_THREADS=4 threads (all four cores: no local SAM 3.1 shares them here;
    transcribe.py halves the cores by default), overridable with TEACHER_MODAL_SET_TRANSCRIBE_THREADS.
  - The Quest demos are not shipped and not listed (TEACHER_MODAL_DEMOS=none, TEACHER_SHOW_DEMOS=0) unless the deploy
    sets TEACHER_MODAL_SHOW_DEMOS=1: the players have not agreed to showing them outside the team, and a demo's link
    opens with no token, so hiding them from the list alone would not keep them in the team.
  - The demos, when shipped: web/data/demos as built on the deploying machine, carried in the image. They are never
    built in the container: web/demos/build_demos.py runs G0 (web/fingering/quest.py g0_live imports
    tools/sync_core.py, which checks the vendored copies' pins, which list the internal library pieces' files), and the
    image adds neither tools/ nor the internal pieces. So a deploy that ships them (bundle) refuses to
    go ahead without built demos.

Startup (the asgi_app factory, once per container): run web/server.py's own main() with uvicorn.run stubbed out,
so every start-up check and step of the real server runs unchanged (TEACHER_TOKEN required off localhost,
TEACHER_KEEP_DAYS, TEACHER_WINDOW_S, TEACHER_FRAMING, TEACHER_MUSE, the Meta key probe, the requeue of
interrupted jobs, the worker and the cleanup threads), start the keep-alive, and return server.app wrapped so
that GET /api/modal/busy (token required) answers how many jobs are running and queued: /api/health's "queue"
is QUEUE.qsize(), which leaves out the job the worker has already taken, so it reads 0 mid-job. deploy.py asks
this before it stops the container.

Deploy-time settings (environment of the machine that runs `modal deploy`; baked into the image env so the
container re-reads the same values when it imports this file):
  TEACHER_MODAL_APP            app name (default museverse-teacher)
  TEACHER_MODAL_GPU            none (the default, and the right choice: CPU only, SAM 3.1 runs on Meta's Model API), or a GPU
                               (T4, L4, A10, L40S, ...; a comma list is a fallback order), which installs the CUDA build of
                               torch like web/Dockerfile but speeds nothing up here: the note transcriber has no GPU path
                               (transcribe.py loads and runs its model on the CPU), and only a local SAM 3.1 would use one
  TEACHER_MODAL_MIN_CONTAINERS 0 (default: scale to zero) or 1 (keep one warm: set it for the judging window, DEPLOY.md
                               "During judging"; the daily counts, the recorded hands' ledger and its secret are kept on
                               /data either way, so a container that scaled to zero starts no judge on a fresh day)
  TEACHER_MODAL_SCALEDOWN_S    idle seconds before the container stops (default 300; clamped to 60 to 1200,
                               Modal allows 2 to 1200). Every request that wakes the app (a link preview, a
                               crawler, /api/health) holds the container this long, so longer costs more per visit
  TEACHER_MODAL_SHOW_DEMOS     0 (default: TEACHER_SHOW_DEMOS=0, the demos are not listed) or 1 (listed on the home
                               page: only once the players have agreed to showing them outside the team)
  TEACHER_MODAL_DEMOS          none (the default with TEACHER_MODAL_SHOW_DEMOS=0: no demos in the image) or bundle (the
                               default with 1: web/data/demos must hold the built demos, else the deploy stops). bundle
                               with the demos unlisted ships them anyway: their links then open for anyone who has one
  TEACHER_MODAL_CPU            physical cores requested (default 4.0)
  TEACHER_MODAL_MEMORY_MB      memory requested in MiB (default 16384)
  TEACHER_MODAL_SECRET         secret name (default museverse-teacher)
  TEACHER_MODAL_REQUIRE_WEIGHTS 1 (default): refuse to start without the transcription checkpoint; 0 for a demos-only app
  TEACHER_MODAL_FINGERS        1 (default): the fingertip tracker in a venv of its own (/opt/fingers, web/requirements-
                               fingers.txt) and its hand model baked into the image, checked against its sha256, so the
                               pipeline's "fingers" step runs (on this CPU, no model API); 0 leaves both out and the step
                               says "fingertip tracking is not installed", every other part of a result unchanged
  TEACHER_MODAL_SET_<NAME>=v   sets the server variable NAME=v in the container (non-secret knobs only, e.g.
                               TEACHER_MODAL_SET_TEACHER_KEEP_DAYS=3, TEACHER_MODAL_SET_TEACHER_MUSE=open); names with
                               KEY, TOKEN, SECRET, PASSWORD or CODE are refused (they go in the secret), and so are the
                               names this file sets itself (SAMPLES_DIR, TEACHER_SHOW_DEMOS: use TEACHER_MODAL_SHOW_DEMOS;
                               TEACHER_SAM: it is meta, this image has no local SAM)

Modal docs read on 2026-10-27 (cited below by the short name in brackets):
  [webhooks]   https://modal.com/docs/guide/webhooks
  [wtimeout]   https://modal.com/docs/guide/webhook-timeouts
  [concurrent] https://modal.com/docs/guide/concurrent-inputs
  [coldstart]  https://modal.com/docs/guide/cold-start
  [scale]      https://modal.com/docs/guide/scale
  [timeouts]   https://modal.com/docs/guide/timeouts
  [preempt]    https://modal.com/docs/guide/preemption
  [lifecycle]  https://modal.com/docs/guide/lifecycle-functions
  [volumes]    https://modal.com/docs/guide/volumes
  [secrets]    https://modal.com/docs/guide/secrets
  [gpu]        https://modal.com/docs/guide/gpu
  [cuda]       https://modal.com/docs/guide/cuda
  [images]     https://modal.com/docs/guide/images
  [imageref]   https://modal.com/docs/sdk/py/latest/Image  (the older /docs/reference/modal.Image came back empty)
  [appref]     https://modal.com/docs/sdk/py/latest/App
  [resources]  https://modal.com/docs/guide/resources
  [pricing]    https://modal.com/pricing
  [cron]       the modal client's own modal.Cron docstring (1.6.2, read 2026-10-29): a cron string, UTC by default,
               passed to @app.function(schedule=...)
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import threading
import time
import urllib.request

import modal


def _cfg(name, default):
    v = os.environ.get(name, "").strip()
    return v if v else default


HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent                     # the teacher's folder on the deploying machine (web/ and its siblings)

APP_NAME = _cfg("TEACHER_MODAL_APP", "museverse-teacher")
GPU_RAW = _cfg("TEACHER_MODAL_GPU", "none")
GPU = [g.strip() for g in GPU_RAW.split(",") if g.strip() and g.strip().lower() != "none"]
GPU = (GPU[0] if len(GPU) == 1 else GPU) or None     # none: CPU only; a list is tried in order [gpu]
MIN_CONTAINERS = int(_cfg("TEACHER_MODAL_MIN_CONTAINERS", "0"))
# Modal allows 2 s to 20 min [coldstart]; under 60 s the keep-alive would have to ping every few seconds, and the
# container would stop between two clicks of one visit, so 60 s is the floor here
SCALEDOWN_S = max(60, min(1200, int(_cfg("TEACHER_MODAL_SCALEDOWN_S", "300"))))
SHOW_DEMOS = _cfg("TEACHER_MODAL_SHOW_DEMOS", "0")
# the Quest demos ship only once they may be shown: a demo's link opens with no token, so unlisted is not private
DEMOS_MODE = _cfg("TEACHER_MODAL_DEMOS", "bundle" if SHOW_DEMOS == "1" else "none")
CPU = float(_cfg("TEACHER_MODAL_CPU", "4.0"))
MEMORY_MB = int(_cfg("TEACHER_MODAL_MEMORY_MB", "16384"))
SECRET_NAME = _cfg("TEACHER_MODAL_SECRET", "museverse-teacher")
# The password gate (the hosted demo): a second secret holding TEACHER_GATE_TOKEN, the value the Vercel front's
# middleware sets as the muse_gate cookie once the password is typed (deploy/vercel/make_front.py --gate). Every request
# to this app then needs that cookie or the team's bearer token (_with_gate), so the modal.run URL opens nothing by
# itself. Listed after SECRET_NAME, so a name in both (TEACHER_TOKEN) takes this one's value. "none" turns the gate off.
GATE_SECRET = _cfg("TEACHER_MODAL_GATE_SECRET", "museverse-teacher-gate")
GATE_SECRET = None if GATE_SECRET.lower() == "none" else GATE_SECRET
GATE_COOKIE = "muse_gate"
# each browser's own id behind the gate (random, set by the Vercel front with the password, or here when it is missing):
# server.gate_visitor_code signs it into that browser's judge code, so its takes are its own
VISITOR_COOKIE = "muse_visitor"
VISITOR_MAX_AGE_S = 30 * 86400
REQUIRE_WEIGHTS = _cfg("TEACHER_MODAL_REQUIRE_WEIGHTS", "1") != "0"
FINGERS = _cfg("TEACHER_MODAL_FINGERS", "1") != "0"
MODELS_VOLUME = "museverse-teacher-models"
DATA_VOLUME = "museverse-teacher-data"

# in the container
APP_DIR = "/app"                              # the same layout as web/Dockerfile: /app/web next to /app/sam31, ...
WEB_DIR = f"{APP_DIR}/web"
MODELS_DIR = "/models"
DATA_DIR = "/data"
SAMPLES_DIR = f"{DATA_DIR}/samples"           # on the data volume (samples.sh); _sweep leaves non-job folders alone
BUNDLED_DEMOS = f"{APP_DIR}/demos-bundled"    # web/data/demos from the deploying machine
NO_DEMOS = "/tmp/teacher-no-demos"            # an empty folder for the server when none were shipped
LOCAL_DEMOS = ROOT / "web" / "data" / "demos"
TRANSCRIBE_CKPT_NAME = "note_F1=0.9677_pedal_F1=0.9186.pth"   # the name web/Dockerfile gives it
# The fingertip tracker (web/fingering/tracker.py; web/Dockerfile's FINGERS=1): a 21-point hand-landmark model, on this
# CPU, in a venv of its own (web/requirements-fingers.txt), so its packages never meet the server's, run out of process
# (fingering/mp_runner.py) under TEACHER_FINGERS_PYTHON. Its model file (7.8 MB, Apache-2.0) goes into the image from
# the deploying machine's web/fingering/model/ (python web/fingering/fetch_model.py puts it there), checked at build
# against the sha256 the teacher pins (repeated here because the code is only mounted at container start); the
# tracker checks it again before every job.
FINGERS_VENV = "/opt/fingers"
HAND_MODEL_PATH = "/models-bundled/hand_landmarker.task"
LOCAL_HAND_MODEL = ROOT / "web" / "fingering" / "model" / "hand_landmarker.task"
HAND_MODEL_SHA256 = "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1"
BUSY_PATH = "/api/modal/busy"                 # answered by _with_busy, never reaches server.py
# The keep-alive: at least three pings per idle window (60 s window: every 20 s; 300 s and up: every 100 to 120 s),
# and bounded, so a job that hangs cannot keep the container billed (KeepAlive below)
KEEPALIVE_S = max(1, min(120, SCALEDOWN_S // 3))
STALL_S = 30 * 60                             # no busy job changed status, step or progress for this long: stop
JOB_MAX_S = 3 * 3600                          # one job running longer than this: stop

# web/Dockerfile's pins. The default is CPU only, so torch and torchvision come from PyTorch's CPU index (a few
# hundred MB, not the CUDA stack). With a GPU chosen they come from the CUDA 13.0 index like web/Dockerfile: Modal's
# hosts have CUDA Driver API 13.3 and "older versions in the 12.* and 13.* series are guaranteed to be compatible",
# and a plain pip install of torch works because its wheels bundle the rest of the CUDA stack [cuda].
TORCH = ("torch==2.14.1", "torchvision==0.29.1")
TORCH_INDEX_CPU = "https://download.pytorch.org/whl/cpu"
TORCH_INDEX_CUDA = "https://download.pytorch.org/whl/cu130"
TORCH_INDEX = TORCH_INDEX_CPU if GPU is None else TORCH_INDEX_CUDA
NODE_VERSION = "22.22.0"                      # web/Dockerfile: Node 22 for realvideo/*.mjs, no npm packages

# The folders web/ imports or runs (web/Dockerfile COPY list): ../sam31 ../realvideo ../solver ../bench ../live ../vendor
SIBLINGS = ("live", "sam31", "realvideo", "solver", "bench", "vendor")
COMMON_IGNORE = [
    "**/__pycache__", "**/*.pyc", "**/.git", "**/node_modules", "**/.venv", "**/.pytest_cache",
    # weights never travel in the image (they live in the private models volume)
    "**/*.safetensors", "**/*.pt", "**/*.pth", "**/weights",
]
WEB_IGNORE = COMMON_IGNORE + [
    "data",            # uploads, results and the built demos (the demos come in separately, below)
    "results",         # evaluation output, not read by the server
    # testbench/ ships: web/front.py builds the product page at / from it at every start (build_testbench.py --target
    # product); only its tests and the notes beside them stay out
    "testbench/test_*", "testbench/*.md",
    "fingering/model", # a local copy of the tracker's hand model: the image bakes its own (HAND_MODEL_PATH), checked
    "**/*.mp4", "**/*.mov", "**/*.MOV",
]
# What the server needs and the check script (check_deploy.py) proves is not ignored
WEB_MUST_HAVE = ("server.py", "pipeline.py", "video.py", "transcribe.py", "voice.py", "static/index.html",
                 "demos/demos.json", "demos/build_demos.py", "library",
                 # the piano's MIDI of a take is read and lined up with the video by eval_take's own code (upload and pipeline)
                 "eval_take.py", "eval_transcribe.py",
                 # the product page at / (front.py builds it from these at start-up)
                 "front.py", "testbench/build_testbench.py", "testbench/testbench.html", "testbench/worker.py",
                 "testbench/calibration.js",   # the loading screen piano's script (calibration.html loads it)
                 # the 3D hands replay's three.js, served from static/vendor/ (no other server is asked for it; without
                 # it every demo's stage falls back to its 2D drawing)
                 "static/vendor/three-0.160.0/three.module.min.js",
                 # the page's font, our own copy (no page asks another server for it): its rules and the Latin file
                 "static/font.css", "static/vendor/wix-madefor-display-v12/latin.woff2")
SECRET_REQUIRED = ["TEACHER_TOKEN", "MODEL_API_KEY"]   # MODEL_API_KEY: SAM 3.1, Muse Spark and Muse Wonder run on Meta's API
# every one but the first two optional: the hosted routes' keys, the judges' codes, Muse Spark Open's settings and keys,
# and ElevenLabs' key for the voice of Muse (TEACHER_VOICE=elevenlabs, a setting: TEACHER_MODAL_SET_TEACHER_VOICE)
# (OPEN_WEIGHTS_KEY_ENV names one more variable, our own server's key, which then goes in the secret too)
SECRET_EXPECTED = ["TEACHER_TOKEN", "OPENROUTER_API_KEY", "MODEL_API_KEY", "TEACHER_JUDGE_CODE", "TEACHER_GHOST_SECRET",
                   "OPEN_WEIGHTS_HOST", "OPEN_WEIGHTS_MODEL", "OPEN_WEIGHTS_BASE_URL", "OPEN_WEIGHTS_PROVIDERS", "OPEN_WEIGHTS_KEY_ENV",
                   "BASETEN_API_KEY", "FIREWORKS_API_KEY", "MODAL_ENDPOINT_KEY", "ELEVENLABS_API_KEY"]
# what must never be baked into the image env: a key, a token, a judge code (TEACHER_MODAL_SET_ refuses these words, and
# every SECRET_EXPECTED name: Muse Spark Open's settings live in the secret with its key)
SECRET_WORDS = ("KEY", "TOKEN", "SECRET", "PASSWORD", "CODE")
# the server variables this file sets itself, which TEACHER_MODAL_SET_ may not change
SET_BY_APP = ("SAMPLES_DIR", "TEACHER_SHOW_DEMOS", "TEACHER_DATA", "DEMOS_DIR", "TEACHER_SAM", "SAM_CKPT")


def _internal_library_pieces():
    """web/library/<id>/ whose piece.json rights.flag is not "public", and the files a public piece keeps internal (its
    piece.json "internalFiles": the Rondo's recorded hands, its GRP2, since the piece itself is public
    of 2026-11-04): web/Dockerfile deletes them from an image unless built for an internal server. Here they are never
    shipped."""
    lib = ROOT / "web" / "library"
    out = []
    if not lib.is_dir():
        return out
    for d in sorted(lib.iterdir()):
        p = d / "piece.json"
        if p.is_file():
            try:
                m = json.loads(p.read_text())
                flag = m.get("rights", {}).get("flag")
                held = [f for f in (m.get("internalFiles") or {}).get("files") or [] if isinstance(f, str) and ".." not in f]
            except (OSError, ValueError, AttributeError):
                flag, held = None, []
            if flag != "public":
                out.append(f"library/{d.name}")
            else:
                out += [f"library/{d.name}/{f}" for f in held]
    return out


def _has_demos(path):
    p = pathlib.Path(path)
    return p.is_dir() and any((d / "result.json").is_file() for d in p.iterdir() if d.is_dir())


def _server_env():
    """The image env: web/Dockerfile's ENV lines with this deployment's paths, the deploy-time settings above
    (so the container computes the same values), and the explicit TEACHER_MODAL_SET_ overrides."""
    env = {
        "PIANO_TRANSCRIPTION_CKPT": f"{MODELS_DIR}/{TRANSCRIBE_CKPT_NAME}",
        "TEACHER_DATA": DATA_DIR,
        "DEMOS_DIR": BUNDLED_DEMOS,             # replaced at start-up by the folder _demos_dir picks
        "SAMPLES_DIR": SAMPLES_DIR,             # the sample lessons, on the data volume
        # the players have not agreed to showing the Quest demos outside the team: hidden unless the deploy says so
        "TEACHER_SHOW_DEMOS": "1" if SHOW_DEMOS == "1" else "0",
        "TEACHER_SAM": "meta",                  # SAM 3.1 on Meta's Model API for every take (MODEL_API_KEY)
        "TEACHER_MUSE": "meta",                 # Muse Spark and Muse Wonder on Meta's Model API only (voice.meta_only)
        "NODE": "/usr/local/bin/node",
        "PYTHONUNBUFFERED": "1",
        "NUMBA_CACHE_DIR": "/tmp/numba",        # librosa's numba cache needs a writable place (web/Dockerfile)
        "OMP_NUM_THREADS": str(max(1, int(CPU))),   # web/Dockerfile: torch would otherwise count the host's cores
        # the note transcriber on every core: transcribe.py halves them by default because a local SAM 3.1 used to share
        # them, and this image runs none (measured: about 29 s to about 18 s a 30 s take on a 4-core CPU)
        "TRANSCRIBE_THREADS": str(max(1, int(CPU))),
        "TEACHER_MODAL_APP": APP_NAME, "TEACHER_MODAL_GPU": GPU_RAW,
        "TEACHER_MODAL_MIN_CONTAINERS": str(MIN_CONTAINERS), "TEACHER_MODAL_SCALEDOWN_S": str(SCALEDOWN_S),
        "TEACHER_MODAL_CPU": str(CPU), "TEACHER_MODAL_MEMORY_MB": str(MEMORY_MB),
        "TEACHER_MODAL_SECRET": SECRET_NAME, "TEACHER_MODAL_GATE_SECRET": GATE_SECRET or "none",
        "TEACHER_MODAL_REQUIRE_WEIGHTS": "1" if REQUIRE_WEIGHTS else "0", "TEACHER_MODAL_DEMOS": DEMOS_MODE,
        "TEACHER_MODAL_SHOW_DEMOS": SHOW_DEMOS, "TEACHER_MODAL_FINGERS": "1" if FINGERS else "0",
    }
    if FINGERS:                                 # the fingers step's tracker (build_image puts both there)
        env.update(TEACHER_FINGERS_PYTHON=f"{FINGERS_VENV}/bin/python", TEACHER_HAND_MODEL=HAND_MODEL_PATH)
    for k, v in os.environ.items():
        if k.startswith("TEACHER_MODAL_SET_") and modal.is_local():
            name = k[len("TEACHER_MODAL_SET_"):]
            if any(s in name for s in SECRET_WORDS) or name in SECRET_EXPECTED:
                raise SystemExit(f"{k}: secrets and the judges' codes go in the Modal secret {SECRET_NAME!r}, never in the image")
            if name in SET_BY_APP:
                raise SystemExit(f"{k}: modal_app.py sets {name} itself"
                                 + (" (use TEACHER_MODAL_SHOW_DEMOS=1)" if name == "TEACHER_SHOW_DEMOS" else ""))
            env[name] = v
    return env


def local_adds():
    """[(local path, remote path, ignore patterns)] of everything the image adds from this machine; the check
    script walks the same list with Modal's own matcher."""
    adds = [(ROOT / d, f"{APP_DIR}/{d}", COMMON_IGNORE) for d in SIBLINGS]
    adds.append((ROOT / "web", WEB_DIR, WEB_IGNORE + _internal_library_pieces()))
    if DEMOS_MODE == "bundle" and _has_demos(LOCAL_DEMOS):
        adds.append((LOCAL_DEMOS, BUNDLED_DEMOS, COMMON_IGNORE))
    return adds


def deploy_problems():
    """Why a deploy from this machine must not go ahead, or []. Checked when this file is imported locally (that is
    what `modal deploy` does), and by check_deploy.py."""
    if DEMOS_MODE not in ("bundle", "none"):
        return [f"TEACHER_MODAL_DEMOS must be bundle or none, not {DEMOS_MODE!r}"]
    if SHOW_DEMOS not in ("0", "1"):
        return [f"TEACHER_MODAL_SHOW_DEMOS must be 0 or 1, not {SHOW_DEMOS!r}"]
    if DEMOS_MODE == "bundle" and not _has_demos(LOCAL_DEMOS):
        return [f"{LOCAL_DEMOS} holds no built demos: build them first (DEPLOY.md step 4b), or set "
                "TEACHER_MODAL_DEMOS=none to deploy without demos on purpose. The container cannot build them: "
                "the demo build needs tools/ and the internal library pieces, which the image leaves out"]
    return []


def build_image():
    # debian_slim is "based on the official python Docker images" [imageref]; the client's builder table
    # (modal/builder/base-images.json, image builder 2025.06) maps it to bookworm, which is web/Dockerfile's
    # python:3.12-slim-bookworm.
    image = (
        modal.Image.debian_slim(python_version="3.12")
        .apt_install("ffmpeg", "git", "curl", "ca-certificates", "xz-utils")       # web/Dockerfile's apt line
        .run_commands(
            f"curl -fsSL https://nodejs.org/dist/v{NODE_VERSION}/node-v{NODE_VERSION}-linux-x64.tar.xz | tar -xJ -C /opt",
            f"ln -sf /opt/node-v{NODE_VERSION}-linux-x64/bin/node /usr/local/bin/node",
            "node --version",
        )
        # torch and torchvision from the CPU index (the CUDA one with a GPU chosen), then the rest of
        # web/requirements.txt as pinned (pip_install's index_url is passed as --index-url [imageref])
        .pip_install(*TORCH, index_url=TORCH_INDEX)
        # copy=True bakes the file into a layer, so build steps can follow it; without it a local file is only
        # mounted at container start and no build step may come after [images]
        .add_local_file(ROOT / "web" / "requirements.txt", "/tmp/teacher/requirements.txt", copy=True)
        .run_commands(
            "grep -v -E '^(torch|torchvision)==' /tmp/teacher/requirements.txt > /tmp/teacher/req.txt",
            "pip install --no-cache-dir -r /tmp/teacher/req.txt",
        )
    )
    if FINGERS:
        image = (
            image
            # opencv-contrib-python (a mediapipe dependency, not the headless build) loads libGL and glib at import
            .apt_install("libgl1", "libglib2.0-0")
            .add_local_file(ROOT / "web" / "requirements-fingers.txt", "/tmp/teacher/requirements-fingers.txt", copy=True)
            .add_local_file(LOCAL_HAND_MODEL, HAND_MODEL_PATH, copy=True)
            .run_commands(
                f"python -m venv {FINGERS_VENV}",
                f"{FINGERS_VENV}/bin/pip install --no-cache-dir -r /tmp/teacher/requirements-fingers.txt",
                f"echo '{HAND_MODEL_SHA256}  {HAND_MODEL_PATH}' | sha256sum -c -",
                # fail the build, not the first job, when the tracker cannot load or open its model
                f"{FINGERS_VENV}/bin/python -c \"import mediapipe as mp; from mediapipe.tasks.python import vision, BaseOptions; "
                f"vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(base_options=BaseOptions("
                f"model_asset_path='{HAND_MODEL_PATH}'), running_mode=vision.RunningMode.VIDEO, num_hands=2)); "
                f"print('mediapipe', mp.__version__)\"",
            )
        )
    image = (
        image.env(_server_env())
        # fail the build, not the first job, when something the pipeline imports cannot load (web/Dockerfile's
        # check without sam3, which only the local SAM backend imports, plus the server's own packages)
        .run_commands(
            "mkdir -p /tmp/numba && python -c \"import librosa.util.utils, meta_sam_parser, "
            "piano_transcription_inference.models, cv2, fastapi, uvicorn, websockets, python_multipart\"",
            "ffmpeg -version | head -1",
        )
        .workdir(WEB_DIR)                      # web/Dockerfile's WORKDIR: the server runs from web/ [imageref]
    )
    # The code goes in last, mounted at container start (copy=False, the default): a code change then needs no
    # image rebuild [images]. ignore is a dockerignore-style pattern list [imageref].
    for local, remote, ignore in local_adds():
        image = image.add_local_dir(local, remote, ignore=ignore)
    return image


# `modal deploy` imports this file on the deploying machine: stop there, before anything is built or sent, when the
# deploy would ship a broken app. In the container modal.is_local() is False and nothing is checked. check_deploy.py
# sets TEACHER_MODAL_CHECKING=1 to report the problems as failures instead.
if modal.is_local() and os.environ.get("TEACHER_MODAL_CHECKING") != "1":
    for _problem in deploy_problems():
        raise SystemExit(f"modal_app.py: {_problem}")

app = modal.App(APP_NAME)
image = build_image()
# version=2: "recommended for new Volumes but is not the default"; more files and higher throughput, which suits
# the data volume's many small per-frame files [volumes]
models_volume = modal.Volume.from_name(MODELS_VOLUME, create_if_missing=True, version=2)
data_volume = modal.Volume.from_name(DATA_VOLUME, create_if_missing=True, version=2)
# required_keys: the deploy fails when the secret has no TEACHER_TOKEN (the server refuses to listen without it)
secret = modal.Secret.from_name(SECRET_NAME, required_keys=SECRET_REQUIRED)
# the gate's secret, after the main one (later secrets win a shared name: checked on Modal 2026-11-04)
SECRETS = [secret] + ([modal.Secret.from_name(GATE_SECRET, required_keys=["TEACHER_GATE_TOKEN"])] if GATE_SECRET else [])


# ------------------------------------------------------------------ container start-up

def _log(msg):
    print(f"[modal_app] {msg}", flush=True)


def _check_models():
    tr = os.environ.get("PIANO_TRANSCRIPTION_CKPT", "")
    if not os.path.isfile(tr):
        msg = (f"missing on the models volume {MODELS_VOLUME!r}: {tr}; run deploy/modal/weights.sh "
               "(uploads would fail at the transcription step)")
        if REQUIRE_WEIGHTS:
            raise RuntimeError(msg + " - or deploy with TEACHER_MODAL_REQUIRE_WEIGHTS=0 for a demos-only app")
        _log("WARNING " + msg)


def _demos_dir():
    """The demos folder the server reads: the copy bundled at deploy, else an empty folder (the home page then shows
    no demos). Never a build here: see the module docstring."""
    if DEMOS_MODE == "bundle" and _has_demos(BUNDLED_DEMOS):
        _log(f"demos: the copy bundled at deploy ({BUNDLED_DEMOS})")
        return BUNDLED_DEMOS
    os.makedirs(NO_DEMOS, exist_ok=True)
    _log("demos: none shipped (TEACHER_MODAL_DEMOS=none, the default while they are not listed)" if DEMOS_MODE == "none"
         else f"demos: WARNING none in {BUNDLED_DEMOS}; the home page shows no demos")
    return NO_DEMOS


def _busy_jobs(server):
    """[(id, status, step, progress)] of the jobs queued or running in server.py's own job table."""
    with server.LOCK:
        return [(jid, j.get("status"), j.get("step"), j.get("progress")) for jid, j in server.JOBS.items()
                if isinstance(j, dict) and j.get("status") in ("queued", "running")]


class KeepAlive:
    """Decides, once per KEEPALIVE_S, whether to request this app's own URL. Modal stops a container that has had
    no input for scaledown_window [coldstart], and the worker thread is not an input: without a ping, a job whose
    player closed the page would be cut off after the window. It pings only while a job is queued or running AND
    the work is moving, so a hung job cannot keep the container billed forever (server.py's worker, pipeline.safe_run and
    video.py's subprocess calls set no per-job time limit). It stops when
      - the server's worker thread is no longer alive (it died of something that is not an Exception),
      - no queued or running job changed its status, step or progress for STALL_S,
      - or one job has been running for more than JOB_MAX_S;
    and starts again when the jobs change (a new upload, the next job). After it stops, the container scales down
    one window later and server.py queues the job again at the next start (at most twice per job: _requeue).
    decide() is pure (the jobs, the time, the worker's state in; ping or not and why out): check_deploy.py tests it."""

    def __init__(self, stall_s=STALL_S, job_max_s=JOB_MAX_S):
        self.stall_s, self.job_max_s = stall_s, job_max_s
        self.seen, self.changed = None, 0.0           # the busy jobs as last seen, and when they last changed
        self.run_id, self.run_since = None, 0.0       # the running job, and since when

    def decide(self, jobs, now, worker_alive=True):
        """jobs: [(id, status, step, progress)] queued or running. Returns (ping, why)."""
        if not jobs:
            self.seen = self.run_id = None
            return False, "idle"
        seen = sorted(repr(j) for j in jobs)
        if seen != self.seen:
            self.seen, self.changed = seen, now
        running = sorted(j[0] for j in jobs if j[1] == "running")
        rid = running[0] if running else None
        if rid != self.run_id:
            self.run_id, self.run_since = rid, now
        if not worker_alive:
            return False, "the server's worker thread has stopped"
        if now - self.changed > self.stall_s:
            return False, f"no queued or running job has moved for {self.stall_s / 60:g} min"
        if rid is not None and now - self.run_since > self.job_max_s:
            return False, f"a job has been running for more than {self.job_max_s / 3600:g} h"
        return True, "busy"


KEEPALIVE_STATE = {"why": "starting"}                # the last decision, reported by /api/modal/busy


def _own_url():
    u = os.environ.get("TEACHER_PUBLIC_URL", "").strip()
    if u:
        return u
    try:
        return modal.Function.from_name(APP_NAME, "web").get_web_url()
    except Exception as e:
        _log(f"keep-alive: no URL for this app ({type(e).__name__}); set TEACHER_PUBLIC_URL in the secret")
        return None


def _keepalive(server, worker):
    """Every KEEPALIVE_S: ask KeepAlive, and when it says so request /api/modal/busy on this app's own public URL
    (an input to this container, which resets Modal's idle timer). Idle, it sends nothing, so the app still scales
    to zero."""
    ka, url, said = KeepAlive(), None, None
    while True:
        time.sleep(KEEPALIVE_S)
        try:
            jobs = _busy_jobs(server)
        except Exception:
            jobs = []
        ping, why = ka.decide(jobs, time.time(), worker.is_alive() if worker is not None else True)
        KEEPALIVE_STATE["why"] = why
        if not ping:
            if why != "idle" and why != said:
                _log(f"keep-alive: stopped, {why}: the container stops {SCALEDOWN_S} s after the last request, and "
                     "server.py queues the job again at the next start")
            said = None if why == "idle" else why
            continue
        said = None
        url = url or _own_url()
        if not url:
            continue
        req = urllib.request.Request(url.rstrip("/") + BUSY_PATH,
                                     headers={"Authorization": "Bearer " + os.environ.get("TEACHER_TOKEN", "")})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                r.read(1)
        except Exception as e:
            _log(f"keep-alive: {type(e).__name__}: {e}")


def _with_busy(server):
    """server.app, plus GET /api/modal/busy: {"running": n, "queued": n, "keepAlive": why} from server.py's job table,
    with the same bearer token as the rest of the API. Answered here, in front of the app, so server.py is not
    changed and its static mount at "/" cannot shadow it. Every other request (and the lifespan) goes to server.app."""
    import hmac
    inner = server.app

    async def app(scope, receive, send):
        if scope.get("type") != "http" or scope.get("path") != BUSY_PATH:
            await inner(scope, receive, send)
            return
        token = os.environ.get("TEACHER_TOKEN", "")
        got = b""
        for k, v in scope.get("headers") or []:
            if k.lower() == b"authorization":
                got = v
        if not token or not hmac.compare_digest(got, f"Bearer {token}".encode("utf-8")):
            status, body = 401, {"detail": "a valid access token is needed"}
        elif scope.get("method") not in ("GET", "HEAD"):
            status, body = 405, {"detail": "GET only"}
        else:
            jobs = _busy_jobs(server)
            status, body = 200, {"running": sum(1 for j in jobs if j[1] == "running"),
                                 "queued": sum(1 for j in jobs if j[1] == "queued"),
                                 "keepAlive": KEEPALIVE_STATE["why"]}
        data = json.dumps(body).encode()
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(data)).encode()),
                                (b"cache-control", b"no-store")]})
        await send({"type": "http.response.body", "body": data if scope.get("method") != "HEAD" else b""})

    return app


def _gate_code(gate_token):
    """The judge code a gated visitor's requests carry (_with_gate adds it): derived from the gate token, so it is never
    stored anywhere and changes with it. A judge code, not the team token, so the judges' caps apply to everyone who has
    the password (TEACHER_JUDGE_UPLOADS a day, TEACHER_JUDGE_MAX_MB, TEACHER_JUDGE_MAX_S, TEACHER_JUDGE_AT_ONCE)."""
    import hashlib
    import hmac
    return "gate-" + hmac.new(gate_token.encode(), b"museverse-gate-judge-code", hashlib.sha256).hexdigest()[:40]


def _cookie(scope, name):
    for k, v in scope.get("headers") or []:
        if k.lower() == b"cookie":
            for part in v.decode("latin-1").split(";"):
                n, _, val = part.strip().partition("=")
                if n == name:
                    return val
    return ""


def _with_gate(inner, team_token, gate_token, visitor_code=None):
    """Every request (HTTP and WebSocket, every path) needs the gate cookie (muse_gate=TEACHER_GATE_TOKEN, set by the
    Vercel front once the password is typed; Vercel's /api rewrite passes it on) or the team's bearer token (the
    keep-alive, deploy.py's busy check, smoke.py); anything else is 401 and never reaches server.py. A gated request with
    neither a token nor a judge code of its own gets its browser's own code (visitor_code, server.gate_visitor_code, from the
    muse_visitor cookie, which is made and set here when the browser has none; without a signer, the shared _gate_code), so
    each browser that typed the password sees only its own takes, and /api/health tells the gated
    page that no code is asked for (judgeCode false), so the upload form shows no code field."""
    import hmac
    import re
    import secrets
    shared = _gate_code(gate_token).encode()
    want_auth = f"Bearer {team_token}".encode()
    vid_re = re.compile(r"[0-9a-f]{32}")

    async def app(scope, receive, send):
        if scope.get("type") not in ("http", "websocket"):
            await inner(scope, receive, send)
            return
        headers = list(scope.get("headers") or [])
        auth = next((v for k, v in headers if k.lower() == b"authorization"), b"")
        if auth and hmac.compare_digest(auth, want_auth):
            await inner(scope, receive, send)
            return
        got = _cookie(scope, GATE_COOKIE).encode("latin-1", "replace")
        if not (got and hmac.compare_digest(got, gate_token.encode())):
            if scope["type"] == "websocket":
                await receive()                                 # websocket.connect
                await send({"type": "websocket.close", "code": 4401})
                return
            data = b'{"detail": "the password is needed: open the site\'s own address and type it"}'
            await send({"type": "http.response.start", "status": 401,
                        "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(data)).encode()),
                                    (b"cache-control", b"no-store")]})
            await send({"type": "http.response.body", "body": data})
            return
        # this browser's own code (its visitor cookie, made now when it has none), or with no signer the shared one
        new_vid = None
        if not auth and not any(k.lower() == b"x-teacher-code" for k, _ in headers):
            if visitor_code:
                vid = _cookie(scope, VISITOR_COOKIE)
                if not vid_re.fullmatch(vid or ""):
                    vid = new_vid = secrets.token_hex(16)
                code = visitor_code(gate_token, vid).encode()
            else:
                code = shared
            scope = dict(scope, headers=headers + [(b"x-teacher-code", code)])
        if new_vid and scope["type"] == "http":
            set_vid = (f"{VISITOR_COOKIE}={new_vid}; Path=/; Max-Age={VISITOR_MAX_AGE_S}; HttpOnly; Secure; "
                       f"SameSite=Lax").encode()
            plain_send = send

            async def send(msg):                    # the new visitor id rides on the answer, so the browser keeps it
                if msg["type"] == "http.response.start":
                    msg = dict(msg, headers=list(msg.get("headers") or []) + [(b"set-cookie", set_vid)])
                await plain_send(msg)
        if scope["type"] != "http" or scope.get("path") != "/api/health" or scope.get("method") != "GET":
            await inner(scope, receive, send)
            return
        held = {}

        async def send_health(msg):                         # /api/health is small: hold it, say no code is asked for
            if msg["type"] == "http.response.start":
                held["start"] = msg
                return
            held["body"] = held.get("body", b"") + msg.get("body", b"")
            if msg.get("more_body"):
                return
            body = held["body"]
            try:
                h = json.loads(body)
                if isinstance(h, dict) and "judgeCode" in h:
                    # the gate admits this browser (its own code): the page asks for no code and no token (auth false),
                    # or an own-video upload would ask the judge for the team's token
                    h["judgeCode"] = False
                    h["auth"] = False
                    body = json.dumps(h).encode()
            except ValueError:
                pass
            start = dict(held["start"])
            start["headers"] = [(k, v) for k, v in start.get("headers") or [] if k.lower() != b"content-length"] + [
                (b"content-length", str(len(body)).encode())]
            await send(start)
            await send({"type": "http.response.body", "body": body})

        await inner(scope, receive, send_health)

    return app


def _start():
    """web/server.py's main(), unchanged, up to the point where it would start uvicorn; then server.app (wrapped)."""
    if not os.environ.get("TEACHER_TOKEN"):
        raise RuntimeError(f"TEACHER_TOKEN is not set: add it to the Modal secret {SECRET_NAME!r} (DEPLOY.md)")
    gate = os.environ.get("TEACHER_GATE_TOKEN", "") if GATE_SECRET else ""
    if GATE_SECRET and len(gate) < 32:              # fail closed: a gate that is configured but empty would open the app
        raise RuntimeError(f"TEACHER_GATE_TOKEN is missing or under 32 characters in the Modal secret {GATE_SECRET!r}")
    if gate:                                        # the gate's judge code, beside any the secret holds (server.main checks them)
        os.environ["TEACHER_JUDGE_CODE"] = ",".join(c for c in (os.environ.get("TEACHER_JUDGE_CODE", ""), _gate_code(gate)) if c)
    sys.path.insert(0, WEB_DIR)
    os.chdir(WEB_DIR)
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(SAMPLES_DIR, exist_ok=True)
    _check_models()
    demos = _demos_dir()
    os.environ["DEMOS_DIR"] = demos
    import uvicorn

    import server                             # web/server.py (sys.path[0] is web/)
    captured = {}
    real_run, real_argv = uvicorn.run, sys.argv
    uvicorn.run = lambda app_, **kw: captured.update(app=app_, kw=kw)
    sys.argv = ["server.py", "--host", "0.0.0.0", "--port", "8780", "--data", DATA_DIR, "--demos", demos, "--samples", SAMPLES_DIR]
    before = set(threading.enumerate())
    try:
        server.main()                         # every start-up check, the requeue, the worker and cleanup threads
    except SystemExit as e:                   # main() refuses a bad setting with SystemExit: make it a visible error
        raise RuntimeError(f"web/server.py refused to start: {e}") from None
    finally:
        uvicorn.run, sys.argv = real_run, real_argv
    if captured.get("app") is not server.app:
        raise RuntimeError("web/server.py main() returned without reaching uvicorn.run(app): its start-up changed; "
                           "update deploy/modal/modal_app.py")
    # threading.Thread(target=_worker) is named "Thread-N (_worker)" (Python 3.10 and later)
    worker = next((t for t in threading.enumerate() if t not in before and "_worker" in t.name), None)
    if worker is None:
        _log("WARNING keep-alive: server.py's worker thread was not found; the dead-worker check is off")
    # uvicorn.run's ws_max_size (1 MiB) does not apply here: Modal takes WebSocket messages up to 2 MiB [webhooks]
    threading.Thread(target=_keepalive, args=(server, worker), daemon=True, name="modal-keepalive").start()
    _log(f"ready: gpu {GPU_RAW if GPU else 'none (CPU)'}, data {DATA_DIR}, demos {demos} ({'listed' if SHOW_DEMOS == '1' else 'not listed'}), "
         f"samples {SAMPLES_DIR}, min_containers {MIN_CONTAINERS}, scaledown {SCALEDOWN_S} s, keep-alive every "
         f"{KEEPALIVE_S} s while a job moves")
    if gate:
        _log("password gate: on (every request needs the gate cookie or the team token)")
        return _with_gate(_with_busy(server), os.environ["TEACHER_TOKEN"], gate, getattr(server, "gate_visitor_code", None))
    _log("password gate: OFF (TEACHER_MODAL_GATE_SECRET=none): the modal.run URL is open to anyone who has it")
    return _with_busy(server)


@app.function(
    image=image,
    gpu=GPU,                                  # None by default (CPU only): nothing here runs on a GPU, the transcriber included [gpu]
    cpu=CPU,                                  # physical cores; ffmpeg, node and the transcriber run on the CPU
    memory=MEMORY_MB,                         # MiB [appref]; billed as max(request, usage) [resources]
    volumes={
        MODELS_DIR: models_volume.with_mount_options(read_only=True),   # read-only mount [volumes]
        # background commits every few seconds and a final one at shutdown [volumes]: uploads and results
        # persist, and a job a restart interrupted is queued again by server.py
        DATA_DIR: data_volume,
    },
    secrets=SECRETS,                          # injected as environment variables [secrets]; the gate's last
    max_containers=1,                         # one process holds the queue and the job states [scale]
    min_containers=MIN_CONTAINERS,            # 0 scales to zero; 1 keeps one warm [coldstart]
    scaledown_window=SCALEDOWN_S,             # default 60 s, at most 20 min [coldstart]
    # per input: the voice relay holds a WebSocket up to 30 minutes (server.py VOICE_MAX_S); the default is 300 s,
    # the range 1 s to 24 h [timeouts]. HTTP requests are capped at 150 s whatever this is [wtimeout]
    timeout=3600,
    startup_timeout=900,                      # the image pull and the factory below, with higher precedence [appref]
)
# Every request is an input to this one container: polls, media byte ranges, chat, the voice WebSocket.
# Sync endpoints run on threads, async ones on the event loop [concurrent].
@modal.concurrent(max_inputs=100)
@modal.asgi_app()                             # the function returns the ASGI app [webhooks]
def web():
    return _start()


# ------------------------------------------------------------------ the daily clean-up
# server.py deletes uploads, results and voice consents older than TEACHER_KEEP_DAYS from inside its own process (_cleanup:
# at start-up, then hourly), which runs only while the web container does, and with min_containers 0 that container is
# stopped between visits. This schedule runs the same _sweep on the data volume once a day whether anyone visits or not,
# with no secret, so what the page promises ("deleted 7 days after you upload it") holds to within a day. A
# schedule stops with `modal app stop`, so stopping the app means deleting the data volume too (DEPLOY.md, "After judging").
SWEEP_CRON = "41 3 * * *"                     # 03:41 UTC every day [cron]


@app.function(
    image=image,
    volumes={DATA_DIR: data_volume},          # the data volume only: no weights, no secret
    schedule=modal.Cron(SWEEP_CRON),          # [cron]
    cpu=1.0,
    memory=1024,
    timeout=600,
)
def sweep():
    """web/server.py's own _sweep(TEACHER_KEEP_DAYS) on the data volume, then commit, so the deletions reach the web container."""
    sys.path.insert(0, WEB_DIR)
    os.chdir(WEB_DIR)
    data_volume.reload()                      # what the web container last committed
    import server                             # web/server.py: its DATA is TEACHER_DATA, /data (the image env)
    keep_s = server._keep_days() * 86400
    before = [d for d in os.listdir(server.DATA) if server._is_id(d)] if os.path.isdir(server.DATA) else []
    server._sweep(keep_s)
    after = [d for d in os.listdir(server.DATA) if server._is_id(d)] if os.path.isdir(server.DATA) else []
    data_volume.commit()
    _log(f"sweep: {len(before) - len(after)} of {len(before)} job folders older than {keep_s / 86400:g} days deleted")
