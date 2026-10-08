# P1 implementation summary

This summary records the P1 changes in source terms. It deliberately separates
implemented wiring from simulated behavior and from verification that still
requires an external environment.

## Implemented

- Deployment creation writes the deployment row and PostgreSQL outbox event in
  one transaction.
- BullMQ queue wiring uses Redis and the deployment UUID as an idempotent job
  ID. The worker reconciles unpublished outbox rows after Redis interruptions.
- The API, web, and worker have separate Docker targets. API and worker runtime
  images run as the non-root `node` user; the web image uses the unprivileged
  nginx image.
- Docker Compose defines PostgreSQL, Redis with AOF enabled, a one-shot
  non-destructive schema migration, API, worker, and web services. Health
  checks gate migration and application startup.
- Root linting uses ESLint flat configuration over maintained source, with
  generated clients, build output, and the mockup artifact excluded.
- GitHub Actions configuration runs lint, typecheck, schema setup, integration
  tests with PostgreSQL and Redis services, the workspace build, and separate
  API/web/worker Docker builds.
- `.env.example` documents `REDIS_URL`, local Redis, and the production
  requirement to configure Redis explicitly.

## Simulated or intentionally limited

- The worker advances six fixed illustrative stages. It never clones a
  repository, installs dependencies from a repository, executes arbitrary
  build commands, creates an artifact, or promotes a release.
- Rollback creates a new simulated run; it does not restore a deployed artifact.
- Authentication is Clerk authentication and owner isolation, not server-side
  RBAC.
- Environment-variable encryption uses the current `SESSION_SECRET`-derived
  application key; managed key storage and rotation remain absent.

## Verification performed

- Workspace lint, typechecking, and builds passed.
- API/database/queue tests passed: 30 tests using PostgreSQL and Redis,
  including lost published-job recovery and retry exhaustion after unexpected
  processor errors.
- The persisted Playwright lifecycle passed with real Clerk test authentication:
  create a project, add an environment variable, submit a queued simulation,
  inspect status/logs/history, and rollback. The synthetic user and project
  were cleaned up.
- Local Redis and the separate worker run as managed development processes.

## Pending verification

- Run the hosted GitHub Actions workflow and retain its check results.
- Run Docker Compose on a machine with Docker Desktop or Docker Engine,
  including the migration, API, worker, web, Redis health, and AOF behavior.
- Validate deployment operations with an always-on worker and confirm stale
  outbox/stalled-job monitoring in the deployment environment.

## Production boundary

An autoscaled API process alone is not a complete deployment. The API can
durably record a queued job, but only a continuously running worker with
Redis can publish and process it. Production therefore requires PostgreSQL,
persistent/managed Redis, and a separately deployed and monitored worker.
The fixed worker is also not a safe arbitrary-code build runner; an isolated
ephemeral sandbox, resource limits, secret scoping, pinned revisions, and
artifact provenance are still required before real repository deployment.