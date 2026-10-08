import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const projectsTable = pgTable("deployx_projects", {
  id: text("id").primaryKey(),
  // Nullable for legacy rows. Legacy records are intentionally not claimable
  // by authenticated users; new rows always set this from Clerk.
  ownerId: text("owner_id"),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  repositoryUrl: text("repository_url").notNull(),
  branch: text("branch").notNull(),
  framework: text("framework").notNull(),
  environment: text("environment").notNull(),
  tags: text("tags").array().notNull().default([]),
  status: text("status").notNull().default("active"),
  lastDeployment: text("last_deployment"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const environmentVariablesTable = pgTable(
  "deployx_environment_variables",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    key: text("key").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    environment: text("environment").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const deploymentsTable = pgTable("deployx_deployments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  number: integer("number").notNull(),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  idempotencyKey: text("idempotency_key"),
  terminalNotificationSent: boolean("terminal_notification_sent")
    .notNull()
    .default(false),
  progress: integer("progress").notNull().default(0),
  duration: text("duration").notNull().default("—"),
  triggeredBy: text("triggered_by").notNull().default("You"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  steps: jsonb("steps")
    .notNull()
    .$type<Array<{ name: string; status: string }>>()
    .default([]),
  logs: jsonb("logs").notNull().$type<string[]>().default([]),
  failureReason: text("failure_reason"),
}, (table) => ({
  idempotencyKeyIndex: uniqueIndex("deployx_deployments_idempotency_idx")
    .on(table.projectId, table.idempotencyKey)
    .where(sql`${table.idempotencyKey} is not null`),
}));

/**
 * PostgreSQL is the source of truth for work that must survive an unavailable
 * Redis instance. The worker publishes these rows to BullMQ and marks them
 * published only after Redis accepted the UUID-keyed job.
 */
export const deploymentOutboxTable = pgTable("deployx_deployment_outbox", {
  deploymentId: text("deployment_id").primaryKey(),
  projectId: text("project_id").notNull(),
  ownerId: text("owner_id").notNull(),
  isRollback: boolean("is_rollback").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export type Project = typeof projectsTable.$inferSelect;
export type EnvironmentVariable = typeof environmentVariablesTable.$inferSelect;
export type Deployment = typeof deploymentsTable.$inferSelect;
