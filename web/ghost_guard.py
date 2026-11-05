"""The recorded performance's hands, served only for the bars a lesson teaches (the lesson's design, rule 8: "only the taught
bars are sent to the page: positions only, encrypted per job, behind expiring links; the full performance never leaves the
server").

A lesson's view (lesson_view.build: result.lesson.view) has up to three fixes, each on a few bars of the piece. For each fix
the bars it teaches, plus at most one bar either side (MARGIN_BARS), are cut from the recorded performance by
teacher_performances.segment(piece_id, fromBar, toBar, pass_): positions only, in the written octave, on the reference clock,
from the pass of a repeated bar the fix is about (pass_of: its anchor's played bar in the view's score geometry). A cut the
performance cannot give with the margin is tried on the fix's own bars. The cut is then:

  capped      per job: the first MAX_FIXES fixes only, each its own bars and the margin. Per piece, for every job and every
              sample together, and for every library piece lined up with the same recorded performance together (the
              whole Fur Elise and its opening: ledger_key): the bars ever served are kept in a ledger on the data folder
              (LEDGER_FILE), and a cut that
              would take the bars served past CAP_SHARE of the piece's bars (TEACHER_GHOST_CAP, default 0.15) is tried
              again without its margin, then not served at all: that fix gets the fallback ({fallback: "3d", reason:
              "cap"}), the keyboard close-up without recorded hands. Bars already in the ledger cost nothing again, so
              the union of what was ever sent is bounded whatever the number of codes, days, restarts or samples. The
              token does not get round it: every caller's lesson is built through the same ledger.
  encrypted   AES-256-GCM with a key of the job's own (an HMAC of the job's id under this server's secret), a fresh 12-byte
              nonce per cut; the file is nonce || ciphertext || tag (WebCrypto's AES-GCM layout), kept on the data folder
              beside the job (<job>/ghost/<n>.bin) and never inlined in result.json.
  linked      result.lesson.view.fixes[].ghost = {url, key, exp, n, bars, alg}, filled in only as the job's own reader
              fetches its result (attach): the url is GET /api/jobs/<id>/ghost/<n>?exp=&sig= (or /api/samples/<id>/...),
              signed with an HMAC over the job, the fix and the expiry, good for LINK_S seconds (TEACHER_GHOST_LINK_S,
              default 900); the key is the AES key, base64. What result.json keeps on disk is the marker
              {n, bars, state: "ready"} or the fallback, never a key or a link.

What a cut holds is teacher_performances.segment's own dict as JSON (or its bytes as they are), less the fields named in
DROP (the performer, the rights, why, where it came from, the joint rotations): the page's ghost-recorded.js decrypts it
with WebCrypto and reads it as segment() wrote it.

A deterrent, not DRM: the key and the cleartext exist in the viewer's browser. The control that bounds what can ever be
taken is the ledger.

AES-GCM is done here with numpy (the cipher, counter mode, vectorised) and Python integers (GHASH, a byte table per
key), checked against FIPS-197 and the GCM paper's vectors and against WebCrypto itself (test_ghost_guard.py), so the
server needs no new package; the `cryptography` package is used instead when it is installed. numpy is imported only when
a cut is encrypted, so the cap's arithmetic (plan, fits) runs where it is not installed (deploy/modal/check_deploy.py).
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time

CAP_SHARE = 0.15                       # of a piece's bars, served at most across every job and sample (TEACHER_GHOST_CAP)
MAX_FIXES = 3                          # cuts per job
MARGIN_BARS = 1                        # bars either side of the fix's own
LINK_S = 900                           # a link's life in seconds (TEACHER_GHOST_LINK_S)
LEDGER_FILE = "ghost-ledger.json"      # on the data folder: {"pieces": {ledger_key: {"bars": [...], "total": n, "pieces": [...]}}}
SECRET_FILE = ".ghost-secret"          # on the data folder, made once (0600), unless TEACHER_GHOST_SECRET is set
INDEX_FILE = "index.json"              # in a job's ghost folder: {"<n>": marker}
DROP = ("rot", "rights", "performer", "why", "provenance", "handsFrom", "file", "sha256", "source")
ALG = "AES-GCM"
_LOCK = threading.Lock()


def cap_share():
    """TEACHER_GHOST_CAP as a share of a piece's bars (0 to 1; default CAP_SHARE; a bad value counts as the default)."""
    try:
        v = float(os.environ.get("TEACHER_GHOST_CAP") or CAP_SHARE)
    except ValueError:
        return CAP_SHARE
    return v if 0.0 <= v <= 1.0 else CAP_SHARE


