# Use Node.js LTS version
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache git openssh-client && \
    corepack enable

FROM base AS build
COPY . /app
WORKDIR /app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
WORKDIR /app/shared
RUN pnpm run build
# No backend compile — backend runs from .ts source via ts-node-maintained
# hook (see backend/server.js, backend/ace.js). This keeps workspace deps
# that export .ts paths loadable at runtime.
#
# Strip per-package node_modules / build / tests dirs out of the source
# trees so the runner stage's COPY brings in clean source (the runner does
# its own `pnpm install`).
RUN rm -rf /app/backend/node_modules /app/backend/build /app/backend/tests /app/backend/logs

FROM base AS runner
WORKDIR /prod
COPY --from=build /app/package.json /prod/package.json
COPY --from=build /app/pnpm-lock.yaml /prod/pnpm-lock.yaml
COPY --from=build /app/pnpm-workspace.yaml /prod/pnpm-workspace.yaml
COPY --from=build /app/patches /prod/patches
COPY --from=build /app/backend /prod/backend
COPY --from=build /app/shared/package.json /prod/shared/package.json
COPY --from=build /app/shared/dist /prod/shared/dist
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
RUN chmod +x /prod/backend/start.sh

ENV NODE_ENV=production

# Expose port (most platforms override via the PORT env var)
EXPOSE 3333

# Set working directory to backend where start.sh and built files are located
WORKDIR /prod/backend

# Start with migrations
CMD ["sh", "./start.sh"]
