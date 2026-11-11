"""OpenBao auth configuration: the declared state, the comparison, and the rules.

Pure — no network. A STATE is a plain dict, the same shape for the declaration
(desired) and for the live store (auth_bao.snapshot):

  mounts    {path: {"type", "accessor"}}            auth methods, path without "/"
  policies  {name: hcl text}                        ACL policies ("root" excluded)
  configs   {mount: {field: value}}                 oidc/jwt mount configs
  roles     {mount: {name: {field: value}}}
  token_roles [name]                                auth/token/roles
  groups    {name: {"type", "policies", "mount"}}   identity groups
  aliases   [{"id", "name", "mount", "group"}]      identity group-aliases
  entities  {id: {"name", "policies"}}              only entities WITH direct policies

plan(desired, live) returns the actions that make live equal desired; hygiene(state)
returns what is OPEN in a state whatever the declaration says. Both are used on the
declaration too: a declaration that is itself open is refused before any write.
"""
from __future__ import annotations

import json
import pathlib
import re
from typing import Any

# Never deleted, whatever the declaration says. The reconciler's own login and the
# store every ExternalSecret hangs on are bootstrap paths (openbao-bootstrap.sh):
# a declaration that dropped them would lock the reconciler out or stop every
# secret delivery in the cluster, and only root could undo it.
PROTECTED_POLICIES = frozenset({"root", "default", "eso", "openbao-auth-reconcile"})
PROTECTED_ROLES = frozenset({("kubernetes", "eso"), ("kubernetes", "openbao-auth-reconcile")})
PROTECTED_MOUNTS = frozenset({"token", "kubernetes"})
# A run that would delete more than this refuses as a whole: a truncated or
# half-mounted declaration must not be able to empty the store.
MAX_DELETES = 5

# Security-relevant fields compared for every role, with OpenBao's own defaults.
# A field set by hand that is not declared is therefore drift and is reset.
JWT_ROLE_DEFAULTS: dict[str, Any] = {
    "role_type": "oidc", "user_claim": "", "groups_claim": "", "bound_subject": "",
    "bound_audiences": [], "bound_claims": {}, "bound_claims_type": "string",
    "claim_mappings": {}, "allowed_redirect_uris": [], "oidc_scopes": [],
    "token_policies": [], "token_no_default_policy": False, "token_ttl": 0,
    "token_max_ttl": 0, "token_explicit_max_ttl": 0, "token_num_uses": 0,
    "token_period": 0, "token_type": "default", "token_bound_cidrs": [],
    "verbose_oidc_logging": False,
}
K8S_ROLE_DEFAULTS: dict[str, Any] = {
    "bound_service_account_names": [], "bound_service_account_namespaces": [],
    "bound_service_account_namespace_selector": "", "alias_name_source": "serviceaccount_uid",
    "token_policies": [], "token_no_default_policy": False, "token_ttl": 0,
    "token_max_ttl": 0, "token_explicit_max_ttl": 0, "token_num_uses": 0,
    "token_period": 0, "token_type": "default", "token_bound_cidrs": [],
}
ROLE_DEFAULTS = {"oidc": JWT_ROLE_DEFAULTS, "jwt": JWT_ROLE_DEFAULTS, "kubernetes": K8S_ROLE_DEFAULTS}
# Config fields compared on an oidc/jwt mount besides the declared ones.
CONFIG_DEFAULTS: dict[str, Any] = {"default_role": "", "bound_issuer": "", "jwks_url": "",
                                   "jwt_validation_pubkeys": []}


class DeclarationError(ValueError):
    """The declaration is malformed, incomplete or itself open — nothing is applied."""


def _public(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if not k.startswith("_")}


def norm(v: Any) -> Any:
    """Comparison form: empties are one value, string lists are unordered."""
    if v in (None, "", [], {}):
        return None
    if isinstance(v, list):
        items = [norm(x) for x in v]
        return sorted(items, key=json.dumps) if all(isinstance(x, (str, int)) for x in v) else items
    if isinstance(v, dict):
        d = {k: norm(x) for k, x in v.items()}
        d = {k: x for k, x in d.items() if x is not None}
        return d or None
    return v


def policy_text(text: str) -> str:
    return text.strip()


