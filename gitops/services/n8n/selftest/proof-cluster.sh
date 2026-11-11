#!/usr/bin/env bash
# n8n, end to end, on the dev cluster, in namespaces that are removed afterwards. Real
# n8n, real Postgres, real Traefik, real Authentik gate, real Kyverno, real NetworkPolicy.
# Named cases in results.txt under $OUT. Nothing here lands on anything Argo owns.
#
#   KUBECONFIG=~/.kube/rmx-dev.yaml gitops/services/n8n/selftest/proof-cluster.sh [--keep|--clean]
#
# THE CASES
#   P  presence: the render admitted by Kyverno, no exclusion; every pod non-root, ready
#   A  anonymous at the edge: every path but webhooks refused; path tricks refused; nothing written
#   W  webhooks: in, Code in the runner, out with a decrypted credential; refusals with nothing written
#   X  what a workflow can do: env, files, processes, community packages, SSRF
#   N  what the pods can reach: each refused target against a control pod that reaches it
#   S  secrets: each missing key named; a missing OpenBao path loud
#   L  restart: a workflow survives, its credential still opens
#   R  restore: pg_dump through restore-n8n-db.sh, then barman from an empty server, then the wrong key
#   T  telemetry: what the running pod actually opened sockets to
#   G  the advisory watcher, against the real GitHub, from the cluster
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/rmx-dev.yaml}"
NS=n8n-proof; OTHER=n8n-proof-other; PF_PORT="${PF_PORT:-15700}"; KEEP=0; RUN="$(date +%s)"
[ "${1:-}" = "--keep" ] && KEEP=1
OUT="${OUT:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 700 "$OUT"; : >"$OUT/results.txt"
# shellcheck source=gitops/services/n8n/selftest/proof-lib.sh
. "$HERE/proof-lib.sh"

remove_objects() { # the proof's prefixes in the platform bucket, by a job in the namespace
  kubectl -n "$NS" get secret n8n-backup-s3 >/dev/null 2>&1 || return 0
  kubectl -n "$NS" delete job n8n-proof-clean --ignore-not-found >/dev/null
  kubectl -n "$NS" apply -f - >/dev/null <<EOF
apiVersion: batch/v1
kind: Job
metadata: { name: n8n-proof-clean }
spec:
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      securityContext: { runAsNonRoot: true, runAsUser: 1000, seccompProfile: { type: RuntimeDefault } }
      containers:
        - name: clean
          image: harbor.recomex.eu/mirror/docker.io/amazon/aws-cli:2.17.0@sha256:7b7edf789765c22d75e61ad6f307c06950e15357b79ea1749104641ce3a11fec
          env:
            - { name: AWS_ACCESS_KEY_ID, valueFrom: { secretKeyRef: { name: n8n-backup-s3, key: AWS_ACCESS_KEY_ID } } }
            - { name: AWS_SECRET_ACCESS_KEY, valueFrom: { secretKeyRef: { name: n8n-backup-s3, key: AWS_SECRET_ACCESS_KEY } } }
            - { name: AWS_REGION, value: fsn1 }
            - { name: AWS_S3_ADDRESSING_STYLE, value: path }
            - { name: HOME, value: /tmp }
          command: ["/bin/sh", "-c"]
          args:
            - |
              export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
              E=https://fsn1.your-objectstorage.com
              for top in cnpg db-dumps; do
                for d in \$(aws s3 ls s3://rmx-tfstate-dev/\$top/ --endpoint-url \$E | awk '/PRE n8n-proof/ {print \$2}'); do
                  aws s3 rm --recursive s3://rmx-tfstate-dev/\$top/\$d --endpoint-url \$E --only-show-errors
                done
              done
              echo cleaned
          securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } }
          resources: { requests: { cpu: 50m, memory: 64Mi }, limits: { cpu: 250m, memory: 256Mi } }
EOF
  kubectl -n "$NS" wait --for=condition=complete job/n8n-proof-clean --timeout=180s >/dev/null 2>&1 \
    || echo "WARNING: could not confirm the proof's object-store prefixes were removed" | tee -a "$OUT/results.txt"
}
finish() {
  pf_down
  rm -f "$OUT/login.json" "$OUT/jar" "$OUT/curlrc" "$OUT/rest.out"
  if [ "$KEEP" = 0 ]; then
    # The server first: it ships WAL until it stops, and would recreate what was removed.
    kubectl -n "$NS" delete cluster.postgresql.cnpg.io --all --wait=true >/dev/null 2>&1 || true
    remove_objects || true
    kubectl delete ns "$NS" "$OTHER" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  fi
}
trap finish EXIT
# Remove what an interrupted run left: the prefixes in the bucket and the namespaces.
if [ "${1:-}" = "--clean" ]; then
  kubectl get ns "$NS" >/dev/null 2>&1 || kubectl create ns "$NS" >/dev/null
  kubectl -n plunk get secret plunk-backup-s3 -o json \
    | jq --arg ns "$NS" '{apiVersion,kind,type,data,metadata:{name:"n8n-backup-s3",namespace:$ns}}' | kubectl apply -f - >/dev/null
  exit 0
fi

REAL_HOST="$(sed -n 's/^N8N_HOST=//p' "$ROOT/pieces/n8n/base/host.env")"
# A name of its own per run, under the estate wildcard: see proof-transform.py.
HOST="n8n-proof-$RUN.${REAL_HOST#*.}"
# The pins, asked of image_refs.py (a manifest may name the registry by its identity token).
IMAGE_N8N="$(python3 "$ROOT/.github/scripts/image_refs.py" --pin "$ROOT" pieces/n8n/base/n8n.yaml /n8nio/n8n)" \
  || { echo "$IMAGE_N8N" >&2; exit 2; }
