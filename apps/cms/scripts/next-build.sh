#!/bin/sh
# `next build` loads the Payload config, which parses the environment. Outside the container build
# (CI's `nx affected -t build`, a laptop without .env) the same placeholders as the Dockerfile's
# build stage give it a shape to check; a variable already set wins. Nothing here reaches a runtime.
set -eu
: "${PAYLOAD_SECRET:=build-stage-placeholder-not-a-secret-000}"
: "${DATABASE_URI:=postgresql://build:build@127.0.0.1:1/build}"
: "${SERVER_URL:=https://build.invalid}"
: "${S3_BUCKET:=build}" "${S3_REGION:=build}" "${S3_ENDPOINT:=https://build.invalid}"
: "${S3_ACCESS_KEY_ID:=build}" "${S3_SECRET_ACCESS_KEY:=build}"
: "${OIDC_ISSUER:=https://build.invalid/application/o/cms/}" "${OIDC_CLIENT_ID:=build}" "${OIDC_CLIENT_SECRET:=build}"
: "${BREAKGLASS_EMAIL:=build@build.invalid}" "${BREAKGLASS_PASSWORD:=build-stage-placeholder}"
: "${NEXT_TELEMETRY_DISABLED:=1}"
export PAYLOAD_SECRET DATABASE_URI SERVER_URL S3_BUCKET S3_REGION S3_ENDPOINT S3_ACCESS_KEY_ID \
	S3_SECRET_ACCESS_KEY OIDC_ISSUER OIDC_CLIENT_ID OIDC_CLIENT_SECRET BREAKGLASS_EMAIL \
	BREAKGLASS_PASSWORD NEXT_TELEMETRY_DISABLED
exec next build
