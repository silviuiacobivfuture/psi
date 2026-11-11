# THE ESTATE TILE POLICY — an Authentik expression policy, the body of a
# function Authentik calls with `request` (a PolicyRequest: `.user`, and `.obj`,
# the application whose tile is being decided). Returns True to show the tile.
#
# Embedded, with ACCESS filled in, into blueprints-estate-tiles.yaml by
# packages/rmx-ui/scripts/authentik-tiles.mjs, and bound to every star tile
# (Polaris, Sirius, Altair, Pulsar, Meridian, Vega) — never to the RECOMEX hub
# tile, which stays the door everybody has. Proven against a real OpenFGA and the
# hub's real person lookup by
# apps/autorizare-svc/internal/hub/estate_tile_policy_test.go.
#
# THE DECISION (main, 2026-10-29): a star tile is shown to a person who holds ANY
# right in that application's module, asked of the authorization DATA plane —
# OpenFGA, read port, the PINNED model, read-only — never of a directory group
# (a second source of truth for access) and never proxied through Polaris.
#   1. Who the person is in the engine's terms: the hub's person id (D25), which
#      the hub's identity links map from this account's subject at the hub's
#      client (`hashed_user_id` = `user.uid`). Asked of the hub's internal
#      lookup (internal/hub/person_lookup.go), the sign-in's own dependency.
#   2. Whether they hold a right: `app_<module>_access` (authz/tools/gen/
#      app_access.py; autorizare.fga by hand), Checked on the platform and
#      listed over each type it is defined on — any organisation, any company,
#      any workspace. One "yes" shows the tile.
#
# WHEN SOMETHING DOES NOT ANSWER — the hub, the engine, a configuration value —
# the tile is NOT shown (fail closed), and the reason is logged. Weighed against
# "the person cannot find their application": the RECOMEX tile is always there
# and opens the hub, whose switcher lists every estate application, so a person
# is never left without a way in; and the application itself still refuses
# whoever holds nothing, so a tile shown by mistake would only lead to a
# refusal. Showing nothing new is the outcome that is never wrong about access.
#
# THE CACHE is Authentik's own — a policy result per (binding, session, person)
# for `cache.timeout_policies` (300 s), and the library's list for up to 24
# hours (hard-coded in Authentik), dropped whenever any user is saved — and
# every sign-in saves the user, so a person gets current tiles at sign-in. A
# grant changed mid-session shows at the next sign-in, and the application
# refuses meanwhile (RUNBOOK 2026-10-29, the cache refresh retired). Nothing is
# cached here, so a person id never outlives a merge.

import json
import os
import urllib.error
import urllib.parse
import urllib.request

# GENERATED: estate key -> [["check", relation, platform object] | ["list", relation, type], …]
ACCESS = {}

TIMEOUT = 3


def setting(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise LookupError(f"MISSING REQUIRED SECRET: {name}")
    return value


def call(req):
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:  # nosec B310 — in-cluster http(s) only
        return json.loads(resp.read().decode("utf-8") or "{}")


def person_of(subject):
    """The hub's person id for this account, or None when it is linked to nobody live."""
    url = setting("HUB_PERSON_LOOKUP_URL") + "?" + urllib.parse.urlencode({"sub": subject})
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + setting("HUB_PERSON_LOOKUP_TOKEN")})
    try:
        return call(req)["personId"]
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def engine(path, body):
    base = setting("OPENFGA_URL").rstrip("/")
    store = setting("OPENFGA_STORE_ID")
    body = dict(body, authorization_model_id=setting("OPENFGA_MODEL_ID"))
    req = urllib.request.Request(
        f"{base}/stores/{store}/{path}",
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Authorization": "Bearer " + setting("OPENFGA_TOKEN"), "Content-Type": "application/json"},
    )
    return call(req)


def holds(user, ask):
    kind, relation, target = ask
    if kind == "check":
        key = {"user": user, "relation": relation, "object": target}
        return engine("check", {"tuple_key": key}).get("allowed") is True
    if kind == "list":
        found = engine("list-objects", {"user": user, "relation": relation, "type": target})
        return len(found.get("objects") or []) > 0
    raise ValueError(f"unknown question {kind!r}")


app = getattr(request.obj, "slug", "")
asks = ACCESS.get(app)
user = request.user
if not asks or user is None or not getattr(user, "is_authenticated", False):
    return False
try:
    person = person_of(user.uid)
    if person is None:
        return False
    return any(holds("user:" + person, ask) for ask in asks)
except Exception as exc:  # fail closed, and say why — never an Authentik policy exception per tile
    ak_logger.warning("estate tile hidden: a dependency did not answer", app=app, error=str(exc)[:300])
    return False
