# Built from the repository root: docker build -f apps/notify-bridge/Dockerfile \
#   --build-arg REGISTRY_HOST=… --build-arg REGISTRY_PROJECT_MIRROR=… .
# Base images come from the estate's Harbor mirror; there is no default registry. One bundled file runs: @psi/notify's
# workflows and their messages are compiled in (its own build compiles the messages first).
ARG REGISTRY_HOST
ARG REGISTRY_PROJECT_MIRROR
FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@psi/notify-bridge..."
RUN pnpm --filter "@psi/notify-bridge^..." --if-present build
RUN pnpm --filter @psi/notify-bridge build

FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=1000:1000 /repo/apps/notify-bridge/dist/main.js ./main.js
USER 1000
EXPOSE 8080
CMD ["node", "main.js"]
