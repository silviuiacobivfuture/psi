# clinic's image, built by CI (.github/workflows/apps.yml: -f apps/clinic/Dockerfile, context = repo root).
# The shared recipe for psi's Node apps is deploy/site.Dockerfile; this is it with the app named.
#   podman build -f deploy/site.Dockerfile --build-arg APP=clinic -t <registry>/psi/clinic:<tag> .
FROM docker.io/library/node:24-alpine AS build
ARG APP=clinic
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@psi/${APP}..."
RUN pnpm --filter "@psi/${APP}" build
RUN pnpm --config.node-linker=hoisted --filter "@psi/${APP}" deploy --prod --legacy /out
RUN cp -r "apps/${APP}/dist" /out/ && if [ -d "apps/${APP}/public" ]; then cp -r "apps/${APP}/public" /out/; fi

FROM docker.io/library/node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
