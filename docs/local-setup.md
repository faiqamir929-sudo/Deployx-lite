# Local setup

This project has two supported local modes:

- **Host development:** run the API and Vite frontend with Node, and use
  Docker Compose for PostgreSQL and Redis.
- **Container smoke environment:** run PostgreSQL, Redis, the API, the
  background worker, and the built frontend with Docker Compose.

Docker Desktop (or an equivalent Docker Engine + Compose installation) is
required for the container mode. On Windows, run the commands below from the
repository root in Command Prompt or PowerShell. The Compose stack has been
smoke-tested with the frontend and API health endpoints responding locally.

## Prerequisites

- Node.js 24 (Node 20.19+ also satisfies the project engine requirement)
- pnpm 10.26.1, enabled with Corepack
- PostgreSQL 16, or Docker Desktop for the Compose database
- Redis 7, or Docker Desktop for the Compose Redis service
- A development Clerk instance and OpenAI-compatible AI integration credentials

Enable the pinned package manager after installing Node:

```text
corepack enable
corepack prepare pnpm@10.26.1 --activate
```

## Configure environment

Copy `.env.example` to `.env` (use `Copy-Item .env.example .env` in
PowerShell). Generate two different values with the same cross-platform Node
command, then put one in `POSTGRES_PASSWORD` and one in `SESSION_SECRET`:

```text
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Replace the password placeholder in `DATABASE_URL` with the generated
`POSTGRES_PASSWORD`. Hex passwords are used intentionally so the URL does not
need percent-encoding.

Set `CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` to the same
`pk_test_...` development key. Set `CLERK_SECRET_KEY` to the matching server
secret. Keep `VITE_CLERK_PROXY_URL` empty for local development.

The API's AI integration reads **only** these names:

```text
AI_INTEGRATIONS_OPENAI_API_KEY=...
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
```

The `OPENAI_API_KEY` and `OPENAI_BASE_URL` names are not used by this
workspace. Never put a server secret in a `VITE_*` variable: Vite embeds
`VITE_*` values into the browser bundle.

## Host development

Install dependencies once:

```text
pnpm install --frozen-lockfile
```

Start PostgreSQL and Redis:

```text
docker compose up -d postgres redis
```

Apply the Drizzle schema:

```text
pnpm run db:push
```

Run the API integration suite against the current schema (this command never
pushes or changes the schema; the suite creates and cleans up test rows):

```text
pnpm test
```

Run the suite while only the PostgreSQL/Redis infrastructure is active. If a
separate development worker is already consuming the same Redis queue, use an
isolated Redis database for the test process (for example, set
`REDIS_URL=redis://127.0.0.1:6379/1`) so the development worker cannot take
test jobs.

Build the API bundle once, then use three terminals for the API, worker, and
frontend. The worker must stay running for queued deployments to advance. These
scripts load the repository `.env` file without shell-specific `export` syntax,
so the same commands work in PowerShell, Command Prompt, macOS, and Linux:

```text
pnpm --filter @workspace/api-server run build
pnpm run dev:api
pnpm --filter @workspace/api-server run worker
pnpm run dev:web
```

Open the Vite URL shown by the frontend (normally
`http://localhost:5173`). Vite proxies `/api` and `/docs` to
`http://localhost:8080` without rewriting the browser's `Host` header, so
credentialed requests remain same-origin.

## Docker Compose

After `.env` is complete, build and start all services:

```text
docker compose up --build
```

Compose waits for PostgreSQL and Redis, runs the non-destructive Drizzle
initial push in the one-shot `migrate` service, and only then marks the API and
worker eligible to start. The migration service deliberately does not use
Drizzle's `--force` option: schema changes that could delete data fail instead
of being applied automatically.

Open `http://localhost:5173`. The `web` service serves the Vite build and
proxies API/Clerk requests to the non-root `api` container while preserving the
public host and port. The API is also
available at `http://localhost:8080`; its health signal is `/api/healthz`. The
`worker` container is a separate non-root process and has no HTTP port. The API
and worker containers exit with explicit errors if their database or Redis
dependencies are missing instead of using insecure fallback values. The API
also requires its Clerk, session, and AI settings; the worker intentionally
does not receive those credentials. The frontend image build fails if its
public Clerk key is absent.

Stop services while retaining the database volume:

```text
docker compose down
```

Delete the local database volume only when intentionally resetting local data:

```text
docker compose down --volumes
```

The Compose ports bind to loopback by default. Change `WEB_PORT`, `API_PORT`,
`POSTGRES_PORT`, or `REDIS_PORT` in `.env` if a local port is already in use; do
not expose PostgreSQL or Redis publicly.

## Production topology requirement

The Compose stack is a local smoke environment, not a production deployment
policy. The API only records an outbox event; a separate worker must be
running continuously to reconcile the outbox and consume BullMQ jobs. Redis
must be persistent/managed and monitored, and PostgreSQL must use the
deployment's backup and migration policy. An autoscaled API service without
the worker and Redis will leave deployments in `queued` indefinitely.
