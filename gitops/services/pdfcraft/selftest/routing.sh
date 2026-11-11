#!/usr/bin/env bash
# PDFCraft's edge routing and stylesheet injection, proven against the REAL
# pinned image — the one deployment.yaml names — run under the deployment's own
# hardening (non-root, read-only root, no capabilities) with our nginx.conf and
# $SLUG.css mounted exactly where the pod mounts them.
#
#   gitops/services/pdfcraft/selftest/routing.sh
#   NGINX_CONF=/path/to/other.conf gitops/services/pdfcraft/selftest/routing.sh
#
# NGINX_CONF swaps in another config — how the suite is shown FAILING on a
# broken rule rather than only ever seen passing.
#
# Needs podman (or docker as $ENGINE) and curl. Touches no cluster. One case per
# line; every redirect and every passthrough is named. Exit 1 on any failure.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The SEB piece pdfcraft: its front's files carry the estate's slug as ${ESTATE_SLUG}, filled
# here as the bundle builder fills them (SLUG, default "estate").
PIECE="${PIECE:-$HERE/../../../../pieces/pdfcraft/base}"
SLUG="${SLUG:-estate}"
BASE="$(mktemp -d)"
for f in nginx.conf ro.js me.js ro-overrides.conf ro-overrides.json estate.css estate.js bar.js deployment.yaml; do
  sed "s/\${ESTATE_SLUG}/$SLUG/g" "$PIECE/$f" > "$BASE/$f"
done
CONF="${NGINX_CONF:-$BASE/nginx.conf}"
CSS="${ESTATE_CSS:-$BASE/estate.css}"
JS="${ESTATE_JS:-$BASE/estate.js}"
# RO_JS swaps in another base/ro.js — how ro-texts.py is shown FAILING (text rows
# rewritten, rows shifted) rather than only ever seen passing.
RO_JS="${RO_JS:-$BASE/ro.js}"
ENGINE="${ENGINE:-podman}"
PORT="${PORT:-18097}"
IMAGE="$(sed -n 's/^[[:space:]]*image:[[:space:]]*\(ghcr.io\/pdfcrafttool\/pdfcraft[^[:space:]]*\).*/\1/p' "$BASE/deployment.yaml" | head -n 1)"
[ -n "$IMAGE" ] || { echo "routing.sh: cannot read the pinned image from deployment.yaml" >&2; exit 2; }

NAME="pdfcraft-routing-$$"
cleanup() { "$ENGINE" rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap cleanup EXIT

"$ENGINE" run -d --name "$NAME" --read-only --user 101:101 --cap-drop ALL \
  --security-opt no-new-privileges --sysctl net.ipv4.ip_unprivileged_port_start=0 \
  --tmpfs /tmp:size=64m --tmpfs /var/cache/nginx:size=16m \
  -v "$CONF:/etc/nginx/nginx.conf:ro" -v "$CSS:/etc/nginx/$SLUG/$SLUG.css:ro" \
  -v "$BASE/ro-overrides.conf:/etc/nginx/$SLUG/ro-overrides.conf:ro" \
  -v "$BASE/ro-overrides.json:/etc/nginx/$SLUG/ro-overrides.json:ro" \
  -v "$RO_JS:/etc/nginx/$SLUG/ro.js:ro" \
  -v "$JS:/etc/nginx/$SLUG/$SLUG.js:ro" \
  -v "$BASE/bar.js:/etc/nginx/$SLUG/bar.js:ro" -v "$BASE/me.js:/etc/nginx/$SLUG/me.js:ro" \
  -p "127.0.0.1:$PORT:8080" "$IMAGE" nginx -g 'daemon off;' >/dev/null

B="http://127.0.0.1:$PORT"
for _ in $(seq 1 50); do curl -s -o /dev/null "$B/ro/tools/" && break; sleep 0.2; done

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL %s\n       %s\n' "$1" "$2"; }

# expect <path> <status> [location]
expect() {
  local path="$1" want="$2" loc="${3:-}" got
  got="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B$path")"
  local code="${got%% *}" to="${got#* }"
  to="${to#"$B"}"
  if [ "$code" != "$want" ]; then bad "$path → $want${loc:+ $loc}" "got $code ${to}"; return; fi
  if [ -n "$loc" ] && [ "$to" != "$loc" ]; then bad "$path → $want $loc" "redirected to [$to]"; return; fi
  ok "$path → $want${loc:+ $loc}"
}

echo "-- the entry point"
expect /             302 /ro/tools/
expect /index.html   302 /

echo "-- their home and marketing pages → our entry point"
expect /ro                   302 /
expect /ro/                  302 /
expect /ro/index.html        302 /
expect /ro/index.txt         302 /
expect /ro/about/            302 /
expect /ro/about             302 /
expect /ro/about/index.txt   302 /
expect /ro/contact/          302 /
expect /ro/privacy/          302 /
expect /ro/terms/            302 /
expect /ro/cookies/          302 /

