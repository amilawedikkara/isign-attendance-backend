import { Request, Response, NextFunction } from "express";
import pool from "../config/db";

const ACTIVE_STATUS_NAME = "Active";

export const allowActiveDevicePrototype = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const deviceUuid = req.body?.device_uuid;
    const verificationSessionId =
      req.params?.id || req.body?.verification_session_id;

    if (deviceUuid) {
      const deviceResult = await pool.query(
        `
        SELECT
          d.id,
          ds.status_name
        FROM devices d
        JOIN device_statuses ds
          ON d.status_id = ds.id
        WHERE d.device_uuid = $1
        LIMIT 1
        `,
        [deviceUuid]
      );

      if (deviceResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }

      if (deviceResult.rows[0].status_name !== ACTIVE_STATUS_NAME) {
        return res.status(403).json({
          success: false,
          message: "Device is not active or trusted",
        });
      }

      return next();
    }

    if (verificationSessionId) {
      const sessionResult = await pool.query(
        `
        SELECT
          vs.id,
          ds.status_name
        FROM verification_sessions vs
        JOIN devices d
          ON vs.device_id = d.id
        JOIN device_statuses ds
          ON d.status_id = ds.id
        WHERE vs.id = $1
        LIMIT 1
        `,
        [verificationSessionId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Verification session not found",
        });
      }

      if (sessionResult.rows[0].status_name !== ACTIVE_STATUS_NAME) {
        return res.status(403).json({
          success: false,
          message: "Device is not active or trusted",
        });
      }

      return next();
    }

    return res.status(400).json({
      success: false,
      message: "device_uuid or verification_session_id is required",
    });
  } catch (error) {
    console.error("Prototype device access check failed:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
