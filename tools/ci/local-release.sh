#!/usr/bin/env bash
# Builds dev's images on this machine and deploys them to DEV, exactly as .github/workflows/apps.yml does on the CI
# runner: same plan (scripts/affected-apps.mjs --since-deployed dev), same Dockerfiles and build args, same Harbor
# (REGISTRY_HOST / REGISTRY_PROJECT_APPS from estate/identity.yaml), same tag (the commit's 7 characters), same
# tag-bump commits ("ci(<app>): deploy <tag> to dev [skip ci]"), pushed on top of origin/dev. For when the single CI
# runner is the bottleneck; the tests stay CI's (estate-gates).
#
#   BAO_TOKEN=... tools/ci/local-release.sh [<sha>]        (default: origin/dev)
#
# DEV ONLY. Production is never built here: tools/scheduling/promote.sh, through the promote workflow, pins tags that
# already exist (built for dev), and this script refuses anything but dev.
#
# Credentials: the push robot CI uses (OpenBao platform/harbor/ci-robot, fields username and password), read with
# BAO_TOKEN at BAO_ADDR (default http://127.0.0.1:18200, a port-forward to the estate's OpenBao). The token goes in a
# header file, never on argv; the robot's password goes to `docker login --password-stdin` and the bundle pull through
# the environment of one process; the docker login lives in a private DOCKER_CONFIG removed on exit. Nothing secret is
# printed.
#
# Environment: LOCAL_RELEASE_JOBS (parallel builds, default 4), LOCAL_RELEASE_CACHE_TO (0: do not write the registry
# build cache), LOCAL_RELEASE_ONLY (space-separated apps: build these of the plan only), LOCAL_RELEASE_DRY_RUN (1: plan
# and print, build nothing), BAO_ROBOT_PATH (default platform/harbor/ci-robot).
set -euo pipefail

ORIGIN_REPO="$(git rev-parse --show-toplevel)"
BAO_ADDR="${BAO_ADDR:-http://127.0.0.1:18200}"
BAO_ROBOT_PATH="${BAO_ROBOT_PATH:-platform/harbor/ci-robot}"
JOBS="${LOCAL_RELEASE_JOBS:-4}"
ENV_BRANCH=dev

fail() { echo "local-release: $*" >&2; exit 1; }
[ -n "${BAO_TOKEN:-}" ] || fail "BAO_TOKEN is not set (the OpenBao token that reads $BAO_ROBOT_PATH)"
for tool in docker git jq curl node; do command -v "$tool" > /dev/null || fail "$tool is not installed"; done
docker buildx version > /dev/null 2>&1 || fail "docker buildx is not available"
[ -x "$(git rev-parse --show-toplevel)/node_modules/.bin/biome" ] \
	|| fail "run it from an installed checkout (pnpm install): the tag-bump commits run the repository's hooks"

git -C "$ORIGIN_REPO" fetch -q origin "$ENV_BRANCH"
SHA="$(git -C "$ORIGIN_REPO" rev-parse --verify "${1:-origin/$ENV_BRANCH}^{commit}")"
git -C "$ORIGIN_REPO" merge-base --is-ancestor "$SHA" "origin/$ENV_BRANCH" \
	|| fail "$SHA is not on origin/$ENV_BRANCH: only what dev has is built here"
TAG="${SHA::7}"

PRIV="$(mktemp -d "${TMPDIR:-/tmp}/local-release.XXXXXX")"
chmod 700 "$PRIV"
WT="$PRIV/src"
cleanup() {
	# The installed bundle is read-only by design (estate/lib/read-only.mjs): writable again, so it can go.
	chmod -R u+w "$PRIV" 2> /dev/null || true
	git -C "$ORIGIN_REPO" worktree remove --force "$WT" > /dev/null 2>&1 || true
	git -C "$ORIGIN_REPO" worktree remove --force "$PRIV/bump" > /dev/null 2>&1 || true
	rm -rf "$PRIV"
}
trap cleanup EXIT
git -C "$ORIGIN_REPO" worktree add -q --detach "$WT" "$SHA"
cd "$WT"

