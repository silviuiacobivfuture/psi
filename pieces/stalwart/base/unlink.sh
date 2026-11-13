#!/bin/bash
# Before the prune removes the Group accounts the estate now declares as mailing lists, every
# account's membership in THOSE Groups is removed, and only those: a membership in any other
# Group stays exactly as it was. (Stalwart refuses to remove a Group an account still links to,
# and takes no per-group membership patch in a plan, so the plan alone could only clear a
# mailbox's memberships wholesale, silently dropping it from a Group nobody declared.)
#
# Reads /work/declared-groups (one group address local part per line, written by render-plan.sh;
# absent or empty: nothing is declared, nothing is read or written). Talks to the server's JMAP
# management API with the admin credential, which goes to curl through a config file in /tmp,
# never on its command line. Writes only memberGroupIds, by explicit id, and only to accounts
# that hold a declared Group's id. Any refusal fails the step by name, before the prune runs.
set -euo pipefail
DECL="${DECLARED_GROUPS_FILE:-/work/declared-groups}"
if [ ! -s "$DECL" ]; then echo "unlink: no group address declared — nothing to unlink"; exit 0; fi
for v in STALWART_URL STALWART_USER STALWART_PASSWORD MAILBOX_DOMAIN; do
  [ -n "${!v:-}" ] || { echo "MISSING REQUIRED INPUT: $v" >&2; exit 1; }
done
cfg="$(mktemp)"; trap 'rm -f "$cfg"' EXIT; chmod 600 "$cfg"
esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
printf 'user = "%s:%s"\n' "$(esc "$STALWART_USER")" "$(esc "$STALWART_PASSWORD")" > "$cfg"
jmap() { # <method calls JSON> -> the response
  jq -nc --argjson calls "$1" '{using: ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"], methodCalls: $calls}' \
    | curl -sS -f -m 30 -K "$cfg" -H 'Content-Type: application/json' --data-binary @- "$STALWART_URL/jmap"
}
state="$(jmap '[["x:Domain/query",{"filter":{},"limit":500},"dq"],["x:Domain/get",{"#ids":{"resultOf":"dq","name":"x:Domain/query","path":"/ids"},"properties":["name"]},"dg"],["x:Account/query",{"filter":{},"limit":5000,"calculateTotal":true},"q"],["x:Account/get",{"#ids":{"resultOf":"q","name":"x:Account/query","path":"/ids"},"properties":["name","domainId","memberGroupIds"]},"g"]]')"
total="$(jq -r '.methodResponses[] | select(.[0] == "x:Account/query") | .[1].total' <<<"$state")"
seen="$(jq -r '.methodResponses[] | select(.[0] == "x:Account/get") | .[1].list | length' <<<"$state")"
[ "$total" = "$seen" ] || { echo "unlink: REFUSED — read $seen of $total accounts; nothing written" >&2; exit 1; }
# The declared Groups' ids: a Group (an account with no memberGroupIds) of that exact name in
# the estate's mailbox domain.
ids="$(jq -c --arg dom "$MAILBOX_DOMAIN" --rawfile decl "$DECL" '
  ([.methodResponses[] | select(.[0] == "x:Domain/get") | .[1].list[] | select(.name == $dom) | .id]) as $d
  | ($decl | split("\n") | map(select(length > 0))) as $names
  | [.methodResponses[] | select(.[0] == "x:Account/get") | .[1].list[]
     | select((has("memberGroupIds") | not) and (.name as $n | $names | index($n)) and (.domainId as $x | $d | index($x)))
     | .id]' <<<"$state")"
if [ "$ids" = "[]" ]; then echo "unlink: no declared Group account exists — nothing to unlink"; exit 0; fi
# Every account holding one of them: its memberships minus exactly those ids.
update="$(jq -c --argjson ids "$ids" '
  [.methodResponses[] | select(.[0] == "x:Account/get") | .[1].list[]
   | select(.memberGroupIds != null and ((.memberGroupIds | keys) - ((.memberGroupIds | keys) - $ids) | length) > 0)
   | {key: .id, value: {memberGroupIds: (.memberGroupIds | with_entries(select(.key as $k | $ids | index($k) | not)))}}]
  | from_entries' <<<"$state")"
if [ "$update" = "{}" ]; then echo "unlink: no account is a member of a declared Group"; exit 0; fi
answer="$(jmap "$(jq -nc --argjson u "$update" '[["x:Account/set",{"update":$u},"s"]]')")"
bad="$(jq -c '.methodResponses[] | select(.[0] == "x:Account/set") | .[1].notUpdated // {}' <<<"$answer")"
if [ "$bad" != "{}" ] || ! jq -e '.methodResponses[] | select(.[0] == "x:Account/set")' <<<"$answer" >/dev/null; then
  echo "unlink: REFUSED by the server: $bad" >&2; exit 1
fi
echo "unlink: removed the declared Group(s) $(jq -r 'join(",")' <<<"$ids") from $(jq -r 'keys | length' <<<"$update") account(s); every other membership kept"
