#!/bin/sh
set -eu

# Keep missing credentials an explicit startup error instead of allowing an
# insecure application fallback or an opaque module-initialization failure.
test -n "${DATABASE_URL:-}" || {
  echo "DATABASE_URL is required" >&2
  exit 1
}
test -n "${REDIS_URL:-}" || {
  echo "REDIS_URL is required" >&2
  exit 1
}
test -n "${SESSION_SECRET:-}" || {
  echo "SESSION_SECRET is required" >&2
  exit 1
}
test -n "${CLERK_PUBLISHABLE_KEY:-}" || {
  echo "CLERK_PUBLISHABLE_KEY is required" >&2
  exit 1
}
test -n "${CLERK_SECRET_KEY:-}" || {
  echo "CLERK_SECRET_KEY is required" >&2
  exit 1
}
test -n "${AI_INTEGRATIONS_OPENAI_API_KEY:-}" || {
  echo "AI_INTEGRATIONS_OPENAI_API_KEY is required" >&2
  exit 1
}
test -n "${AI_INTEGRATIONS_OPENAI_BASE_URL:-}" || {
  echo "AI_INTEGRATIONS_OPENAI_BASE_URL is required" >&2
  exit 1
}

exec node --enable-source-maps ./artifacts/api-server/dist/index.mjs