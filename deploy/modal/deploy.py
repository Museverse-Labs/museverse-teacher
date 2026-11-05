#!/usr/bin/env python3
"""Deploys modal_app.py, but only while no upload is being analysed. Run it with the Modal client's venv.

    .modal-venv/bin/python deploy/modal/deploy.py             # check_deploy.py, the busy check, then the deploy
    .modal-venv/bin/python deploy/modal/deploy.py --dry-run   # everything but the deploy itself
    .modal-venv/bin/python deploy/modal/deploy.py --force     # deploy even while a job runs (it is cut off)
    .modal-venv/bin/python deploy/modal/deploy.py --regenerate-new   # rewrite an out-of-date What's new list without asking

Why: `modal deploy --strategy recreate` stops the running container before the new one serves (two containers on
one data volume would each run the queue). A job it stops is queued again at the next start and starts over from
the beginning, using one of its two attempts (web/server.py _requeue): a second cut leaves it failed. And
/api/health's "queue" cannot tell: it is QUEUE.qsize(), which leaves out the job the worker has already taken off
the queue, so it reads 0 while that job runs.

Steps:
  1. check_deploy.py (no network); stop on a FAIL.
  1b. web/make_new_page.py --check: the What's new page (static/new/built.json, which the image carries from the working
     tree) must list the commits being deployed. Out of date: it asks whether to write it again (--regenerate-new: without
     asking; with no terminal and no --regenerate-new it stops), then goes on; commit the new built.json afterwards, on
     its own: a commit that changes only that file is not listed, so the list stays current after it.
  2. Is a container of this app running (`modal container list --app-id ... --json`)? No: nothing can be mid-job.
  3. Yes: GET <app URL>/api/modal/busy with TEACHER_TOKEN (modal_app.py answers it from the server's own job table).
     Asked for with a hidden prompt when TEACHER_TOKEN is not in the environment; never printed. Anything running
     or queued: stop, and say how many (--wait N waits up to N minutes for them to finish instead).
  4. modal deploy --strategy recreate modal_app.py (the TEACHER_MODAL_* settings in this environment apply).
A new upload can still arrive between step 3 and the stop; deploy when nobody is using the app.
"""
import argparse
import getpass
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
APP_NAME = os.environ.get("TEACHER_MODAL_APP", "").strip() or "museverse-teacher"   # as modal_app.py reads it
BUSY_PATH = "/api/modal/busy"                                                   # modal_app.BUSY_PATH
NEW_PAGE = os.path.join(HERE, "..", "..", "web", "make_new_page.py")             # writes web/static/new/built.json


def modal_cli(*args):
    return subprocess.run([sys.executable, "-m", "modal", *args], capture_output=True, text=True)


def running_containers():
    """The containers of this app now, or None when the app has never been deployed."""
    import modal
    try:
        app = modal.App.lookup(APP_NAME)
    except modal.exception.NotFoundError:
        return None
    except modal.exception.AuthError as e:
        raise SystemExit(f"not logged in to Modal ({e.__class__.__name__}): run `modal token new`, or set "
                         "MODAL_TOKEN_ID and MODAL_TOKEN_SECRET (DEPLOY.md step 3)") from None
    r = modal_cli("container", "list", "--app-id", app.app_id, "--json")
    if r.returncode != 0:
        raise SystemExit(f"modal container list failed: {r.stderr.strip()[-400:]}")
    rows = json.loads(r.stdout or "[]")
    return [x for x in rows if x.get("app_id") == app.app_id]


def app_url(given):
    if given:
        return given.rstrip("/")
    import modal
    url = modal.Function.from_name(APP_NAME, "web").get_web_url()
    if not url:
        raise SystemExit(f"no web URL for {APP_NAME}/web: pass --url")
    return url.rstrip("/")


