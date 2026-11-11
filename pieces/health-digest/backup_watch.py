"""Backups that do not finish, and WAL that does not reach the bucket: two estate-watch checks.

Reads only. A separate file because estate_watch.py is at its ceiling. Cases: tests/backup_watch_cases.py.

A RUN IS JUDGED BY WHETHER ITS VOLUMES MOVE, with doctor's bounds (velero-run-bounds.json, the one
copy; a test runs both judges on the same runs). check_backups reads finished runs only, so before
this #infra heard of a stall at Velero's 4h limit, or at 12h if Velero itself was wedged. Slow,
stuck and overdue are separate keys because each asks for something else: leave it, read why,
restart it. A run that gets worse says so once at each step, and all of them recover together when
it ends. What it ended as stays check_backups' to judge, whatever the error: no class of error is
harmless here. The volumes are read only while a run is open, and only that run's, by label.

WAL FAILURES ARE ONE EPISODE, NOT ONE MESSAGE EACH. Measured in Axiom over 30 days: 1719 failed
attempts on 9 clusters (10-15), 1565 on 9 (10-18), 35 on 12 (11-05), and one alone on 10-30 that
retried and was fine. So the whole estate holds one episode, one key: one message opening it, one
closing it, a reminder at most daily. Each constant below is one of those shapes:

  OPEN_ATTEMPTS  the lone failure of 10-30 says nothing; the first ten minutes of 11-05 held 7.
  QUIET_SECS     the longest silence inside an episode was 54 minutes (10-18), so 90 minutes without
                 a failure, anywhere, ends it. Shorter, and 10-18 reads as two episodes.
  BEHIND_SECS    a segment waiting with nothing archived for half an hour. An archiver that hangs
                 counts no failure at all, and that alone opens an episode.

WHERE THE FIGURES COME FROM. pg_stat_archiver, as each primary's own exporter serves it on :9187,
with no credential. `ContinuousArchiving` read True all through 11-05 and says none of this. The
address is the -rw Service's EndpointSlice: that verb shows an address and a pod name, where
reading pods cluster-wide would show every pod's spec. The counter survives a missed tick, so
nothing is lost between ticks; it is compared with itself, and its first reading is a baseline, so
years of old failures are never news. A reset starts it again from zero.

AN UNREADABLE PRIMARY IS NOT A VERDICT. It keeps what it knew, the others go on, one line names them
after CANNOT_GRACE, and no episode closes while any of them cannot be read. State is the `wal.json`
key of estate-watch-state, beside the engine's own.
"""
import concurrent.futures
import json
import math
import os
import urllib.error
import urllib.request
from calendar import timegm
from datetime import datetime, timezone
from time import strptime

import notice_watch

HOUR = 3600
OPEN_ATTEMPTS = 3
QUIET_SECS = 90 * 60
BEHIND_SECS = 30 * 60
CANNOT_GRACE = 2 * HOUR
TIMEOUT = 8
STATE_KEY = "wal.json"
VELERO = "/apis/velero.io/v1/namespaces/velero"
VOLUME_OVER = ("Completed", "Failed", "Canceled")
BOUNDS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "velero-run-bounds.json")
FIGURES = {
    "failed": "cnpg_pg_stat_archiver_failed_count",
    "archived": "cnpg_pg_stat_archiver_archived_count",
    "last_failed": "cnpg_pg_stat_archiver_last_failed_time",
    "reset": "cnpg_pg_stat_archiver_stats_reset_time",
    "ready": 'cnpg_collector_pg_wal_archive_status{value="ready"}',
}
NAMED_SHOWN = 5
TEXT_SLOW = "Slow is not stuck: leave it running. Restarting Velero throws the run away (RUNBOOK 2026-11-05)."
TEXT_STUCK = "Velero ends it at 4h by itself. Read: kubectl -n velero get podvolumebackups -l velero.io/backup-name={name}"
TEXT_OVERDUE = "It will not end by itself. scripts/repair.sh {env}, step 'Velero run past its limit', says what restarting discards."
TEXT_WAL = "Each segment waits on the database's disk until one gets through. If object storage is degraded, Velero runs go slow too: do not restart Velero (RUNBOOK 2026-11-05)."
TEXT_CANNOT = "This is not a clean bill. A database that refuses the exporter: scripts/repair.sh {env}, step 'the CNPG exporter can read its database'."


def when(text):
    return float(timegm(strptime(text[:19], "%Y-%m-%dT%H:%M:%S")))


def span(secs):
    return f"{int(secs // HOUR)}h{int(secs % HOUR // 60)}m" if secs >= HOUR else f"{int(secs // 60)}m"


