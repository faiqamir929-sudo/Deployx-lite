import { randomUUID } from "node:crypto";
import { Worker, type Job, type Queue } from "bullmq";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  deploymentOutboxTable,
  deploymentsTable,
  notificationsTable,
  projectsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import {
  createDeploymentQueue,
  createRedisConnection,
  enqueueDeployment,
  type DeploymentJobData,
  DEPLOYMENT_MAX_ATTEMPTS,
  DEPLOYMENT_QUEUE_NAME,
} from "./deploymentQueue";

export const pipelineSteps = [
  "Clone repository",
  "Install dependencies",
  "Run tests",
  "Build project",
  "Deploy",
  "Health check",
] as const;

const failureReasons: Record<string, string> = {
  "Clone repository":
    "Remote repository simulation failed: repository access token expired.",
  "Install dependencies":
    "Dependency installation simulation failed: peer dependency conflict.",
  "Run tests":
    "Test simulation failed: a deterministic test fixture failed.",
  "Build project":
    "Build simulation failed: deterministic type-check fixture failed.",
  Deploy: "Deploy simulation failed: target quota exceeded.",
  "Health check": "Health-check simulation failed: readiness probe timed out.",
};

const DEFAULT_RECOVERY_GRACE_MS = 30_000;

export type DeploymentWorkerOptions = {
  concurrency?: number;
  stepDelayMs?: number;
  reconcileIntervalMs?: number;
  recoveryGraceMs?: number;
  queue?: Queue<DeploymentJobData>;
  connection?: ReturnType<typeof createRedisConnection>;
};

export type DeploymentWorkerHandle = {
  worker: Worker<DeploymentJobData>;
  queue: Queue<DeploymentJobData>;
  stop: () => Promise<void>;
  reconcile: () => Promise<void>;
};

function stepDelay(options: DeploymentWorkerOptions): number {
  const configured = options.stepDelayMs ?? Number(process.env.DEPLOYX_STEP_DELAY_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 1_000;
}

/**
 * Testable, deterministic simulation control. Production never executes
 * repository-provided commands: this worker only advances the fixed pipeline
 * below. Set DEPLOYX_SIMULATED_FAILURE_STEP to a step name or one-based step
 * number to exercise bounded retry and terminal failure handling.
 */
export function simulatedFailureStep(
  _deploymentId: string,
  isRollback: boolean,
): number {
  if (isRollback) return -1;
  const configured =
    process.env.DEPLOYX_SIMULATED_FAILURE_STEP ??
    process.env.DEPLOYX_SIMULATION_FAIL_STEP ??
    process.env.DEPLOYX_TEST_FAILURE_STEP;
  if (!configured || configured === "none" || configured === "success") return -1;
  const stepName = pipelineSteps.findIndex(
    (name) => name.toLowerCase() === configured.trim().toLowerCase(),
  );
  if (stepName >= 0) return stepName;
  const numeric = Number(configured);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= pipelineSteps.length) {
    return numeric - 1;
  }
  throw new Error(
    `DEPLOYX_SIMULATED_FAILURE_STEP must be one of ${pipelineSteps.join(", ")} or 1-${pipelineSteps.length}`,
  );
}

function deploymentSteps(index: number, failedAt: number) {
  return pipelineSteps.map((name, stepIndex) => ({
    name,
    status:
      stepIndex < index
        ? "success"
        : stepIndex === index
          ? stepIndex === failedAt
            ? "failed"
            : "success"
          : "pending",
  }));
}

function deploymentLogs(index: number, failedAt: number): string[] {
  const logs = pipelineSteps.slice(0, index + 1).map((name, stepIndex) => {
    if (stepIndex === failedAt) return `[simulation] ${name} failed`;
    return `[simulation] ${name} complete`;
  });
  if (failedAt < 0 && index === pipelineSteps.length - 1) {
    logs.push("[simulation] Service responded 200 OK");
  }
  if (failedAt >= 0 && index === failedAt) {
    logs.push(`[error] ${failureReasons[pipelineSteps[index]]}`);
  }
  return logs;
}