IMAGE_RUNNER="$(python3 "$ROOT/.github/scripts/image_refs.py" --pin "$ROOT" pieces/n8n/base/runner.yaml /n8nio/runners)" \
  || { echo "$IMAGE_RUNNER" >&2; exit 2; }

# ── Setup ───────────────────────────────────────────────────────────────────
section "setup"
for _ in $(seq 1 120); do [[ "$(kubectl get ns "$NS" 2>&1)" == *Terminating* ]] || break; sleep 5; done
kubectl get ns "$NS" >/dev/null 2>&1 && { echo "namespace $NS already exists; refusing" >&2; exit 2; }
kubectl get ingress -A -o json | jq -e --arg h "$HOST" '[.items[]|select(any(.spec.rules[]?; .host==$h))]|length==0' >/dev/null \
  || { echo "something already serves $HOST; refusing" >&2; exit 2; }
kubectl create ns "$NS" >/dev/null; kubectl create ns "$OTHER" >/dev/null
umask 077
ENC_KEY="$(gen 64)"; printf '%s' "$(gen 32)" >"$OUT/owner-password"
HASH="$(podman run --rm -i --network none --entrypoint node "$IMAGE_N8N" -e '
  const f=require("fs"),p=require("path"),b="/usr/local/lib/node_modules/n8n/node_modules/.pnpm/",d=f.readdirSync(b).find(x=>x.startsWith("bcryptjs@"));
  process.stdout.write(require(p.join(b,d,"node_modules/bcryptjs")).hashSync(f.readFileSync(0,"utf8"),10))' <"$OUT/owner-password")"
RUNNER_TOKEN="$(gen 48)"; DB_PASS="$(gen 32)"; JWT="$(gen 64)"
jq -n --arg ns "$NS" --arg k "$ENC_KEY" --arg j "$JWT" --arg r "$RUNNER_TOKEN" --arg h "$HASH" --arg d "$DB_PASS" '
 {apiVersion:"v1",kind:"List",items:[
  {apiVersion:"v1",kind:"Secret",metadata:{name:"n8n-app",namespace:$ns},stringData:{N8N_ENCRYPTION_KEY:$k,N8N_USER_MANAGEMENT_JWT_SECRET:$j,N8N_RUNNERS_AUTH_TOKEN:$r,N8N_INSTANCE_OWNER_PASSWORD_HASH:$h,DB_POSTGRESDB_USER:"n8n",DB_POSTGRESDB_PASSWORD:$d}},
  {apiVersion:"v1",kind:"Secret",metadata:{name:"n8n-runner",namespace:$ns},stringData:{N8N_RUNNERS_AUTH_TOKEN:$r}},
  {apiVersion:"v1",kind:"Secret",type:"kubernetes.io/basic-auth",metadata:{name:"n8n-db-app",namespace:$ns},stringData:{username:"n8n",password:$d}}]}' | kubectl apply -f - >/dev/null
# The platform's object-storage credential, as the ExternalSecret would sync it. By pipe, never printed.
kubectl -n plunk get secret plunk-backup-s3 -o json \
  | jq --arg ns "$NS" '{apiVersion,kind,type,data,metadata:{name:"n8n-backup-s3",namespace:$ns}}' | kubectl apply -f - >/dev/null
kubectl kustomize "$ROOT/pieces/n8n" >"$OUT/render.yaml"
kubectl create --dry-run=client --validate=false -o json -f "$OUT/render.yaml" | python3 -I "$HERE/proof-transform.py" "$NS" "$RUN" "$HOST" >"$OUT/proof.json"
set +e; APPLY="$(kubectl apply --server-side -f "$OUT/proof.json" 2>&1)"; RC=$?; set -e
check P1 "the render is admitted, Kyverno Enforce included, with no exclusion" "rc=$RC" '^rc=0$'
[ "$RC" = 0 ] || { echo "$APPLY" | tail -20; exit 1; }
kubectl -n "$NS" wait cluster.postgresql.cnpg.io/n8n-db --for=condition=Ready --timeout=480s >/dev/null
wait_n8n
READY="$(kubectl -n "$NS" get pods -o json | jq -r '[.items[]|select(.metadata.labels["app.kubernetes.io/name"]=="n8n")|.status.containerStatuses[]|.ready]|all')"
check P2 "n8n and its runner are ready on a read-only root" "$READY" '^true$'
UIDS="$(kubectl -n "$NS" exec deploy/n8n -c n8n -- id -u) $(kubectl -n "$NS" exec deploy/n8n-runner -c runner -- id -u)"
check P3 "both run as uid 1000" "$UIDS" '^1000 1000$'
refute P4 "neither holds a service account token" "$(kubectl -n "$NS" exec deploy/n8n -c n8n -- ls /var/run/secrets 2>&1; kubectl -n "$NS" exec deploy/n8n-runner -c runner -- ls /var/run/secrets 2>&1)" 'kubernetes.io'
RUNNER_ENV="$(kubectl -n "$NS" exec deploy/n8n-runner -c runner -- node -e 'console.log(Object.keys(process.env).join(" "))')"
refute P5 "the runner's environment holds no encryption key and no database password" "$RUNNER_ENV" 'N8N_ENCRYPTION_KEY|DB_POSTGRESDB|JWT_SECRET'
sleep 20
LOG="$(kubectl -n "$NS" logs deploy/n8n -c n8n --tail=200)"
check P6 "the runner registered with the broker in its own pod, through the policies" "$LOG" 'Registered runner'
for _ in $(seq 1 60); do [ "$(kubectl -n "$NS" get certificate n8n-tls -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)" = True ] && break; sleep 5; done
check P7 "the certificate for $HOST was issued" "$(kubectl -n "$NS" get certificate n8n-tls -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')" '^True$'