def clock(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d %H:%MZ")


# ---- a run that is not finishing --------------------------------------------

def judge(run, volumes, now):
    """(age, seconds since anything moved, finished, total, what it waits on) for one open run."""
    status = run.get("status", {})
    start = when(status.get("startTimestamp") or run["metadata"]["creationTimestamp"])
    moved = [start]
    for v in volumes:
        vs = v.get("status", {})
        moved += [when(t) for t in (v["metadata"].get("creationTimestamp"), vs.get("startTimestamp"), vs.get("completionTimestamp")) if t]
    over = [v for v in volumes if v.get("status", {}).get("phase") in VOLUME_OVER]
    waiting = [f"{v['spec']['pod']['namespace']}/{v['spec']['pod']['name']}:{v['spec']['volume']}" for v in volumes if v not in over]
    return now - start, now - max(moved), len(over), len(volumes), waiting[0] if waiting else "-"


def run_findings(cfg, run, volumes, bounds, finding):
    name = run["metadata"]["name"]
    phase = run.get("status", {}).get("phase", "New")
    age, quiet, finished, total, waiting = judge(run, volumes, cfg.now)
    out = []
    if age > bounds["slow_secs"]:
        out.append(finding(f"backup-run-slow:{name}", "warn", f"Velero run {name}: {phase} for {span(age)}, past any healthy run ({finished} of {total} volumes, last change {span(quiet)} ago). {TEXT_SLOW}"))
    if quiet > bounds["stall_secs"]:
        out.append(finding(f"backup-run-stuck:{name}", "fail", f"Velero run {name}: stalled, nothing moved for {span(quiet)} ({finished} of {total} volumes, waiting on {waiting}). {TEXT_STUCK.format(name=name)}"))
    if age > bounds["overdue_secs"]:
        out.append(finding(f"backup-run-overdue:{name}", "fail", f"Velero run {name}: {phase} for {span(age)}, past the 4h Velero waits on volumes ({finished} of {total} volumes, waiting on {waiting}). {TEXT_OVERDUE.format(env=cfg.env)}"))
    return out


def runs(cfg, kube, finding, cannot_tell):
    with open(BOUNDS_FILE, encoding="utf-8") as f:
        bounds = json.load(f)
    backups = kube.items(f"{VELERO}/backups", "Velero backups")
    out = []
    for run in backups:
        if run.get("status", {}).get("phase", "New") in bounds["finished"]:
            continue
        selector = f"velero.io/backup-name={run['metadata']['name']}"
        volumes = kube.items(f"{VELERO}/podvolumebackups?labelSelector={selector}", "Velero pod volume backups")
        out += run_findings(cfg, run, volumes, bounds, finding)
    return out


# ---- WAL that is not reaching the bucket ------------------------------------

class Unreadable(Exception):
    """This primary gave no figures. Not a verdict about its WAL."""


def figures(text):
    """The archiver's figures from an exporter's page, or Unreadable."""
    seen = {}
    for line in text.splitlines():
        if not line.startswith("#"):
            name, _, value = line.rpartition(" ")
            seen[name] = value
    out = {}
    for key, metric in FIGURES.items():
        try:
            out[key] = float(seen[metric])
        except (KeyError, ValueError) as e:
            raise Unreadable("its exporter serves no archiver figures") from e
        if not math.isfinite(out[key]):
            raise Unreadable("its exporter serves no archiver figures")
    return out


def read_primary(address, port):
    if address is None:
        raise Unreadable("no ready primary behind its -rw Service")
    try:
        with urllib.request.urlopen(f"http://{address}:{port}/metrics", timeout=TIMEOUT) as res:  # noqa: S310  # nosec: a pod address from the API server
            return figures(res.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        raise Unreadable(f"its exporter answered HTTP {e.code}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise Unreadable("its exporter did not answer") from e


def archives(cluster):
    """Does this cluster send WAL anywhere? A sandbox with no object store has nothing to report."""
    spec = cluster.get("spec", {})
    return bool(spec.get("backup", {}).get("barmanObjectStore")) or any(p.get("isWALArchiver") for p in spec.get("plugins", []))


def primaries(kube, cannot_tell):
    """{ns/cluster: the primary's address, or None}, for every cluster that archives."""
    clusters = [c for c in kube.items("/apis/postgresql.cnpg.io/v1/clusters", "CNPG clusters") if archives(c)]
    if not clusters:
        raise cannot_tell("no CNPG cluster archives WAL")
    slices = kube.items("/apis/discovery.k8s.io/v1/endpointslices?labelSelector=cnpg.io/cluster", "EndpointSlices")
    ready = {}
    for s in slices:
        service = s["metadata"].get("labels", {}).get("kubernetes.io/service-name", "")
        for e in s.get("endpoints") or []:
            if e.get("conditions", {}).get("ready") is not False and e.get("addresses"):
                ready[(s["metadata"]["namespace"], service)] = e["addresses"][0]
    return {
        f"{c['metadata']['namespace']}/{c['metadata']['name']}": ready.get((c["metadata"]["namespace"], c["metadata"]["name"] + "-rw"))
        for c in clusters
    }


def read_all(targets, port):
    """{name: figures, or the reason it could not be read}. Together, so a hung one costs one timeout."""
    def one(item):
        try:
            return item[0], read_primary(item[1], port)
        except Unreadable as e:
            return item[0], str(e)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, len(targets))) as pool:
        return dict(pool.map(one, targets.items()))


def absorb(entry, got, now):
    """Take one reading into a cluster's entry. Returns how many attempts failed since the last one."""
    fresh = "failed" not in entry
    restarted = not fresh and (got["reset"] != entry["reset"] or got["failed"] < entry["failed"])
    new = 0 if fresh else int(got["failed"] if restarted else got["failed"] - entry["failed"])
    moved = fresh or restarted or got["archived"] != entry["archived"]
    if got["ready"] > 0 and not moved:
        entry.setdefault("stuck_since", now)
    else:
        entry.pop("stuck_since", None)
    entry.update({k: got[k] for k in ("failed", "archived", "reset", "ready")})
    entry.pop("unread_since", None)
    entry.pop("why", None)
    return new


def episode_text(episode, total, behind, known):
    attempts = episode["attempts"]
    worst = sorted(attempts, key=lambda k: (-attempts[k], k))
    named = ", ".join(f"{k} {attempts[k]}" for k in worst[:NAMED_SHOWN])
    more = f" and {len(worst) - NAMED_SHOWN} more" if len(worst) > NAMED_SHOWN else ""
    parts = []
    if attempts:
        parts.append(f"WAL archiving: {sum(attempts.values())} failed attempts on {len(attempts)} of {total} clusters since {clock(episode['since'])}, last {clock(episode['last'])} ({named}{more}).")
    if behind:
        parts.append("Not moving: " + ", ".join(f"{k} ({int(known[k]['ready'])} waiting)" for k in behind) + ".")
    return " ".join(parts + [TEXT_WAL])


def wal(cfg, kube, finding, cannot_tell):
    port = os.environ.get("WAL_METRICS_PORT")
    if not port:
        return []
    targets = primaries(kube, cannot_tell)
    state = notice_watch.load(cfg, kube, cannot_tell, STATE_KEY)
    before = json.dumps(state, sort_keys=True)
    known = state.setdefault("clusters", {})
    now = cfg.now
    fresh_attempts = False
    for name, got in sorted(read_all(targets, port).items()):
        entry = known.setdefault(name, {})
        if isinstance(got, str):
            entry.setdefault("unread_since", now)
            entry["why"] = got
            continue
        new = absorb(entry, got, now)
        if new:
            fresh_attempts = True
            at = got["last_failed"] if got["last_failed"] > 0 else now
            episode = state.setdefault("episode", {"since": at, "last": at, "attempts": {}})
            episode["attempts"][name] = episode["attempts"].get(name, 0) + new
            episode["since"], episode["last"] = min(episode["since"], at), max(episode["last"], at)
    for gone in set(known) - set(targets):
        del known[gone]

    behind = sorted(k for k, e in known.items() if now - e.get("stuck_since", now) >= BEHIND_SECS)
    unread = sorted(k for k, e in known.items() if "unread_since" in e)
    if behind:
        episode = state.setdefault("episode", {"since": now, "last": now, "attempts": {}})
        episode["last"] = now
        episode["opened"] = True
    episode = state.get("episode")
    if episode:
        if sum(episode["attempts"].values()) >= OPEN_ATTEMPTS:
            episode["opened"] = True
        if not fresh_attempts and not behind and not unread and now - episode["last"] >= QUIET_SECS:
            del state["episode"]
            episode = None
    if json.dumps(state, sort_keys=True) != before:
        notice_watch.save(cfg, kube, state, cannot_tell, STATE_KEY)

    out = []
    if episode and episode.get("opened"):
        out.append(finding("wal-archive", "fail", episode_text(episode, len(targets), behind, known), 0, episode["since"]))
    if unread:
        why = "; ".join(f"{k}: {known[k]['why']}" for k in unread)
        out.append(finding("wal-cannot", "warn", f"Could not read the WAL archiver of {why}. {TEXT_CANNOT.format(env=cfg.env)}", CANNOT_GRACE, min(known[k]["unread_since"] for k in unread)))
    return out
