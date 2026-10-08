# DeployX Lite reproducible demo guide

This is a manual run sheet, not a video. No video is claimed to exist in this
repository. It is designed to let another engineer reproduce the UI flow and
distinguish observed application behavior from simulated or synthetic data.

## Before starting

1. Read and follow [local setup](local-setup.md) for dependency installation,
   environment variables, PostgreSQL, Redis, and the commands to start the
   API, worker, and Vite frontend. That file is the authoritative command
   source.
2. Configure Clerk publishable/secret keys, a real `DATABASE_URL`, and
   `REDIS_URL`.
3. Use a long random `SESSION_SECRET`; the current API refuses to start
   without it, so do not invent or use a development fallback.
4. Configure the current AI integration names
   `AI_INTEGRATIONS_OPENAI_API_KEY` and
   `AI_INTEGRATIONS_OPENAI_BASE_URL` only if demonstrating AI. These are the
   names documented in the checked-in `.env.example`.
5. Keep this limitation visible during the demo: the deployment pipeline is a
   fixed worker simulation. It does not clone, install, test, build, or deploy
   a repository.

## Reproducible run sheet

### 1. Prove the service boundary (about 15 seconds)

With the API running, request:

```sh
curl -i http://localhost:8080/api/healthz
```

Expected result: HTTP `200` and a JSON object containing `"status":"ok"`.
This is a basic liveness response, not a dependency/readiness check.
Separately confirm that Redis is healthy and the worker process is running.

Open the frontend at the URL printed by the setup commands. Open
`/docs` on the API host to view the generated Swagger UI.

### 2. Authenticate (about 30 seconds)

1. Visit `/sign-up` and create a test Clerk account, or visit `/sign-in` for
   an existing test account.
2. Confirm that an unauthenticated browser sees the landing page and that
   authenticated navigation exposes Overview, Projects, and Settings.
3. Do not describe this as RBAC. The current implementation verifies a Clerk
   session; it does not implement a role/permission matrix.

Credentialed origin checks are implemented: same-origin requests and explicitly
configured origins are allowed, while other browser origins receive `403`.
The API does not reflect arbitrary caller-supplied origins. The source-level
origin regression check is included in the main verification checklist.

Ownership enforcement is implemented in source. The source-level regression
suite covers cross-user project/deployment/notification/AI isolation; repeat
the cross-user access check during the main verification run and record the
real result rather than inventing one.

### 3. Create a project (about 30 seconds)

1. Open **Projects** and choose the create-project action.
2. Use clearly synthetic demo values, for example:
   - Name: `Demo React Service`
   - Repository URL: `https://example.invalid/demo-react-service`
   - Branch: `main`
   - Framework: `React`
   - Environment: `staging`
3. Save and open the project detail page.
4. Confirm that the project appears through the authenticated API and that
   repository metadata is displayed.

The repository panel is metadata-shaped demo output. Current code does not
call GitHub, verify a remote repository, or fetch a commit.

### 4. Add and inspect an environment variable (about 30 seconds)

1. Select **Add variable**.
2. Use a disposable value, for example key `DEMO_TOKEN` and value
   `not-a-real-secret`.
3. Select `staging` and save.
4. Confirm that the API/UI shows a masked value and a version, not plaintext.
5. Edit the value and confirm the version increases.
6. Delete the variable when finished.

This demonstrates application-level AES-256-GCM encryption and response
masking. It does not demonstrate managed key storage, rotation, audit logging,
or production secret delivery. Never paste a real credential into a demo.

### 5. Run the simulated pipeline (about 15–30 seconds)

1. Press **Deploy now**.
2. Capture the returned display state as `queued`, then observe `running`.
3. Watch the six source-defined stages:
   `Clone repository`, `Install dependencies`, `Run tests`, `Build project`,
   `Deploy`, and `Health check`.
4. Observe progress/log updates and the terminal `success` or `failed` state.
5. Refresh the page and confirm the state is read from deployment history.

The API returns `202`, commits a PostgreSQL outbox event, and the separate
worker publishes and processes the BullMQ job. Each stage waits roughly one
second by default. A configured simulation failure can produce a failed run;
this is not a reproducible build failure. The displayed logs and failure
reasons are illustrative simulator output.

For a shell-level check after obtaining a project ID from the authenticated UI,
inspect the browser's same-origin API request or use an authenticated browser
session:

```text
POST /api/projects/{projectId}/deployments  -> 202, status queued/running
GET  /api/projects/{projectId}/deployments  -> persisted simulator history
GET  /api/deployments/{deploymentId}         -> status, steps, logs, progress
```

Do not run these mutating calls without the Clerk session and a disposable
database/project.

### 6. Demonstrate simulated rollback (about 15 seconds)

1. In deployment history, choose **Rollback** for a completed success or
   failure.
2. Confirm a new deployment record is created and labeled as a rollback.
3. Watch the new simulated run complete.

This is not artifact restoration. It creates another simulator record; no
production target is changed.

### 7. Demonstrate notifications (about 15 seconds)

After a simulated run completes, open the notification center. Confirm that a
success/failure notification exists and can be marked read. These are
database-backed in-app notifications generated by the simulator.

### 8. Optional AI advisory check (about 45 seconds)

Only perform this step when the server-side AI integration is configured:

1. Open the AI assistant.
2. Ask a bounded question such as:
   `Explain what a failed dependency-install step usually means.`
3. Observe streamed text, then reload the conversation and confirm the message
   is persisted.
4. Ask the model to execute a deployment and verify that it can only answer
   with advice; it has no deployment tool.

Do not paste credentials or confidential logs. Treat model output, repository
content, and deployment logs as untrusted. The current implementation enforces
message/context bounds, a 2,048-token completion ceiling, and an in-process
20-message-per-minute user limit, and returns a generic provider-unavailable
message. It does not claim prompt-injection protection, distributed rate
limiting, cost monitoring, provider retry/timeout guarantees, or structured
model-output validation. A model response is not evidence of a successful
build, test, release, or human authorship.

## Expected status checklist

| Observation | Correct label |
| --- | --- |
| Clerk sign-in and owner-scoped workspace routes | **Implemented** |
| Project/environment CRUD | **Implemented (owner scoped)** |
| Environment value is stored encrypted and returned masked | **Partially implemented** |
| Six stages update over time | **Simulated** |
| Deployment history and rollback row appear | **Simulated** |
| Notification appears after simulator completion | **Implemented (owner scoped)** |
| AI response streams and persists | **Partially implemented / advisory, with bounded input/context and in-process rate limiting** |
| Repository actually cloned and built | **Not implemented** |
| Redis/BullMQ worker observed | **Implemented queue wiring; runtime observation pending** |
| Isolated untrusted build observed | **Not implemented** |
| Real production deployment observed | **Not implemented** |

## Evidence and authorship rules

The first database request may seed a sample project/deployment. Seed names,
timestamps, commit strings, logs, and displayed authors are synthetic UI
fixtures. The repository metadata endpoint derives display fields and does not
verify a remote or import Git history. Do not screenshot or narrate these
records as proof of a real person, real commit, real deployment, or authorship.

Likewise, this guide is a reproducible procedure, not a test result. Record
actual command output separately if an evaluation requires it; do not replace
“observed locally” with an invented result.

## Cleanup

Delete the disposable project and environment variable through the UI or
reset the local database according to [local setup](local-setup.md). Do not
retain real credentials in a demo database. Revoke temporary Clerk/AI
credentials after the demonstration if they were created solely for this run.