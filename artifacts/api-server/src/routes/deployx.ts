import {
  randomUUID,
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  deploymentOutboxTable,
  deploymentsTable,
  environmentVariablesTable,
  projectsTable,
  notificationsTable,
} from "@workspace/db";
import {
  CreateDeploymentParams,
  CreateEnvironmentVariableBody,
  CreateEnvironmentVariableParams,
  CreateEnvironmentVariableResponse,
  CreateProjectBody,
  CreateProjectResponse,
  CreateDeploymentResponse,
  DeleteEnvironmentVariableParams,
  DeleteProjectParams,
  DuplicateProjectParams,
  DuplicateProjectResponse,
  GetDashboardResponse,
  GetDeploymentParams,
  GetDeploymentResponse,
  GetRepositoryParams,
  GetRepositoryResponse,
  ListDeploymentsParams,
  ListDeploymentsResponse,
  ListEnvironmentVariablesParams,
  ListEnvironmentVariablesQueryParams,
  ListEnvironmentVariablesResponse,
  ListProjectsResponse,
  UpdateEnvironmentVariableBody,
  UpdateEnvironmentVariableParams,
  UpdateEnvironmentVariableResponse,
  UpdateProjectBody,
  UpdateProjectParams,
  UpdateProjectResponse,
  RollbackDeploymentParams,
  RollbackDeploymentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const pipelineSteps = [
  "Clone repository",
  "Install dependencies",
  "Run tests",
  "Build project",
  "Deploy",
  "Health check",
];

/** Middleware: require a valid Clerk session on all routes in this router. */
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use(requireAuth);
const envSecret = process.env.SESSION_SECRET;
if (!envSecret) {
  throw new Error("SESSION_SECRET must be set before starting the API server");
}
// Do not silently try historical/default keys: ciphertext created with a
// missing-secret fallback requires an explicit offline recovery procedure.
// Keep this derivation stable for existing SESSION_SECRET-encrypted values.
const encryptionKey = createHash("sha256").update(envSecret).digest();
const seedPromises = new Map<string, Promise<void>>();

function userIdFor(req: Request): string {
  const userId = getAuth(req).userId;
  if (!userId) {
    // requireAuth runs before every route. Keep this guard here so a future
    // route cannot accidentally perform an unscoped query.
    throw new Error("Authenticated Clerk user is missing");
  }
  return userId;
}

async function ownedProject(
  projectId: string,
  ownerId: string,
): Promise<typeof projectsTable.$inferSelect | undefined> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(
      and(eq(projectsTable.id, projectId), eq(projectsTable.ownerId, ownerId)),
    );
  return project;
}

function maskValue(value: string): string {
  if (value.length <= 4) return "••••••••";
  return `${value.slice(0, 2)}${"•".repeat(Math.min(18, Math.max(8, value.length - 4)))}${value.slice(-2)}`;
}