function durationLabel(startedAt: number): string {
  const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1_000));
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * Claim a deployment in PostgreSQL before doing any work. A recent running
 * row is an active claim and makes duplicate deliveries a safe no-op. A row
 * older than the recovery grace is eligible for a stalled-job retry.
 */
type DeploymentClaim = {
  attempts: number;
  startedAt: Date;
};

async function markAttemptStarted(
  data: DeploymentJobData,
  recoveryGraceMs: number,
): Promise<DeploymentClaim | null> {
  const staleBefore = new Date(Date.now() - recoveryGraceMs);
  const [updated] = await db
    .update(deploymentsTable)
    .set({
      status: "running",
      // A recovered job can be requeued after its final BullMQ delivery was
      // lost. Preserve the persisted budget rather than incrementing past it.
      attempts: sql`case when ${deploymentsTable.attempts} < ${deploymentsTable.maxAttempts} then ${deploymentsTable.attempts} + 1 else ${deploymentsTable.attempts} end`,
      startedAt: new Date(),
      completedAt: null,
      failureReason: null,
    })
    .where(
      and(
        eq(deploymentsTable.id, data.deploymentId),
        eq(deploymentsTable.projectId, data.projectId),
        or(
          eq(deploymentsTable.status, "queued"),
          and(
            eq(deploymentsTable.status, "running"),
            lt(deploymentsTable.startedAt, staleBefore),
          ),
        ),
      ),
    )
      .returning({
        attempts: deploymentsTable.attempts,
        startedAt: deploymentsTable.startedAt,
      });
  return updated
    ? { attempts: updated.attempts, startedAt: updated.startedAt }
    : null;
}

async function terminalUpdate(
  data: DeploymentJobData,
  failedAt: number,
  index: number,
  startedAt: number,
  reasonOverride?: string,
  prefixLogs: string[] = [],
): Promise<void> {
  const finalStatus = failedAt >= 0 ? "failed" : "success";
  const steps = deploymentSteps(index, failedAt);
  const logs = [...prefixLogs, ...deploymentLogs(index, failedAt)];
  if (reasonOverride && failedAt >= 0) {
    logs[logs.length - 1] = `[error] ${reasonOverride}`;
  }

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(deploymentsTable)
      .set({
        status: finalStatus,
        progress:
          failedAt >= 0
            ? Math.round(((index + 1) / pipelineSteps.length) * 100)
            : 100,
        steps,
        logs,
        duration: durationLabel(startedAt),
        completedAt: new Date(),
        failureReason:
          failedAt >= 0
            ? reasonOverride ?? failureReasons[pipelineSteps[index]]
            : null,
      })
      .where(
        and(
          eq(deploymentsTable.id, data.deploymentId),
          eq(deploymentsTable.projectId, data.projectId),
          or(
            eq(deploymentsTable.status, "running"),
            eq(deploymentsTable.status, "queued"),
          ),
        ),
      )
      .returning();

    // A deleted project or duplicate/stale BullMQ delivery is a safe no-op.
    if (!updated) return;
    const [project] = await tx
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.id, data.projectId),
          eq(projectsTable.ownerId, data.ownerId),
        ),
      );
    if (!project) return;

    if (finalStatus === "success") {
      await tx
        .update(projectsTable)
        .set({ lastDeployment: "just now", updatedAt: new Date() })
        .where(
          and(
            eq(projectsTable.id, data.projectId),
            eq(projectsTable.ownerId, data.ownerId),
          ),
        );
    }

    // The flag and notification insert are one transaction. A crash before
    // commit rolls both back, while duplicate deliveries cannot notify twice.
    if (!updated.terminalNotificationSent) {
      const label = data.isRollback
        ? "Rollback"
        : `Deployment #${updated.number}`;
      await tx.insert(notificationsTable).values({
        id: randomUUID(),
        ownerId: data.ownerId,
        title: `${label} ${finalStatus === "success" ? "succeeded" : "failed"}`,
        detail:
          finalStatus === "success"
            ? `${project.name} deployed successfully to ${project.environment}.`
            : `${project.name} failed at "${pipelineSteps[failedAt]}". Check the logs for details.`,
        tone: finalStatus === "success" ? "success" : "warning",
        read: false,
        projectId: data.projectId,
        deploymentId: data.deploymentId,
      });
      await tx
        .update(deploymentsTable)
        .set({ terminalNotificationSent: true })
        .where(
          and(
            eq(deploymentsTable.id, data.deploymentId),
            eq(deploymentsTable.terminalNotificationSent, false),
          ),
        );
    }
  });
}

