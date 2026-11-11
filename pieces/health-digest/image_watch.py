"""Pinned images go stale: estate-watch's check that upstream's digest has moved past ours.

The mirror pins every third-party image by digest (PLATFORM-11), so a tag upstream rebuilt
for a security fix no longer reaches us by itself. This reads infrastructure/hetzner/images.list
from git, asks each registry what the row's tag serves now, and reports a row that has been
behind for BEHIND_DAYS. Reads only. A separate file because estate_watch.py is at its ceiling.

WHY 14 DAYS. Official base images rebuild every week or two, so a shorter limit would be open
for most of them most of the time, and a channel that always says this gets muted. Longer lets
a published fix sit for over a month by the time someone acts. The clock starts at the first
sighting and a further rebuild does not restart it, so 14 days is a real upper bound.

WHY EVERY ROW, not only moving tags like `latest`. A HEAD costs no pull, and a version tag that
moves is exactly a rebuild for a security fix. One that never moves costs one GET, once.

DOCKER HUB'S ANONYMOUS LIMIT. Measured 2026-11-04: Hub reports 100 an hour, and HEADs do not
move that count. A manifest GET is treated as one pull, though one measured GET did not move it
either. So a GET happens only when a tag's digest differs from the last one seen, at most
GET_BUDGET per tick, which at one tick in ten minutes is 6 an hour. An unmoved row costs none.
Below RATE_FLOOR left, or on a 429, it stops, and a 429 leaves that registry alone for PAUSE_HOURS.

AN UNREADABLE REGISTRY IS NOT A VERDICT. One answer of trouble ends that registry for the tick,
the others go on, what it already knew stands, and one line per registry says "could not check"
after CANNOT_GRACE. A row whose registry answers but refuses the row (the tag is gone, or the name
is denied, as ghcr.io/get-convex was) is named on its own: that is how a renamed upstream shows.

The registries get no credential of ours: the GitHub token goes to GitHub. State is the
`images.json` key of estate-watch-state, beside the engine's own. Cases: tests/image_watch_cases.py.
"""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

DAY = 86400
HOUR = 3600
BEHIND_DAYS = 14
RECHECK_HOURS = 24
HEAD_BUDGET = 5
GET_BUDGET = {"docker.io": 1}
GET_BUDGET_OTHER = 3
RATE_FLOOR = 20
PAUSE_HOURS = 6
CANNOT_GRACE = 48 * HOUR
SECONDS_BUDGET = 60
LIST_PATH = "infrastructure/hetzner/images.list"
ACCEPT = ", ".join((
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
))
HOSTS = {"docker.io": "https://registry-1.docker.io"}
TEXT_FIX = (
    "Put the new digest on its line in infrastructure/hetzner/images.list, run "
    "scripts/harbor-mirror-images.sh, and change what .github/scripts/tests/image-list_test.sh names."
)


class HostTrouble(Exception):
    """The registry itself is not answering usefully. Stop asking it for this tick."""

    def __init__(self, why, limited=False):
        super().__init__(why)
        self.limited = limited


class RowTrouble(Exception):
    """The registry answered, and has nothing readable for this row."""