def load(decl_path: pathlib.Path, policies_dirs: pathlib.Path | list[pathlib.Path]) -> dict[str, Any]:
    """declaration.json + <dir>/*.hcl for every policies dir -> raw declaration, validated.

    Several dirs: the platform's policies/ and the applications' (../apps/policies,
    SEB 1.16b). A policy name found in two of them is refused, never shadowed."""
    raw = json.loads(decl_path.read_text())
    names = raw["policies"]
    files: dict[str, pathlib.Path] = {}
    for d in policies_dirs if isinstance(policies_dirs, list) else [policies_dirs]:
        for p in sorted(d.glob("*.hcl")):
            if p.stem in files:
                raise DeclarationError(f"policy {p.stem} has two files: {files[p.stem]} and {p}")
            files[p.stem] = p
    missing = [n for n in names if n not in files]
    undeclared = sorted(set(files) - set(names))
    if missing:
        raise DeclarationError("declared policy without a file: " + ", ".join(missing))
    if undeclared:
        raise DeclarationError("policy file not in declaration.json: " + ", ".join(undeclared))
    raw["policy_texts"] = {n: files[n].read_text() for n in names}
    validate(raw)
    return raw


def validate(raw: dict[str, Any]) -> None:
    mounts = raw["mounts"]
    pols = set(raw["policies"]) | {"default"}
    errs: list[str] = []
    for name in PROTECTED_POLICIES - {"root"}:
        if name not in raw["policies"]:
            errs.append(f"protected policy {name} is not declared")
    for mount, name in PROTECTED_ROLES:
        if name not in raw["roles"].get(mount, {}):
            errs.append(f"protected role {mount}/{name} is not declared")
    for mount, roles in raw["roles"].items():
        if mount not in mounts:
            errs.append(f"roles declared on undeclared mount {mount}")
        for rname, role in _public(roles).items():
            for p in role.get("token_policies", []):
                if p not in pols:
                    errs.append(f"role {mount}/{rname} names undeclared policy {p}")
    for gname, g in _public(raw["groups"]).items():
        if g["mount"] not in mounts:
            errs.append(f"group {gname} aliased to undeclared mount {g['mount']}")
        for p in g["policies"]:
            if p not in pols:
                errs.append(f"group {gname} names undeclared policy {p}")
    for mount, cfg in raw["configs"].items():
        dr = cfg.get("default_role")
        if dr and dr not in raw["roles"].get(mount, {}):
            errs.append(f"config {mount}: default_role {dr} is not a declared role")
    if errs:
        raise DeclarationError("; ".join(errs))


def desired_state(raw: dict[str, Any], kv: dict[str, dict[str, str]] | None) -> dict[str, Any]:
    """The declaration as a STATE. kv=None (doctor): KV-sourced config fields are
    left out of the comparison instead of guessed."""
    configs: dict[str, dict[str, Any]] = {}
    for mount, cfg in raw["configs"].items():
        out: dict[str, Any] = dict(CONFIG_DEFAULTS)
        for k, v in cfg.items():
            if isinstance(v, dict) and "kv" in v:
                if kv is None:
                    continue
                out[k] = kv[v["kv"]][v["field"]]
            else:
                out[k] = v
        configs[mount] = out
    roles: dict[str, dict[str, Any]] = {}
    for mount, decl in raw["roles"].items():
        base = ROLE_DEFAULTS[raw["mounts"][mount]]
        shared = raw.get("role_defaults", {}).get(mount, {})
        roles[mount] = {n: {**base, **shared, **_public(r)} for n, r in _public(decl).items()}
    return {
        "mounts": {m: {"type": t} for m, t in raw["mounts"].items()},
        "policies": {n: raw["policy_texts"][n] for n in raw["policies"]},
        "configs": configs,
        "roles": roles,
        "token_roles": [],
        "groups": {n: {"type": "external", "policies": g["policies"], "mount": g["mount"]}
                   for n, g in _public(raw["groups"]).items()},
        "aliases": [{"name": n, "mount": g["mount"], "group": n}
                    for n, g in _public(raw["groups"]).items()],
        "entities": {},
    }


def secret_fields(raw: dict[str, Any], mount: str) -> set[str]:
    return {k for k, v in raw["configs"].get(mount, {}).items() if isinstance(v, dict) and v.get("secret")}


def kv_paths(raw: dict[str, Any]) -> set[str]:
    return {v["kv"] for cfg in raw["configs"].values() for v in cfg.values()
            if isinstance(v, dict) and "kv" in v}


