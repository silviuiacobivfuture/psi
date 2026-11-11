"""Plain webhook -> signed Nextcloud Talk message."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TALK_URL = os.environ["TALK_URL"].rstrip("/")
BOT_SECRET = os.environ["BOT_SECRET"].encode()
# Shared bearer. The service is reachable in-cluster by anything that can resolve
# the Service, and (for Axiom) from outside via an Ingress, so it is never open.
NOTIFY_TOKEN = os.environ["NOTIFY_TOKEN"]
CHANNEL_DIR = os.environ.get("CHANNEL_DIR", "/etc/talk-channels")

# Same vocabulary as scripts/talk-notify.sh, deliberately: a reader should not be
# able to tell whether a message came from the script or from this service.
# Icon ONLY. The old form prefixed every line with "**FAIL** — " before the text,
# which reads like a log level to an engineer and like noise to everyone else.
# These messages are for people who do not read logs: an icon plus a bold plain
# sentence is the whole design.
ICON = {"ok": "✅", "warn": "⚠️", "fail": "\U0001f534", "info": "ℹ️"}

# A fenced block is a raw log row or a stack trace. In a chat client it is a wall
# of characters that pushes the one useful line off screen — drop it entirely.
_FENCE = re.compile(r"```.*?```", re.S)
_ENV_TAG = re.compile(r"^\[([a-z0-9][a-z0-9-]{0,20})\]\s*")
_MARKER = re.compile(r"::[A-Z][A-Z0-9_]*::\s*")

# Words that decide severity when the sender does not say. Axiom sends NO severity
# field, so without this a failed build renders identically to a deploy notice —
# which is exactly how a channel stops being read.
# Observed miss: "App keeps restarting, or ran out of memory" matched none of the
# original words and rendered as a calm blue INFO (2026-08-20). Alert titles are
# written in plain language now, so the vocabulary has to be plain too.
_FAIL_WORDS = ("fail", "error", "crash", "down", "degraded", "unhealthy",
               "denied", "missing", "sealed", "cannot", "unreachable", "timeout",
               "restarting", "out of memory", "not working", "stopped", "refused",
               "blocked", "expired", "no longer", "unable")
_OK_WORDS = ("resolved", "recovered", "succeeded", "restored", "back to normal")

def clean_text(value):
    """Reduce one sender-supplied string to a single readable line."""
    if not isinstance(value, str):
        return ""
    s = _FENCE.sub(" ", value).strip()
    # Some senders emit an unfenced JSON blob. Equally unreadable; equally dropped.
    if s.startswith("{") and s.endswith("}") and len(s) > 160:
        return ""
    # Slack link syntax. Talk renders markdown, not Slack, so <url|label> arrives
    # verbatim as literal angle brackets and a pipe (observed 2026-08-20).
    s = re.sub(r"<(https?://[^|>]+)\|([^>]+)>", r"[\2](\1)", s)
    s = re.sub(r"<(https?://[^>]+)>", r"\1", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"^Triggered:\s*", "", s)   # Axiom prefixes every monitor title
    s = _MARKER.sub("", s)                  # ::CI_BUILD_FAILED:: is a grep anchor
    return s.strip()

def infer_severity(text, given):
    if given and given in ("ok", "warn", "fail"):
        return given
    low = text.lower()
    if any(w in low for w in _OK_WORDS):
        return "ok"
    if any(w in low for w in _FAIL_WORDS):
        return "fail"
    return given if given in ICON else "info"

def slack_summary(payload):
    """Render a Slack-shaped payload into (title, detail).

    Axiom posts `blocks`, NOT the `attachments` this service originally handled —
    so its alerts fell through to the raw-JSON fallback and posted a 900-character
    wall of serialised log into #infra, four times per alert (observed 2026-08-20).
    Blocks arrive as [{"type":"section","text":{"type":"mrkdwn","text":"..."}}]:
    the FIRST section is the monitor title, the second its description, and any
    later one is usually a fenced dump of the matching log row, which clean_text
    removes. attachments[] is still handled for anything Slack-classic.
    """
    parts = []
    for block in payload.get("blocks") or []:
        if not isinstance(block, dict):
            continue
        node = block.get("text")
        raw = node.get("text") if isinstance(node, dict) else node
        cleaned = clean_text(raw)
        if cleaned:
            parts.append(cleaned)
    if not parts:
        for att in payload.get("attachments") or []:
            if not isinstance(att, dict):
                continue
            for key in ("text", "title", "fallback"):
                cleaned = clean_text(att.get(key))
                if cleaned:
                    parts.append(cleaned)
                    break
    if not parts:
        return None
    return parts[0], " ".join(parts[1:])[:400]

# In-memory suppression of identical repeats. Axiom re-sends a firing monitor on
# every evaluation, which is how the same alert arrived four times in a row.
# Per-pod state, and replicas is 1 — a second replica would each keep their own
# window, which degrades to at-most-one-duplicate rather than anything worse.
_recent = {}
_DEDUPE_SECS = int(os.environ.get("DEDUPE_SECONDS", "900"))

def is_duplicate(channel, fingerprint):
    """Suppress a repeat of the SAME alert.

    Keyed on the TITLE, deliberately NOT the whole body: Axiom appends a
    per-evaluation query link, so five firings of one monitor produced five bodies
    that differed only in a `qid=` and sailed straight through body-hash dedupe
    (observed 2026-08-20 — five identical "App keeps restarting" lines in one
    minute). The title IS the monitor name, so same title means same alert.
    Argo titles carry the app name, so different apps still report separately.
    """
    now = time.time()
    for key in [k for k, seen in _recent.items() if now - seen > _DEDUPE_SECS]:
        _recent.pop(key, None)
    key = channel + "|" + hashlib.sha256(fingerprint.encode()).hexdigest()
    if key in _recent:
        return True
    _recent[key] = now
    return False

def channel_token(name):
    """Read the room token from the mounted ConfigMap.

    Read PER REQUEST, never cached: the occ reconcile CronJob republishes this map
    every 15 minutes, and kubelet updates the mounted files in place. Caching would
    pin a token that a room recreation had already invalidated, and the failure
    would be silent (Talk 404s and the alert vanishes).
    """
    safe = "".join(c for c in name if c.isalnum() or c in "-_")
    if not safe or safe != name:
        return None
    try:
        with open(os.path.join(CHANNEL_DIR, "channel-" + safe), "r") as fh:
            return fh.read().strip() or None
    except OSError:
        return None

# ---- Plane enrichment -------------------------------------------------
# Plane's webhooks carry UUIDs, never names, and no link. Raw, a state change
# renders as "state: bde9868a-… -> 932333c6-…", which tells a reader nothing
# (observed in #tasks, 2026-08-20). These lookups turn that into
# "Todo → In Progress" and produce a clickable work-item link.
# EVERY failure path returns None and the caller falls back to the raw form: a
# notifier that drops messages because an API was slow is worse than one that
# occasionally shows a UUID.
PLANE_API_URL = os.environ.get("PLANE_API_URL", "").rstrip("/")
PLANE_API_KEY = os.environ.get("PLANE_API_KEY", "")
PLANE_WORKSPACE = os.environ.get("PLANE_WORKSPACE", "")
_plane_cache = {}
_PLANE_TTL = 900

def _plane_get(path):
    if not (PLANE_API_URL and PLANE_API_KEY and PLANE_WORKSPACE):
        return None
    now = time.time()
    hit = _plane_cache.get(path)
    if hit and now - hit[1] < _PLANE_TTL:
        return hit[0]
    try:
        req = urllib.request.Request(
            PLANE_API_URL + path, headers={"X-API-Key": PLANE_API_KEY})
        with urllib.request.urlopen(req, timeout=8) as resp:
            doc = json.loads(resp.read().decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001 - any failure degrades, never raises
        return None
    _plane_cache[path] = (doc, now)
    return doc

def _plane_project(project_id):
    """-> (identifier, name), e.g. ("OPS", "Operations")."""
    doc = _plane_get("/api/v1/workspaces/%s/projects/%s/" % (PLANE_WORKSPACE, project_id))
    if not isinstance(doc, dict):
        return None, None
    return doc.get("identifier"), doc.get("name")

def _plane_state_name(project_id, state_id):
    doc = _plane_get("/api/v1/workspaces/%s/projects/%s/states/" % (PLANE_WORKSPACE, project_id))
    rows = (doc or {}).get("results") if isinstance(doc, dict) else doc
    for row in rows or []:
        if isinstance(row, dict) and row.get("id") == state_id:
            return row.get("name")
    return None

def _plane_issue(project_id, issue_id):
    """-> (title, sequence_id) for events that name only the issue UUID."""
    doc = _plane_get("/api/v1/workspaces/%s/projects/%s/issues/%s/"
                     % (PLANE_WORKSPACE, project_id, issue_id))
    if not isinstance(doc, dict):
        return None, None
    return doc.get("name"), doc.get("sequence_id")

_TAGS = re.compile(r"<[^>]+>")

def _strip_html(value):
    if not isinstance(value, str):
        return ""
    text = _TAGS.sub(" ", value)
    for ent, ch in (("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"),
                    ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'")):
        text = text.replace(ent, ch)
    return re.sub(r"\s+", " ", text).strip()

def plane_summary(payload):
    """Render a Plane outgoing webhook into ONE readable line, or None.

    WHY A BESPOKE ADAPTER HERE, when the rule everywhere else is "take the union
    of field names": Plane's payload contains NONE of them. It sends exactly
    {event, action, webhook_id, workspace_id, workspace_slug, data, activity}
    (verified against Plane 1.4.1's own bgtasks/webhook_task.py, 2026-08-19), so
    the generic path below would fall all the way through to the raw-JSON fallback
    and post a 900-character wall of serialised issue into #tasks on every single
    work-item edit. That is worse than no integration: it is the kind of noise that
    gets a channel muted, which then also hides the alerts that matter.

    Plane also cannot set a custom header, so it authenticates with ?token= (the
    query form that exists for Axiom) and its own X-Plane-Signature is ignored —
    the shared bearer is what gates this service.

    Returns None for anything that is not a Plane payload, so every other sender
    is completely unaffected.
    """
    if not isinstance(payload, dict):
        return None
    # Discriminator: `workspace_slug` + `event` together are unique to Plane among
    # our senders. Checking one alone would be too eager.
    ev = payload.get("event")
    if not isinstance(ev, str) or not isinstance(payload.get("workspace_slug"), str):
        return None
    action = payload.get("action")
    action = action.strip() if isinstance(action, str) and action.strip() else "changed"
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    activity = payload.get("activity") if isinstance(payload.get("activity"), dict) else {}
    # Issues/projects/cycles/modules all carry `name`; a comment carries its text.
    title = ""
    for key in ("name", "comment_stripped", "title"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            title = val.strip()
            break
    if not title:
        # A "deleted" event's data is just {"id": ...} — say so rather than
        # rendering an empty title.
        title = str(data.get("id") or "(no title)")
    # Who did it. Absent on some system-generated activity, so never assumed.
    actor = ""
    who = activity.get("actor")
    if isinstance(who, dict):
        for key in ("display_name", "first_name", "email"):
            val = who.get(key)
            if isinstance(val, str) and val.strip():
                actor = " by " + val.strip()
                break
    slug = payload.get("workspace_slug")
    project_id = data.get("project")
    issue_id = data.get("issue") or (data.get("id") if ev == "issue" else None)

    # A comment payload names only the issue UUID and carries its body as HTML.
    # Resolve the issue so the line reads "comment on REC-378 <title>" instead of
    # "issue_comment created — 87b8a2a2-…".
    if ev == "issue_comment":
        body = _strip_html(data.get("comment_html"))
        issue_title, seq = _plane_issue(project_id, issue_id)
        if issue_title:
            title = issue_title
        if body:
            title = (title + " — " + body) if title else body

    ref = ""
    ident, _pname = _plane_project(project_id) if project_id else (None, None)
    seq = data.get("sequence_id")
    if ev == "issue_comment" and not seq:
        _t, seq = _plane_issue(project_id, issue_id)
    if ident and seq:
        ref = "%s-%s " % (ident, seq)

    message = "Plane: %s %s — %s%s%s" % (ev, action, ref, title[:200], actor)

    bits = []
    field = activity.get("field")
    if isinstance(field, str) and field.strip():
        old_v, new_v = activity.get("old_value"), activity.get("new_value")
        if field.strip() == "state" and project_id:
            # THE point of the enrichment: names, not UUIDs.
            old_v = _plane_state_name(project_id, old_v) or old_v
            new_v = _plane_state_name(project_id, new_v) or new_v
        # A UUID that could not be resolved is noise — say the field changed and
        # leave it there rather than printing two 36-character hex strings.
        def _readable(v):
            s = str(v) if v is not None else ""
            return "" if re.fullmatch(r"[0-9a-f]{8}-[0-9a-f-]{27,}", s) else s
        old_r, new_r = _readable(old_v), _readable(new_v)
        if old_r or new_r:
            bits.append("%s: %s → %s" % (field.strip(), old_r or "gol", new_r or "gol"))
        else:
            bits.append("%s a fost modificat" % field.strip())
    if slug and project_id and issue_id:
        bits.append("[Deschide în Plane](%s/%s/projects/%s/issues/%s)"
                    % (PLANE_API_URL or "", slug, project_id, issue_id))
    return message + ("\n" + " · ".join(bits) if bits else "")

def extract(payload):
    """Accept every shape a sender might plausibly send.

    Argo CD and Axiom are not going to agree on a field name, and neither is worth
    a bespoke adapter, so take the union rather than force senders into ours.
    """
    if not isinstance(payload, dict):
        return clean_text(str(payload)), "", "info"
    sev = str(payload.get("severity") or payload.get("level") or "info").lower()
    # Plane FIRST: its payload carries none of the keys below, so without this it
    # would reach the raw-JSON fallback. Every non-Plane sender gets None back and
    # continues down the normal path untouched.
    plane = plane_summary(payload)
    if plane is not None:
        # Task activity is informational by nature — it is a feed, not an alarm.
        head, _, rest = plane.partition("\n")
        return head, rest.strip(), "info"
    for key in ("message", "text", "summary", "body", "description"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            title = clean_text(val)
            detail = clean_text(payload.get("detail"))
            return title, detail, infer_severity(title, sev)
    # Slack-shaped (Axiom, and Slack-classic senders).
    slack = slack_summary(payload)
    if slack is not None:
        title, detail = slack
        return title, detail, infer_severity(title + " " + detail, sev)
    # LAST RESORT. Deliberately short and explicitly labelled rather than a dump of
    # the payload: an unreadable wall trains people to ignore the channel, and the
    # sender is the thing that needs fixing. The full payload is in this pod's log.
    return "Unrecognised notification payload", "", "warn"

def post_to_talk(token, message):
    body = json.dumps({"message": message}).encode()
    rand = secrets.token_hex(32)
    sig = hmac.new(BOT_SECRET, (rand + message).encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(
        TALK_URL + "/ocs/v2.php/apps/spreed/api/v1/bot/" + token + "/message",
        data=body,
        method="POST",
        headers={
            "OCS-APIRequest": "true",
            "Content-Type": "application/json",
            "X-Nextcloud-Talk-Bot-Random": rand,
            "X-Nextcloud-Talk-Bot-Signature": sig,
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.status

class Handler(BaseHTTPRequestHandler):
    def _reply(self, code, text):
        payload = text.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        # Default logging writes the full request line, which carries ?token= for
        # senders that authenticate by query string. Log method+path only.
        sys.stderr.write("%s %s\n" % (self.command, self.path.split("?")[0]))

    def do_GET(self):
        if self.path.split("?")[0] in ("/healthz", "/"):
            self._reply(200, "ok")
        else:
            self._reply(404, "not found")

    def do_POST(self):
        path, _, query = self.path.partition("?")
        # Bearer header OR ?token= — Axiom's notifier sends a bare URL with no way
        # to set a header, so the query form has to exist for it.
        supplied = self.headers.get("X-Notify-Token", "")
        if not supplied:
            for part in query.split("&"):
                if part.startswith("token="):
                    supplied = part[6:]
        if not hmac.compare_digest(supplied, NOTIFY_TOKEN):
            self._reply(401, "unauthorized")
            return
        if not path.startswith("/notify/"):
            self._reply(404, "not found")
            return
        channel = path[len("/notify/"):].strip("/")
        token = channel_token(channel)
        if not token:
            self._reply(404, "unknown channel: " + channel)
            return
        try:
            raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            payload = json.loads(raw or b"{}")
        except (ValueError, TypeError):
            payload = {"message": (raw or b"").decode("utf-8", "replace")}
        title, detail, sev = extract(payload)
        # Pull a leading "[dev]" environment tag out of the title and render it as
        # a trailing chip, so the sentence itself reads like a sentence.
        env = ""
        tag = _ENV_TAG.match(title)
        if tag:
            env = tag.group(1)
            title = title[tag.end():].strip()
        if not title:
            title = "Notification"
        # Strip any bold the sender already applied: the whole title is wrapped in
        # ** below, and nesting them renders a literal **** in Talk.
        title = title.replace("**", "").strip()
        # Sentence case: monitors are named "CI build failed", not "ci build failed".
        head = ICON.get(sev, ICON["info"]) + " **" + title[0].upper() + title[1:] + "**"
        if env:
            head += "  ·  " + env
        body = head + ("\n\n" + detail if detail else "")
        if is_duplicate(channel, sev + "|" + title):
            self._reply(200, "duplicate suppressed for #" + channel)
            return
        try:
            post_to_talk(token, body)
        except urllib.error.HTTPError as exc:
            self._reply(502, "talk rejected: %s" % exc.code)
            return
        except Exception as exc:  # noqa: BLE001 - surface any transport failure
            self._reply(502, "talk unreachable: %s" % type(exc).__name__)
            return
        self._reply(200, "sent to #" + channel)

if __name__ == "__main__":
    ThreadingHTTPServer(("", 8080), Handler).serve_forever()
