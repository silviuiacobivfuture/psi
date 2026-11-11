#!/usr/bin/env bash
# OFFLINE end-to-end proof of the test-reports service. Run it before shipping any
# change to base/app/*.py or to .github/scripts/test-report-ingest.mjs.
#
#   ./gitops/services/test-reports/selftest/run.sh
#
# It exercises the REAL path, with no mocks and no cluster:
#   selftest/make-report.mjs   -> a synthetic Vitest JSON in the exact shape
#                                 apps/rmx-brs/test-report.json has
#   .github/scripts/test-report-ingest.mjs -> the REAL area resolution, using the
#                                 REAL shared AREAS list in test-areas.mjs
#   base/app/app.py            -> the REAL server, on a scratch DATA_DIR
#   -> the REAL rendered HTML, asserted line by line.
#
# Five runs are ingested (green, green, regression, regression, worse) so the
# history-derived features — "failing since N verificări", per-area movement and
# the trend bars — are exercised with real stored data rather than a fixture.
#
# Requires: python3, node, curl. No network, no pip, no npm install.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
APPDIR="$HERE/../../../../pieces/test-reports/base/app"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
DATA="$SCRATCH/data"
mkdir -p "$DATA"

export PORT=18080 DATA_DIR="$DATA" INGEST_TOKEN="offline-test-token" PUBLIC_URL="https://tests.lumen.example" PYTHONUNBUFFERED=1 PYTHONPATH="$APPDIR"
python3 "$APPDIR/app.py" >"$SCRATCH/server.log" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true; rm -rf "$SCRATCH"' EXIT
for _ in $(seq 1 40); do curl -sf http://127.0.0.1:18080/healthz >/dev/null && break; sleep 0.2; done

export REPORT_INGEST_URL=http://127.0.0.1:18080 REPORT_INGEST_TOKEN=offline-test-token
# The run links point at the estate's repository, from its identity (never typed here).
# shellcheck source=infrastructure/hetzner/scripts/lib-estate-git.sh
. "$ROOT/infrastructure/hetzner/scripts/lib-estate-git.sh"
estate_git_load || exit 1
export GITHUB_SERVER_URL="https://$GIT_HOST" GITHUB_REPOSITORY="$GIT_SLUG"
export GITHUB_WORKFLOW=rmx-brs-ci GITHUB_REF_NAME=dev

send() { # <variant> <sha> <runid> [app]
  local app="${4:-rmx-brs}"
  node "$HERE/make-report.mjs" "$SCRATCH/report.json" "$1" "$app" >/dev/null
  GITHUB_SHA="$2" GITHUB_RUN_ID="$3" \
    node "$ROOT/.github/scripts/test-report-ingest.mjs" "$SCRATCH/report.json" "$app"
}

echo "--- ingesting 5 runs (history for trend + failing-since) ---"
send green      aaaaaaaa1111111111111111 3201; sleep 1.1
send green      bbbbbbbb2222222222222222 3202; sleep 1.1
send regression cccccccc3333333333333333 3203; sleep 1.1
send regression dddddddd4444444444444444 3204; sleep 1.1
send worse      eeeeeeee5555555555555555 3205

# A SECOND APP, with rmx-sign-shaped file paths. Phase 4 made the business-area
# mapping per-app because the three suites collide on identical path fragments
# (`lib/__tests__/` exists in all of them), and a harness that only ever ingests
# rmx-brs would never catch a regression in that resolution. ONE run on purpose:
# _trend_block needs two points to render, so a single run keeps the bar-count
# assertion below about rmx-brs alone.
echo "--- ingesting a second app (per-app area mapping) ---"
send green ffffffff6666666666666666 3206 rmx-sign

