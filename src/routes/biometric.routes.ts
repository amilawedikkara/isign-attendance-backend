import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.middleware";
import { authorizeRoles } from "../middlewares/authorize.middleware";
import { faceUpload } from "../utils/faceUpload";
import {
  enrollFace,
  getFaceEnrollmentStatus,
} from "../controllers/biometric.controller";

const router = Router();

// POST /api/v1/biometrics/face-enrollment
router.post(
  "/face-enrollment",
  authenticateToken,
  authorizeRoles("Administrator"),
  faceUpload.single("image"),
  enrollFace
);

// GET /api/v1/biometrics/face-enrollment/:employee_id
router.get(
  "/face-enrollment/:employee_id",
  authenticateToken,
  getFaceEnrollmentStatus
);

export default router;