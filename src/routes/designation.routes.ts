import express from "express";
import { getDesignations } from "../controllers/designation.controller";
import { authenticateToken } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/", authenticateToken, getDesignations);

export default router;