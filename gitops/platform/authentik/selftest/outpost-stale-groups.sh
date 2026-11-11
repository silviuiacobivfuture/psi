#!/usr/bin/env bash
# The fact the SSO overlays' directory read rests on, measured: Authentik's embedded outpost keeps
# the groups a session had at sign-in. A real Authentik at the estate's pin, in a throwaway pod,
# with a throwaway user and nothing of the estate's. Removed on exit.
#
#   gitops/platform/authentik/selftest/outpost-stale-groups.sh
#
# Exit 0: the outpost still vouches for a removed group, so every overlay must keep reading the
# directory. Exit 1: it no longer does; the read can be reconsidered. Through the test slot.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PODMAN="${PODMAN:-/usr/bin/podman}"
AK="ghcr.io/goauthentik/server:2026.5.3@sha256:28166f077dae24371c59a644e4319ea173d5290613386462e8172a963bd607fd"
PG="docker.io/library/postgres:17-alpine@sha256:e4cb93687b062cd25a0e8f672d85a7708235009d70d31f8a7698d9370092a9c4"
NET="outpost-stale-$$"
PORT=$((20000 + RANDOM % 20000))
WORK="$(mktemp -d)"; chmod 755 "$WORK"
trap '"$PODMAN" rm -f "$NET-db" "$NET-server" "$NET-worker" >/dev/null 2>&1 || true; "$PODMAN" network rm "$NET" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
TOKEN="$(openssl rand -hex 32)"
DBPW="$(openssl rand -hex 16)"
{
  echo "AUTHENTIK_SECRET_KEY=$(openssl rand -hex 32)"
  echo "AUTHENTIK_POSTGRESQL__HOST=$NET-db"
  echo "AUTHENTIK_POSTGRESQL__NAME=authentik"
  echo "AUTHENTIK_POSTGRESQL__USER=authentik"
  echo "AUTHENTIK_POSTGRESQL__PASSWORD=$DBPW"
  echo "AUTHENTIK_BOOTSTRAP_TOKEN=$TOKEN"
  echo "AUTHENTIK_BOOTSTRAP_PASSWORD=$(openssl rand -hex 16)"
  echo "AUTHENTIK_BOOTSTRAP_EMAIL=admin@example.test"
  echo "AUTHENTIK_DISABLE_UPDATE_CHECK=true"
  echo "AUTHENTIK_ERROR_REPORTING__ENABLED=false"
} > "$WORK/ak.env"; chmod 600 "$WORK/ak.env"
{ echo "POSTGRES_DB=authentik"; echo "POSTGRES_USER=authentik"; echo "POSTGRES_PASSWORD=$DBPW"; } > "$WORK/db.env"; chmod 600 "$WORK/db.env"
mkdir "$WORK/bp"
cat > "$WORK/bp/probe.yaml" <<YAML
version: 1
metadata:
  name: outpost-stale-probe
  labels: { blueprints.goauthentik.io/instantiate: "true" }
entries:
  - model: authentik_core.group
    identifiers: { name: app-probe-admin }
    attrs: {}
  - model: authentik_providers_proxy.proxyprovider
    identifiers: { name: probe }
    attrs:
      mode: forward_single
      external_host: http://probe.localhost:$PORT
      authorization_flow: !Find [authentik_flows.flow, [slug, default-provider-authorization-implicit-consent]]
      invalidation_flow: !Find [authentik_flows.flow, [slug, default-invalidation-flow]]
      access_token_validity: hours=24
      property_mappings:
        - !Find [authentik_providers_oauth2.scopemapping, [managed, goauthentik.io/providers/oauth2/scope-openid]]
        - !Find [authentik_providers_oauth2.scopemapping, [managed, goauthentik.io/providers/oauth2/scope-email]]
        - !Find [authentik_providers_oauth2.scopemapping, [managed, goauthentik.io/providers/oauth2/scope-profile]]
        - !Find [authentik_providers_oauth2.scopemapping, [managed, goauthentik.io/providers/proxy/scope-proxy]]
  - model: authentik_core.application
    identifiers: { slug: probe }
    attrs:
      name: probe
      provider: !Find [authentik_providers_proxy.proxyprovider, [name, probe]]
  - model: authentik_policies.policybinding
    identifiers:
      target: !Find [authentik_core.application, [slug, probe]]
      group: !Find [authentik_core.group, [name, app-probe-admin]]
    attrs: { negate: false, enabled: true, order: 0 }
  - model: authentik_outposts.outpost
    identifiers: { managed: goauthentik.io/outposts/embedded }
    attrs:
      config:
        authentik_host: http://auth.localhost:$PORT
        authentik_host_browser: http://auth.localhost:$PORT
        authentik_host_insecure: true
      providers:
        - !Find [authentik_providers_proxy.proxyprovider, [name, probe]]
YAML
"$PODMAN" network create "$NET" >/dev/null
"$PODMAN" run -d -q --name "$NET-db" --network "$NET" --env-file "$WORK/db.env" "$PG" >/dev/null
sleep 3
"$PODMAN" run -d -q --name "$NET-server" --network "$NET" -p "127.0.0.1:$PORT:9000" --env-file "$WORK/ak.env" -v "$WORK/bp:/blueprints/custom:ro,Z" "$AK" server >/dev/null
"$PODMAN" run -d -q --name "$NET-worker" --network "$NET" --env-file "$WORK/ak.env" -v "$WORK/bp:/blueprints/custom:ro,Z" "$AK" worker >/dev/null
ready=0
for _ in $(seq 1 300); do
  if [ -n "$(curl -s -o /dev/null -w '%{redirect_url}' -H 'X-Forwarded-Proto: http' -H "X-Forwarded-Host: probe.localhost:$PORT" -H 'X-Forwarded-Uri: /' -H 'X-Forwarded-Method: GET' -H 'Accept: text/html' "http://127.0.0.1:$PORT/outpost.goauthentik.io/auth/traefik" || true)" ]; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || { echo "outpost-stale-groups: the outpost never loaded the provider" >&2; exit 2; }
AUTH_URL="http://auth.localhost:$PORT" APP_URL="http://probe.localhost:$PORT" AK_TOKEN="$TOKEN" node "$HERE/outpost-stale-groups.mjs"
