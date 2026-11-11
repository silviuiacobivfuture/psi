#!/usr/bin/env python3
"""The rendered overlay, moved to a throwaway namespace and changed as little as possible.

  kubectl kustomize overlays/dev | kubectl create --dry-run=client -o json -f - | proof-transform.py <ns> <run> <host>

Everything the proof judges is the manifest itself: the Deployments, the policies, the
Ingresses and the Cluster are what Argo would apply. What differs, all of it here:
  - no ExternalSecrets (the harness makes the Secrets from throwaway values);
  - the namespace, and the two object-store prefixes (one per run: barman refuses a
    non-empty archive), so nothing touches n8n's real ones;
  - the host, a new name per run. Let's Encrypt issues five certificates a week for one
    exact name; seven runs against the real host used that up (2026-11-03), and the real
    deploy would have waited on it;
  - a sampler beside n8n, sharing its network namespace, which logs every remote address
    n8n opens a socket to. Nothing else in the pod could say what it contacts.
"""
import json
import sys

NS = sys.argv[1]
RUN = sys.argv[2]
HOST = sys.argv[3]
SAMPLER = r"""
while :; do
  for f in /proc/net/tcp /proc/net/udp; do
    while read -r _ _ rem st _; do
      # Everything but listeners: a call shorter than the sample is still here in TIME_WAIT.
      case "$st" in 0A|st) ;; *) echo "$rem" ;; esac
    done < "$f"
  done
  sleep 0.1
done | awk '!seen[$0]++ { print; fflush() }'
"""


def objects(text):
    decoder = json.JSONDecoder()
    pos = 0
    while pos < len(text):
        while pos < len(text) and text[pos].isspace():
            pos += 1
        if pos == len(text):
            return
        obj, pos = decoder.raw_decode(text, pos)
        if obj.get("kind") == "List":
            yield from obj["items"]
        else:
            yield obj


out = []
for obj in objects(sys.stdin.read()):
    kind = obj["kind"]
    if kind == "ExternalSecret":
        continue
    obj["metadata"]["namespace"] = NS
    ann = obj["metadata"].get("annotations", {})
    key = "traefik.ingress.kubernetes.io/router.middlewares"
    if key in ann:
        ann[key] = ann[key].replace("n8n-n8n-", f"{NS}-n8n-")
    if kind == "ConfigMap" and obj["metadata"]["name"] == "n8n-host":
        obj["data"]["N8N_HOST"] = HOST
    if kind == "Ingress":
        for rule in obj["spec"].get("rules", []):
            rule["host"] = HOST
        for tls in obj["spec"].get("tls", []):
            tls["hosts"] = [HOST]
        for name in list(ann):
            if name == "gethomepage.dev/enabled":
                ann[name] = "false"
    if kind == "Cluster":
        store = obj["spec"]["backup"]["barmanObjectStore"]
        store["destinationPath"] = store["destinationPath"].replace("cnpg/n8n-db", f"cnpg/{NS}-{RUN}")
    if kind == "CronJob" and obj["metadata"]["name"] == "n8n-db-dump":
        pod = obj["spec"]["jobTemplate"]["spec"]["template"]["spec"]
        for env in pod["containers"][0]["env"]:
            if env["name"] == "PREFIX":
                env["value"] = f"db-dumps/{NS}-{RUN}"
    if kind == "Deployment" and obj["metadata"]["name"] == "n8n":
        obj["spec"]["template"]["spec"]["containers"].append(
            {
                "name": "sampler",
                "image": "harbor.recomex.eu/mirror/docker.io/library/busybox:1.37@sha256:7a3ebe5bfd1a4a19797d20b0c0bb39d44393e9a03fd852c0865b0f540d868df0",
                "command": ["sh", "-c", SAMPLER],
                "securityContext": {
                    "allowPrivilegeEscalation": False,
                    "readOnlyRootFilesystem": True,
                    "runAsNonRoot": True,
                    "capabilities": {"drop": ["ALL"]},
                },
                "resources": {
                    "requests": {"cpu": "5m", "memory": "8Mi"},
                    "limits": {"cpu": "100m", "memory": "32Mi"},
                },
            }
        )
    out.append(obj)
json.dump({"apiVersion": "v1", "kind": "List", "items": out}, sys.stdout)
