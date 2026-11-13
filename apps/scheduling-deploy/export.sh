#!/bin/sh
# The nightly logical export of the scheduling store: a Convex snapshot export (every table, plus the
# stored files) through the admin API, encrypted with age to the owner's PUBLIC key, written to
# /work for the upload container (gitops/services/scheduling-deploy/base/export-cronjob.yaml). The
# plain snapshot never leaves this container's /work volume (an emptyDir) and is removed here.
#
#   CONVEX_SELF_HOSTED_URL          the backend's in-cluster Service URL
#   CONVEX_SELF_HOSTED_ADMIN_KEY    the deployment's admin key (OpenBao, apps/scheduling/admin)
#   AGE_RECIPIENT                   the age public key (age1...) the export is encrypted to; the matching
#                                   identity is held offline by the owner, never in the cluster
#
# Output: /work/export.zip.age. The restore path is docs/runbooks/scheduling-restore.md.
set -eu

: "${CONVEX_SELF_HOSTED_URL:?MISSING REQUIRED SETTING: CONVEX_SELF_HOSTED_URL}"
: "${CONVEX_SELF_HOSTED_ADMIN_KEY:?MISSING REQUIRED SECRET: CONVEX_SELF_HOSTED_ADMIN_KEY}"
: "${AGE_RECIPIENT:?MISSING REQUIRED SECRET: AGE_RECIPIENT}"
case "$AGE_RECIPIENT" in
age1*) ;;
*) echo "INVALID SECRET: AGE_RECIPIENT must be an age public key (age1...)" >&2; exit 1 ;;
esac

convex=./node_modules/.bin/convex
plain=/work/export.zip

trap 'rm -f "$plain"' EXIT

"$convex" export --include-file-storage --path "$plain"
[ -s "$plain" ] || { echo "the export is empty" >&2; exit 1; }
age -r "$AGE_RECIPIENT" -o /work/export.zip.age "$plain"
[ -s /work/export.zip.age ] || { echo "the encrypted export is empty" >&2; exit 1; }
echo "exported and encrypted: $(wc -c </work/export.zip.age) bytes"
