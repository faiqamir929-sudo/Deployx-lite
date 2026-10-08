import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path
  .join(configDirectory, "src", "schema", "*.ts")
  .replace(/\\/g, "/");

export default defineConfig({
  schema: schemaPath,
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
