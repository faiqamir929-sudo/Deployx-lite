/**
 * Notification center routes — requirement #8
 *
 * In-app notifications for deployment success/failure.
 * Created by the deployment simulator in deployx.ts and consumed here.
 */
import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { ListNotificationsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use(requireAuth);

function userIdFor(req: Request): string {
  const userId = getAuth(req).userId;
  if (!userId) {
    throw new Error("Authenticated Clerk user is missing");
  }
  return userId;
}

// GET /notifications
router.get("/", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.ownerId, ownerId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(ListNotificationsResponse.parse(rows));
});

// POST /notifications/:id/read
router.post("/:id/read", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(
      and(
        eq(notificationsTable.id, req.params.id),
        eq(notificationsTable.ownerId, ownerId),
      ),
    );
  res.status(204).end();
});

// POST /notifications/read-all
router.post("/read-all", async (req, res): Promise<void> => {
  const ownerId = userIdFor(req);
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.ownerId, ownerId));
  res.status(204).end();
});

export default router;