def busy(url, token):
    r = urllib.request.Request(url + BUSY_PATH, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(r, timeout=600) as resp:          # a cold start can be in front of it
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise SystemExit("the app refused the token: TEACHER_TOKEN must be the value in the Modal secret") from None
        if e.code == 404:
            raise SystemExit(f"{url}{BUSY_PATH} is not there: the deployed app is older than this modal_app.py. Check "
                             "`modal app logs` for a running job, then deploy with --force") from None
        raise


def new_page(regenerate, dry_run):
    """make_new_page.py --check: 0 current; 1 behind the git log, so offer to write it again (or do so with
    regenerate); 2 git could not be read, which is said and does not stop the deploy."""
    r = subprocess.run([sys.executable, NEW_PAGE, "--check"], capture_output=True, text=True)
    if r.returncode == 0:
        print("What's new: static/new/built.json lists every commit being deployed")
        return
    if r.returncode != 1:
        why = (r.stderr.strip().splitlines() or ["no reason given"])[-1]
        print(f"WARN What's new: make_new_page.py could not check the list ({why}); it ships as it is")
        return
    print("What's new: static/new/built.json is behind the git log (a commit since it was written is not listed)")
    if dry_run:
        print("dry run: the deploy would offer to write it again (make_new_page.py)")
        return
    if not regenerate:
        if not sys.stdin.isatty():
            sys.exit("not deploying: run web/make_new_page.py (or deploy.py --regenerate-new), then deploy again")
        if input("write it again now from the git log? [Y/n] ").strip().lower() not in ("", "y", "yes"):
            sys.exit("not deploying with an out-of-date What's new page: run web/make_new_page.py, or answer yes")
    w = subprocess.run([sys.executable, NEW_PAGE], capture_output=True, text=True)
    if w.returncode != 0:
        sys.exit(f"make_new_page.py failed: {(w.stderr.strip().splitlines() or ['?'])[-1]}")
    print("What's new: written again; commit web/static/new/built.json on its own after the deploy (that commit is not listed)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", help="the app's URL (default: looked up from Modal)")
    ap.add_argument("--wait", type=float, default=0, help="minutes to wait for running and queued jobs to finish")
    ap.add_argument("--force", action="store_true", help="deploy even while a job runs: it is cut off and retried")
    ap.add_argument("--dry-run", action="store_true", help="every check, then print the deploy command")
    ap.add_argument("--skip-check", action="store_true", help="do not run check_deploy.py first")
    ap.add_argument("--regenerate-new", action="store_true",
                    help="write the What's new list again without asking when it is behind the git log")
    a = ap.parse_args()

    if not a.skip_check:
        print("check_deploy.py ...", flush=True)
        r = subprocess.run([sys.executable, os.path.join(HERE, "check_deploy.py")], capture_output=True, text=True)
        tail = [ln for ln in r.stdout.splitlines() if ln.startswith(("FAIL", "WARN"))] + r.stdout.splitlines()[-1:]
        print("\n".join(f"  {ln}" for ln in tail))
        if r.returncode != 0:
            sys.exit("check_deploy.py failed: fix the FAIL lines first (run it alone for the full output)")
    new_page(a.regenerate_new, a.dry_run)

    if a.force:
        print("--force: not checking for running jobs")
    else:
        rows = running_containers()
        if rows is None:
            print(f"{APP_NAME} has not been deployed yet: no job can be running")
        elif not rows:
            print(f"no container of {APP_NAME} is running: no job can be running")
        else:
            url = app_url(a.url)
            token = os.environ.get("TEACHER_TOKEN") or getpass.getpass("TEACHER_TOKEN (the value in the Modal secret): ")
            deadline = time.time() + a.wait * 60
            while True:
                b = busy(url, token)
                n = int(b.get("running", 0)) + int(b.get("queued", 0))
                if n == 0:
                    print(f"{len(rows)} container(s) up, no job running or queued")
                    break
                msg = f"{b.get('running')} job(s) running and {b.get('queued')} queued (keep-alive: {b.get('keepAlive')})"
                if time.time() >= deadline:
                    sys.exit(f"not deploying: {msg}. Deploying now would cut them off; wait (--wait 30), or --force")
                print(f"waiting: {msg}", flush=True)
                time.sleep(30)

    cmd = [sys.executable, "-m", "modal", "deploy", "--strategy", "recreate", os.path.join(HERE, "modal_app.py")]
    if a.dry_run:
        print("dry run; would run: " + " ".join(cmd))
        return
    sys.exit(subprocess.run(cmd).returncode)


if __name__ == "__main__":
    main()