# ── Anonymous at the edge, before anything exists ───────────────────────────
section "anonymous at the edge"
pf_up
BEFORE="$(counts)"
GATED='^302 https://auth\.'
for p in / /home/workflows /signin /setup /rest/settings /rest/users /rest/credentials /rest/workflows /rest/login /form/x /form-test/x /form-waiting/x /webhook-test/x /webhooks /webhook /webhook-waiting /healthz /metrics /mcp/x /assets/x.js /rest/telemetry/proxy/v1/track /rest/ph/batch /scim/v2/Users; do
  check "A1$p" "GET $p is sent to sign in" "$(edge "$p")" "$GATED"
done
check A2 "POST /rest/login is sent to sign in, the password form never reached" "$(edge /rest/login -H 'content-type: application/json' -d '{"emailOrLdapLoginId":"ops@recomex.eu","password":"x"}')" "$GATED"
check A3 "POST /rest/invitations anonymous is sent to sign in" "$(edge /rest/invitations -H 'content-type: application/json' -d '[{"email":"x@example.com"}]')" "$GATED"
check A4 "/api/v1/users answers 403 at the edge" "$(edge /api/v1/users)" '^403'
check A5 "/api refuses without a slash too" "$(edge /api)" '^403'
check A6 "an API key does not open /api from outside" "$(edge /api/v1/workflows -H 'X-N8N-API-KEY: x')" '^403'
for t in '/webhook/../rest/settings' '/webhook/..%2frest/settings' '/webhook/%2e%2e/rest/settings' '/webhook//../rest/settings' '/webhook/x/../../rest/users' '/webhook-waiting/../rest/settings' '//rest/settings' '/./rest/settings' '/WEBHOOK/../rest/settings'; do
  refute "A7$t" "path trick $t does not reach /rest unauthenticated" "$(curl -sS -m 20 --path-as-is -o "$OUT/trick" -w '%{http_code}' "https://$HOST$t"; echo; grep -o '"settings"\|userManagement\|publicApi' "$OUT/trick" 2>/dev/null)" '^200$|userManagement|publicApi'
done
check A8 "a forged X-authentik-username changes nothing" "$(edge / -H 'X-authentik-username: akadmin' -H 'X-authentik-groups: app-n8n-admin')" "$GATED"
check A9 "a forged X-Forwarded-Host changes nothing" "$(edge /rest/settings -H 'X-Forwarded-Host: localhost' -H 'X-Forwarded-Uri: /webhook/x')" "$GATED"
A11="$(curl -sS -m 30 -L --max-redirs 6 -o "$OUT/signin.html" -w '%{http_code} %{url_effective}' "https://$HOST/")"
check A11 "an anonymous visit really arrives at Authentik's sign-in, following every redirect" "$A11" '^200 https://auth\.'
check A12 "and is not n8n's page" "$(grep -c 'n8n.io - Workflow' "$OUT/signin.html" || true)" '^0$'
check A10 "nothing was written by any of it" "$(counts)" "^$(sed 's/|/\\|/g' <<<"$BEFORE")\$"

# ── Webhooks, Code, credentials ────────────────────────────────────────────
section "webhooks"
SECRET_VALUE="proof-$(gen 24)"
jq -n --arg v "$SECRET_VALUE" '{name:"proof-header",type:"httpHeaderAuth",data:{name:"X-Proof",value:$v}}' >"$OUT/cred.json"
CRED_ANSWER="$(rest POST /credentials "$OUT/cred.json")"
CRED_ID="$(sed 's/^[0-9]* //' <<<"$CRED_ANSWER" | jq -r '.data.id // empty')"
check W1 "a credential is stored" "$CRED_ID" '.'
refute W2 "the database holds it sealed, never in the clear" "$(sql "select data from credentials_entity where id='$CRED_ID'")" "$SECRET_VALUE"
wf() { # wf <file> <name> <path> <extra nodes json> <connections json>
  jq -n --arg name "$2" --arg path "$3" --argjson nodes "$4" --argjson conn "$5" '{name:$name,active:false,settings:{},
    nodes:([{id:"w",name:"In",type:"n8n-nodes-base.webhook",typeVersion:2,position:[0,0],webhookId:$path,parameters:{httpMethod:"POST",path:$path,responseMode:"lastNode",options:{}}}]+$nodes),
    connections:$conn}' >"$1"
}
edge_to() { jq -n --arg a "$1" '{In:{main:[[{node:$a,type:"main",index:0}]]}}'; }
code_node() { jq -n --arg c "$1" '[{id:"c",name:"Code",type:"n8n-nodes-base.code",typeVersion:2,position:[200,0],parameters:{language:"javaScript",mode:"runOnceForAllItems",jsCode:$c}}]'; }
wf "$OUT/w-in.json" proof-in proof-in "$(code_node 'return [{json:{fromCode:true,echo:$input.first().json.body}}]')" "$(edge_to Code)"
WF_IN="$(new_workflow "$OUT/w-in.json")"
check W3 "a webhook workflow publishes" "$(cat "$OUT/activate.answer")" '^200 '
for _ in 1 2 3 4 5 6; do H="$(hook proof-in '{"marker":"hello"}')"; grep -q '^200$' <<<"$(tail -1 <<<"$H")" && break; sleep 5; done
check W4 "webhook in, through the public edge with no sign-in, 200" "$(tail -1 <<<"$H")" '^200$'
check W5 "the body came back through a Code node in the runner" "$H" '"fromCode":true.*hello|hello.*"fromCode":true'
check W6 "one execution recorded" "$(sql "select count(*) from execution_entity where \"workflowId\"='$WF_IN'")" '^[1-9]'
OUT_URL="https://postman-echo.com/post"
jq -n --arg u "$OUT_URL" --arg id "$CRED_ID" '[{id:"h",name:"Out",type:"n8n-nodes-base.httpRequest",typeVersion:4.2,position:[200,0],credentials:{httpHeaderAuth:{id:$id,name:"proof-header"}},parameters:{method:"POST",url:$u,authentication:"genericCredentialType",genericAuthType:"httpHeaderAuth",options:{}}}]' >"$OUT/n-out.json"
wf "$OUT/w-out.json" proof-out proof-out "$(cat "$OUT/n-out.json")" "$(edge_to Out)"
WF_OUT="$(new_workflow "$OUT/w-out.json")"
sleep 3
check W7 "webhook out: n8n reaches the internet and decrypts its credential to do it" "$(hook proof-out)" "$SECRET_VALUE"
BEFORE="$(counts)"
check W8 "an unknown webhook answers 404" "$(edge /webhook/nothing-here -X POST)" '^404'
check W9 "a known webhook on the wrong method answers 404" "$(edge /webhook/proof-in)" '^404'
head -c 17825792 /dev/zero >"$OUT/big.bin"
check W10 "a 17 MiB body is refused at the edge, 413" "$(edge /webhook/proof-in -H 'content-type: application/octet-stream' --data-binary @"$OUT/big.bin")" '^413'
rm -f "$OUT/big.bin"
check W11 "none of those three wrote anything" "$(counts)" "^$(sed 's/|/\\|/g' <<<"$BEFORE")\$"
: >"$OUT/flood"; seq 1 300 | xargs -P 40 -I{} curl -sS -m 10 -o /dev/null -w '%{http_code}\n' -X POST "https://$HOST/webhook/nothing-here" >>"$OUT/flood" || true
kubectl -n "$NS" get pod -l app.kubernetes.io/component=main >/dev/null
check W12 "a flood is cut at the edge: 429 among the answers" "$(sort "$OUT/flood" | uniq -c | tr '\n' ' ')" ' 429'
sleep 5