# --- the plan ---------------------------------------------------------------
def _diff_fields(want: dict[str, Any], have: dict[str, Any] | None, skip: set[str]) -> list[str]:
    have = have or {}
    return sorted(k for k in want if k not in skip and norm(want[k]) != norm(have.get(k)))


def plan(desired: dict[str, Any], live: dict[str, Any], secret: dict[str, set[str]] | None = None) -> list[dict[str, Any]]:
    """Actions, in apply order. Each: {"op", "what", "why", ...payload}."""
    secret = secret or {}
    acts: list[dict[str, Any]] = []
    add = acts.append
    for m, spec in desired["mounts"].items():
        cur = live["mounts"].get(m)
        if cur is None:
            add({"op": "enable_mount", "what": f"auth method {m}/", "why": "declared, absent", "mount": m, "type": spec["type"]})
        elif cur["type"] != spec["type"]:
            add({"op": "report", "what": f"auth method {m}/", "why": f"is {cur['type']}, declared {spec['type']} — never changed automatically"})
    for m in sorted(set(live["mounts"]) - set(desired["mounts"]) - PROTECTED_MOUNTS):
        add({"op": "report", "what": f"auth method {m}/ ({live['mounts'][m]['type']})",
             "why": "NOT declared — reported, never disabled (break-glass rule); declare it or disable it by hand"})
    for n, text in desired["policies"].items():
        if policy_text(live["policies"].get(n, "")) != policy_text(text):
            add({"op": "write_policy", "what": f"policy {n}", "why": "absent" if n not in live["policies"] else "text differs", "name": n, "text": text})
    for m, want in desired["configs"].items():
        diff = _diff_fields(want, live["configs"].get(m), secret.get(m, set()))
        if diff:
            add({"op": "write_config", "what": f"auth/{m}/config", "why": "differs: " + ", ".join(diff), "mount": m, "body": want})
    for m, roles in desired["roles"].items():
        for n, want in roles.items():
            have = live["roles"].get(m, {}).get(n)
            diff = _diff_fields(want, have, set())
            if have is None or diff:
                add({"op": "write_role", "what": f"role {m}/{n}", "why": "absent" if have is None else "differs: " + ", ".join(diff),
                     "mount": m, "name": n, "body": want})
    retyped: set[str] = set()
    for n, want in desired["groups"].items():
        have = live["groups"].get(n)
        if have is not None and have["type"] != want["type"]:
            retyped.add(n)
            add({"op": "delete_group", "what": f"identity group {n}", "why": f"type {have['type']}, declared {want['type']}", "name": n})
            have = None
        if have is None or norm(have["policies"]) != norm(want["policies"]):
            add({"op": "write_group", "what": f"identity group {n}", "why": "absent" if have is None else
                 f"policies {sorted(have['policies'] or [])} → {sorted(want['policies'])}", "name": n, "type": want["type"], "policies": want["policies"]})
    kept: set[str] = set()
    for a in live["aliases"]:
        g = desired["groups"].get(a.get("group") or "")
        if a.get("group") in retyped:
            continue  # deleted with its group above; rewritten below
        if g and a["name"] == a["group"] and a["mount"] == g["mount"] and a["group"] not in kept:
            kept.add(a["group"])
        else:
            add({"op": "delete_alias", "what": f"group alias {a['name']} ({a['id']})",
                 "why": "not declared" if not g else "wrong name or mount, or a duplicate", "id": a["id"], "name": a["name"]})
    for want_a in desired["aliases"]:
        if want_a["group"] not in kept:
            add({"op": "write_alias", "what": f"group alias {want_a['name']} → {want_a['mount']}/", "why": "absent", **want_a})
    for m, roles in live["roles"].items():
        if m not in desired["mounts"]:
            continue  # an undeclared method's roles go with the method; reported above
        for n in sorted(set(roles) - set(desired["roles"].get(m, {}))):
            if (m, n) in PROTECTED_ROLES:
                continue
            add({"op": "delete_role", "what": f"role {m}/{n}", "why": "not declared", "mount": m, "name": n})
    for n in sorted(live["token_roles"]):
        add({"op": "delete_token_role", "what": f"token role {n}", "why": "not declared", "name": n})
    for n in sorted(set(live["groups"]) - set(desired["groups"])):
        add({"op": "delete_group", "what": f"identity group {n}", "why": "not declared", "name": n})
    for eid, e in sorted(live["entities"].items()):
        add({"op": "clear_entity_policies", "what": f"entity {e['name']} ({eid})",
             "why": f"direct policies {sorted(e['policies'])} — grants go through declared groups only", "id": eid})
    for n in sorted(set(live["policies"]) - set(desired["policies"]) - PROTECTED_POLICIES):
        add({"op": "delete_policy", "what": f"policy {n}", "why": "not declared", "name": n})
    return acts


