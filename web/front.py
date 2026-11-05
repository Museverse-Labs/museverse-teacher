"""The Teacher's product front end : the lesson app's page, wired to this server, served at /.

    server.py: front.routes(app, sys.modules[__name__]) before it mounts static/ at /, when TEACHER_FRONT is "bench"
    (the default); TEACHER_FRONT=classic leaves the older static/ page at / as before.

The page is built by testbench/build_testbench.py --target product (the welcome, New test, the seven-step analysing
screen, the Library, the lesson theatre, the end chart), with testbench-server.js as its storage, so every call goes
to this server's API. In this repository the build is web/front/ (README.md). It is built afresh at start-up into
TEACHER_FRONT_DIR (replaced each time) or a temporary folder of the server's own, removed when it exits.

What this adds to the server:

  GET /                  the product page: the build's index.html in its document skeleton,
                         with <base href="front/">
  GET /front/splendid/   the Splendid Grand's samples (voicepack.routes), for the build's splendid-piano.js
  GET /front/<file>      the build's own files (its app.js, testbench*.js, ghost-assets.js, calibration.html, ...), served
                         as static/'s are (server._PageFiles: a script without its comments, vendor/ byte for byte). Every
                         other path (/app.js, how/, new/, models/, ...) stays static/'s, as before
  GET /classic/...       the Teacher's older page (static/), kept for comparison
  GET /api/jobs          the caller's takes, newest first, for the Library: with the token (or on an open local server)
                         every take in DATA, with a judge code its own uploads only (job.json codeId), else 401. Each is
                         server.py's own status (GET /api/jobs/{id}) plus what a Library row shows: the file's name, when it
                         was added, its piece, how much was analysed, and for a finished take its piece's title and composer,
                         what the lesson works on (its parts' titles), how many findings and the video's length. Nothing
                         else of a result leaves here: the lesson itself is GET /api/jobs/{id}/result, under its own access.
  GET /api/pieces/{piece}/score/{file}   the whole piece's engraving for the lesson's transport band (testbench-muse.js
                         bandBuild): score-geom.json (its tiles, bars and staves; no notes) and the tiles it lists, for the
                         pieces the upload form offers only (server._library: the Muse Teacher's supported pieces this server
                         may use), public and cacheable; any other piece or file is 404
"""
import atexit
import json
import os
import re
import shutil
import sys
import tempfile
import threading

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response

HERE = os.path.dirname(os.path.abspath(__file__))
TESTBENCH = os.path.join(HERE, "testbench")
LIST_MAX = 100                      # takes the Library is sent at most (the page's own limit, subscribeJobs)
_DIGESTS = {}                       # job id -> ((result.json mtime, size), its status and Library digest)
_LOCK = threading.Lock()


def mode():
    """TEACHER_FRONT: "bench" (the default: the lesson app at /) or "classic" (static/ at /, as before)."""
    v = (os.environ.get("TEACHER_FRONT") or "bench").strip().lower()
    if v not in ("bench", "classic"):
        raise SystemExit(f"TEACHER_FRONT must be bench or classic, not {v[:20]!r}")
    return v


TMP_PREFIX = "teacher-front-"


def _sweep(root):
    """Remove the build folders that servers no longer running left in root (named teacher-front-<pid>-...): each start
    used to leave one behind (about 8 MB), and nothing removed them. A folder whose server is alive is kept."""
    for name in os.listdir(root) if os.path.isdir(root) else []:
        parts = name[len(TMP_PREFIX):].split("-", 1) if name.startswith(TMP_PREFIX) else []
        if not parts or not parts[0].isdigit() or int(parts[0]) == os.getpid():
            continue
        try:
            os.kill(int(parts[0]), 0)
            continue                                 # its server is still running
        except ProcessLookupError:
            pass
        except OSError:
            continue                                 # someone else's process: not ours to judge
        shutil.rmtree(os.path.join(root, name), ignore_errors=True)


def build(out=None):
    """The product build in out (TEACHER_FRONT_DIR, else a temporary folder of this process's, removed when it exits, and
    the ones exited servers left swept first): build_testbench.build(target="product"), afresh at every start (about a
    second), so the page served is always this checkout's. Returns the folder."""
    out = out or os.environ.get("TEACHER_FRONT_DIR")
    if not out:
        root = tempfile.gettempdir()
        _sweep(root)
        out = tempfile.mkdtemp(prefix=f"{TMP_PREFIX}{os.getpid()}-")
        atexit.register(shutil.rmtree, out, True)
    out = os.path.abspath(out)
    sys.path.insert(0, TESTBENCH)
    import build_testbench
    build_testbench.build(out, target="product")
    return out