def link_s():
    """TEACHER_GHOST_LINK_S: how long a ghost link holds (30 s to a day; default LINK_S)."""
    try:
        v = int(float(os.environ.get("TEACHER_GHOST_LINK_S") or LINK_S))
    except ValueError:
        return LINK_S
    return v if 30 <= v <= 86400 else LINK_S


# ---------------------------------------------------------------- keys and signatures

def secret(data_dir):
    """This server's ghost secret: TEACHER_GHOST_SECRET when set, else 32 random bytes made once and kept on the data folder
    (so links and keys hold across a restart, and a new data folder starts over)."""
    env = (os.environ.get("TEACHER_GHOST_SECRET") or "").strip()
    if env:
        return env.encode()
    p = os.path.join(data_dir, SECRET_FILE)
    with _LOCK:
        try:
            with open(p, "rb") as f:
                got = f.read()
            if len(got) >= 32:
                return got
        except OSError:
            pass
        os.makedirs(data_dir, exist_ok=True)
        got = secrets.token_bytes(32)
        tmp = p + f".{os.getpid()}.tmp"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(got)
        os.replace(tmp, p)
        return got


def job_key(data_dir, kind, oid):
    """The AES-256 key of one job's (or sample's) cuts: an HMAC of its kind and id under the secret."""
    return hmac.new(secret(data_dir), f"ghost-key:{kind}:{oid}".encode(), "sha256").digest()


def sign(data_dir, kind, oid, n, exp):
    return hmac.new(secret(data_dir), f"ghost-link:{kind}:{oid}:{int(n)}:{int(exp)}".encode(), "sha256").hexdigest()[:32]


def verify(data_dir, kind, oid, n, exp, sig, now=None):
    """Whether ?exp=&sig= is a link this server gave for that cut and it has not expired."""
    try:
        exp = int(exp)
        n = int(n)
    except (TypeError, ValueError):
        return False
    if exp < (now if now is not None else time.time()) or not isinstance(sig, str) or len(sig) != 32:
        return False
    return hmac.compare_digest(sig.encode("utf-8", "replace"), sign(data_dir, kind, oid, n, exp).encode())


# ---------------------------------------------------------------- AES-256-GCM

def _xtime(a):
    return ((a << 1) ^ (0x1B if a & 0x80 else 0)) & 0xFF


def _tables():
    import numpy as np
    exp, log = [0] * 256, [0] * 256
    x = 1
    for i in range(255):
        exp[i], log[x] = x, i
        x ^= _xtime(x)                           # times 3, the field's generator
    sbox = []
    for a in range(256):
        b = 0 if a == 0 else exp[(255 - log[a]) % 255]
        s = b
        for k in range(1, 5):
            s ^= ((b << k) | (b >> (8 - k))) & 0xFF
        sbox.append(s ^ 0x63)
    t0 = [(_xtime(s) << 24) | (s << 16) | (s << 8) | (_xtime(s) ^ s) for s in sbox]
    ror = lambda w, r: ((w >> r) | (w << (32 - r))) & 0xFFFFFFFF            # noqa: E731
    return (np.array(sbox, dtype=np.uint32), np.array(t0, dtype=np.uint32), np.array([ror(w, 8) for w in t0], dtype=np.uint32),
            np.array([ror(w, 16) for w in t0], dtype=np.uint32), np.array([ror(w, 24) for w in t0], dtype=np.uint32))


_AES = []                              # (sbox, T0, T1, T2, T3) as numpy arrays, made on first use


def _t():
    if not _AES:
        _AES.extend(_tables())
    return _AES