echo "--- auth + validation negatives ---"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -d '{}' http://127.0.0.1:18080/ingest/rmx-brs)
[ "$code" = 401 ] || { echo "FAIL: no token should be 401, got $code"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'X-Report-Token: offline-test-token' \
        -d 'not json' http://127.0.0.1:18080/ingest/rmx-brs)
[ "$code" = 400 ] || { echo "FAIL: bad JSON should be 400, got $code"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'X-Report-Token: offline-test-token' \
        -d '{"schema":"nope"}' http://127.0.0.1:18080/ingest/rmx-brs)
[ "$code" = 400 ] || { echo "FAIL: bad schema should be 400, got $code"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'X-Report-Token: offline-test-token' \
        -d '{"schema":"test-report/v1","totals":{},"areas":[]}' \
        'http://127.0.0.1:18080/ingest/../../etc')
[ "$code" = 404 ] || [ "$code" = 400 ] || { echo "FAIL: traversal should be rejected, got $code"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:18080/run/rmx-brs/..%2f..%2fetc%2fpasswd')
[ "$code" = 404 ] || { echo "FAIL: run traversal should 404, got $code"; exit 1; }
# Encoded slashes reach OUR validator untouched (curl does not normalise %2f).
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'X-Report-Token: offline-test-token' \
        -d '{"schema":"test-report/v1","totals":{},"areas":[]}' \
        'http://127.0.0.1:18080/ingest/..%2f..%2fetc')
[ "$code" = 400 ] || { echo "FAIL: encoded traversal in app name should 400, got $code"; exit 1; }
echo "  negatives OK (401 / 400 / 400 / rejected / 404)"

echo "--- fetching pages ---"
curl -sf http://127.0.0.1:18080/ -o "$SCRATCH/index.html"
curl -sf http://127.0.0.1:18080/healthz -o "$SCRATCH/health.json"
# The pre-rendered weekly #tests notification body. Fetching it here is what proves
# the CronJob (base/weekly-digest.yaml) has nothing to compute: it GETs exactly this
# and POSTs it verbatim.
curl -sf http://127.0.0.1:18080/digest -o "$SCRATCH/digest.json"
# The LATEST run — the "Detalii tehnice" link on a broken area, which is what a
# reader actually clicks. (The first /run/ link on the page is the OLDEST trend bar.)
RUN_ID=$(python3 -c "
import re
html=open('$SCRATCH/index.html',encoding='utf-8').read()
print(re.search(r'/run/(rmx-brs/[0-9A-Za-z_-]+)\">Detalii tehnice',html).group(1))")
curl -sf "http://127.0.0.1:18080/run/$RUN_ID" -o "$SCRATCH/run.html"
echo "  run page: /run/$RUN_ID"

echo "--- assertions ---"
python3 - "$SCRATCH" <<'PY'
import json, sys, pathlib
scratch = pathlib.Path(sys.argv[1])
index = (scratch / "index.html").read_text(encoding="utf-8")
run = (scratch / "run.html").read_text(encoding="utf-8")
health = json.loads((scratch / "health.json").read_text(encoding="utf-8"))
digest = json.loads((scratch / "digest.json").read_text(encoding="utf-8"))
fails = []

def must(cond, what):
    if not cond:
        fails.append(what)
    print(("  ok   " if cond else "  FAIL ") + what)

# --- business areas come from the SHARED AREAS list, resolved by CI ------------
for area in ("Documente ONRC — generare", "Pro bono (Modul 4)",
             "Dosare — ciclu de viață", "Registrul canonic — aplicare stare",
             "Drepturi de acces"):
    must(area in index, "area rendered: %s" % area)

# --- the rule text is the business rule, verbatim ------------------------------
must("refuză a DOUA conversie a aceleiași proforme" in index, "passing rule text verbatim")
must("trecerea în „depus” cere cel puțin un document" in index, "failing rule text verbatim")

# --- verdict line --------------------------------------------------------------
must("nu se mai respectă" in index, "verdict names broken rules")
must("2 din 12 reguli de business nu se mai respectă" in index,
     "verdict counts: 2 of 12 failing")

# --- failing-since, derived from stored history --------------------------------
must("nu se mai respectă de 3 verificări" in index,
     "failing-since: rbac rule broken for 3 runs")
must("nu se mai respectă de 1 verificare" in index,
     "failing-since: orders rule broken for 1 run (singular)")

# --- per-area movement ---------------------------------------------------------
must("față de verificarea anterioară" in index, "per-area movement badge present")

# --- trend ---------------------------------------------------------------------
must(index.count('class="bar') == 5, "trend has one bar per stored run (5)")
must('class="bar bad"' in index, "trend marks red runs")
must("Evoluție" in index, "trend section titled")

# --- self-explaining prose -----------------------------------------------------
must("regulă de business" in index, "page explains what a business rule is")
must("Roșu (✘) înseamnă că nu se mai respectă" in index, "page explains the red mark")

# --- no stack traces on the index; they ARE on the run page --------------------
must("AssertionError" not in index, "index carries NO stack trace")
must("<pre>" not in index, "index has no raw technical block")
must("AssertionError: expected 500 to be 250" in run, "run page HAS the failure detail")
must("tests/orders/lifecycle.test.ts" in run, "run page names the source file")

# --- escaping ------------------------------------------------------------------
must("&lt;script&gt;alert(1)&lt;/script&gt;" in index, "rule titles are HTML-escaped")
must("<script>alert(1)</script>" not in index, "no raw script tag injected")

# --- self-contained: no external asset requests --------------------------------
for bad in ("http://", "cdn", "<script"):
    must(bad not in index.lower().replace("http://127.0.0.1", ""),
         "index references nothing external: %r" % bad)

# --- health --------------------------------------------------------------------
must(health["apps"]["rmx-brs"]["runs"] == 5, "healthz counts 5 stored runs")
must(isinstance(health["apps"]["rmx-brs"]["newestAgeSeconds"], int)
     and health["apps"]["rmx-brs"]["newestAgeSeconds"] < 120,
     "healthz reports a fresh newestAgeSeconds")
must(health["retentionDays"] == 365, "healthz states the 365-day retention")

# --- the second app, resolved through ITS OWN area list ------------------------
must("rmx-sign" in health["apps"], "healthz sees the second app")
must("Seif de credențiale" in index, "rmx-sign area from the per-app list")
must("Preluare documente din email" in index, "rmx-sign second area from its list")
must("Altele" not in index, "no rmx-sign rule fell through to the catch-all area")

# --- the weekly #tests digest ---------------------------------------------------
# It must be the READY-TO-POST body: the CronJob does `curl | curl` and computes
# nothing, so anything missing here is missing in the chat message.
must(set(("severity", "message", "detail")) <= set(digest),
     "digest carries the talk-webhook triple (severity/message/detail)")
must(digest["severity"] == "fail", "digest severity is fail while rules are broken")
must("sumar săptămânal (dev)" in digest["message"], "digest headline names the env")
# 12 rmx-brs rules + 5 rmx-sign rules, and it says so ACROSS apps — the single
# number a reader should be able to act on without opening anything.
must("2 din 17 reguli de business nu se respectă" in digest["message"],
     "digest counts failing rules across BOTH apps")
must("rmx-brs — 2 din 12 reguli nu se respectă" in digest["detail"],
     "digest breaks the count down per app")
must("aplicații" in digest["message"], "digest states how many apps it covers")
must("rmx-brs" in digest["detail"] and "rmx-sign" in digest["detail"],
     "digest details every reporting app")
must("https://tests.lumen.example" in digest["detail"], "digest links the page")
# THE NOTIFICATION PRINCIPLE: a summary and a link, never the payload.
must("AssertionError" not in json.dumps(digest, ensure_ascii=False),
     "digest carries NO stack trace")
must("trecerea în „depus”" not in json.dumps(digest, ensure_ascii=False),
     "digest carries NO rule text — that is what the page is for")
# Romanian agreement has three forms; "12 reguli" (bare) and "2773 de reguli" are
# both right and a naive singular/plural switch gets one of them wrong.
must("17 reguli" in digest["message"] and "17 de reguli" not in digest["message"],
     "Romanian: 17 takes the bare plural")
must("(1 verificare)" in digest["detail"], "Romanian: 1 takes the singular")

print()
if fails:
    print("%d ASSERTION(S) FAILED" % len(fails)); sys.exit(1)
print("all assertions passed")
PY

echo "--- retention prune (unit, backdated files) ---"
PYTHONPATH="$APPDIR" DATA_DIR="$DATA" python3 - <<'PY'
import os, sys, datetime, importlib
import store
now = datetime.datetime.now(datetime.timezone.utc)
d = os.path.join(store.DATA_DIR, "rmx-brs")
old = (now - datetime.timedelta(days=400)).strftime("%Y%m%dT%H%M%SZ") + "-deadbeef"
edge = (now - datetime.timedelta(days=364)).strftime("%Y%m%dT%H%M%SZ") + "-cafebabe"
for stem in (old, edge):
    open(os.path.join(d, stem + ".json"), "w").write('{"schema":"test-report/v1","totals":{},"areas":[]}')
before = len(store.stems("rmx-brs"))
removed = store.prune("rmx-brs")
after = store.stems("rmx-brs")
assert removed == 1, "expected exactly the 400-day file pruned, got %d" % removed
assert old not in after, "400-day-old run survived retention"
assert edge in after, "364-day-old run was wrongly pruned"
assert before - 1 == len(after)
# a corrupt file must be SKIPPED, never fatal
open(os.path.join(d, "20260101T000000Z-badfile.json"), "w").write("{ not json")
hist = store.history("rmx-brs", 50)
assert all(h is not None for h in hist)
assert not any(h["stem"] == "20260101T000000Z-badfile" for h in hist), "corrupt file leaked into history"
print("  ok   prune keeps 364d, drops 400d; corrupt file skipped not fatal")

# History holds one whole run. What a page derives from it stays what the whole runs say:
# a rule failing in the newest run, one that was failing and is fixed, one that is new.
import analysis, json as _json, subprocess, sys as _sys
def run_doc(rules, failed, stamp):
    return {"receivedAt": stamp, "totals": {"passed": 1, "failed": failed},
            "areas": [{"area": "A", "failed": failed,
                       "rules": [{"title": t, "status": st, "evidence": "x" * 50} for t, st in rules]}]}
os.makedirs(os.path.join(store.DATA_DIR, "hist"))
docs = {
    "20260103T000000Z-cccccccc": run_doc([("stays", "failed"), ("fixed", "passed"), ("new", "failed")], 2, "c"),
    "20260102T000000Z-bbbbbbbb": run_doc([("stays", "failed"), ("fixed", "failed"), ("gone", "failed")], 3, "b"),
    "20260101T000000Z-aaaaaaaa": run_doc([("stays", "failed"), ("fixed", "failed")], 2, "a"),
}
for stem, doc in docs.items():
    _json.dump(doc, open(os.path.join(store.DATA_DIR, "hist", stem + ".json"), "w"))
reduced = store.history("hist", 40)
whole = [store.load("hist", stem) for stem in sorted(docs, reverse=True)]
assert analysis.failing_since(reduced) == analysis.failing_since(whole), "reducing changed failing-since"
assert analysis.area_movement(reduced) == analysis.area_movement(whole), "reducing changed area movement"
assert analysis.trend(reduced) == analysis.trend(whole), "reducing changed the trend"
assert reduced[0] == whole[0], "the newest run must stay whole"
older = [r["title"] for r in reduced[1]["areas"][0]["rules"]]
assert older == ["stays"], "an older run must hold only rules failing in the newest, got %s" % older
assert store.load("hist", "20260102T000000Z-bbbbbbbb")["areas"][0]["rules"][1]["evidence"], "one run's page must stay whole"
print("  ok   history: one whole run; failing-since, movement and trend unchanged")

# The cap that killed the pod on 2026-11-04: 40 reports of 2.6 MB, measured in a process
# of its own, against the 256 Mi limit in deployment.yaml less room for the other apps.
big = {"receivedAt": "z", "totals": {"passed": 9000, "failed": 0}, "areas": [
    {"area": "A%d" % a, "failed": 0, "rules": [
        {"title": "rule %d" % r, "status": "passed", "evidence": "x" * 180} for r in range(1000)]}
    for a in range(12)]}
os.makedirs(os.path.join(store.DATA_DIR, "bigapp"))
body = _json.dumps(big)
assert len(body) > 2_500_000, "fixture is smaller than the report that killed the pod"
for i in range(40):
    open(os.path.join(store.DATA_DIR, "bigapp", "202601%02dT%02d0000Z-deadbeef.json" % (i // 24 + 1, i % 24)), "w").write(body)
probe = (
    "import resource,store,render;"
    "render.render_index([('bigapp',store.history('bigapp',40))]);"
    "print(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss//1024)"
)
peak = int(subprocess.check_output([_sys.executable, "-B", "-c", probe], text=True).strip())
assert peak < 128, "index page peaked at %d MiB over 40 reports of 2.6 MB (limit 128)" % peak
print("  ok   index page over 40 reports of 2.6 MB peaks at %d MiB" % peak)
PY

echo
echo "OFFLINE TEST PASSED"
