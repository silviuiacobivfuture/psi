#!/bin/sh
# Renders the Stalwart configuration plan (plan.ndjson.tmpl) into /work/plan.ndjson for
# stalwart-cli, which has no shell of its own. Values come from the environment (hosts, from
# stalwart-settings) and from files (the certificate and the SES SMTP credential), and every
# value is JSON-escaped before it is written. The estate's mailboxes (one local part per line
# in /estate/mailboxes) become one Account upsert each, so they exist, and receive mail,
# before their owners' first sign-in; the estate's group addresses (/estate/groups) one mailing list each, delivering into every member's own inbox (/work/prune.ndjson removes the Group accounts they used to be). Fails loud on any missing input.
set -eu
need() { [ -s "$1" ] || { echo "MISSING REQUIRED INPUT: $1" >&2; exit 1; }; }
for f in /tls/tls.crt /tls/tls.key /ses/username /ses/password /ses/host; do need "$f"; done
for v in MAIL_HOST MAILBOX_DOMAIN AUTHENTIK_HOST; do
  eval "x=\${$v:-}"; [ -n "$x" ] || { echo "MISSING REQUIRED INPUT: $v" >&2; exit 1; }
done
# json <file>: the file's content as a JSON string body (no quotes).
json() { sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\r$//' "$1" | awk 'BEGIN{ORS=""} {if (NR>1) print "\\n"; print} END{print "\\n"}'; }
jsonv() { printf '%s\n' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk 'BEGIN{ORS=""} {if (NR>1) print "\\n"; print}'; }
# Substitute with awk on exact tokens, values through ENVIRON (awk -v would unescape \n).
R_CRT="$(json /tls/tls.crt)" R_KEY="$(json /tls/tls.key)" \
R_SESU="$(jsonv "$(cat /ses/username)")" R_SESP="$(jsonv "$(cat /ses/password)")" \
R_SESH="$(jsonv "$(cat /ses/host)")" \
awk '
function rep(s, t, v,   i, out) { out=""; while ((i = index(s, t)) > 0) { out = out substr(s, 1, i-1) v; s = substr(s, i+length(t)) } return out s }
{ l=$0
  l=rep(l,"@TLS_CRT@",ENVIRON["R_CRT"]); l=rep(l,"@TLS_KEY@",ENVIRON["R_KEY"])
  l=rep(l,"@SES_SMTP_USERNAME@",ENVIRON["R_SESU"]); l=rep(l,"@SES_SMTP_PASSWORD@",ENVIRON["R_SESP"])
  l=rep(l,"@SES_SMTP_HOST@",ENVIRON["R_SESH"])
  l=rep(l,"@MAIL_HOST@",ENVIRON["MAIL_HOST"])
  l=rep(l,"@MAILBOX_DOMAIN@",ENVIRON["MAILBOX_DOMAIN"]); l=rep(l,"@AUTHENTIK_HOST@",ENVIRON["AUTHENTIK_HOST"])
  print l }' /plan/plan.ndjson.tmpl > /work/plan.ndjson
# The estate's mailboxes: lines of [a-z0-9._-]; anything else is refused, never skipped.
# The estate's GROUP ADDRESSES (/estate/groups, one per line: `<group> <member> [<member>...]`):
# an address that delivers a copy INTO EACH MEMBER'S OWN INBOX, like a mailing list (Stalwart's
# MailingList), e.g. the operations address, so who reads it changes here and never at a sender.
# Every member must be one of the mailboxes above. The slot owns the server's mailing lists: the
# plan reconciles them to exactly the declared set.
#
# Up to SEB 0.1.45 a group address was a Stalwart Group ACCOUNT: mail to it landed in one shared
# group mailbox, never in a member's inbox. Such accounts are removed by /work/prune.ndjson,
# applied BEFORE the plan (the CLI performs a reconcile's removals after every create, so the
# list could never take the address in the same run; and a Group is refused removal while a
# member still links to it, so unlink.sh first removes the memberships in those Groups).
# The prune removes ONLY a Group account whose name the estate declares as a group address (the
# address becoming a list), one reconcile scoped to that exact name each (Stalwart matches the
# name exactly: "ops" never touches "ops-old" or "ops.x"). An undeclared Group is never
# touched, whoever made it and whatever its mailbox holds. With no group address declared the
# prune holds only the domain and changes nothing. Should an account still link a declared
# Group when the prune runs, the server refuses (objectIsLinked), by name, and the Job fails.
# Membership: a declared Group cannot be removed while an account is its member, and a plan
# cannot patch one membership by reference, so unlink.sh runs between render and prune: it
# removes every account's membership in exactly the declared Groups, by id, and keeps every
# other membership (/work/declared-groups names them). Neither plan sets memberGroupIds.
valid() { case "$1" in *[!a-z0-9._-]*|"") return 1 ;; esac; return 0; }
grep '"object":"Domain"' /work/plan.ndjson > /work/prune.ndjson
if [ -f /estate/mailboxes ] || [ -f /estate/groups ]; then
  : > /work/accounts.ndjson
  boxes=""
  if [ -f /estate/mailboxes ]; then
    boxes="$(grep -v '^[[:space:]]*\(#\|$\)' /estate/mailboxes || true)"
    for box in $boxes; do valid "$box" || { echo "INVALID MAILBOX NAME: $box" >&2; exit 1; }; done
  fi
  lists="" seen=""
  if [ -f /estate/groups ]; then
    grep -v '^[[:space:]]*\(#\|$\)' /estate/groups > /work/groups || true
    while read -r grp members; do
      valid "$grp" || { echo "INVALID GROUP NAME: $grp" >&2; exit 1; }
      [ -n "$members" ] || { echo "GROUP WITHOUT MEMBERS: $grp" >&2; exit 1; }
      case " $(echo $boxes) " in *" $grp "*) echo "GROUP NAMED LIKE A MAILBOX: $grp" >&2; exit 1 ;; esac
      case " $seen " in *" $grp "*) echo "GROUP DECLARED TWICE: $grp" >&2; exit 1 ;; esac
      seen="$seen $grp"
      rcpt=""
      for m in $members; do
        printf '%s\n' $boxes | grep -qx "$m" || { echo "GROUP $grp: MEMBER IS NOT A DECLARED MAILBOX: $m" >&2; exit 1; }
        rcpt="$rcpt${rcpt:+,}\"$m@$MAILBOX_DOMAIN\":true"
      done
      lists="$lists${lists:+,}\"lst-$grp\":{\"name\":\"$grp\",\"domainId\":\"#dom\",\"recipients\":{$rcpt}}"
    done < /work/groups
  fi
  for box in $boxes; do
    printf '{"@type":"upsert","object":"Account","matchOn":["name","domainId"],"value":{"box-%s":{"@type":"User","name":"%s","domainId":"#dom"}}}\n' "$box" "$box"
  done >> /work/accounts.ndjson
  if [ -n "$seen" ]; then
    printf '%s\n' $seen > /work/declared-groups
    for grp in $seen; do
      printf '{"@type":"reconcile","object":"Account","matchOn":["name","domainId"],"scope":{"@type":"Group","name":"%s","domainId":"#dom"},"value":{}}\n' "$grp"
    done >> /work/prune.ndjson
  fi
  if [ -f /estate/groups ]; then
    printf '{"@type":"reconcile","object":"MailingList","matchOn":["name","domainId"],"value":{%s}}\n' "$lists" >> /work/accounts.ndjson
  fi
  # Before the plan's closing reloads (its Action lines), so the server reloads with them in.
  grep -v '"object":"Action"' /work/plan.ndjson > /work/head.ndjson
  grep '"object":"Action"' /work/plan.ndjson > /work/tail.ndjson || true
  cat /work/head.ndjson /work/accounts.ndjson /work/tail.ndjson > /work/plan.ndjson
  rm -f /work/head.ndjson /work/accounts.ndjson /work/tail.ndjson /work/groups
fi
grep -c . /work/plan.ndjson | sed 's/^/plan lines: /'