def _expand(key):
    """AES-256's 60 round-key words."""
    import numpy as np
    if len(key) != 32:
        raise ValueError("an AES-256 key is 32 bytes")
    sb = [int(v) for v in _t()[0]]
    sub = lambda w: (sb[w >> 24] << 24) | (sb[(w >> 16) & 255] << 16) | (sb[(w >> 8) & 255] << 8) | sb[w & 255]   # noqa: E731
    w = [int.from_bytes(key[4 * i:4 * i + 4], "big") for i in range(8)]
    rcon = 1
    for i in range(8, 60):
        t = w[i - 1]
        if i % 8 == 0:
            t = sub(((t << 8) | (t >> 24)) & 0xFFFFFFFF) ^ (rcon << 24)
            rcon = _xtime(rcon)
        elif i % 8 == 4:
            t = sub(t)
        w.append(w[i - 8] ^ t)
    return np.array(w, dtype=np.uint32)


def _encrypt_blocks(rk, words):
    """AES-256 on n blocks at once: words is (n, 4) uint32, big-endian columns."""
    import numpy as np
    S, _T0, _T1, _T2, _T3 = _t()
    s0, s1, s2, s3 = (words[:, i] ^ rk[i] for i in range(4))
    for r in range(1, 14):
        k = 4 * r
        s0, s1, s2, s3 = (_T0[s0 >> 24] ^ _T1[(s1 >> 16) & 255] ^ _T2[(s2 >> 8) & 255] ^ _T3[s3 & 255] ^ rk[k],
                          _T0[s1 >> 24] ^ _T1[(s2 >> 16) & 255] ^ _T2[(s3 >> 8) & 255] ^ _T3[s0 & 255] ^ rk[k + 1],
                          _T0[s2 >> 24] ^ _T1[(s3 >> 16) & 255] ^ _T2[(s0 >> 8) & 255] ^ _T3[s1 & 255] ^ rk[k + 2],
                          _T0[s3 >> 24] ^ _T1[(s0 >> 16) & 255] ^ _T2[(s1 >> 8) & 255] ^ _T3[s2 & 255] ^ rk[k + 3])

    def last(a, b, c, d, k):
        return ((S[a >> 24] << 24) | (S[(b >> 16) & 255] << 16) | (S[(c >> 8) & 255] << 8) | S[d & 255]) ^ rk[k]
    return np.stack([last(s0, s1, s2, s3, 56), last(s1, s2, s3, s0, 57), last(s2, s3, s0, s1, 58), last(s3, s0, s1, s2, 59)], axis=1)


def aes_block(key, block):
    """One 16-byte block under AES-256 (the tests' FIPS-197 check)."""
    import numpy as np
    words = np.frombuffer(block, dtype=">u4").astype(np.uint32).reshape(1, 4)
    return _encrypt_blocks(_expand(key), words).astype(">u4").tobytes()


def _ghash_tables(h):
    """GHASH's multiplication by H as 16 byte tables (for byte position b, every byte value's product)."""
    p, v = [], h
    for _ in range(128):
        p.append(v)
        v = (v >> 1) ^ (0xE1 << 120) if v & 1 else v >> 1
    tabs = []
    for b in range(16):
        t = [0] * 256
        for x in range(1, 256):
            low = x & -x
            t[x] = t[x ^ low] ^ p[8 * b + 7 - (low.bit_length() - 1)]
        tabs.append(t)
    return tabs


def _ghash(tabs, data):
    y = 0
    for i in range(0, len(data), 16):
        y ^= int.from_bytes(data[i:i + 16].ljust(16, b"\0"), "big")
        z = 0
        for b in range(16):
            z ^= tabs[b][(y >> (120 - 8 * b)) & 255]
        y = z
    return y


