import { createClerkClient } from "@clerk/backend";
import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const deploymentTimeout = Number(
  process.env.E2E_DEPLOYMENT_TIMEOUT_MS ?? 90_000,
);
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
if (!clerkSecretKey) {
  throw new Error(
    "Missing required E2E configuration: CLERK_SECRET_KEY. " +
      "Use a disposable Clerk test instance.",
  );
}

const testRunId = randomUUID().replaceAll("-", "").slice(0, 16);
const testEmail = `deployx-e2e-${testRunId}@example.com`;
const projectName = `DeployX E2E ${testRunId}`;
const repositoryUrl = "https://github.com/deployx-e2e/synthetic-project";
const environmentKey = `E2E_${testRunId.toUpperCase()}`;
const environmentValue = `synthetic-value-${testRunId}`;

let testUserId: string | undefined;
let createdProjectId: string | undefined;
let createdEnvironmentId: string | undefined;

const clerkClient = createClerkClient({
  secretKey: clerkSecretKey,
});

test.beforeAll(async () => {
  const user = await clerkClient.users.createUser({
    emailAddress: [testEmail],
    firstName: "DeployX",
    lastName: "E2E",
    skipPasswordChecks: true,
    skipPasswordRequirement: true,
  });
  testUserId = user.id;
});

test.afterEach(async ({ page }) => {
  // Delete only records created by this run. Project deletion also cascades
  // its deployment history and notifications on the API side.
  if (createdEnvironmentId && createdProjectId) {
    const response = await page.request.delete(
      `/api/projects/${createdProjectId}/environments/${createdEnvironmentId}`,
    );
    expect(response.status()).toBe(204);
    createdEnvironmentId = undefined;
  }

  if (createdProjectId) {
    const response = await page.request.delete(
      `/api/projects/${createdProjectId}`,
    );
    expect(response.status()).toBe(204);
    createdProjectId = undefined;
  }
});

test.afterAll(async () => {
  if (testUserId) {
    await clerkClient.users.deleteUser(testUserId);
    testUserId = undefined;
  }
});

test("authenticates and runs a simulated deployment lifecycle", async ({
  page,
}) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: testEmail });
  await page.goto("/");

  await expect(page.getByTestId("link-view-projects")).toBeVisible();
  await page.getByTestId("link-view-projects").click();
  await expect(page).toHaveURL(/\/projects\/?$/);

  await page.getByTestId("button-new-project").click();
  await expect(page.getByTestId("dialog-create-project")).toBeVisible();
  await page.getByTestId("input-project-name").fill(projectName);
  await page.getByTestId("input-project-repositoryUrl").fill(repositoryUrl);
  await page.getByTestId("input-project-branch").fill("main");
  await page.getByTestId("input-project-framework").fill("Vite");
  await page
    .getByTestId("input-project-description")
    .fill("Synthetic project used by the DeployX E2E lifecycle.");
  await page.getByTestId("input-project-tags").fill("e2e, synthetic");
  await page.getByTestId("button-submit-project").click();

  await expect(page.getByTestId("dialog-create-project")).toBeHidden();
  const projectRow = page
    .locator('[data-testid^="row-project-"]')
    .filter({ hasText: projectName });
  await expect(projectRow).toHaveCount(1);
  const projectRowTestId = await projectRow.getAttribute("data-testid");
  if (!projectRowTestId) {
    throw new Error("Created project row did not expose its test identifier.");
  }
  createdProjectId = projectRowTestId.replace("row-project-", "");

  await projectRow.getByRole("link", { name: projectName }).click();
  await expect(page.getByTestId("text-project-name")).toHaveText(projectName);

  await page.getByTestId("button-add-variable").click();
  await page.getByTestId("input-env-key").fill(environmentKey);
  await page.getByTestId("input-env-value").fill(environmentValue);
  await page.getByTestId("button-save-env").click();

  const variableRow = page
    .locator('[data-testid^="row-variable-"]')
    .filter({ hasText: environmentKey });
  await expect(variableRow).toHaveCount(1);
  const variableRowTestId = await variableRow.getAttribute("data-testid");
  if (!variableRowTestId) {
    throw new Error(
      "Created environment variable row did not expose its test identifier.",
    );
  }
  createdEnvironmentId = variableRowTestId.replace("row-variable-", "");
  await expect(variableRow).not.toContainText(environmentValue);
  await expect(variableRow).toContainText("••••");

  await page.getByTestId("button-deploy-project").click();
  await expect(page.getByTestId("text-deploy-notice")).toContainText(
    "Deployment queued",
  );

  const pipeline = page.getByTestId("panel-pipeline");
  await expect(pipeline.getByTestId("status-success")).toBeVisible({
    timeout: deploymentTimeout,
  });
  await expect(pipeline.getByTestId("panel-pipeline-logs")).toContainText(
    "[simulation] Service responded 200 OK",
  );
  for (const step of [
    "clone-repository",
    "install-dependencies",
    "run-tests",
    "build-project",
    "deploy",
    "health-check",
  ]) {
    await expect(pipeline.getByTestId(`step-${step}`)).toContainText("success");
  }

  const initialDeployment = page
    .locator('[data-testid^="row-deployment-"]')
    .filter({ hasText: "You" })
    .first();
  await expect(initialDeployment).toContainText("success");
  const initialDeploymentTestId =
    await initialDeployment.getAttribute("data-testid");
  if (!initialDeploymentTestId) {
    throw new Error(
      "Initial deployment row did not expose its test identifier.",
    );
  }
  const initialDeploymentId = initialDeploymentTestId.replace(
    "row-deployment-",
    "",
  );
  const initialDeploymentText = await initialDeployment.textContent();
  const initialNumber = Number(initialDeploymentText?.match(/#(\d+)/)?.[1]);
  if (!Number.isInteger(initialNumber)) {
    throw new Error("Initial deployment number was not rendered.");
  }

  await initialDeployment
    .getByTestId(`button-rollback-${initialDeploymentId}`)
    .click();
  await expect(page.getByTestId("text-deploy-notice")).toContainText(
    "Rollback queued",
  );

  await expect(
    pipeline.getByRole("heading", {
      name: `Pipeline — deployment #${initialNumber + 1}`,
    }),
  ).toBeVisible({ timeout: deploymentTimeout });
  await expect(pipeline.getByTestId("status-success")).toBeVisible({
    timeout: deploymentTimeout,
  });
  await expect(pipeline.getByTestId("panel-pipeline-logs")).toContainText(
    "[simulation] Service responded 200 OK",
  );
  await expect(
    page.locator('[data-testid^="row-deployment-"]').first(),
  ).toContainText(`Rollback to #${initialNumber}`);
});
