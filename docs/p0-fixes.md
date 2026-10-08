# P0 fixes: beginner walkthrough

This page explains the source changes made after the initial assessment. It is
written for a reviewer who is new to the codebase.

**Verification status (2026-09-12):** workspace typechecking and builds passed.
The final root `pnpm test` command passed all 26 database-backed API tests.
Authentication is mocked in that suite; it does not prove real Clerk login.
The dependency rescan found zero critical/high/moderate findings and one low
esbuild advisory, retained because of the logging build plugin's exact peer
dependency. Docker configuration was checked, but Docker was not run in this
environment. No demo video or GitHub upload is claimed.

## What the P0 review found

The first review found two different problems:

1. Some documentation described a different product (Next.js/NestJS/Prisma/
   Redis/BullMQ/JWT/RBAC) than the source that was actually checked in.
2. The application had authentication checks, but authentication alone does
   not answer the more important question: “Which signed-in user owns this
   row?”

The source is a React/Vite frontend with an Express API, Drizzle, PostgreSQL,
Clerk, and an in-process **simulated** pipeline. The documentation now uses
that stack and labels future worker isolation separately.

## Fix 1: give records an owner

### The problem in plain language

Clerk can tell the API who is signed in. A URL such as
`/api/projects/<id>` still contains an ID that a different signed-in user
could guess. A safe query must check both:

```text
record.id = requested ID
AND record.ownerId = current Clerk user ID
```

Checking only the session would be authentication, not ownership
authorization.

### What changed

The source now:

- gets the current Clerk user ID with `userIdFor(req)`;
- stores that ID as `ownerId` on newly created projects,
  conversations, and notifications;
- filters project lists and dashboard records by the current owner;
- checks project ownership before reading or changing environment variables;
- checks project ownership before reading, creating, or rolling back
  deployments;
- checks ownership before returning a deployment by its standalone ID;
- filters notifications and notification updates by owner;
- filters AI conversation reads, deletes, and messages by owner; and
- uses the owned project/conversation as the parent boundary for child rows
  that do not have a second owner column.

### Legacy rows

The owner columns are nullable to allow an existing database schema to be
upgraded without pretending that old rows have a known owner. A `NULL`
`ownerId` is **not** treated as “everyone owns it.” Every owner predicate
compares against the current non-null Clerk ID, so legacy null-owner rows are
inaccessible and cannot be claimed by the first user who requests them.

### What this does not mean

Owner isolation is not RBAC. The source still has no role table, permission
matrix, admin policy, or organization-level authorization rule. A signed-in
user can access only their own owner-scoped records, but the application does
not distinguish roles such as viewer, deployer, or administrator.

## Fix 2: remove the encryption-key fallback

### The problem in plain language

An encryption key fallback is dangerous: two installations that forget to
configure a secret could share a predictable key, and changing deployment
behavior could silently make secrets unsafe.

### What changed

The API now reads `SESSION_SECRET` and throws during startup when it is
missing. There is no development secret hidden in the production path. The
configured secret is still hashed to a 32-byte AES key; each value uses a new
random 12-byte IV, and the AES-GCM authentication tag is stored with the
ciphertext.

This fixes the unsafe fallback, but it does not add key rotation. A future
rotation design still needs versioned ciphertexts, a decrypt-old/re-encrypt
new migration, and a managed key service such as KMS, Key Vault, or Vault.
Changing `SESSION_SECRET` directly still makes existing ciphertext
undecryptable.

## Fix 3: reject untrusted credentialed origins

### The problem in plain language

Credentialed CORS is sensitive because browsers attach cookies to requests.
Reflecting any caller-supplied `Origin` while allowing credentials can let an
untrusted site make requests as the signed-in user.

### What changed

The Express app now:

- allows requests without an `Origin` header;
- allows a request whose origin matches the normalized request origin;
- allows explicitly configured origins from
  `CORS_ALLOWED_ORIGINS` or `ALLOWED_ORIGINS`; and
- returns `403 { "error": "Origin not allowed" }` for other origins before
  credentialed CORS headers are emitted.

The source test file contains checks for both an unconfigured origin and a
same-origin request. The final API test run passed.

## Fix 4: bound the AI assistant

### The problem in plain language

An AI endpoint accepts user-controlled text and calls a paid external model.
Without limits, one request can contain an oversized message or history, and
many requests can consume resources or money. Returning a provider's raw
exception can also disclose implementation details.

### What changed

The current AI route enforces:

| Guard | Current limit or behavior |
| --- | --- |
| Conversation title | 200 characters |
| New message | 12,000 characters |
| History count | 40 messages |
| History size | 60,000 characters |
| Model completion | 2,048 tokens |
| Request rate | 20 messages per user per 60 seconds per API process |
| Provider failure | Generic “temporarily unavailable” SSE error |
| Conversation ownership | Current Clerk owner must match the conversation owner |

The assistant remains advisory. It has no tool for shell execution, deployment,
rollback, or environment mutation.

### Remaining AI limitations

The rate bucket is an in-memory `Map`. It limits each API process separately;
it is not a distributed limiter for multiple replicas and is lost on restart.
There is no cost dashboard or provider budget, no explicit prompt-injection
classifier, no provider retry/timeout policy, and no structured
model-output validation. Repository content and logs remain untrusted input.

## Verification checklist

Use [docs/local-setup.md](local-setup.md) for setup and database commands.
Mark a box only after actually running the check and recording the result; do
not turn the placeholders into invented evidence.

- [x] Run workspace typechecking.
- [x] Run the API test command from `artifacts/api-server/package.json`.
- [x] Run the database-backed API suites with `DATABASE_URL` configured.
- [x] Confirm the ownership-isolation tests pass for project, deployment, and
      AI conversation access.
- [x] Exercise environment-variable and notification access with two test
      users and confirm user B receives no rows created by user A.
- [ ] Confirm a row with `owner_id IS NULL` is not listed or claimable.
- [ ] Confirm missing `SESSION_SECRET` prevents API startup.
- [x] Confirm an unconfigured `Origin` receives `403` and a same-origin
      request receives the expected CORS behavior.
- [ ] Confirm an oversized title/message is rejected, the 21st message in one
      minute is rejected within one process, and provider failures expose only
      the generic error.
- [ ] Record actual command output and dates in the owning test/evaluation
      notes; do not claim a result in this document before the run.

## Deliberately not claimed

These P0 documentation fixes do not claim any of the following:

- RBAC or organization-level roles;
- Redis, BullMQ, or a separate worker;
- isolated arbitrary-code execution;
- real repository cloning, building, artifact publication, or deployment;
- Docker runtime success before setup verification;
- a published GitHub change;
- a demo video; or
- real commit history, deployment evidence, or human authorship from seeded
  sample records.