def _gcm(key, iv, data, decrypt=False, tag=None):
    import numpy as np
    rk = _expand(key)
    if len(iv) != 12:
        raise ValueError("the nonce is 12 bytes")
    zero = np.zeros((1, 4), dtype=np.uint32)
    h = int.from_bytes(_encrypt_blocks(rk, zero).astype(">u4").tobytes(), "big")
    ivw = np.frombuffer(iv, dtype=">u4").astype(np.uint32)
    n = (len(data) + 15) // 16
    ctr = np.empty((n + 1, 4), dtype=np.uint32)
    ctr[:, 0], ctr[:, 1], ctr[:, 2] = ivw
    ctr[:, 3] = np.arange(1, n + 2, dtype=np.uint64).astype(np.uint32)        # J0 = counter 1, the data from 2
    stream = _encrypt_blocks(rk, ctr).astype(">u4").tobytes()
    ek_j0, ks = stream[:16], stream[16:16 + len(data)]
    out = (np.frombuffer(data, dtype=np.uint8) ^ np.frombuffer(ks, dtype=np.uint8)).tobytes()
    ct = data if decrypt else out
    tabs = _ghash_tables(h)
    s = _ghash(tabs, ct + b"\0" * (-len(ct) % 16) + (0).to_bytes(8, "big") + (8 * len(ct)).to_bytes(8, "big"))
    t = (s ^ int.from_bytes(ek_j0, "big")).to_bytes(16, "big")
    if decrypt and not hmac.compare_digest(t, tag or b""):
        raise ValueError("the tag does not match")
    return out, t


def encrypt(key, plaintext, iv=None):
    """nonce || ciphertext || tag under AES-256-GCM, no associated data (what WebCrypto's decrypt takes, after the nonce)."""
    iv = iv or secrets.token_bytes(12)
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        return iv + AESGCM(key).encrypt(iv, plaintext, None)
    except ImportError:
        ct, tag = _gcm(key, iv, plaintext)
        return iv + ct + tag


def decrypt(key, blob):
    """encrypt's inverse; ValueError when the blob was changed or the key is not its own."""
    if len(blob) < 28:
        raise ValueError("too short to be a cut")
    iv, body, tag = blob[:12], blob[12:-16], blob[-16:]
    pt, _ = _gcm(key, iv, body, decrypt=True, tag=tag)
    return pt


# ---------------------------------------------------------------- which bars, and the ledger

def piece_of(view):
    """The library piece id a view is about (view.piece or view.score.piece: an id, or a dict with one), or None."""
    if not isinstance(view, dict):
        return None
    for v in (view.get("piece"), (view.get("score") or {}).get("piece") if isinstance(view.get("score"), dict) else None):
        if isinstance(v, str) and v:
            return v
        if isinstance(v, dict) and isinstance(v.get("id"), str) and v["id"]:
            return v["id"]
    return None


def fix_bars(fix):
    """(first, last) written bar a fix teaches: its bars (a list of bar numbers, or {fromBar, toBar}), else its anchor's
    bar; None when it names none."""
    b = fix.get("bars") if isinstance(fix, dict) else None
    got = []
    if isinstance(b, list):
        got = [x for x in b if isinstance(x, int) and not isinstance(x, bool)]
        got += [x for y in b if isinstance(y, list) for x in y if isinstance(x, int) and not isinstance(x, bool)]
    elif isinstance(b, dict):
        got = [x for x in (b.get("fromBar"), b.get("toBar"), b.get("from"), b.get("to")) if isinstance(x, int) and not isinstance(x, bool)]
    if not got and isinstance(fix, dict) and isinstance(fix.get("anchor"), dict) and isinstance(fix["anchor"].get("bar"), int):
        got = [fix["anchor"]["bar"]]
    return (min(got), max(got)) if got else None


def pass_of(view, fix):
    """Which pass of a repeated bar a fix is about (1, 2, ...): its anchor's played bar (anchor.k) as the view's score
    geometry numbers it (score.geom.bars [{k, m, p}]), so a fix in a repeat's second time is cut from the recorded
    performance's second time; None when the view does not say (segment() then takes the bar's first pass)."""
    a = fix.get("anchor") if isinstance(fix, dict) else None
    k = a.get("k") if isinstance(a, dict) else None
    score = view.get("score") if isinstance(view, dict) and isinstance(view.get("score"), dict) else {}
    geom = score.get("geom") if isinstance(score.get("geom"), dict) else {}
    if not isinstance(k, int) or isinstance(k, bool):
        return None
    for b in geom.get("bars") or []:
        if isinstance(b, dict) and b.get("k") == k:
            p = b.get("p", b.get("pass"))
            return p if isinstance(p, int) and not isinstance(p, bool) and p >= 1 else None
    return None


_BARS = {}


