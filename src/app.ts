import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import roleRoutes from "./routes/role.routes";
import userRoutes from "./routes/user.routes";
import authRoutes from "./routes/auth.routes";
import locationRoutes from "./routes/location.routes";
import employeeRoutes from "./routes/employee.routes";
import attendanceRoutes from "./routes/attendance.routes";
import logsRoutes from "./routes/logs.routes";
import rosterRoutes from "./routes/roster.routes";
import designationRoutes from "./routes/designation.routes";
import statusRoutes from "./routes/status.routes";
import regionRoutes from "./routes/region.routes";
import deviceRoutes from "./routes/device.routes";
import cron from "node-cron";
import { expireTemporaryAssignments } from "./jobs/expireTemporaryAssignments.job";
import biometricRoutes from "./routes/biometric.routes";
import verificationRoutes from "./routes/verification.routes";
import cookieParser from "cookie-parser";
import reportRoutes from "./routes/report.routes";


dotenv.config();

const app = express();

app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/roles", roleRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/locations", locationRoutes);
app.use("/api/v1/employees", employeeRoutes);
app.use("/api/v1/attendance", attendanceRoutes);
app.use("/api/v1/rosters", rosterRoutes);
app.use("/api/v1/devices", deviceRoutes);
app.use("/api/v1/designations", designationRoutes);
app.use("/api/v1/statuses", statusRoutes);
app.use("/api/v1/regions", regionRoutes);
app.use("/api/v1/biometrics", biometricRoutes);
app.use("/api/v1/verification", verificationRoutes);
app.use("/api/v1/reports", reportRoutes);



app.use("/api/v1/logs", logsRoutes);

cron.schedule("0 * * * *", async () => {
  await expireTemporaryAssignments();
});

app.get("/api/health", (req, res) => {
  res.send("ISIGN V3 Backend is running");
});

export default app;