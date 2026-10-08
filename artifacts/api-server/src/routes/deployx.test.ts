/**
 * DeployX API integration tests
 *
 * Setup and run with:
 * pnpm --filter @workspace/db push && pnpm --filter @workspace/api-server test
 *
 * Uses supertest against the Express app in-process.
 * Clerk auth middleware is bypassed in tests (no CLERK_SECRET_KEY needed for unit scope).
 * DATABASE_URL is required; the suite fails explicitly when absent.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { desc, eq, inArray } from "drizzle-orm";

const authState = vi.hoisted(() => ({
  userId: "deployx-test-default" as string | null,
}));
const proxyState = vi.hoisted(() => ({ calls: 0 }));
const rawProxyState = vi.hoisted(() => ({
  body: undefined as string | undefined,
}));

const TEST_USER_IDS = [
  "deployx-test-default",
  "deployx-test-owner-a",
  "deployx-test-owner-b",
  // Remove identifiers used by the original regression suite as well.
  "test-user-id",
  "owner-a",
  "owner-b",
];

// Stub @clerk/express so requireAuth passes without a real session
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: () => ({ userId: authState.userId }),
}));

// Also stub the proxy middleware that needs HTTP_PROXY setup
vi.mock("../middlewares/clerkProxyMiddleware", () => ({
  CLERK_PROXY_PATH: "/api/__clerk",
  clerkProxyMiddleware:
    () => (_req: unknown, _res: unknown, next: () => void) => {
      proxyState.calls += 1;
      const req = _req as {
        method?: string;
        on: (event: "data" | "end", listener: (chunk?: Buffer) => void) => void;
      };
      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => {
          if (chunk) chunks.push(Buffer.from(chunk));
        });
        req.on("end", () => {
          rawProxyState.body = Buffer.concat(chunks).toString("utf8");
          next();
        });
        return;
      }
      next();
    },
  getClerkProxyHost: () => undefined,
}));

if (!process.env.DATABASE_URL) {
  throw new Error(
    "API integration tests require DATABASE_URL; run the database setup command before running this suite.",
  );
}

// Import after mocks are set up and only after the explicit database check.
const {
  db,
  conversations,
  deploymentOutboxTable,
  deploymentsTable,
  environmentVariablesTable,
  messages,
  notificationsTable,
  projectsTable,
} = await import("@workspace/db");
process.env.SESSION_SECRET ??= "test-session-secret";
process.env.DEPLOYX_SIMULATED_FAILURE_STEP = "success";
const { default: app } = await import("../app");
const { decrypt, encrypt } = await import("./deployx");
const { pipelineSteps, startDeploymentWorker } = await import(
  "../queue/deploymentWorker"
);

const trackedDeploymentIds: string[] = [];
const workerHandle = startDeploymentWorker({
  concurrency: 1,
  stepDelayMs: 0,
  reconcileIntervalMs: 50,
  recoveryGraceMs: 25,
});

async function cleanupTestRecords(): Promise<void> {
  for (const ownerId of TEST_USER_IDS) {
    const projects = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.ownerId, ownerId));
    const projectIds = projects.map((project) => project.id);
    if (projectIds.length) {
      await db
        .delete(environmentVariablesTable)
        .where(inArray(environmentVariablesTable.projectId, projectIds));
      await db
        .delete(deploymentOutboxTable)
        .where(
          inArray(
            deploymentOutboxTable.deploymentId,
            (
              await db
                .select({ id: deploymentsTable.id })
                .from(deploymentsTable)
                .where(inArray(deploymentsTable.projectId, projectIds))
            ).map((deployment) => deployment.id),
          ),
        );
      await db
        .delete(deploymentsTable)
        .where(inArray(deploymentsTable.projectId, projectIds));
      await db
        .delete(notificationsTable)
        .where(inArray(notificationsTable.projectId, projectIds));
      await db
        .delete(projectsTable)
        .where(inArray(projectsTable.id, projectIds));
    }

    const ownedConversations = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.ownerId, ownerId));
    const conversationIds = ownedConversations.map(
      (conversation) => conversation.id,
    );
    if (conversationIds.length) {
      await db
        .delete(messages)
        .where(inArray(messages.conversationId, conversationIds));
      await db
        .delete(conversations)
        .where(inArray(conversations.id, conversationIds));
    }
    await db
      .delete(notificationsTable)
      .where(eq(notificationsTable.ownerId, ownerId));
  }
}

async function waitForTrackedDeployments(): Promise<void> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline && trackedDeploymentIds.length) {
    const rows = await db
      .select({ id: deploymentsTable.id, status: deploymentsTable.status })
      .from(deploymentsTable)
      .where(inArray(deploymentsTable.id, trackedDeploymentIds));
    if (
      rows.every((row) => row.status === "success" || row.status === "failed")
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function waitForDeployment(
  deploymentId: string,
  timeoutMs = 12_000,
): Promise<typeof deploymentsTable.$inferSelect> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [deployment] = await db
      .select()
      .from(deploymentsTable)
      .where(eq(deploymentsTable.id, deploymentId));
    if (
      deployment &&
      (deployment.status === "success" || deployment.status === "failed")
    ) {
      return deployment;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Deployment ${deploymentId} did not reach a terminal state`);
}

beforeAll(async () => {
  await workerHandle.worker.waitUntilReady();
  await cleanupTestRecords();
  await workerHandle.reconcile();
});

afterAll(async () => {
  await waitForTrackedDeployments();
  await workerHandle.stop();
  await cleanupTestRecords();
  authState.userId = "deployx-test-default";
});

describe("GET /api/healthz", () => {
  it("returns 200 OK", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });
});

describe("GET /api/dashboard", () => {
  it("returns dashboard shape", async () => {
    const res = await request(app).get("/api/dashboard");
    expect([200, 304]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty("projects");
      expect(res.body).toHaveProperty("deployments");
      expect(res.body).toHaveProperty("successRate");
      expect(res.body).toHaveProperty("deployTrend");
    }
  });
});

describe("Projects CRUD", () => {
  let projectId: string;

  it("GET /api/projects — lists projects (array)", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/projects — creates a project", async () => {
    const res = await request(app)
      .post("/api/projects")
      .send({
        name: "Test Project",
        repositoryUrl: "https://github.com/test/test-project",
        branch: "main",
        framework: "React",
        environment: "staging",
        tags: ["test"],
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.name).toBe("Test Project");
    projectId = res.body.id;
  });

  it("PATCH /api/projects/:id — updates a project", async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}`)
      .send({ name: "Updated Test Project" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Test Project");
  });

  it("GET /api/projects/:id/repository — returns repo metadata", async () => {
    const res = await request(app).get(`/api/projects/${projectId}/repository`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("name");
    expect(res.body).toHaveProperty("defaultBranch");
  });

  it("POST /api/projects/:id/duplicate — duplicates a project", async () => {
    const res = await request(app).post(`/api/projects/${projectId}/duplicate`);
    expect(res.status).toBe(201);
    expect(res.body.name).toMatch(/copy/i);
    // clean up duplicate
    await request(app).delete(`/api/projects/${res.body.id}`);
  });

  it("DELETE /api/projects/:id — deletes the project", async () => {
    const res = await request(app).delete(`/api/projects/${projectId}`);
    expect(res.status).toBe(204);
  });
});

describe("Environment Variables (/environments)", () => {
  let projectId: string;
  let variableId: string;

  beforeAll(async () => {
    const res = await request(app).post("/api/projects").send({
      name: "Env Var Test Project",
      repositoryUrl: "https://github.com/test/env-test",
      branch: "main",
      framework: "Node.js",
      environment: "development",
    });
    projectId = res.body.id;
  });

  it("POST /api/projects/:id/environments — creates an env var", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/environments`)
      .send({
        key: "TEST_SECRET",
        value: "super-secret-value",
        environment: "development",
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.key).toBe("TEST_SECRET");
    // Value must be masked, never plaintext
    expect(res.body.maskedValue).not.toBe("super-secret-value");
    variableId = res.body.id;
  });

  it("GET /api/projects/:id/environments — lists masked values", async () => {
    const res = await request(app).get(
      `/api/projects/${projectId}/environments`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const variable = res.body.find((v: { id: string }) => v.id === variableId);
    expect(variable).toBeDefined();
    expect(variable.maskedValue).not.toBe("super-secret-value");
  });

  it("PATCH /api/projects/:id/environments/:variableId — bumps version", async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}/environments/${variableId}`)
      .send({ value: "new-value" });
    expect(res.status).toBe(200);
    expect(res.body.version).toBeGreaterThan(1);
  });

  it("DELETE /api/projects/:id/environments/:variableId — removes the variable", async () => {
    const res = await request(app).delete(
      `/api/projects/${projectId}/environments/${variableId}`,
    );
    expect(res.status).toBe(204);
  });
});

describe("Deployments", () => {
  let projectId: string;
  let deploymentId: string;

  beforeAll(async () => {
    const res = await request(app).post("/api/projects").send({
      name: "Deployment Test Project",
      repositoryUrl: "https://github.com/test/deploy-test",
      branch: "main",
      framework: "Express",
      environment: "production",
    });
    projectId = res.body.id;
  });

  it("POST /api/projects/:id/deployments — queues a deployment", async () => {
    const res = await request(app).post(
      `/api/projects/${projectId}/deployments`,
    );
    expect([200, 201, 202]).toContain(res.status);
    expect(res.body).toHaveProperty("id");
    expect(["queued", "running"]).toContain(res.body.status);
    deploymentId = res.body.id;
    trackedDeploymentIds.push(deploymentId);
  });

  it("GET /api/projects/:id/deployments — lists deployments", async () => {
    const res = await request(app).get(
      `/api/projects/${projectId}/deployments`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("GET /api/deployments/:deploymentId — returns deployment status", async () => {
    const res = await request(app).get(`/api/deployments/${deploymentId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("progress");
    expect(res.body).toHaveProperty("steps");
    expect(res.body).toMatchObject({
      jobId: deploymentId,
      attempt: expect.any(Number),
      maxAttempts: 3,
    });
  });

  it("allocates sequential numbers and returns the same UUID for an idempotent retry", async () => {
    const idempotencyKey = `deployx-idempotent-${randomUUID()}`;
    const [first, duplicate] = await Promise.all([
      request(app)
        .post(`/api/projects/${projectId}/deployments`)
        .set("Idempotency-Key", idempotencyKey),
      request(app)
        .post(`/api/projects/${projectId}/deployments`)
        .set("Idempotency-Key", idempotencyKey),
    ]);
    expect([first.status, duplicate.status].sort()).toEqual([200, 202]);
    expect(duplicate.body.id).toBe(first.body.id);
    expect(duplicate.body.jobId).toBe(first.body.id);
    trackedDeploymentIds.push(first.body.id);

    const concurrent = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app).post(`/api/projects/${projectId}/deployments`),
      ),
    );
    expect(concurrent.every((response) => response.status === 202)).toBe(true);
    const numbers = concurrent.map((response) => response.body.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    const orderedNumbers = [...numbers].sort((left, right) => left - right);
    expect(orderedNumbers[1]).toBe(orderedNumbers[0] + 1);
    expect(orderedNumbers[2]).toBe(orderedNumbers[1] + 1);
    trackedDeploymentIds.push(
      ...concurrent.map((response) => response.body.id),
    );
  });

  it("retries deterministic failures with bounded attempts and one notification", async () => {
    const previousFailureStep = process.env.DEPLOYX_SIMULATED_FAILURE_STEP;
    process.env.DEPLOYX_SIMULATED_FAILURE_STEP = "Run tests";
    try {
      const response = await request(app)
        .post(`/api/projects/${projectId}/deployments`)
        .set("Idempotency-Key", `deployx-failure-${randomUUID()}`);
      expect(response.status).toBe(202);
      trackedDeploymentIds.push(response.body.id);

      const failed = await waitForDeployment(response.body.id);
      expect(failed.status).toBe("failed");
      expect(failed.attempts).toBe(3);
      expect(failed.maxAttempts).toBe(3);
      expect(failed.failureReason).toContain("test fixture failed");

      const generated = await db
        .select({ id: notificationsTable.id })
        .from(notificationsTable)
        .where(eq(notificationsTable.deploymentId, failed.id));
      expect(generated).toHaveLength(1);
    } finally {
      process.env.DEPLOYX_SIMULATED_FAILURE_STEP =
        previousFailureStep ?? "success";
    }
  }, 15_000);

  it("releases its claim and eventually fails an unexpected worker error", async () => {
    const previousFailureStep = process.env.DEPLOYX_SIMULATED_FAILURE_STEP;
    process.env.DEPLOYX_SIMULATED_FAILURE_STEP = "not-a-real-step";
    try {
      const response = await request(app)
        .post(`/api/projects/${projectId}/deployments`)
        .set("Idempotency-Key", `deployx-unexpected-${randomUUID()}`);
      expect(response.status).toBe(202);
      trackedDeploymentIds.push(response.body.id);

      const failed = await waitForDeployment(response.body.id);
      expect(failed.status).toBe("failed");
      expect(failed.attempts).toBe(3);
      expect(failed.failureReason).toContain(
        "DEPLOYX_SIMULATED_FAILURE_STEP",
      );
    } finally {
      process.env.DEPLOYX_SIMULATED_FAILURE_STEP =
        previousFailureStep ?? "success";
    }
  }, 15_000);

  it("recovers a stale running record and ignores duplicate delivery notifications", async () => {
    await waitForTrackedDeployments();
    await workerHandle.worker.pause(true);
    let recovered: typeof deploymentsTable.$inferSelect;
    let deploymentId = "";
    let resumed = false;
    try {
      const [latest] = await db
        .select({ number: deploymentsTable.number })
        .from(deploymentsTable)
        .where(eq(deploymentsTable.projectId, projectId))
        .orderBy(desc(deploymentsTable.number));
      deploymentId = randomUUID();
      const staleStartedAt = new Date(Date.now() - 60_000);
      await db.insert(deploymentsTable).values({
        id: deploymentId,
        projectId,
        number: (latest?.number ?? 0) + 1,
        status: "running",
        attempts: 0,
        maxAttempts: 3,
        terminalNotificationSent: false,
        progress: 20,
        duration: "0m 01s",
        triggeredBy: "recovery test",
        startedAt: staleStartedAt,
        completedAt: null,
        steps: pipelineSteps.map((name, index) => ({
          name,
          status: index === 0 ? "success" : "pending",
        })),
        logs: ["[simulation] Clone repository complete"],
      });
      await db.insert(deploymentOutboxTable).values({
        deploymentId,
        projectId,
        ownerId: authState.userId ?? "deployx-test-default",
        isRollback: false,
        publishedAt: new Date(),
      });
      // Simulate Redis retaining the published outbox state while its UUID job
      // disappears during a worker restart.
      const publishedJob = await workerHandle.queue.add(
        "published-before-restart",
        {
          deploymentId,
          projectId,
          ownerId: authState.userId ?? "deployx-test-default",
          isRollback: false,
        },
        { jobId: deploymentId, delay: 60_000 },
      );
      await publishedJob.remove();
      trackedDeploymentIds.push(deploymentId);

      await workerHandle.reconcile();
      await workerHandle.worker.resume();
      resumed = true;
      recovered = await waitForDeployment(deploymentId);
      expect(recovered.status).toBe("success");
      expect(recovered.logs.some((log) => log.includes("[recovery]"))).toBe(true);
    } finally {
      if (!resumed) await workerHandle.worker.resume();
    }

    const before = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(eq(notificationsTable.deploymentId, deploymentId));
    await workerHandle.queue.add(
      "duplicate-delivery",
      {
        deploymentId,
        projectId,
        ownerId: authState.userId ?? "deployx-test-default",
        isRollback: false,
      },
      { jobId: randomUUID(), attempts: 1 },
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    const after = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(eq(notificationsTable.deploymentId, deploymentId));
    expect(after).toHaveLength(before.length);
  }, 15_000);
});

describe("Ownership isolation", () => {
  let ownerProjectId: string;
  let ownerConversationId: number;
  let ownerVariableId: string;
  let ownerDeploymentId: string;
  let ownerRollbackId: string;

  it("does not expose another user's project, deployment, or dashboard data", async () => {
    authState.userId = "deployx-test-owner-a";
    const created = await request(app).post("/api/projects").send({
      name: "Owner A private project",
      repositoryUrl: "https://github.com/test/private-project",
      branch: "main",
      framework: "Node.js",
      environment: "development",
    });
    expect(created.status).toBe(201);
    ownerProjectId = created.body.id;
    const variable = await request(app)
      .post(`/api/projects/${ownerProjectId}/environments`)
      .send({
        key: "PRIVATE_TOKEN",
        value: "owner-a-secret",
        environment: "development",
      });
    expect(variable.status).toBe(201);
    ownerVariableId = variable.body.id;
    const deployment = await request(app).post(
      `/api/projects/${ownerProjectId}/deployments`,
    );
    expect([201, 202]).toContain(deployment.status);
    ownerDeploymentId = deployment.body.id;
    trackedDeploymentIds.push(ownerDeploymentId);
    const rollback = await request(app).post(
      `/api/deployments/${ownerDeploymentId}/rollback`,
    );
    expect(rollback.status).toBe(202);
    ownerRollbackId = rollback.body.id;
    trackedDeploymentIds.push(ownerRollbackId);

    authState.userId = "deployx-test-owner-b";
    const projects = await request(app).get("/api/projects");
    expect(projects.status).toBe(200);
    expect(
      projects.body.some(
        (project: { id: string }) => project.id === ownerProjectId,
      ),
    ).toBe(false);
    expect(
      (await request(app).get(`/api/projects/${ownerProjectId}/environments`))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(
            `/api/projects/${ownerProjectId}/environments/${ownerVariableId}`,
          )
          .send({ value: "should-not-update" })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app).delete(
          `/api/projects/${ownerProjectId}/environments/${ownerVariableId}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (await request(app).post(`/api/projects/${ownerProjectId}/duplicate`))
        .status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/projects/${ownerProjectId}/deployments`))
        .status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/deployments/${ownerDeploymentId}`)).status,
    ).toBe(404);
    expect(
      (
        await request(app).post(
          `/api/deployments/${ownerDeploymentId}/rollback`,
        )
      ).status,
    ).toBe(404);
    expect((await request(app).get("/api/dashboard")).status).toBe(200);
    expect(
      (await request(app).get("/api/dashboard")).body.activity.some(
        (item: { id: string }) => item.id === ownerProjectId,
      ),
    ).toBe(false);
  });

  it("does not expose another user's AI conversation", async () => {
    authState.userId = "deployx-test-owner-a";
    const created = await request(app)
      .post("/api/openai/conversations")
      .send({ title: "Private conversation" });
    expect(created.status).toBe(201);
    ownerConversationId = created.body.id;

    authState.userId = "deployx-test-owner-b";
    expect(
      (
        await request(app).get(
          `/api/openai/conversations/${ownerConversationId}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app).get(
          `/api/openai/conversations/${ownerConversationId}/messages`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/openai/conversations/${ownerConversationId}/messages`)
          .send({ content: "should not reach the model" })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app).delete(
          `/api/openai/conversations/${ownerConversationId}`,
        )
      ).status,
    ).toBe(404);
    const conversations = await request(app).get("/api/openai/conversations");
    expect(conversations.status).toBe(200);
    expect(
      conversations.body.some(
        (conversation: { id: number }) =>
          conversation.id === ownerConversationId,
      ),
    ).toBe(false);
  });

  it("scopes generated notifications and notification mutations", async () => {
    await waitForTrackedDeployments();
    authState.userId = "deployx-test-owner-a";
    const ownerNotifications = await request(app).get("/api/notifications");
    expect(ownerNotifications.status).toBe(200);
    const projectNotifications = ownerNotifications.body.filter(
      (notification: { projectId?: string }) =>
        notification.projectId === ownerProjectId,
    );
    expect(projectNotifications.length).toBeGreaterThan(0);

    authState.userId = "deployx-test-owner-b";
    const otherNotifications = await request(app).get("/api/notifications");
    expect(otherNotifications.status).toBe(200);
    expect(
      otherNotifications.body.some(
        (notification: { projectId?: string }) =>
          notification.projectId === ownerProjectId,
      ),
    ).toBe(false);
    const notificationId = projectNotifications[0].id as string;
    expect(
      (await request(app).post(`/api/notifications/${notificationId}/read`))
        .status,
    ).toBe(204);

    authState.userId = "deployx-test-owner-a";
    const unchanged = await request(app).get("/api/notifications");
    expect(
      unchanged.body.find(
        (notification: { id: string }) => notification.id === notificationId,
      ).read,
    ).toBe(false);
    expect(
      (await request(app).post(`/api/notifications/${notificationId}/read`))
        .status,
    ).toBe(204);
    const marked = await request(app).get("/api/notifications");
    expect(
      marked.body.find(
        (notification: { id: string }) => notification.id === notificationId,
      ).read,
    ).toBe(true);
    expect(
      (await request(app).post("/api/notifications/read-all")).status,
    ).toBe(204);
  }, 20_000);
});

describe("Validation and middleware", () => {
  it("round-trips encrypted values and rejects tampering", () => {
    const encrypted = encrypt("round-trip-secret");
    expect(decrypt(encrypted)).toBe("round-trip-secret");
    const [iv, tag, value] = encrypted.split(":");
    const lastByte = value.endsWith("0") ? "1" : "0";
    expect(() =>
      decrypt(`${iv}:${tag}:${value.slice(0, -1)}${lastByte}`),
    ).toThrow();
  });

  it("requires a Clerk user on protected routes", async () => {
    authState.userId = null;
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(401);
    authState.userId = "deployx-test-default";
  });

  it("POST /api/projects with empty body returns 400", async () => {
    const res = await request(app).post("/api/projects").send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("rejects credentialed requests from unconfigured origins", async () => {
    const res = await request(app)
      .get("/api/healthz")
      .set("Origin", "https://untrusted.example");
    expect(res.status).toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows same-origin credentialed requests", async () => {
    const res = await request(app)
      .get("/api/healthz")
      .set("Host", "localhost:5173")
      .set("Origin", "http://localhost:5173");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("allows a port-bearing same-origin Clerk proxy request before raw-body parsing", async () => {
    const callsBefore = proxyState.calls;
    const res = await request(app)
      .get("/api/__clerk/v1/environment")
      .set("Host", "api.internal")
      .set("X-Forwarded-Host", "localhost:5173")
      .set("Origin", "http://localhost:5173");
    expect(res.status).not.toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    expect(proxyState.calls).toBe(callsBefore + 1);
  });

  it("rejects an untrusted origin before the Clerk proxy", async () => {
    const callsBefore = proxyState.calls;
    const res = await request(app)
      .get("/api/__clerk/v1/environment")
      .set("Host", "localhost:5173")
      .set("Origin", "https://untrusted.example");
    expect(res.status).toBe(403);
    expect(proxyState.calls).toBe(callsBefore);
  });

  it("passes an allowed Clerk proxy body through before body parsers", async () => {
    const rawBody = '{"raw":"clerk-payload"}';
    const res = await request(app)
      .post("/api/__clerk/v1/client")
      .set("Host", "localhost:5173")
      .set("Origin", "http://localhost:5173")
      .set("Content-Type", "application/octet-stream")
      .send(rawBody);
    expect(res.status).not.toBe(403);
    expect(rawProxyState.body).toBe(rawBody);
  });
});