# ── What a workflow can do ─────────────────────────────────────────────────
section "what a workflow can do"
JS='const r={};try{r.envVar=$env.N8N_ENCRYPTION_KEY===undefined?"undefined":"READ"}catch(e){r.envVar="refused"}
try{r.procKeys=Object.keys(process.env).join(",")}catch(e){r.procKeys="refused"}
for(const m of ["child_process","fs","net","http","os"]){try{require(m);r[m]="LOADED"}catch(e){r[m]="refused"}}
try{r.fetchType=typeof fetch}catch(e){r.fetchType="refused"}
return [{json:r}]'
wf "$OUT/w-code.json" proof-code proof-code "$(code_node "$JS")" "$(edge_to Code)"
new_workflow "$OUT/w-code.json" >/dev/null; sleep 3
H="$(hook proof-code)"; check X1 "the Code node ran" "$H" 'procKeys'
refute X2 "\$env yields no secret in a Code node" "$H" '"envVar":"READ"'
refute X3 "process.env in a Code node holds no secret" "$H" 'ENCRYPTION|DB_POSTGRESDB|RUNNERS_AUTH|JWT_SECRET'
refute X4 "child_process, fs, net, http and os do not load in a Code node" "$H" 'LOADED'
jq -n '[{id:"s",name:"Set",type:"n8n-nodes-base.set",typeVersion:3.4,position:[200,0],parameters:{assignments:{assignments:[{id:"a",name:"got",type:"string",value:"={{ $env.N8N_ENCRYPTION_KEY }}"}]},options:{}}}]' >"$OUT/n-set.json"
wf "$OUT/w-env.json" proof-env proof-env "$(cat "$OUT/n-set.json")" "$(edge_to Set)"
new_workflow "$OUT/w-env.json" >/dev/null; sleep 3
H="$(hook proof-env)"; refute X5 "an expression cannot read the encryption key" "$H" "$ENC_KEY"
MARK="/tmp/proof-marker-$$"
for n in executeCommand:command readWriteFile:fileName ssh:command git:operation; do
  T="${n%%:*}"; jq -n --arg t "n8n-nodes-base.$T" --arg k "${n##*:}" --arg m "touch $MARK" '[{id:"e",name:"N",type:$t,typeVersion:1,position:[200,0],parameters:{($k):$m}}]' >"$OUT/n-x.json"
  wf "$OUT/w-x.json" "proof-$T" "proof-$T" "$(cat "$OUT/n-x.json")" "$(edge_to N)"
  new_workflow "$OUT/w-x.json" >"$OUT/x.id" || true; sleep 2
  H="$(hook "proof-$T")"
  refute "X6.$T" "$T is not available: it never runs" "$(tail -1 <<<"$H")" '^200$'
