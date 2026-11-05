#!/usr/bin/env python3
"""Checks for meta_api.py against a local mock of Meta Model API (there is no API key here).

The mock (http.server in a thread) answers with the request and response shapes in Meta's docs saved on
2026-10-15, and every request the client sends is checked field by field against the documented one.
Test media are made with ffmpeg; frames carry their own index in their brightness, so the checks can
tell which frame was sent. The realtime speech-to-text WebSocket has its own mock (websockets, in a
thread): the handshake, the acknowledgement before audio, partials, the final transcript, error events
and close codes, as Meta's voice pages saved on 2026-10-21 describe them. Needs numpy, opencv and
websockets (the project venv). pytest finds the tests too.

    python test_meta_api.py
"""
import asyncio
import atexit
import base64
import io
import json
import logging
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
KEY = "LLM|0000000|not-a-real-key-for-tests"   # the docs' key shape: "LLM|0000000|not-a-real-key-for-tests"
os.environ["MODEL_API_KEY"] = KEY
import meta_api as M  # noqa: E402

# the mock has no rate limit: a pacer that never holds a request back (test_speed_sam.py checks the pacing itself)
M.PACER = M.RatePacer(rpm=1_000_000)

LOG = io.StringIO()
_h = logging.StreamHandler(LOG)
_h.setLevel(logging.DEBUG)
logging.getLogger().addHandler(_h)
logging.getLogger().setLevel(logging.DEBUG)
ERRORS = []   # every MetaAPIError text seen, checked for the key at the end
TMP = tempfile.mkdtemp(prefix="meta_api_test_")   # under $TMPDIR, removed at exit
atexit.register(shutil.rmtree, TMP, True)


# ------------------------------------------------------------------ mock server

class Mock:
    def __init__(self):
        self.requests, self.handler, self.lock = [], None, threading.Lock()
        mock = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _any(self):
                n = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(n) if n else b""
                path, _, query = self.path.partition("?")
                req = {"method": self.command, "path": path, "query": dict(x.split("=", 1) for x in query.split("&") if "=" in x),
                       "headers": {k.lower(): v for k, v in self.headers.items()}, "body": body}
                with mock.lock:
                    mock.requests.append(req)
                spec = mock.handler(req) if mock.handler else {"status": 404, "body": b""}
                time.sleep(spec.get("delay", 0))
                self.send_response(spec.get("status", 200))
                for k, v in spec.get("headers", {}).items():
                    self.send_header(k, v)
                if "sse" in spec:
                    self.send_header("Content-Type", "text/event-stream")
                    self.end_headers()
                    for item in spec["sse"]:
                        if isinstance(item, float):
                            time.sleep(item)
                            continue
                        self.wfile.write(item.encode())
                        self.wfile.flush()
                    return
                body = spec.get("body", b"")
                if isinstance(body, (dict, list)):
                    body = json.dumps(body).encode()
                    self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            do_GET = do_POST = do_DELETE = _any

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.srv.daemon_threads = True
        self.srv.handle_error = lambda *a: None   # a client that gave up (the timeout tests) breaks the pipe
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.srv.server_port}/v1"

    def reset(self, handler):
        with self.lock:
            self.requests = []
        self.handler = handler
        os.environ["META_API_BASE"] = self.base


MOCK = Mock()


def ev(data, name=None):
    """One server-sent event as the docs' requests example reads it ("data: " + JSON)."""
    return (f"event: {name or data['type']}\n" if isinstance(data, dict) else "") + "data: " + (
        data if isinstance(data, str) else json.dumps(data)) + "\n\n"


def sam_stream(lines, split=None):
    """A Responses stream carrying SAM output: one response.output_text.delta per frame line
    (docs/sam/reading-segmentation), or the joined text cut into pieces of `split` characters, then
    response.completed and [DONE]."""
    text = "".join(lines)
    out = [ev({"type": "response.created", "response": {"id": "resp_1", "object": "response", "status": "in_progress"}}),
           ev({"type": "response.in_progress", "response": {"id": "resp_1", "status": "in_progress"}})]
    chunks = [text[i:i + split] for i in range(0, len(text), split)] if split else lines
    out += [ev({"type": "response.output_text.delta", "item_id": "msg_1", "output_index": 0, "content_index": 0,
                "delta": c}) for c in chunks]
    out.append(ev({"type": "response.completed", "response": {
        "id": "resp_1", "object": "response", "status": "completed", "model": "sam-3.1",
        "output": [{"id": "msg_1", "type": "message", "role": "assistant", "status": "completed",
                    "content": [{"type": "output_text", "text": text, "annotations": []}]}]}}))
    out.append("data: [DONE]\n\n")
    return out


def rec(oid, x1, y1, x2, y2, w, h, enc="!", payload="!!!!J!0c[q"):
    return (f"{oid}<|box;x1={x1};y1={y1};x2={x2};y2={y2};w={w};h={h}|>"
            f"<|mask;x=0;y=0;data={y2 - y1 + 1},{x2 - x1 + 1},{enc}{payload}|>")


def responses_body(req):
    j = json.loads(req["body"])
    return j, j["input"][0]["content"]


def check_sam_request(req, prompt, kind, stream=True):
    """The documented SAM 3.1 request (docs/sam/overview, docs/sam/segmenting)."""
    assert req["method"] == "POST" and req["path"] == "/v1/responses", (req["method"], req["path"])
    assert req["headers"]["authorization"] == f"Bearer {KEY}"
    assert req["headers"]["user-agent"] == M.USER_AGENT, req["headers"].get("user-agent")   # not Python-urllib
    assert req["headers"]["content-type"] == "application/json"
    assert req["headers"]["accept"] == ("text/event-stream" if stream else "application/json")
    j, content = responses_body(req)
    assert j["model"] == "sam-3.1" and j["stream"] is stream and j["metadata"] == {"mask_encoding": "one_bit"}, j
    assert j["store"] is False
    assert len(j["input"]) == 1 and j["input"][0]["type"] == "message" and j["input"][0]["role"] == "user"
    assert content[0] == {"type": "input_text", "text": prompt}, content[0]
    assert content[1]["type"] == kind and len(content) == 2
    return content[1]


def must_raise(fn, cls=M.MetaAPIError):
    try:
        fn()
    except cls as e:
        if isinstance(e, M.MetaAPIError):
            ERRORS.append(str(e))
        return e
    raise AssertionError(f"{fn} did not raise {cls.__name__}")


# ------------------------------------------------------------------ media

def ff(*args):
    p = subprocess.run(["ffmpeg", "-y", "-v", "error"] + list(args), capture_output=True, text=True)
    assert p.returncode == 0, p.stderr


def make_video(name, n=20, fps=10, vfr=False, audio=True, ext="mp4", codec=("-c:v", "libx264", "-bf", "2", "-g", "5")):
    """n frames whose luma is 16 + 10 k at frame k, with B-frames; vfr inserts a 0.05 s gap after frame 9."""
    path = os.path.join(TMP, f"{name}.{ext}")
    if os.path.exists(path):
        return path
    vf = "geq=lum='16+10*N':cb=128:cr=128"
    if vfr:   # filter and encoder at 1 ms, or the 0.05 s gap is rounded to the 1/10 s frame grid
        vf += ",settb=1/1000,setpts=(N/10+gte(N\\,10)*0.05)/TB"
    args = ["-f", "lavfi", "-i", f"nullsrc=s=96x64:r={fps}:d={n / fps}", "-vf", vf]
    if audio:
        args = ["-f", "lavfi", "-i", f"nullsrc=s=96x64:r={fps}:d={n / fps}", "-f", "lavfi", "-i",
                f"sine=f=440:d={n / fps}", "-map", "0:v", "-map", "1:a", "-vf", vf]
    args += list(codec) + ["-pix_fmt", "yuv420p", "-frames:v", str(n)]
    if vfr:
        args += ["-fps_mode", "vfr", "-enc_time_base", "1:1000"]
    if audio and ext == "mp4":
        args += ["-c:a", "aac"]
    ff(*args, path)
    return path


