import {
  buildRequiredVerificationSteps,
  getIncompleteVerificationSteps,
  hasActiveFaceEnrollment,
} from "../utils/attendanceVerificationPolicy";
import { Request, Response } from "express";
import fs from "fs";
import pool from "../config/db";
import { verifyFaceWithPythonService } from "../services/pythonBiometric.service";
import { calculateDistanceMeters } from "../utils/gps.util";

const MAX_SECRET_CODE_ATTEMPTS = 3;

export const startVerificationSession = async (
  req: Request,
  res: Response
) => {
  const client = await pool.connect();

  try {
    const { employee_id, attendance_type, device_uuid } = req.body;

    if (!employee_id || !attendance_type || !device_uuid) {
      return res.status(400).json({
        success: false,
        message: "employee_id, attendance_type and device_uuid are required",
      });
    }

    if (!["CHECK_IN", "CHECK_OUT"].includes(attendance_type)) {
      return res.status(400).json({
        success: false,
        message: "attendance_type must be CHECK_IN or CHECK_OUT",
      });
    }

    await client.query("BEGIN");

    const deviceResult = await client.query(
      `
      SELECT
        d.id AS device_id,
        d.location_id,
        ds.status_name AS device_status
      FROM devices d
      JOIN device_statuses ds
        ON d.status_id = ds.id
      WHERE d.device_uuid = $1
      `,
      [device_uuid]
    );

    if (deviceResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Device not found",
      });
    }

    const device = deviceResult.rows[0];

    if (
      device.device_status !== "Active" &&
      device.device_status !== "ACTIVE"
    ) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "Device is not active or trusted",
      });
    }

    const employeeResult = await client.query(
      `
      SELECT
        e.id,
        e.location_id,
        e.secret_code_enabled,
        e.face_enrolled,
        e.biometric_status,
        e.verification_required,
        es.status_name AS employee_status
      FROM employees e
      JOIN employee_statuses es
        ON e.status_id = es.id
      WHERE e.id = $1
      `,
      [employee_id]
    );

    if (employeeResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const employee = employeeResult.rows[0];

    if (
      employee.employee_status !== "Active" &&
      employee.employee_status !== "ACTIVE"
    ) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "Employee is not active",
      });
    }

    if (Number(employee.location_id) !== Number(device.location_id)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "Employee is not allocated to this device location",
      });
    }

    const openAttendanceResult = await client.query(
      `
      SELECT id, location_id
      FROM attendance_records
      WHERE employee_id = $1
        AND check_out_time IS NULL
      ORDER BY check_in_time DESC
      `,
      [employee.id]
    );

    if (
      attendance_type === "CHECK_IN" &&
      openAttendanceResult.rows.length > 0
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        code: "ALREADY_DUTY_IN",
        message: "Employee is already Duty In.",
      });
    }

    const hasOpenAttendanceAtDeviceLocation =
      openAttendanceResult.rows.some(
        (attendance) =>
          Number(attendance.location_id) ===
          Number(device.location_id)
      );

    if (
      attendance_type === "CHECK_OUT" &&
      !hasOpenAttendanceAtDeviceLocation
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        code: "NOT_DUTY_IN",
        message:
          "Employee is not currently Duty In at this location.",
      });
    }

    if (!hasActiveFaceEnrollment(employee)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        code: "FACE_ENROLLMENT_REQUIRED",
        message:
          "Active face enrollment is required before attendance verification can start.",
      });
    }

    const expiresIn = 90;

    const sessionResult = await client.query(
      `
      INSERT INTO verification_sessions
      (
        employee_id,
        device_id,
        location_id,
        verification_status,
        expires_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        'PENDING',
        NOW() + INTERVAL '90 seconds'
      )
      RETURNING id
      `,
      [employee.id, device.device_id, device.location_id]
    );

    const requiredSteps = buildRequiredVerificationSteps(
      employee.secret_code_enabled === true
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      verification_session_id: sessionResult.rows[0].id,
      expires_in: expiresIn,
      required_steps: requiredSteps,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error starting verification session:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};