done
refute X7 "nothing it was told to do happened" "$(kubectl -n "$NS" exec deploy/n8n -c n8n -- ls /tmp 2>&1)" 'proof-marker'
BEFORE_P="$(sql 'select count(*) from installed_packages')"
echo '{"name":"n8n-nodes-proof"}' >"$OUT/pkg.json"
check X8 "a community package install is refused" "$(rest POST /community-packages "$OUT/pkg.json" | cut -c1-120)" '^(403|404|400)'
check X9 "and nothing was installed" "$(sql 'select count(*) from installed_packages')" "^$BEFORE_P\$"
for u in http://openbao.openbao.svc:8200/v1/sys/health https://kubernetes.default.svc/version http://169.254.169.254/hetzner/v1/metadata http://plunk-db-rw.plunk.svc:5432/; do
  S="$(sed 's#[^a-z0-9]#-#g' <<<"$u" | cut -c1-30)"
  jq -n --arg u "$u" '[{id:"h",name:"Out",type:"n8n-nodes-base.httpRequest",typeVersion:4.2,position:[200,0],onError:"continueRegularOutput",parameters:{url:$u,options:{timeout:6000}}}]' >"$OUT/n-s.json"
  wf "$OUT/w-s.json" "proof-s$S" "proof-s$S" "$(cat "$OUT/n-s.json")" "$(edge_to Out)"
  new_workflow "$OUT/w-s.json" >/dev/null; sleep 2
  H="$(hook "proof-s$S")"
  refute "X10.$S" "an HTTP Request node to $u gets nothing back" "$H" 'initialized|sealed|gitVersion|"instance-id"|"hostname"'
done

# ── What the pods can reach ────────────────────────────────────────────────
section "what the pods can reach"
ctl() { # ctl <ns> <name> <labels json>: a pod with no secret, running the runner image's node
  jq -n --arg ns "$1" --arg n "$2" --arg i "$IMAGE_RUNNER" --argjson l "$3" '{apiVersion:"v1",kind:"Pod",metadata:{name:$n,namespace:$ns,labels:$l},spec:{automountServiceAccountToken:false,securityContext:{runAsNonRoot:true,runAsUser:1000,seccompProfile:{type:"RuntimeDefault"}},
    containers:[{name:"c",image:$i,command:["sleep","3600"],securityContext:{allowPrivilegeEscalation:false,capabilities:{drop:["ALL"]}},resources:{requests:{cpu:"10m",memory:"32Mi"},limits:{cpu:"200m",memory:"128Mi"}}}]}}' | kubectl apply -f - >/dev/null
  kubectl -n "$1" wait "pod/$2" --for=condition=Ready --timeout=180s >/dev/null
}
ctl "$NS" control '{"role":"control"}'
ctl "$NS" api-client '{"n8n.recomex.eu/api-client":"true"}'
ctl "$OTHER" impostor '{"n8n.recomex.eu/api-client":"true","app.kubernetes.io/name":"n8n","app.kubernetes.io/component":"runner"}'
WALL=(auth.recomex.eu:443 openbao.openbao.svc:8200 plunk-db-rw.plunk.svc:5432 kubernetes.default.svc:443 10.0.1.10:6443 10.0.1.1:10250 10.0.1.10:10250 65.108.81.61:443 65.108.81.61:6443 65.108.92.182:443 169.254.169.254:80 100.100.100.100:53 authentik-server.authentik.svc:80)
CONTROL="$(probe pod/control "$NS" c "${WALL[@]}")"; echo "$CONTROL" >"$OUT/probe-control.txt"
MAIN="$(probe deploy/n8n "$NS" n8n "${WALL[@]}")"; echo "$MAIN" >"$OUT/probe-main.txt"
RUN_P="$(probe deploy/n8n-runner "$NS" runner "${WALL[@]}")"; echo "$RUN_P" >"$OUT/probe-runner.txt"
for t in "${WALL[@]}"; do
  C="$(grep -F "$t " <<<"$CONTROL" | awk '{print $2}')"
  check "N1.$t" "n8n cannot reach $t (control: $C)" "$(grep -F "$t " <<<"$MAIN")" ' (BLOCKED|ECONNREFUSED)$'
  check "N2.$t" "the runner cannot reach $t (control: $C)" "$(grep -F "$t " <<<"$RUN_P")" ' (BLOCKED|ECONNREFUSED)$'
  # Answers nobody from a pod either way, so its refusal above says nothing by itself.
  case "$t" in 100.100*|65.108.*) ;; *) check "N3.$t" "the control pod does reach $t, so the refusal above is the policy's" "$C" 'CONNECTED' ;; esac
done
# FROM EACH NODE. A pod on the node owning the public address reaches it through that
# node's svclb pod, not the address (PLATFORM-12), so one node's answer says nothing about
# the other's. Pods carrying the two identities the policies select, pinned to each node;
# the main's never turns Ready, so it never joins the Service.
for node in $(kubectl get nodes -o name | cut -d/ -f2); do
  for role in main runner; do
    P="wall-$role-${node##*-}"
    jq -n --arg ns "$NS" --arg p "$P" --arg n "$node" --arg r "$role" --arg i "$IMAGE_RUNNER" '{apiVersion:"v1",kind:"Pod",metadata:{name:$p,namespace:$ns,labels:{"app.kubernetes.io/name":"n8n","app.kubernetes.io/component":$r}},spec:{nodeName:$n,automountServiceAccountToken:false,securityContext:{runAsNonRoot:true,runAsUser:1000,seccompProfile:{type:"RuntimeDefault"}},
      containers:[{name:"c",image:$i,command:["sleep","900"],readinessProbe:{exec:{command:["false"]},periodSeconds:30},securityContext:{allowPrivilegeEscalation:false,capabilities:{drop:["ALL"]}},resources:{requests:{cpu:"10m",memory:"32Mi"},limits:{cpu:"200m",memory:"128Mi"}}}]}}' | kubectl apply -f - >/dev/null
    kubectl -n "$NS" wait "pod/$P" --for=jsonpath='{.status.phase}'=Running --timeout=300s >/dev/null
    A="$(probe "pod/$P" "$NS" c "${WALL[@]}")"; echo "$A" >"$OUT/probe-$P.txt"
    refute "N17.$role.$node" "as the $role, on $node, nothing of ours connects" "$A" 'CONNECTED'
    kubectl -n "$NS" delete pod "$P" --now >/dev/null
  done