def _files(out):
    """The build's files by their published path ("app.js", "vendor/three-r128/three.min.js", ...), index.html apart."""
    found = []
    for d, _, fs in os.walk(out):
        for f in fs:
            rel = os.path.relpath(os.path.join(d, f), out).replace(os.sep, "/")
            if rel != "index.html":
                found.append(rel)
    return sorted(found)


def _digest(srv, jid, d):
    """server.py's status for a take and what its Library row shows. A finished take's is kept until its result.json
    changes, so a Library poll does not read every result again."""
    rp = os.path.join(d, "result.json")
    with srv.LOCK:
        live = jid in srv.JOBS and srv.JOBS[jid].get("status") in ("queued", "running")
    try:
        st = os.stat(rp)
        key = (st.st_mtime_ns, st.st_size)
    except OSError:
        key = None
    if key and not live:
        with _LOCK:
            got = _DIGESTS.get(jid)
        if got and got[0] == key:
            return got[1]
    out = dict(srv._status(jid))
    if out.get("status") == "done" and key:
        try:
            with open(rp) as f:
                r = json.load(f)
        except (OSError, ValueError):
            r = {}
        out["lesson"] = _lesson_digest(r)
        out["finished"] = os.path.getmtime(rp)
    if key and not live:
        with _LOCK:
            _DIGESTS[jid] = (key, out)
    return out


def _lesson_digest(r):
    """A finished take's Library line: its piece, what the lesson works on (each part's title), how many findings, the
    video's length. Titles only: they are the lesson's own words, already in musical terms."""
    L = r.get("lesson") if isinstance(r.get("lesson"), dict) else {}
    pc = L.get("piece") if isinstance(L.get("piece"), dict) else {}
    parts = L.get("parts") if isinstance(L.get("parts"), list) else []
    video = ((r.get("job") or {}).get("video") or {}) if isinstance(r.get("job"), dict) else {}
    titles = [p["title"][:80] for p in parts if isinstance(p, dict) and isinstance(p.get("title"), str) and p["title"].strip()]
    return dict(piece=dict(id=pc.get("id"), title=pc.get("title"), composer=pc.get("composer")) if pc.get("title") else None,
                toWorkOn=titles[:3], findings=len(r.get("findings") or []) if isinstance(r.get("findings"), list) else None,
                durationS=video.get("durationS") if isinstance(video.get("durationS"), (int, float)) else None)


def list_jobs(srv, request):
    """GET /api/jobs: see the module's docstring. 401 without the token or a judge code (the page then shows the samples)."""
    code = None
    if not srv._token_ok(request):
        code = srv._code_id(request)
        if not code:
            raise HTTPException(401, srv._need_access())
    data = srv.DATA
    rows = []
    for jid in os.listdir(data) if os.path.isdir(data) else []:
        d = os.path.join(data, jid)
        if not (srv._is_id(jid) and os.path.isdir(d)):
            continue
        job = srv._job_file(d)
        if code and job.get("codeId") != code:
            continue
        created = job.get("created") if isinstance(job.get("created"), (int, float)) else None
        rows.append((created or 0, jid, d, job))
    rows.sort(key=lambda x: (-x[0], x[1]))
    out = []
    for created, jid, d, job in rows[:LIST_MAX]:
        try:
            st = _digest(srv, jid, d)
        except HTTPException:
            continue
        opts = job.get("options") if isinstance(job.get("options"), dict) else {}
        out.append(dict(st, name=job.get("name") or st.get("name"), created=created or None, piece=job.get("piece"),
                        analysedS=job.get("analysedS"), windowS=opts.get("windowS"), startS=job.get("startS")))
    return out


PIECE_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")
PIECE_FILE = re.compile(r"score-geom\.json|tile-\d{2,3}\.webp")
PIECE_CACHE = "public, max-age=86400"