def frame_no(png_bytes):
    import cv2
    img = cv2.imdecode(np.frombuffer(png_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
    return int(round(float(img.mean()) / (10 * 255 / 219)))   # limited-range luma 16 + 10 k -> gray 11.64 k


def data_url_bytes(url, mime):
    assert url.startswith(f"data:{mime};base64,"), url[:40]
    return base64.b64decode(url.split(",", 1)[1])


# ------------------------------------------------------------------ wire format

DOC_VIDEO_LINE = ("<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>"
                  ",1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>")
DOC_IMAGE_LINE = ("<0f>0<|box;x1=353;y1=382;x2=453;y2=427;w=537;h=561|><|mask;x=0;y=0;data=46,101,~...|>"
                  ",1<|box;x1=260;y1=382;x2=340;y2=427;w=537;h=561|><|mask;x=0;y=0;data=46,81,~...|>"
                  ",2<|box;x1=516;y1=117;x2=536;y2=150;w=537;h=561|><|mask;x=0;y=0;data=34,21,~...|>")


def test_parse_documented_lines():
    # docs/sam/reading-segmentation "Video output grammar" (payloads complete) and "Image output grammar"
    fr, diag = M.parse_segmentation(DOC_VIDEO_LINE)
    assert not diag and len(fr) == 1 and fr[0]["frame_index"] == 0 and (fr[0]["width"], fr[0]["height"]) == (320, 334)
    a, b = fr[0]["objects"]
    assert a["id"] == 0 and a["box"] == [211, 228, 271, 255] and a["mask_hw"] == [27, 60] and a["mask_encoding"] == "lossless"
    assert a["mask_payload"] == "!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x("
    assert b["id"] == 1 and b["box"] == [155, 228, 203, 255] and b["mask_hw"] == [27, 48]
    # the documented raster is the box with inclusive corners: H = y2 - y1 + 1, W = x2 - x1 + 1
    for o in (a, b):
        assert o["mask_hw"] == [o["box"][3] - o["box"][1], o["box"][2] - o["box"][0]]
    fr, diag = M.parse_segmentation(DOC_IMAGE_LINE)
    assert [o["id"] for o in fr[0]["objects"]] == [0, 1, 2] and not diag
    for o in fr[0]["objects"]:
        assert o["mask_hw"] == [o["box"][3] - o["box"][1], o["box"][2] - o["box"][0]], o


def test_parse_sparse_frames_ids_and_bad_records():
    # "indices can skip ... <0f>, <2f>" and "a line can carry a sparse set like 0, 2"
    text = ("<0f>" + rec(0, 1, 1, 4, 4, 10, 10) + "," + rec(2, 5, 5, 6, 6, 10, 10, payload="a~b!c")
            + "\n<2f>" + rec(2, 5, 5, 7, 7, 10, 10) + ",garbage"
            + "\n<3f>7<|box;x1=9;y1=9;x2=3;y2=3;w=10;h=10|><|mask;x=0;y=0;data=1,1,!x|>")
    fr, diag = M.parse_segmentation(text)
    assert [f["frame_index"] for f in fr] == [0, 2, 3]
    assert [o["id"] for o in fr[0]["objects"]] == [0, 2] and fr[0]["objects"][1]["mask_payload"] == "a~b!c"
    assert fr[0]["objects"][0]["mask_encoding"] == "one_bit"
    assert len(fr[1]["objects"]) == 1 and any("garbage" in d for d in diag), diag
    assert fr[2]["objects"] == [] and any("empty box" in d for d in diag)
    assert M.parse_segmentation("") == ([], [])


# ------------------------------------------------------------------ frames and time

def showinfo_times(path):
    """Decoded frame times as ffmpeg's filter graph sees them (what video.py uses), t = 0 at the first."""
    p = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-i", path, "-map", "0:v:0", "-vf", "showinfo",
                        "-fps_mode", "passthrough", "-f", "null", "-"], capture_output=True, text=True)
    tb = re.search(r"config in time_base:\s*(\d+)/(\d+)", p.stderr)
    pts = [int(m[1]) for m in re.finditer(r"\bn:\s*\d+\s+pts:\s*(-?\d+)", p.stderr)]
    return [round((x - pts[0]) * int(tb[1]) / int(tb[2]), 6) for x in pts]


def test_frame_times_match_decoded_frames():
    for name, kw in (("cfr", {}), ("vfr", {"vfr": True})):
        v = make_video(name, **kw)
        info = M.probe_video(v)
        dec = showinfo_times(v)
        assert len(info["frame_times"]) == len(dec) == 20, (name, len(info["frame_times"]), len(dec))
        assert max(abs(a - b) for a, b in zip(info["frame_times"], dec)) < 1e-4, (name, info["frame_times"], dec)
        assert info["codec"] == "h264" and (info["width"], info["height"]) == (96, 64)
    assert abs(M.probe_video(make_video("vfr", vfr=True))["frame_times"][10] - 1.05) < 1e-4


def test_video_only_copy_keeps_frames():
    v = make_video("cfr")
    d = tempfile.mkdtemp(dir=TMP)
    out = M._mp4_for_sam(v, M.probe_video(v), d)
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", out],
                       capture_output=True, text=True)
    assert p.stdout.split() == ["video"], p.stdout   # the audio never goes to SAM
    assert M.probe_video(out)["frame_times"] == M.probe_video(v)["frame_times"]


# ------------------------------------------------------------------ sam_segment_video

def video_lines(n=20, skip=(7,), w=96, h=64):
    return [f"<{k}f>" + rec(0, k, 2, k + 9, 11, w, h) + "," + rec(3, 40, 20, 59, 39, w, h) + "\n"
            for k in range(n) if k not in skip]


def test_video_inline_stream():
    v = make_video("cfr")
    MOCK.reset(lambda r: {"sse": sam_stream(video_lines(), split=37)})   # deltas cut mid-token
    got = []
    fr = M.sam_segment_video(v, "hand", on_frame=got.append)
    assert len(MOCK.requests) == 1
    part = check_sam_request(MOCK.requests[0], "hand", "input_video")
    clip = data_url_bytes(part["video_url"], "video/mp4")
    cp = os.path.join(TMP, "sent.mp4")
    open(cp, "wb").write(clip)
    assert M.probe_video(cp)["frame_times"] == M.probe_video(v)["frame_times"]   # the frames sent are the file's
    assert [f["frame_index"] for f in fr] == [k for k in range(20) if k != 7] and len(got) == 19
    f3 = fr[3]
    assert f3["time_s"] == 0.3 and (f3["width"], f3["height"]) == (96, 64) and not f3["capped"]
    assert [o["id"] for o in f3["objects"]] == [0, 3] and f3["objects"][0]["box"] == [3, 2, 13, 12]
    assert f3["objects"][0]["score"] is None and f3["objects"][0]["mask"] is None   # no decoder installed


def test_video_upload_by_file_id_then_delete():
    v = make_video("cfr")

    def h(r):
        if r["path"] == "/v1/files" and r["method"] == "POST":
            # docs/sam/segmenting "Example upload response"
            return {"body": {"id": "file-842549258569145", "object": "file", "bytes": len(r["body"]), "created_at": 1714502400,
                             "filename": "clip.mp4", "purpose": "user_data", "status": "uploaded", "expires_at": 1714506000}}
        if r["path"] == "/v1/files/file-842549258569145" and r["method"] == "DELETE":
            return {"body": {"id": "file-842549258569145", "object": "file", "deleted": True}}
        return {"sse": sam_stream(video_lines())}
    MOCK.reset(h)
    fr = M.sam_segment_video(v, "piano keyboard", upload=True)
    up, resp, dele = MOCK.requests
    assert up["headers"]["authorization"] == f"Bearer {KEY}"
    parts = parse_multipart(up["body"], up["headers"]["content-type"])
    # docs/file-handling: purpose and expires_after first, "make file the final multipart part"
    assert [p["name"] for p in parts] == ["purpose", "expires_after[anchor]", "expires_after[seconds]", "file"]
    assert parts[0]["data"] == b"user_data" and parts[1]["data"] == b"created_at" and parts[2]["data"] == b"3600"
    assert parts[3]["type"] == "video/mp4" and parts[3]["filename"] == "clip.mp4" and parts[3]["data"][4:8] == b"ftyp"
    assert check_sam_request(resp, "piano keyboard", "input_video") == {"type": "input_video", "file_id": "file-842549258569145"}
    assert dele["method"] == "DELETE" and dele["path"] == "/v1/files/file-842549258569145"
    assert len(fr) == 19


