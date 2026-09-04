import express from "express";
import {
  getAttendanceRecords,
  createAttendanceRecord,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  submitAttendanceCorrection,
  createVerifiedCheckIn,
  createVerifiedCheckOut,
} from "../controllers/attendance.controller";

import { authenticateToken } from "../middlewares/auth.middleware";
import { authorizeRoles } from "../middlewares/authorize.middleware";
import { allowActiveDevicePrototype } from "../middlewares/devicePrototype.middleware";

const router = express.Router();

router.post(
  "/verified-check-in",
  allowActiveDevicePrototype,
  createVerifiedCheckIn
);

router.post(
  "/verified-check-out",
  allowActiveDevicePrototype,
  createVerifiedCheckOut
);

router.use(authenticateToken);

// Any authenticated user
router.get("/", getAttendanceRecords);

// Administrator only
router.post(
  "/",
  authorizeRoles("Administrator"),
  createAttendanceRecord
);

router.put(
  "/:id",
  authorizeRoles("Administrator"),
  updateAttendanceRecord
);

router.delete(
  "/:id",
  authorizeRoles("Administrator"),
  deleteAttendanceRecord
);

router.post(
  "/:id/correction",
  authorizeRoles("Administrator", "EME Area Manager"),
  submitAttendanceCorrection
);

router.get("/test", (req, res) => {
  res.json({ message: "Attendance route working" });
});

export default router;
