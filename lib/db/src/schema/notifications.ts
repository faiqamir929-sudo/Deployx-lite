import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const notificationsTable = pgTable("deployx_notifications", {
  id: text("id").primaryKey(),
  // Nullable for legacy rows. Null-owned notifications are inaccessible.
  ownerId: text("owner_id"),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  tone: text("tone").notNull().default("info"), // success | warning | info
  read: boolean("read").notNull().default(false),
  projectId: text("project_id"),
  deploymentId: text("deployment_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;