def test_video_zero_matches_and_non_stream():
    v = make_video("cfr")
    MOCK.reset(lambda r: {"sse": sam_stream([])})   # "the stream completes with an empty output_text"
    assert M.sam_segment_video(v, "violin") == []
    full = "".join(video_lines(skip=()))
    # docs/protocols/responses "Example response" shape
    MOCK.reset(lambda r: {"body": {"id": "resp_2", "object": "response", "status": "completed", "model": "sam-3.1",
                                   "output": [{"id": "msg_2", "type": "message", "role": "assistant", "status": "completed",
                                               "content": [{"type": "output_text", "text": full, "annotations": []}]}]}})
    fr = M.sam_segment_video(v, "hand", stream=False)
    check_sam_request(MOCK.requests[0], "hand", "input_video", stream=False)
    assert len(fr) == 20 and fr[19]["time_s"] == 1.9


def test_video_url_and_cap():
    lines = ["<0f>" + ",".join(rec(i, i, 0, i, 0, 64, 48) for i in range(16)) + "\n", "<1f>" + rec(0, 1, 1, 2, 2, 64, 48)]
    MOCK.reset(lambda r: {"sse": sam_stream(lines)})
    fr = M.sam_segment_video("https://example.com/clip.mp4", "black piano key")
    assert check_sam_request(MOCK.requests[0], "black piano key", "input_video") == {
        "type": "input_video", "video_url": "https://example.com/clip.mp4"}
    assert fr[0]["capped"] and not fr[1]["capped"] and fr[0]["time_s"] is None


def test_video_refused_before_sending():
    MOCK.reset(lambda r: {"sse": sam_stream([])})
    webm = make_video("vp9", audio=False, ext="webm", codec=("-c:v", "libvpx-vp9", "-b:v", "200k"))
    e = must_raise(lambda: M.sam_segment_video(webm, "hand"), ValueError)
    assert "vp9" in str(e)
    v = make_video("cfr")
    old = M.MAX_VIDEO_FRAMES, M.INLINE_MAX
    try:
        M.MAX_VIDEO_FRAMES = 10
        assert "15,000" not in str(must_raise(lambda: M.sam_segment_video(v, "hand"), ValueError))
        M.MAX_VIDEO_FRAMES, M.INLINE_MAX = 15000, 100        # ZDR: no uploads, and the clip is over the inline limit
        assert "inline" in str(must_raise(lambda: M.sam_segment_video(v, "hand", upload=False), ValueError))
    finally:
        M.MAX_VIDEO_FRAMES, M.INLINE_MAX = old
    assert MOCK.requests == []


# ------------------------------------------------------------------ errors

def test_http_errors_and_retries():
    v = make_video("cfr")
    # docs/sam/segmenting "Handle errors": 404 with code model_not_found, not retried
    MOCK.reset(lambda r: {"status": 404, "body": {"error": {"code": "model_not_found", "message": "The requested model was not found.",
                                                            "param": None, "type": "invalid_request_error"}}})
    e = must_raise(lambda: M.sam_segment_video(v, "hand"))
    assert (e.status, e.code, e.type) == (404, "model_not_found", "invalid_request_error") and len(MOCK.requests) == 1
    assert "HTTP 404" in str(e) and "model_not_found" in str(e) and "The requested model was not found." in str(e)
    # docs/error-handling: 404 on an unknown path has an empty body
    MOCK.reset(lambda r: {"status": 404, "body": b""})
    assert "no error body" in str(must_raise(lambda: M.sam_segment_image(make_png(), "hand")))
    # 503 service_overloaded with Retry-After, then success: retried once
    n = [0]

    def h(r):
        n[0] += 1
        if n[0] == 1:
            return {"status": 503, "headers": {"Retry-After": "0"}, "body": {"error": {
                "message": "The backend is temporarily overloaded. Please retry.", "type": "server_error", "param": None,
                "code": "service_overloaded"}}}
        return {"sse": sam_stream(video_lines())}
    MOCK.reset(h)
    assert len(M.sam_segment_video(v, "hand")) == 19 and len(MOCK.requests) == 2
    # 429 three times: two retries, then the error with Meta's body
    MOCK.reset(lambda r: {"status": 429, "headers": {"Retry-After": "0"}, "body": {"error": {
        "message": "Rate limit exceeded. Please retry after 15 seconds.", "type": "rate_limit_error", "param": None,
        "code": "rate_limit_exceeded"}}})
    e = must_raise(lambda: M.sam_segment_image(make_png(), "hand"))
    assert e.status == 429 and e.code == "rate_limit_exceeded" and e.retry_after == "0" and len(MOCK.requests) == 3
    # 401 is not retried; a server that echoes the key back still never shows it
    MOCK.reset(lambda r: {"status": 401, "body": {"error": {"message": f"Unauthorized: {r['headers']['authorization']}",
                                                            "type": "authentication_error", "param": None, "code": "invalid_api_key"}}})
    e = must_raise(lambda: M.sam_segment_image(make_png(), "hand"))
    assert e.code == "invalid_api_key" and len(MOCK.requests) == 1 and KEY not in str(e) and KEY not in (e.body or "")
    # 504 gateway_timeout: "Do not simply retry"
    MOCK.reset(lambda r: {"status": 504, "body": {"error": {"message": "Request exceeded the non-streaming server time limit",
                                                            "type": "server_error", "param": None, "code": "gateway_timeout"}}})
    assert must_raise(lambda: M.sam_segment_image(make_png(), "hand", stream=False)).code == "gateway_timeout"
    assert len(MOCK.requests) == 1


def test_stream_errors():
    v = make_video("cfr")
    head = sam_stream(video_lines()[:3])[:5]
    # docs/error-handling "Streaming errors": the "error" event (code at the top level) ...
    MOCK.reset(lambda r: {"sse": head + [ev({"type": "error", "code": "server_shutting_down",
                                             "message": "Server is shutting down. Please retry your request."})]})
    e = must_raise(lambda: M.sam_segment_video(v, "hand"))
    assert e.status == 200 and e.code == "server_shutting_down" and "<0f>" in e.partial
    # ... and response.failed (error inside the response object)
    MOCK.reset(lambda r: {"sse": head + [ev({"type": "response.failed", "response": {
        "id": "resp_1", "status": "failed", "error": {"code": "server_error", "message": "The model failed."}}})]})
    e = must_raise(lambda: M.sam_segment_video(v, "hand"))
    assert e.type == "response_failed" and e.code == "server_error"
    MOCK.reset(lambda r: {"sse": head + [ev({"type": "response.incomplete", "response": {
        "id": "resp_1", "status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"}}})]})
    assert "max_output_tokens" in str(must_raise(lambda: M.sam_segment_video(v, "hand")))
    MOCK.reset(lambda r: {"sse": head})   # the stream ends with no terminal event ("eof")
    assert must_raise(lambda: M.sam_segment_video(v, "hand")).type == "incomplete"


def test_timeouts():
    MOCK.reset(lambda r: {"delay": 1.5, "sse": sam_stream([])})
    e = must_raise(lambda: M.sam_segment_image(make_png(), "hand", timeout=0.5))
    assert e.type == "timeout" and e.status is None
    MOCK.reset(lambda r: {"sse": sam_stream(["<0f>" + rec(0, 1, 1, 2, 2, 8, 8)])[:3] + [1.5] + sam_stream([])[2:]})
    e = must_raise(lambda: M.sam_segment_image(make_png(), "hand", timeout=0.5))
    assert e.type == "timeout" and "<0f>" in e.partial