export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, valueHex] = payload.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(valueHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

function projectResponse(project: typeof projectsTable.$inferSelect) {
  return {
    ...project,
    tags: project.tags ?? [],
    description: project.description ?? "",
    lastDeployment: project.lastDeployment ?? null,
  };
}

function variableResponse(
  variable: typeof environmentVariablesTable.$inferSelect,
) {
  return {
    id: variable.id,
    projectId: variable.projectId,
    key: variable.key,
    maskedValue: maskValue(decrypt(variable.encryptedValue)),
    environment: variable.environment,
    version: variable.version,
    updatedAt: variable.updatedAt,
  };
}

function deploymentResponse(deployment: typeof deploymentsTable.$inferSelect) {
  return {
    ...deployment,
    jobId: deployment.id,
    attempt: deployment.attempts,
    maxAttempts: deployment.maxAttempts,
    steps: deployment.steps ?? [],
    logs: deployment.logs ?? [],
    completedAt: deployment.completedAt ?? null,
  };
}

async function ensureSeed(ownerId: string): Promise<void> {
  let seedPromise = seedPromises.get(ownerId);
  if (!seedPromise) {
    seedPromise = (async () => {
      const existing = await db
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(eq(projectsTable.ownerId, ownerId))
        .limit(1);
      if (existing.length) return;
      const now = new Date();
      // A user-scoped seed must never reuse a legacy/global identifier.
      const projectId = randomUUID();
      const deploymentId = randomUUID();
      await db.insert(projectsTable).values({
        id: projectId,
        ownerId,
        name: "Neon Console",
        description:
          "Customer-facing control plane for event-driven workloads.",
        repositoryUrl: "https://github.com/acme/neon-console",
        branch: "main",
        framework: "Next.js",
        environment: "production",
        tags: ["production", "customer-facing"],
        status: "active",
        lastDeployment: "12 minutes ago",
        createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 21),
        updatedAt: now,
      });
      await db.insert(environmentVariablesTable).values([
        {
          id: randomUUID(),
          projectId,
          key: "DATABASE_URL",
          encryptedValue: encrypt("postgresql://neon-prod"),
          environment: "production",
          version: 3,
          updatedAt: now,
        },
        {
          id: randomUUID(),
          projectId,
          key: "NEXT_PUBLIC_API_URL",
          encryptedValue: encrypt("https://api.neon.example"),
          environment: "production",
          version: 2,
          updatedAt: new Date(now.getTime() - 1000 * 60 * 60 * 8),
        },
        {
          id: randomUUID(),
          projectId,
          key: "SENTRY_DSN",
          encryptedValue: encrypt("https://sentry.example/123"),
          environment: "staging",
          version: 1,
          updatedAt: new Date(now.getTime() - 1000 * 60 * 60 * 24),
        },
      ]);
      await db.insert(deploymentsTable).values({
        id: deploymentId,
        projectId,
        number: 42,
        status: "success",
        progress: 100,
        duration: "2m 18s",
        triggeredBy: "Maya Chen",
        startedAt: new Date(now.getTime() - 1000 * 60 * 60 * 4),
        completedAt: new Date(now.getTime() - 1000 * 60 * 60 * 4 + 138000),
        steps: pipelineSteps.map((name) => ({ name, status: "success" })),
        logs: [
          "[09:41:02] Clone repository complete",
          "[09:41:26] Dependencies installed",
          "[09:42:14] Tests passed: 128 / 128",
          "[09:43:20] Build completed successfully",
          "[09:43:20] Deployment healthy",
        ],
      });
    })();
    seedPromises.set(ownerId, seedPromise);
  }
  await seedPromise;
}

function parseProjectId(req: {
  params: Record<string, string | string[] | undefined>;
}): string {
  const value = req.params.projectId;
  return Array.isArray(value) ? value[0] : (value ?? "");
}

function idempotencyKeyFor(req: Request): string | null | undefined {
  const value = req.get("Idempotency-Key");
  if (value === undefined) return undefined;
  const key = value.trim();
  return key && key.length <= 255 ? key : null;
}

