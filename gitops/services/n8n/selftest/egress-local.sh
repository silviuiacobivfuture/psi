#!/usr/bin/env bash
# What n8n contacts, measured on the wire: packets, not settings.
#
#   gitops/services/n8n/selftest/egress-local.sh control  [seconds]   # upstream's defaults
#   gitops/services/n8n/selftest/egress-local.sh hardened [seconds]   # the rendered env, no hostAliases
#
# Runs on a workstation under podman, in one pod: postgres, n8n, the runner and a
# packet capture that shares their network namespace. Every DNS question and every
# connection to an address outside the pod is recorded.
#
#   control   the failing control. It must SEE n8n's servers, or the capture proves
#             nothing about the hardened run. Exit 1 when it sees none.
#   hardened  the env the Deployment renders to, with the hostAliases block NOT applied,
#             so the settings alone are judged. Exit 1 on any name or address leaving.
#
# BROWSER_READY_FILE: leaves the editor's URL there for browser-egress.mjs.
# EGRESS_ENV_DROP=<regex of names>: the hardened env with those settings removed, the
# browser proof's control (N8N_DIAGNOSTICS_[A-Z_]+ turns the editor's telemetry back on).
# Secrets are generated here, go into a
# 0600 file, and are never on a command line. Output goes to $OUT (default a new tempdir).
set -euo pipefail

MODE="${1:?control|hardened}"; SECS="${2:-180}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
RENDER_PY=(python3 -I "$HERE/lib-render.py")
OUT="${OUT:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 700 "$OUT"
POD="n8n-egress-$MODE-$$"
PORT="${N8N_LOCAL_PORT:-15678}"
CAPTURE_IMAGE=docker.io/nicolaka/netshoot:v0.14

cleanup() { touch "$OUT/stop-capture"; sleep 3; podman pod rm -f "$POD" >/dev/null 2>&1 || true; }
trap cleanup EXIT
rm -f "$OUT/stop-capture"

kubectl kustomize "$ROOT/pieces/n8n" >"$OUT/render.yaml"
kubectl create --dry-run=client -o json -f "$OUT/render.yaml" --validate=false >"$OUT/render.json" 2>"$OUT/render.err" \
  || { echo "render to json failed: $(cat "$OUT/render.err")" >&2; exit 2; }
N8N_IMAGE="$("${RENDER_PY[@]}" image "$OUT/render.json" n8n n8n)"
RUNNER_IMAGE="$("${RENDER_PY[@]}" image "$OUT/render.json" n8n-runner runner)"

gen() { openssl rand -hex 20; }
RUNNER_TOKEN="$(gen)"; DB_PASS="$(gen)"

podman pod create --name "$POD" -p "127.0.0.1:$PORT:5678" >/dev/null
# The capture starts first, so the first packet of the first process is seen.
podman run -d --pod "$POD" --name "$POD-cap" --cap-add NET_RAW --cap-add NET_ADMIN -v "$OUT:/out:Z" \
  "$CAPTURE_IMAGE" sh -c 'tcpdump -i any -n -U -w /out/capture.pcap "not (host 127.0.0.1 or host ::1)" & p=$!
    while [ ! -e /out/stop-capture ]; do sleep 1; done; kill -INT "$p"; wait "$p"' >/dev/null
sleep 2

umask 077
{
  echo "POSTGRES_USER=n8n"; echo "POSTGRES_PASSWORD=$DB_PASS"; echo "POSTGRES_DB=n8n"
} >"$OUT/pg.env"
podman run -d --pod "$POD" --name "$POD-db" --env-file "$OUT/pg.env" docker.io/library/postgres:17-alpine >/dev/null
for _ in $(seq 1 60); do podman exec "$POD-db" pg_isready -U n8n -d n8n >/dev/null 2>&1 && break; sleep 1; done

HASH_PW="$(gen)"
printf '%s' "$HASH_PW" >"$OUT/owner-password"
HASH="$(printf '%s' "$HASH_PW" | podman run --rm -i --network none --entrypoint node "$N8N_IMAGE" -e '
    const fs=require("fs"),path=require("path"),base="/usr/local/lib/node_modules/n8n/node_modules/.pnpm/";
    const dir=fs.readdirSync(base).find(d=>d.startsWith("bcryptjs@"));
    const b=require(path.join(base,dir,"node_modules/bcryptjs"));
    process.stdout.write(b.hashSync(fs.readFileSync(0,"utf8"),10));')"
if [ "$MODE" = hardened ]; then
  # The Deployment's own env, with only what a loopback harness must differ in.
  "${RENDER_PY[@]}" env "$OUT/render.json" n8n n8n \
    | grep -v -E "^(WEBHOOK_URL|N8N_EDITOR_BASE_URL|N8N_PROTOCOL|DB_POSTGRESDB_HOST|N8N_PROXY_HOPS|N8N_SSRF_PROTECTION_ENABLED${EGRESS_ENV_DROP:+|$EGRESS_ENV_DROP})=" >"$OUT/n8n.env"
  {
    echo "N8N_HOST=localhost"; echo "N8N_PROTOCOL=http"; echo "N8N_SECURE_COOKIE=false"
    echo "WEBHOOK_URL=http://localhost:$PORT/"; echo "N8N_EDITOR_BASE_URL=http://localhost:$PORT/"
    echo "DB_POSTGRESDB_HOST=localhost"; echo "DB_POSTGRESDB_USER=n8n"; echo "DB_POSTGRESDB_PASSWORD=$DB_PASS"
    echo "N8N_ENCRYPTION_KEY=$(gen)"; echo "N8N_USER_MANAGEMENT_JWT_SECRET=$(gen)"
    echo "N8N_RUNNERS_AUTH_TOKEN=$RUNNER_TOKEN"; echo "N8N_INSTANCE_OWNER_PASSWORD_HASH=$HASH"
  } >>"$OUT/n8n.env"
