# shellcheck shell=bash
# Helpers of proof-cluster.sh: the case ledger, the REST client, the network probe.

PASSED=0; FAILED=0
check() { # check <id> <what> <actual> <expected, a grep -E pattern>
  if grep -qE -- "$4" <<<"$3"; then PASSED=$((PASSED + 1)); echo "  ok   $1 $2" | tee -a "$OUT/results.txt"
  else FAILED=$((FAILED + 1)); echo "  FAIL $1 $2 — got: $(cut -c1-300 <<<"$3")" | tee -a "$OUT/results.txt"; fi
}
refute() { # refute <id> <what> <actual> <must-not-match>
  if grep -qE -- "$4" <<<"$3"; then FAILED=$((FAILED + 1)); echo "  FAIL $1 $2 — got: $(cut -c1-300 <<<"$3")" | tee -a "$OUT/results.txt"
  else PASSED=$((PASSED + 1)); echo "  ok   $1 $2" | tee -a "$OUT/results.txt"; fi
}
section() { echo "── $1" | tee -a "$OUT/results.txt"; }

gen() { local n="${1:-40}" h; h="$(openssl rand -hex "$n")"; printf '%s' "${h:0:$n}"; }

sql() { kubectl -n "$NS" exec "$(primary)" -c postgres -- psql -U postgres -d "${2:-n8n}" -Atc "$1" 2>/dev/null; }
primary() { kubectl -n "$NS" get pod -l cnpg.io/cluster=n8n-db,cnpg.io/instanceRole=primary -o jsonpath='{.items[0].metadata.name}'; }
counts() { sql 'select (select count(*) from "user"), (select count(*) from credentials_entity), (select count(*) from workflow_entity), (select count(*) from execution_entity), (select count(*) from installed_packages)'; }

wait_n8n() {
  kubectl -n "$NS" rollout status deploy/n8n --timeout=420s >/dev/null
  kubectl -n "$NS" rollout status deploy/n8n-runner --timeout=240s >/dev/null
}

# The REST API, through a port-forward: the API server and the kubelet, not the edge.
PF_PID=""
pf_up() {
  pf_down
  kubectl -n "$NS" port-forward deploy/n8n "$PF_PORT:5678" >/dev/null 2>&1 &
  PF_PID=$!
  for _ in $(seq 1 60); do curl -fsS -m 2 "http://127.0.0.1:$PF_PORT/rest/settings" >/dev/null 2>&1 && break; sleep 2; done
  jq -n --rawfile p "$OUT/owner-password" '{emailOrLdapLoginId:"ops@recomex.eu",password:($p|rtrimstr("\n"))}' >"$OUT/login.json"
  curl -sS -m 20 -o /dev/null -c "$OUT/jar" -H 'content-type: application/json' --data @"$OUT/login.json" "http://127.0.0.1:$PF_PORT/rest/login"
  # A Secure cookie over a loopback port-forward: handed over by name.
  COOKIE="n8n-auth=$(awk '$6=="n8n-auth"{print $7}' "$OUT/jar")"
  printf 'cookie = "%s"\n' "$COOKIE" >"$OUT/curlrc"
}
pf_down() { if [ -n "$PF_PID" ]; then kill "$PF_PID" 2>/dev/null || true; wait "$PF_PID" 2>/dev/null || true; PF_PID=""; fi; }
rest() { # rest <METHOD> <path> [json file]: prints "<code> <body>"
  local args=(-sS -m 60 -K "$OUT/curlrc" -o "$OUT/rest.out" -w '%{http_code}' -X "$1" "http://127.0.0.1:$PF_PORT/rest$2")
  [ -n "${3:-}" ] && args+=(-H 'content-type: application/json' --data @"$3")
  local code; code="$(curl "${args[@]}" || echo 000)"
  printf '%s %s' "$code" "$(cat "$OUT/rest.out" 2>/dev/null)"
}
# edge <path> [curl args]: the public door, anonymous. Prints the code and any Location host.
edge() {
  local path="$1"; shift
  curl -sS -m 30 --path-as-is -o /dev/null -w '%{http_code} %{redirect_url}' "$@" "https://$HOST$path" || echo "000"
}
hook() { # hook <name> [json body]: POST to a published webhook through the edge.
  curl -sS -m 60 -w '\n%{http_code}' -H 'content-type: application/json' -d "${2:-{\}}" "https://$HOST/webhook/$1" || echo "000"
}

# new_workflow <file>: creates and publishes it, prints the id.
new_workflow() {
  local answer id version
  answer="$(rest POST /workflows "$1")"
  id="$(sed 's/^[0-9]* //' <<<"$answer" | jq -r '.data.id // empty')"
  version="$(sed 's/^[0-9]* //' <<<"$answer" | jq -r '.data.versionId // empty')"
  [ -n "$id" ] || { echo "workflow not created: $(cut -c1-300 <<<"$answer")" >&2; return 1; }
  jq -n --arg v "$version" '{versionId:$v}' >"$OUT/activate.json"
  rest POST "/workflows/$id/activate" "$OUT/activate.json" >"$OUT/activate.answer"
  echo "$id"
}

# Connects, in the pod's own network namespace, and says how each attempt ended. The
# policy engine rejects some of these and drops others, so a refusal reads ECONNREFUSED or
# BLOCKED: what proves it is the policy's is the control pod CONNECTing to the same target.
PROBE_JS='
const net=require("net");
const one=(t)=>new Promise(r=>{const i=t.lastIndexOf(":");const s=net.connect({host:t.slice(0,i),port:+t.slice(i+1),timeout:5000});
 const end=(w)=>{s.destroy();r(`${t} ${w}`)};s.on("connect",()=>end("CONNECTED"));s.on("timeout",()=>end("BLOCKED"));
 s.on("error",e=>end(["ETIMEDOUT","EHOSTUNREACH","ENETUNREACH","EACCES","EPERM"].includes(e.code)?"BLOCKED":e.code))});
Promise.all(process.argv.slice(1).map(one)).then(a=>{console.log(a.join("\n"))});'
probe() { # probe <pod selector or pod/name> <namespace> <container> <targets...>
  local who="$1" ns="$2" c="$3"; shift 3
  kubectl -n "$ns" exec "$who" -c "$c" -- node -e "$PROBE_JS" "$@" 2>&1
}
