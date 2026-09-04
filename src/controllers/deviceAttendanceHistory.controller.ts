import { Request, Response } from "express";
import pool from "../config/db";

const HISTORY_SESSION_MARKER = "ATTENDANCE_HISTORY";
const HISTORY_SESSION_SECONDS = 90;

export const startDeviceAttendanceHistorySession = async (
  req: Request,
  res: Response
) => {
  try {
    const { device_uuid, employee_id } = req.body;

    if (!device_uuid || typeof device_uuid !== "string") {
      return res.status(400).json({
        success: false,
        message: "device_uuid is required",
      });
    }

    const parsedEmployeeId = Number(employee_id);

    if (!Number.isInteger(parsedEmployeeId) || parsedEmployeeId <= 0) {
      return res.status(400).json({
        success: false,
        message: "employee_id must be a valid positive integer",
      });
    }

    const deviceResult = await pool.query(
      `
      SELECT
        d.id AS device_id,
        d.location_id,
        sl.location_name,
        ds.status_name
      FROM devices d
      JOIN service_locations sl
        ON d.location_id = sl.id
      JOIN device_statuses ds
        ON d.status_id = ds.id
      WHERE d.device_uuid = $1
      LIMIT 1
      `,
      [device_uuid]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Device not found",
      });
    }

    const device = deviceResult.rows[0];

    if (device.status_name !== "Active") {
      return res.status(403).json({
        success: false,
        message: "Device is not active or trusted",
      });
    }

    const employeeResult = await pool.query(
      `
      SELECT
        e.id AS employee_id,
        e.location_id,
        e.secret_code_enabled,
        es.status_name AS employee_status
      FROM employees e
      JOIN employee_statuses es
        ON e.status_id = es.id
      WHERE e.id = $1
      LIMIT 1
      `,
      [parsedEmployeeId]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const employee = employeeResult.rows[0];

    if (
      Number(employee.location_id) !== Number(device.location_id) ||
      employee.employee_status !== "Active"
    ) {
      return res.status(403).json({
        success: false,
        message: "Employee is not allocated to this device location",
      });
    }

    if (employee.secret_code_enabled !== true) {
      return res.status(403).json({
        success: false,
        message: "Secret code verification is not enabled for this employee",
      });
    }

    /*
     * Reuse an unexpired history session for this employee/device.
     * This prevents simply creating a new session to reset the
     * existing three-attempt secret-code limit.
     */
    const existingSessionResult = await pool.query(
      `
      SELECT
        id,
        expires_at,
        secret_code_attempts,
        max_secret_code_attempts
      FROM verification_sessions
      WHERE employee_id = $1
        AND device_id = $2
        AND is_used = FALSE
        AND expires_at > NOW()
        AND required_steps @> ARRAY[$3]::text[]
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [
        parsedEmployeeId,
        device.device_id,
        HISTORY_SESSION_MARKER,
      ]
    );

    if (existingSessionResult.rows.length > 0) {
      const session = existingSessionResult.rows[0];

      return res.status(200).json({
        success: true,
        verification_session_id: session.id,
        expires_at: session.expires_at,
        remaining_attempts: Math.max(
          Number(session.max_secret_code_attempts ?? 3) -
            Number(session.secret_code_attempts ?? 0),
          0
        ),
      });
    }

    const sessionResult = await pool.query(
      `
      INSERT INTO verification_sessions
      (
        employee_id,
        device_id,
        location_id,
        required_steps,
        verification_status,
        expires_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        ARRAY[$4]::text[],
        'PENDING',
        NOW() + INTERVAL '90 seconds'
      )
      RETURNING
        id,
        expires_at,
        secret_code_attempts,
        max_secret_code_attempts
      `,
      [
        parsedEmployeeId,
        device.device_id,
        device.location_id,
        HISTORY_SESSION_MARKER,
      ]
    );

    const session = sessionResult.rows[0];

    return res.status(201).json({
      success: true,
      verification_session_id: session.id,
      expires_at: session.expires_at,
      expires_in: HISTORY_SESSION_SECONDS,
      remaining_attempts: Number(
        session.max_secret_code_attempts ?? 3
      ),
    });
  } catch (error) {
    console.error(
      "Error starting device attendance history session:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getDeviceAttendanceHistory = async (
  req: Request,
  res: Response
) => {
  try {
    const { verification_session_id } = req.query;

    if (
      !verification_session_id ||
      typeof verification_session_id !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "verification_session_id is required",
      });
    }

    const sessionResult = await pool.query(
      `
      SELECT
        vs.id,
        vs.employee_id,
        vs.location_id,
        vs.secret_code_verified,
        vs.expires_at,
        vs.is_used,
        vs.required_steps,
        d.id AS device_id,
        ds.status_name AS device_status,
        sl.location_name,
        e.full_name,
        e.gid,
        e.location_id AS employee_location_id,
        es.status_name AS employee_status,
        dg.designation_name
      FROM verification_sessions vs
      JOIN devices d
        ON vs.device_id = d.id
      JOIN device_statuses ds
        ON d.status_id = ds.id
      JOIN service_locations sl
        ON vs.location_id = sl.id
      JOIN employees e
        ON vs.employee_id = e.id
      JOIN employee_statuses es
        ON e.status_id = es.id
      LEFT JOIN designations dg
        ON e.designation_id = dg.id
      WHERE vs.id = $1
      LIMIT 1
      `,
      [verification_session_id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Verification session not found",
      });
    }

    const session = sessionResult.rows[0];

    if (
      !Array.isArray(session.required_steps) ||
      !session.required_steps.includes(HISTORY_SESSION_MARKER)
    ) {
      return res.status(403).json({
        success: false,
        message: "Verification session is not valid for attendance history",
      });
    }

    if (session.device_status !== "Active") {
      return res.status(403).json({
        success: false,
        message: "Device is not active or trusted",
      });
    }

    if (session.is_used === true) {
      return res.status(403).json({
        success: false,
        message: "Verification session is no longer valid",
      });
    }

    if (new Date(session.expires_at) < new Date()) {
      return res.status(403).json({
        success: false,
        message: "Verification session has expired",
      });
    }

    if (session.secret_code_verified !== true) {
      return res.status(403).json({
        success: false,
        message: "Secret code verification is required",
      });
    }

    if (
      session.employee_status !== "Active" ||
      Number(session.employee_location_id) !==
        Number(session.location_id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Employee is not allocated to this device location",
      });
    }

    const rangeResult = await pool.query(
      `
      SELECT
        (CURRENT_DATE - INTERVAL '29 days')::date::text
          AS start_date,
        CURRENT_DATE::text AS end_date
      `
    );

    const attendanceResult = await pool.query(
      `
      SELECT
        ar.id AS attendance_id,
        ar.employee_id,
        ar.location_id,
        ar.check_in_time,
        ar.check_out_time,
        ar.check_in_time::date::text AS attendance_date,
        ar.status_id,
        ats.status_name AS attendance_status,
        ar.verification_status
      FROM attendance_records ar
      LEFT JOIN attendance_statuses ats
        ON ar.status_id = ats.id
      WHERE ar.employee_id = $1
        AND ar.location_id = $2
        AND ar.check_in_time >=
          CURRENT_DATE - INTERVAL '29 days'
        AND ar.check_in_time <
          CURRENT_DATE + INTERVAL '1 day'
      ORDER BY ar.check_in_time DESC
      `,
      [session.employee_id, session.location_id]
    );

    const attendance = attendanceResult.rows;

    const presentDays = new Set(
      attendance
        .map((record) => record.attendance_date)
        .filter(Boolean)
    ).size;

    const completedShifts = attendance.filter(
      (record) => record.check_out_time !== null
    ).length;

    const currentlyDutyIn = attendance.filter(
      (record) => record.check_out_time === null
    ).length;

    return res.status(200).json({
      success: true,
      location: {
        location_id: session.location_id,
        location_name: session.location_name,
      },
      employee: {
        employee_id: session.employee_id,
        full_name: session.full_name,
        gid: session.gid,
        designation_name: session.designation_name,
      },
      start_date: rangeResult.rows[0].start_date,
      end_date: rangeResult.rows[0].end_date,
      summary: {
        present_days: presentDays,
        completed_shifts: completedShifts,
        currently_duty_in: currentlyDutyIn,
      },
      attendance,
    });
  } catch (error) {
    console.error(
      "Error fetching device attendance history:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