def test_key_and_base_guards():
    MOCK.reset(lambda r: {"sse": sam_stream([])})
    try:
        os.environ["META_API_BASE"] = "https://api.example.com/v1"
        assert must_raise(lambda: M.sam_segment_image(make_png(), "hand")).type == "bad_base"
        os.environ["META_API_BASE"] = "http://api.meta.ai/v1"    # not https
        assert must_raise(lambda: M.sam_segment_image(make_png(), "hand")).type == "bad_base"
        os.environ["META_API_BASE"] = MOCK.base
        del os.environ["MODEL_API_KEY"]
        assert must_raise(lambda: M.sam_segment_image(make_png(), "hand")).type == "no_key"
    finally:
        os.environ["MODEL_API_KEY"] = KEY
        os.environ["META_API_BASE"] = MOCK.base
    assert MOCK.requests == []
    # a redirect is not followed (urllib would resend the Authorization header to the new host)
    other = Mock()
    other.reset(lambda r: {"sse": sam_stream([])})
    MOCK.reset(lambda r: {"status": 307, "headers": {"Location": other.base + "/responses"}, "body": b""})
    assert must_raise(lambda: M.sam_segment_image(make_png(), "hand")).status == 307
    assert other.requests == [] and len(MOCK.requests) == 1
    other.srv.shutdown()


# ------------------------------------------------------------------ images

def make_png(k=5):
    path = os.path.join(TMP, f"img{k}.png")
    if not os.path.exists(path):
        ff("-f", "lavfi", "-i", f"nullsrc=s=96x64:d=0.1,geq=lum='16+10*{k}':cb=128:cr=128", "-frames:v", "1", path)
    return path


def test_image():
    png = make_png(5)
    MOCK.reset(lambda r: {"sse": sam_stream([DOC_IMAGE_LINE])})
    r = M.sam_segment_image(png, "button")
    part = check_sam_request(MOCK.requests[0], "button", "input_image")
    assert frame_no(data_url_bytes(part["image_url"], "image/png")) == 5
    assert (r["width"], r["height"]) == (537, 561) and [o["id"] for o in r["objects"]] == [0, 1, 2]
    MOCK.reset(lambda r: {"sse": sam_stream([])})
    assert M.sam_segment_image("https://example.com/street.png", "yellow school bus")["objects"] == []
    assert check_sam_request(MOCK.requests[0], "yellow school bus", "input_image")["image_url"] == "https://example.com/street.png"
    assert "PNG, JPEG" in str(must_raise(lambda: M.sam_segment_image(os.path.join(TMP, "x.tiff"), "hand"), ValueError))


# ------------------------------------------------------------------ records

def records_mock(cap_frame=None):
    """Video prompts: a box whose x1 is the frame index (frame 7 has no line). Image prompts: a box
    whose x1 is the frame number read back from the image's brightness."""
    def h(r):
        if r["path"] == "/v1/files":
            if r["method"] == "POST":
                return {"body": {"id": "file-111", "object": "file", "bytes": 1, "created_at": 1714502400,
                                 "filename": "clip.mp4", "purpose": "user_data", "status": "uploaded"}}
        if r["path"] == "/v1/files/file-111":
            return {"body": {"id": "file-111", "object": "file", "deleted": True}}
        j, content = responses_body(r)
        if content[1]["type"] == "input_image":
            k = frame_no(data_url_bytes(content[1]["image_url"], "image/png"))
            return {"sse": sam_stream([f"<0f>{rec(0, k, 1, k + 2, 30, 96, 64)},{rec(1, 50, 1, 52, 30, 96, 64)}"])}
        lines = video_lines()
        if cap_frame is not None:
            lines[cap_frame] = f"<{cap_frame}f>" + ",".join(rec(i, i, 0, i, 0, 96, 64) for i in range(16)) + "\n"
        return {"sse": sam_stream(lines)}
    return h


SEGMENT_KEYS = {"image", "width", "height", "model", "prompts", "timing_ms", "tiles"}


class no_parser:
    """No mask decoder for the block, whether or not meta_sam_parser is installed here: the mocks' payloads are
    not real masks, and a test of the box fallback must not depend on what this machine has."""

    def __enter__(self):
        self.saved = dict(M._PARSER), M.MASK_DECODER
        M._PARSER["fn"], M.MASK_DECODER = None, None

    def __exit__(self, *exc):
        M._PARSER.clear()
        M._PARSER.update(self.saved[0])
        M.MASK_DECODER = self.saved[1]


def test_records_format_and_frame_mapping():
    with no_parser():
        _records_format_and_frame_mapping()


def _records_format_and_frame_mapping():
    v = make_video("cfr")
    out = tempfile.mkdtemp(dir=TMP)
    MOCK.reset(records_mock(cap_frame=3))
    times = [0.0, 0.33, 0.71, 1.9]   # nearest frames 0, 3, 7 (no line: no matches), 19
    prompts = ["piano keyboard", "black piano key", "hand"]
    seen = []
    s = M.sam_video_to_records(v, times, prompts, out, progress=lambda a, b: seen.append((a, b)))
    reqs = MOCK.requests
    kinds = [(r["method"], r["path"], responses_body(r)[1][1]["type"] if r["path"] == "/v1/responses" else None) for r in reqs]
    # the clip is deleted as soon as its video prompts have answered (on a thread of its own): after them,
    # while the black-key requests may still be going
    assert kinds.count(("POST", "/v1/files", None)) == 1 and kinds.count(("DELETE", "/v1/files/file-111", None)) == 1
    last_video = max(i for i, k in enumerate(kinds) if k == ("POST", "/v1/responses", "input_video"))
    assert kinds.index(("DELETE", "/v1/files/file-111", None)) > last_video, kinds
    vid = [r for r in reqs if r["path"] == "/v1/responses" and responses_body(r)[1][1]["type"] == "input_video"]
    img = [r for r in reqs if r["path"] == "/v1/responses" and responses_body(r)[1][1]["type"] == "input_image"]
    assert sorted(responses_body(r)[1][0]["text"] for r in vid) == ["hand", "piano keyboard"]   # one request per concept, at once
    assert all(responses_body(r)[1][1] == {"type": "input_video", "file_id": "file-111"} for r in vid)
    assert len(img) == 4 and all(responses_body(r)[1][0]["text"] == "black piano key" for r in img)
    assert s["videoRequests"] == 2 and s["imageRequests"] == 4 and s["uploaded"] and s["maxDtS"] == 0.03
    assert s["estCost"] == M.est_cost(20, 2, 4) and seen[-1] == (6, 6)
    assert s["masks"]["decoded"] == 0 and "not decoded" in s["maskNote"]
    assert s["capped"] == {"piano keyboard": [3], "hand": [3]} and any("16-object" in w for w in s["warnings"])
    files = sorted(os.listdir(out))
    assert files == ["rf_0001.sam.json", "rf_0002.sam.json", "rf_0003.sam.json", "rf_0004.sam.json"], files
    recs = [json.load(open(os.path.join(out, f))) for f in files]
    for k, r in enumerate(recs):
        assert SEGMENT_KEYS <= set(r) and r["image"] == f"rf_{k + 1:04d}.jpg" and (r["width"], r["height"]) == (96, 64)
        assert list(r["prompts"]) == prompts and r["tiles"] == 1
        for dets in r["prompts"].values():
            for d in dets:
                assert {"score", "box", "polygon", "area"} <= set(d) and d["score"] == 1.0 and d["mask"] == "box"
    assert [r["source"]["videoFrame"] for r in recs] == [0, 3, 7, 19]
    assert recs[1]["source"]["dtS"] == -0.03
    # the nearest frame, and its line: frame 0's hand box starts at x 0, frame 19's at 19
    assert recs[0]["prompts"]["hand"][0]["box"] == [0, 2, 10, 12] and recs[3]["prompts"]["hand"][0]["box"][0] == 19
    assert recs[2]["prompts"]["hand"] == [] and recs[2]["prompts"]["piano keyboard"] == []   # frame 7 sent no line
    assert len(recs[1]["prompts"]["hand"]) == 16   # the capped frame, kept as sent
    # the black keys came from the right frames, cut losslessly from the video
    assert [r["prompts"]["black piano key"][0]["box"][0] for r in recs] == [0, 3, 7, 19]
    d = recs[0]["prompts"]["hand"][0]   # box [0, 2, 10, 12] -> pixel centres 0..9, 2..11
    assert d["polygon"] == [[0, 2], [9, 2], [9, 11], [0, 11]] and d["area"] == 100