# The estate's registry, from its identity (as apps.yml reads it).
for key in REGISTRY_HOST REGISTRY_PROJECT_APPS REGISTRY_PROJECT_MIRROR; do
	value="$(sed -n "s/^${key}:[[:space:]]*\([^[:space:]#]*\).*/\1/p" estate/identity.yaml)"
	[ -n "$value" ] || fail "MISSING REQUIRED ESTATE VALUE: $key"
	printf -v "$key" '%s' "$value"
done

# The plan: every app whose image on dev is behind this commit, retired apps left out.
plan="$(node scripts/affected-apps.mjs --since-deployed "$ENV_BRANCH")"
apps=()
for a in $plan; do
	[ -f "apps/$a/DEPRECATED.md" ] && continue
	if [ -n "${LOCAL_RELEASE_ONLY:-}" ] && [[ " $LOCAL_RELEASE_ONLY " != *" $a "* ]]; then continue; fi
	[ -f "gitops/services/$a/overlays/$ENV_BRANCH/kustomization.yaml" ] || fail "$a has no overlay for $ENV_BRANCH"
	apps+=("$a")
done
echo "local-release: $SHA ($TAG) on $ENV_BRANCH: ${apps[*]:-nothing to build}"
[ "${#apps[@]}" -gt 0 ] || exit 0
[ "${LOCAL_RELEASE_DRY_RUN:-0}" = 1 ] && exit 0

# The push robot, into a private docker config (login) and one process's environment (the bundle pull).
printf 'X-Vault-Token: %s\n' "$BAO_TOKEN" > "$PRIV/bao.h"
chmod 600 "$PRIV/bao.h"
curl -sf -m 20 -H @"$PRIV/bao.h" "$BAO_ADDR/v1/secret/data/$BAO_ROBOT_PATH" > "$PRIV/robot.json" \
	|| fail "could not read $BAO_ROBOT_PATH from OpenBao at $BAO_ADDR"
chmod 600 "$PRIV/robot.json"
rm -f "$PRIV/bao.h"
ROBOT_USER="$(jq -er '.data.data.username' "$PRIV/robot.json")" || fail "$BAO_ROBOT_PATH has no username"
jq -e '.data.data.password | strings | length > 0' "$PRIV/robot.json" > /dev/null || fail "$BAO_ROBOT_PATH has no password"
# The daemon this machine's docker talks to now (its current context, e.g. Docker Desktop's socket), kept before the
# private config below hides the contexts.
if [ -z "${DOCKER_HOST:-}" ]; then
	DOCKER_HOST="$(docker context inspect --format '{{.Endpoints.docker.Host}}')" || fail "no docker context"
	export DOCKER_HOST
fi
export DOCKER_CONFIG="$PRIV/docker"
mkdir -p "$DOCKER_CONFIG" "${HOME}/.docker/buildx"
ln -s "${HOME}/.docker/buildx" "$DOCKER_CONFIG/buildx" # the builder (and its local cache) outlives this run
jq -r '.data.data.password' "$PRIV/robot.json" \
	| docker login "$REGISTRY_HOST" -u "$ROBOT_USER" --password-stdin > /dev/null 2>&1 \
	|| fail "docker login to $REGISTRY_HOST refused"

# The locked SEB bundle into the build context, as .github/actions/seb-bundle does (the image installs from it).
SEB_BUNDLE_PULL_USER="$ROBOT_USER" SEB_BUNDLE_PULL_PASSWORD="$(jq -r '.data.data.password' "$PRIV/robot.json")" \
	node estate/seb-bundle-install.mjs --repo "$WT" > "$PRIV/bundle.log" 2>&1 \
	|| { tail -5 "$PRIV/bundle.log" >&2; fail "SEB bundle not installed"; }
rm -f "$PRIV/robot.json"

BUILDER=psi-local-release
docker buildx inspect "$BUILDER" > /dev/null 2>&1 || docker buildx create --name "$BUILDER" --driver docker-container > /dev/null

LOGS="${LOCAL_RELEASE_LOGS:-${XDG_STATE_HOME:-$HOME/.local/state}/psi-local-release/$TAG}"
mkdir -p "$LOGS"
build() {
	local app="$1" img="$REGISTRY_HOST/$REGISTRY_PROJECT_APPS/$1"
	if docker buildx imagetools inspect "$img:$TAG" > /dev/null 2>&1; then
		echo "exists $app $img:$TAG"
		return 0
	fi
	local cache_to=(--cache-to "type=registry,ref=$img:buildcache,mode=max")
	[ "${LOCAL_RELEASE_CACHE_TO:-1}" = 0 ] && cache_to=()
	if docker buildx build --builder "$BUILDER" -f "apps/$app/Dockerfile" \
		--build-arg REGISTRY_HOST="$REGISTRY_HOST" --build-arg REGISTRY_PROJECT_MIRROR="$REGISTRY_PROJECT_MIRROR" \
		--cache-from "type=registry,ref=$img:buildcache" "${cache_to[@]}" \
		-t "$img:$TAG" --push . > "$LOGS/$app.log" 2>&1 \
		&& docker buildx imagetools inspect "$img:$TAG" > /dev/null 2>&1; then
		echo "pushed $app $img:$TAG"
	else
		echo "FAILED $app (log: $LOGS/$app.log)"
		return 1
	fi
}

# Parallel builds, at most $JOBS at once; every result kept.
: > "$PRIV/results"
running=0
for app in "${apps[@]}"; do
	( build "$app" >> "$PRIV/results" ) &
	running=$((running + 1))
	if [ "$running" -ge "$JOBS" ]; then wait -n || true; running=$((running - 1)); fi
done
wait || true
cat "$PRIV/results"
built=()
for app in "${apps[@]}"; do
	grep -qE "^(pushed|exists) $app " "$PRIV/results" && built+=("$app")
done
[ "${#built[@]}" -eq "${#apps[@]}" ] || fail "not every image was pushed: no tag is moved (fix and run again)"

# The tag bumps, as CI makes them: one commit per app, on top of origin/dev, retried if dev moves meanwhile.
for attempt in 1 2 3; do
	git -C "$ORIGIN_REPO" fetch -q origin "$ENV_BRANCH"
	git -C "$ORIGIN_REPO" worktree remove --force "$PRIV/bump" > /dev/null 2>&1 || true
	git -C "$ORIGIN_REPO" worktree add -q --detach "$PRIV/bump" "origin/$ENV_BRANCH"
	# The repository's commit hooks run on these commits as on any (Biome needs the root node_modules).
	ln -s "$ORIGIN_REPO/node_modules" "$PRIV/bump/node_modules"
	moved=0
	for app in "${built[@]}"; do
		overlay="gitops/services/$app/overlays/$ENV_BRANCH/kustomization.yaml"
		sed -i "s/^\(\s*newTag:\s*\).*/\1\"$TAG\"/" "$PRIV/bump/$overlay"
		git -C "$PRIV/bump" add "$overlay"
		if git -C "$PRIV/bump" diff --cached --quiet; then echo "$app already at $TAG"; continue; fi
		git -C "$PRIV/bump" commit -q -m "ci($app): deploy $TAG to $ENV_BRANCH [skip ci] [PATCH]"
		moved=$((moved + 1))
	done
	[ "$moved" -gt 0 ] || { echo "local-release: every tag already at $TAG"; exit 0; }
	head="$(git -C "$PRIV/bump" rev-parse HEAD)"
	if git -C "$ORIGIN_REPO" push -q origin "$head:refs/heads/$ENV_BRANCH"; then
		echo "local-release: $ENV_BRANCH at $head deploys $TAG for ${built[*]}"
		exit 0
	fi
	sleep 5
done
fail "could not push the tag bumps after 3 attempts"