function repositoryFor(project: typeof projectsTable.$inferSelect) {
  const parts = project.repositoryUrl.replace(/\/$/, "").split("/");
  const name =
    parts.at(-1)?.replace(/\.git$/, "") ||
    project.name.toLowerCase().replace(/\s+/g, "-");
  const owner = parts.at(-2) || "workspace";
  return {
    url: project.repositoryUrl,
    owner,
    name,
    defaultBranch: project.branch,
    branches: [project.branch, "develop", "staging"],
    lastCommit: {
      sha: "a4c91e7",
      message: "chore: tune deployment health checks",
      author: "Maya Chen",
      committedAt: new Date(Date.now() - 1000 * 60 * 47).toISOString(),
    },
  };
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  await ensureSeed(ownerId);
  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.ownerId, ownerId));
  const projectIds = projects.map((project) => project.id);
  const deployments = projectIds.length
    ? await db
        .select()
        .from(deploymentsTable)
        .where(inArray(deploymentsTable.projectId, projectIds))
        .orderBy(desc(deploymentsTable.startedAt))
        .limit(12)
    : [];
  const completed = deployments.filter(
    (item) => item.status === "success" || item.status === "failed",
  );
  const successCount = completed.filter(
    (item) => item.status === "success",
  ).length;
  const activities = [
    ...deployments.slice(0, 4).map((item) => ({
      id: item.id,
      title:
        item.status === "success"
          ? `Deployment #${item.number} succeeded`
          : `Deployment #${item.number} ${item.status}`,
      detail:
        projects.find((project) => project.id === item.projectId)?.name ??
        "Project",
      time: item.completedAt ? "4 hours ago" : "Running now",
      tone:
        item.status === "success"
          ? "success"
          : item.status === "running"
            ? "running"
            : "warning",
    })),
    ...projects.slice(0, 2).map((project) => ({
      id: `project-${project.id}`,
      title: `${project.name} is ready`,
      detail: `${project.framework} · ${project.branch}`,
      time: "Yesterday",
      tone: "neutral",
    })),
  ];
  const response = {
    projects: {
      total: projects.length,
      active: projects.filter((item) => item.status === "active").length,
      archived: projects.filter((item) => item.status === "archived").length,
    },
    deployments: {
      total: deployments.length,
      successful: successCount,
      running: deployments.filter(
        (item) => item.status === "running" || item.status === "queued",
      ).length,
    },
    successRate: completed.length
      ? Math.round((successCount / completed.length) * 100)
      : 0,
    averageDuration: "2m 14s",
    activity: activities,
    deployTrend: [
      { day: "Mon", deployments: 4, successful: 4 },
      { day: "Tue", deployments: 6, successful: 5 },
      { day: "Wed", deployments: 3, successful: 3 },
      { day: "Thu", deployments: 8, successful: 7 },
      { day: "Fri", deployments: 5, successful: 5 },
      { day: "Sat", deployments: 2, successful: 2 },
      { day: "Sun", deployments: deployments.length, successful: successCount },
    ],
  };
  res.json(GetDashboardResponse.parse(response));
});

router.get("/projects", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  await ensureSeed(ownerId);
  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.ownerId, ownerId))
    .orderBy(desc(projectsTable.updatedAt));
  res.json(ListProjectsResponse.parse(projects.map(projectResponse)));
});

router.post("/projects", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const now = new Date();
  const project = {
    id: randomUUID(),
    ownerId,
    ...parsed.data,
    description: parsed.data.description ?? "",
    tags: parsed.data.tags ?? [],
    status: "active",
    lastDeployment: null,
    createdAt: now,
    updatedAt: now,
  };
  const [created] = await db.insert(projectsTable).values(project).returning();
  res.status(201).json(CreateProjectResponse.parse(projectResponse(created)));
});

router.patch("/projects/:projectId", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  const params = UpdateProjectParams.safeParse({
    projectId: parseProjectId(req),
  });
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid project update" });
    return;
  }
  const update = {
    ...parsed.data,
    status:
      parsed.data.archived === undefined
        ? undefined
        : parsed.data.archived
          ? "archived"
          : "active",
    updatedAt: new Date(),
  };
  delete (update as { archived?: boolean }).archived;
  const [updated] = await db
    .update(projectsTable)
    .set(update)
    .where(
      and(
        eq(projectsTable.id, params.data.projectId),
        eq(projectsTable.ownerId, ownerId),
      ),
    )
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(UpdateProjectResponse.parse(projectResponse(updated)));
});