def test_records_from_a_clip_of_the_analysed_frames():
    """clip="frames": SAM's video is the analysed frames themselves at CLIP_FPS, so record k takes SAM's frame k
    (no matching by time), the cost counts those frames only, and the clip sent has exactly them."""
    v = make_video("cfr")
    out = tempfile.mkdtemp(dir=TMP)
    MOCK.reset(records_mock())
    frames = [make_png(k) for k in (2, 5, 9, 12)]
    times = [0.2, 0.5, 0.9, 1.2]
    # the clip folders this call makes (not another suite's, running beside it in the same temporary folder)
    made, mkdtemp = [], tempfile.mkdtemp

    def recording_mkdtemp(*a, **k):
        d = mkdtemp(*a, **k)
        if os.path.basename(d).startswith("meta_clip_"):
            made.append(d)
        return d
    tempfile.mkdtemp = recording_mkdtemp
    try:
        with no_parser():
            s = M.sam_video_to_records(v, times, ["hand", "black piano key"], out, frames=frames, clip="frames")
    finally:
        tempfile.mkdtemp = mkdtemp
    vid = [r for r in MOCK.requests if r["path"] == "/v1/responses" and responses_body(r)[1][1]["type"] == "input_video"]
    assert len(vid) == 1
    sent = os.path.join(out, "sent.mp4")
    open(sent, "wb").write(data_url_bytes(responses_body(vid[0])[1][1]["video_url"], "video/mp4"))
    info = M.probe_video(sent)
    assert len(info["frame_times"]) == 4 and info["codec"] == "h264" and (info["width"], info["height"]) == (96, 64), info
    os.remove(sent)
    recs = [json.load(open(os.path.join(out, f))) for f in sorted(os.listdir(out))]
    assert [r["source"]["videoFrame"] for r in recs] == [0, 1, 2, 3] and all(r["source"]["dtS"] == 0.0 for r in recs)
    assert all(r["source"]["clip"] == "frames" for r in recs) and s["clip"] == "frames" and s["clipFrames"] == 4, (
        [r["source"] for r in recs], {k: s.get(k) for k in ("clip", "clipFrames")})
    assert [r["prompts"]["hand"][0]["box"][0] for r in recs] == [0, 1, 2, 3]       # SAM's frame k for record k
    assert s["estCost"] == M.est_cost(4, 1, 4) and s["maxDtS"] == 0.0
    assert made and not [d for d in made if os.path.exists(d)], ("the clip was left behind", made)
    e = must_raise(lambda: M.sam_video_to_records(v, times, ["hand"], out, clip="frames"), ValueError)
    assert "analysed frames" in str(e)


def test_records_inline_single_prompt_and_given_frames():
    v = make_video("vfr", vfr=True)
    out = tempfile.mkdtemp(dir=TMP)
    MOCK.reset(records_mock())
    frames = [make_png(k) for k in (2, 11)]   # not frame 10's picture: proves the given images are the ones sent
    s = M.sam_video_to_records(v, [0.2, 1.07], ["hand", "black piano key"], out, frames=frames)
    vid = [r for r in MOCK.requests if r["path"] == "/v1/responses" and responses_body(r)[1][1]["type"] == "input_video"]
    assert len(vid) == 1 and responses_body(vid[0])[1][1]["video_url"].startswith("data:video/mp4;base64,")
    assert not any(r["path"].startswith("/v1/files") for r in MOCK.requests) and not s["uploaded"]
    recs = [json.load(open(os.path.join(out, f))) for f in sorted(os.listdir(out))]
    assert [r["source"]["videoFrame"] for r in recs] == [2, 10]          # 1.07 s: frame 10 at 1.05 after the gap
    assert recs[1]["source"]["videoFrameS"] == 1.05 and s["maxDtS"] == 0.02
    assert recs[1]["prompts"]["hand"][0]["box"][0] == 10
    assert [r["prompts"]["black piano key"][0]["box"][0] for r in recs] == [2, 11]   # the given images were used


def test_records_stop_after_a_failed_image_request():
    """A 402 (docs/error-handling: billing_not_configured) fails every request: stop sending, write nothing."""
    v = make_video("cfr")
    out = tempfile.mkdtemp(dir=TMP)
    MOCK.reset(lambda r: {"status": 402, "body": {"error": {"message": "Billing account issue. Please check your account status.",
                                                            "type": "billing_error", "param": None, "code": "billing_not_configured"}}})
    e = must_raise(lambda: M.sam_video_to_records(v, [k / 10 for k in range(20)], ["black piano key"], out, workers=2))
    assert e.code == "billing_not_configured" and len(MOCK.requests) <= 3 and os.listdir(out) == [], len(MOCK.requests)


def test_records_with_mask_decoder():
    """The decoder plumbing (MASK_DECODER stands in for meta_sam_parser): raster placed on the box,
    outline through sam31's mask_to_polygon, area from the mask."""
    v = make_video("cfr")
    out = tempfile.mkdtemp(dir=TMP)
    MOCK.reset(lambda r: {"sse": sam_stream(["<0f>" + rec(0, 20, 10, 39, 29, 96, 64)])})
    calls = []

    def disk(h, w, enc, payload):
        calls.append((h, w, enc, payload))
        yy, xx = np.mgrid[:h, :w]
        return ((yy - h / 2 + 0.5) ** 2 + (xx - w / 2 + 0.5) ** 2 <= (h / 2) ** 2).astype(np.uint8).ravel()
    try:
        M.MASK_DECODER = disk
        s = M.sam_video_to_records(v, [0.0, 0.1], ["hand"], out)
        d = json.load(open(os.path.join(out, "rf_0001.sam.json")))["prompts"]["hand"][0]
        assert calls == [(20, 20, "one_bit", "!!!!J!0c[q")] and s["masks"] == {"decoded": 1, "box": 0}
        assert "mask" not in d and d["box"] == [20, 10, 40, 30] and 280 < d["area"] < 340
        xs, ys = [p[0] for p in d["polygon"]], [p[1] for p in d["polygon"]]
        assert 20 <= min(xs) and max(xs) <= 39 and 10 <= min(ys) and max(ys) <= 29 and len(d["polygon"]) > 8
        assert json.load(open(os.path.join(out, "rf_0002.sam.json")))["prompts"]["hand"] == []

        def broken(h, w, enc, payload):
            raise ValueError("invalid_mask_payload")
        M.MASK_DECODER = broken
        MOCK.reset(lambda r: {"sse": sam_stream(["<0f>" + rec(0, 20, 10, 39, 29, 96, 64)])})
        s = M.sam_video_to_records(v, [0.0], ["hand"], out)
        assert len(MOCK.requests) == 1 and s["masks"] == {"decoded": 0, "box": 1} and "invalid_mask_payload" in s["maskNote"]
    finally:
        M.MASK_DECODER = None


