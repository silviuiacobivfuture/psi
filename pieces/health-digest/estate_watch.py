"""estate-watch: what fails in silence reaches #infra, once.

Each tick reads the facts directly (estate-watch.yaml says why). Standard library only.
One message on entering a bad state, one on leaving it, a reminder at most daily. State
is kept only after delivery, so a Talk outage retries. A check that cannot read its source
says "cannot tell" and keeps what it knew: a failed lookup is never a recovery.
"""
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from calendar import timegm
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # python -I leaves it out
import backup_watch, image_watch, n8n_edge, notice_watch  # noqa: E402, E401

MIN = 60
HOUR = 3600
SA_DIR = "/var/run/secrets/kubernetes.io/serviceaccount"
BACKUP_DONE = {"Completed", "Failed", "PartiallyFailed", "FailedValidation"}
RED = {"failure", "timed_out", "startup_failure"}
GREEN = {"success"}
MAX_LINES = 25


def env_int(name, default):
    return int(os.environ.get(name, default))


class Config:
    def __init__(self):
        e = os.environ
        self.env = e["ENV_NAME"]
        self.notify_url = e.get("NOTIFY_URL", "http://talk-webhook.nextcloud.svc").rstrip("/")
        self.channel = e.get("NOTIFY_CHANNEL", "infra")
        self.notify_token = e.get("NOTIFY_TOKEN", "")
        self.k8s = e.get("K8S_API", "https://kubernetes.default.svc").rstrip("/")
        self.sa_dir = e.get("SA_DIR", SA_DIR)
        self.github_api = e.get("GITHUB_API", "https://api.github.com").rstrip("/")
        self.github_repo, self.github_branch = e.get("GITHUB_REPO", "").strip(), e.get("GITHUB_BRANCH", "").strip()
        if self.github_repo.count("/") != 1 or not all(self.github_repo.split("/")) or not self.github_branch:  # the estate's; no default
            raise SystemExit(f"MISSING REQUIRED CONFIG: GITHUB_REPO=owner/repo and GITHUB_BRANCH (got {self.github_repo!r}, {self.github_branch!r})")
        self.github_token = e.get("GITHUB_TOKEN", "")
        self.ops_key = e.get("CRON_WATCH_KEY", "")  # the bearer the estate's applications ask for
        self.state_ns = e.get("STATE_NAMESPACE", "observability")
        self.state_cm = e.get("STATE_CONFIGMAP", "estate-watch-state")
        self.required = e.get("REQUIRED_CRONJOBS", "observability/health-digest").split()
        self.stale_backup = env_int("BACKUP_STALE_HOURS", 12) * HOUR
        self.grace_cron = env_int("GRACE_CRON_MIN", 20) * MIN
        self.grace_silent = env_int("GRACE_SILENT_MIN", 30) * MIN
        self.grace_argo = env_int("GRACE_ARGO_MIN", 30) * MIN
        self.grace_sync = env_int("GRACE_SYNC_MIN", 60) * MIN
        self.grace_node = env_int("GRACE_NODE_MIN", 10) * MIN
        self.grace_workflow = env_int("GRACE_WORKFLOW_MIN", 120) * MIN
        self.grace_cannot = env_int("GRACE_CANNOT_MIN", 60) * MIN
        self.remind_every = env_int("REMIND_EVERY_HOURS", 24) * HOUR
        self.now = float(e.get("NOW_EPOCH", time.time()))


class CannotTell(Exception):
    """The source could not be read. Not a verdict about what it describes."""


def http(url, headers=None, method="GET", body=None, context=None, timeout=20):
    """(status, text). A transport failure is status 0."""
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=context) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError) as e:
        print(f"  transport failure to {url.split('?')[0]}: {type(e).__name__}")
        return 0, ""