router.delete("/projects/:projectId", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  const params = DeleteProjectParams.safeParse({
    projectId: parseProjectId(req),
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = await ownedProject(params.data.projectId, ownerId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const deleted = await db.transaction(async (tx) => {
    await tx
      .delete(environmentVariablesTable)
      .where(eq(environmentVariablesTable.projectId, params.data.projectId));
    const deployments = await tx
      .select({ id: deploymentsTable.id })
      .from(deploymentsTable)
      .where(eq(deploymentsTable.projectId, params.data.projectId));
    if (deployments.length) {
      await tx
        .delete(deploymentOutboxTable)
        .where(
          inArray(
            deploymentOutboxTable.deploymentId,
            deployments.map((deployment) => deployment.id),
          ),
        );
    }
    await tx
      .delete(deploymentsTable)
      .where(eq(deploymentsTable.projectId, params.data.projectId));
    await tx
      .delete(notificationsTable)
      .where(
        and(
          eq(notificationsTable.projectId, params.data.projectId),
          eq(notificationsTable.ownerId, ownerId),
        ),
      );
    return tx
      .delete(projectsTable)
      .where(
        and(
          eq(projectsTable.id, params.data.projectId),
          eq(projectsTable.ownerId, ownerId),
        ),
      )
      .returning();
  });
  if (!deleted.length) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.sendStatus(204);
});

router.post(
  "/projects/:projectId/duplicate",
  async (req, res): Promise<void> => {
    const ownerId = userIdFor(req);
    const params = DuplicateProjectParams.safeParse({
      projectId: parseProjectId(req),
    });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [source] = await db
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.id, params.data.projectId),
          eq(projectsTable.ownerId, ownerId),
        ),
      );
    if (!source) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const now = new Date();
    const duplicate = {
      ...source,
      id: randomUUID(),
      ownerId,
      name: `${source.name} copy`,
      status: "active",
      lastDeployment: null,
      createdAt: now,
      updatedAt: now,
    };
    const [created] = await db
      .insert(projectsTable)
      .values(duplicate)
      .returning();
    res
      .status(201)
      .json(DuplicateProjectResponse.parse(projectResponse(created)));
  },
);