function firstPendingStep(
  deployment: typeof deploymentsTable.$inferSelect,
): number {
  const index = deployment.steps.findIndex((step) => step.status !== "success");
  return index >= 0 ? index : 0;
}

async function releaseClaimForRetry(
  data: DeploymentJobData,
  claimStartedAt: Date,
  error: unknown,
): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  const [deployment] = await db
    .select({ logs: deploymentsTable.logs })
    .from(deploymentsTable)
    .where(
      and(
        eq(deploymentsTable.id, data.deploymentId),
        eq(deploymentsTable.projectId, data.projectId),
        eq(deploymentsTable.status, "running"),
        eq(deploymentsTable.startedAt, claimStartedAt),
      ),
    );
  if (!deployment) return;

  await db
    .update(deploymentsTable)
    .set({
      status: "queued",
      completedAt: null,
      failureReason: reason.slice(0, 2_000),
      logs: [
        ...(deployment.logs ?? []),
        `[retry] Worker error: ${reason.slice(0, 500)}`,
      ].slice(-100),
    })
    .where(
      and(
        eq(deploymentsTable.id, data.deploymentId),
        eq(deploymentsTable.projectId, data.projectId),
        eq(deploymentsTable.status, "running"),
        eq(deploymentsTable.startedAt, claimStartedAt),
      ),
    );
}

