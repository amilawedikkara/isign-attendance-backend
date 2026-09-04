import { Request, Response } from "express";
import pool from "../config/db";

export const enrollFace = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { employee_id } = req.body;

    if (!employee_id) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Face image is required",
      });
    }

    await client.query("BEGIN");

    const employeeResult = await client.query(
      `SELECT id FROM employees WHERE id = $1`,
      [employee_id]
    );

    if (employeeResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const qualityScore = 0.93;

    const enrollmentResult = await client.query(
      `
      INSERT INTO employee_face_enrollments
      (employee_id, image_path, biometric_status, quality_score, enrolled_at, updated_at)
      VALUES ($1, $2, 'ACTIVE', $3, NOW(), NOW())
      ON CONFLICT (employee_id)
      DO UPDATE SET
        image_path = EXCLUDED.image_path,
        biometric_status = 'ACTIVE',
        quality_score = EXCLUDED.quality_score,
        updated_at = NOW()
      RETURNING employee_id, quality_score
      `,
      [employee_id, req.file.path, qualityScore]
    );

    await client.query(
      `
      UPDATE employees
      SET face_enrolled = TRUE,
          biometric_status = 'ACTIVE',
          updated_at = NOW()
      WHERE id = $1
      `,
      [employee_id]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      enrollment_completed: true,
      employee_id: enrollmentResult.rows[0].employee_id,
      quality_score: Number(enrollmentResult.rows[0].quality_score),
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

export const getFaceEnrollmentStatus = async (
  req: Request,
  res: Response
) => {
  try {
    const { employee_id } = req.params;

    const employeeResult = await pool.query(
      `
      SELECT id, face_enrolled, biometric_status
      FROM employees
      WHERE id = $1
      `,
      [employee_id]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const enrollmentResult = await pool.query(
      `
      SELECT biometric_status, updated_at
      FROM employee_face_enrollments
      WHERE employee_id = $1
      `,
      [employee_id]
    );

    const enrolled =
      enrollmentResult.rows.length > 0 &&
      enrollmentResult.rows[0].biometric_status === "ACTIVE";

    return res.status(200).json({
      success: true,
      employee_id: Number(employee_id),
      enrolled,
      biometric_status: enrolled
        ? enrollmentResult.rows[0].biometric_status
        : employeeResult.rows[0].biometric_status,
      last_updated: enrolled ? enrollmentResult.rows[0].updated_at : null,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};