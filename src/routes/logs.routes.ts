import { Router } from "express";
import { streamLogs, streamIVSLogs } from "../controllers/logs.controller";

const router = Router();

router.get("/stream", streamLogs);
router.get("/stream/IVS",streamIVSLogs);

export default router;

