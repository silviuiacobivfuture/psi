"""A notice given up on: estate-watch's check that somebody was not told, and nothing will try again.

Each sender keeps what it gave up on in a durable row, and answers GET <its address> with names and
counts for the last day, behind CRON_WATCH_KEY: {"netrimise": {"<event>": <n>}}. An answer may carry
other fields (an application's cron log can answer with the same field); only this one is read. The
senders are the estate's: NOTICE_SOURCES {"<app>": "<address>"}, from the estate's component. This
reads each one, and reports one finding per application and event. doctor.sh reads the rows
themselves, on demand; this is what reaches #infra.

A sender whose sweep never gives up is not listed: it tries again at its next tick and says so itself.

A FINDING RECOVERS WHEN IT LEAVES THE DAY, not when somebody was told: the row stands, with its reason,
for 30 days, and the message says where. Nothing here can tell them.

AN UNREADABLE SENDER IS NOT A VERDICT. One that cannot be read keeps what it last said, the others go
on, and one line says "could not check" after CANNOT_GRACE. So an outage of one cannot blind the
others, and it cannot read as a recovery.

ONLY NAMES AND COUNTS LEAVE. An answer holding anything else is treated as unreadable and never
repeated, so a sender that went wrong cannot put a person's name into #infra. The key goes to these
addresses and nowhere else. State is the `notices.json` key of estate-watch-state, beside the engine's
own. Cases: tests/notice_watch_cases.py.
"""
import json
import os
import re
import urllib.error
import urllib.request

HOUR = 3600
CANNOT_GRACE = 2 * HOUR
TIMEOUT = 8
NAME = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
STATE_KEY = "notices.json"
TEXT_FIX = "Its reason is on the row: scripts/notificari-netrimise.sh dev --check, then the sender's notificariDeTrimis or queue."


class Unreadable(Exception):
    """This sender did not answer with names and counts. Not a verdict about what it sent."""


def counts_of(raw):
    """The answer's counts, or Unreadable. Reads only `netrimise`, whatever else the answer holds."""
    try:
        body = json.loads(raw)
    except ValueError as e:
        raise Unreadable("an answer that is not JSON") from e
    field = body.get("netrimise") if isinstance(body, dict) else None
    if not isinstance(field, dict):
        raise Unreadable("an answer without its counts")
    out = {}
    for name, n in field.items():
        if not NAME.match(name) or isinstance(n, bool) or not isinstance(n, int) or n < 0:
            raise Unreadable("an answer that is not names and counts")
        if n > 0:
            out[name] = n
    return out


def ask(url, key):
    """One sender's counts. An HTTP status and nothing else of what it said goes into the reason."""
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:  # noqa: S310  # nosec: addresses from the CronJob's env
            return counts_of(res.read().decode())
    except urllib.error.HTTPError as e:
        raise Unreadable(f"it answered HTTP {e.code}") from e
    except (urllib.error.URLError, TimeoutError, OSError, UnicodeDecodeError) as e:
        raise Unreadable("it did not answer") from e


def load(cfg, kube, cannot_tell, key=STATE_KEY):
    code, text = kube.request(f"/api/v1/namespaces/{cfg.state_ns}/configmaps/{cfg.state_cm}")
    if code != 200:
        raise cannot_tell(f"its state ConfigMap is unreadable (HTTP {code})")
    raw = json.loads(text).get("data", {}).get(key, "")
    return json.loads(raw) if raw else {}


def save(cfg, kube, state, cannot_tell, key=STATE_KEY):
    body = json.dumps({"data": {key: json.dumps(state, sort_keys=True)}}).encode()
    headers = dict(kube.headers)
    headers["Content-Type"] = "application/merge-patch+json"
    path = f"{kube.base}/api/v1/namespaces/{cfg.state_ns}/configmaps/{cfg.state_cm}"
    req = urllib.request.Request(path, data=body, headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=10, context=kube.context) as r:  # noqa: S310  # nosec: the API server
            code = r.status
    except urllib.error.HTTPError as e:
        code = e.code
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise cannot_tell("what it read could not be saved") from e
    if code != 200:
        raise cannot_tell(f"what it read could not be saved (HTTP {code})")


def check(cfg, kube, finding, cannot_tell):
    sources = json.loads(os.environ.get("NOTICE_SOURCES", "{}"))
    if not sources:
        return []
    if not cfg.ops_key:
        raise cannot_tell("no CRON_WATCH_KEY")
    state = load(cfg, kube, cannot_tell)
    before = json.dumps(state, sort_keys=True)
    out = []
    for app in sorted(sources):
        try:
            state[app] = ask(sources[app], cfg.ops_key)
        except Unreadable as e:
            out.append(finding(
                f"notice-cannot:{app}", "warn",
                f"Could not check which notices {app} gave up on: {e}. This is not a clean bill.",
                CANNOT_GRACE,
            ))
        for event, n in state.get(app, {}).items():
            out.append(finding(
                f"notice-given-up:{app}:{event}", "fail",
                f"{app} gave up on notice {event} ({n} in the last day): people were not told, and nothing will try again. {TEXT_FIX}",
            ))
    for gone in set(state) - set(sources):
        del state[gone]
    if json.dumps(state, sort_keys=True) != before:
        save(cfg, kube, state, cannot_tell)
    return out
