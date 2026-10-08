import { logger } from "./lib/logger";
import { startDeploymentWorker } from "./queue/deploymentWorker";

function configuredMilliseconds(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const handle = startDeploymentWorker({
  concurrency: Math.max(
    1,
    Math.floor(configuredMilliseconds("DEPLOYX_WORKER_CONCURRENCY", 2)),
  ),
  reconcileIntervalMs: configuredMilliseconds(
    "DEPLOYX_RECONCILE_INTERVAL_MS",
    1_000,
  ),
  recoveryGraceMs: configuredMilliseconds(
    "DEPLOYX_RECOVERY_GRACE_MS",
    30_000,
  ),
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "Deployment worker shutting down");
  await handle.stop();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

handle.worker.on("ready", () => {
  logger.info("Deployment worker ready");
});