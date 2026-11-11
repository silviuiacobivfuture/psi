"""test-reports — receive a CI run's business-rule outcome, keep it, serve it.

WHY IT EXISTS
    Until now a run's result lived in a GitHub job summary and a 30-day artifact
    zip. No history, no trend, nothing to link a chat message at, and nothing a
    non-technical stakeholder could open. This is phase 2 of
    infrastructure/hetzner/TEST-VISIBILITY-PLAN.md — deliberately NOT ReportPortal
    (that is phase 3), just the cheap half that delivers the business-facing value.

WHY PYTHON STDLIB
    http.server + json are in the base image, so there is no pip install, no
    requirements file, no supply chain and no build step — same reasoning as
    gitops/services/nextcloud/base/talk-webhook.yaml. It handles a handful of
    requests a day.

THE AUTH SPLIT — READ THIS BEFORE ADDING A ROUTE
    The UI (`/`, `/run/...`) sits behind the Authentik forward-auth middleware.
    `/ingest/...` and `/healthz` sit on a SEPARATE, UNGATED Ingress and are
    protected by a bearer token instead. That is not a shortcut: a forward-auth
    gate answers an unauthenticated request with a 302 to another origin, which a
    machine caller cannot follow — the exact failure that broke Plane outright on
    2026-08-19 (gitops/services/plane/base/ingress.yaml). A new MACHINE route must
    go on the ungated Ingress with token auth; a new BROWSER route goes on the
    gated one.

    Nothing here re-checks SSO: the gated Ingress is the only thing standing in
    front of the UI, so the routes are all reachable in-cluster by design. What
    the token protects is WRITES.
"""

import hmac
import json
import os
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import digest
import render
import store

# Bearer for POST /ingest. Read at startup: a rotation arrives as a new env value,
# which is why the Deployment carries the Reloader annotation (rotating the secret
# without restarting the pod would leave it validating the OLD token forever).
INGEST_TOKEN = os.environ["INGEST_TOKEN"]

# A report for ~400 rules is ~60 KB. 4 MiB is two orders of magnitude of headroom
# and still bounds what one request can make this process allocate.
MAX_BODY = int(os.environ.get("MAX_BODY_BYTES", str(4 * 1024 * 1024)))

# How many runs the index page scans. Bounds page-render cost and is the window
# within which "failing since N runs" can be stated exactly (analysis.py reports
# "de cel puțin N" when a streak reaches the edge of it, rather than lying).
HISTORY_LIMIT = int(os.environ.get("HISTORY_LIMIT", "40"))

# Listen port. 8080 in the cluster; overridable so the offline test can bind a
# free port and run the REAL server rather than a stand-in.
PORT = int(os.environ.get("PORT", "8080"))

# Public origin of this page, used ONLY to build the link inside the weekly digest.
# Not derived from the request Host: the digest is fetched over the in-cluster
# Service name, so Host would read `test-reports.test-reports.svc` and the chat
# message would carry a URL nobody outside the cluster can open.
PUBLIC_URL = os.environ["PUBLIC_URL"].rstrip("/")  # set by the piece: https://tests. + the estate apex

# Names the environment in the digest text. branch == environment, 1:1.
ENV_NAME = os.environ.get("ENV_NAME", "dev")

# How many runs per app the weekly digest scans. Larger than HISTORY_LIMIT because
# it compares against a run from a week ago and one busy app alone can do ~20 a day.
DIGEST_LIMIT = int(os.environ.get("DIGEST_LIMIT", "400"))

SCHEMA = "test-report/v1"


