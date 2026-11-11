"""OpenBao over HTTP: the client, the live snapshot, and applying a plan.

The client is the only thing that touches the network; tests replace it with an
in-memory fake that has the same four methods (read/list/write/delete).
Tokens travel in a header, never in a URL, a log line or an argv.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Protocol

JWT_TYPES = ("oidc", "jwt")
ROLE_TYPES = ("oidc", "jwt", "kubernetes")


class BaoError(RuntimeError):
    def __init__(self, method: str, path: str, status: int, detail: str) -> None:
        super().__init__(f"{method} {path} -> HTTP {status}: {detail}")
        self.status = status


class Bao(Protocol):
    def read(self, path: str) -> dict[str, Any] | None: ...
    def list(self, path: str) -> list[str]: ...
    def write(self, path: str, body: dict[str, Any]) -> dict[str, Any]: ...
    def delete(self, path: str) -> None: ...


class HttpBao:
    def __init__(self, addr: str, token: str = "", timeout: float = 15.0) -> None:
        self.addr = addr.rstrip("/")
        self.token = token
        self.timeout = timeout

    def _call(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any] | None:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(f"{self.addr}/v1/{path}", data=data, method=method)
        if self.token:
            req.add_header("X-Vault-Token", self.token)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            try:
                detail = "; ".join(json.loads(exc.read() or b"{}").get("errors") or [])
            except ValueError:
                detail = ""
            raise BaoError(method, path, exc.code, detail or exc.reason) from None
        return json.loads(raw) if raw else {}

    def read(self, path: str) -> dict[str, Any] | None:
        out = self._call("GET", path)
        return None if out is None else out.get("data")

    def list(self, path: str) -> list[str]:
        out = self._call("LIST", path)
        return [] if out is None else list((out.get("data") or {}).get("keys") or [])

    def write(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        return self._call("POST", path, body) or {}

    def delete(self, path: str) -> None:
        self._call("DELETE", path)


def login_kubernetes(bao: HttpBao, mount: str, role: str, jwt: str) -> None:
    out = bao.write(f"auth/{mount}/login", {"role": role, "jwt": jwt})
    token = (out.get("auth") or {}).get("client_token")
    if not token:
        raise BaoError("POST", f"auth/{mount}/login", 0, "no client_token in the answer")
    bao.token = token


def revoke_self(bao: HttpBao) -> None:
    try:
        bao.write("auth/token/revoke-self", {})
    except BaoError:
        pass  # the token expires on its own within its TTL; nothing to recover


def _strip(path: str) -> str:
    return path.rstrip("/")


def snapshot(bao: Bao) -> dict[str, Any]:
    """The live store as a STATE (auth_model). Reads only."""
    auth = bao.read("sys/auth") or {}
    mounts = {_strip(k): {"type": v["type"], "accessor": v.get("accessor", "")}
              for k, v in auth.items() if isinstance(v, dict) and "type" in v}
    by_accessor = {v["accessor"]: k for k, v in mounts.items()}
    policies = {}
    for name in bao.list("sys/policies/acl"):
        if name == "root":
            continue
        policies[name] = (bao.read(f"sys/policies/acl/{name}") or {}).get("policy", "")
    configs = {m: (bao.read(f"auth/{m}/config") or {}) for m, v in mounts.items() if v["type"] in JWT_TYPES}
    roles = {}
    for m, v in mounts.items():
        if v["type"] not in ROLE_TYPES:
            continue
        roles[m] = {_strip(n): bao.read(f"auth/{m}/role/{_strip(n)}") or {} for n in bao.list(f"auth/{m}/role")}
    groups: dict[str, dict[str, Any]] = {}
    by_gid: dict[str, str] = {}
    for name in bao.list("identity/group/name"):
        g = bao.read(f"identity/group/name/{name}") or {}
        alias = g.get("alias") or {}
        groups[name] = {"type": g.get("type", ""), "policies": g.get("policies") or [],
                        "mount": by_accessor.get(alias.get("mount_accessor", "")), "id": g.get("id", "")}
        by_gid[g.get("id", "")] = name
    aliases = []
    for aid in bao.list("identity/group-alias/id"):
        a = bao.read(f"identity/group-alias/id/{aid}") or {}
        aliases.append({"id": aid, "name": a.get("name", ""),
                        "mount": by_accessor.get(a.get("mount_accessor", ""), a.get("mount_accessor", "")),
                        "group": by_gid.get(a.get("canonical_id", ""))})
    entities = {}
    for eid in bao.list("identity/entity/id"):
        e = bao.read(f"identity/entity/id/{eid}") or {}
        if e.get("policies"):
            entities[eid] = {"name": e.get("name", ""), "policies": e["policies"]}
    return {"mounts": mounts, "policies": policies, "configs": configs, "roles": roles,
            "token_roles": [_strip(n) for n in bao.list("auth/token/roles")],
            "groups": groups, "aliases": aliases, "entities": entities}


def apply(bao: Bao, act: dict[str, Any]) -> None:
    """One plan action. Raises BaoError; the caller reports and carries on."""
    op = act["op"]
    if op == "report":
        return
    if op == "enable_mount":
        bao.write(f"sys/auth/{act['mount']}", {"type": act["type"]})
    elif op == "write_policy":
        bao.write(f"sys/policies/acl/{act['name']}", {"policy": act["text"]})
    elif op == "write_config":
        bao.write(f"auth/{act['mount']}/config", act["body"])
    elif op == "write_role":
        bao.write(f"auth/{act['mount']}/role/{act['name']}", act["body"])
    elif op == "write_group":
        bao.write(f"identity/group/name/{act['name']}", {"type": act["type"], "policies": act["policies"]})
    elif op == "write_alias":
        accessor = ((bao.read("sys/auth") or {}).get(act["mount"] + "/") or {}).get("accessor")
        gid = (bao.read(f"identity/group/name/{act['group']}") or {}).get("id")
        if not accessor or not gid:
            raise BaoError("POST", "identity/group-alias", 0, f"no accessor for {act['mount']}/ or no group {act['group']}")
        bao.write("identity/group-alias", {"name": act["name"], "mount_accessor": accessor, "canonical_id": gid})
    elif op == "delete_alias":
        bao.delete(f"identity/group-alias/id/{act['id']}")
    elif op == "delete_group":
        bao.delete(f"identity/group/name/{act['name']}")
    elif op == "delete_role":
        bao.delete(f"auth/{act['mount']}/role/{act['name']}")
    elif op == "delete_token_role":
        bao.delete(f"auth/token/roles/{act['name']}")
    elif op == "clear_entity_policies":
        bao.write(f"identity/entity/id/{act['id']}", {"policies": []})
    elif op == "delete_policy":
        bao.delete(f"sys/policies/acl/{act['name']}")
    else:
        raise ValueError(f"unknown op {op}")
