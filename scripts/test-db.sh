#!/usr/bin/env bash
# Runs the database tests against a throwaway local Postgres database.
#
#   PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh
#
# Creates a fresh database, loads a stand-in for Supabase's auth schema and
# roles, applies every migration in order, then runs supabase/tests/schema_test.sql.
set -euo pipefail

cd "$(dirname "$0")/.."
DB="${TEST_DB_NAME:-sec_gridiron_test}"

dropdb --if-exists "$DB"
createdb "$DB"

run() { psql -v ON_ERROR_STOP=1 -q -d "$DB" "$@"; }

run -f supabase/tests/local_supabase_stub.sql
for migration in supabase/migrations/*.sql; do
  echo "Applying $migration"
  run -f "$migration"
done
run -o /dev/null -f supabase/tests/schema_test.sql

dropdb "$DB"
