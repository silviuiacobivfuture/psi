#!/bin/sh
# Runs on a node as the Plans' upgrade container (alpine, privileged, node root at
# /host). Writes the kubelet's memory settings as a k3s drop-in and restarts k3s.
# Delivered as the env var KM_APPLY_SH because a Plan can mount no ConfigMap.
#
# KM_MODE decides: hold (do nothing; this is how it ships), apply, remove.
#
# THE HAZARD. After a restart the kubelet re-admits every pod on the node, oldest
# first, against the NEW allocatable. Requests above it mean the newest pods are
# rejected (status Failed, reason OutOfmemory), and on these nodes the newest pods
# are the CI runners. So apply refuses before writing anything when the requests
# would not fit, and when MemAvailable is under the soft line (the eviction manager
# starts acting the moment the kubelet is back).
#
# RESTART SAFE. k3s runs with KillMode=process, so containers keep running through
# a restart. Failing here exits non-zero; the Job retries (backoff limit 2 in this
# kustomization) and SUC runs a new Job after the failed one's TTL. A refusal
# changes nothing, so a retry is harmless.
set -eu

ROOT="${KM_HOST_ROOT:-/host}"
NSENTER="${KM_NSENTER:-nsenter -t 1 -m -u -i -n -p --}"
MEMINFO="${KM_MEMINFO:-/proc/meminfo}"
WAIT_TRIES="${KM_WAIT_TRIES:-90}"; WAIT_SLEEP="${KM_WAIT_SLEEP:-2}"
GATE_TRIES="${KM_GATE_TRIES:-60}"; GATE_SLEEP="${KM_GATE_SLEEP:-10}"
NODE="${SYSTEM_UPGRADE_NODE_NAME:?SUC sets the node name}"
MODE="${KM_MODE:-}"; ROLE="${KM_ROLE:-}"
DIR="$ROOT/etc/rancher/k3s/config.yaml.d"
DROPIN="$DIR/kubelet-memory.yaml"

log() { echo "[kubelet-memory] $*"; }
die() { echo "[kubelet-memory] FATAL: $*" >&2; exit 1; }

case "$ROLE" in
  agent)  SERVICE=k3s-agent; DESIRED="${KM_DROPIN_AGENT:-}" ;;
  server) SERVICE=k3s;       DESIRED="${KM_DROPIN_SERVER:-}" ;;
  *) die "KM_ROLE must be agent or server, got [$ROLE]" ;;
esac
[ -n "$DESIRED" ] || die "the drop-in for $ROLE is empty"

# The node's own identity exists on both roles and may read its pods and itself.
node_kubectl() { $NSENTER k3s kubectl --kubeconfig /var/lib/rancher/k3s/agent/kubelet.kubeconfig "$@"; }
# Only a server has this one; only the server's gate needs it.
admin_kubectl() { $NSENTER k3s kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml "$@"; }

# arg <flag> <drop-in text> → that flag's value
arg() { printf '%s\n' "$2" | sed -n "s/^  - \"$1=\(.*\)\"\$/\1/p"; }
# to_ki <quantity> → integer KiB. Empty is zero.
to_ki() {
  printf '%s\n' "$1" | awk '
    /^$/ { print 0; exit }
    { v=$0; n=v; u=v; sub(/[A-Za-z]+$/,"",n); sub(/^[0-9.]+/,"",u)
      f = (u=="Ki")?1 : (u=="Mi")?1024 : (u=="Gi")?1048576 : (u=="Ti")?1073741824 : (u=="k")?1000/1024 : (u=="M")?1000000/1024 : (u=="G")?1000000000/1024 : (u=="m")?1/1024000 : 1/1024
      printf "%d\n", n*f + 0.5 }'
}
reserved_ki() { # reserved_ki <flag>, memory=<q>
  to_ki "$(arg "$1" "$DESIRED" | sed -n 's/^memory=//p')"
}
threshold_ki() { # threshold_ki <flag>, memory.available<q among the signals
  to_ki "$(arg "$1" "$DESIRED" | tr ',' '\n' | sed -n 's/^memory\.available<//p')"
}

# The kubelet's own sum: for a pod, the larger of (containers + sidecars) and its
# largest plain init container. Finished pods hold nothing.
pods_requested_ki() {
  # Read first, then sum: POSIX sh has no pipefail, and a failed read piped into awk
  # would be a sum of zero, which fits every allocatable.
  listing="$(node_kubectl get pods -A --field-selector "spec.nodeName=$NODE" -o \
    'jsonpath={range .items[*]}{.status.phase}{"\t"}{range .spec.containers[*]}{.resources.requests.memory}{","}{end}{"\t"}{range .spec.initContainers[*]}{.restartPolicy}{":"}{.resources.requests.memory}{","}{end}{"\n"}{end}')" || return 1
  printf '%s\n' "$listing" | awk -F'\t' '
      function ki(q, n, u) {
        if (q == "") return 0
        n = q; u = q; sub(/[A-Za-z]+$/, "", n); sub(/^[0-9.]+/, "", u)
        if (u == "Ki") return n
        if (u == "Mi") return n * 1024
        if (u == "Gi") return n * 1048576
        if (u == "k")  return n * 1000 / 1024
        if (u == "M")  return n * 1000000 / 1024
        if (u == "G")  return n * 1000000000 / 1024
        if (u == "m")  return n / 1024000
        return n / 1024
      }
      $1 == "Succeeded" || $1 == "Failed" { next }
      { s = 0; m = 0
        k = split($2, c, ","); for (i = 1; i <= k; i++) s += ki(c[i])
        k = split($3, c, ",")
        for (i = 1; i <= k; i++) { split(c[i], p, ":"); if (p[1] == "Always") s += ki(p[2]); else if (ki(p[2]) > m) m = ki(p[2]) }
        t += (s > m ? s : m) }
      END { printf "%d\n", t + 0.5 }'
}

