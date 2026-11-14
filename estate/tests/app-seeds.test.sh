#!/usr/bin/env bash
# psi's application seeding procedures (apps/*/seb.seed.sh), run by SEB's REAL seed-secrets.sh
# against SEB's fake OpenBao (the bundle's seed-fixture.sh): offline, no cluster, no credential.
#
#   estate/tests/app-seeds.test.sh            the fixture of the installed bundle (.seb-bundle; needs
#                                             SEB after 0.1.68, whose fixture copies a read-only bundle writable)
#   SEB_TESTS=<seb>/infrastructure/hetzner/scripts/tests estate/tests/app-seeds.test.sh
#
# NAMED CASES
#   S1 the sites' mail path ABSENT         → created, the five keys present and empty (both sites)
#   S2 a re-run                            → writes nothing
#   S3 the mail path holding values        → every value kept, nothing written
#   S4 the mail path missing one key       → that key added empty, the others kept
#   S5 an owner key absent from <site>/env → warned by name, never written
#   S6 cms and agent-studio                → their procedures write nothing; an absent path is warned
#   S7 the declarations allow only their own paths: a site's procedure never touches the other's
set -euo pipefail

PSI="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SEB_TESTS="${SEB_TESTS:-$PSI/.seb-bundle/infrastructure/hetzner/scripts/tests}"
[ -f "$SEB_TESTS/seed-fixture.sh" ] || { echo "REFUSED: no SEB seed fixture at $SEB_TESTS (pnpm install installs the bundle)" >&2; exit 2; }
export SEB_ESTATE_ROOT="$PSI"
# shellcheck source=/dev/null
. "$SEB_TESTS/seed-fixture.sh"

SITES="psizone-web hemisync-web"
MAIL="SMTP_HOST SMTP_USER SMTP_PASSWORD MAIL_FROM BOOKING_NOTIFY_TO"
fresh() { rm -rf "$BAO_DIR" "$BAO_DIR.writes"; mkdir -p "$BAO_DIR"; }
put() { FAKE_BAO_DIR="$BAO_DIR" "$WORK/bin/bao" kv put "$@"; : > "$BAO_DIR.writes"; }
writes_to() { grep -c " $1\$" "$BAO_DIR.writes" 2>/dev/null || true; }
# The sites' own keys, so only what is under test is absent.
owner_keys() { for s in $SITES; do put "secret/apps/$s/env" OPENROUTER_API_KEY=k CMS_API_KEY=k; done; }

echo "== S1 absent: created empty =="
fresh; owner_keys
rc=0; OUT="$(seed)" || rc=$?
assert_eq "S1: the run exits 0" 0 "$rc"
assert_not_contains "S1: no refusal" "REFUSED" "$OUT"
for s in $SITES; do
  for k in $MAIL; do
    if kvhas "secret/apps/$s/mail" "$k"; then t_pass "S1: $s/mail $k exists"; else t_fail "S1: $s/mail $k missing" "$OUT"; fi
    assert_eq "S1: $s/mail $k is empty" "" "$(kvget "secret/apps/$s/mail" "$k")"
  done
  assert_contains "S1: $s says it made an empty slot" "secret/apps/$s/mail (empty slot" "$OUT"
done

echo "== S2 a re-run writes nothing =="
before="$(snapshot)"; : > "$BAO_DIR.writes"
seed >/dev/null
assert_eq "S2: the store is unchanged" "$before" "$(snapshot)"
for s in $SITES; do assert_eq "S2: no write to $s/mail" 0 "$(writes_to "secret/apps/$s/mail")"; done

echo "== S3 configured: every value kept =="
fresh; owner_keys
put secret/apps/psizone-web/mail SMTP_HOST=relay.example SMTP_USER=u SMTP_PASSWORD=p MAIL_FROM=a@example.org BOOKING_NOTIFY_TO=t@example.org
seed >/dev/null
assert_eq "S3: SMTP_PASSWORD kept" "p" "$(kvget secret/apps/psizone-web/mail SMTP_PASSWORD)"
assert_eq "S3: BOOKING_NOTIFY_TO kept" "t@example.org" "$(kvget secret/apps/psizone-web/mail BOOKING_NOTIFY_TO)"
assert_eq "S3: no write to a complete path" 0 "$(writes_to secret/apps/psizone-web/mail)"

echo "== S4 one key missing: added empty, the rest kept =="
fresh; owner_keys
put secret/apps/hemisync-web/mail SMTP_HOST=relay.example SMTP_USER=u SMTP_PASSWORD=p MAIL_FROM=a@example.org
seed >/dev/null
if kvhas secret/apps/hemisync-web/mail BOOKING_NOTIFY_TO; then t_pass "S4: the missing key is added"; else t_fail "S4: the missing key is still absent" ""; fi
assert_eq "S4: added empty" "" "$(kvget secret/apps/hemisync-web/mail BOOKING_NOTIFY_TO)"
assert_eq "S4: SMTP_PASSWORD kept" "p" "$(kvget secret/apps/hemisync-web/mail SMTP_PASSWORD)"
assert_eq "S4: SMTP_HOST kept" "relay.example" "$(kvget secret/apps/hemisync-web/mail SMTP_HOST)"

echo "== S5 an owner key absent: warned, never written =="
fresh
put secret/apps/psizone-web/env CMS_API_KEY=k
OUT="$(seed)"
assert_contains "S5: the absent key is named" "secret/apps/psizone-web/env OPENROUTER_API_KEY is absent or empty" "$OUT"
assert_eq "S5: <site>/env not written" 0 "$(writes_to secret/apps/psizone-web/env)"
assert_eq "S5: hemisync-web/env not created" "" "$(ls "$BAO_DIR" | grep -F 'hemisync-web#env' || true)"

echo "== S6 cms and agent-studio write nothing =="
fresh; owner_keys
OUT="$(seed)"
for p in secret/apps/cms/db secret/apps/cms/env secret/apps/cms/oidc secret/apps/agent-studio/env; do
  assert_contains "S6: $p absent is warned" "$p is absent" "$OUT"
  assert_eq "S6: $p not written" 0 "$(writes_to "$p")"
done

echo "== S7 each site's procedure stays on its own paths =="
for s in $SITES; do
  other="psizone-web"; [ "$s" = psizone-web ] && other="hemisync-web"
  assert_not_contains "S7: $s's procedure names no path of $other" "apps/$other/" "$(grep -v '^[[:space:]]*#' "$PSI/apps/$s/seb.seed.sh")"
done

t_summary "estate/tests/app-seeds.test.sh"
