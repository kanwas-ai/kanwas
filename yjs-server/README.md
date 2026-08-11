# Kanwas Yjs Server

Realtime Yjs server for Kanwas.

## Required environment variables

```bash
BACKEND_API_SECRET=secret23
BACKEND_URL=http://localhost:3333
YJS_SERVER_LOG_LEVEL=info
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
YJS_SERVER_SOCKET_PING_INTERVAL_MS=10000
YJS_SERVER_SOCKET_PING_TIMEOUT_MS=5000
YJS_SERVER_R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
YJS_SERVER_R2_BUCKET=kanwas-yjs-staging
YJS_SERVER_R2_ACCESS_KEY_ID=...
YJS_SERVER_R2_SECRET_ACCESS_KEY=...
```

For local-only development and tests you can use filesystem storage instead:

```bash
YJS_SERVER_STORAGE_DRIVER=fs
YJS_SERVER_STORE_DIR=.yjs-server-data
```

## Sentry

Set `SENTRY_DSN` to enable Sentry error reporting and Sentry Logs export.

- `SENTRY_DSN` - optional DSN for the Yjs server service
- `SENTRY_ENVIRONMENT` - optional environment override (defaults to `NODE_ENV` or `development`)

## Logging

- `YJS_SERVER_LOG_LEVEL` - optional log level override (falls back to `LOG_LEVEL`, defaults to `info`)
- Set `YJS_SERVER_LOG_LEVEL=debug` when you need extra troubleshooting detail during incident debugging