def test_documented_masks_decode_with_meta_parser():
    """Meta's own payloads (docs/sam/reading-segmentation's video line, complete) through meta_sam_parser, the way
    sam_video_to_records decodes a live mask: a raster of the documented size, the box's size, with pixels on.
    Skipped where the parser is not installed (then the outlines are boxes; the test above)."""
    try:
        import meta_sam_parser  # noqa: F401
    except ImportError:
        print("SKIP  meta_sam_parser is not installed here")
        return
    saved = dict(M._PARSER)
    M._PARSER.clear()
    try:
        fr, diag = M.parse_segmentation(DOC_VIDEO_LINE)
        assert not diag
        for o in fr[0]["objects"]:
            m = M.decode_mask(o)
            x0, y0, x1, y1 = o["box"]
            assert m.dtype == bool and m.shape == (y1 - y0, x1 - x0) == tuple(o["mask_hw"]), (m.shape, o["mask_hw"])
            assert 0.2 * m.size < m.sum() < m.size, m.sum()
        # many masks decode on worker processes (_decode_all) when the parser alone decodes them (no numba, or
        # TEACHER_SAM_DECODER=parser), to the same rasters, and a bad one is said, not raised
        old_env = os.environ.get("TEACHER_SAM_DECODER")
        os.environ["TEACHER_SAM_DECODER"] = "parser"
        try:
            objs = [dict(o) for o in fr[0]["objects"] for _ in range(M.DECODE_POOL_MIN)]
            objs.append(dict(objs[0], mask_payload=objs[0]["mask_payload"][:-5]))
            diag = []
            M._decode_all(objs, diag, workers=2)
            for o in objs[:-1]:
                assert np.array_equal(o["mask"], M.decode_mask(o)), "a mask from the pool differs"
            assert objs[-1]["mask"] is None and "mask_error" in objs[-1] and any("mask decoding failed" in d for d in diag), diag
            # a worker that cannot run: every mask is decoded here instead, and diag says so
            objs = [dict(o) for o in fr[0]["objects"] for _ in range(M.DECODE_POOL_MIN)]
            diag, exe = [], sys.executable
            try:
                sys.executable = "/bin/false"
                M._decode_all(objs, diag, workers=2)
            finally:
                sys.executable = exe
            assert any("decoded in one" in d for d in diag) and all(o["mask"] is not None for o in objs), diag
        finally:
            if old_env is None:
                os.environ.pop("TEACHER_SAM_DECODER", None)
            else:
                os.environ["TEACHER_SAM_DECODER"] = old_env
        bad = dict(fr[0]["objects"][0], mask_payload=fr[0]["objects"][0]["mask_payload"][:-5])
        try:
            M.decode_mask(bad)
            raise AssertionError("a cut payload decoded")
        except AssertionError:
            raise
        except Exception as e:
            assert "Mask" in str(e) or "mask" in str(e), e
    finally:
        M._PARSER.clear()
        M._PARSER.update(saved)


# ------------------------------------------------------------------ Muse Voice Transcribe

def parse_multipart(body, ctype):
    boundary = re.search(r"boundary=([^;]+)", ctype)[1].encode()
    parts = []
    for chunk in body.split(b"--" + boundary)[1:]:
        if chunk.startswith(b"--"):
            break
        head, _, data = chunk[2:].partition(b"\r\n\r\n")
        hd = dict(line.split(": ", 1) for line in head.decode().split("\r\n"))
        cd = hd["Content-Disposition"]
        fn = re.search(r'filename="([^"]*)"', cd)
        parts.append({"name": re.search(r'name="([^"]*)"', cd)[1], "filename": fn[1] if fn else None,
                      "type": hd.get("Content-Type"), "data": data[:-2]})
    return parts


TRANSCRIBE_RESPONSE = {   # docs/speech-to-text "Read the response"
    "sessionId": "9f1c...", "transcript": "How is the weather? It is raining.", "audioDurationMs": 8240,
    "turns": [{"turnId": 1, "startMs": 1520, "endMs": 4640, "transcript": "How is the weather?", "speaker": "A"},
              {"turnId": 2, "startMs": 5900, "endMs": 8240, "transcript": "It is raining.", "speaker": "B"}]}


def check_transcribe_request(req):
    assert req["method"] == "POST" and req["path"] == "/v1/asr/transcribe"
    assert req["headers"]["authorization"] == f"Bearer {KEY}" and req["headers"]["accept"] == "application/json"
    assert req["query"]["sessionId"].startswith("web-")
    parts = parse_multipart(req["body"], req["headers"]["content-type"])
    assert [p["name"] for p in parts] == ["request", "audio"]
    assert parts[0]["type"] == "application/json" and parts[1]["type"] == "audio/wav"
    return json.loads(parts[0]["data"]), parts[1]["data"]


def test_transcribe_converts_browser_audio():
    webm = os.path.join(TMP, "q.webm")
    ff("-f", "lavfi", "-i", "sine=f=330:d=1.5:sample_rate=48000", "-ac", "2", "-c:a", "libopus", webm)
    MOCK.reset(lambda r: {"body": TRANSCRIBE_RESPONSE})
    text = M.transcribe_speech(open(webm, "rb").read(), "audio/webm;codecs=opus", keywords=["legato", "Chopin"])
    assert text == "How is the weather? It is raining."
    settings, wav = check_transcribe_request(MOCK.requests[0])
    assert settings == {"model": "muse-voice-transcribe-1.0", "audioEncoding": "WAV", "mode": "PUSH_TO_TALK",
                        "keywords": ["legato", "Chopin"]}
    with wave.open(io.BytesIO(wav)) as w:   # "mono, 16-bit integer PCM at 16 kHz or 24 kHz"
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getcomptype()) == (1, 2, 24000, "NONE")
        assert abs(w.getnframes() / 24000 - 1.5) < 0.05


def test_transcribe_passes_good_wav_and_reports_errors():
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes((np.sin(np.arange(16000) / 5) * 8000).astype("<i2").tobytes())
    good = buf.getvalue()
    MOCK.reset(lambda r: {"body": TRANSCRIBE_RESPONSE})
    M.transcribe_speech(good, "audio/wav", language_bias=["English"])
    settings, wav = check_transcribe_request(MOCK.requests[0])
    assert wav == good and settings["languageBias"] == ["English"]
    # 400 "The audio is not a supported WAV file ...": the status, Meta's body and the session id
    MOCK.reset(lambda r: {"status": 400, "body": {"error": {"message": "The audio is not a supported WAV file.",
                                                            "type": "invalid_request_error", "param": "audio", "code": None}}})
    e = must_raise(lambda: M.transcribe_speech(good))
    assert e.status == 400 and e.param == "audio" and e.session_id == MOCK.requests[0]["query"]["sessionId"]
    assert "Muse Voice Transcribe: HTTP 400" in str(e) and len(MOCK.requests) == 1
    n = [0]

    def h(r):   # 429 "Retry with exponential backoff", then the transcript
        n[0] += 1
        return {"status": 429, "headers": {"Retry-After": "0"}, "body": b""} if n[0] == 1 else {"body": TRANSCRIBE_RESPONSE}
    MOCK.reset(h)
    assert M.transcribe_speech(good) and len(MOCK.requests) == 2
    MOCK.reset(lambda r: {"body": TRANSCRIBE_RESPONSE})
    old = M.ASR_MAX_S
    try:
        M.ASR_MAX_S = 0.5
        assert "at most" in str(must_raise(lambda: M.transcribe_speech(good), ValueError))
    finally:
        M.ASR_MAX_S = old
    assert "could not be read" in str(must_raise(lambda: M.transcribe_speech(b"not audio at all", "audio/webm"), ValueError))
    assert MOCK.requests == []


def test_transcribe_decodes_only_up_to_the_limit():
    # compressed silence is tiny (a few hundred bytes a second as FLAC), so a small upload can hold hours
    # of audio: the decode stops one second past ASR_MAX_S, and the duration check still refuses it
    flac = os.path.join(TMP, "silence.flac")
    ff("-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono", "-t", "120", "-c:a", "flac", flac)
    data = open(flac, "rb").read()
    old = M.ASR_MAX_S
    try:
        M.ASR_MAX_S = 5
        tmp = tempfile.mkdtemp(dir=TMP)
        wav, dur = M._asr_wav(data, "application/octet-stream", tmp)   # unknown type: ffmpeg probes the content
        assert 5 < dur <= 6.01 and len(wav) < 6.1 * M.ASR_RATE * 2 + 1000, (dur, len(wav))
        MOCK.reset(lambda r: {"body": TRANSCRIBE_RESPONSE})
        assert "at most" in str(must_raise(lambda: M.transcribe_speech(data, "audio/flac"), ValueError))
        assert MOCK.requests == []
    finally:
        M.ASR_MAX_S = old


