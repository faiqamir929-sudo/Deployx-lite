import { Router, type IRouter } from "express";
import healthRouter from "./health";
import deployxRouter from "./deployx";
import openaiRouter from "./openai";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(deployxRouter);
router.use("/openai", openaiRouter);
router.use("/notifications", notificationsRouter);

export default router;
