import { Router } from "express";
import { allowActiveDevicePrototype } from "../middlewares/devicePrototype.middleware";
import { liveSelfieUpload } from "../utils/liveSelfieUpload";

import { 
  startVerificationSession,
  verifySecretCode,
  uploadLiveSelfie,
  verifyGpsLocation,
  completeVerificationSession,
  getVerificationSessionStatus,
} from "../controllers/verification.controller";


const router = Router();

// POST /api/v1/verification/sessions/start
router.post(
  "/sessions/start",
  allowActiveDevicePrototype,
  startVerificationSession
);

// POST /api/v1/verification/sessions/:id/secret-code
router.post(
  "/sessions/:id/secret-code",
  allowActiveDevicePrototype,
  verifySecretCode
);

// POST /api/v1/verification/sessions/:id/live-selfie
router.post(
  "/sessions/:id/live-selfie",
  allowActiveDevicePrototype,
  liveSelfieUpload.single("image"),
  uploadLiveSelfie
);

// POST /api/v1/verification/sessions/{id}/gps
router.post(
  "/sessions/:id/gps",
  allowActiveDevicePrototype,
  verifyGpsLocation
);

// POST /api/v1/verification/sessions/{id}/complete
router.post(
  "/sessions/:id/complete",
  allowActiveDevicePrototype,
  completeVerificationSession
);

//  GET /api/v1/verification/sessions/{id}/status
router.get(
  "/sessions/:id/status",
  allowActiveDevicePrototype,
  getVerificationSessionStatus
);


export default router;
