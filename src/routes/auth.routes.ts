import { Router } from "express";
import {
  loginUser,
  getCurrentUser,
  refreshAccessToken,
  logoutUser,
  logoutAllUsers,
} from "../controllers/auth.controller";
import { authenticateToken } from "../middlewares/auth.middleware";

const router = Router();

router.post("/login", loginUser);
router.post("/refresh", refreshAccessToken);
router.post("/logout", logoutUser);
router.post("/logout-all", logoutAllUsers);
router.get("/me", authenticateToken, getCurrentUser);

export default router;