import { Router } from "express";
import {
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} from "../controllers/location.controller";

import { authenticateToken } from "../middlewares/auth.middleware";
import { authorizeRoles } from "../middlewares/authorize.middleware";

const router = Router();

// Any logged-in user can access
router.get("/", authenticateToken, getLocations);

// Only Administrator can access
router.post("/", authenticateToken, authorizeRoles("Administrator"), createLocation);
router.put("/:id", authenticateToken, authorizeRoles("Administrator"), updateLocation);
router.delete("/:id", authenticateToken, authorizeRoles("Administrator"), deleteLocation);

export default router;