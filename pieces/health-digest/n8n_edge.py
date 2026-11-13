"""n8n's edge still does what it was written to do: estate-watch's check of the running system.

The redirect in front of n8n (pieces/n8n/sso/intercept.yaml) depends on things an upgrade
or a bad merge can change without a pod failing: the `n8n-auth` cookie's name, the /signup path,
n8n's /rest/login, the rule's host. doctor reads the same facts, but doctor runs when somebody runs
it. This runs every tick, so a break reaches #infra.

NOBODY'S ACCOUNT. Anonymous page requests through the real edge, two reads of the Kubernetes API,
and one answer from the sidecar's /healthz/upstream (apps/n8n-sso/src/upstream.ts): a junk cookie,
which n8n clears by name, then a real automatic sign-in and sign-out by a robot account that is not
a person.

THE SIDECAR IS ASKED DIRECTLY, on its Service, through a rule of its NetworkPolicy naming this pod.
Not through the API server's service proxy: that reaches only a pod on the control plane's own node,
and answered 502 for a healthy sidecar from the moment it moved to another one (2026-11-04, 20:02Z),
which this check posted to #infra as sign-in being broken.

THE SCRIPT n8n's PAGES LOAD IS HASHED AS THE EDGE SERVES IT, anonymously, and held to
n8n-page-hook.sha256, the one pin, shipped beside this file in the same ConfigMap. Status alone says
nothing here: sso.yaml rolled back to an old image serves the old script with a clean 200.

AN UNREADABLE ANSWER IS A FAILURE, NOT "CANNOT TELL". Here nothing answering IS the break: a person
would get the same silence. So every row reports by itself, with the cron grace, which rides out a
restart. TLS is not verified: this judges routing, and n8n served Traefik's default certificate for
its first days. doctor's own row judges the certificate.

No N8N_EDGE_HOST means no n8n on this cluster, and nothing is judged.
Cases: scripts/tests/estate_watch_cases.py, case n8n-edge.
"""
import hashlib
import http.client
import json
import os
import re
import ssl
import urllib.error
import urllib.request

NS = "n8n"
SIDECAR = "http://n8n-sso.n8n.svc:8080"
HINT = "docs/n8n/01-identity.md H11; doctor's n8n layer names the same row."
HOOK_PIN = "n8n-page-hook.sha256"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


# Where an estate repository holds it: the n8n piece, vendored at the path SEB keeps it (084c649).
SSO_YAML = "pieces/n8n/sso/sso.yaml"


def fetch(base, host, path, cookie=None, site=None):
    """(status, location, body) as a browser's page load gets them. A transport failure is status 0."""
    headers = {"Host": host, "Sec-Fetch-Dest": "document"}
    if cookie:
        headers["Cookie"] = cookie
    if site:
        headers["Sec-Fetch-Site"] = site
    context = ssl._create_unverified_context()  # noqa: S323 the docstring says why
    opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=context))
    try:
        with opener.open(urllib.request.Request(base + path, headers=headers), timeout=15) as r:
            return r.status, r.headers.get("Location") or "", r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Location") or "", b""
    except (urllib.error.URLError, OSError, http.client.HTTPException) as e:
        print(f"  n8n edge: transport failure on {path}: {type(e).__name__}")
        return 0, "", b""


def page(base, host, path, cookie=None, site=None):
    """(status, location) of a page load."""
    return fetch(base, host, path, cookie, site)[:2]


def pinned_hook():
    """The SHA-256 the gate holds src/page-hook.ts to, or None when the pin cannot be read."""
    here = os.path.dirname(os.path.abspath(__file__))
    try:
        with open(os.environ.get("N8N_EDGE_HOOK_PIN", os.path.join(here, HOOK_PIN)), encoding="ascii") as f:
            text = f.read().strip()
    except (OSError, ValueError):
        return None
    return text if re.fullmatch("[0-9a-f]{64}", text) else None


def sidecar_probe():
    """(status, body) of the sidecar's own probe. A transport failure is status 0, and is a failure."""
    base = os.environ.get("N8N_EDGE_SIDECAR_URL", SIDECAR).rstrip("/")
    try:
        with urllib.request.urlopen(base + "/healthz/upstream", timeout=30) as r:  # noqa: S310 our Service
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError, http.client.HTTPException) as e:
        print(f"  n8n edge: the sidecar did not answer: {type(e).__name__}")
        return 0, ""


def untouched(status, location):
    return 0 < status < 500 and "/sso/setup" not in location


def digest_problem(kube):
    code, text = kube.request(f"/apis/apps/v1/namespaces/{NS}/deployments/n8n")
    if code != 200:
        return f"its Deployment is unreadable (HTTP {code})"
    code, pods = kube.request(f"/api/v1/namespaces/{NS}/pods?labelSelector=app.kubernetes.io%2Fname%3Dn8n")
    if code != 200:
        return f"its pods are unreadable (HTTP {code})"
    try:
        # The key's domain is the estate's label domain; only its name is the platform's.
        (tested,) = [v for k, v in json.loads(text)["metadata"]["annotations"].items() if k.startswith("n8n.") and k.endswith("/tested-digest")]
        running = {
            c["imageID"].rsplit("@", 1)[-1]
            for p in json.loads(pods)["items"]
            for c in p["status"]["containerStatuses"]
            if c["name"] == "n8n"
        }
    except (ValueError, KeyError, TypeError):
        return "the digest or the pod could not be read"
    if running != {tested}:
        return f"it runs {sorted(running) or 'nothing'}, and the suites passed against {tested}"
    return None