async function processDeployment(
  job: Job<DeploymentJobData>,
  options: DeploymentWorkerOptions,
): Promise<void> {
  const data = job.data;
  const [deployment] = await db
    .select()
    .from(deploymentsTable)
    .where(
      and(
        eq(deploymentsTable.id, data.deploymentId),
        eq(deploymentsTable.projectId, data.projectId),
      ),
    );
  if (!deployment || deployment.status === "success" || deployment.status === "failed") {
    return;
  }

  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.id, data.projectId),
        eq(projectsTable.ownerId, data.ownerId),
      ),
    );
  if (!project) return;

  const graceMs = options.recoveryGraceMs ?? DEFAULT_RECOVERY_GRACE_MS;
  const staleClaim =
    deployment.status === "running" &&
    deployment.startedAt.getTime() < Date.now() - graceMs;
  const claim = await markAttemptStarted(data, graceMs);
  if (!claim) return;

  const recoveryLogs = staleClaim
    ? [
        ...(deployment.logs ?? []).filter((log) => log.startsWith("[recovery]")),
        "[recovery] Worker restarted; deployment returned to the durable queue.",
      ]
    : (deployment.logs ?? []).filter((log) => log.startsWith("[recovery]"));
  if (staleClaim) {
    await db
      .update(deploymentsTable)
      .set({ logs: recoveryLogs })
      .where(
        and(
          eq(deploymentsTable.id, data.deploymentId),
          eq(deploymentsTable.status, "running"),
        ),
      );
  }
  const maxAttempts = Math.max(
    1,
    Number(deployment.maxAttempts ?? DEPLOYMENT_MAX_ATTEMPTS),
  );
  let failedAt = -1;
  try {
    const startedAt = claim.startedAt.getTime();
    failedAt = simulatedFailureStep(data.deploymentId, data.isRollback);
    for (let index = 0; index < pipelineSteps.length; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, stepDelay(options)));
      const failed = index === failedAt;
      const isLast = failed || index === pipelineSteps.length - 1;
      const steps = deploymentSteps(index, failedAt);
      const logs = [...recoveryLogs, ...deploymentLogs(index, failedAt)];

      if (failed) {
        const reason = failureReasons[pipelineSteps[index]];
        const isFinalAttempt = claim.attempts >= maxAttempts;
        if (isFinalAttempt) {
          await terminalUpdate(
            data,
            failedAt,
            index,
            startedAt,
            reason,
            recoveryLogs,
          );
          return;
        }

        // Keep the row visible as queued while BullMQ applies its bounded
        // exponential backoff. A later attempt gets a fresh claim.
        await db
          .update(deploymentsTable)
          .set({
            status: "queued",
            progress: Math.round(((index + 1) / pipelineSteps.length) * 100),
            steps,
            logs,
            duration: durationLabel(startedAt),
            completedAt: null,
            failureReason: reason,
          })
          .where(
            and(
              eq(deploymentsTable.id, data.deploymentId),
              eq(deploymentsTable.projectId, data.projectId),
              eq(deploymentsTable.status, "running"),
            ),
          );
        throw new Error(reason);
      }

      // Terminal success is committed by terminalUpdate, so a duplicate cannot
      // observe a success row before its notification transaction commits.
      await db
        .update(deploymentsTable)
        .set({
          status: "running",
          progress: Math.round(((index + 1) / pipelineSteps.length) * 100),
          steps,
          logs,
          duration: durationLabel(startedAt),
          completedAt: null,
          failureReason: null,
        })
        .where(
          and(
            eq(deploymentsTable.id, data.deploymentId),
            eq(deploymentsTable.projectId, data.projectId),
            eq(deploymentsTable.status, "running"),
          ),
        );

      if (isLast) {
        await terminalUpdate(data, -1, index, startedAt, undefined, recoveryLogs);
        return;
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (claim.attempts >= maxAttempts) {
      // A recovered job may have consumed its final persisted attempt before
      // its Redis delivery disappeared. Make that attempt terminal without
      // incrementing the budget again.
      const failureIndex =
        failedAt >= 0 ? failedAt : firstPendingStep(deployment);
      try {
        await terminalUpdate(
          data,
          failureIndex,
          failureIndex,
          claim.startedAt.getTime(),
          reason.slice(0, 2_000),
          recoveryLogs,
        );
      } catch (terminalError) {
        await releaseClaimForRetry(data, claim.startedAt, terminalError);
        throw terminalError;
      }
      return;
    }

    // Do not leave a recent running claim behind when an unexpected processor
    // error occurs. The next BullMQ delivery must be able to claim it.
    await releaseClaimForRetry(data, claim.startedAt, error);
    throw error;
  }
}

/**
 * Reset only old running records that no longer have a live BullMQ job. This
 * is the restart grace path: recent rows remain claimed, and Redis outages
 * leave them untouched until the queue is reachable again.
 */
