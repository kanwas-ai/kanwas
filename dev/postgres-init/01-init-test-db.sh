#!/bin/bash
set -e

# This script runs when the postgres container is first initialized
# It creates the test database needed for running backend tests

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create test database if it doesn't exist
    SELECT 'CREATE DATABASE kanwas_test'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'kanwas_test')\gexec

    -- Grant all privileges to the kanwas user
    GRANT ALL PRIVILEGES ON DATABASE kanwas_test TO kanwas;
EOSQL

echo "✓ Test database 'kanwas_test' created successfully"
