# DeployX end-to-end tests

The Playwright suite covers one authenticated, persisted lifecycle:

1. Sign in to a **Clerk development/test instance** with an ephemeral user
   created through the Clerk backend SDK.
2. Create a uniquely named project.
3. Add a synthetic environment variable and verify that its value stays masked.
4. Start a real BullMQ-backed simulated deployment.
5. Wait for the persisted success status and simulation logs.
6. Verify deployment history and queue a rollback.
7. Wait for the persisted rollback status and logs.
8. Delete only the environment variable and project created by that test, then
   delete the ephemeral Clerk user.

The test does not use a fake auth header, a test-only server bypass, or the
Clerk sign-in UI. `@clerk/testing/playwright` obtains Clerk's short-lived
testing token and performs a supported ticket sign-in against the configured
test instance. Never use a production Clerk key or a real person's email.

## Configuration

The application, API, Redis, and deployment worker must already be running.
The worker is required: the test intentionally waits for the persisted BullMQ
job to reach `success` and fails if it does not. For local runs, configure a
disposable `.env` (or export the variables in the shell) with values like the
following. Do not commit the file or print it:

```sh
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
DATABASE_URL=postgresql://deployx:<password>@127.0.0.1:5432/deployx
SESSION_SECRET=<random-local-value>
REDIS_URL=redis://127.0.0.1:6379
DEPLOYX_SIMULATED_FAILURE_STEP=success
E2E_BASE_URL=http://127.0.0.1:5173
```

The API also requires the existing OpenAI integration variables at startup:
`AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`.
Provide them through the local secret manager/environment; the E2E flow does
not call the AI assistant.

`playwright.config.ts` deliberately throws on missing configuration, rejects
production Clerk keys, and rejects a mismatched frontend publishable key.
There are no conditional skips for an unconfigured or unavailable stack.

## Run

Install the repository dependencies and browser binaries through the normal
repository setup, start the API and worker, and start the web artifact. Then:

```sh
pnpm test:e2e
```

For a different running web origin:

```sh
E2E_BASE_URL=https://your-test-origin.example pnpm test:e2e
```

`E2E_DEPLOYMENT_TIMEOUT_MS` may be increased for a busy CI runner (the default
is 90 seconds). Test traces and screenshots are retained only for a
failed test. Secrets and auth tokens are never logged or attached.

## CI safety

`.github/workflows/e2e.yml` is intentionally `workflow_dispatch` only and
requires the repository's protected `e2e` environment. It refuses to run from
a fork, keeps Clerk keys in GitHub Actions secrets, and does not run on
pull-request code. The CI stack uses disposable PostgreSQL/Redis services and
sets the deterministic simulation to `success`; it does not expose secret
values in command output or upload server logs.