router.get(
  "/projects/:projectId/repository",
  async (req, res): Promise<void> => {
    const ownerId = userIdFor(req);
    const params = GetRepositoryParams.safeParse({
      projectId: parseProjectId(req),
    });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const project = await ownedProject(params.data.projectId, ownerId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(GetRepositoryResponse.parse(repositoryFor(project)));
  },
);

router.get(
  "/projects/:projectId/environments",
  async (req, res): Promise<void> => {
    const ownerId = userIdFor(req);
    const params = ListEnvironmentVariablesParams.safeParse({
      projectId: parseProjectId(req),
    });
    const query = ListEnvironmentVariablesQueryParams.safeParse(req.query);
    if (!params.success || !query.success) {
      res.status(400).json({ error: "Invalid environment request" });
      return;
    }
    const project = await ownedProject(params.data.projectId, ownerId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const filter = query.data.environment
      ? and(
          eq(environmentVariablesTable.projectId, params.data.projectId),
          eq(environmentVariablesTable.environment, query.data.environment),
        )
      : eq(environmentVariablesTable.projectId, params.data.projectId);
    const variables = await db
      .select()
      .from(environmentVariablesTable)
      .where(filter)
      .orderBy(environmentVariablesTable.key);
    res.json(
      ListEnvironmentVariablesResponse.parse(variables.map(variableResponse)),
    );
  },
);

router.post(
  "/projects/:projectId/environments",
  async (req, res): Promise<void> => {
    const ownerId = userIdFor(req);
    const params = CreateEnvironmentVariableParams.safeParse({
      projectId: parseProjectId(req),
    });
    const parsed = CreateEnvironmentVariableBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid environment variable" });
      return;
    }
    if (!(await ownedProject(params.data.projectId, ownerId))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const [created] = await db
      .insert(environmentVariablesTable)
      .values({
        id: randomUUID(),
        projectId: params.data.projectId,
        key: parsed.data.key,
        encryptedValue: encrypt(parsed.data.value),
        environment: parsed.data.environment,
        version: 1,
        updatedAt: new Date(),
      })
      .returning();
    res
      .status(201)
      .json(CreateEnvironmentVariableResponse.parse(variableResponse(created)));
  },
);

router.patch(
  "/projects/:projectId/environments/:variableId",
  async (req, res): Promise<void> => {
    const ownerId = userIdFor(req);
    const params = UpdateEnvironmentVariableParams.safeParse({
      projectId: parseProjectId(req),
      variableId: req.params.variableId,
    });
    const parsed = UpdateEnvironmentVariableBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid environment update" });
      return;
    }
    if (!(await ownedProject(params.data.projectId, ownerId))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const [existing] = await db
      .select()
      .from(environmentVariablesTable)
      .where(
        and(
          eq(environmentVariablesTable.id, params.data.variableId),
          eq(environmentVariablesTable.projectId, params.data.projectId),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Variable not found" });
      return;
    }
    const [updated] = await db
      .update(environmentVariablesTable)
      .set({
        encryptedValue:
          parsed.data.value === undefined
            ? existing.encryptedValue
            : encrypt(parsed.data.value),
        environment: parsed.data.environment ?? existing.environment,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(environmentVariablesTable.id, existing.id))
      .returning();
    res.json(
      UpdateEnvironmentVariableResponse.parse(variableResponse(updated)),
    );
  },
);

router.delete(
  "/projects/:projectId/environments/:variableId",
  async (req, res): Promise<void> => {
    const ownerId = userIdFor(req);
    const params = DeleteEnvironmentVariableParams.safeParse({
      projectId: parseProjectId(req),
      variableId: req.params.variableId,
    });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await ownedProject(params.data.projectId, ownerId))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const deleted = await db
      .delete(environmentVariablesTable)
      .where(
        and(
          eq(environmentVariablesTable.id, params.data.variableId),
          eq(environmentVariablesTable.projectId, params.data.projectId),
        ),
      )
      .returning();
    if (!deleted.length) {
      res.status(404).json({ error: "Variable not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.get(
  "/projects/:projectId/deployments",
  async (req, res): Promise<void> => {
    const ownerId = userIdFor(req);
    const params = ListDeploymentsParams.safeParse({
      projectId: parseProjectId(req),
    });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await ownedProject(params.data.projectId, ownerId))) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const deployments = await db
      .select()
      .from(deploymentsTable)
      .where(eq(deploymentsTable.projectId, params.data.projectId))
      .orderBy(desc(deploymentsTable.number));
    res.json(
      ListDeploymentsResponse.parse(deployments.map(deploymentResponse)),
    );
  },
);

router.post(
  "/projects/:projectId/deployments",
  async (req, res): Promise<void> => {
    const ownerId = userIdFor(req);
    const params = CreateDeploymentParams.safeParse({
      projectId: parseProjectId(req),
    });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const idempotencyKey = idempotencyKeyFor(req);
    if (idempotencyKey === null) {
      res.status(400).json({
        error: "Idempotency-Key must be between 1 and 255 characters",
      });
      return;
    }

    const result = await db.transaction(async (tx) => {
      // Locking the project row serializes number allocation for concurrent
      // requests without relying on a process-local mutex.
      const [project] = await tx
        .select()
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.id, params.data.projectId),
            eq(projectsTable.ownerId, ownerId),
          ),
        )
        .for("update");
      if (!project) return { project: undefined, created: undefined, isNew: false };

      if (idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(deploymentsTable)
          .where(
            and(
              eq(deploymentsTable.projectId, project.id),
              eq(deploymentsTable.idempotencyKey, idempotencyKey),
            ),
          );
        if (existing) return { project, created: existing, isNew: false };
      }

      const [{ max }] = await tx
        .select({
          max: sql<number>`coalesce(max(${deploymentsTable.number}), 0)`,
        })
        .from(deploymentsTable)
        .where(eq(deploymentsTable.projectId, project.id));
      const deploymentId = randomUUID();
      const deployment = {
        id: deploymentId,
        projectId: project.id,
        number: Number(max) + 1,
        status: "queued",
        attempts: 0,
        maxAttempts: 3,
        idempotencyKey,
        terminalNotificationSent: false,
        progress: 0,
        duration: "—",
        triggeredBy: "You",
        startedAt: new Date(),
        completedAt: null,
        steps: pipelineSteps.map((name) => ({ name, status: "pending" })),
        logs: ["[queued] Waiting for a build worker..."],
      };
      const [created] = await tx
        .insert(deploymentsTable)
        .values(deployment)
        .returning();
      await tx.insert(deploymentOutboxTable).values({
        deploymentId,
        projectId: project.id,
        ownerId,
        isRollback: false,
      });
      return { project, created, isNew: true };
    });

    if (!result.project || !result.created) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res
      .status(result.isNew ? 202 : 200)
      .json(CreateDeploymentResponse.parse(deploymentResponse(result.created)));
  },
);

router.get("/deployments/:deploymentId", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  const params = GetDeploymentParams.safeParse({
    deploymentId: req.params.deploymentId,
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deployment] = await db
    .select()
    .from(deploymentsTable)
    .where(eq(deploymentsTable.id, params.data.deploymentId));
  if (!deployment) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }
  if (!(await ownedProject(deployment.projectId, ownerId))) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }
  res.json(GetDeploymentResponse.parse(deploymentResponse(deployment)));
});

