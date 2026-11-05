#!/usr/bin/env python3
"""Does MODEL_API_KEY work for everything the teacher asks Meta's Model API? One run; no take, nothing about any
player and no recording is sent, only a fixed prompt and a keyboard this script draws.

  1. key      GET /models with the key (voice.probe_meta_key, the same probe server.py runs at start-up).
  2. models   whether the list names the ids the app uses: Muse Spark (MUSE_HOSTED_MODEL, default muse-spark-1.3),
              Muse Wonder (MUSE_PLAN_MODEL, default muse-wonder-1.0) and sam-3.1. A missing id is a warning only:
              the list may leave out a model the key can still call, and steps 3 and 4 say whether it answers.
  3. spark    one Chat Completions request to Muse Spark in the shape the teacher sends (voice._complete: developer
     wonder   message, JSON schema, store false), asking for {"ok": "ready"}; then the same to Muse Wonder.
  4. sam      one SAM 3.1 image request (meta_api.sam_segment_image, prompt "piano keyboard") on the keyboard drawn
              here; its box is compared with where the keys were drawn (IoU).
     --local  also runs the local SAM 3.1 (SAM_CKPT) on the same image, printing both boxes and their IoU.

    python check_meta_key.py [--local] [--json]

Exit 0 when every request was answered, 1 when one failed. A keyboard SAM 3.1 does not find is a warning, not a
failure: the request worked. The key is never printed. Cost: one SAM image ($2.50 per 1,000) and two short replies.
"""
import argparse
import json
import os
import sys
import tempfile
import time
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import meta_api as M  # noqa: E402
import voice as V  # noqa: E402

SAM_PROMPT = "piano keyboard"
READY = {"type": "object", "properties": {"ok": {"type": "string"}}, "required": ["ok"], "additionalProperties": False}
MIN_IOU = 0.5


def draw_keyboard(path, w=1280, h=720):
    """A top-down keyboard on a dark wooden desk: 29 white keys (four octaves and a C) with their black keys. Returns
    the box the white keys cover, [x0, y0, x1, y1] with x1 and y1 exclusive."""
    import cv2
    rng = np.random.default_rng(7)
    img = np.empty((h, w, 3), np.uint8)
    img[:] = (38, 52, 74)                                                     # BGR: dark brown wood
    grain = (rng.normal(0, 6, (h, 1, 1)) * np.ones((1, w, 1))).astype(np.int16)
    img = np.clip(img.astype(np.int16) + grain, 0, 255).astype(np.uint8)
    kw, n, top, white_len, black_len = 36, 29, 300, 220, 140
    x0 = (w - kw * n) // 2
    cv2.rectangle(img, (x0 - 14, top - 34), (x0 + kw * n + 13, top + white_len + 10), (22, 22, 24), -1)   # the case
    for i in range(n):
        cv2.rectangle(img, (x0 + i * kw + 1, top), (x0 + (i + 1) * kw - 2, top + white_len - 1), (238, 240, 242), -1)
    for i in range(n - 1):
        if i % 7 in (0, 1, 3, 4, 5):                                         # C D, F G A: a black key to their right
            cx = x0 + (i + 1) * kw
            cv2.rectangle(img, (cx - 11, top), (cx + 10, top + black_len - 1), (18, 18, 20), -1)
    cv2.imwrite(path, img)
    return [x0, top, x0 + kw * n, top + white_len]


def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def _err(e):
    """An exception as one line, with the key scrubbed out (meta_api's own scrubber)."""
    return M._scrub(f"{type(e).__name__}: {e}")[:300]


def model_ids(key, base, timeout=10.0):
    req = urllib.request.Request(base + "/models", headers={"Authorization": f"Bearer {key}", "User-Agent": M.USER_AGENT})
    with V._opener(req.full_url).open(req, timeout=timeout) as r:
        j = json.loads(r.read())
    rows = j.get("data") if isinstance(j, dict) else j
    if isinstance(j, dict) and rows is None:
        rows = j.get("models")
    return [str(x.get("id") if isinstance(x, dict) else x) for x in (rows or [])]


def ask_ready(b, model):
    out, dt, served = V._complete(dict(b, model=model), [
        {"role": "developer", "content": 'This is a connection check. Reply with the JSON object {"ok": "ready"} and nothing else.'},
        {"role": "user", "content": "ready?"}], READY, 30.0, max_tokens=200)
    return out, dt, served


