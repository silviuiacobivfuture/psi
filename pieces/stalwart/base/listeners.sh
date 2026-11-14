#!/bin/bash
# The configuration plan's last step: every listener the plan declares answers on the server.
#
# Stalwart v1 binds a listener only when it starts. The plan's ReloadSettings action applies the
# new settings but opens no new port (measured on RMX, 2026-11-13: after the first plan, 25, 465
# and 993 answered and 587 did not, until the server was started again). So this reads the
# listeners from the rendered plan (/work/plan.ndjson, NetworkListener `bind` entries), dials
# each on the running server's pod, and when any is closed it restarts the server ONCE (deletes
# its pod: the Deployment makes a new one, Argo's desired state is untouched) and dials again.
# Still closed after that → exit 1, naming the ports, and the Job fails by name.
#
# Needs: bash (for /dev/tcp), kubectl, the namespace in $NS, the ServiceAccount stalwart-config.
# LISTENERS_WAIT_S (default 120) bounds how long a restarted server may take to answer.
set -euo pipefail
: "${NS:?NS (the namespace) is not set}"
PLAN="${PLAN_FILE:-/work/plan.ndjson}"
WAIT_S="${LISTENERS_WAIT_S:-120}"
SEL="app.kubernetes.io/name=stalwart"

[ -s "$PLAN" ] || { echo "MISSING REQUIRED INPUT: $PLAN" >&2; exit 1; }
# Every "[addr]:<port>" a NetworkListener binds, once each, in order.
ports="$({ grep '"object":"NetworkListener"' "$PLAN" || true; } | grep -o '"\[[^]]*\]:[0-9]\{1,5\}"' \
  | sed 's/.*:\([0-9]*\)"$/\1/' | awk '!seen[$0]++' | tr '\n' ' ' | sed 's/ $//' || true)"
[ -n "$ports" ] || { echo "listeners: the plan declares no NetworkListener — nothing to check" >&2; exit 1; }

ready() { kubectl -n "$NS" rollout status deploy/stalwart --timeout="${WAIT_S}s" >/dev/null; }
pod_ip() {
  kubectl -n "$NS" get pods -l "$SEL" --field-selector=status.phase=Running \
    -o jsonpath='{range .items[*]}{.status.podIP}{"\n"}{end}' | awk 'NR == 1'
}
# closed -> the declared ports the running server does not answer on ("" when all answer).
closed() {
  local ip c="" p
  ip="$(pod_ip)"
  [ -n "$ip" ] || { echo "$ports"; return; }
  for p in $ports; do
    timeout 3 bash -c "exec 3<>/dev/tcp/$ip/$p" 2>/dev/null || c="$c $p"
  done
  echo "${c# }"
}

ready
c="$(closed)"
if [ -z "$c" ]; then echo "listeners: every declared port answers ($ports)"; exit 0; fi

echo "listeners: declared but not answering: $c — the server binds a listener only at start; restarting it once"
kubectl -n "$NS" delete pod -l "$SEL" --wait=true >/dev/null
ready
end=$(( $(date +%s) + WAIT_S ))
while :; do
  c="$(closed)"
  if [ -z "$c" ]; then echo "listeners: every declared port answers after the restart ($ports)"; exit 0; fi
  [ "$(date +%s)" -lt "$end" ] || break
  sleep 5
done
echo "LISTENERS NOT ANSWERING after a restart: $c (declared: $ports)" >&2
exit 1