def validate(payload):
    """Return an error string if this is not a report envelope we can store.

    Boundary validation, in the sense root CLAUDE.md means it: everything arriving
    over HTTP is untrusted until it is checked. Rejecting loudly here is what stops
    a malformed sender quietly filling the volume with files the page then skips.
    """
    if not isinstance(payload, dict):
        return "body must be a JSON object"
    if payload.get("schema") != SCHEMA:
        return "unsupported schema (expected %s)" % SCHEMA
    if not isinstance(payload.get("totals"), dict):
        return "missing totals object"
    areas = payload.get("areas")
    if not isinstance(areas, list):
        return "missing areas array"
    for area in areas:
        if not isinstance(area, dict) or not isinstance(area.get("area"), str):
            return "each area needs an `area` name"
        if not isinstance(area.get("rules"), list):
            return "each area needs a `rules` array"
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "test-reports/1.0"

    # -- plumbing -----------------------------------------------------------
    def _send(self, code, body, content_type):
        payload = body.encode("utf-8")
        self.send_response(code)
        # charset matters: every string on this page is Romanian.
        self.send_header("Content-Type", "%s; charset=utf-8" % content_type)
        self.send_header("Content-Length", str(len(payload)))
        # The page is entirely self-contained (inline CSS, no scripts, no remote
        # assets), so it can afford the strictest policy there is.
        self.send_header(
            "Content-Security-Policy",
            "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; "
            "form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
        )
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def _text(self, code, message):
        self._send(code, message + "\n", "text/plain")

    def _html(self, code, markup):
        self._send(code, markup, "text/html")

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False) + "\n", "application/json")

    def log_message(self, fmt, *args):
        # Method + path only. Never the query string — the same discipline
        # talk-webhook applies, so a token can never reach the container log.
        sys.stderr.write("%s %s\n" % (self.command, self.path.split("?")[0]))

    # -- reads --------------------------------------------------------------
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/") or "/"
        if path == "/healthz":
            self._json(200, self.health())
            return
        if path == "/digest":
            # The weekly #tests summary, pre-rendered as the exact JSON body the
            # talk-webhook translator accepts — so the CronJob that posts it
            # (../weekly-digest.yaml) is a `curl | curl` and holds no logic at all.
            #
            # THIS ROUTE IS NOT ON THE UNGATED INGRESS, on purpose. Its only caller
            # is in-cluster and dials the Service directly, so it needs no public
            # exposure; the gated Ingress's `/` catch-all covers it for a browser,
            # which means it inherits the Authentik gate rather than adding a new
            # anonymous surface. Do NOT add /digest to the ingest Ingress.
            #
            # The body also carries a `summaries` array the translator ignores (it
            # reads message/detail/severity and nothing else) — kept because it is
            # what the offline harness and a human debugging the digest assert on.
            sections = [(app, store.history(app, DIGEST_LIMIT)) for app in store.apps()]
            self._json(
                200,
                digest.weekly(
                    sections,
                    now=datetime.now(timezone.utc),
                    base_url=PUBLIC_URL,
                    env_name=ENV_NAME,
                ),
            )
            return
        if path == "/":
            sections = [(app, store.history(app, HISTORY_LIMIT)) for app in store.apps()]
            self._html(200, render.render_index(sections))
            return
        if path.startswith("/run/"):
            parts = path[len("/run/") :].split("/")
            if len(parts) != 2:
                self._text(404, "not found")
                return
            app, stem = parts
            run = store.load(app, stem)
            if run is None:
                self._text(404, "verificarea nu există")
                return
            self._html(200, render.render_run(run))
            return
        self._text(404, "not found")

    def health(self):
        """Liveness AND freshness in one answer.

        ALWAYS 200, even when a report is stale: this endpoint is the kubelet's
        liveness probe, and returning 503 for staleness would restart a perfectly
        healthy pod because CI happened to be quiet. The AGE is reported and
        `doctor.sh` is what judges it — a silently-dead ingest is exactly the
        failure this whole service exists to prevent, so the number has to be
        readable from outside.
        """
        now = datetime.now(timezone.utc)
        apps = {}
        for app in store.apps():
            apps[app] = {
                "runs": len(store.stems(app)),
                "newestAgeSeconds": store.newest_age_seconds(app, now=now),
            }
        return {
            "status": "ok",
            "retentionDays": store.RETENTION_DAYS,
            "apps": apps,
            "now": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

    # -- writes -------------------------------------------------------------
    def do_POST(self):
        path = self.path.split("?")[0].rstrip("/")
        if not path.startswith("/ingest/"):
            self._text(404, "not found")
            return

        # Header-only bearer, deliberately: unlike talk-webhook there is no sender
        # here that cannot set a header (the only caller is a CI step), so the
        # ?token= form is not offered and cannot end up in a proxy access log.
        supplied = self.headers.get("X-Report-Token", "")
        if not hmac.compare_digest(supplied, INGEST_TOKEN):
            self._text(401, "unauthorized")
            return

        app = path[len("/ingest/") :]
        if not store.valid_app(app):
            self._text(400, "invalid app name")
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._text(400, "bad Content-Length")
            return
        if length <= 0:
            self._text(400, "empty body")
            return
        if length > MAX_BODY:
            self._text(413, "body too large (max %d bytes)" % MAX_BODY)
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as exc:
            # "Reject anything that does not parse" — a stored file that cannot be
            # read is worse than a rejected request, because it is discovered later.
            self._text(400, "body is not valid JSON: %s" % exc)
            return

        problem = validate(payload)
        if problem:
            self._text(400, problem)
            return

        try:
            run_id = store.save(app, payload)
        except (OSError, ValueError) as exc:
            sys.stderr.write("store failed for %s: %s\n" % (app, exc))
            self._text(500, "could not store the report")
            return

        # Prune here because there is no scheduler in a one-replica stdlib service
        # and ingest is the only guaranteed tick. It only ever deletes files whose
        # own name timestamp is outside the window.
        pruned = store.prune(app)
        self._text(201, "stored %s (pruned %d)" % (run_id, pruned))


def main():
    os.makedirs(store.DATA_DIR, exist_ok=True)
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