def run(local=False):
    rows = []

    def row(step, status, detail):
        rows.append({"step": step, "status": status, "detail": detail})

    key, base = os.environ.get("MODEL_API_KEY", "").strip(), V._hosted_base()
    if not key:
        row("key", "fail", "MODEL_API_KEY is not set in this session's environment")
        return rows
    if not base:
        row("key", "fail", "META_API_BASE is neither Meta's API nor a loopback test server, so nothing was sent")
        return rows
    st = V.probe_meta_key(timeout=10)
    if st != "ok":
        row("key", "fail", f"Meta's Model API {'refused the key (401 or 403)' if st == 'refused' else 'did not answer GET /models'}"
                           f" - key {len(key)} characters, sent to {base}")
        return rows
    row("key", "ok", f"GET /models answered 200 ({base})")

    spark = V._hosted_model()
    wonder = (os.environ.get("MUSE_PLAN_MODEL") or "muse-wonder-1.0").strip()
    try:
        ids = model_ids(key, base)
        missing = [m for m in (spark, wonder, M.SAM_MODEL) if m not in ids]
        row("models", "warn" if missing else "ok", (f"not listed: {', '.join(missing)}; " if missing else "")
            + f"{len(ids)} listed" + (f" ({', '.join(sorted(ids)[:12])}{', ...' if len(ids) > 12 else ''})" if ids else ""))
    except Exception as e:
        row("models", "warn", f"could not read the list: {_err(e)}")

    # the backend _complete takes, as voice._meta_hosted builds it, whatever TEACHER_MUSE says: this checks the key
    b = dict(name="muse", base=base, model=spark, key=key, hosted=True, route="meta")
    for step, model in (("spark", spark), ("wonder", wonder)):
        if V._contributor_id(model):
            row(step, "fail", f"{model} is a Contributor model, which the app never calls")
            continue
        try:
            out, dt, served = ask_ready(b, model)
            good = str(out.get("ok", "")).strip().lower() == "ready"
            row(step, "ok" if good else "warn", f"{served} answered in {dt:.1f} s" + ("" if good else f", but not with ready: {json.dumps(out)[:120]}"))
        except Exception as e:
            row(step, "fail", f"{model}: {_err(e)}")

    tmp = tempfile.mkdtemp(prefix="check_meta_key_")
    try:
        img = os.path.join(tmp, "keyboard.png")
        truth = draw_keyboard(img)
        t0 = time.perf_counter()
        try:
            r = M.sam_segment_image(img, SAM_PROMPT, decode_masks=False)
            dt = time.perf_counter() - t0
            boxes = [o["box"] for o in r["objects"]]
            best = max(boxes, key=lambda bx: iou(bx, truth)) if boxes else None
            if best and iou(best, truth) >= MIN_IOU:
                row("sam", "ok", f"answered in {dt:.1f} s: {len(boxes)} found, best box {best} vs the drawn keys {truth}, IoU {iou(best, truth):.2f}")
            else:
                row("sam", "warn", f"answered in {dt:.1f} s, but no box matched the drawn keys {truth}"
                                   + (f" (best {best}, IoU {iou(best, truth):.2f})" if best else " (nothing found)"))
        except Exception as e:
            row("sam", "fail", _err(e))
        if local:
            try:
                import video
                ckpt = os.environ.get("SAM_CKPT")
                if not ckpt or not os.path.exists(ckpt):
                    raise RuntimeError("SAM_CKPT is not set to the local SAM 3.1 checkpoint")
                mod, sam, device, _ = video._sam_local(ckpt, 0.3)
                t0 = time.perf_counter()
                recs = mod.segment_image(sam, img, [SAM_PROMPT])["prompts"][SAM_PROMPT]
                dt = time.perf_counter() - t0
                lb = max((rc["box"] for rc in recs), key=lambda bx: iou(bx, truth), default=None)
                hosted = next((x for x in rows if x["step"] == "sam"), {})
                row("local", "ok" if lb else "warn", f"local SAM 3.1 on {device} in {dt:.0f} s: "
                    + (f"best box {[round(v) for v in lb]}, IoU with the drawn keys {iou(lb, truth):.2f}" if lb else "nothing found")
                    + (f"; hosted said: {hosted.get('detail', '')[:80]}" if hosted else ""))
            except Exception as e:
                row("local", "warn", _err(e))
    finally:
        import shutil
        shutil.rmtree(tmp, True)
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--local", action="store_true", help="also run the local SAM 3.1 on the same image (SAM_CKPT)")
    ap.add_argument("--json", action="store_true", help="print the rows as JSON")
    a = ap.parse_args(argv)
    rows = run(local=a.local)
    if a.json:
        print(json.dumps(rows, indent=1))
    else:
        for r in rows:
            print(f"{r['step']:<7} {r['status']:<5} {r['detail']}")
    return 1 if any(r["status"] == "fail" for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