def fetch(url, headers=None, method="GET"):
    """(status, body bytes, lower-cased headers). A transport failure is status 0."""
    req = urllib.request.Request(url, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read(), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, e.read(), {k.lower(): v for k, v in e.headers.items()}
    except (urllib.error.URLError, OSError) as e:
        print(f"  transport failure to {url.split('?')[0]}: {type(e).__name__}")
        return 0, b"", {}


class Registry:
    """One registry, for one tick: its tokens, what is left to spend, and whether it stopped."""

    def __init__(self, host, overrides):
        self.host = host
        self.base = overrides.get(host) or HOSTS.get(host) or f"https://{host}"
        self.tokens = {}
        self.heads = HEAD_BUDGET
        self.gets = GET_BUDGET.get(host, GET_BUDGET_OTHER)

    def call(self, name, ref, method):
        url = f"{self.base}/v2/{name}/manifests/{ref}"
        headers = {"Accept": ACCEPT, "User-Agent": "estate-watch"}
        if name in self.tokens:
            headers["Authorization"] = "Bearer " + self.tokens[name]
        code, body, got = fetch(url, headers, method)
        if code == 401 and name not in self.tokens:
            self.tokens[name] = self.token(name, got.get("www-authenticate", ""))
            return self.call(name, ref, method)
        remaining = re.match(r"(\d+)", got.get("ratelimit-remaining", ""))
        if remaining and int(remaining[1]) < RATE_FLOOR:
            self.gets = 0
        if code == 429:
            raise HostTrouble("it answered 429, too many requests", limited=True)
        if code == 0 or code >= 500:
            raise HostTrouble(f"it answered {code or 'nothing'}")
        if code != 200:
            raise RowTrouble(f"it answers HTTP {code} for this row")
        return body, got

    def token(self, name, challenge):
        """An anonymous pull token. No credential of ours is sent, and this is no pull."""
        fields = dict(re.findall(r'(\w+)="([^"]*)"', challenge))
        if "realm" not in fields:
            raise RowTrouble("it asks for a login this watcher does not have")
        query = {"scope": fields.get("scope", f"repository:{name}:pull")}
        if "service" in fields:
            query["service"] = fields["service"]
        code, body, _ = fetch(fields["realm"] + "?" + urllib.parse.urlencode(query), {"User-Agent": "estate-watch"})
        if code == 429:
            raise HostTrouble("its token service answered 429, too many requests", limited=True)
        if code == 0 or code >= 500:
            raise HostTrouble(f"its token service answered {code or 'nothing'}")
        if code != 200:
            raise RowTrouble(f"its token service answers HTTP {code} for this row")
        answer = json.loads(body)
        token = answer.get("token") or answer.get("access_token")
        if not token:
            raise HostTrouble("its token service gave no token")
        return token

    def top_digest(self, name, tag):
        self.heads -= 1
        _, got = self.call(name, tag, "HEAD")
        digest = got.get("docker-content-digest")
        if not digest:
            raise HostTrouble("it answered with no digest")
        return digest

    def amd64(self, name, top):
        """The linux/amd64 manifest under this digest. Spends one GET."""
        self.gets -= 1
        body, _ = self.call(name, top, "GET")
        index = json.loads(body)
        if "manifests" not in index:
            return top
        for m in index["manifests"]:
            platform = m.get("platform", {})
            if platform.get("architecture") == "amd64" and platform.get("os") == "linux":
                return m["digest"]
        raise RowTrouble("it publishes no linux/amd64 manifest")


def read_rows(cfg, cannot_tell):
    """[(key, host, name, tag, digest)] for each row Harbor holds and a tag can be asked of."""
    url = f"{cfg.github_api}/repos/{cfg.github_repo}/contents/{LIST_PATH}?ref={cfg.github_branch}"
    headers = {"Authorization": "Bearer " + cfg.github_token, "Accept": "application/vnd.github.raw+json", "User-Agent": "estate-watch"}
    code, body, _ = fetch(url, headers)
    if code != 200:
        raise cannot_tell(f"GitHub answered HTTP {code} for {LIST_PATH}")
    rows, total = [], 0
    for line in body.decode("utf-8", "replace").splitlines():
        fields = line.split("#", 1)[0].split()
        if len(fields) != 4:
            continue
        total += 1
        cls, repo, tag, digest = fields
        if cls in ("copied", "moved") and tag != "-" and "/" in repo:
            host, name = repo.split("/", 1)
            rows.append((f"{repo}:{tag}", host, name, tag, digest))
    if not total:
        raise cannot_tell(f"{LIST_PATH} holds no rows")
    return rows


def load(cfg, kube, cannot_tell):
    code, text = kube.request(f"/api/v1/namespaces/{cfg.state_ns}/configmaps/{cfg.state_cm}")
    if code != 200:
        raise cannot_tell(f"its state ConfigMap is unreadable (HTTP {code})")
    raw = json.loads(text).get("data", {}).get("images.json", "")
    return json.loads(raw) if raw else {"rows": {}, "hosts": {}}


def save(cfg, kube, state, cannot_tell):
    body = json.dumps({"data": {"images.json": json.dumps(state, sort_keys=True)}}).encode()
    headers = dict(kube.headers)
    headers["Content-Type"] = "application/merge-patch+json"
    path = f"{kube.base}/api/v1/namespaces/{cfg.state_ns}/configmaps/{cfg.state_cm}"
    req = urllib.request.Request(path, data=body, headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=10, context=kube.context) as r:
            code = r.status
    except urllib.error.HTTPError as e:
        code = e.code
    except (urllib.error.URLError, OSError):
        code = 0
    if code != 200:
        raise cannot_tell(f"what it read could not be saved (HTTP {code})")


def check_row(reg, row, entry, now):
    """Update one row's entry from the registry. Raises when it cannot be told."""
    _, _, name, tag, ours = row
    top = reg.top_digest(name, tag)
    if entry.get("top") == top:
        entry["checked"] = now
        entry.pop("unread", None)
        return True
    if top == ours:
        child = top
    else:
        if reg.gets <= 0:
            return False
        child = reg.amd64(name, top)
    entry["top"], entry["child"], entry["checked"] = top, child, now
    entry.pop("unread", None)
    if child == ours:
        entry.pop("moved_since", None)
    else:
        entry.setdefault("moved_since", now)
    return True


def walk(rows, state, now, overrides):
    """Ask what is due, oldest first, within each registry's budgets."""
    started = time.monotonic()
    known, hosts = state["rows"], state["hosts"]
    registries = {}
    stopped = set()
    due = []
    for row in rows:
        key, _, _, _, ours = row
        entry = known.setdefault(key, {})
        if entry.get("ours") != ours:
            # A new pin is a fresh start. This is how a stale row recovers.
            known[key] = entry = {"ours": ours}
        if now - entry.get("checked", 0) >= RECHECK_HOURS * HOUR:
            due.append(row)
    due.sort(key=lambda r: known[r[0]].get("checked", 0))
    healthy = set()
    for row in due:
        key, host, *_ = row
        pause = hosts.get(host, {}).get("pause_until", 0)
        if host in stopped or now < pause or time.monotonic() - started > SECONDS_BUDGET:
            continue
        reg = registries.setdefault(host, Registry(host, overrides))
        if reg.heads <= 0:
            continue
        entry = known[key]
        try:
            if not check_row(reg, row, entry, now):
                stopped.add(host)  # out of GETs: this row stays first in line next tick
                continue
            healthy.add(host)
        except RowTrouble as e:
            entry.setdefault("unread", {"since": now})["why"] = str(e)
            entry["checked"] = now
            healthy.add(host)
        except (HostTrouble, ValueError, KeyError) as e:
            stopped.add(host)
            healthy.discard(host)
            mark = hosts.setdefault(host, {})
            mark.setdefault("since", now)
            mark["why"] = str(e) if isinstance(e, HostTrouble) else "its answer could not be read"
            if getattr(e, "limited", False):
                mark["pause_until"] = now + PAUSE_HOURS * HOUR
    for host in healthy:
        hosts.pop(host, None)
    # Rows gone from the list take their state with them.
    listed = {r[0] for r in rows}
    for key in set(known) - listed:
        del known[key]


def findings(rows, state, now, finding):
    out = []
    known, hosts = state["rows"], state["hosts"]
    for key, host, *_rest, ours in rows:
        entry = known.get(key, {})
        since = entry.get("moved_since")
        if since is not None and now - since >= BEHIND_DAYS * DAY:
            days = int((now - since) // DAY)
            out.append(finding(
                f"image-behind:{key}", "warn",
                f"Image {key} has been behind upstream for {days} days: ours {ours[:19]}, upstream {entry.get('child', '?')[:19]}. {TEXT_FIX}",
            ))
        unread = entry.get("unread")
        if unread:
            out.append(finding(
                f"image-row:{key}", "warn",
                f"Could not check image {key}: {unread['why']}. Not a clean bill: if upstream moved or renamed it, nothing here will say so.",
                CANNOT_GRACE, unread["since"],
            ))
    for host, mark in hosts.items():
        if "since" in mark:
            count = sum(1 for r in rows if r[1] == host)
            out.append(finding(
                f"image-host:{host}", "warn",
                f"Could not check {count} image(s) at {host}: {mark['why']}. Not a clean bill: what it last knew stands.",
                CANNOT_GRACE, mark["since"],
            ))
    return out


def check(cfg, kube, finding, cannot_tell):
    if not cfg.github_token:
        raise cannot_tell("no GitHub token")
    rows = read_rows(cfg, cannot_tell)
    state = load(cfg, kube, cannot_tell)
    before = json.dumps(state, sort_keys=True)
    overrides = json.loads(os.environ.get("IMAGE_REGISTRIES", "{}"))
    walk(rows, state, cfg.now, overrides)
    if json.dumps(state, sort_keys=True) != before:
        save(cfg, kube, state, cannot_tell)
    return findings(rows, state, cfg.now, finding)
