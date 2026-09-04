import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.middleware";
import {
  getAttendanceSummary,
  getAttendanceTrends,
  getLateAbsenteeism,
  getRegionalPerformance,
} from "../controllers/report.controller";

const router = Router();

// GET /api/v1/reports/attendance-summary
router.get(
  "/attendance-summary",
  authenticateToken,
  getAttendanceSummary
);

// GET /api/v1/reports/attendance-trends
router.get(
  "/attendance-trends",
  authenticateToken,
  getAttendanceTrends
);

// GET /api/v1/reports/late-absenteeism
router.get(
  "/late-absenteeism",
  authenticateToken,
  getLateAbsenteeism
);

// GET /api/v1/reports/regional-performance
router.get(
  "/regional-performance",
  authenticateToken,
  getRegionalPerformance
);

export default router;