export const verifySecretCode = async (
  req: Request,
  res: Response
) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { secret_code } = req.body;

    if (!secret_code) {
      return res.status(400).json({
        success: false,
        message: "secret_code is required",
      });
    }

    await client.query("BEGIN");

    // Validate verification session
    const sessionResult = await client.query(
      `
      SELECT
        id,
        employee_id,
        is_used,
        expires_at,
        secret_code_attempts
      FROM verification_sessions
      WHERE id = $1
      `,
      [id]
    );

    if (sessionResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Verification session not found",
      });
    }

    const session = sessionResult.rows[0];

    if (session.is_used) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Verification session has already been used",
      });
    }

    if (new Date(session.expires_at) < new Date()) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Verification session has expired",
      });
    }

    // Check attempt limit
    if (session.secret_code_attempts >= MAX_SECRET_CODE_ATTEMPTS) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "Maximum secret code attempts exceeded",
        remaining_attempts: 0,
      });
    }

    // Get employee
    const employeeResult = await client.query(
      `
      SELECT
        employee_code,
        secret_code_enabled
      FROM employees
      WHERE id = $1
      `,
      [session.employee_id]
    );

    if (employeeResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const employee = employeeResult.rows[0];

    if (!employee.secret_code_enabled) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Secret code verification is disabled",
      });
    }

    // Compare secret code
    const updatedAttempts = session.secret_code_attempts + 1;

    if (secret_code !== employee.employee_code) {
      await client.query(
        `
        UPDATE verification_sessions
        SET
          secret_code_attempts = $1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [updatedAttempts, id]
      );

      await client.query("COMMIT");

      return res.status(401).json({
        success: false,
        message: "Invalid secret code",
        remaining_attempts: MAX_SECRET_CODE_ATTEMPTS - updatedAttempts,
      });
    }

    // Successful verification
    await client.query(
      `
      UPDATE verification_sessions
      SET
        secret_code_verified = TRUE,
        secret_code_attempts = $1,
        updated_at = NOW()
      WHERE id = $2
      `,
      [updatedAttempts, id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      secret_code_verified: true,
      remaining_attempts: MAX_SECRET_CODE_ATTEMPTS - updatedAttempts,
    });

   

  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};



export const uploadLiveSelfie = async (
  req: Request,
  res: Response
) => {
  const client = await pool.connect();

  try {
    const id = req.params.id as string;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Live selfie image is required",
      });
    }

    await client.query("BEGIN");

    const sessionResult = await client.query(
      `
      SELECT
        vs.id,
        vs.employee_id,
        vs.is_used,
        vs.expires_at,
        vs.secret_code_verified,
        e.secret_code_enabled,
        e.face_enrolled,
        e.biometric_status,
        efe.image_path
      FROM verification_sessions vs
      JOIN employees e
        ON vs.employee_id = e.id
      LEFT JOIN employee_face_enrollments efe
        ON efe.employee_id = e.id
      WHERE vs.id = $1
      `,
      [id]
    );

    if (sessionResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Verification session not found",
      });
    }

    const session = sessionResult.rows[0];

    if (session.is_used) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Verification session has already been used",
      });
    }

    if (new Date(session.expires_at) < new Date()) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Verification session has expired",
      });
    }

    if (session.secret_code_enabled === true && !session.secret_code_verified) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Secret code must be verified before live selfie",
      });
    }

    if (!session.face_enrolled || session.biometric_status !== "ACTIVE") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Employee face enrollment is not active",
      });
    }

    if (!session.image_path) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Employee reference face image not found",
      });
    }

    if (!fs.existsSync(session.image_path)) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        code: "FACE_ENROLLMENT_IMAGE_MISSING",
        message:
          "The enrolled face image is missing. Please re-enrol the employee's face.",
      });
    }

    let biometricResult;

    try {
      biometricResult = await verifyFaceWithPythonService(
        id,
        session.employee_id,
        session.image_path,
        req.file.path
      );
    } catch (pythonServiceError) {
      await client.query("ROLLBACK");

      const serviceError =
        pythonServiceError && typeof pythonServiceError === "object"
          ? (pythonServiceError as {
              code?: unknown;
              message?: unknown;
              httpStatus?: unknown;
              technicalMessage?: unknown;
            })
          : {};

      const isStructuredError =
        typeof serviceError.code === "string" &&
        serviceError.code.startsWith("VERIFICATION_SERVICE_") &&
        typeof serviceError.message === "string" &&
        typeof serviceError.httpStatus === "number";

      const errorCode = isStructuredError
        ? String(serviceError.code)
        : "VERIFICATION_SERVICE_UNAVAILABLE";

      const httpStatus = isStructuredError
        ? Number(serviceError.httpStatus)
        : 502;

      const userMessage = isStructuredError
        ? String(serviceError.message)
        : "The face verification service is temporarily unavailable. Please try again.";

      console.error("Python biometric service error:", {
        code: errorCode,
        verificationSessionId: id,
        employeeId: session.employee_id,
        httpStatus,
        technicalMessage:
          typeof serviceError.technicalMessage === "string"
            ? serviceError.technicalMessage
            : "Unexpected verification service failure.",
      });

      return res.status(httpStatus).json({
        success: false,
        code: errorCode,
        message: userMessage,
        retryable: true,
        error_reference: errorCode,
      });
    }
    if (
      !biometricResult.success ||
      !biometricResult.face_verified ||
      !biometricResult.liveness_passed
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        face_detected: biometricResult.face_detected,
        liveness_passed: biometricResult.liveness_passed,
        face_verified: biometricResult.face_verified,
        confidence_score: biometricResult.confidence_score,
        risk_score: biometricResult.risk_score,
        message: biometricResult.message || "Face verification failed",
      });
    }

    await client.query(
      `
      UPDATE verification_sessions
      SET
        selfie_verified = $1,
        liveness_verified = $2,
        updated_at = NOW()
      WHERE id = $3
      `,
      [
        biometricResult.face_verified,
        biometricResult.liveness_passed,
        id,
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: biometricResult.success,
      face_detected: biometricResult.face_detected,
      liveness_passed: biometricResult.liveness_passed,
      face_verified: biometricResult.face_verified,
      confidence_score: biometricResult.confidence_score,
      risk_score: biometricResult.risk_score,
      message: biometricResult.message,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    if (req.file?.path) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(
            "Failed to delete temporary live selfie:",
            cleanupError
          );
        }
      }
    }

    client.release();
  }
};

export const verifyGpsLocation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, accuracy } = req.body;

    if (
      latitude === undefined ||
      longitude === undefined ||
      accuracy === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "latitude, longitude and accuracy are required",
      });
    }

    const sessionResult = await pool.query(
      `
      SELECT
        id,
        location_id,
        gps_verified,
        expires_at,
        is_completed,
        is_used
      FROM verification_sessions
      WHERE id = $1
      `,
      [id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Verification session not found",
      });
    }

    const session = sessionResult.rows[0];

    if (new Date(session.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Verification session has expired",
      });
    }

    if (session.is_completed) {
      return res.status(400).json({
        success: false,
        message: "Verification session already completed",
      });
    }

    if (session.is_used) {
      return res.status(400).json({
        success: false,
        message: "Verification session already used",
      });
    }

    const locationResult = await pool.query(
      `
      SELECT
        id,
        latitude,
        longitude,
        allowed_radius_meters
      FROM service_locations
      WHERE id = $1
      `,
      [session.location_id]
    );

    if (locationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Service location not found",
      });
    }

    const location = locationResult.rows[0];

    if (location.latitude === null || location.longitude === null) {
      return res.status(400).json({
        success: false,
        message: "Service location GPS coordinates are not configured",
      });
    }

    const distanceMeters = calculateDistanceMeters(
      Number(latitude),
      Number(longitude),
      Number(location.latitude),
      Number(location.longitude)
    );

    const withinAllowedRadius =
      distanceMeters <= Number(location.allowed_radius_meters);

    await pool.query(
      `
      UPDATE verification_sessions
      SET
        gps_latitude = $1,
        gps_longitude = $2,
        gps_accuracy = $3,
        gps_distance_meters = $4,
        gps_within_allowed_radius = $5,
        gps_verified = $6,
        updated_at = NOW()
      WHERE id = $7
      `,
      [
        latitude,
        longitude,
        accuracy,
        distanceMeters,
        withinAllowedRadius,
        withinAllowedRadius,
        id,
      ]
    );

    return res.status(200).json({
      success: true,
      gps_verified: withinAllowedRadius,
      distance_meters: distanceMeters,
      within_allowed_radius: withinAllowedRadius,
    });
  } catch (error) {
    console.error("Error verifying GPS location:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const completeVerificationSession = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;

    const sessionResult = await pool.query(
      `
      SELECT
        vs.id,
        vs.secret_code_verified,
        vs.selfie_verified,
        vs.liveness_verified,
        vs.gps_verified,
        vs.is_completed,
        vs.is_used,
        vs.expires_at,
        e.secret_code_enabled,
        e.face_enrolled,
        e.biometric_status
      FROM verification_sessions vs
      JOIN employees e
        ON vs.employee_id = e.id
      WHERE vs.id = $1
      `,
      [id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Verification session not found",
      });
    }

    const session = sessionResult.rows[0];

    if (new Date(session.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Verification session has expired",
      });
    }

    if (session.is_completed) {
      return res.status(400).json({
        success: false,
        message: "Verification session already completed",
      });
    }

    if (session.is_used) {
      return res.status(400).json({
        success: false,
        message: "Verification session already used",
      });
    }

    if (!hasActiveFaceEnrollment(session)) {
      return res.status(403).json({
        success: false,
        code: "FACE_ENROLLMENT_REQUIRED",
        message:
          "Active face enrollment is required to complete attendance verification.",
      });
    }

    const incompleteSteps = getIncompleteVerificationSteps(session);

    if (incompleteSteps.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Verification steps are incomplete",
        incomplete_steps: incompleteSteps,
      });
    }

    await pool.query(
      `
      UPDATE verification_sessions
      SET
        is_completed = TRUE,
        verification_status = 'VERIFIED',
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      `,
      [id]
    );

    const expiresIn = Math.max(
      0,
      Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000)
    );

    return res.status(200).json({
      success: true,
      verification_completed: true,
      verification_session_id: id,
      verification_status: "VERIFIED",
      expires_in: expiresIn,
    });
  } catch (error) {
    console.error("Error completing verification session:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getVerificationSessionStatus = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;

    const sessionResult = await pool.query(
      `
      SELECT
        id,
        secret_code_verified,
        selfie_verified,
        liveness_verified,
        gps_verified,
        is_completed,
        verification_status,
        expires_at
      FROM verification_sessions
      WHERE id = $1
      `,
      [id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Verification session not found",
      });
    }

    const session = sessionResult.rows[0];

    return res.status(200).json({
      success: true,
      message: "Verification session loaded successfully",
      session,
    });

  } catch (error) {
    console.error("Error getting verification session:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