def sidecar_image_problem(cfg, kube):
    """What git names against what runs: a rollout that stopped short keeps a fix out of reach."""
    if not cfg.github_token:
        return "there is no GitHub token to read sso.yaml with"
    url = f"{cfg.github_api}/repos/{cfg.github_repo}/contents/{SSO_YAML}?ref={cfg.github_branch}"
    headers = {"Authorization": "Bearer " + cfg.github_token, "Accept": "application/vnd.github.raw+json", "User-Agent": "estate-watch"}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=15) as r:  # noqa: S310 GitHub
            text = r.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError, http.client.HTTPException) as e:
        return f"sso.yaml could not be read ({type(e).__name__})"
    # The sidecar's image by its repository name: the host and project in front of it are estate
    # values (WLREGISTRY/WLAPPS in git, rendered by the whitelabel overlay), never a fixed name.
    named = re.search(r"""^\s*-?\s*image:\s*["']?(?:\S+/)?n8n-sso:[^@\s"']+@(sha256:[0-9a-f]{64})""", text, re.M)
    if not named:
        return "sso.yaml names no digest"
    code, pods = kube.request(f"/api/v1/namespaces/{NS}/pods?labelSelector=app.kubernetes.io%2Fname%3Dn8n-sso")
    if code != 200:
        return f"its pods are unreadable (HTTP {code})"
    try:
        running = {
            c["imageID"].rsplit("@", 1)[-1]
            for p in json.loads(pods)["items"]
            for c in p["status"]["containerStatuses"]
            if c["name"] == "n8n-sso"
        }
    except (ValueError, KeyError, TypeError):
        return "its pods could not be read"
    if running != {named.group(1)}:
        return f"it runs {sorted(running) or 'nothing'}, and sso.yaml names {named.group(1)}"
    return None


def check(cfg, kube, finding, _cannot_tell):
    host = os.environ.get("N8N_EDGE_HOST", "")
    if not host:
        return []
    base = os.environ.get("N8N_EDGE_URL", f"https://{host}").rstrip("/")
    out = []

    def bad(key, text):
        out.append(finding(f"n8n-edge:{key}", "fail", f"n8n: {text} {HINT}", cfg.grace_cron))

    status, location = page(base, host, "/")
    if status != 302 or "/sso/setup" not in location:
        bad("no-session", f"a page load with no session answered {status} '{location}', not a redirect to /sso/setup: someone with no password meets a dead end.")
    status, location = page(base, host, "/", "n8n-auth=estate-watch-probe")
    if not untouched(status, location):
        bad("session", f"a page load WITH an n8n-auth cookie answered {status} '{location}': signed-in people are being redirected or refused.")
    # A click from another site must reach the button: nothing later can tell where it came from.
    for key, path in (("press", "/sso/setup"), ("press-start", "/outpost.goauthentik.io/start")):
        status, location = page(base, host, path, site="cross-site")
        if status != 302 or "/sso/setup?press=1" not in location:
            bad(key, f"{path} from another site answered {status} '{location}', not a redirect to the button: another site can sign a person in.")
    # Signed out, Authentik's own answer here ends on a spinner for ever (sso/launch.yaml).
    auth = os.environ.get("N8N_EDGE_AUTH_HOST", "")
    if auth:
        auth_base = os.environ.get("N8N_EDGE_AUTH_URL", f"https://{auth}").rstrip("/")
        status, location = page(auth_base, auth, "/application/launch/n8n/")
        if status != 302 or location != f"https://{host}/sso/setup":
            bad("launch", f"Authentik's launch address answered {status} '{location}', not a redirect to /sso/setup: someone signed out who opens it signs in and is left on a spinner.")
    status, location = page(base, host, "/signup?token=estate-watch-probe")
    if not untouched(status, location):
        bad("signup", f"/signup answered {status} '{location}': nobody can reach their invitation.")
    hooks = os.environ.get("N8N_EDGE_HOOKS_HOST", "")
    status, location = page(os.environ.get("N8N_EDGE_HOOKS_URL", f"https://{hooks}").rstrip("/"), hooks, "/webhook/estate-watch-probe")
    if not untouched(status, location):
        bad("webhook", f"a webhook on {hooks} answered {status} '{location}': published workflows are being redirected or are down.")
    # Anonymous and ungated on purpose (sso/page.yaml): the one answer that is the edge's own.
    status, _, script = fetch(base, host, "/sso/page.js")
    if status != 200:
        bad("page-hook-edge", f"/sso/page.js answered {status}, not 200: n8n's pages load a script that is not there, and a dead cookie leaves a person on n8n's form")
    else:
        pin = pinned_hook()
        served = hashlib.sha256(script).hexdigest()
        if pin is None:
            bad("page-hook-pin", f"the pin {HOOK_PIN} could not be read, so nobody can say whether the script in every n8n page is the reviewed one.")
        elif served != pin:
            bad("page-hook-pin", f"/sso/page.js is not the pinned script: the edge serves {served}, the pin is {pin}. An old image would do this, and a script nobody reviewed is running in every n8n page.")
    status, location = page(base, host, "/webhook/estate-watch-probe")
    if status != 403:
        bad("webhook-closed", f"a webhook path on the editor's host answered {status}, not 403: a workflow could read a person's session.")
    code, text = sidecar_probe()
    if code != 200 or text.strip() != "ok":
        bad("upstream", f"automatic sign-in, /rest/login, the n8n-auth cookie, the page hook or the provider's implicit flow is broken: the sidecar's probe answered {code} '{text.strip()[:60]}'.")
    problem = sidecar_image_problem(cfg, kube)
    if problem:
        bad("sidecar-image", f"what git says is fixed is not what is running: {problem}.")
    problem = digest_problem(kube)
    if problem:
        bad("digest", f"the running image is not the tested one: {problem}.")
    return out
