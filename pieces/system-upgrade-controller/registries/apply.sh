#!/bin/sh
# Runs on a node as the registries Plans' upgrade container (alpine, privileged, node root at /host).
# Writes /etc/rancher/k3s/registries.yaml and restarts k3s, which is the only moment it reads it.
# Delivered as the env var RG_APPLY_SH because a Plan can mount no ConfigMap.
#
# RG_MODE decides: hold (do nothing), apply, remove. Upstream stays the fallback: this file only
# adds Harbor in front, and k3s's default endpoint stays (RUNBOOK 2026-11-05, option E is rejected).
#
# RESTART SAFE. k3s runs with KillMode=process, so containers keep running through a restart. The
# kubelet re-admits every pod; allocatable does not change here, so nobody is refused for memory.
# A node short of memory is still left alone: the eviction manager acts the moment the kubelet is back.
# Failing exits non-zero and takes the file back; the Job retries at most twice (backoff limit 2).
set -eu

ROOT="${RG_HOST_ROOT:-/host}"
NSENTER="${RG_NSENTER:-nsenter -t 1 -m -u -i -n -p --}"
MEMINFO="${RG_MEMINFO:-/proc/meminfo}"
WAIT_TRIES="${RG_WAIT_TRIES:-90}"; WAIT_SLEEP="${RG_WAIT_SLEEP:-2}"
GATE_TRIES="${RG_GATE_TRIES:-60}"; GATE_SLEEP="${RG_GATE_SLEEP:-10}"
MIN_AVAILABLE_KI="${RG_MIN_AVAILABLE_KI:-2097152}"
NODE="${SYSTEM_UPGRADE_NODE_NAME:?SUC sets the node name}"
# RG_REGISTRY is the estate's registry host (the piece fills it from the identity); the file names it
# as WLREGISTRY, written here as the host itself.
MODE="${RG_MODE:-}"; ROLE="${RG_ROLE:-}"; REGISTRY="${RG_REGISTRY:-}"
# (the trailing x keeps the file's final newline through the command substitution)
DESIRED="$(printf '%s' "${RG_REGISTRIES:-}" | sed "s|WLREGISTRY|$REGISTRY|g"; printf x)"; DESIRED="${DESIRED%x}"
FILE="$ROOT/etc/rancher/k3s/registries.yaml"
# What k3s makes of the file at its start: containerd reads this, not registries.yaml.
HOSTS="$ROOT/var/lib/rancher/k3s/agent/etc/containerd/certs.d/docker.io/hosts.toml"

log() { echo "[registries] $*"; }
die() { echo "[registries] FATAL: $*" >&2; exit 1; }

case "$ROLE" in
  agent)  SERVICE=k3s-agent ;;
  server) SERVICE=k3s ;;
  *) die "RG_ROLE must be agent or server, got [$ROLE]" ;;
esac

node_kubectl() { $NSENTER k3s kubectl --kubeconfig /var/lib/rancher/k3s/agent/kubelet.kubeconfig "$@"; }
# Only a server has this one; only the server's gate needs it.
admin_kubectl() { $NSENTER k3s kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml "$@"; }

restart() {
  log "restarting $SERVICE (containers keep running)"
  $NSENTER systemctl restart "$SERVICE"
}

wait_node() {
  i=0
  while [ "$i" -lt "$WAIT_TRIES" ]; do
    ready="$(node_kubectl get node "$NODE" -o 'jsonpath={.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)"
    [ "$ready" != True ] || return 0
    i=$((i + 1)); sleep "$WAIT_SLEEP"
  done
  echo "[registries] node not Ready (last: [${ready:-}])" >&2
  return 1
}

# The server goes second: an agent that took it and stayed up is what makes that safe.
wait_for_agents() {
  i=0
  while :; do
    missing=""
    for n in $(admin_kubectl get nodes -l '!node-role.kubernetes.io/control-plane' -o 'jsonpath={.items[*].metadata.name}'); do
      have="$(admin_kubectl get node "$n" -o 'jsonpath={.metadata.labels.plan\.upgrade\.cattle\.io/registries-agent}' 2>/dev/null || true)"
      [ -n "$have" ] || missing="$missing $n"
    done
    [ -n "$missing" ] || { log "every agent has taken it"; return 0; }
    i=$((i + 1))
    [ "$i" -lt "$GATE_TRIES" ] || die "agent(s)$missing have not taken it yet: the control plane goes second"
    log "waiting for agent(s)$missing"
    sleep "$GATE_SLEEP"
  done
}

case "$MODE" in
  hold) log "mode hold: nothing to do on $NODE"; exit 0 ;;
  remove)
    if [ -f "$FILE" ]; then
      rm -f "$FILE" "$FILE.bak"
      log "removed $FILE"
      restart
      wait_node || die "$NODE did not come back after the removal"
    else
      log "no registries.yaml on $NODE: nothing to remove"
    fi
    exit 0 ;;
  apply) ;;
  *) die "RG_MODE must be hold, apply or remove, got [$MODE]" ;;
esac

[ -n "$DESIRED" ] || die "registries.yaml is empty in the ConfigMap"
[ -n "$REGISTRY" ] && [ "$REGISTRY" != WLREGISTRY ] || die "RG_REGISTRY is not set in the ConfigMap"
TMP="$(mktemp)"
printf '%s' "$DESIRED" > "$TMP"
if [ -f "$FILE" ] && cmp -s "$TMP" "$FILE"; then
  rm -f "$TMP"
  log "registries.yaml already current on $NODE: no restart"
  exit 0
fi

[ "$ROLE" = agent ] || wait_for_agents

AVAILABLE="$(awk '/^MemAvailable:/ { print $2; exit }' "$MEMINFO")"
if [ "${AVAILABLE:-0}" -lt "$MIN_AVAILABLE_KI" ]; then
  rm -f "$TMP"
  die "MemAvailable ${AVAILABLE:-unknown}Ki is under ${MIN_AVAILABLE_KI}Ki: nothing changed. Retry on a quieter node."
fi

[ ! -f "$FILE" ] || cp "$FILE" "$FILE.bak"
cp "$TMP" "$FILE"
rm -f "$TMP"
log "wrote $FILE"

# A k3s that refuses the file fails the restart itself: that too must reach the take-back.
restart || log "the restart failed"
if wait_node && grep -qF "$REGISTRY" "$HOSTS" 2>/dev/null; then
  rm -f "$FILE.bak"
  log "applied on $NODE"
  exit 0
fi

echo "[registries] the node did not take it: taking it back" >&2
if [ -f "$FILE.bak" ]; then mv "$FILE.bak" "$FILE"; else rm -f "$FILE"; fi
restart || log "the second restart failed too: systemctl status $SERVICE on the node"
wait_node || true
exit 1
