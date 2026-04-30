# Use Node.js LTS version
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
ARG VITE_MODE=production
COPY . /app
WORKDIR /app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install
WORKDIR /app/shared
RUN pnpm run build
WORKDIR /app/frontend
RUN pnpm exec vite build --mode $VITE_MODE && cp public/favicon.png dist/assets/

# Production stage - serve with nginx
FROM nginx:alpine AS runner
ARG API_HOST=api.kanwas.ai

# Copy built static files
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration for SPA + admin proxy
RUN echo "server { \
    listen 80; \
    resolver 1.1.1.1 valid=30s; \
    set \$backend https://${API_HOST}; \
    location = / { \
        return 302 /app/; \
    } \
    location = /app { \
        return 301 /app/; \
    } \
    location /app/ { \
        alias /usr/share/nginx/html/; \
        try_files \$uri \$uri/ /app/index.html; \
    } \
}" > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
