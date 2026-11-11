#!/usr/bin/env python3
"""OpenBao auth configuration, reconciled from git.

  openbao_auth.py reconcile   make the store equal declaration.json (+ policies/*.hcl)
  openbao_auth.py check       compare only; exit 1 on any drift or open grant
  openbao_auth.py snapshot    print the live auth state as JSON (no secret in it)

Authentication, in this order:
  --login ROLE --jwt-file F   Kubernetes login with a ServiceAccount token (the CronJob)
  --login ROLE --jwt-stdin    the same, token on stdin (doctor.sh, a minted token)
  BAO_TOKEN in the env        an operator token (openbao-bootstrap.sh, root, once)
  --snapshot FILE             check/plan against a saved state; no network (tests)

Output, one finding per line, so doctor.sh and the CronJob log read the same:
  OK <what>  ·  DRIFT <what> — <why>  ·  OPEN <what>  ·  APPLIED <what> — <why>
  FINDING <what> — <why>  ·  ERROR <what> — <why>  ·  REFUSED <why>
Exit: 0 clean · 1 drift/open/error remained · 2 declaration refused · 3 too many deletions.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # python3 -I drops the script's directory

import auth_bao  # noqa: E402
import auth_model as model  # noqa: E402


def _args(argv: list[str]) -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog="openbao_auth.py")
    ap.add_argument("mode", choices=["reconcile", "check", "snapshot"])
    ap.add_argument("--decl", default=os.environ.get("AUTH_DECL", str(HERE / "declaration.json")))
    # Directories of *.hcl, joined by os.pathsep: the platform's policies/, then the
    # applications' ../apps/policies (SEB 1.16b; skipped while absent). In-cluster
    # the ConfigMap flattens both into /decl.
    ap.add_argument("--policies", default=os.environ.get(
        "AUTH_POLICIES", os.pathsep.join([str(HERE / "policies"), str(HERE.parent / "apps" / "policies")])))
    ap.add_argument("--addr", default=os.environ.get("BAO_ADDR", "http://openbao.openbao.svc:8200"))
    ap.add_argument("--login", default="")
    ap.add_argument("--login-mount", default="kubernetes")
    ap.add_argument("--jwt-file", default="")
    ap.add_argument("--jwt-stdin", action="store_true")
    ap.add_argument("--snapshot", default="")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--allow-deletes", type=int, default=model.MAX_DELETES)
    return ap.parse_args(argv)


def _client(a: argparse.Namespace) -> auth_bao.HttpBao:
    bao = auth_bao.HttpBao(a.addr)
    if a.login:
        jwt = sys.stdin.read().strip() if a.jwt_stdin else pathlib.Path(a.jwt_file).read_text().strip()
        auth_bao.login_kubernetes(bao, a.login_mount, a.login, jwt)
    else:
        bao.token = os.environ.get("BAO_TOKEN", "")
        if not bao.token:
            raise SystemExit("REFUSED no credential: --login ROLE (--jwt-file|--jwt-stdin) or BAO_TOKEN")
    return bao


def _secret(raw: dict) -> dict[str, set[str]]:
    return {m: model.secret_fields(raw, m) for m in raw["configs"]}


def _load(a: argparse.Namespace) -> dict:
    raw = model.load(pathlib.Path(a.decl), [pathlib.Path(d) for d in a.policies.split(os.pathsep) if d])
    opened = model.hygiene(model.desired_state(raw, None))
    if opened:
        raise model.DeclarationError("the declaration itself is open: " + "; ".join(opened))
    return raw


def _summary(live: dict, raw: dict) -> list[str]:
    roles = sum(len(r) for r in live["roles"].values())
    return [f"OK {len(live['policies'])} policies, {roles} roles on {len(live['roles'])} methods, "
            f"{len(live['groups'])} identity groups, {len(live['aliases'])} aliases — as declared",
            f"OK default role {raw['configs'].get('oidc', {}).get('default_role', '?')} reaches no secret path; every role is bound"]


def check(a: argparse.Namespace, raw: dict) -> int:
    if a.snapshot:
        live = json.loads(pathlib.Path(a.snapshot).read_text())
    else:
        bao = _client(a)
        try:
            live = auth_bao.snapshot(bao)
        finally:
            if a.login:
                auth_bao.revoke_self(bao)
    acts = model.plan(model.desired_state(raw, None), live, _secret(raw))
    opened = model.hygiene(live)
    for act in acts:
        print(f"DRIFT {act['what']} — {act['why']}")
    for o in opened:
        print(f"OPEN {o}")
    if acts or opened:
        return 1
    for line in _summary(live, raw):
        print(line)
    return 0


def _kv(bao: auth_bao.HttpBao, raw: dict) -> tuple[dict[str, dict[str, str]], list[str]]:
    """KV values the configs need, and the KV paths that cannot supply them. A
    missing value never blocks the rest of the run (a fresh store has roles to
    write before seed-secrets.sh has run); the config that needs it is skipped."""
    out, missing = {}, []
    for path in sorted(model.kv_paths(raw)):
        data = (bao.read(f"secret/data/{path}") or {}).get("data") or {}
        fields = {v["field"] for cfg in raw["configs"].values() for v in cfg.values()
                  if isinstance(v, dict) and v.get("kv") == path}
        empty = sorted(f for f in fields if not data.get(f))
        if empty:
            missing.append(f"secret/{path} lacks {', '.join(empty)}")
            continue
        out[path] = {k: str(v) for k, v in data.items()}
    return out, missing


def reconcile(a: argparse.Namespace, raw: dict) -> int:
    bao = _client(a)
    try:
        return _reconcile(a, raw, bao)
    finally:
        if a.login:
            auth_bao.revoke_self(bao)


def _reconcile(a: argparse.Namespace, raw: dict, bao: auth_bao.HttpBao) -> int:
    kv, missing = _kv(bao, raw)
    unready = {m for m, cfg in raw["configs"].items()
               if any(isinstance(v, dict) and "kv" in v and v["kv"] not in kv for v in cfg.values())}
    trimmed = {**raw, "configs": {m: c for m, c in raw["configs"].items() if m not in unready}}
    desired = model.desired_state(trimmed, kv)
    secret = {m: f for m, f in _secret(raw).items() if m not in unready}
    bad = 0
    for m in sorted(unready):
        print(f"ERROR auth/{m}/config not written — {'; '.join(missing)} (seed-secrets.sh)")
        bad += 1
    acts = model.plan(desired, auth_bao.snapshot(bao), secret)
    planned = {a_["mount"] for a_ in acts if a_["op"] == "write_config"}
    for m, fields in secret.items():
        if fields and m not in planned:  # write-only fields: never comparable, so re-asserted
            acts.append({"op": "write_config", "what": f"auth/{m}/config", "why": "credentials re-asserted from KV",
                         "mount": m, "body": desired["configs"][m], "reassert": True})
    n_del = model.deletions(acts)
    if n_del > a.allow_deletes:
        for act in acts:
            if act["op"] in model.DELETING:
                print(f"REFUSED would {act['op']} {act['what']} — {act['why']}")
        print(f"REFUSED {n_del} deletions planned, limit {a.allow_deletes} — nothing applied (--allow-deletes N after review)")
        return 3
    for act in acts:
        if act["op"] == "report":
            print(f"FINDING {act['what']} — {act['why']}")
            bad += 1
            continue
        if a.dry_run:
            print(f"WOULD {act['what']} — {act['why']}")
            continue
        try:
            auth_bao.apply(bao, act)
        except auth_bao.BaoError as exc:
            print(f"ERROR {act['what']} — {exc}")
            bad += 1
            continue
        if not act.get("reassert"):
            print(f"APPLIED {act['what']} — {act['why']}")
    if a.dry_run:
        return 1 if bad else 0
    live = auth_bao.snapshot(bao)
    left = [x for x in model.plan(desired, live, secret) if x["op"] != "report"]
    for x in left:
        print(f"DRIFT {x['what']} — still differs after apply: {x['why']}")
    opened = model.hygiene(live)
    for o in opened:
        print(f"OPEN {o}")
    if bad or left or opened:
        return 1
    for line in _summary(live, raw):
        print(line)
    return 0


def main(argv: list[str]) -> int:
    a = _args(argv)
    try:
        if a.mode == "snapshot":
            print(json.dumps(auth_bao.snapshot(_client(a)), indent=1, sort_keys=True))
            return 0
        raw = _load(a)
        return check(a, raw) if a.mode == "check" else reconcile(a, raw)
    except model.DeclarationError as exc:
        print(f"REFUSED {exc}")
        return 2
    except auth_bao.BaoError as exc:
        print(f"ERROR {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