def piece_score(srv, pid, name):
    """GET /api/pieces/{piece}/score/{file}: see the module's docstring. A piece from another edition (Fur Elise's opening)
    is drawn with its engraving's tiles (score_assets.engraving), as its lesson's own window is."""
    if not (isinstance(pid, str) and PIECE_ID.fullmatch(pid) and isinstance(name, str) and PIECE_FILE.fullmatch(name)):
        raise HTTPException(404, "no such file")
    if pid not in {p.get("id") for p in srv._library()}:
        raise HTTPException(404, "no such piece")
    import score_assets as SA
    try:
        src, _ = SA.engraving(pid)
        g = SA.geom(src) if src else None
    except Exception:
        g = None
    if not g:
        raise HTTPException(404, "no score for this piece")
    if name == SA.GEOM:
        out = {k: g.get(k) for k in ("version", "ss", "height", "width", "tileW", "staves")}
        out["piece"] = pid
        out["tiles"] = [{k: t.get(k) for k in ("id", "file", "x0", "x1", "fromBar", "toBar", "kFrom", "kTo")} for t in g.get("tiles") or []]
        out["bars"] = [{k: b.get(k) for k in ("k", "m", "p", "x0", "x1", "pickup")} for b in g.get("bars") or []]
        return JSONResponse(out, headers={"Cache-Control": PIECE_CACHE})
    if name not in {t.get("file") for t in g.get("tiles") or []}:
        raise HTTPException(404, "no such file")
    root = os.path.realpath(os.path.join(HERE, "library")) + os.sep
    real = os.path.realpath(os.path.join(SA.score_dir(src), name))
    if not (real.startswith(root) and os.path.isfile(real)):
        raise HTTPException(404, "no such file")
    return FileResponse(real, media_type="image/webp", headers={"Cache-Control": PIECE_CACHE,
                                                                "Content-Security-Policy": "default-src 'none'; sandbox"})


class _Classic:
    """/classic/: static/'s files, and /classic/api/... handed to the app as /api/... (the older page's own API calls)."""

    def __init__(self, app, files):
        self.app, self.files = app, files

    async def __call__(self, scope, receive, send):
        if scope.get("type") in ("http", "websocket"):
            root, path = scope.get("root_path", ""), scope.get("path", "")
            sub = path[len(root):] if root and path.startswith(root) else path
            if sub.startswith("/api/"):
                return await self.app(dict(scope, path=sub, raw_path=sub.encode(), root_path=""), receive, send)
        return await self.files(scope, receive, send)


# the document the page goes in (testbench.js HEAD and RESET), with the build's
# folder as the base for every relative address in it; the page's own API calls go to "api/" beside the document
# (testbench-server.js and app.js resolve it against location.href, which the base does not change)
SKELETON = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,'
            'viewport-fit=cover"><base href="front/"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);'
            'padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}'
            'img{max-width:100%}[hidden]{display:none!important}</style></head><body>{page}</body></html>')


def routes(app, srv):
    """Add the product page, its files under /front/, the older page under /classic/ and GET /api/jobs to app (server.py's),
    before static/ is mounted at /: every other path stays static/'s."""
    out = build()
    with open(os.path.join(out, "index.html"), encoding="utf-8") as f:
        doc = SKELETON.replace("{page}", f.read()).encode("utf-8")

    @app.get("/api/jobs")
    def jobs(request: Request):
        return JSONResponse(list_jobs(srv, request))

    @app.get("/api/pieces/{pid}/score/{name}")
    def pieces_score(pid: str, name: str):
        return piece_score(srv, pid, name)

    def page():
        return Response(doc, media_type="text/html; charset=utf-8", headers={"Cache-Control": "no-cache"})

    app.add_api_route("/", page, methods=["GET"], include_in_schema=False)
    # the teacher page's own links inside the product (its home, How it works, What's new) resolve under front/: the
    # server's own pages, one folder up
    for sub, to in (("/front/", "../"), ("/front/how/", "../../how/"), ("/front/new/", "../../new/")):
        app.add_api_route(sub, (lambda to=to: RedirectResponse(to, status_code=302)), methods=["GET"], include_in_schema=False)
    # the Splendid Grand's samples beside the build's splendid-piano.js (it fetches splendid/ beside itself): every note the
    # lesson plays is that piano, never a synth; the same routes as the classic page's /splendid/
    try:
        import voicepack
        voicepack.routes(app, prefix="/front/splendid")
    except Exception as e:                       # no voice module in this build: the page says the piano did not load
        print(f"front: the piano's samples are not served under /front/splendid/ ({type(e).__name__}: {e})", flush=True)
    # the build's files, as static/'s are served (a script without its comments, vendor/ byte for byte)
    app.mount("/front", srv._PageFiles(directory=out, check_dir=False), name="front")
    # the older page, for comparison: static/ as server.py serves it, under /classic/. Its app.js asks "api/" beside the
    # page, so /classic/api/... is this server's /api/... (the same routes and the same access checks)
    static = os.path.join(HERE, "static")
    app.mount("/classic", _Classic(app, srv._PageFiles(directory=static, html=True, check_dir=False)), name="classic")
    app.state.front = dict(dir=out, files=_files(out))
    return out


__all__ = ["routes", "build", "list_jobs", "mode", "piece_score"]
