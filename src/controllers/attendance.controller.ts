import {
  getAttendanceVerificationFailure,
} from "../utils/attendanceVerificationPolicy";
import { Request, Response } from "express";
import pool from "../config/db";

export const getAttendanceRecords = async (req: Request, res: Response) => {
  try {
    const {
      employee_id,
      location_id,
      attendance_date,
      start_date,
      end_date,
      verification_status,
    } = req.query;

    let query = `
      SELECT
        ar.id AS attendance_id,
        ar.employee_id,
        ar.location_id,
        ar.check_in_time,
        ar.check_out_time,
        ar.status_id,
        ar.verification_status
      FROM attendance_records ar
      WHERE 1 = 1
    `;

    const values: any[] = [];
    let index = 1;

    if (employee_id) {
      query += ` AND ar.employee_id = $${index}`;
      values.push(employee_id);
      index++;
    }

    if (location_id) {
      query += ` AND ar.location_id = $${index}`;
      values.push(location_id);
      index++;
    }

    if (attendance_date) {
      query += ` AND DATE(ar.check_in_time) = $${index}`;
      values.push(attendance_date);
      index++;
    }

    if (start_date) {
      query += ` AND DATE(ar.check_in_time) >= $${index}`;
      values.push(start_date);
      index++;
    }

    if (end_date) {
      query += ` AND DATE(ar.check_in_time) <= $${index}`;
      values.push(end_date);
      index++;
    }

    if (verification_status) {
      query += ` AND ar.verification_status = $${index}`;
      values.push(verification_status);
      index++;
    }

    query += ` ORDER BY ar.check_in_time DESC`;

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      attendance: result.rows,
    });
  } catch (error) {
    console.error("Error fetching attendance records:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const createAttendanceRecord = async (req: Request, res: Response) => {
  try {
    const {
      employee_id,
      location_id,
      check_in_time,
      check_out_time,
      status_id,
    } = req.body;

    if (!employee_id || !location_id || !check_in_time || !status_id) {
      return res.status(400).json({
        success: false,
        message: "employee_id, location_id, check_in_time, and status_id are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO attendance_records
      (
        employee_id,
        location_id,
        check_in_time,
        check_out_time,
        status_id
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id AS attendance_id,
        employee_id,
        location_id,
        check_in_time,
        check_out_time,
        status_id
      `,
      [
        employee_id,
        location_id,
        check_in_time,
        check_out_time || null,
        status_id,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Attendance record created successfully",
      attendance: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating attendance record:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updateAttendanceRecord = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { check_in_time, check_out_time, status_id } = req.body;

    if (!check_in_time || !check_out_time || !status_id) {
      return res.status(400).json({
        success: false,
        message: "check_in_time, check_out_time, and status_id are required",
      });
    }

    const result = await pool.query(
      `
      UPDATE attendance_records
      SET
        check_in_time = $1,
        check_out_time = $2,
        status_id = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING
        id AS attendance_id,
        employee_id,
        location_id,
        check_in_time,
        check_out_time,
        status_id
      `,
      [check_in_time, check_out_time, status_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Attendance record updated successfully",
      attendance: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating attendance record:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteAttendanceRecord = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM attendance_records
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Attendance record deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting attendance record:", error);

    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete attendance record because related correction records exist",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const submitAttendanceCorrection = async (req: any, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    const {
      corrected_check_in_time,
      corrected_check_out_time,
      correction_reason,
    } = req.body;

    const correctedByUserId = req.user?.id;

    if (!correction_reason) {
      return res.status(400).json({
        success: false,
        message: "correction_reason is required",
      });
    }

    if (!corrected_check_in_time && !corrected_check_out_time) {
      return res.status(400).json({
        success: false,
        message: "At least one corrected time is required",
      });
    }

    await client.query("BEGIN");

    const attendanceResult = await client.query(
      `
      SELECT
        id,
        check_in_time,
        check_out_time,
        status_id
      FROM attendance_records
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (attendanceResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    const existingCorrection = await client.query(
      `
      SELECT id
      FROM attendance_corrections
      WHERE attendance_record_id = $1
      `,
      [id]
    );

    if (existingCorrection.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Attendance record already corrected",
      });
    }

    const attendance = attendanceResult.rows[0];

    await client.query(
      `
      INSERT INTO attendance_corrections
      (
        attendance_record_id,
        original_check_in_time,
        original_check_out_time,
        original_status_id,
        corrected_check_in_time,
        corrected_check_out_time,
        correction_reason,
        corrected_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        id,
        attendance.check_in_time,
        attendance.check_out_time,
        attendance.status_id,
        corrected_check_in_time || attendance.check_in_time,
        corrected_check_out_time || attendance.check_out_time,
        correction_reason,
        correctedByUserId,
      ]
    );

    await client.query(
      `
      UPDATE attendance_records
      SET
        check_in_time = COALESCE($1, check_in_time),
        check_out_time = COALESCE($2, check_out_time),
        updated_at = NOW()
      WHERE id = $3
      `,
      [corrected_check_in_time, corrected_check_out_time, id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      correction_applied: true,
      correction_count: 1,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error submitting attendance correction:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};



export const createVerifiedCheckIn = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { verification_session_id, latitude, longitude, record_time } = req.body;

    if (
      !verification_session_id ||
      latitude === undefined ||
      longitude === undefined ||
      !record_time
    ) {
      return res.status(400).json({
        success: false,
        message:
          "verification_session_id, latitude, longitude and record_time are required",
      });
    }

    const parsedRecordTime = new Date(record_time);

    if (isNaN(parsedRecordTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid record_time",
      });
    }

    await client.query("BEGIN");

    const sessionResult = await client.query(
      `
      SELECT
        id,
        employee_id,
        location_id,
        secret_code_verified,
        selfie_verified,
        liveness_verified,
        gps_verified,
        verification_status,
        is_completed,
        is_used,
        expires_at
      FROM verification_sessions
      WHERE id = $1
      FOR UPDATE
      `,
      [verification_session_id]
    );

    if (sessionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Verification session not found",
      });
    }

    const session = sessionResult.rows[0];

    if (new Date(session.expires_at) < new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Verification session expired",
      });
    }

    if (session.is_used) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Verification session already used",
      });
    }

    const verificationFailure =
      getAttendanceVerificationFailure(session);

    if (verificationFailure) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        code: verificationFailure.code,
        message: verificationFailure.message,
      });
    }

    const openAttendanceResult = await client.query(
      `
      SELECT id
      FROM attendance_records
      WHERE employee_id = $1
        AND check_out_time IS NULL
      LIMIT 1
      `,
      [session.employee_id]
    );

    if (openAttendanceResult.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Employee already checked in",
      });
    }

    const statusResult = await client.query(
      `
      SELECT id
      FROM attendance_statuses
      WHERE status_name = 'CHECKED_IN'
      LIMIT 1
      `
    );

    if (statusResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(500).json({
        success: false,
        message: "CHECKED_IN status not configured",
      });
    }

    const attendanceResult = await client.query(
      `
      INSERT INTO attendance_records
      (
        employee_id,
        location_id,
        check_in_time,
        status_id,
        verification_status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, check_in_time
      `,
      [
        session.employee_id,
        session.location_id,
        parsedRecordTime,
        statusResult.rows[0].id,
        "VERIFIED",
      ]
    );

    await client.query(
      `
      UPDATE verification_sessions
      SET is_used = TRUE,
          updated_at = NOW()
      WHERE id = $1
      `,
      [verification_session_id]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      attendance_id: attendanceResult.rows[0].id,
      status: "CHECKED_IN",
      check_in_time: attendanceResult.rows[0].check_in_time,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating verified check-in:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};


export const createVerifiedCheckOut = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { verification_session_id, latitude, longitude, record_time } = req.body;

    if (
      !verification_session_id ||
      latitude === undefined ||
      longitude === undefined ||
      !record_time
    ) {
      return res.status(400).json({
        success: false,
        message:
          "verification_session_id, latitude, longitude and record_time are required",
      });
    }

    const parsedRecordTime = new Date(record_time);

    if (isNaN(parsedRecordTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid record_time",
      });
    }

    await client.query("BEGIN");

    const sessionResult = await client.query(
      `
      SELECT
        id,
        employee_id,
        location_id,
        secret_code_verified,
        selfie_verified,
        liveness_verified,
        gps_verified,
        verification_status,
        is_completed,
        is_used,
        expires_at
      FROM verification_sessions
      WHERE id = $1
      FOR UPDATE
      `,
      [verification_session_id]
    );

    if (sessionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Verification session not found",
      });
    }

    const session = sessionResult.rows[0];

    if (new Date(session.expires_at) < new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Verification session expired",
      });
    }

    if (session.is_used) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Verification session already used",
      });
    }

    const verificationFailure =
      getAttendanceVerificationFailure(session);

    if (verificationFailure) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        code: verificationFailure.code,
        message: verificationFailure.message,
      });
    }

    const statusResult = await client.query(
      `
      SELECT id
      FROM attendance_statuses
      WHERE status_name = 'CHECKED_OUT'
      LIMIT 1
      `
    );

    if (statusResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(500).json({
        success: false,
        message: "CHECKED_OUT status not configured",
      });
    }

    const openAttendanceResult = await client.query(
      `
      SELECT id, check_in_time
      FROM attendance_records
      WHERE employee_id = $1
        AND location_id = $2
        AND check_out_time IS NULL
      ORDER BY check_in_time DESC
      LIMIT 1
      FOR UPDATE
      `,
      [session.employee_id, session.location_id]
    );

    if (openAttendanceResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Open attendance check-in record not found",
      });
    }

    const openAttendance = openAttendanceResult.rows[0];

    if (parsedRecordTime < new Date(openAttendance.check_in_time)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Check-out time cannot be earlier than check-in time",
      });
    }

    const attendanceResult = await client.query(
      `
      UPDATE attendance_records
      SET
        check_out_time = $1,
        status_id = $2,
        verification_status = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING id, check_out_time
      `,
      [
        parsedRecordTime,
        statusResult.rows[0].id,
        "VERIFIED",
        openAttendance.id,
      ]
    );

    await client.query(
      `
      UPDATE verification_sessions
      SET is_used = TRUE,
          updated_at = NOW()
      WHERE id = $1
      `,
      [verification_session_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      attendance_id: attendanceResult.rows[0].id,
      status: "CHECKED_OUT",
      check_out_time: attendanceResult.rows[0].check_out_time,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error creating verified check-out:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};



