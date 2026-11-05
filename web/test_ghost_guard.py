#!/usr/bin/env python3
"""ghost_guard.py: the recorded hands leave the server only as the taught bars, capped per job and per piece, encrypted per
job behind expiring signed links. No network, no model, no real performance (a stand-in segment()).

  - AES-256 and AES-256-GCM against FIPS-197's and the GCM paper's vectors, and against WebCrypto itself (node's
    crypto.subtle decrypts what this encrypts, and the other way round) when node is installed;
  - a changed byte or another job's key is refused;
  - the cap: the first three fixes only, each its bars and one bar either side, then without the margin, then the fallback;
    bars already served cost nothing again; the ledger outlives the process; the share comes from TEACHER_GHOST_CAP;
  - the links: signed for one job and one fix, refused when expired or changed; the key in the reader's view opens the cut,
    and the cut holds no performer, rights, why or rotations;
  - an inline recorded performance is taken out of a result;
  - a fix in a repeat's second time is cut from the second time; a cut the margin cannot give is tried on the fix's bars;
  - pieces lined up with one recorded performance (Fur Elise and its opening) share one count, of the whole piece's bars;
  - make_sample.py: no inline recorded performance in a sample, and the samples' cuts together within the cap.

    python test_ghost_guard.py
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
for k in ("TEACHER_GHOST_CAP", "TEACHER_GHOST_LINK_S", "TEACHER_GHOST_SECRET"):
    os.environ.pop(k, None)

import ghost_guard as G  # noqa: E402

PASSES, FAILS = [], []


def ok(name, cond, detail=""):
    (PASSES if cond else FAILS).append(name)
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" | {str(detail)[:600]}"), flush=True)


def crypto():
    ok("AES-256: FIPS-197 C.3", G.aes_block(bytes(range(32)), bytes.fromhex("00112233445566778899aabbccddeeff")).hex()
       == "8ea2b7ca516745bfeafc49904b496089")
    ct, tag = G._gcm(bytes(32), bytes(12), b"")
    ok("AES-256-GCM: the GCM paper's test case 13 (no data)", ct == b"" and tag.hex() == "530f8afbc74536b9a963b4f1c4cb738b", tag.hex())
    ct, tag = G._gcm(bytes(32), bytes(12), bytes(16))
    ok("AES-256-GCM: test case 14 (one block of zeros)", ct.hex() == "cea7403d4d606b6e074ec5d3baf39d18"
       and tag.hex() == "d0d1c8a799996bf0265b98b5d48ab919", (ct.hex(), tag.hex()))
    key = os.urandom(32)
    for n in (1, 15, 16, 17, 1000, 300001):
        data = os.urandom(n)
        b = G.encrypt(key, data)
        ok(f"a round trip of {n} bytes: nonce + ciphertext + tag", len(b) == n + 28 and G.decrypt(key, b) == data)
    data = b'{"fps":15,"frames":3}'
    b = G.encrypt(key, data)
    bad = bytearray(b)
    bad[20] ^= 1
    for name, k_, blob in (("a changed byte", key, bytes(bad)), ("another job's key", os.urandom(32), b)):
        try:
            G.decrypt(k_, blob)
            refused = False
        except ValueError:
            refused = True
        ok(f"{name} is refused", refused)
    b1, b2 = G.encrypt(key, data), G.encrypt(key, data)
    ok("each cut gets a fresh nonce", b1[:12] != b2[:12] and b1 != b2)
    webcrypto(key)


def webcrypto(key):
    """node's WebCrypto (crypto.subtle, what the page's ghost-recorded.js uses) decrypts this module's cut, and this module
    decrypts one node made: the layout (nonce, ciphertext, tag) and the key's base64 are the page's."""
    node = shutil.which("node")
    if not node:
        print("SKIP node is not installed: the WebCrypto cross-check did not run", flush=True)
        return
    data = os.urandom(70001)
    blob = G.encrypt(key, data)
    js = ("const [k, b, d] = process.argv.slice(1);"
          "const key = await crypto.subtle.importKey('raw', Buffer.from(k, 'base64'), 'AES-GCM', false, ['decrypt', 'encrypt']);"
          "const buf = Buffer.from(b, 'base64');"
          "const pt = Buffer.from(await crypto.subtle.decrypt({name: 'AES-GCM', iv: buf.subarray(0, 12)}, key, buf.subarray(12)));"
          "const iv = Buffer.alloc(12, 7);"
          "const ct = Buffer.from(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, Buffer.from(d, 'base64')));"
          "console.log(JSON.stringify({pt: pt.toString('base64'), back: Buffer.concat([iv, ct]).toString('base64')}));")
    small = os.urandom(333)
    p = subprocess.run([node, "--input-type=module", "-e", js, base64.b64encode(key).decode(), base64.b64encode(blob).decode(),
                        base64.b64encode(small).decode()], capture_output=True, text=True, timeout=60)
    try:
        got = json.loads(p.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        ok("WebCrypto ran", False, p.stderr[-400:])
        return
    ok("WebCrypto's AES-GCM decrypts this module's cut (70,001 bytes)", base64.b64decode(got["pt"]) == data)
    ok("this module decrypts WebCrypto's", G.decrypt(key, base64.b64decode(got["back"])) == small)


def segment_stub(calls):
    def segment(pid, a, b):
        calls.append((pid, a, b))
        return dict(fps=15, fromBar=a, toBar=b, frames=4, hands="AAAA", rot="secret-rotations", performer="A pianist",
                    rights="public", why="cleared", provenance="kept on the server", notes=[[0.0, 0.5, 60, 64, "R"]])
    return segment


def view(fixes, piece="chopin-nocturne-20"):
    return dict(piece=piece, portrait=True, fixes=[dict(n=i + 1, bars=b, steps=[]) for i, b in enumerate(fixes)])


def caps():
    data = tempfile.mkdtemp(prefix="ghost_guard_")
    try:
        numbers = list(range(0, 61))                     # 61 bars, the pickup included: the cap is round(0.15 x 61) = 9
        ok("the cap is about 15 % of the piece's bars", G.cap_bars(61) == 9 and G.cap_bars(20) == 3 and G.cap_bars(3) == 1)
        calls = []
        v = view([[5], [12, 13], [30], [40]])
        idx = G.build(data, "job", "a" * 32, v, os.path.join(data, "a", "ghost"), segment=segment_stub(calls), numbers=numbers)
        fx = v["fixes"]
        ok("each of the first three fixes gets its bars and one either side", [f["ghost"].get("bars") for f in fx[:2]] == [[4, 6], [11, 14]]
           and calls[:2] == [("chopin-nocturne-20", 4, 6), ("chopin-nocturne-20", 11, 14)], [f["ghost"] for f in fx])
        ok("the third fix, past the cap with its margin (7 + 3 > 9), gets its own bar alone",
           fx[2]["ghost"].get("bars") == [30, 30] and ("chopin-nocturne-20", 29, 31) in calls, fx[2]["ghost"])
        ok("a fourth fix gets no cut at all", fx[3]["ghost"] == dict(fallback="3d", reason="max") and ("chopin-nocturne-20", 39, 41) not in calls)
        led = G.ledger(data)[G.ledger_key("chopin-nocturne-20")]
        ok("the ledger holds the 8 bars served, of 61", led == dict(bars=[4, 5, 6, 11, 12, 13, 14, 30], total=61, pieces=["chopin-nocturne-20"]), led)
        ok("the index on file matches the view", idx == {str(f["n"]): f["ghost"] for f in fx}, idx)
        # a second job: bars already served are free, new ones go past the cap
        v2 = view([[12, 13], [50, 51]])
        G.build(data, "job", "b" * 32, v2, os.path.join(data, "b", "ghost"), segment=segment_stub([]), numbers=numbers)
        ok("another job's fix on bars already served gets them again; one on new bars past the cap gets the fallback",
           v2["fixes"][0]["ghost"].get("bars") == [11, 14] and v2["fixes"][1]["ghost"] == dict(fallback="3d", reason="cap"),
           [f["ghost"] for f in v2["fixes"]])
        v3 = view([[50]])
        G.build(data, "sample", "a-sample", v3, os.path.join(data, "s", "ghost"), segment=segment_stub([]), numbers=numbers)
        ok("one more bar fits (9 of 9), and a sample counts as a job does", v3["fixes"][0]["ghost"].get("bars") == [50, 50]
           and len(G.ledger(data)[G.ledger_key("chopin-nocturne-20")]["bars"]) == 9, v3["fixes"][0]["ghost"])
        v4 = view([[52]])
        G.build(data, "job", "c" * 32, v4, os.path.join(data, "c", "ghost"), segment=segment_stub([]), numbers=numbers)
        ok("and then nothing new: the union ever served stays at the cap", v4["fixes"][0]["ghost"] == dict(fallback="3d", reason="cap"))
        # the ledger is on disk: a new process (here the module's state cleared) reads the same
        G._BARS.clear()
        led2 = json.load(open(os.path.join(data, G.LEDGER_FILE)))["pieces"][G.ledger_key("chopin-nocturne-20")]
        ok("the ledger outlives the process (it is a file on the data folder)", len(led2["bars"]) == 9 and led2["total"] == 61, led2)
        v5 = view([[45]])
        G.build(data, "job", "d" * 32, v5, os.path.join(data, "d", "ghost"), segment=lambda *a: None, numbers=numbers)
        ok("no recorded performance for the bars: the fallback, and nothing counted",
           v5["fixes"][0]["ghost"] == dict(fallback="3d", reason="none") and len(G.ledger(data)[G.ledger_key("chopin-nocturne-20")]["bars"]) == 9)
        v6 = view([[5]], piece="some-piece")
        G.build(data, "job", "e" * 32, v6, os.path.join(data, "e", "ghost"), segment=segment_stub([]), numbers=None)
        ok("a piece whose bars cannot be counted gets no cut", v6["fixes"][0]["ghost"].get("fallback") == "3d")
        os.environ["TEACHER_GHOST_CAP"] = "0.05"
        try:
            ok("TEACHER_GHOST_CAP sets the share", G.cap_share() == 0.05 and G.cap_bars(61) == 3)
        finally:
            os.environ.pop("TEACHER_GHOST_CAP")
        os.environ["TEACHER_GHOST_CAP"] = "7"
        try:
            ok("a TEACHER_GHOST_CAP over 1 counts as the default", G.cap_share() == G.CAP_SHARE)
        finally:
            os.environ.pop("TEACHER_GHOST_CAP")
        ok("a deploy check sees samples that would go past the cap", G.fits({"p": set(range(10))}, lambda p: list(range(61))) != {}
           and G.fits({"p": {1, 2}}, lambda p: list(range(61))) == {})
        ok("fix bars: a list, a pair of from and to, or the anchor's bar", G.fix_bars(dict(bars=[7, 5, 6])) == (5, 7)
           and G.fix_bars(dict(bars=dict(fromBar=3, toBar=4))) == (3, 4) and G.fix_bars(dict(anchor=dict(bar=9))) == (9, 9)
           and G.fix_bars(dict(bars=[])) is None)
        links(data)
    finally:
        shutil.rmtree(data, ignore_errors=True)


def passes():
    """A fix in a repeat's second time is cut from the second time (its anchor's played bar, the view's score geometry);
    a cut the performance cannot give with the margin (a bar either side it does not hold) is tried without it."""
    data = tempfile.mkdtemp(prefix="ghost_guard_pass_")
    try:
        numbers = list(range(1, 41))
        calls = []

        def segment(pid, a, b, pass_=None):
            calls.append((a, b, pass_))
            return dict(fps=15, bars=[a, b], frames=4, hands="AAAA", notes=[[0.0, 0.5, 60, "R"]]) if (a, b) != (7, 9) else None
        v = dict(piece=dict(id="fur-elise"), score=dict(piece="fur-elise", geom=dict(bars=[dict(k=3, m=4, p=1), dict(k=12, m=4, p=2),
                                                                                          dict(k=13, m=8, p=1)])),
                 fixes=[dict(n=1, bars=[4], anchor=dict(noteId="m4.s1.0", bar=4, k=12), steps=[]),
                        dict(n=2, bars=[8], anchor=dict(noteId="m8.s1.0", bar=8, k=13), steps=[]),
                        dict(n=3, bars=[20], steps=[])])
        G.build(data, "job", "a" * 32, v, os.path.join(data, "a", "ghost"), segment=segment, numbers=numbers)
        g = [f["ghost"] for f in v["fixes"]]
        ok("a fix in a repeat's second time is cut from the performance's second time; one with no anchor from its first",
           calls[0] == (3, 5, 2) and (19, 21, None) in calls and G.pass_of(v, v["fixes"][2]) is None, calls)
        ok("a cut the performance cannot give with its margin is tried on the fix's own bars, not given up",
           calls[1:3] == [(7, 9, 1), (8, 8, 1)] and g[1].get("bars") == [8, 8] and g[1].get("state") == "ready", (calls, g[1]))
    finally:
        shutil.rmtree(data, ignore_errors=True)


def shared():
    """Two library pieces lined up with one recorded performance (the whole Fur Elise and its opening) share one count,
    and its cap is a share of the whole piece's bars."""
    data = tempfile.mkdtemp(prefix="ghost_guard_shared_")
    had = dict(G._PERF)
    try:
        G._PERF["table"] = {"opening": "ab" * 32, "whole": "ab" * 32, "other": "cd" * 32}
        G._BARS.update({"opening": list(range(0, 24)), "whole": list(range(0, 100)), "other": list(range(0, 100))})
        stub = segment_stub([])
        v1 = view([[5], [12]], piece="opening")
        G.build(data, "job", "a" * 32, v1, os.path.join(data, "a"), segment=stub)
        v2 = view([[5], [12], [40]], piece="whole")
        G.build(data, "job", "b" * 32, v2, os.path.join(data, "b"), segment=stub)
        led = G.ledger(data)
        ok("pieces of one recorded performance share one count, a share of the whole piece's 100 bars (15): the opening's "
           "bars cost the whole piece nothing again",
           list(led) == [G.ledger_key("opening")] and G.ledger_key("whole") == G.ledger_key("opening") != G.ledger_key("other")
           and led[G.ledger_key("opening")]["bars"] == [4, 5, 6, 11, 12, 13, 39, 40, 41] and led[G.ledger_key("opening")]["total"] == 100
           and led[G.ledger_key("opening")]["pieces"] == ["opening", "whole"], led)
        over = G.fits({"opening": set(range(0, 10)), "whole": set(range(10, 20))}, lambda p: G._BARS.get(p))
        alone = G.fits({"opening": set(range(0, 10)), "other": set(range(10, 20))}, lambda p: G._BARS.get(p))
        ok("a deploy check counts the samples of one performance together", list(over) == ["opening + whole"] and alone == {},
           (over, alone))
    finally:
        G._PERF.clear()
        G._PERF.update(had)
        for k in ("opening", "whole", "other"):
            G._BARS.pop(k, None)
        shutil.rmtree(data, ignore_errors=True)


