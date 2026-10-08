import { clerkSetup } from "@clerk/testing/playwright";

export default async function globalSetup(): Promise<void> {
  // The helper obtains a short-lived testing token from the configured Clerk
  // development instance. It does not print either key or the token.
  await clerkSetup({ debug: false, dotenv: false });
}