DELETING = {"delete_role", "delete_token_role", "delete_group", "delete_alias", "delete_policy", "clear_entity_policies"}


def deletions(acts: list[dict[str, Any]]) -> int:
    # A group whose type changed, or an alias moved to the current accessor, is
    # deleted and written again: a rewrite, not a loss, so it does not count.
    regroup = {a["name"] for a in acts if a["op"] == "write_group"}
    realias = {a["name"] for a in acts if a["op"] == "write_alias"}
    return sum(1 for a in acts if a["op"] in DELETING
               and not (a["op"] == "delete_group" and a["name"] in regroup)
               and not (a["op"] == "delete_alias" and a["name"] in realias))


# --- hygiene: what is open, whatever was declared ----------------------------
_PATH_RE = re.compile(r'path\s+"([^"]+)"\s*\{([^{}]*)\}', re.S)
_CAPS_RE = re.compile(r'capabilities\s*=\s*\[([^\]]*)\]')


def policy_paths(text: str) -> list[tuple[str, list[str]]]:
    body = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith(("#", "//")))
    out = []
    for path, block in _PATH_RE.findall(body):
        m = _CAPS_RE.search(block)
        caps = re.findall(r'"([^"]+)"', m.group(1)) if m else []
        out.append((path, caps))
    return out


def reaches_secret(pattern: str) -> bool:
    """True when the ACL path pattern matches some path on the secret/ mount."""
    target = "secret/"
    i = 0
    for ch in pattern:
        if i >= len(target):
            return True
        if ch == "*":
            return True
        if ch == "+":
            if i != 0:  # a segment wildcard inside "secret/" cannot line up
                return False
            i = len("secret")
            continue
        if target[i] != ch:
            return False
        i += 1
    return i >= len(target)


def secret_grants(text: str) -> list[str]:
    return [p for p, caps in policy_paths(text) if reaches_secret(p) and caps and caps != ["deny"]]


def _unbound(mtype: str, role: dict[str, Any]) -> str | None:
    if mtype == "kubernetes":
        names = role.get("bound_service_account_names") or []
        nss = role.get("bound_service_account_namespaces") or []
        sel = role.get("bound_service_account_namespace_selector") or ""
        if not names or "*" in names:
            return "binds any ServiceAccount name"
        if (not nss or "*" in nss) and not sel:
            return "binds any namespace"
        return None
    claims = role.get("bound_claims") or {}
    glob = (role.get("bound_claims_type") or "string") == "glob"
    if not claims and not role.get("bound_subject"):
        return "has no bound claims (any account of the issuer may log in)"
    for k, v in claims.items():
        vals = v if isinstance(v, list) else [v]
        if not vals or (glob and any(str(x).strip("*") == "" for x in vals)):
            return f"bound claim {k} matches anyone"
    return None


def hygiene(state: dict[str, Any]) -> list[str]:
    """OPEN findings: an unbound role, or a default role / the default policy that
    reaches a secret path. Evaluated on the live store AND on the declaration."""
    found: list[str] = []
    for m, roles in sorted(state["roles"].items()):
        mtype = state["mounts"].get(m, {}).get("type", "")
        for n, role in sorted(roles.items()):
            why = _unbound(mtype, role)
            if why:
                found.append(f"role {m}/{n} {why}")
    pols = state["policies"]
    for path in secret_grants(pols.get("default", "")):
        found.append(f"policy default (on nearly every token) grants secret path {path}")
    for m, cfg in sorted(state["configs"].items()):
        dr = (cfg or {}).get("default_role") or ""
        if not dr:
            continue
        role = state["roles"].get(m, {}).get(dr)
        if role is None:
            continue
        names = list(role.get("token_policies") or [])
        for p in names:
            for path in secret_grants(pols.get(p, "")):
                found.append(f"default role {m}/{dr} grants secret path {path} (policy {p})")
        if not role.get("token_no_default_policy") and secret_grants(pols.get("default", "")):
            found.append(f"default role {m}/{dr} carries the default policy, which grants a secret path")
    return found
