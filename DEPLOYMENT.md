# Frontend Deployment Guide

## Environment Variables

The frontend uses build-time environment variables that are baked into the static bundle during the Docker build. Environment-specific `.env` files are committed to the repository.

### Required Variables

- `VITE_API_URL` - Backend API URL
- `VITE_YJS_SERVER_URL` - Yjs server URL

### Environment Files

Environment variables are stored in committed `.env` files:

- `frontend/.env.production` - Production environment (used by default in builds)
- `frontend/.env.staging` - Staging environment
- `frontend/.env` - Local development (git-ignored)

Vite automatically loads `.env.production` during production builds (`pnpm run build`).

### Multiple Environments (Staging, Test, etc.)

To deploy to different environments, create corresponding `.env` files and update the build process:

1. **Create environment file:**

   ```bash
   # frontend/.env.staging
   VITE_API_URL=https://api-staging.your-domain.com
   VITE_YJS_SERVER_URL=staging-yjs.your-domain.com
   ```

2. **Update Dockerfile to accept build mode:**

   ```dockerfile
   ARG BUILD_MODE=production
   RUN cp .env.${BUILD_MODE} .env.production && pnpm run build
   ```

3. **Update workflow to pass build mode:**
   ```yaml
   build-args: |
     BUILD_MODE=staging  # or production
   ```

**Or** use separate Railway services:

- `frontend-production` - builds with `.env.production`
- `frontend-staging` - builds with `.env.staging`

### Local Development

For local development, use `.env` file (git-ignored):

```bash
cp frontend/.env.example frontend/.env
# Edit .env with your local values
```

### Testing builds locally

Test production build:

```bash
docker build -t kanwas-frontend:test -f frontend/Dockerfile .
```

The build will automatically use `frontend/.env.production`.

## Deployment Flow

1. Push to `master` → GitHub Actions workflow triggers
2. Build Docker image (uses committed `.env.production`)
3. Push image to GitHub Container Registry
4. Trigger Railway redeploy
5. Railway pulls latest image and deploys

## Updating Production Variables

To update production environment variables:

1. Edit `frontend/.env.production`
2. Commit and push changes
3. CI will automatically rebuild with new values