def piece_bar_numbers(piece_id):
    """The piece's written bar numbers, sorted (the library's piece, internal ones included: this is only counted, never
    served); None when it cannot be read."""
    if piece_id in _BARS:
        return _BARS[piece_id]
    got = None
    try:
        import library as L
        pc = L.load(piece_id, internal=True)
        got = sorted({int(b["bar"]) for b in pc.bars if isinstance(b.get("bar"), int)}) or None
    except Exception:
        got = None
    _BARS[piece_id] = got
    return got


_PERF = {}


def performances():
    """{library piece id: the recorded performance it is lined up with (its GRP2's sha256, else its file name)}, read from
    teacher_performances.py's PERFORMANCES as source (no import: that module needs numpy, and the deploy check runs where
    numpy is not), once a process."""
    if "table" not in _PERF:
        import ast
        out = {}
        try:
            with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "teacher_performances.py"), encoding="utf-8") as f:
                tree = ast.parse(f.read())
            for n in tree.body:
                if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "PERFORMANCES" for t in n.targets) \
                        and isinstance(n.value, ast.Dict):
                    for k, v in zip(n.value.keys, n.value.values):
                        kw = {x.arg: x.value for x in getattr(v, "keywords", [])}
                        got = [kw[a].value for a in ("sha256", "file") if isinstance(kw.get(a), ast.Constant) and isinstance(kw[a].value, str)]
                        if isinstance(k, ast.Constant) and isinstance(k.value, str) and got:
                            out[k.value] = got[0]
        except (OSError, SyntaxError, ValueError):
            out = {}
        _PERF["table"] = out
    return _PERF["table"]


def ledger_key(piece_id):
    """What the ledger counts for a piece: the recorded performance, not the library piece, so two pieces lined up with
    one performance (the whole Fur Elise and its opening) share one count ("perf:" and the GRP2's sha256's first 16 hex
    digits); a piece with no recorded performance listed counts by its own id."""
    perf = performances().get(piece_id)
    return f"perf:{perf[:16]}" if perf else piece_id


def sharing(piece_id):
    """The library pieces lined up with the same recorded performance as piece_id (itself first)."""
    perf = performances().get(piece_id)
    return [piece_id] + sorted(p for p, v in performances().items() if perf and v == perf and p != piece_id)


def cap_total(piece_id, numbers=None, numbers_of=None):
    """The bars the cap is a share of: the most bars of any piece lined up with that performance (the whole piece, not
    its opening). numbers: piece_id's own bar numbers when the caller has them."""
    numbers_of = numbers_of or piece_bar_numbers
    best = len(numbers if numbers is not None else (numbers_of(piece_id) or ()))
    for p in sharing(piece_id)[1:]:
        best = max(best, len(numbers_of(p) or ()))
    return best


def _ledger_path(data_dir):
    return os.path.join(data_dir, LEDGER_FILE)


def ledger(data_dir):
    """{ledger_key: {"bars": [served bar numbers], "total": the bars the cap is a share of, "pieces": [library ids]}} as
    kept on the data folder ({} when none)."""
    try:
        with open(_ledger_path(data_dir)) as f:
            got = json.load(f)
        got = got.get("pieces") if isinstance(got, dict) else None
        return got if isinstance(got, dict) else {}
    except (OSError, ValueError):
        return {}


def _save_ledger(data_dir, pieces):
    os.makedirs(data_dir, exist_ok=True)
    tmp = _ledger_path(data_dir) + f".{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp, "w") as f:
        json.dump(dict(pieces=pieces, updated=round(time.time())), f)
    os.replace(tmp, _ledger_path(data_dir))


def cap_bars(total, share=None):
    """The most bars of a piece of `total` bars that may ever be served."""
    share = cap_share() if share is None else share
    return max(1, int(round(share * total))) if total else 0