export async function recoverInterruptedDeployments(
  queue: Queue<DeploymentJobData>,
  recoveryGraceMs = DEFAULT_RECOVERY_GRACE_MS,
): Promise<void> {
  const staleBefore = new Date(Date.now() - recoveryGraceMs);
  const running = await db
    .select()
    .from(deploymentsTable)
    .where(
      and(
        eq(deploymentsTable.status, "running"),
        lt(deploymentsTable.startedAt, staleBefore),
      ),
    )
    .limit(100);
  const publishedOutbox = await db
    .select({ deploymentId: deploymentOutboxTable.deploymentId })
    .from(deploymentOutboxTable)
    .where(isNotNull(deploymentOutboxTable.publishedAt))
    .limit(100);
  const queuedPublished =
    publishedOutbox.length > 0
      ? await db
          .select()
          .from(deploymentsTable)
          .where(
            and(
              eq(deploymentsTable.status, "queued"),
              inArray(
                deploymentsTable.id,
                publishedOutbox.map((row) => row.deploymentId),
              ),
            ),
          )
      : [];
  const candidates = [
    ...running,
    ...queuedPublished.filter(
      (deployment) =>
        !running.some((runningDeployment) => runningDeployment.id === deployment.id),
    ),
  ];

  for (const deployment of candidates) {
    const job = await queue.getJob(deployment.id);
    if (job) {
      const state = await job.getState();
      if (
        state === "active" ||
        state === "waiting" ||
        state === "delayed" ||
        state === "prioritized"
      ) {
        continue;
      }

      // A completed/failed retained job is no longer capable of resuming the
      // database row. Remove it before resetting the outbox so the UUID can be
      // safely re-enqueued. If removal races an active Redis transition, keep
      // the durable running claim for the next recovery pass.
      try {
        await job.remove();
      } catch (error) {
        logger.warn(
          { deploymentId: deployment.id, state, err: error },
          "Could not remove stale terminal deployment job",
        );
        continue;
      }
    }

    const recoveryLog =
      deployment.status === "running"
        ? "[recovery] Worker restarted; deployment returned to the durable queue."
        : "[recovery] Redis job was missing; deployment returned to the durable queue.";
    const logs = deployment.logs?.includes(recoveryLog)
      ? deployment.logs
      : [...(deployment.logs ?? []), recoveryLog].slice(-100);
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(deploymentsTable)
        .where(
          and(
            eq(deploymentsTable.id, deployment.id),
            or(
              and(
                eq(deploymentsTable.status, "running"),
                lt(deploymentsTable.startedAt, staleBefore),
              ),
              eq(deploymentsTable.status, "queued"),
            ),
          ),
        )
        .for("update");
      if (!current) return;

      await tx
        .update(deploymentsTable)
        .set({
          status: "queued",
          logs,
          completedAt: null,
          failureReason: null,
        })
        .where(eq(deploymentsTable.id, deployment.id));

      const [outbox] = await tx
        .select()
        .from(deploymentOutboxTable)
        .where(eq(deploymentOutboxTable.deploymentId, deployment.id));
      if (outbox) {
        // Keep publish-attempt history, but make the row eligible for the
        // reconciliation pass after this recovery transaction commits.
        await tx
          .update(deploymentOutboxTable)
          .set({ publishedAt: null, lastError: null })
          .where(eq(deploymentOutboxTable.deploymentId, deployment.id));
        return;
      }

      // Legacy/manual rows may predate the outbox. Recreate the durable work
      // record when the owning project still has an authenticated owner.
      const [project] = await tx
        .select({ ownerId: projectsTable.ownerId })
        .from(projectsTable)
        .where(eq(projectsTable.id, deployment.projectId));
      if (project?.ownerId) {
        await tx.insert(deploymentOutboxTable).values({
          deploymentId: deployment.id,
          projectId: deployment.projectId,
          ownerId: project.ownerId,
          isRollback: false,
        });
      }
    });
  }
}

