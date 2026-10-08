#!/bin/sh
set -eu

# Redis is an explicit production dependency for the worker. Do not silently
# fall back to a local endpoint in a container or hosted deployment.
test -n "${DATABASE_URL:-}" || {
  echo "DATABASE_URL is required" >&2
  exit 1
}
test -n "${REDIS_URL:-}" || {
  echo "REDIS_URL is required" >&2
  exit 1
}

exec node --enable-source-maps ./artifacts/api-server/dist/worker.mjs