def samples():
    """make_sample.py: a sample never carries the recorded hands inline, and the samples' cuts of them, together, stay
    within the cap (the server cuts a sample's taught bars itself). Chopin's Nocturne: 65 bars, a cap of 10. Skipped where
    make_sample.py and the library are not (the public copy of this file)."""
    try:
        import make_sample as MS
        import library  # noqa: F401
    except ImportError as e:
        print(f"SKIP the sample checks: {e}")
        return
    tmp = tempfile.mkdtemp(prefix="ghost_guard_samples_")
    try:
        cv = lambda fixes: dict(piece=dict(id="chopin-nocturne-20"), fixes=[dict(n=i + 1, bars=b, ghost=dict(n=i + 1, bars=b, state="ready"))  # noqa: E731
                                                                             for i, b in enumerate(fixes)])
        res = dict(job=dict(id="x", status="done"), lesson=dict(view=cv([[5], [12], [30]]), parts=[
            dict(title="The B in bar 5", ghost=dict(recorded=dict(rights="public", hands="QUFBQQ=="), label="A recorded performance"))]))
        r = MS.strip(res, {}, "s1")
        ok("a sample's result holds no inline recorded performance (a public one is taken out) and no cut marker of the job's",
           "recorded" not in r["lesson"]["parts"][0]["ghost"] and "QUFBQQ" not in json.dumps(r)
           and not any("ghost" in f for f in r["lesson"]["view"]["fixes"]), r["lesson"])
        ok("and its check refuses one that still holds it",
           any("inline" in x for x in MS.problems(dict(job=dict(id="s1", status="done"), lesson=res["lesson"]), {}, "/nonexistent")))
        a = dict(lesson=dict(view=cv([[5], [12], [30]])))
        b = dict(lesson=dict(view=cv([[40]])))
        same = dict(lesson=dict(view=cv([[12]])))
        ok("the samples' cuts are counted together: 9 bars fit the cap of 10, 12 do not, bars already counted cost nothing",
           MS.ghost_bars(a) == {"chopin-nocturne-20": {4, 5, 6, 11, 12, 13, 29, 30, 31}} and MS.ghost_problems({"a": a}) == []
           and MS.ghost_problems({"a": a, "same": same}) == [] and len(MS.ghost_problems({"a": a, "b": b})) == 1
           and "samples a, b" in MS.ghost_problems({"a": a, "b": b})[0], MS.ghost_problems({"a": a, "b": b}))
        samples_dir = os.path.join(tmp, "samples")
        os.makedirs(os.path.join(samples_dir, "first"))
        json.dump(dict(job=dict(id="first", status="done"), lesson=a["lesson"]), open(os.path.join(samples_dir, "first", "result.json"), "w"))
        job = os.path.join(tmp, "job")
        os.makedirs(os.path.join(job, "work"))
        open(os.path.join(job, "work", "video.mp4"), "wb").write(b"not a video")
        json.dump(dict(job=dict(id="y", status="done"), lesson=b["lesson"]), open(os.path.join(job, "result.json"), "w"))
        try:
            MS.make(job, "second", "A second sample", "yes", "none", samples=samples_dir)
            why = ""
        except MS.Refused as e:
            why = str(e)
        ok("make_sample refuses a sample whose cuts, with the samples already made, go past the cap", "past the cap" in why
           and "samples first, second" in why and not os.path.exists(os.path.join(samples_dir, "second")), why)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def links(data):
    v = view([[5]])
    folder = os.path.join(data, "links", "ghost")
    os.makedirs(os.path.join(data, "links"))
    G.build(data, "job", "f" * 32, v, folder, segment=segment_stub([]), numbers=list(range(0, 300)))
    disk = json.dumps(v)
    ok("what the result keeps on disk is the marker: no key, no link", '"key"' not in disk and "sig=" not in disk
       and v["fixes"][0]["ghost"] == dict(n=1, bars=[4, 6], state="ready"), v["fixes"][0]["ghost"])
    now = 1_800_000_000
    G.attach(v, data, "job", "f" * 32, "/api/jobs/" + "f" * 32 + "/ghost", now=now, index=G.read_index(folder))
    g = v["fixes"][0]["ghost"]
    ok("the reader's view has the link, the key, the expiry and the bars", g.get("url", "").startswith("/api/jobs/" + "f" * 32 + "/ghost/1?exp=")
       and g.get("exp") == now + G.LINK_S and g.get("bars") == [4, 6] and g.get("alg") == "AES-GCM", g)
    exp, sig = int(g["url"].split("exp=")[1].split("&")[0]), g["url"].split("sig=")[1]
    ok("the link is good until it expires", G.verify(data, "job", "f" * 32, 1, exp, sig, now=now + 10)
       and not G.verify(data, "job", "f" * 32, 1, exp, sig, now=exp + 1))
    ok("the link opens that job's fix only", not G.verify(data, "job", "e" * 32, 1, exp, sig, now=now)
       and not G.verify(data, "job", "f" * 32, 2, exp, sig, now=now) and not G.verify(data, "sample", "f" * 32, 1, exp, sig, now=now)
       and not G.verify(data, "job", "f" * 32, 1, exp + 60, sig, now=now) and not G.verify(data, "job", "f" * 32, 1, exp, "0" * 32, now=now)
       and not G.verify(data, "job", "f" * 32, 1, "soon", sig, now=now))
    body = json.loads(G.decrypt(base64.b64decode(g["key"]), G.blob(folder, 1)))
    ok("the key in the view opens the cut, which holds positions and notes, never the performer, rights, why or rotations",
       body.get("hands") == "AAAA" and body.get("fromBar") == 4 and not set(G.DROP) & set(body), body)
    ok("the key is the job's own: another job's does not open it", G.job_key(data, "job", "e" * 32) != base64.b64decode(g["key"]))
    os.environ["TEACHER_GHOST_SECRET"] = "a-different-secret"
    try:
        ok("TEACHER_GHOST_SECRET replaces the secret on file (and every key and link with it)",
           G.job_key(data, "job", "f" * 32) != base64.b64decode(g["key"]))
    finally:
        os.environ.pop("TEACHER_GHOST_SECRET")
    secret_mode = os.stat(os.path.join(data, G.SECRET_FILE)).st_mode & 0o777
    ok("the secret file is the server's alone (0600)", secret_mode == 0o600, oct(secret_mode))
    v2 = view([[5]])
    v2["fixes"][0]["ghost"] = dict(n=1, bars=[4, 6], state="ready")
    G.attach(v2, data, "job", "f" * 32, "/x", index={"1": dict(fallback="3d", reason="cap")})
    ok("a marker whose cut is not on file becomes the fallback", v2["fixes"][0]["ghost"] == dict(fallback="3d", reason="none"))
    ok("a cut that does not exist is None", G.blob(folder, 2) is None and G.blob(folder, "../x") is None and G.blob(folder, 0) is None)
    res = dict(lesson=dict(parts=[dict(ghost=dict(recorded=dict(hands="AAAA"), notes=[1])), dict(ghost=None)]))
    G.strip_recorded(res)
    ok("an inline recorded performance is taken out of a result", res["lesson"]["parts"][0]["ghost"] == dict(notes=[1]))


