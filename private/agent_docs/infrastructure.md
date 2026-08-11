# Infrastructure & Deployment

## Environments

| Environment | Railway Env Name | Purpose             |
| ----------- | ---------------- | ------------------- |
| Production  | `production`     | Live users          |
| Staging     | `dev`            | Pre-release testing |

## Service URLs

| Service     | Production                    | Staging               |
| ----------- | ----------------------------- | --------------------- |
| Frontend    | kanwas.ai (via Webflow proxy) | staging.kanwas.ai     |
| Backend API | api.kanwas.ai                 | staging-api.kanwas.ai |
| Yjs Server  | yjs.kanwas.ai                 | staging-yjs.kanwas.ai |

**Note:** Production frontend routes through Webflow for landing pages. App routes (`/login`, `/w/*`) serve the React app.

## Deployment Pipeline

```
Push to master ──► GitHub Actions ──► Build Docker image ──► Push to GHCR ──► railway redeploy ──► Staging
Manual dispatch  ──► GitHub Actions ──► Build Docker image ──► Push to GHCR ──► railway redeploy ──► Production
```

**Key:** Railway does NOT build from source. GitHub Actions builds Docker images, pushes to GitHub Container Registry (GHCR), then triggers `railway redeploy` which pulls the new image.

Image tags pushed by CI:

| Service    | Staging Tag | Production Tag           |
| ---------- | ----------- | ------------------------ |
| frontend   | `:staging`  | `:production`, `:latest` |
| backend    | `:latest`   | `:latest`                |
| yjs-server | `:staging`  | `:production`            |

**Important:** Railway services must be configured to pull the correct tag. In Railway dashboard → Service → Settings → Source Image:

- Staging frontend: `ghcr.io/9roads/kanwas/frontend:staging`
- Production frontend: `ghcr.io/9roads/kanwas/frontend:production`
- Yjs server staging/SEO: `ghcr.io/9roads/kanwas/yjs-server:staging`
- Yjs server production: `ghcr.io/9roads/kanwas/yjs-server:production`
- Backend: `ghcr.io/9roads/kanwas/backend:latest` (same image for both envs)

### Workflow Files

- `.github/workflows/deploy-backend.yml`
- `.github/workflows/deploy-frontend.yml`
- `.github/workflows/deploy-yjs-server.yml`

### Deploy to Production

1. Go to GitHub Actions
2. Select workflow (e.g., "Build and Deploy Backend")
3. Click "Run workflow"
4. Select `production` from dropdown
5. Run

## Railway Setup

### Token Scoping

Railway project tokens are scoped to a specific environment. We use:

- `RAILWAY_TOKEN` → production environment
- `RAILWAY_TOKEN_STAGING` → dev environment
- `RAILWAY_TOKEN_SEO` → seo environment

### Services (same names in both envs)

- `node-core` - Backend API (AdonisJS)
- `frontend` - React app (Vite)
- `yjs-server` - Realtime collaboration server
- `postgres` - PostgreSQL (separate instances per env)
- `redis` - Redis (separate instances per env)

### CLI Usage

```bash
# Check production
RAILWAY_TOKEN=$PROD_TOKEN railway status

# Check staging
RAILWAY_TOKEN=$STAGING_TOKEN railway status

# Redeploy staging backend
RAILWAY_TOKEN=$STAGING_TOKEN railway redeploy --service node-core --yes

# View/set variables
RAILWAY_TOKEN=$STAGING_TOKEN railway variables --service node-core --kv
RAILWAY_TOKEN=$STAGING_TOKEN railway variables --service node-core --set "KEY=value"
```

## Yjs Server Setup

Yjs server deploys to Railway from the `yjs-server` Docker image.

## GitHub Secrets

| Secret                  | Purpose                           |
| ----------------------- | --------------------------------- |
| `RAILWAY_TOKEN`         | Production Railway deploys        |
| `RAILWAY_TOKEN_STAGING` | Staging Railway deploys           |
| `RAILWAY_TOKEN_SEO`     | SEO Railway deploys               |
| `BACKEND_URL`           | Yjs server → Backend callback URL |
| `BACKEND_API_SECRET`    | Yjs server admin/callback auth    |

## Environment-Specific Config

### Backend (Railway env vars to update per environment)

- `YJS_SERVER_HOST` - yjs.kanwas.ai vs staging-yjs.kanwas.ai
- `GOOGLE_REDIRECT_URI` - OAuth callback URL
- `BACKEND_URL` - Self-reference URL

### Frontend

- `frontend/.env.production` - Production URLs
- `frontend/.env.staging` - Staging URLs

Vite uses `--mode` flag to select env file. GitHub Actions passes `VITE_MODE` build arg to Docker:

- Staging workflow: `--build-arg VITE_MODE=staging`
- Production workflow: `--build-arg VITE_MODE=production`

**Note:** Railway does NOT build - it only pulls pre-built images from GHCR. The build arg is handled by GitHub Actions.

## E2B Sandbox

E2B templates bundle `shared/` and `execenv/`. When fixing bugs in these packages:

1. Backend auto-deploys via Railway
2. **E2B template requires manual rebuild**: `e2b template build`

## Common Tasks

### Add new env var to staging

```bash
RAILWAY_TOKEN=$STAGING_TOKEN railway variables \
  --service node-core \
  --set "NEW_VAR=value" \
  --skip-deploys  # Optional: skip auto-redeploy
```

### Roll Cloudflare API token

1. Generate new token in Cloudflare dashboard
2. Update GitHub secret: `gh secret set CLOUDFLARE_API_TOKEN --body "new-token"`

### Debug staging backend

```bash
RAILWAY_TOKEN=$STAGING_TOKEN railway logs --service node-core
```

## DNS (Cloudflare)

Staging subdomains point to Railway services:

- `staging` → Railway frontend
- `staging-api` → Railway backend
- `staging-yjs` → Railway Yjs server

## OAuth (Google)

Both environments share the same Google OAuth app. Authorized redirect URIs:

- `https://kanwas.ai/auth/callback` (production)
- `https://staging.kanwas.ai/auth/callback` (staging)

After adding a redirect URI in Google Cloud Console, redeploy the backend to pick up the env var change.
