#!/bin/sh
# The mail server's administrators follow Authentik's groups (admins.yaml runs this).
#
# Stalwart v1 signs people in through the estate's directory (OIDC) and creates their account on
# the first sign-in, but it cannot take an administrator from the directory: a group the token
# names becomes a Stalwart group, and a group's roles are never a member's permissions (v1.0.3 and
# v1.1.0, crates/common/src/auth/access_token.rs). The administrator role lives on the ACCOUNT, and
# the directory's sign-in never changes it. So this reconciles it, from the directory:
#
#   every active member of ADMIN_GROUPS (app-mail-admin, platform-admins)  → role Admin
#   every other account holding role Admin                                 → role User
#   a member without an account yet                                        → the account is made,
#                                                                            role Admin, so the
#                                                                            first sign-in lands
#                                                                            on the administration
# A member's mailbox is the one the sign-in maps them to (the `mail` scope in the providers
# blueprint): their `mail_address` attribute, else `mail_account`, else their username, with
# @MAILBOX_DOMAIN appended when it has no domain. Accounts with a CUSTOM role are the estate's own
# decision and are left alone (reported). The recovery administrator is not an account and is
# never touched: it stays the break-glass.
#
# Reads: Authentik's groups (a read-only token: view_user + view_group). Writes: only the role of
# accounts on this server, and accounts for members who have none. Any refusal stops the run
# before a write, naming its reason; nothing is skipped silently.
#
# Inputs (environment): AK_API, STALWART_API, MAILBOX_DOMAIN, ADMIN_GROUPS (space-separated);
# DRY_RUN=1 prints what it would change and writes nothing.
# Files: /ak/AUTHENTIK_API_TOKEN, /stalwart/STALWART_USER, /stalwart/STALWART_PASSWORD.
# Never on argv: curl reads both credentials from config files under $WORK (umask 077).
set -eu
umask 077
die() { echo "REFUSED: $*" >&2; exit 1; }
need() { [ -s "$1" ] || { echo "MISSING REQUIRED SECRET: $2" >&2; exit 1; }; }
for v in AK_API STALWART_API MAILBOX_DOMAIN ADMIN_GROUPS; do
  eval "x=\${$v:-}"; [ -n "$x" ] || { echo "MISSING REQUIRED INPUT: $v" >&2; exit 1; }
done
SECRETS="${SECRETS_DIR:-}"
need "$SECRETS/ak/AUTHENTIK_API_TOKEN" AUTHENTIK_API_TOKEN
need "$SECRETS/stalwart/STALWART_USER" STALWART_USER
need "$SECRETS/stalwart/STALWART_PASSWORD" STALWART_PASSWORD
W="${WORK:-/work}"
mkdir -p "$W"

# Credentials into curl config files, never argv (printf is the shell's builtin).
{ printf 'header = "Authorization: Bearer '; tr -d '\n' <"$SECRETS/ak/AUTHENTIK_API_TOKEN"; printf '"\n'; } >"$W/ak.cfg"
{ printf 'user = "'; tr -d '\n' <"$SECRETS/stalwart/STALWART_USER"; printf ':'; tr -d '\n' <"$SECRETS/stalwart/STALWART_PASSWORD"; printf '"\n'; } >"$W/st.cfg"

# http <out> <curl args…>: the HTTP status on stdout, the body in <out>.
http() { o="$1"; shift; curl -sS --compressed -m 30 -o "$o" -w '%{http_code}' "$@" || echo 000; }

# ---- 1. who should administer, from the directory ----------------------------------------------
: >"$W/want.txt"
for g in $ADMIN_GROUPS; do
  case "$g" in *[!A-Za-z0-9._-]*) die "group name '$g' is not a plain name" ;; esac
  c="$(http "$W/group.json" -K "$W/ak.cfg" "$AK_API/api/v3/core/groups/?name=$g&include_users=true")"
  [ "$c" = 200 ] || die "Authentik GET /core/groups/?name=$g -> HTTP $c"
  n="$(jq --arg g "$g" '[.results[]? | select(.name == $g)] | length' "$W/group.json")"
  [ "$n" = 1 ] || die "Authentik has $n groups named '$g' (expected exactly 1)"
  jq -r --arg g "$g" --arg d "$MAILBOX_DOMAIN" '
    .results[] | select(.name == $g) | .users_obj[]? | select(.is_active == true)
    | ((.attributes.mail_address // .attributes.mail_account // .username) | tostring) as $m
    | (if ($m | contains("@")) then $m else $m + "@" + $d end) | ascii_downcase' \
    "$W/group.json" >>"$W/want.txt"
done
sort -u "$W/want.txt" -o "$W/want.txt"
echo "directory: $(grep -c . "$W/want.txt" || true) administrator(s) in: $ADMIN_GROUPS"

# ---- 2. what the server holds ------------------------------------------------------------------
jmap() { # jmap <request file> <response file>: the JMAP API with the recovery administrator
  c="$(http "$2" -K "$W/st.cfg" -H 'Content-Type: application/json' --data-binary "@$1" "$STALWART_API/jmap")"
  [ "$c" = 200 ] || die "Stalwart POST /jmap -> HTTP $c"
  if jq -e '.methodResponses[] | select(.[0] == "error")' "$2" >/dev/null; then
    die "Stalwart refused the call: $(jq -c '[.methodResponses[] | select(.[0] == "error") | .[1]]' "$2")"
  fi
}
jq -n --arg d "$MAILBOX_DOMAIN" '{using:["urn:ietf:params:jmap:core"],methodCalls:[
  ["x:Domain/query",{filter:{name:$d}},"d"],
  ["x:Account/query",{calculateTotal:true},"q"],
  ["x:Account/get",{"#ids":{resultOf:"q",name:"x:Account/query",path:"/ids"},
    properties:["@type","name","emailAddress","roles"]},"g"]]}' >"$W/read.json"