restart() {
  log "restarting $SERVICE (containers keep running)"
  $NSENTER systemctl restart "$SERVICE"
}

# wait_node [expected allocatable KiB] → the node is Ready and reports that allocatable.
wait_node() {
  i=0
  while [ "$i" -lt "$WAIT_TRIES" ]; do
    ready="$(node_kubectl get node "$NODE" -o 'jsonpath={.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)"
    if [ "$ready" = True ]; then
      [ -n "${1:-}" ] || return 0
      have="$(to_ki "$(node_kubectl get node "$NODE" -o 'jsonpath={.status.allocatable.memory}' 2>/dev/null || true)")"
      diff=$(( have > $1 ? have - $1 : $1 - have ))
      [ "$diff" -gt 1024 ] || { log "node Ready, allocatable ${have}Ki as expected"; return 0; }
    fi
    i=$((i + 1)); sleep "$WAIT_SLEEP"
  done
  echo "[kubelet-memory] node not Ready with allocatable ${1:-any}Ki (last: ready=[${ready:-}] allocatable=[${have:-}]Ki)" >&2
  return 1
}

# The server goes second: every agent must already run these values, or it waits.
wait_for_agents() {
  want="$(arg eviction-hard "${KM_DROPIN_AGENT:-}" | tr ',' '\n' | sed -n 's/^memory\.available<//p')"
  [ -n "$want" ] || die "cannot read the agent's hard threshold"
  i=0
  while :; do
    missing=""
    for n in $(admin_kubectl get nodes -l '!node-role.kubernetes.io/control-plane' -o 'jsonpath={.items[*].metadata.name}'); do
      admin_kubectl get --raw "/api/v1/nodes/$n/proxy/configz" 2>/dev/null \
        | grep -q "\"memory.available\":\"$want\"" || missing="$missing $n"
    done
    [ -n "$missing" ] || { log "every agent runs the values"; return 0; }
    i=$((i + 1))
    [ "$i" -lt "$GATE_TRIES" ] || die "agent(s)$missing do not run the values yet — the control plane goes second"
    log "waiting for agent(s)$missing"
    sleep "$GATE_SLEEP"
  done
}

case "$MODE" in
  hold) log "mode hold: nothing to do on $NODE"; exit 0 ;;
  remove)
    if [ -f "$DROPIN" ]; then
      rm -f "$DROPIN" "$DROPIN.bak"
      log "removed $DROPIN"
      restart
      wait_node || die "$NODE did not come back after the removal"
    else
      log "no drop-in on $NODE: nothing to remove"
    fi
    exit 0 ;;
  apply) ;;
  *) die "KM_MODE must be hold, apply or remove, got [$MODE]" ;;
esac

TMP="$(mktemp)"
printf '%s' "$DESIRED" > "$TMP"
if [ -f "$DROPIN" ] && cmp -s "$TMP" "$DROPIN"; then
  rm -f "$TMP"
  log "drop-in already current on $NODE: no restart"
  exit 0
fi

[ "$ROLE" = agent ] || wait_for_agents

CAPACITY="$(to_ki "$(node_kubectl get node "$NODE" -o 'jsonpath={.status.capacity.memory}')")"
[ "$CAPACITY" -gt 0 ] || die "cannot read this node's capacity"
HARD="$(threshold_ki eviction-hard)"; SOFT="$(threshold_ki eviction-soft)"
RESERVED=$(( $(reserved_ki system-reserved) + $(reserved_ki kube-reserved) ))
[ "$HARD" -gt 0 ] && [ "$SOFT" -gt 0 ] && [ "$RESERVED" -gt 0 ] || die "cannot read the values from the drop-in"
ALLOCATABLE=$(( CAPACITY - RESERVED - HARD ))

REQUESTED="$(pods_requested_ki)" || die "cannot list this node's pods: refusing to restart blind"
[ -n "$REQUESTED" ] || die "cannot list this node's pods: refusing to restart blind"
log "capacity ${CAPACITY}Ki, new allocatable ${ALLOCATABLE}Ki, requested ${REQUESTED}Ki"
if [ "$REQUESTED" -gt "$ALLOCATABLE" ]; then
  die "requests ${REQUESTED}Ki are above the new allocatable ${ALLOCATABLE}Ki: the kubelet would refuse the newest pods at its restart. Nothing changed. Lower the requests first (RUNBOOK 2026-11-02)."
fi

AVAILABLE="$(awk '/^MemAvailable:/ { print $2; exit }' "$MEMINFO")"
if [ "${AVAILABLE:-0}" -lt "$SOFT" ]; then
  die "MemAvailable ${AVAILABLE:-unknown}Ki is under the soft line ${SOFT}Ki: the kubelet would start evicting as soon as it is back. Nothing changed. Retry on a quieter node."
fi

mkdir -p "$DIR"
[ ! -f "$DROPIN" ] || cp "$DROPIN" "$DROPIN.bak"
cp "$TMP" "$DROPIN"
rm -f "$TMP"
log "wrote $DROPIN"

# A kubelet that refuses a flag fails the restart itself: that too must reach the
# take-back below, or set -e would leave the bad file and a stopped service.
restart || log "the restart failed"
if wait_node "$ALLOCATABLE"; then
  rm -f "$DROPIN.bak"
  log "applied on $NODE"
  exit 0
fi

echo "[kubelet-memory] the node did not take the values: taking them back" >&2
if [ -f "$DROPIN.bak" ]; then mv "$DROPIN.bak" "$DROPIN"; else rm -f "$DROPIN"; fi
restart || log "the second restart failed too: systemctl status $SERVICE on the node"
wait_node || true
exit 1
