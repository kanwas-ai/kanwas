# Kanwas API

Backend API for Kanwas built with AdonisJS 6.

## Development

### Setup

Install dependencies

```bash
npm install
```

Copy `.env` file

```bash
cp .env.example .env
```

Run docker-compose

```bash
docker-compose up postgres redis
```

Run migrations:

```bash
node ace migration:run
```

Start development server:

```bash
node ace serve
```

Run tests:

```bash
node ace test
```

### API Documentation

Swagger UI is available at `http://localhost:3333/api` when the server is running.

### Type-Safe API Client (Tuyau)

This project uses [Tuyau](https://tuyau.julr.dev) to generate type-safe API clients for frontend consumption.

**Important:** After making changes to routes, controllers, or adding validators, you must regenerate the API types:

```bash
node ace tuyau:generate
```

## Organization + invite onboarding model

- Access is enforced by organization membership roles (`admin`, `member`), not workspace owners.
- New registration without invite creates a personal organization and an initial workspace.
- Login/register with `inviteToken` joins the invited organization and returns `workspaceId` for redirect.
- Google OAuth invite handoff uses server-stored one-time `state` (short TTL) and validates it on callback.
- Invite links are open-join, single-use tokens with a default 30-day TTL.

### New organization/invite endpoints

- `GET /workspaces/:id/organization` - get current workspace organization details.
- `PATCH /workspaces/:id/organization` - rename organization (admin only).
- `GET /workspaces/:id/invites` - list organization invites (admin only).
- `POST /workspaces/:id/invites` - create invite link (admin only).
- `POST /workspaces/:id/invites/:inviteId/revoke` - revoke invite (admin only).
- `POST /invites/accept` - accept invite token as authenticated user.
