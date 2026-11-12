# agent-studio — Mastra Studio for staff (mastra build --studio: a Hono server that also serves
# Studio's page). Built from the repository root:
#   podman build -f apps/agent-studio/Dockerfile --ignorefile apps/agent-studio/Dockerfile.dockerignore \
#     --build-arg REGISTRY_HOST=… --build-arg REGISTRY_PROJECT_MIRROR=… -t <registry>/psi/agent-studio:<tag> .
# Base images come from the estate's Harbor mirror; there is no default registry.
ARG REGISTRY_HOST
ARG REGISTRY_PROJECT_MIRROR
FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@psi/agent-studio..."
# `mastra build` bundles src/mastra with the workspace packages it imports and installs the
# bundle's own production dependencies into .mastra/output (its node_modules), so the runtime
# image needs neither the workspace nor pnpm. --studio adds Studio's page under output/studio.
RUN pnpm --filter @psi/agent-studio build

FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine
ENV NODE_ENV=production PORT=4360 MASTRA_STUDIO_PATH=/app/studio MASTRA_TELEMETRY_DISABLED=1 \
    AGENT_STUDIO_DATA_DIR=/app/.data
WORKDIR /app
COPY --from=build --chown=1000:1000 /repo/apps/agent-studio/.mastra/output ./
# Studio's runs and traces (libSQL). In the cluster a volume mounts here.
RUN mkdir -p /app/.data && chown 1000:1000 /app/.data
USER 1000
EXPOSE 4360
CMD ["node", "index.mjs"]