def reserve(data_dir, piece_id, bars, numbers):
    """Takes `bars` (written bar numbers) of piece_id's recorded performance in the ledger (ledger_key) when the bars
    ever served of it stay within the cap; True when they may be served (those already in the ledger cost nothing).
    numbers: the piece's bar numbers."""
    if not numbers:
        return False
    key, total = ledger_key(piece_id), cap_total(piece_id, numbers)
    with _LOCK:
        pieces = ledger(data_dir)
        row = pieces.get(key) if isinstance(pieces.get(key), dict) else {}
        held = {b for b in row.get("bars") or [] if isinstance(b, int)}
        want = set(bars)
        if len(held | want) > cap_bars(total):
            return False
        if want - held:
            names = sorted({p for p in row.get("pieces") or [] if isinstance(p, str)} | {piece_id})
            pieces[key] = dict(bars=sorted(held | want), total=total, pieces=names)
            _save_ledger(data_dir, pieces)
        return True


def fits(pieces_bars, numbers_of, served=None, share=None):
    """For a deploy check: {piece or pieces: problem} for each recorded performance whose bars (pieces_bars {piece: set
    of bars}, pieces of one performance counted together, with `served` {piece: set} already in a ledger) would go past
    the cap. numbers_of(piece) -> its bar numbers."""
    by_key, names = {}, {}
    for pid, bars in list(pieces_bars.items()) + list((served or {}).items()):
        k = ledger_key(pid)
        by_key.setdefault(k, set()).update(bars or ())
        names.setdefault(k, set()).add(pid)
    out = {}
    for k, held in by_key.items():
        if not any(p in pieces_bars for p in names[k]):
            continue
        label = " + ".join(sorted(names[k]))
        total = max(cap_total(p, numbers_of=numbers_of) for p in names[k])
        if not total:
            out[label] = "its bars cannot be counted"
        elif len(held) > cap_bars(total, share):
            out[label] = f"{len(held)} of its {total} bars, over the cap of {cap_bars(total, share)}"
    return out


def span(numbers, lo, hi, margin):
    """The bar numbers from lo - margin to hi + margin that the piece has."""
    return [b for b in numbers if lo - margin <= b <= hi + margin]


def plan(view, numbers):
    """[(n, [bar numbers with the margin], [bar numbers without])] for the fixes a job may get a cut for (the first
    MAX_FIXES, each with bars the piece has)."""
    out = []
    for fix in (view.get("fixes") or [])[:MAX_FIXES] if isinstance(view, dict) else []:
        fb = fix_bars(fix)
        n = fix.get("n") if isinstance(fix, dict) else None
        if fb is None or not isinstance(n, int) or isinstance(n, bool):
            continue
        wide, own = span(numbers, fb[0], fb[1], MARGIN_BARS), span(numbers, fb[0], fb[1], 0)
        # the phrase its correct version plays (lesson_view): the hands for every bar of it, so the ghost
        # plays the notes that sound (with the margin as before where the phrase is shorter)
        ph = fix.get("phrase") if isinstance(fix.get("phrase"), dict) else {}
        pa, pb = ph.get("fromBar"), ph.get("toBar")
        if isinstance(pa, int) and isinstance(pb, int) and not isinstance(pa, bool) and not isinstance(pb, bool) and pa <= pb:
            wide = sorted(set(wide) | set(span(numbers, pa, pb, 0)))
        if own:
            out.append((n, wide, own))
    return out


# ---------------------------------------------------------------- building a job's cuts, and its links

def _clean(seg):
    """What of segment()'s answer is encrypted: its dict without DROP's fields, as JSON; bytes as they are."""
    if isinstance(seg, (bytes, bytearray)):
        return bytes(seg)
    if isinstance(seg, dict):
        return json.dumps({k: v for k, v in seg.items() if k not in DROP}, separators=(",", ":")).encode()
    return None


def _segment_fn():
    try:
        import teacher_performances as TP
    except Exception:
        return None
    fn = getattr(TP, "segment", None)
    return fn if callable(fn) else None


