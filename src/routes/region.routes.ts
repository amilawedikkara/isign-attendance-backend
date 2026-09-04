import express from "express";
import { getRegions } from "../controllers/region.controller";
import { authenticateToken } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/", authenticateToken, getRegions);

export default router;