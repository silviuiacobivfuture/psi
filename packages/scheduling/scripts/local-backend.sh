#!/usr/bin/env bash
# The local, self-hosted Convex backend for @psi/scheduling (see ../README.md).
#   up      start psi-convex on 127.0.0.1:3210 (API) and 127.0.0.1:3211 (HTTP actions)
#   env     store the CLI's admin key under .data/convex/secrets and set the server key
#   app-env append CONVEX_URL and PSI_SCHEDULING_KEY to an app's .env (values never printed)
#   down    stop and remove the container (the data stays in <repo>/.data/convex)
# No secret is ever printed: they go to files with mode 600 under <repo>/.data/convex/secrets.
set -euo pipefail

IMAGE="ghcr.io/convex/convex-backend@sha256:e9c084e8bd6c1f249012c672193f0988c748824f55a24cdad45f6185a8462f9a"
# A session that must not touch the shared backend runs its own: PSI_CONVEX_NAME, PSI_CONVEX_PORT,
# PSI_CONVEX_SITE_PORT and PSI_CONVEX_DATA (its db and secrets). The defaults are the shared one.
NAME="${PSI_CONVEX_NAME:-psi-convex}"
PORT="${PSI_CONVEX_PORT:-3210}"
SITE_PORT="${PSI_CONVEX_SITE_PORT:-3211}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$PKG/../.." && pwd)"
DATA="${PSI_CONVEX_DATA:-$ROOT/.data/convex}"
SECRETS="$DATA/secrets"
URL="http://127.0.0.1:$PORT"

secret() {
	local file="$SECRETS/$1"
	if [ ! -s "$file" ]; then
		(umask 077 && openssl rand -hex 32 >"$file")
	fi
	cat "$file"
}

up() {
	mkdir -p "$DATA/db" "$SECRETS"
	chmod 700 "$SECRETS"
	if docker container inspect "$NAME" >/dev/null 2>&1; then
		docker start "$NAME" >/dev/null
	else
		INSTANCE_SECRET="$(secret instance-secret)" docker run -d --name "$NAME" \
			--restart unless-stopped \
			-p "127.0.0.1:$PORT:3210" -p "127.0.0.1:$SITE_PORT:3211" \
			-v "$DATA/db:/convex/data" \
			-e INSTANCE_NAME="${PSI_CONVEX_INSTANCE:-psi-local}" -e INSTANCE_SECRET \
			-e CONVEX_CLOUD_ORIGIN="$URL" -e CONVEX_SITE_ORIGIN="http://127.0.0.1:$SITE_PORT" \
			-e DISABLE_BEACON=true -e REDACT_LOGS_TO_CLIENT=true \
			"$IMAGE" >/dev/null
	fi
	for _ in $(seq 1 60); do
		if curl -sf "$URL/version" >/dev/null; then
			echo "psi-convex is up on $URL"
			return 0
		fi
		sleep 1
	done
	echo "psi-convex did not answer on $URL/version" >&2
	return 1
}

env_file() {
	local admin
	admin="$(docker exec "$NAME" ./generate_admin_key.sh 2>/dev/null | tail -n 1)"
	(umask 077 && printf "%s" "$admin" >"$SECRETS/admin-key")
	rm -f "$PKG/.env.local"
	secret server-key >/dev/null
	tr -d '\n' <"$SECRETS/server-key" | "$HERE/convex.sh" env set --force PSI_SCHEDULING_KEY >/dev/null
	echo "admin key in $SECRETS/admin-key; PSI_SCHEDULING_KEY set in the deployment"
	echo "the app's key is in $SECRETS/server-key (append it to an app's .env with: $0 app-env <file>)"
}

# Appends CONVEX_URL and PSI_SCHEDULING_KEY to an app's .env, unless it already has them.
app_env() {
	local file="$1"
	touch "$file"
	chmod 600 "$file"
	grep -q '^CONVEX_URL=' "$file" || printf "CONVEX_URL=%s\n" "$URL" >>"$file"
	grep -q '^PSI_SCHEDULING_KEY=' "$file" || printf "PSI_SCHEDULING_KEY=%s\n" "$(secret server-key)" >>"$file"
	echo "$file has CONVEX_URL and PSI_SCHEDULING_KEY"
}

down() {
	docker rm -f "$NAME" >/dev/null 2>&1 || true
	echo "psi-convex removed; data kept in $DATA"
}

case "${1:-}" in
up) up ;;
env) env_file ;;
app-env) app_env "${2:?usage: $0 app-env <path to .env>}" ;;
down) down ;;
*)
	echo "usage: $0 up|env|app-env <file>|down" >&2
	exit 2
	;;
esac