// POST /deployments/:deploymentId/rollback — requirement #7
router.post(
  "/deployments/:deploymentId/rollback",
  async (req, res): Promise<void> => {
    const ownerId = userIdFor(req);
    const params = RollbackDeploymentParams.safeParse({
      deploymentId: req.params.deploymentId,
    });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [original] = await db
      .select()
      .from(deploymentsTable)
      .where(eq(deploymentsTable.id, params.data.deploymentId));
    if (!original) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }
    if (!(await ownedProject(original.projectId, ownerId))) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }
    const idempotencyKey = idempotencyKeyFor(req);
    if (idempotencyKey === null) {
      res.status(400).json({
        error: "Idempotency-Key must be between 1 and 255 characters",
      });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [project] = await tx
        .select()
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.id, original.projectId),
            eq(projectsTable.ownerId, ownerId),
          ),
        )
        .for("update");
      if (!project) return { project: undefined, created: undefined, isNew: false };

      if (idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(deploymentsTable)
          .where(
            and(
              eq(deploymentsTable.projectId, project.id),
              eq(deploymentsTable.idempotencyKey, idempotencyKey),
            ),
          );
        if (existing) return { project, created: existing, isNew: false };
      }

      const [{ max }] = await tx
        .select({
          max: sql<number>`coalesce(max(${deploymentsTable.number}), 0)`,
        })
        .from(deploymentsTable)
        .where(eq(deploymentsTable.projectId, project.id));
      const rollbackId = randomUUID();
      const newDeploy = {
        id: rollbackId,
        projectId: project.id,
        number: Number(max) + 1,
        status: "queued",
        attempts: 0,
        maxAttempts: 3,
        idempotencyKey,
        terminalNotificationSent: false,
        progress: 0,
        duration: "—",
        triggeredBy: `Rollback to #${original.number}`,
        startedAt: new Date(),
        completedAt: null,
        steps: pipelineSteps.map((name) => ({ name, status: "pending" })),
        logs: [`[queued] Rolling back to deployment #${original.number}…`],
      };
      const [created] = await tx
        .insert(deploymentsTable)
        .values(newDeploy)
        .returning();
      await tx.insert(deploymentOutboxTable).values({
        deploymentId: rollbackId,
        projectId: project.id,
        ownerId,
        isRollback: true,
      });
      return { project, created, isNew: true };
    });
    if (!result.project || !result.created) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }
    res
      .status(result.isNew ? 202 : 200)
      .json(
        RollbackDeploymentResponse.parse(deploymentResponse(result.created)),
      );
  },
);

export default router;