# ------------------------------------------------------------------ Muse Voice Transcribe, realtime

HELLO_FIELDS = {"authorization", "audioEncoding", "model", "mode", "partialMode", "emitAudioProgress", "keywords",
                "languageBias"}   # schemas "Realtime Handshake Request" (the ninth is the sessionId query)


class AsrMock:
    """Meta's realtime ASR on loopback (websockets, in a thread with its own event loop), as
    docs/speech-to-text "Advanced" and docs/api-reference/voice/realtime describe it: the handshake as the
    first text frame within 10 s, the acknowledgement {"sessionId"} (no type), binary PCM, partial
    transcripts while audio arrives, endStream, the final transcript, close 1000. Each connection's
    session dict records what the client did; scenario picks a failure. Anything the client sends
    before the acknowledgement (ack_delay after the handshake) is counted in "early"."""
    FINAL = "How do I keep my wrist level?"

    def __init__(self):
        from websockets.asyncio.server import serve
        self.sessions, self.scenario, self.ack_delay = [], "ok", 0.2
        self.loop = asyncio.new_event_loop()
        up = threading.Event()
        quiet = logging.getLogger("asr-mock")   # the mock's own frame log would hold the handshake, key and all
        quiet.setLevel(logging.INFO)

        async def start():
            self.server = await serve(self.handler, "127.0.0.1", 0, process_request=self.http, logger=quiet, compression=None)
            self.port = self.server.sockets[0].getsockname()[1]
            up.set()
            await self.server.serve_forever()
        threading.Thread(target=lambda: self.loop.run_until_complete(start()), daemon=True).start()
        assert up.wait(10), "the realtime mock did not start"
        self.url = f"ws://127.0.0.1:{self.port}/v1/asr/realtime"

    def reset(self, scenario="ok", path="/v1/asr/realtime"):
        self.sessions, self.scenario = [], scenario
        os.environ["META_ASR_WS"] = f"ws://127.0.0.1:{self.port}{path}"

    def http(self, connection, request):
        """The upgrade request: refused (401) or redirected (302, to the real path) on the test paths."""
        if request.path.startswith("/refuse"):
            return connection.respond(401, "no\n")
        if request.path.startswith("/redirect"):
            r = connection.respond(302, "moved\n")
            r.headers["Location"] = f"ws://127.0.0.1:{self.port}/v1/asr/realtime"
            return r
        return None

    async def handler(self, ws):
        from websockets.exceptions import ConnectionClosed
        path, _, query = ws.request.path.partition("?")
        s = dict(path=path, query=urllib.parse.parse_qs(query), headers={k.lower(): v for k, v in ws.request.headers.raw_items()},
                 hello=None, problems=[], early=0, audio=0, frames=0, odd=0, texts=[], after_end=0, scenario=self.scenario)
        self.sessions.append(s)
        sc = self.scenario
        try:
            first = await asyncio.wait_for(ws.recv(), 10)
        except TimeoutError:
            await ws.close(1008, "no handshake within 10 seconds")
            return
        try:
            hello = json.loads(first) if isinstance(first, str) else None
        except ValueError:
            hello = None
        s["hello"] = hello
        h = hello if isinstance(hello, dict) else {}
        p = s["problems"]
        if (h.get("authorization") or {}).get("accessToken") != f"Bearer {KEY}":
            p.append("accessToken")
        if h.get("audioEncoding") not in ("PCM_24KHZ", "PCM_16KHZ"):
            p.append("audioEncoding")
        for k, v in (("model", "muse-voice-transcribe-1.0"), ("mode", "PUSH_TO_TALK"), ("partialMode", "CUMULATIVE"),
                     ("emitAudioProgress", False), ("languageBias", ["English"])):
            if h.get(k) != v:
                p.append(k)
        if "keywords" in h and not (isinstance(h["keywords"], list) and all(isinstance(x, str) for x in h["keywords"])):
            p.append("keywords")      # optional, a list of strings
        p += [f"unknown field {k}" for k in set(h) - HELLO_FIELDS]
        if p or sc == "bad-key":
            await ws.send(json.dumps({"type": "error", "message": "The access token is not valid.", "sessionId": "",
                                      "errorType": "authentication_error", "errorCode": "invalid_api_key"}))
            await ws.close(1008, "invalid handshake")
            return
        if sc == "rate-limited":
            await ws.close(1013, "rate limited")
            return
        if sc == "no-ack":
            await asyncio.sleep(5)
            return
        await asyncio.sleep(self.ack_delay)
        while True:                                       # "Wait for the handshake acknowledgement before sending audio"
            try:
                await asyncio.wait_for(ws.recv(), 0.02)
                s["early"] += 1
            except TimeoutError:
                break
        sid = (s["query"].get("sessionId") or ["mock-session"])[0]
        await ws.send(json.dumps({"sessionId": sid}))
        await ws.send(json.dumps({"type": "somethingNew", "detail": 1}))   # "Ignore unknown event types"
        words, said = self.FINAL.rstrip("?").lower().split(), 0
        try:
            while True:
                msg = await ws.recv()
                if isinstance(msg, bytes):
                    s["audio"] += len(msg)
                    s["frames"] += 1
                    s["odd"] += len(msg) % 2
                    ms = s["audio"] * 1000 // (48000 if h["audioEncoding"] == "PCM_24KHZ" else 32000)
                    if s["frames"] == 1:
                        await ws.send(json.dumps({"type": "speechStart", "turnId": 1, "audioProcessedMs": ms}))
                    if s["frames"] % 3 == 0 and said < len(words):
                        said += 1
                        await ws.send(json.dumps({"type": "transcript", "transcript": " ".join(words[:said]), "final": False,
                                                  "audioProcessedMs": ms}))
                    if sc == "error-mid" and s["frames"] >= 4:
                        await ws.send(json.dumps({"type": "error", "message": "Transcription failed; please retry.",
                                                  "sessionId": sid, "errorType": "server_error"}))
                        await ws.close(1011, "backend failure")
                        return
                    continue
                ev = json.loads(msg)
                s["texts"].append(ev)
                if ev.get("type") != "endStream":
                    continue
                try:                                      # "Send no further events after this"
                    while True:
                        await asyncio.wait_for(ws.recv(), 0.1)
                        s["after_end"] += 1
                except TimeoutError:
                    pass
                if sc == "no-final":
                    await ws.close(1000)
                    return
                if sc == "slow-final":
                    await asyncio.sleep(3)
                ms = s["audio"] * 1000 // 48000
                await ws.send(json.dumps({"type": "speechEnd", "turnId": 1, "audioProcessedMs": ms}))
                await ws.send(json.dumps({"type": "transcript", "transcript": self.FINAL, "final": True, "audioProcessedMs": ms}))
                await ws.close(1000)
                return
        except ConnectionClosed:
            s["client_closed"] = True


ASR = AsrMock()
FRAME = 24000 * 2 * 80 // 1000    # "16-bit little-endian mono PCM at 24 kHz, paced ~real time (80 ms per frame)"


async def pcm(n, size=FRAME):
    for k in range(n):
        yield bytes([k % 256]) * size


def asr(frames, events=None, **kw):
    return asyncio.run(M.asr_realtime(frames, (events.append if events is not None else None), **kw))


def asr_fails(frames, **kw):
    return must_raise(lambda: asr(frames, **kw))


def test_realtime_turn():
    ASR.reset()
    events = []
    text = asr(pcm(12), events)
    s = ASR.sessions[-1]
    assert text == AsrMock.FINAL, text
    assert s["problems"] == [] and s["early"] == 0, (s["problems"], s["early"])
    assert s["hello"]["audioEncoding"] == "PCM_24KHZ" and "piano" in s["hello"]["keywords"]
    assert s["audio"] == 12 * FRAME and s["odd"] == 0 and s["texts"] == [{"type": "endStream"}] and s["after_end"] == 0, s
    # "This endpoint does not read the HTTP Authorization header; the credential travels in the handshake"
    assert "authorization" not in s["headers"] and s["path"] == "/v1/asr/realtime"
    assert s["query"]["sessionId"][0].startswith("web-")
    types = [e["type"] for e in events]
    assert types[0] == "ready" and events[0]["sessionId"] == s["query"]["sessionId"][0], events[:2]
    assert "somethingNew" in types and "speechStart" in types and "speechEnd" in types, types
    partials = [e["transcript"] for e in events if e["type"] == "transcript" and not e["final"]]
    assert partials == ["how", "how do", "how do i", "how do i keep"], partials
    assert [e["transcript"] for e in events if e["type"] == "transcript" and e["final"]] == [AsrMock.FINAL]