echo "-- every other locale → the same path in Romanian"
expect /en                         302 /ro/
expect /zh/                        302 /ro/
expect /zh-TW/tools/merge-pdf/     302 /ro/tools/merge-pdf/
expect "/en/tools/merge-pdf/?a=1"  302 "/ro/tools/merge-pdf/?a=1"
expect /de/workflow/               302 /ro/workflow/
expect /hi/faq/                    302 /ro/faq/

echo "-- the four entry points and the tools pass through"
expect /ro/tools/              200
expect /ro/tools/merge-pdf/    200
expect /ro/tools/compress-pdf/ 200
expect /ro/studio/             200
expect /ro/workflow/           200
expect /ro/faq/                200

echo "-- shared assets pass through, untouched by the locale rule"
expect /favicon.svg                         200
expect /_$SLUG/$SLUG.css                200
expect /libreoffice-wasm/soffice.js         200
expect /sw.js                               200

echo "-- the stylesheet is on their pages, once"
for p in /ro/tools/ /ro/tools/merge-pdf/ /ro/faq/; do
  n="$( { curl -s "$B$p" | grep -o "<link rel=\"stylesheet\" href=\"/_$SLUG/$SLUG.css\">" || true; } | wc -l | tr -d ' ')"
  if [ "$n" = "1" ]; then ok "$p carries the stylesheet once"; else bad "$p carries the stylesheet once" "found $n"; fi
  n="$( { curl -s "$B$p" | grep -o "<script src=\"/_$SLUG/$SLUG.js\"></script>" || true; } | wc -l | tr -d ' ')"
  if [ "$n" = "1" ]; then ok "$p loads our script once"; else bad "$p loads our script once" "found $n"; fi
done
expect /_$SLUG/$SLUG.js 200
expect /_$SLUG/bar.js 200
n="$( { curl -s "$B/ro/tools/" | grep -o "<script src=\"/_$SLUG/bar.js\" defer></script></head>" || true; } | wc -l | tr -d ' ')"
if [ "$n" = "1" ]; then ok "their pages load the estate's bar once, deferred"; else bad "their pages load the estate's bar once, deferred" "found $n"; fi

echo "-- /_$SLUG/me answers the gate's person as JSON, escaped, never as markup"
me="$(curl -s -H 'X-authentik-name: Ana "<b>" Pop' -H 'X-authentik-email: ana@exemplu.test' "$B/_$SLUG/me")"
want='{"name":"Ana \"<b>\" Pop","email":"ana@exemplu.test"}'
if [ "$me" = "$want" ]; then ok "a name with quotes and markup comes back as an escaped JSON string"; else bad "a name with quotes and markup comes back escaped" "got [$me]"; fi
me="$(curl -s "$B/_$SLUG/me")"
if [ "$me" = '{"name":"","email":""}' ]; then ok "no gate headers: empty fields, nothing invented"; else bad "no gate headers: empty fields" "got [$me]"; fi
me="$(curl -s -H 'X-authentik-name: Ana Pop-Ștefănescu' -H 'X-authentik-email: a@exemplu.test' "$B/_$SLUG/me")"
case "$me" in
  *'Ana Pop-Ștefănescu'*) ok "a non-ASCII name survives (UTF-8)" ;;
  *) bad "a non-ASCII name survives (UTF-8)" "got [$me]" ;;
esac
H="$(curl -s -D - -o /dev/null "$B/_$SLUG/me")"
case "$H" in
  *[Cc]ache-[Cc]ontrol:\ no-store*) ok "/_$SLUG/me is never cached (a shared machine shows the next person their own name)" ;;
  *) bad "/_$SLUG/me is never cached" "$(printf '%s' "$H" | grep -i cache-control)" ;;
esac
for p in /ro/tools/ /ro/tools/merge-pdf/ /ro/workflow/ /ro/studio/ /ro/faq/; do
  page="$(curl -s "$B$p")"
  case "$page" in
    *'<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"/>'*)
      case "$page" in
        *'<link rel="manifest" href="/manifest.webmanifest"/>'*) bad "$p asks for its manifest with the session cookie" "an uncredentialed manifest link is still there" ;;
        *) ok "$p asks for its manifest with the session cookie (the gate cannot redirect it)" ;;
      esac ;;
    *) bad "$p asks for its manifest with the session cookie" "no crossorigin=use-credentials manifest link" ;;
  esac
done
H="$(curl -s -D - -o /dev/null "$B/ro/tools/merge-pdf/")"
case "$H" in
  *[Cc]ross-[Oo]rigin-[Ee]mbedder-[Pp]olicy:\ require-corp*) ok "upstream's COEP header survives the front (the WebAssembly tools need it)" ;;
  *) bad "upstream's COEP header survives the front" "missing" ;;
esac

echo "-- a large WebAssembly file streams through without spooling to /tmp"
size="$(curl -s -o /dev/null -w '%{size_download}' "$B/libreoffice-wasm/soffice.wasm.bin")"
used="$("$ENGINE" exec "$NAME" du -sk /tmp | awk '{print $1}')"
if [ "${size:-0}" -gt 10000000 ] && [ "${used:-99999}" -lt 1024 ]; then
  ok "soffice.wasm.bin streamed (${size} bytes) and /tmp holds ${used}K"