done
A="$(probe deploy/n8n "$NS" n8n n8n-db-rw:5432 1.1.1.1:443 postman-echo.com:443)"
check N4 "n8n reaches its own database" "$A" 'n8n-db-rw:5432 CONNECTED'
check N5 "n8n reaches the internet" "$A" '1\.1\.1\.1:443 CONNECTED'
check N6 "n8n resolves public names" "$A" 'postman-echo.com:443 CONNECTED'
A="$(probe deploy/n8n-runner "$NS" runner n8n-broker:5679 n8n-db-rw:5432 n8n:5678 1.1.1.1:443)"
check N7 "the runner reaches the broker" "$A" 'n8n-broker:5679 CONNECTED'
check N8 "the runner cannot reach the database" "$A" 'n8n-db-rw:5432 (BLOCKED|ECONNREFUSED)'
check N9 "the runner cannot reach n8n's own port" "$A" 'n8n:5678 (BLOCKED|ECONNREFUSED)'
check N10 "the runner cannot reach the internet" "$A" '1\.1\.1\.1:443 (BLOCKED|ECONNREFUSED)'
A="$(probe pod/control "$NS" c n8n:5678 n8n-broker:5679)"
check N11 "a pod in the namespace without the label cannot reach n8n" "$A" 'n8n:5678 (BLOCKED|ECONNREFUSED)'
check N12 "nor the broker" "$A" 'n8n-broker:5679 (BLOCKED|ECONNREFUSED)'
check N13 "a labelled pod in the namespace reaches n8n, the seam for apps/n8n-sso" "$(probe pod/api-client "$NS" c n8n:5678)" 'CONNECTED'
check N14 "the same labels in another namespace reach nothing" "$(probe pod/impostor "$OTHER" c n8n.$NS.svc:5678 n8n-broker.$NS.svc:5679)" "^[^ ]+ (BLOCKED|ECONNREFUSED)
[^ ]+ (BLOCKED|ECONNREFUSED)"
check N16 "IPv6 goes nowhere from n8n" "$(probe deploy/n8n "$NS" n8n 2606:4700:4700::1111:443)" '(BLOCKED|ECONNREFUSED|EAI|EADDR)'
check N15 "the broker refuses a wrong token" "$(kubectl -n "$NS" exec deploy/n8n-runner -c runner -- node -e 'fetch("http://n8n-broker:5679/runners/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:"wrong"})}).then(r=>console.log(r.status))' 2>&1)" '^(401|403)$'

# ── Secrets fail loud ──────────────────────────────────────────────────────
section "secrets fail loud"
INIT="$(jq -c '.items[]|select(.kind=="Deployment" and .metadata.name=="n8n")|.spec.template.spec.initContainers[0]' "$OUT/proof.json")"
for key in N8N_ENCRYPTION_KEY N8N_USER_MANAGEMENT_JWT_SECRET N8N_RUNNERS_AUTH_TOKEN N8N_INSTANCE_OWNER_PASSWORD_HASH DB_POSTGRESDB_USER DB_POSTGRESDB_PASSWORD; do
  kubectl -n "$NS" get secret n8n-app -o json | jq --arg k "$key" 'del(.data[$k]) | {apiVersion,kind,data,metadata:{name:"n8n-broken",namespace:.metadata.namespace}}' | kubectl apply -f - >/dev/null
  P="assert-$(tr '[:upper:]_' '[:lower:]-' <<<"$key")"
  jq -n --arg ns "$NS" --arg p "$P" --argjson i "$INIT" '{apiVersion:"v1",kind:"Pod",metadata:{name:$p,namespace:$ns},spec:{restartPolicy:"Never",automountServiceAccountToken:false,securityContext:{runAsNonRoot:true,runAsUser:1000,seccompProfile:{type:"RuntimeDefault"}},containers:[($i|.envFrom=[{secretRef:{name:"n8n-broken"}},{configMapRef:{name:"n8n-host"}}])]}}' | kubectl apply -f - >/dev/null
  for _ in $(seq 1 30); do PH="$(kubectl -n "$NS" get pod "$P" -o jsonpath='{.status.phase}')"; case "$PH" in Failed|Succeeded) break ;; esac; sleep 2; done
  check "S1.$key" "without $key the pod exits, naming it" "$PH $(kubectl -n "$NS" logs "$P" 2>&1)" "^Failed MISSING REQUIRED SECRET: $key\$"
  kubectl -n "$NS" delete pod "$P" --wait=false >/dev/null
done
kubectl -n "$NS" delete secret n8n-broken >/dev/null
kubectl create --dry-run=client --validate=false -o json -f "$OUT/render.yaml" | jq -c --arg ns "$NS" 'select(.kind=="ExternalSecret" and .metadata.name=="n8n-app") | .metadata.namespace=$ns | .metadata.name="n8n-es-probe" | .spec.target.name="n8n-es-probe" | .spec.target.creationPolicy="Owner"' | kubectl apply -f - >/dev/null
sleep 15
check S2 "an OpenBao path with nothing in it is loud: SecretSyncedError" "$(kubectl -n "$NS" get externalsecret n8n-es-probe -o jsonpath='{.status.conditions[0].reason}')" 'SecretSyncedError'
refute S3 "and no Secret was made" "$(kubectl -n "$NS" get secret n8n-es-probe 2>&1)" '^NAME'
kubectl -n "$NS" delete externalsecret n8n-es-probe >/dev/null

