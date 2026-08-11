#!/bin/sh
set -e

# Run database migrations
# Note: AdonisJS uses PostgreSQL advisory locks by default to prevent concurrent
# migrations across multiple instances. Only one instance will acquire the lock and
# run migrations; others will wait. If you need to disable locks, use --disable-locks flag.
echo "Running database migrations..."
if node ace.js migration:run --force; then
    echo "Migrations completed successfully"
else
    echo "Migration failed with exit code $?"
    exit 1
fi

echo "Starting server..."
exec node server.js