else
  bad "soffice.wasm.bin streamed without spooling" "size=${size} /tmp=${used}K"
fi

echo "-- upstream's hardcoded Chinese is served in Romanian (base/ro-overrides.json)"
# The chunks are DISCOVERED inside the image (their names are content hashes and
# change with every upstream build): every chunk on disk that holds a map key.
MAP="$BASE/ro-overrides.json"
KEYS_FILE="$(mktemp)"; VALS_FILE="$(mktemp)"
trap 'cleanup; rm -f "$KEYS_FILE" "$VALS_FILE"' EXIT
python3 -I -c 'import json,sys; m=json.load(open(sys.argv[1],encoding="utf-8"))["chunks"]; open(sys.argv[2],"w",encoding="utf-8").write("\n".join(m)+"\n"); open(sys.argv[3],"w",encoding="utf-8").write("\n".join(m.values())+"\n")' \
  "$MAP" "$KEYS_FILE" "$VALS_FILE"
CHUNKS="$("$ENGINE" exec -i "$NAME" grep -rlF -f /dev/stdin /website/pdfcraft/_next/static/chunks < "$KEYS_FILE" | sed 's#^/website/pdfcraft##' || true)"
if [ -z "$CHUNKS" ]; then
  bad "the image still holds the strings the map translates" "no chunk contains any key — upstream changed them; review ro-overrides.json"
else
  SERVED="$(for c in $CHUNKS; do curl -s "$B$c"; done)"
  left=0
  while IFS= read -r k; do
    [ -n "$k" ] || continue
    case "$SERVED" in *"$k"*) left=$((left+1)); printf '       still Chinese: %s\n' "$k" ;; esac
  done < "$KEYS_FILE"
  if [ "$left" -eq 0 ]; then ok "no map key survives in the $(printf '%s\n' "$CHUNKS" | wc -l | tr -d ' ') served chunk(s)"; else bad "no map key survives" "$left key(s) still served"; fi
  missing=0
  while IFS= read -r v; do
    [ -n "$v" ] || continue
    case "$SERVED" in *"$v"*) ;; *) missing=$((missing+1)); printf '       absent: %s\n' "$v" ;; esac
  done < "$VALS_FILE"
  if [ "$missing" -eq 0 ]; then ok "every Romanian value is in the served chunks"; else bad "every Romanian value is in the served chunks" "$missing absent"; fi
  first="$(printf '%s\n' "$CHUNKS" | sed -n 1p)"
  H="$(curl -s -D - -o /dev/null -H 'Accept-Encoding: gzip' "$B$first")"
  case "$H" in
    *"max-age=86400"*) ok "a rewritten chunk is cached for a day, not upstream's immutable year" ;;
    *) bad "a rewritten chunk is cached for a day" "$(printf '%s' "$H" | grep -i cache-control)" ;;
  esac
  if node -e 'new Function(require("fs").readFileSync(0,"utf8"))' < <(curl -s "$B$first") 2>/dev/null; then
    ok "the rewritten chunk still parses as JavaScript"
  else
    bad "the rewritten chunk still parses as JavaScript" "$first"
  fi
fi

echo "-- upstream's English tool names, descriptions and messages are served in Romanian (base/ro.js)"
# Upstream's own copies, for the byte-for-byte comparisons, and the chunks that
# hold the tool catalogue (DISCOVERED: any chunk with a `metaDescription:` literal).
UP="$(mktemp -d)"
trap 'cleanup; rm -f "$KEYS_FILE" "$VALS_FILE"; rm -rf "$UP"' EXIT
for f in ro/tools/index.txt ro/tools/edit-pdf/index.txt ro/tools/edit-pdf/index.html; do
  mkdir -p "$UP/$(dirname "$f")"
  "$ENGINE" exec "$NAME" cat "/website/pdfcraft/$f" > "$UP/$f"
done
CATALOGUE="$("$ENGINE" exec "$NAME" grep -rlF 'metaDescription:' /website/pdfcraft/_next/static/chunks | sed 's#^/website/pdfcraft##' || true)"
if [ -z "$CATALOGUE" ]; then
  bad "the image still holds the tool catalogue in a chunk" "no chunk has a metaDescription literal — upstream changed shape; review base/ro.js"
fi
# shellcheck disable=SC2086 # one argument per chunk path
if python3 -I "$HERE/ro-texts.py" "$B" "$UP" "$MAP" $CATALOGUE; then
  ok "ro-texts.py: pages, payloads and chunks in Romanian, payload rows intact"
else
  bad "ro-texts.py: pages, payloads and chunks in Romanian, payload rows intact" "see the FAIL lines above"
fi

echo "-- in a real browser: their chrome gone, the credit, the estate's ground (browser.mjs)"
if node "$HERE/browser.mjs" "$B"; then ok "browser.mjs: every page, both themes"; else bad "browser.mjs: every page, both themes" "see the FAIL lines above"; fi

printf '\nrouting.sh: %s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