def build(data_dir, kind, oid, view, folder, segment=None, numbers=None):
    """The cuts of one job's (kind "job") or sample's (kind "sample") view: each of its first MAX_FIXES fixes gets
    view.fixes[].ghost = {n, bars: [from, to], state: "ready"} with its encrypted cut in folder/<n>.bin, or {fallback: "3d",
    reason} ("cap": past the piece's cap; "none": no recorded performance for those bars); fixes after the third get
    {fallback: "3d", reason: "max"}. The index is kept in folder/index.json; returns it ({str(n): marker}). Never raises for
    a missing piece or performance: those fixes get the fallback."""
    segment = segment or _segment_fn()
    pid = piece_of(view)
    numbers = numbers if numbers is not None else (piece_bar_numbers(pid) if pid else None)
    index = {}
    fixes = [f for f in (view.get("fixes") or []) if isinstance(f, dict)] if isinstance(view, dict) else []
    planned = {n: (wide, own) for n, wide, own in plan(view, numbers or [])}
    key = None
    for k, fix in enumerate(fixes):
        n = fix.get("n")
        marker = dict(fallback="3d", reason="max" if k >= MAX_FIXES else "none")
        if k < MAX_FIXES and n in planned and pid and segment is not None:
            ps = pass_of(view, fix)
            for bars in planned[n]:                # with the margin, then without it
                try:
                    seg = segment(pid, bars[0], bars[-1], pass_=ps) if ps else segment(pid, bars[0], bars[-1])
                    body = _clean(seg)
                except Exception:
                    body = None
                if not body:                       # no recorded performance for these bars (nothing counted): the next try
                    continue
                if not reserve(data_dir, pid, bars, numbers):
                    marker = dict(fallback="3d", reason="cap")
                    continue
                key = key or job_key(data_dir, kind, oid)
                os.makedirs(folder, exist_ok=True)
                tmp = os.path.join(folder, f"{n}.bin.tmp")
                with open(tmp, "wb") as f:
                    f.write(encrypt(key, body))
                os.replace(tmp, os.path.join(folder, f"{n}.bin"))
                marker = dict(n=n, bars=[bars[0], bars[-1]], state="ready")
                break
        fix["ghost"] = marker
        if isinstance(n, int):
            index[str(n)] = marker
    if fixes:
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, INDEX_FILE), "w") as f:
            json.dump(index, f)
    return index


def read_index(folder):
    try:
        with open(os.path.join(folder, INDEX_FILE)) as f:
            got = json.load(f)
        return got if isinstance(got, dict) else None
    except (OSError, ValueError):
        return None


def attach(view, data_dir, kind, oid, base, now=None, index=None):
    """The view as its own reader gets it: every fix whose cut is ready gets {url, key, exp, n, bars, alg} (a fresh link
    from base, e.g. "/api/jobs/<id>/ghost"), any other keeps its fallback; a marker with no cut on file (index given and
    not ready there) becomes the fallback. Returns the view (changed in place)."""
    now = int(now if now is not None else time.time())
    exp = now + link_s()
    key = None
    for fix in (view.get("fixes") or []) if isinstance(view, dict) else []:
        g = fix.get("ghost") if isinstance(fix, dict) else None
        if not isinstance(g, dict):
            continue
        n = g.get("n")
        ready = g.get("state") == "ready" and isinstance(n, int) and (index is None or (index.get(str(n)) or {}).get("state") == "ready")
        if not ready:
            fix["ghost"] = dict(fallback="3d", reason=g.get("reason") if g.get("fallback") else "none")
            continue
        key = key or base64.b64encode(job_key(data_dir, kind, oid)).decode()
        fix["ghost"] = dict(url=f"{base}/{n}?exp={exp}&sig={sign(data_dir, kind, oid, n, exp)}", key=key, exp=exp, n=n,
                            bars=g.get("bars"), alg=ALG)
    return view


def blob(folder, n):
    """The encrypted cut n of a job's ghost folder, or None."""
    try:
        n = int(n)
    except (TypeError, ValueError):
        return None
    p = os.path.join(folder, f"{n}.bin")
    if n < 1 or not os.path.isfile(p):
        return None
    with open(p, "rb") as f:
        return f.read()


def strip_recorded(x):
    """A result with every inline recorded performance taken out (lesson.parts[].ghost.recorded, the GRP2's hands as
    base64, which the lesson built before this guard): the recorded hands leave the server only as cuts."""
    lesson = x.get("lesson") if isinstance(x, dict) else None
    for p in (lesson.get("parts") or []) if isinstance(lesson, dict) else []:
        g = p.get("ghost") if isinstance(p, dict) else None
        if isinstance(g, dict) and "recorded" in g:
            g.pop("recorded", None)
    return x
