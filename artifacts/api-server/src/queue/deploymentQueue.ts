import { Queue } from "bullmq";
import IORedis from "ioredis";

export const DEPLOYMENT_QUEUE_NAME = "deployx-deployments";
export const DEPLOYMENT_MAX_ATTEMPTS = 3;
export const DEPLOYMENT_BACKOFF_DELAY_MS = 1_000;

export type DeploymentJobData = {
  deploymentId: string;
  projectId: string;
  ownerId: string;
  isRollback: boolean;
};

export function getRedisUrl(): string {
  // PostgreSQL outbox rows are the durable source of truth during Redis
  // outages, so the API does not create a Redis connection at request time.
  return process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
}

export function createRedisConnection(): IORedis {
  return new IORedis(getRedisUrl(), {
    // BullMQ requires unlimited command retries on worker connections.
    // Disabling offline queuing makes a publish outage fail promptly so the
    // reconciliation loop can record it and retry on its next pass.
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
}

export function createDeploymentQueue(
  connection = createRedisConnection(),
): Queue<DeploymentJobData> {
  return new Queue<DeploymentJobData>(DEPLOYMENT_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: DEPLOYMENT_MAX_ATTEMPTS,
      backoff: {
        type: "exponential",
        delay: DEPLOYMENT_BACKOFF_DELAY_MS,
      },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 1_000 },
    },
  });
}

export async function enqueueDeployment(
  queue: Queue<DeploymentJobData>,
  data: DeploymentJobData,
  options: { attempts?: number } = {},
): Promise<void> {
  // The deployment UUID is the idempotent BullMQ job id. A reconciliation
  // retry after a worker crash therefore cannot create a second deployment.
  await queue.add("deployment", data, {
    jobId: data.deploymentId,
    ...(options.attempts === undefined
      ? {}
      : { attempts: Math.max(1, options.attempts) }),
  });
}