import express from "express";
import { getStatuses } from "../controllers/status.controller";
import { authenticateToken } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/", authenticateToken, getStatuses);

export default router;