# ── A restart ──────────────────────────────────────────────────────────────
section "a restart"
kubectl -n "$NS" delete pod -l app.kubernetes.io/component=main --wait=true >/dev/null
sleep 5; wait_n8n; sleep 15
check L1 "a published workflow answers after a restart" "$(hook proof-in '{"marker":"after-restart"}')" 'after-restart'
check L2 "its credential still decrypts" "$(hook proof-out)" "$SECRET_VALUE"
pf_up

# ── Restore ────────────────────────────────────────────────────────────────
section "restore"
kubectl -n "$NS" create job --from=cronjob/n8n-db-dump proof-dump >/dev/null
kubectl -n "$NS" wait --for=condition=complete job/proof-dump --timeout=300s >/dev/null || true
check R1 "the real dump job uploaded" "$(kubectl -n "$NS" logs job/proof-dump -c upload 2>&1)" 'DB dump uploaded: s3://rmx-tfstate-dev/db-dumps/n8n-proof-'
set +e
RESTORE_OUT="$(printf 'RESTORE\n' | N8N_RESTORE_NS="$NS" N8N_RESTORE_DUMP_PREFIX="db-dumps/$NS-$RUN" bash "$ROOT/infrastructure/hetzner/scripts/restore-n8n-db.sh" dev --from-dump 2>&1)"; RC=$?
set -e
check R2 "restore-n8n-db.sh --from-dump loads a new database" "rc=$RC $(grep -o 'restore OK -> n8n_restore_[0-9]*' <<<"$RESTORE_OUT")" '^rc=0 restore OK'
NEWDB="$(grep -o 'restore OK -> n8n_restore_[0-9]*' <<<"$RESTORE_OUT" | awk '{print $NF}')"
check R3 "the live database was not touched by it" "$(sql "select count(*) from credentials_entity where id='$CRED_ID'")" '^1$'
check R4 "the new database holds the sealed credential" "$(sql "select count(*) from credentials_entity where id='$CRED_ID'" "$NEWDB")" '^1$'
pf_down
kubectl -n "$NS" scale deploy/n8n --replicas=0 >/dev/null; kubectl -n "$NS" wait pod -l app.kubernetes.io/component=main --for=delete --timeout=120s >/dev/null 2>&1 || true
P="$(primary)"
kubectl -n "$NS" exec "$P" -c postgres -- psql -U postgres -qc 'ALTER DATABASE n8n RENAME TO n8n_old;' >/dev/null
kubectl -n "$NS" exec "$P" -c postgres -- psql -U postgres -qc "ALTER DATABASE $NEWDB RENAME TO n8n;" >/dev/null
kubectl -n "$NS" scale deploy/n8n --replicas=1 >/dev/null; wait_n8n; sleep 15
check R5 "adopted as printed, the dump's copy runs the webhook and opens the credential" "$(hook proof-out)" "$SECRET_VALUE"
kubectl -n "$NS" exec "$P" -c postgres -- psql -U postgres -qc 'DROP DATABASE n8n_old;' >/dev/null
# From an empty server: the barman archive alone. The worst day short of losing OpenBao.
for _ in $(seq 1 60); do [ "$(kubectl -n "$NS" get backup -o json | jq '[.items[]|select(.status.phase=="completed")]|length')" -ge 1 ] && break; sleep 5; done
check R6 "the first base backup completed in the object store" "$(kubectl -n "$NS" get backup -o json | jq -r '[.items[].status.phase]|join(",")')" 'completed'
kubectl -n "$NS" exec "$P" -c postgres -- psql -U postgres -d n8n -qc 'select pg_switch_wal();' >/dev/null; sleep 20
kubectl -n "$NS" scale deploy/n8n --replicas=0 >/dev/null; kubectl -n "$NS" wait pod -l app.kubernetes.io/component=main --for=delete --timeout=120s >/dev/null 2>&1 || true
kubectl -n "$NS" delete scheduledbackup n8n-db-base --ignore-not-found >/dev/null
kubectl -n "$NS" delete cluster.postgresql.cnpg.io n8n-db --wait=true >/dev/null
kubectl -n "$NS" delete pvc -l cnpg.io/cluster=n8n-db --ignore-not-found >/dev/null
kubectl -n "$NS" apply -f - >/dev/null <<EOF
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata: { name: n8n-db }
spec:
  instances: 1
  smartShutdownTimeout: 10
  imageName: ghcr.io/cloudnative-pg/postgresql:17.7-system-trixie
  storage: { size: 5Gi, storageClass: local-path }
  resources: { requests: { cpu: 50m, memory: 192Mi }, limits: { cpu: 500m, memory: 512Mi } }
  bootstrap: { recovery: { source: origin } }
  externalClusters:
    - name: origin
      barmanObjectStore:
        destinationPath: s3://rmx-tfstate-dev/cnpg/$NS-$RUN
        endpointURL: https://fsn1.your-objectstorage.com
        serverName: n8n-db
        s3Credentials:
          accessKeyId: { name: n8n-backup-s3, key: AWS_ACCESS_KEY_ID }
          secretAccessKey: { name: n8n-backup-s3, key: AWS_SECRET_ACCESS_KEY }
        wal: { maxParallel: 2 }
