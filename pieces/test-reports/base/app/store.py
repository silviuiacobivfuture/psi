"""Durable storage for one CI run's business-rule outcome.

Everything that touches the PVC lives here: writing a received envelope, listing
runs, loading them, and pruning past the retention window. `render.py` is pure
presentation and `app.py` is pure HTTP — this is the only module that knows a
filesystem exists.

LAYOUT
    /data/<app>/<YYYYmmddTHHMMSSZ>-<short-sha>.json

The UTC timestamp leads the filename on purpose: lexicographic order IS
chronological order, so listing a directory sorted gives history for free with no
index file to keep consistent.

DURABILITY
  * Writes are atomic (temp file in the same directory + os.replace). A pod killed
    mid-write leaves the temp file, never a half-parsed report — one corrupt file
    would otherwise poison the index page permanently.
  * Reads that fail to parse are SKIPPED with a warning rather than raising, so a
    single bad file can never take the page down.

RETENTION — 365 days
  Chosen rather than left implicit: a year covers "how did this area behave last
  quarter", which is the question a stakeholder actually asks. Sizing it no longer
  fits: written at 60 KB per run, the largest app's run reached 2.6 MB by 2026-11-04, which
  at ~20 runs a day fills the 10 Gi volume in about 200 days. Pruning happens on ingest (there is no other reliable tick in a service
  with one replica and no scheduler) and only ever deletes files whose own name
  timestamp is older than the window.
"""

import json
import os
import re
import sys
import tempfile
from datetime import datetime, timedelta, timezone

DATA_DIR = os.environ.get("DATA_DIR", "/data")
RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", "365"))

# An app name becomes a directory name, so it is validated as a NAME and never as
# a path: letters, digits, dash, underscore only. Same posture as talk-webhook's
# channel_token — reject, never sanitise-and-continue, so a traversal attempt is
# visible as a 400 rather than silently rewritten.
_APP_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$")
_STEM_RE = re.compile(r"^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9_-]{1,40}$")

FILE_SUFFIX = ".json"


def valid_app(name):
    """True if `name` is safe to use as a directory name."""
    return bool(_APP_RE.match(name or ""))


def valid_stem(stem):
    """True if `stem` is one of OUR generated filenames (no traversal, no glob)."""
    return bool(_STEM_RE.match(stem or ""))


def _app_dir(app):
    return os.path.join(DATA_DIR, app)


def stem_for(envelope, received_at):
    """Filename stem for a run: sortable UTC stamp + the short commit sha."""
    stamp = received_at.strftime("%Y%m%dT%H%M%SZ")
    commit = str(envelope.get("commit") or "")
    short = "".join(c for c in commit[:8] if c.isalnum()) or "nosha"
    return "%s-%s" % (stamp, short)


def save(app, envelope, received_at=None):
    """Persist one envelope. Returns its run id (`<app>/<stem>`)."""
    if not valid_app(app):
        raise ValueError("invalid app name")
    received_at = received_at or datetime.now(timezone.utc)
    envelope = dict(envelope)
    envelope["app"] = app
    # The service's own receipt time, distinct from the run's self-reported one:
    # a sender with a wrong clock must not be able to reorder history.
    envelope["receivedAt"] = received_at.strftime("%Y-%m-%dT%H:%M:%SZ")

    directory = _app_dir(app)
    os.makedirs(directory, exist_ok=True)
    stem = stem_for(envelope, received_at)
    target = os.path.join(directory, stem + FILE_SUFFIX)

    payload = json.dumps(envelope, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".tmp-", suffix=FILE_SUFFIX)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, target)
    except BaseException:
        # Never leave a temp file behind on a failed write.
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise
    return "%s/%s" % (app, stem)


def apps():
    """Every app that has at least one stored run, sorted."""
    try:
        entries = os.listdir(DATA_DIR)
    except OSError:
        return []
    return sorted(e for e in entries if valid_app(e) and os.path.isdir(_app_dir(e)))


def stems(app, limit=None):
    """Run stems for `app`, NEWEST FIRST. `limit` caps how many are returned."""
    if not valid_app(app):
        return []
    try:
        names = os.listdir(_app_dir(app))
    except OSError:
        return []
    found = sorted(
        (n[: -len(FILE_SUFFIX)] for n in names if n.endswith(FILE_SUFFIX)),
        reverse=True,
    )
    found = [s for s in found if valid_stem(s)]
    return found[:limit] if limit else found


