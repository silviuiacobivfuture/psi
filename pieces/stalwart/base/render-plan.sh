#!/bin/sh
# Renders the Stalwart configuration plan (plan.ndjson.tmpl) into /work/plan.ndjson for
# stalwart-cli, which has no shell of its own. Values come from the environment (hosts, from
# stalwart-settings) and from files (the certificate and the SES SMTP credential), and every
# value is JSON-escaped before it is written. The estate's mailboxes (one local part per line
# in /estate/mailboxes) become one Account upsert each, so they exist, and receive mail,
# before their owners' first sign-in. Fails loud on any missing input.
set -eu
need() { [ -s "$1" ] || { echo "MISSING REQUIRED INPUT: $1" >&2; exit 1; }; }
for f in /tls/tls.crt /tls/tls.key /ses/username /ses/password /ses/host; do need "$f"; done
for v in MAIL_HOST WEBMAIL_HOST MAILBOX_DOMAIN AUTHENTIK_HOST; do
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
  l=rep(l,"@MAIL_HOST@",ENVIRON["MAIL_HOST"]); l=rep(l,"@WEBMAIL_HOST@",ENVIRON["WEBMAIL_HOST"])
  l=rep(l,"@MAILBOX_DOMAIN@",ENVIRON["MAILBOX_DOMAIN"]); l=rep(l,"@AUTHENTIK_HOST@",ENVIRON["AUTHENTIK_HOST"])
  print l }' /plan/plan.ndjson.tmpl > /work/plan.ndjson
# The estate's mailboxes: lines of [a-z0-9._-]; anything else is refused, never skipped.
if [ -f /estate/mailboxes ]; then
  grep -v '^[[:space:]]*\(#\|$\)' /estate/mailboxes | while read -r box; do
    case "$box" in *[!a-z0-9._-]*|"") echo "INVALID MAILBOX NAME: $box" >&2; exit 1 ;; esac
    printf '{"@type":"upsert","object":"Account","matchOn":["name","domainId"],"value":{"box-%s":{"@type":"User","name":"%s","domainId":"#dom"}}}\n' "$box" "$box"
  done > /work/mailboxes.ndjson
  # Before the plan's closing reloads (its Action lines), so the server reloads with them in.
  grep -v '"object":"Action"' /work/plan.ndjson > /work/head.ndjson
  grep '"object":"Action"' /work/plan.ndjson > /work/tail.ndjson || true
  cat /work/head.ndjson /work/mailboxes.ndjson /work/tail.ndjson > /work/plan.ndjson
  rm -f /work/head.ndjson /work/mailboxes.ndjson /work/tail.ndjson
fi
grep -c . /work/plan.ndjson | sed 's/^/plan lines: /'
