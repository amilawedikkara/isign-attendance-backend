import { Router } from "express";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/user.controller";

import { authenticateToken } from "../middlewares/auth.middleware";
import { authorizeRoles } from "../middlewares/authorize.middleware";

const router = Router();

// Any logged-in user can view users
router.get("/", authenticateToken, getUsers);

// Only Administrators can manage users
router.post(
  "/",
  authenticateToken,
  authorizeRoles("Administrator"),
  createUser
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("Administrator"),
  updateUser
);

router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("Administrator"),
  deleteUser
);

export default router;