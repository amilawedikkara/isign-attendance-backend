import express from "express";
import {
  getRosters,
  createRoster,
  updateRoster,
  deleteRoster,
} from "../controllers/roster.controller";

const router = express.Router();

router.get("/", getRosters);
router.post("/", createRoster);
router.put("/:id", updateRoster);
router.delete("/:id", deleteRoster);

export default router;