class Kube:
    def __init__(self, cfg):
        self.base = cfg.k8s
        self.headers = {}
        self.context = None
        token = os.path.join(cfg.sa_dir, "token")
        if os.path.exists(token):
            with open(token, encoding="utf-8") as f:
                self.headers["Authorization"] = "Bearer " + f.read().strip()
        ca = os.path.join(cfg.sa_dir, "ca.crt")
        if self.base.startswith("https") and os.path.exists(ca):
            self.context = ssl.create_default_context(cafile=ca)

    def request(self, path, method="GET", body=None):
        headers = dict(self.headers)
        if body is not None:
            headers["Content-Type"] = "application/json"
        return http(self.base + path, headers, method, body, self.context)

    def items(self, path, what):
        code, text = self.request(path)
        if code != 200:
            raise CannotTell(f"{what} are unreadable (HTTP {code})")
        return json.loads(text).get("items", [])


def epoch(stamp):
    if not stamp:
        return None
    return float(timegm(time.strptime(stamp[:19], "%Y-%m-%dT%H:%M:%S")))


def stamp(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d %H:%MZ")


def finding(key, sev, text, grace=0, since=None):
    return {"key": key, "sev": sev, "text": text, "grace": grace, "since": since}


# ---- cron expressions -------------------------------------------------------

def parse_field(field, low, high):
    """The set of values, or None when the field uses a form not handled here."""
    values = set()
    for part in field.split(","):
        step = 1
        if "/" in part:
            part, raw = part.split("/", 1)
            if not raw.isdigit() or int(raw) == 0:
                return None
            step = int(raw)
        if part == "*":
            a, b = low, high
        elif "-" in part:
            x, y = part.split("-", 1)
            if not (x.isdigit() and y.isdigit()):
                return None
            a, b = int(x), int(y)
        elif part.isdigit():
            a, b = int(part), high if step > 1 else int(part)
        else:
            return None
        values.update(range(a, b + 1, step))
    return values


def cron_previous(expr, now):
    """Epoch of the latest firing at or before now, in UTC; None when none can be told."""
    fields = expr.split()
    if len(fields) != 5:
        return None
    parsed = [
        parse_field(fields[0], 0, 59),
        parse_field(fields[1], 0, 23),
        parse_field(fields[2], 1, 31),
        parse_field(fields[3], 1, 12),
        parse_field(fields[4], 0, 7),
    ]
    if any(p is None for p in parsed):
        return None
    minutes, hours, days, months, weekdays = parsed
    weekdays = {0 if d == 7 else d for d in weekdays}
    dom_any, dow_any = fields[2].startswith("*"), fields[4].startswith("*")
    at = datetime.fromtimestamp(now, timezone.utc)
    for back in range(0, 800):
        day = at - timedelta(days=back)
        dow = (day.weekday() + 1) % 7
        dom_ok, dow_ok = day.day in days, dow in weekdays
        # Standard cron: both restricted means either; otherwise both must hold.
        match = (dom_ok or dow_ok) if not dom_any and not dow_any else (dom_ok and dow_ok)
        if day.month not in months or not match:
            continue
        for hour in sorted(hours, reverse=True):
            for minute in sorted(minutes, reverse=True):
                when = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if when.timestamp() <= now:
                    return when.timestamp()
    return None


# ---- the checks -------------------------------------------------------------

def check_backups(cfg, kube):
    """A backup not reaching Completed. Restores depend on it and nothing else says so."""
    base = "/apis/velero.io/v1/namespaces/velero"
    schedules = kube.items(f"{base}/schedules", "Velero schedules")
    backups = kube.items(f"{base}/backups", "Velero backups")
    if not schedules:
        return [finding("backup:no-schedule", "fail", "No Velero schedule exists: nothing is being backed up.")]
    out = []
    for sched in schedules:
        name = sched["metadata"]["name"]
        key = f"backup:{name}"
        if sched.get("spec", {}).get("paused"):
            out.append(finding(key, "fail", f"Velero schedule {name} is paused: nothing is being backed up."))
            continue
        mine = [b for b in backups if b["metadata"].get("labels", {}).get("velero.io/schedule-name") == name]
        done = [b for b in mine if b.get("status", {}).get("phase") in BACKUP_DONE]
        started = lambda b: epoch(b.get("status", {}).get("startTimestamp")) or epoch(b["metadata"]["creationTimestamp"])
        done.sort(key=started, reverse=True)
        good = [b for b in done if b["status"]["phase"] == "Completed"]
        last_good = started(good[0]) if good else None
        verdict = "no Completed backup exists, so restores are impossible" if not good else f"last Completed {stamp(last_good)}"
        if not done:
            out.append(finding(key, "fail", f"Velero {name}: no backup has finished; {verdict}."))
        elif done[0]["status"]["phase"] != "Completed":
            b = done[0]
            out.append(finding(key, "fail", f"Velero {name}: newest backup {b['status']['phase']} at {stamp(started(b))}; {verdict}. Check: velero backup describe {b['metadata']['name']} --details"))
        elif cfg.now - last_good > cfg.stale_backup:
            out.append(finding(key, "fail", f"Velero {name}: {verdict}, older than {cfg.stale_backup // HOUR}h."))
    return out


def owner_cronjob(job):
    for ref in job["metadata"].get("ownerReferences", []):
        if ref.get("kind") == "CronJob":
            return f"{job['metadata']['namespace']}/{ref['name']}"
    return None


def job_outcome(job):
    """(state, epoch) for a finished Job; (None, None) while it runs."""
    for cond in job.get("status", {}).get("conditions", []):
        if cond.get("status") == "True" and cond.get("type") in ("Complete", "Failed"):
            return cond["type"], epoch(cond.get("lastTransitionTime"))
    return None, None


def check_cronjobs(cfg, kube):
    """Every CronJob on the cluster: its newest finished Job failed, or it stopped firing."""
    cronjobs = kube.items("/apis/batch/v1/cronjobs", "CronJobs")
    newest = {}
    for job in kube.items("/apis/batch/v1/jobs", "Jobs"):
        owner = owner_cronjob(job)
        state, at = job_outcome(job)
        if owner and state:
            created = epoch(job["metadata"]["creationTimestamp"])
            if owner not in newest or created > newest[owner][0]:
                newest[owner] = (created, state, at, job["metadata"]["name"])
    seen = set()
    out = []
    for cj in cronjobs:
        name = f"{cj['metadata']['namespace']}/{cj['metadata']['name']}"
        seen.add(name)
        spec, status = cj["spec"], cj.get("status", {})
        if spec.get("suspend"):
            if name in cfg.required:
                out.append(finding(f"cron-suspended:{name}", "fail", f"CronJob {name} is suspended, and it is a watcher: what it watches is unwatched."))
            continue
        last = newest.get(name)
        if last and last[1] == "Failed":
            out.append(finding(f"cron-failed:{name}", "fail", f"CronJob {name}: its newest run failed. Check: kubectl -n {name.split('/')[0]} logs job/{last[3]}", cfg.grace_cron, last[2]))
        expected = cron_previous(spec["schedule"], cfg.now)
        if expected is None:
            print(f"  {name}: schedule '{spec['schedule']}' cannot be read, firing not judged")
            continue
        fired = epoch(status.get("lastScheduleTime")) or epoch(cj["metadata"]["creationTimestamp"])
        # The schedule is read in UTC. A time zone moves the real firing by hours, for
        # the whole day, so it widens what counts as on time rather than the grace.
        slack = MIN + (4 * HOUR if spec.get("timeZone") else 0)
        if expected > fired + slack:
            out.append(finding(f"cron-silent:{name}", "fail", f"CronJob {name} is not firing: expected at {stamp(expected)}, last fired {stamp(fired)}.", cfg.grace_silent, expected))
    for name in cfg.required:
        if name not in seen:
            out.append(finding(f"cron-missing:{name}", "fail", f"CronJob {name} does not exist, and it is a watcher: what it watches is unwatched."))
    return out


def check_argo(cfg, kube):
    out = []
    for app in kube.items("/apis/argoproj.io/v1alpha1/namespaces/argocd/applications", "Argo Applications"):
        name = app["metadata"]["name"]
        status = app.get("status", {})
        health = status.get("health", {}).get("status", "Unknown")
        sync = status.get("sync", {}).get("status", "Unknown")
        if health != "Healthy":
            out.append(finding(f"argo-health:{name}", "fail", f"Argo app {name} is {health}.", cfg.grace_argo))
        if sync != "Synced":
            out.append(finding(f"argo-sync:{name}", "warn", f"Argo app {name} is {sync}: what is in git has not reached the cluster.", cfg.grace_sync))
    return out


def check_nodes(cfg, kube):
    nodes = kube.items("/api/v1/nodes", "Nodes")
    if not nodes:
        raise CannotTell("the node list came back empty")
    args = {n["metadata"]["name"]: n["metadata"].get("annotations", {}).get("k3s.io/node-args", "") for n in nodes}
    # ARMED BY ITS OWN LANDING: k3s records its kubelet flags on the node. Nothing is
    # reported until one node carries memory eviction; from then on, every node must.
    armed = any("memory.available" in a for a in args.values())
    out = []
    for node in nodes:
        name = node["metadata"]["name"]
        for cond in node.get("status", {}).get("conditions", []):
            kind, value = cond.get("type"), cond.get("status")
            if (kind == "Ready" and value != "True") or (kind in ("MemoryPressure", "DiskPressure", "PIDPressure") and value == "True"):
                out.append(finding(f"node:{name}:{kind}", "fail", f"Node {name}: {kind}={value}.", cfg.grace_node, epoch(cond.get("lastTransitionTime"))))
        if armed and "memory.available" not in args[name]:
            out.append(finding(f"node-eviction:{name}", "fail", f"Node {name} has no memory eviction: a full node stalls instead of evicting (RUNBOOK 2026-11-02)."))
    return out


def check_workflows(cfg, _kube):
    """A workflow red on the branch past a bounded time. Cancelled runs say nothing."""
    if not cfg.github_token:
        raise CannotTell("no GitHub token")
    headers = {"Authorization": "Bearer " + cfg.github_token, "Accept": "application/vnd.github+json", "User-Agent": "estate-watch"}
    api = f"{cfg.github_api}/repos/{cfg.github_repo}/actions/workflows"
    code, text = http(f"{api}?per_page=100", headers)
    if code != 200:
        raise CannotTell(f"GitHub's workflow list answered HTTP {code}")
    out = []
    for wf in json.loads(text).get("workflows", []):
        if wf.get("state") != "active":
            continue
        code, text = http(f"{api}/{wf['id']}/runs?branch={cfg.github_branch}&status=completed&exclude_pull_requests=true&per_page=20", headers)
        if code != 200:
            raise CannotTell(f"GitHub's runs of {wf['name']} answered HTTP {code}")
        streak = []
        for run in json.loads(text).get("workflow_runs", []):
            if run.get("event") == "pull_request":
                continue
            if run.get("conclusion") in GREEN:
                break
            if run.get("conclusion") in RED:
                streak.append(run)
        if streak:
            since = epoch(streak[-1]["created_at"])
            out.append(finding(f"workflow:{wf['name']}", "fail", f"Workflow '{wf['name']}' is red on {cfg.github_branch} since {stamp(since)}. {streak[0]['html_url']}", cfg.grace_workflow, since))
    return out


def check_app_crons(cfg, _kube):
    """The estate's applications' own cron logs, CRON_SOURCES {"<app>": "<address>"}: names and times only."""
    out, sources = [], json.loads(os.environ.get("CRON_SOURCES", "{}"))
    if sources and not cfg.ops_key:
        raise CannotTell("no CRON_WATCH_KEY")
    for app in sorted(sources):
        code, text = http(sources[app], {"Authorization": "Bearer " + cfg.ops_key})
        if code != 200:
            raise CannotTell(f"{app}'s cron log answered HTTP {code}")
        body = json.loads(text)
        for cron in body.get("crons", []):
            job, ran, silent = cron["job"], cron.get("lastRunAt"), cron.get("silentAfterMs")
            if cron.get("failingSince"):
                since = cron["failingSince"] / 1000
                out.append(finding(f"app-cron:{app}:{job}", "fail", f"{app} cron {job} is {cron.get('status')} since {stamp(since)}.", cfg.grace_cron, since))
            if ran and silent and cfg.now - ran / 1000 > silent / 1000:
                out.append(finding(f"app-silent:{app}:{job}", "fail", f"{app} cron {job} stopped running: last run {stamp(ran / 1000)}."))
        for job, count in body.get("failedJobs", {}).items():
            out.append(finding(f"app-jobs:{app}:{job}", "warn", f"{app} job {job} recorded {count} failure(s) in the last day."))
    return out


CHECKS = {
    "backup": check_backups,
    "backup-run": lambda cfg, kube: backup_watch.runs(cfg, kube, finding, CannotTell),
    "wal": lambda cfg, kube: backup_watch.wal(cfg, kube, finding, CannotTell),
    "cron": check_cronjobs,
    "argo": check_argo,
    "node": check_nodes,
    "workflow": check_workflows,
    "app-cron": check_app_crons,
    "image": lambda cfg, kube: image_watch.check(cfg, kube, finding, CannotTell),
    "notice": lambda cfg, kube: notice_watch.check(cfg, kube, finding, CannotTell),
    "n8n-edge": lambda cfg, kube: n8n_edge.check(cfg, kube, finding, CannotTell),
}
# Which keys a check owns, so a check that could not read keeps what it knew.
OWNS = {
    "backup": ("backup:",), "backup-run": ("backup-run-",), "wal": ("wal-",),
    "cron": ("cron-",),
    "argo": ("argo-",),
    "node": ("node:", "node-"),
    "workflow": ("workflow:",),
    "app-cron": ("app-",), "image": ("image-",), "n8n-edge": ("n8n-edge:",), "notice": ("notice-",),
}


def load_state(cfg, kube):
    code, text = kube.request(f"/api/v1/namespaces/{cfg.state_ns}/configmaps/{cfg.state_cm}")
    if code != 200:
        raise CannotTell(f"its state ConfigMap is unreadable (HTTP {code})")
    raw = json.loads(text).get("data", {}).get("state.json", "")
    return json.loads(raw) if raw else {"alerts": {}}


def save_state(cfg, kube, state):
    body = json.dumps({"data": {"state.json": json.dumps(state, sort_keys=True)}}).encode()
    path = f"/api/v1/namespaces/{cfg.state_ns}/configmaps/{cfg.state_cm}"
    headers = dict(kube.headers)
    headers["Content-Type"] = "application/merge-patch+json"
    code, _ = http(kube.base + path, headers, "PATCH", body, kube.context)
    return code == 200


def post(cfg, severity, message, lines):
    shown = lines[:MAX_LINES]
    if len(lines) > MAX_LINES:
        shown.append(f"... and {len(lines) - MAX_LINES} more: kubectl -n {cfg.state_ns} get configmap {cfg.state_cm} -o yaml")
    # The time is load-bearing. The translator drops a repeat of the same severity and
    # title for 15 minutes and still answers 200: seen on dev, a second "3 things went
    # wrong" listing other failures vanished, and this would have recorded it as said.
    at = datetime.fromtimestamp(cfg.now, timezone.utc).strftime("%H:%MZ")
    body = json.dumps({"severity": severity, "message": f"[{cfg.env}] {message} ({at})", "detail": "\n".join(shown)}).encode()
    headers = {"Content-Type": "application/json", "X-Notify-Token": cfg.notify_token}
    code, _ = http(f"{cfg.notify_url}/notify/{cfg.channel}", headers, "POST", body)
    print(f"  posted to #{cfg.channel} ({severity}, {len(lines)} line(s)): HTTP {code}")
    return code == 200


def evaluate(cfg, kube):
    """Run every check. Returns (findings by key, the key prefixes to leave alone)."""
    found, keep = {}, []
    for name, check in CHECKS.items():
        try:
            for f in check(cfg, kube):
                found[f["key"]] = f
        except (CannotTell, ValueError, KeyError) as e:
            why = str(e) if isinstance(e, CannotTell) else f"its answer could not be read ({type(e).__name__})"
            keep.extend(OWNS[name])
            f = finding(f"cannot-read:{name}", "warn", f"Cannot tell about {name}: {why}. This is not a clean bill.", cfg.grace_cannot)
            found[f["key"]] = f
    return found, keep


def tick(cfg, kube):
    state = load_state(cfg, kube)
    alerts = state.setdefault("alerts", {})
    found, keep = evaluate(cfg, kube)

    fired, recovered = [], []
    for key, f in found.items():
        a = alerts.setdefault(key, {"first_seen": f["since"] or cfg.now, "notified": None})
        a["text"], a["sev"] = f["text"], f["sev"]
        if a["notified"] is None and cfg.now - a["first_seen"] >= f["grace"]:
            fired.append(key)
    for key in list(alerts):
        if key not in found and not key.startswith(tuple(keep) or ("\0",)):
            if alerts[key]["notified"] is not None:
                recovered.append(key)
            else:
                del alerts[key]

    ok = True
    if fired:
        sev = "fail" if any(alerts[k]["sev"] == "fail" for k in fired) else "warn"
        headline = alerts[fired[0]]["text"] if len(fired) == 1 else f"{len(fired)} things went wrong"
        if post(cfg, sev, headline, [] if len(fired) == 1 else [alerts[k]["text"] for k in sorted(fired)]):
            for k in fired:
                alerts[k]["notified"] = cfg.now
        else:
            ok = False
    if recovered:
        texts = [alerts[k]["text"] for k in sorted(recovered)]
        headline = "Recovered: " + texts[0] if len(texts) == 1 else f"{len(texts)} things recovered"
        if post(cfg, "ok", headline, [] if len(texts) == 1 else texts):
            for k in recovered:
                del alerts[k]
        else:
            ok = False
    open_alerts = [k for k, a in alerts.items() if a["notified"] is not None and k not in fired]
    if any(cfg.now - alerts[k]["notified"] >= cfg.remind_every for k in open_alerts):
        lines = [f"{alerts[k]['text']} (first seen {stamp(alerts[k]['first_seen'])})" for k in sorted(open_alerts)]
        if post(cfg, "warn", f"Still broken: {len(lines)} (reminder, at most daily)", lines):
            for k in open_alerts:
                alerts[k]["notified"] = cfg.now
        else:
            ok = False

    bad = sorted(k for k, a in alerts.items() if a["notified"] is not None)
    state["last_tick"] = cfg.now
    state["last_result"] = f"{len(bad)} open" if bad else "all clear"
    if not save_state(cfg, kube, state):
        print("FATAL the state could not be written: the next tick would post this again")
        ok = False
    pending = sorted(set(alerts) - set(bad))
    print(f"estate-watch: {state['last_result']}; pending {len(pending)}; fired {len(fired)}; recovered {len(recovered)}")
    for k in bad + pending:
        print(f"  [{'open' if k in bad else 'pending'}] {alerts[k]['text']}")
    return ok


def main():
    cfg = Config()
    if not cfg.notify_token:
        print("MISSING REQUIRED SECRET: token (Secret talk-webhook-token, key token, ns observability)")
        return 1
    try:
        ok = tick(cfg, Kube(cfg))
    except CannotTell as e:
        print(f"FATAL {e}")
        return 1
    if not ok:
        print("estate-watch: UNDELIVERED or unsaved; the next tick retries")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
