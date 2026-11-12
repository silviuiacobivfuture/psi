#!/usr/bin/env bash
# Derive the Convex admin key of the scheduling deployment from INSTANCE_NAME + INSTANCE_SECRET,
# locally, and print ONLY the key on stdout. The backend verifies keys against those two values (it
# runs the same generate_admin_key.sh), so no kubectl exec into the cluster is needed. Each run prints
# a DIFFERENT string (the key carries a random nonce); every one of them is valid for the deployment.
#
# INPUT, never argv (argv is visible in `ps` and shell history). Either:
#   - the environment: INSTANCE_NAME and INSTANCE_SECRET already exported, or
#   - STDIN: two lines, INSTANCE_NAME=<value> and INSTANCE_SECRET=<value>, in either order.
#
# Typical use, straight into the secret store (nothing reaches the terminal or a file):
#   bao kv get -format=json secret/apps/scheduling/env \
#     | jq -r '.data.data | "INSTANCE_NAME=\(.INSTANCE_NAME)\nINSTANCE_SECRET=\(.INSTANCE_SECRET)"' \
#     | tools/scheduling/admin-key.sh \
#     | bao kv put secret/apps/scheduling/admin CONVEX_SELF_HOSTED_ADMIN_KEY=-
#
# OUTPUT: the key alone, with no trailing newline when stdout is not a terminal (so `KEY=-` stores it
# exactly). Progress and errors go to stderr and never contain the secret.
#
# It runs the pinned upstream image (the same linux/amd64 manifest apps/scheduling-backend is built
# FROM) with no network, a read-only root filesystem, no capabilities and a tmpfs for its scratch
# space. SCHEDULING_BACKEND_IMAGE overrides the image (e.g. the CI-built psi/scheduling-backend).
# Upstream's generate_key takes the secret as an argument INSIDE the container, for the instant it
# runs; the host-side docker command line carries only variable NAMES.
set -euo pipefail

IMAGE="${SCHEDULING_BACKEND_IMAGE:-ghcr.io/convex/convex-backend@sha256:edf5c02b395b17d58d0e494b401855da72bc01dda934e45552d6790fe430f368}"

if [ -z "${INSTANCE_NAME:-}" ] || [ -z "${INSTANCE_SECRET:-}" ]; then
	if [ -t 0 ]; then
		echo "give INSTANCE_NAME and INSTANCE_SECRET in the environment or as NAME=value lines on stdin (see the header)" >&2
		exit 2
	fi
	while IFS= read -r line || [ -n "$line" ]; do
		case "$line" in
		INSTANCE_NAME=*) INSTANCE_NAME="${line#INSTANCE_NAME=}" ;;
		INSTANCE_SECRET=*) INSTANCE_SECRET="${line#INSTANCE_SECRET=}" ;;
		esac
	done
fi

[ -n "${INSTANCE_NAME:-}" ] || { echo "MISSING REQUIRED SECRET: INSTANCE_NAME" >&2; exit 1; }
[ -n "${INSTANCE_SECRET:-}" ] || { echo "MISSING REQUIRED SECRET: INSTANCE_SECRET" >&2; exit 1; }
# The same rules as the backend's assert-secrets initContainer.
case "$INSTANCE_SECRET" in
*[!0-9a-f]*) echo "INVALID SECRET: INSTANCE_SECRET must be lowercase hex" >&2; exit 1 ;;
esac
[ "${#INSTANCE_SECRET}" -ge 32 ] || { echo "INVALID SECRET: INSTANCE_SECRET shorter than 32" >&2; exit 1; }
export INSTANCE_NAME INSTANCE_SECRET

err="$(mktemp)"
trap 'rm -f "$err"' EXIT

# Root inside the throwaway container: the image's scripts are mode 0744 root. -e NAME (no value)
# passes the variable from this process's environment, so the value is never on a command line.
if ! out="$(docker run --rm --platform linux/amd64 --network none --read-only --cap-drop ALL \
	--security-opt no-new-privileges --tmpfs /tmp \
	-e INSTANCE_NAME -e INSTANCE_SECRET -e DATA_DIR=/tmp/convex \
	--entrypoint ./generate_admin_key.sh "$IMAGE" 2>"$err")"; then
	echo "could not derive the admin key (docker run failed):" >&2
	tail -n 5 "$err" >&2
	exit 1
fi

# generate_admin_key.sh prints the key as its last line.
key="$(printf '%s\n' "$out" | sed '/^[[:space:]]*$/d' | tail -n 1)"
[ -n "$key" ] || { echo "the image printed no admin key" >&2; exit 1; }

if [ -t 1 ]; then printf '%s\n' "$key"; else printf '%s' "$key"; fi