def load(app, stem):
    """Parse one stored run, or None if it is missing or unreadable.

    A corrupt file is logged and skipped rather than raised: one bad write must
    not be able to break every page that scans history.
    """
    if not (valid_app(app) and valid_stem(stem)):
        return None
    path = os.path.join(_app_dir(app), stem + FILE_SUFFIX)
    try:
        with open(path, "rb") as handle:
            envelope = json.loads(handle.read().decode("utf-8"))
    except (OSError, ValueError) as exc:
        sys.stderr.write("skipping unreadable report %s/%s: %s\n" % (app, stem, exc))
        return None
    if not isinstance(envelope, dict):
        sys.stderr.write("skipping non-object report %s/%s\n" % (app, stem))
        return None
    envelope.setdefault("app", app)
    envelope["id"] = "%s/%s" % (app, stem)
    envelope["stem"] = stem
    return envelope


def _failing_rules(envelope):
    """{(area, title)} for every rule failing in one run."""
    return {
        (area.get("area") or "", rule.get("title") or "")
        for area in envelope.get("areas") or []
        for rule in area.get("rules") or []
        if rule.get("status") == "failed"
    }


def _reduce(envelope, failing):
    """An older run, holding only what a page reads from a run that is not the newest.

    Its totals and each area's failure count, plus the rules still failing in the newest
    run. A rule dropped here reads as absent, and analysis.failing_since ends a streak on
    absent exactly as it does on passed, so the answer is the same.
    """
    envelope["areas"] = [
        {
            "area": area.get("area") or "",
            "failed": area.get("failed") or 0,
            "rules": [
                rule
                for rule in area.get("rules") or []
                if rule.get("status") == "failed"
                and (area.get("area") or "", rule.get("title") or "") in failing
            ],
        }
        for area in envelope.get("areas") or []
    ]
    return envelope


def history(app, limit):
    """The newest `limit` runs for `app`, newest first, unreadable ones dropped.

    Only the newest run is whole. The largest app's reports reached 2.6 MB by 2026-11-04 and the
    index page asks for 40 of them, which parsed and held at once killed the pod at its
    256 Mi limit; each older run is now reduced as soon as it is read. A single run's
    page goes through load(), whole.
    """
    out = []
    failing = None
    for stem in stems(app, limit=limit):
        envelope = load(app, stem)
        if envelope is None:
            continue
        if failing is None:
            failing = _failing_rules(envelope)
        else:
            envelope = _reduce(envelope, failing)
        out.append(envelope)
    return out


def prune(app, now=None):
    """Delete runs older than the retention window. Returns how many went."""
    if not valid_app(app):
        return 0
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=RETENTION_DAYS)
    removed = 0
    # OLDEST FIRST — stems() is newest-first, so it is reversed here. Sweeping
    # newest-first and breaking on the first in-window file would stop on the very
    # first entry and never delete anything (caught by the offline retention test,
    # which backdates a 400-day file and asserts it goes).
    for stem in reversed(stems(app)):
        try:
            stamped = datetime.strptime(stem.split("-", 1)[0], "%Y%m%dT%H%M%SZ").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            continue  # not one of ours; leave it alone
        if stamped >= cutoff:
            # Sorted ascending, so the first in-window file ends the sweep.
            break
        try:
            os.unlink(os.path.join(_app_dir(app), stem + FILE_SUFFIX))
            removed += 1
        except FileNotFoundError:
            pass  # benign race with another request on a threaded server
        except OSError as exc:
            sys.stderr.write("prune failed for %s/%s: %s\n" % (app, stem, exc))
    return removed


def newest_age_seconds(app, now=None):
    """Seconds since the newest stored run for `app`, or None if there is none.

    Derived from the FILENAME stamp, which this service wrote itself — not from a
    field the sender supplied, so a sender with a broken clock cannot fake
    freshness. This is what the /healthz freshness check reads.
    """
    now = now or datetime.now(timezone.utc)
    newest = stems(app, limit=1)
    if not newest:
        return None
    try:
        stamped = datetime.strptime(newest[0].split("-", 1)[0], "%Y%m%dT%H%M%SZ").replace(
            tzinfo=timezone.utc
        )
    except ValueError:
        return None
    return int((now - stamped).total_seconds())