else
  # Upstream's defaults: what it needs to start, and an owner so a browser can sign in.
  { echo "N8N_HOST=localhost"; echo "N8N_SECURE_COOKIE=false"
    echo "N8N_INSTANCE_OWNER_MANAGED_BY_ENV=true"; echo "N8N_INSTANCE_OWNER_EMAIL=ops@recomex.eu"
    echo "N8N_INSTANCE_OWNER_PASSWORD_HASH=$HASH"; } >"$OUT/n8n.env"
fi

# The same read-only filesystem as the Deployment, in the hardened run: that it starts
# like this is part of what is being proven.
if [ "$MODE" = hardened ]; then
  podman run -d --pod "$POD" --name "$POD-n8n" --env-file "$OUT/n8n.env" --read-only --cap-drop ALL \
    --tmpfs /tmp --tmpfs /home/node/.n8n:rw,mode=0777 --tmpfs /home/node/.cache:rw,mode=0777 "$N8N_IMAGE" >/dev/null
  { echo "N8N_RUNNERS_AUTH_TOKEN=$RUNNER_TOKEN"; echo "N8N_RUNNERS_TASK_BROKER_URI=http://localhost:5679"
    echo "N8N_RUNNERS_MAX_CONCURRENCY=2"; echo "N8N_RUNNERS_LAUNCHER_HEALTH_CHECK_PORT=5680"; } >"$OUT/runner.env"
  podman run -d --pod "$POD" --name "$POD-runner" --read-only --cap-drop ALL --tmpfs /tmp \
    --env-file "$OUT/runner.env" "$RUNNER_IMAGE" javascript >/dev/null
else
  podman run -d --pod "$POD" --name "$POD-n8n" --env-file "$OUT/n8n.env" "$N8N_IMAGE" >/dev/null
fi

# /healthz answers during the migrations; /rest/settings only once n8n has really started.
for _ in $(seq 1 180); do
  curl -fsS -m 2 "http://127.0.0.1:$PORT/rest/settings" >/dev/null 2>&1 && break; sleep 1
done
curl -fsS -m 2 "http://127.0.0.1:$PORT/rest/settings" >/dev/null || { podman logs --tail 40 "$POD-n8n" >&2; echo "n8n did not start" >&2; exit 2; }
echo "n8n up on 127.0.0.1:$PORT; capturing for ${SECS}s (mode $MODE)"
if [ "$MODE" = hardened ]; then
  curl -fsS -m 5 "http://127.0.0.1:$PORT/rest/settings" >"$OUT/settings.json" || true
fi
if [ -n "${BROWSER_READY_FILE:-}" ]; then printf 'http://127.0.0.1:%s\n' "$PORT" >"$BROWSER_READY_FILE"; fi
sleep "$SECS"
podman logs "$POD-n8n" >"$OUT/n8n.log" 2>&1 || true
[ "$MODE" = hardened ] && { podman logs "$POD-runner" >"$OUT/runner.log" 2>&1 || true; }
# The capture stops itself on this file: from outside, AppArmor refuses tcpdump's signal
# (measured 2026-11-03: `podman stop` and `kill -9` both denied, and the pod could not go).
touch "$OUT/stop-capture"
for _ in $(seq 1 30); do [ "$(podman inspect "$POD-cap" --format '{{.State.Running}}')" = false ] && break; sleep 1; done

podman run --rm -v "$OUT:/out:Z" "$CAPTURE_IMAGE" tshark -r /out/capture.pcap -Y 'dns.flags.response == 0' -T fields -e dns.qry.name 2>/dev/null \
  | sort | uniq -c | sort -rn >"$OUT/dns-names.txt" || true
podman run --rm -v "$OUT:/out:Z" "$CAPTURE_IMAGE" tshark -r /out/capture.pcap -Y 'tcp.flags.syn == 1 && tcp.flags.ack == 0 && tcp.dstport != 5678' -T fields -e ip.dst -e tcp.dstport 2>/dev/null \
  | sort | uniq -c | sort -rn >"$OUT/connections.txt" || true
podman run --rm -v "$OUT:/out:Z" "$CAPTURE_IMAGE" tshark -r /out/capture.pcap -T fields -e frame.number 2>/dev/null | wc -l >"$OUT/packets.txt" || true

echo "── packets captured: $(cat "$OUT/packets.txt")"
echo "── DNS questions:"; cat "$OUT/dns-names.txt"
echo "── connections opened:"; cat "$OUT/connections.txt"
N_DNS="$(wc -l <"$OUT/dns-names.txt")"; N_CONN="$(wc -l <"$OUT/connections.txt")"
if [ "$MODE" = control ]; then
  if grep -q 'n8n\.' "$OUT/dns-names.txt"; then echo "PASS control: the capture sees n8n's servers under upstream's defaults"; exit 0; fi
  echo "FAIL control: nothing of n8n's seen, so the capture proves nothing"; exit 1
fi
if [ "$N_DNS" -eq 0 ] && [ "$N_CONN" -eq 0 ]; then echo "PASS hardened: no name resolved and no connection opened in ${SECS}s"; exit 0; fi
echo "FAIL hardened: something left, listed above"; exit 1
