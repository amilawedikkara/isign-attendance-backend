import {
  getDeviceAttendanceHistory,
  startDeviceAttendanceHistorySession,
} from "../controllers/deviceAttendanceHistory.controller";
import { Router } from "express";
import {
  getDevices,
  getDeviceById,
  deleteDevice,
  registerDevice,
  activateDevice,
  authenticateDevice,
  requestOtp,
  getDeviceEmployees,
  getDeviceCurrentDutyIn,
  getDeviceRosters,
} from "../controllers/device.controller";

const router = Router();

router.get("/", getDevices);
router.get("/employees", getDeviceEmployees);
router.get("/current-duty-in", getDeviceCurrentDutyIn);
router.get("/rosters", getDeviceRosters);
router.post(
  "/attendance-history/session",
  startDeviceAttendanceHistorySession
);
router.get(
  "/attendance-history",
  getDeviceAttendanceHistory
);
router.get("/:id", getDeviceById);
router.post("/", registerDevice);
router.post("/activate", activateDevice);
router.post("/authenticate", authenticateDevice);
router.post("/request-otp", requestOtp);
router.delete("/:id", deleteDevice);

export default router;