EOF
sleep 20
kubectl -n "$NS" wait cluster.postgresql.cnpg.io/n8n-db --for=condition=Ready --timeout=600s >/dev/null || true
check R7 "barman restores n8n-db to a new empty server" "$(sql "select count(*) from credentials_entity where id='$CRED_ID'")" '^1$'
kubectl -n "$NS" scale deploy/n8n --replicas=1 >/dev/null; wait_n8n; sleep 15
check R8 "workflow and credential work on the restored server" "$(hook proof-out)" "$SECRET_VALUE"
# The key is the other half: the same database under another key opens nothing.
kubectl -n "$NS" get secret n8n-app -o json | jq --arg k "$(printf '%s' "$(gen 64)" | base64 -w0)" '.data.N8N_ENCRYPTION_KEY=$k' | kubectl apply -f - >/dev/null
SEALED="$(sql "select md5(data) from credentials_entity where id='$CRED_ID'")"
kubectl -n "$NS" delete pod -l app.kubernetes.io/component=main --wait=true >/dev/null; sleep 5
# n8n refuses to come up at all under another key ("Deployment key 'signing.hmac' cannot
# be read with this instance encryption key", 2026-11-03), and that is a good answer: this waits a bounded time and records which it was, rather than assuming.
kubectl -n "$NS" rollout status deploy/n8n --timeout=150s >/dev/null 2>&1 || true
kubectl -n "$NS" logs deploy/n8n -c n8n --tail=400 2>&1 | grep -iE 'decrypt|encryption|mismatch|error' | sort -u >"$OUT/wrong-key.txt" || true
echo "  under the wrong key n8n says: $(cut -c1-160 "$OUT/wrong-key.txt" | tail -3 | tr '\n' ' ')" | tee -a "$OUT/results.txt"
H="$(hook proof-out)"
refute R9 "under the wrong key the credential's value never comes out" "$H" "$SECRET_VALUE"
refute R9b "and the webhook does not succeed" "$(tail -1 <<<"$H")" '^2[0-9][0-9]$'
check R9c "and the sealed row is exactly as it was" "$(sql "select md5(data) from credentials_entity where id='$CRED_ID'")" "^$SEALED\$"
kubectl -n "$NS" get secret n8n-app -o json | jq --arg k "$(printf '%s' "$ENC_KEY" | base64 -w0)" '.data.N8N_ENCRYPTION_KEY=$k' | kubectl apply -f - >/dev/null
kubectl -n "$NS" delete pod -l app.kubernetes.io/component=main --wait=true >/dev/null; sleep 5; wait_n8n; sleep 15
check R10 "the right key opens it again: nothing was harmed" "$(hook proof-out)" "$SECRET_VALUE"

# ── What it actually contacted ─────────────────────────────────────────────
section "what the running pod contacted"
BEFORE_S="$(kubectl -n "$NS" logs deploy/n8n -c sampler 2>/dev/null | wc -l)"
for _ in 1 2 3 4 5; do hook proof-out >/dev/null; sleep 2; done
kubectl -n "$NS" logs deploy/n8n -c sampler >"$OUT/sampler-1.txt" 2>/dev/null
check T1 "the sampler sees what n8n opens: the positive control" "$(python3 -I "$HERE/proof-sampler.py" <"$OUT/sampler-1.txt")" 'public:'
QUIET="${N8N_QUIET_SECONDS:-1500}"
kubectl -n "$NS" delete pod -l app.kubernetes.io/component=main --wait=true >/dev/null; sleep 5; wait_n8n
echo "  quiet window: ${QUIET}s, with no traffic from this harness" | tee -a "$OUT/results.txt"
sleep "$QUIET"
kubectl -n "$NS" logs deploy/n8n -c sampler >"$OUT/sampler-2.txt" 2>/dev/null
python3 -I "$HERE/proof-sampler.py" <"$OUT/sampler-2.txt" | tee "$OUT/sampler-2-decoded.txt"
refute T2 "in a quiet ${QUIET}s from a fresh start, n8n opened no socket to any public address" "$(cat "$OUT/sampler-2-decoded.txt")" 'public:'
ENVNOW="$(kubectl -n "$NS" exec deploy/n8n -c n8n -- node -e 'console.log(process.env.N8N_DIAGNOSTICS_ENABLED,process.env.N8N_VERSION_NOTIFICATIONS_ENABLED,process.env.N8N_TEMPLATES_ENABLED)')"
check T3 "the running process has them off" "$ENVNOW" '^false false false$'
pf_up
S="$(rest GET /settings)"; check T4 "n8n itself reports telemetry off" "$(sed 's/^[0-9]* //' <<<"$S" | jq -c '.data|[.telemetry.enabled,.versionNotifications.enabled,.templates.enabled,.posthog.enabled,.aiCredits.enabled]')" '^\[false,false,false,false,false\]$'
check T5 "the telemetry passthrough routes do not exist" "$(A1="$(rest POST /telemetry/proxy/v1/track "$OUT/activate.json")"; A2="$(rest POST /ph/batch "$OUT/activate.json")"; echo "${A1:0:3} ${A2:0:3}")" '^404 404$'

section "the advisory watcher"
kubectl -n "$NS" create job --from=cronjob/n8n-advisory-watch proof-watch >/dev/null
for _ in $(seq 1 40); do C="$(kubectl -n "$NS" get job proof-watch -o jsonpath='{.status.conditions[*].type}')"; case " $C " in *" Complete "*|*" Failed "*) break ;; esac; sleep 3; done
check G1 "the real watcher, from the cluster, reads GitHub and finds this version in no advisory" "$(kubectl -n "$NS" logs job/proof-watch 2>&1)" 'n8n 2\.46\.[0-9]+: inside none of [0-9]+'
kubectl -n "$NS" logs job/proof-watch 2>&1 | tee -a "$OUT/results.txt" | cut -c1-200

echo "PROOF: $PASSED passed, $FAILED failed. Date $(date -u +%FT%TZ)" | tee -a "$OUT/results.txt"
[ "$FAILED" -eq 0 ]