export async function reconcileDeploymentOutbox(
  queue: Queue<DeploymentJobData>,
): Promise<void> {
  const pending = await db
    .select()
    .from(deploymentOutboxTable)
    .where(isNull(deploymentOutboxTable.publishedAt))
    .orderBy(asc(deploymentOutboxTable.createdAt))
    .limit(100);

  for (const row of pending) {
    const data: DeploymentJobData = {
      deploymentId: row.deploymentId,
      projectId: row.projectId,
      ownerId: row.ownerId,
      isRollback: row.isRollback,
    };
    try {
      const [deployment] = await db
        .select({
          status: deploymentsTable.status,
          attempts: deploymentsTable.attempts,
          maxAttempts: deploymentsTable.maxAttempts,
        })
        .from(deploymentsTable)
        .where(eq(deploymentsTable.id, row.deploymentId));
      if (!deployment) {
        await db
          .delete(deploymentOutboxTable)
          .where(eq(deploymentOutboxTable.deploymentId, row.deploymentId));
        continue;
      }
      if (deployment.status === "success" || deployment.status === "failed") {
        await db
          .update(deploymentOutboxTable)
          .set({ publishedAt: new Date(), lastError: null })
          .where(eq(deploymentOutboxTable.deploymentId, row.deploymentId));
        continue;
      }
      const remainingAttempts = Math.max(
        1,
        Number(deployment.maxAttempts ?? DEPLOYMENT_MAX_ATTEMPTS) -
          Number(deployment.attempts ?? 0),
      );
      await enqueueDeployment(queue, data, { attempts: remainingAttempts });
      await db
        .update(deploymentOutboxTable)
        .set({
          publishedAt: new Date(),
          attempts: sql`${deploymentOutboxTable.attempts} + 1`,
          lastError: null,
        })
        .where(
          and(
            eq(deploymentOutboxTable.deploymentId, row.deploymentId),
            isNull(deploymentOutboxTable.publishedAt),
          ),
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(deploymentOutboxTable)
        .set({
          attempts: sql`${deploymentOutboxTable.attempts} + 1`,
          lastError: message.slice(0, 2_000),
        })
        .where(eq(deploymentOutboxTable.deploymentId, row.deploymentId));
      logger.error(
        { deploymentId: row.deploymentId, err: error },
        "Redis publish failed; deployment remains in the PostgreSQL outbox",
      );
    }
  }
}

async function markExhaustedUnexpectedFailure(
  job: Job<DeploymentJobData>,
  error: Error,
): Promise<void> {
  const [deployment] = await db
    .select()
    .from(deploymentsTable)
    .where(eq(deploymentsTable.id, job.data.deploymentId));
  if (!deployment || deployment.status === "success" || deployment.status === "failed") {
    return;
  }
  const failedAt = Math.max(
    0,
    deployment.steps.findIndex((step) => step.status === "running" || step.status === "pending"),
  );
  await terminalUpdate(
    job.data,
    failedAt,
    failedAt,
    deployment.startedAt.getTime(),
    error.message.slice(0, 2_000),
  );
}

export function startDeploymentWorker(
  options: DeploymentWorkerOptions = {},
): DeploymentWorkerHandle {
  const connection = options.connection ?? createRedisConnection();
  const queue = options.queue ?? createDeploymentQueue(connection);
  const worker = new Worker<DeploymentJobData>(
    DEPLOYMENT_QUEUE_NAME,
    (job) => processDeployment(job, options),
    {
      connection,
      concurrency: options.concurrency ?? 2,
      stalledInterval: 5_000,
      lockDuration: 30_000,
      maxStalledCount: 2,
    },
  );
  worker.on("error", (error) => {
    logger.error({ err: error }, "Deployment worker error");
  });
  worker.on("failed", (job, error) => {
    if (!job) return;
    const maxAttempts = Number(
      job.opts.attempts ?? DEPLOYMENT_MAX_ATTEMPTS,
    );
    if (job.attemptsMade < maxAttempts) return;
    void markExhaustedUnexpectedFailure(job, error).catch((failure) => {
      logger.error(
        { deploymentId: job.data.deploymentId, err: failure },
        "Could not persist exhausted deployment failure",
      );
    });
  });

  let stopping = false;
  const intervalMs = options.reconcileIntervalMs ?? 1_000;
  const reconcile = async (): Promise<void> => {
    if (stopping) return;
    try {
      await recoverInterruptedDeployments(
        queue,
        options.recoveryGraceMs ?? DEFAULT_RECOVERY_GRACE_MS,
      );
      await reconcileDeploymentOutbox(queue);
    } catch (error) {
      logger.error({ err: error }, "Deployment outbox reconciliation failed");
    }
  };
  const timer = setInterval(() => void reconcile(), intervalMs);
  void reconcile();

  return {
    worker,
    queue,
    reconcile,
    stop: async () => {
      stopping = true;
      clearInterval(timer);
      await worker.close();
      if (!options.queue) await queue.close();
      if (!options.connection) await connection.quit();
    },
  };
}