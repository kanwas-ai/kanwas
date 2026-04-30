FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /app
WORKDIR /app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
WORKDIR /app/shared
RUN pnpm run build
WORKDIR /app/yjs-server
RUN pnpm run build

FROM base AS runner
WORKDIR /prod
COPY --from=build /app/package.json /prod/package.json
COPY --from=build /app/pnpm-lock.yaml /prod/pnpm-lock.yaml
COPY --from=build /app/pnpm-workspace.yaml /prod/pnpm-workspace.yaml
COPY --from=build /app/patches /prod/patches
COPY --from=build /app/shared/package.json /prod/shared/package.json
COPY --from=build /app/shared/dist /prod/shared/dist
COPY --from=build /app/yjs-server/package.json /prod/yjs-server/package.json
COPY --from=build /app/yjs-server/dist /prod/yjs-server/dist
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile --ignore-scripts

ENV NODE_ENV=production
EXPOSE 1999
WORKDIR /prod/yjs-server
CMD ["node", "dist/index.js"]
