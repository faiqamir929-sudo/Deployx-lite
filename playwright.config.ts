import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

function loadLocalEnvironment(): void {
  if (process.env.CI) return;

  let contents: string;
  try {
    contents = readFileSync(".env", "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const rawValue = match[2];
    process.env[match[1]] =
      rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue.startsWith("'") && rawValue.endsWith("'")
          ? rawValue.slice(1, -1)
          : rawValue;
  }
}

loadLocalEnvironment();

function requireE2EEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required E2E configuration: ${name}. ` +
        "Use a disposable Clerk test instance and start the API and worker before running Playwright.",
    );
  }
  return value;
}

const clerkPublishableKey = requireE2EEnvironment("CLERK_PUBLISHABLE_KEY");
const clerkSecretKey = requireE2EEnvironment("CLERK_SECRET_KEY");
const viteClerkPublishableKey = requireE2EEnvironment(
  "VITE_CLERK_PUBLISHABLE_KEY",
);

for (const name of [
  "DATABASE_URL",
  "SESSION_SECRET",
  "REDIS_URL",
  "DEPLOYX_SIMULATED_FAILURE_STEP",
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "AI_INTEGRATIONS_OPENAI_BASE_URL",
] as const) {
  requireE2EEnvironment(name);
}

if (
  !clerkPublishableKey.startsWith("pk_test_") ||
  !clerkSecretKey.startsWith("sk_test_")
) {
  throw new Error(
    "E2E requires Clerk test-instance keys (pk_test_ and sk_test_); production keys are not permitted.",
  );
}

if (viteClerkPublishableKey !== clerkPublishableKey) {
  throw new Error(
    "VITE_CLERK_PUBLISHABLE_KEY must match CLERK_PUBLISHABLE_KEY for the E2E app.",
  );
}

const baseURL = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:5173";
const deploymentTimeout = Number(
  process.env.E2E_DEPLOYMENT_TIMEOUT_MS ?? 90_000,
);

if (!Number.isFinite(deploymentTimeout) || deploymentTimeout < 15_000) {
  throw new Error(
    "E2E_DEPLOYMENT_TIMEOUT_MS must be a number of at least 15000 milliseconds.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  timeout: deploymentTimeout + 30_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["dot"], ["html", { open: "never" }]]
    : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    ...devices["Desktop Chrome"],
  },
  outputDir: "test-results",
});