def test_realtime_options_and_async_callback():
    ASR.reset()
    seen = []

    async def on_event(e):
        await asyncio.sleep(0)
        seen.append(e["type"])
    text = asyncio.run(M.asr_realtime(pcm(3, 3200), on_event, sample_rate=16000, keywords=None, language_bias=["English"],
                                      session_id="mine-1"))
    s = ASR.sessions[-1]
    assert text == AsrMock.FINAL and s["hello"]["audioEncoding"] == "PCM_16KHZ" and s["query"]["sessionId"] == ["mine-1"]
    assert "keywords" not in s["hello"] and seen[0] == "ready"        # keywords=None leaves the field out
    assert "44100" in str(must_raise(lambda: asr(pcm(1), sample_rate=44100), ValueError))


def test_realtime_odd_frames_and_empty_turn():
    ASR.reset()
    sizes = [3841, 3839, 1, 0, 2001]

    async def frames():
        for n in sizes:
            yield b"\x01" * n
    assert asr(frames()) == AsrMock.FINAL
    s = ASR.sessions[-1]
    assert s["odd"] == 0 and s["audio"] == sum(sizes) - sum(sizes) % 2, s     # whole samples only; the last stray byte is dropped
    ASR.reset()
    assert asr(pcm(0)) == AsrMock.FINAL and ASR.sessions[-1]["audio"] == 0 and ASR.sessions[-1]["texts"] == [{"type": "endStream"}]


def test_realtime_paces_audio():
    """Audio that is all there at once (buffered before the acknowledgement) goes out no more than
    lead_s ahead of real time."""
    ASR.reset()
    t = time.time()
    asr(pcm(20), lead_s=0.4)              # 1.6 s of audio
    slow = time.time() - t
    ASR.reset()
    t = time.time()
    asr(pcm(20), lead_s=60)
    fast = time.time() - t
    assert slow >= 1.6 - 0.4 and fast < slow - 0.8, (slow, fast)


def test_realtime_errors_and_close_codes():
    ASR.reset("bad-key")
    e = asr_fails(pcm(3))
    assert e.type == "invalid_request" and e.close_code == 1008 and e.error_code == "invalid_api_key", e
    assert "access token is not valid" in str(e) and KEY not in str(e) and ASR.sessions[-1]["audio"] == 0
    ASR.reset("rate-limited")
    e = asr_fails(pcm(3))
    assert e.type == "rate_limited" and e.close_code == 1013 and "rate limited" in str(e), e
    ASR.reset("error-mid")
    events = []
    e = must_raise(lambda: asr(pcm(30), events))
    assert e.type == "server_error" and e.close_code == 1011 and "please retry" in str(e), e
    assert any(x["type"] == "error" for x in events) and ASR.sessions[-1]["frames"] < 30
    ASR.reset("no-ack")
    e = asr_fails(pcm(3), ack_timeout_s=0.5)
    assert e.type == "timeout" and "acknowledgement" in str(e), e
    ASR.reset("slow-final")
    e = asr_fails(pcm(3), final_timeout_s=0.5)
    assert e.type == "timeout" and "final transcript" in str(e), e
    ASR.reset("no-final")             # a normal close without a final: the last partial is the transcript
    assert asr(pcm(9)) == "how do i"
    ASR.reset(path="/refuse/v1/asr/realtime")
    e = asr_fails(pcm(1))
    assert e.status == 401 and not ASR.sessions, e
    ASR.reset(path="/redirect/v1/asr/realtime")          # a 3xx is refused, not followed
    e = asr_fails(pcm(1))
    assert e.status == 302 and not ASR.sessions, e
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    closed = s.getsockname()[1]
    s.close()
    os.environ["META_ASR_WS"] = f"ws://127.0.0.1:{closed}/v1/asr/realtime"
    e = asr_fails(pcm(1))
    assert e.type == "network", e


def test_realtime_never_logs_the_handshake():
    """Even with its logger on DEBUG, where websockets would log each frame (the handshake with the key)."""
    lg = logging.getLogger("meta_api.realtime")
    old = lg.level
    lg.setLevel(logging.DEBUG)
    mark = len(LOG.getvalue())
    try:
        ASR.reset()
        assert asr(pcm(2)) == AsrMock.FINAL
    finally:
        lg.setLevel(old)
    tail = LOG.getvalue()[mark:]
    assert "accessToken" not in tail and "LLM|" not in tail and "asr realtime session" in tail, tail[-300:]


def test_realtime_guards():
    ASR.reset()
    for bad in ("wss://evil.example/v1/asr/realtime", "ws://api.meta.ai/v1/asr/realtime", "https://api.meta.ai/v1/asr/realtime",
                "ws://10.0.0.1/v1/asr/realtime"):
        os.environ["META_ASR_WS"] = bad
        assert must_raise(lambda: asr(pcm(1))).type == "bad_base", bad
    ASR.reset()
    os.environ.pop("MODEL_API_KEY")
    try:
        assert must_raise(lambda: asr(pcm(1))).type == "no_key"
    finally:
        os.environ["MODEL_API_KEY"] = KEY
    assert ASR.sessions == []
    os.environ["META_ASR_WS"] = "wss://api.meta.ai/v1/asr/realtime"      # the default is accepted (nothing is sent: no network here)
    assert M._asr_url("x")[0] == "wss://api.meta.ai/v1/asr/realtime?sessionId=x" and M._asr_url("x")[1] is False
    os.environ.pop("META_ASR_WS")
    assert M._asr_url("y")[0] == M.ASR_WS + "?sessionId=y"


# ------------------------------------------------------------------ cost

def test_est_cost():
    # docs/pricing-rate-limits: $0.20 / 1,000 frames, $2.50 / 1,000 images, $0.18 / hour in whole seconds
    c = M.est_cost(1800, ["piano keyboard", "hand", "thumb", "forearm"], images=300, audio_s=60.9)
    assert c["videoFrames"] == 7200 and abs(c["videoUsd"] - 1.44) < 1e-9 and abs(c["imageUsd"] - 0.75) < 1e-9
    assert c["audioS"] == 60 and abs(c["audioUsd"] - 0.003) < 1e-9 and abs(c["usd"] - 2.193) < 1e-9
    assert M.est_cost(15000, 1)["usd"] == 3.0 and M.est_cost(0, 0, 1000)["usd"] == 2.5


def test_zz_key_never_logged():
    """Runs last: the key is in no log line and no error text from any test above."""
    assert ERRORS, "no errors were collected"
    assert KEY not in LOG.getvalue() and not any(KEY in e for e in ERRORS)
    # websockets' frame log (DEBUG) would show the realtime handshake, cut short but past the key's start
    assert "accessToken" not in LOG.getvalue() and "LLM|" not in LOG.getvalue()
    assert "asr realtime session" in LOG.getvalue()
    assert "/v1/responses" in LOG.getvalue() or "/responses" in LOG.getvalue()


def main():
    fails = 0
    tests = sorted((k, v) for k, v in globals().items() if k.startswith("test_") and callable(v))
    for name, fn in tests:
        t = time.time()
        try:
            fn()
            print(f"ok    {name} ({time.time() - t:.1f} s)")
        except Exception as e:  # report every check, then fail
            fails += 1
            import traceback
            print(f"FAIL  {name}: {type(e).__name__}: {e}")
            traceback.print_exc(limit=3)
    print(f"{len(tests) - fails} of {len(tests)} passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