def speed():
    data, key = os.urandom(500_000), os.urandom(32)
    t = time.perf_counter()
    b = G.encrypt(key, data)
    s = time.perf_counter() - t
    ok(f"a 500 KB cut is encrypted in under 2 s ({s:.2f} s)", s < 2.0 and G.decrypt(key, b) == data)


def phrases():
    """A fix whose correct version plays a phrase (lesson_view's fix.phrase {fromBar, toBar}) is cut for every
    bar of the phrase, and of its own margin, so the recorded hands play every note that sounds; without the cap's room,
    its own bars as before."""
    numbers = list(range(0, 61))
    v = dict(piece="chopin-nocturne-20", fixes=[dict(n=1, bars=[1], phrase=dict(fromBar=0, toBar=4)), dict(n=2, bars=[9])])
    got = G.plan(v, numbers)
    ok("a fix's cut covers the phrase its correct version plays (bars 0 to 4 for bar 1), another fix its margin as before",
       got == [(1, [0, 1, 2, 3, 4], [1]), (2, [8, 9, 10], [9])], got)


if __name__ == "__main__":
    crypto()
    caps()
    phrases()
    passes()
    shared()
    samples()
    speed()
    print(f"{len(PASSES)} of {len(PASSES) + len(FAILS)} passed")
    sys.exit(1 if FAILS else 0)
