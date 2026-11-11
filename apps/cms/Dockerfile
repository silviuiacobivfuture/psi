# cms — Payload 3 on Next.js, a standalone server. Built from the repository root:
#   podman build -f apps/cms/Dockerfile --ignorefile apps/cms/Dockerfile.dockerignore \
#     --build-arg REGISTRY_HOST=… --build-arg REGISTRY_PROJECT_MIRROR=… -t <registry>/psi/cms:<tag> .
# Base images come from the estate's Harbor mirror; there is no default registry.
ARG REGISTRY_HOST
ARG REGISTRY_PROJECT_MIRROR
FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@psi/cms..."
# `next build` loads the Payload config, which parses the environment: these placeholders exist
# only in this build stage, so the build has a shape to check. Nothing here reaches the runtime
# image, which reads the real values from its Secret (and refuses to start without them).
RUN cd apps/cms && \
    PAYLOAD_SECRET=build-stage-placeholder-not-a-secret-000 \
    DATABASE_URI=postgresql://build:build@127.0.0.1:1/build \
    SERVER_URL=https://build.invalid \
    S3_BUCKET=build S3_REGION=build S3_ENDPOINT=https://build.invalid \
    S3_ACCESS_KEY_ID=build S3_SECRET_ACCESS_KEY=build \
    OIDC_ISSUER=https://build.invalid/application/o/cms/ OIDC_CLIENT_ID=build OIDC_CLIENT_SECRET=build \
    BREAKGLASS_EMAIL=build@build.invalid BREAKGLASS_PASSWORD=build-stage-placeholder \
    NEXT_TELEMETRY_DISABLED=1 pnpm exec next build && \
    cp -r .next/static .next/standalone/apps/cms/.next/static

FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=1000:1000 /repo/apps/cms/.next/standalone ./
USER 1000
EXPOSE 8080
CMD ["node", "apps/cms/server.js"]