jmap "$W/read.json" "$W/server.json"
DOMAIN_ID="$(jq -r '.methodResponses[] | select(.[2] == "d") | .[1].ids | if length == 1 then .[0] else "" end' "$W/server.json")"
[ -n "$DOMAIN_ID" ] || die "the server has no single domain named $MAILBOX_DOMAIN"
total="$(jq '.methodResponses[] | select(.[2] == "q") | .[1].total // -1' "$W/server.json")"
got="$(jq '.methodResponses[] | select(.[2] == "g") | .[1].list | length' "$W/server.json")"
[ "$total" = "$got" ] || die "the server listed $got of $total accounts: refusing to judge a partial list"

# ---- 3. the plan: promote, demote, create (one JMAP set) ---------------------------------------
jq -n --slurpfile s "$W/server.json" --rawfile want "$W/want.txt" --arg dom "$DOMAIN_ID" --arg d "$MAILBOX_DOMAIN" '
  ($want | split("\n") | map(select(length > 0))) as $w
  | [$s[0].methodResponses[] | select(.[2] == "g") | .[1].list[] | select(.["@type"] == "User")] as $users
  | ($users | map({key: (.emailAddress | ascii_downcase), value: .})) | from_entries as $by
  | {
      promote: [$users[] | select((.emailAddress | ascii_downcase) as $e | any($w[]; . == $e)) | select(.roles["@type"] == "User") | {id, email: .emailAddress}],
      demote:  [$users[] | select((.emailAddress | ascii_downcase) as $e | any($w[]; . == $e) | not) | select(.roles["@type"] == "Admin") | {id, email: .emailAddress}],
      custom:  [$users[] | select(.roles["@type"] == "Custom") | .emailAddress],
      create:  [$w[] | select($by[.] == null) | select(endswith("@" + ($d | ascii_downcase)))],
      foreign: [$w[] | select($by[.] == null) | select(endswith("@" + ($d | ascii_downcase)) | not)],
      domain:  $dom
    }' >"$W/plan.json"
jq -r '.custom[] | "left alone (custom role): \(.)"' "$W/plan.json"
jq -r '.foreign[] | "not on this server (mailbox domain is not '"$MAILBOX_DOMAIN"'): \(.)"' "$W/plan.json"
jq '{using:["urn:ietf:params:jmap:core"],methodCalls:[["x:Account/set",{
      update: ((.promote | map({key: .id, value: {roles: {"@type": "Admin"}}})) + (.demote | map({key: .id, value: {roles: {"@type": "User"}}})) | from_entries),
      create: (.create | to_entries | map({key: "n\(.key)", value: {"@type": "User", name: (.value | split("@")[0]), domainId: $p.domain, roles: {"@type": "Admin"}}}) | from_entries)
    },"s"]]}' --argjson p "$(jq -c '{domain}' "$W/plan.json")" "$W/plan.json" >"$W/set.json"
if jq -e '.methodCalls[0][1] | (.update | length) + (.create | length) == 0' "$W/set.json" >/dev/null; then
  echo "no change: every administrator holds the role, nobody else does"
  exit 0
fi
if [ "${DRY_RUN:-0}" = 1 ]; then
  jq -r '.promote[] | "would promote: \(.email)"' "$W/plan.json"
  jq -r '.demote[]  | "would demote: \(.email)"' "$W/plan.json"
  jq -r '.create[]  | "would create, administrator: \(.)"' "$W/plan.json"
  exit 0
fi
jmap "$W/set.json" "$W/result.json"
jq -e '.methodResponses[0][1] | ((.notUpdated // {}) | length) + ((.notCreated // {}) | length) == 0' "$W/result.json" >/dev/null ||
  die "the server refused part of the change: $(jq -c '.methodResponses[0][1] | {notUpdated, notCreated}' "$W/result.json")"
jq -r '.promote[] | "promoted: \(.email)"' "$W/plan.json"
jq -r '.demote[]  | "demoted: \(.email)"' "$W/plan.json"
jq -r '.create[]  | "created, administrator: \(.)"' "$W/plan.json"
