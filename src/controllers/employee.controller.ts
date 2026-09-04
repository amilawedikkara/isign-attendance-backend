import { AuthRequest } from "../middlewares/auth.middleware";
import { Request, Response } from "express";
import pool from "../config/db";

export const getEmployees = async (req: AuthRequest, res: Response) => {
  try {
    const { location_id, designation_id, status_id, search } = req.query;

    const isAdmin = req.user?.role_id === 1;

    let query = `
      SELECT
        employees.id AS employee_id,
        ${isAdmin ? "employees.employee_code," : ""}
        employees.gid,
        employees.gender,
        employees.profile_image_url,
        employees.full_name,

        COALESCE(
          permanent_locations.location_ids,
          ARRAY[employees.location_id]
        ) AS permanent_location_ids,

        COALESCE(
          temporary_locations.location_ids,
          ARRAY[]::INT[]
        ) AS temporary_location_ids,

        employees.location_id,
        employees.mobile_number,
        employees.status_id,
        employees.secret_code_enabled,
        employees.face_enrolled,
        employees.biometric_status,
        employees.verification_required

      FROM employees

      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(
            DISTINCT permanent_assignments.new_location_id
            ORDER BY permanent_assignments.new_location_id
          ) AS location_ids
        FROM employee_location_assignments AS permanent_assignments
        WHERE permanent_assignments.employee_id = employees.id
          AND permanent_assignments.assignment_type = 'PERMANENT'
          AND permanent_assignments.assignment_active = TRUE
          AND permanent_assignments.assignment_end_time IS NULL
      ) AS permanent_locations ON TRUE

      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(
            DISTINCT temporary_assignments.temporary_location_id
            ORDER BY temporary_assignments.temporary_location_id
          ) AS location_ids
        FROM employee_temporary_assignments AS temporary_assignments
        WHERE temporary_assignments.employee_id = employees.id
          AND temporary_assignments.assignment_active = TRUE
          AND NOW() BETWEEN
              temporary_assignments.assignment_start_time
              AND temporary_assignments.assignment_end_time
      ) AS temporary_locations ON TRUE
    `;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (location_id) {
      const parsedLocationId = Number(location_id);

      if (!Number.isInteger(parsedLocationId) || parsedLocationId <= 0) {
        return res.status(400).json({
          success: false,
          message: "location_id must be a valid positive integer",
        });
      }

      values.push(parsedLocationId);
      const parameter = `$${values.length}`;

      conditions.push(`
        (
          employees.location_id = ${parameter}

          OR EXISTS (
            SELECT 1
            FROM employee_location_assignments AS location_filter
            WHERE location_filter.employee_id = employees.id
              AND location_filter.assignment_type = 'PERMANENT'
              AND location_filter.assignment_active = TRUE
              AND location_filter.assignment_end_time IS NULL
              AND location_filter.new_location_id = ${parameter}
          )

          OR EXISTS (
            SELECT 1
            FROM employee_temporary_assignments AS temporary_filter
            WHERE temporary_filter.employee_id = employees.id
              AND temporary_filter.assignment_active = TRUE
              AND NOW() BETWEEN
                  temporary_filter.assignment_start_time
                  AND temporary_filter.assignment_end_time
              AND temporary_filter.temporary_location_id = ${parameter}
          )
        )
      `);
    }

    if (designation_id) {
      const parsedDesignationId = Number(designation_id);

      if (!Number.isInteger(parsedDesignationId) || parsedDesignationId <= 0) {
        return res.status(400).json({
          success: false,
          message: "designation_id must be a valid positive integer",
        });
      }

      values.push(parsedDesignationId);
      conditions.push(`employees.designation_id = $${values.length}`);
    }

    if (status_id) {
      const parsedStatusId = Number(status_id);

      if (!Number.isInteger(parsedStatusId) || parsedStatusId <= 0) {
        return res.status(400).json({
          success: false,
          message: "status_id must be a valid positive integer",
        });
      }

      values.push(parsedStatusId);
      conditions.push(`employees.status_id = $${values.length}`);
    }

   if (typeof search === "string" && search.trim()) {
    values.push(`%${search.trim()}%`);
    const parameter = `$${values.length}`;

    conditions.push(`
      (
        employees.full_name ILIKE ${parameter}
        ${isAdmin ? `OR employees.employee_code ILIKE ${parameter}` : ""}
        OR employees.gid ILIKE ${parameter}
      )
    `);
  }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += `
      ORDER BY employees.id ASC
    `;

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      employees: result.rows,
    });
  } catch (error) {
    console.error("Failed to fetch employees:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch employees",
    });
  }
};

export const createEmployee = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const {
      employee_code,
      gid,
      gender,
      full_name,
      designation_id,
      permanent_location_ids,
      mobile_number,
      status_id,
    } = req.body;

    if (
      !employee_code ||
      !gid ||
      !gender ||
      !full_name ||
      !designation_id ||
      !Array.isArray(permanent_location_ids) ||
      permanent_location_ids.length === 0 ||
      !status_id
    ) {
      return res.status(400).json({
        success: false,
        message:
          "employee_code, gid, gender, full_name, designation_id, permanent_location_ids and status_id are required",
      });
    }

    if (!["Male", "Female", "Other"].includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "gender must be Male, Female or Other",
      });
    }

    const uniquePermanentLocationIds = [
      ...new Set(permanent_location_ids.map((id: unknown) => Number(id))),
    ];

    if (
      uniquePermanentLocationIds.some(
        (id) => !Number.isInteger(id) || id <= 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "permanent_location_ids must contain valid positive integers",
      });
    }

    await client.query("BEGIN");

    const employeeCodeResult = await client.query(
      `SELECT id
       FROM employees
       WHERE employee_code = $1`,
      [employee_code]
    );

    if (employeeCodeResult.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Employee code already exists",
      });
    }

    const gidResult = await client.query(
      `SELECT id
       FROM employees
       WHERE gid = $1`,
      [gid]
    );

    if (gidResult.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "GID already exists",
      });
    }

    const designationResult = await client.query(
      `SELECT id
       FROM designations
       WHERE id = $1`,
      [designation_id]
    );

    if (designationResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Designation not found",
      });
    }

    const statusResult = await client.query(
      `SELECT id
       FROM employee_statuses
       WHERE id = $1`,
      [status_id]
    );

    if (statusResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Employee status not found",
      });
    }

    const locationResult = await client.query(
      `SELECT id
       FROM service_locations
       WHERE id = ANY($1::int[])`,
      [uniquePermanentLocationIds]
    );

    if (locationResult.rows.length !== uniquePermanentLocationIds.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "One or more permanent locations not found",
      });
    }

    const mainLocationId = uniquePermanentLocationIds[0];

    const employeeResult = await client.query(
      `
      INSERT INTO employees
      (
        employee_code,
        gid,
        gender,
        full_name,
        designation_id,
        location_id,
        mobile_number,
        status_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id AS employee_id
      `,
      [
        employee_code,
        gid,
        gender,
        full_name,
        designation_id,
        mainLocationId,
        mobile_number || null,
        status_id,
      ]
    );

    const employee = employeeResult.rows[0];

    for (const locationId of uniquePermanentLocationIds) {
      await client.query(
        `
        INSERT INTO employee_location_assignments
        (
          employee_id,
          previous_location_id,
          new_location_id,
          assignment_type,
          assignment_reason,
          assignment_start_time,
          assignment_end_time,
          assignment_active
        )
        VALUES
        (
          $1,
          NULL,
          $2,
          'PERMANENT',
          'Initial employee creation',
          NOW(),
          NULL,
          TRUE
        )
        `,
        [employee.employee_id, locationId]
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Employee created successfully",
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Failed to create employee:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Employee code or GID already exists",
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "Invalid related record reference",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create employee",
    });
  } finally {
    client.release();
  }
};

export const updateEmployee = async (
  req: Request,
  res: Response
) => {
  const client = await pool.connect();

  try {
    const employeeId = Number(req.params.id);

    const {
      employee_code,
      gid,
      gender,
      profile_image_url,
      full_name,
      designation_id,
      permanent_location_ids,
      mobile_number,
      status_id,
    } = req.body;

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Employee ID must be a valid positive integer",
      });
    }

    if (
      !employee_code ||
      !gid ||
      !gender ||
      !full_name ||
      !designation_id ||
      !Array.isArray(permanent_location_ids) ||
      permanent_location_ids.length === 0 ||
      !status_id
    ) {
      return res.status(400).json({
        success: false,
        message:
          "employee_code, gid, gender, full_name, designation_id, permanent_location_ids and status_id are required",
      });
    }

    if (!["Male", "Female", "Other"].includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "gender must be Male, Female or Other",
      });
    }

    const uniquePermanentLocationIds = [
      ...new Set(
        permanent_location_ids.map((locationId: unknown) =>
          Number(locationId)
        )
      ),
    ];

    if (
      uniquePermanentLocationIds.some(
        (locationId) =>
          !Number.isInteger(locationId) || locationId <= 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "permanent_location_ids must contain valid positive integers",
      });
    }

    await client.query("BEGIN");

    const existingEmployeeResult = await client.query(
      `
      SELECT id, location_id
      FROM employees
      WHERE id = $1
      `,
      [employeeId]
    );

    if (existingEmployeeResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const duplicateEmployeeCodeResult = await client.query(
      `
      SELECT id
      FROM employees
      WHERE employee_code = $1
        AND id <> $2
      `,
      [employee_code, employeeId]
    );

    if (duplicateEmployeeCodeResult.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Employee code already exists",
      });
    }

    const duplicateGidResult = await client.query(
      `
      SELECT id
      FROM employees
      WHERE gid = $1
        AND id <> $2
      `,
      [gid, employeeId]
    );

    if (duplicateGidResult.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "GID already exists",
      });
    }

    const designationResult = await client.query(
      `
      SELECT id
      FROM designations
      WHERE id = $1
      `,
      [designation_id]
    );

    if (designationResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Designation not found",
      });
    }

    const statusResult = await client.query(
      `
      SELECT id
      FROM employee_statuses
      WHERE id = $1
      `,
      [status_id]
    );

    if (statusResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Employee status not found",
      });
    }

    const locationResult = await client.query(
      `
      SELECT id
      FROM service_locations
      WHERE id = ANY($1::int[])
      `,
      [uniquePermanentLocationIds]
    );

    if (
      locationResult.rows.length !==
      uniquePermanentLocationIds.length
    ) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "One or more permanent locations not found",
      });
    }

    const activeAssignmentsResult = await client.query(
      `
      SELECT new_location_id
      FROM employee_location_assignments
      WHERE employee_id = $1
        AND assignment_type = 'PERMANENT'
        AND assignment_active = TRUE
        AND assignment_end_time IS NULL
      `,
      [employeeId]
    );

    const currentPermanentLocationIds: number[] =
      activeAssignmentsResult.rows.map((row) =>
        Number(row.new_location_id)
      );

    const removedLocationIds =
      currentPermanentLocationIds.filter(
        (locationId) =>
          !uniquePermanentLocationIds.includes(locationId)
      );

    const addedLocationIds =
      uniquePermanentLocationIds.filter(
        (locationId) =>
          !currentPermanentLocationIds.includes(locationId)
      );

    const newMainLocationId =
      uniquePermanentLocationIds[0];

    await client.query(
      `
      UPDATE employees
      SET employee_code = $1,
          gid = $2,
          gender = $3,
          profile_image_url = $4,
          full_name = $5,
          designation_id = $6,
          location_id = $7,
          mobile_number = $8,
          status_id = $9,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      `,
      [
        employee_code,
        gid,
        gender,
        profile_image_url || null,
        full_name,
        designation_id,
        newMainLocationId,
        mobile_number || null,
        status_id,
        employeeId,
      ]
    );

    if (removedLocationIds.length > 0) {
      await client.query(
        `
        UPDATE employee_location_assignments
        SET assignment_active = FALSE,
            assignment_end_time = CURRENT_TIMESTAMP
        WHERE employee_id = $1
          AND assignment_type = 'PERMANENT'
          AND assignment_active = TRUE
          AND assignment_end_time IS NULL
          AND new_location_id = ANY($2::int[])
        `,
        [employeeId, removedLocationIds]
      );
    }

    const replacementPreviousLocationId =
      removedLocationIds.length === 1 &&
      addedLocationIds.length === 1
        ? removedLocationIds[0]
        : null;

    for (const locationId of addedLocationIds) {
      await client.query(
        `
        INSERT INTO employee_location_assignments
        (
          employee_id,
          previous_location_id,
          new_location_id,
          assignment_type,
          assignment_reason,
          assignment_start_time,
          assignment_end_time,
          assignment_active
        )
        VALUES
        (
          $1,
          $2,
          $3,
          'PERMANENT',
          'Employee permanent locations updated',
          CURRENT_TIMESTAMP,
          NULL,
          TRUE
        )
        `,
        [
          employeeId,
          replacementPreviousLocationId,
          locationId,
        ]
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Employee updated successfully",
    });
  } catch (error: any) {
    await client.query("ROLLBACK");

    console.error("Failed to update employee:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Employee code or GID already exists",
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "Invalid related record reference",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update employee",
    });
  } finally {
    client.release();
  }
};

export const deleteEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE employees
      SET status_id = (
        SELECT id
        FROM employee_statuses
        WHERE status_name = 'Inactive'
      ),
      updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Employee deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete employee",
    });
  }
};

export const createTemporaryEmployeeAssignment = async (
  req: Request,
  res: Response
) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    const {
      temporary_location_ids,
      assignment_start_time,
      assignment_end_time,
      assignment_reason,
    } = req.body;

    if (
      !Array.isArray(temporary_location_ids) ||
      temporary_location_ids.length === 0 ||
      !assignment_start_time ||
      !assignment_end_time
    ) {
      return res.status(400).json({
        success: false,
        message:
          "temporary_location_ids, assignment_start_time and assignment_end_time are required",
      });
    }

    const startTime = new Date(assignment_start_time);
    const endTime = new Date(assignment_end_time);
    const now = new Date();

    if (endTime <= startTime) {
      return res.status(400).json({
        success: false,
        message: "assignment_end_time must be after assignment_start_time",
      });
    }

    if (endTime < now) {
      return res.status(400).json({
        success: false,
        message: "Cannot create an expired temporary assignment",
      });
    }

    await client.query("BEGIN");

    const employeeResult = await client.query(
      `SELECT id, location_id
       FROM employees
       WHERE id = $1`,
      [id]
    );

    if (employeeResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const locationResult = await client.query(
      `SELECT id
       FROM service_locations
       WHERE id = ANY($1::int[])`,
      [temporary_location_ids]
    );

    if (locationResult.rows.length !== temporary_location_ids.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "One or more temporary locations not found",
      });
    }

    const originalLocationId = employeeResult.rows[0].location_id;

    for (const locationId of temporary_location_ids) {
      await client.query(
        `INSERT INTO employee_temporary_assignments
         (
           employee_id,
           original_location_id,
           temporary_location_id,
           assignment_start_time,
           assignment_end_time,
           assignment_reason,
           assignment_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
        [
          id,
          originalLocationId,
          locationId,
          assignment_start_time,
          assignment_end_time,
          assignment_reason || null,
        ]
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      employee_id: Number(id),
      temporary_location_ids,
      assignment_active: true,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to create temporary employee assignment",
    });
  } finally {
    client.release();
  }
};

export const createPermanentEmployeeAssignment = async (
  req: Request,
  res: Response
) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    const { permanent_location_ids, assignment_reason } = req.body;

    if (
      !Array.isArray(permanent_location_ids) ||
      permanent_location_ids.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "permanent_location_ids are required",
      });
    }

    await client.query("BEGIN");

    const employeeResult = await client.query(
      `SELECT id, location_id
       FROM employees
       WHERE id = $1`,
      [id]
    );

    if (employeeResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const locationResult = await client.query(
      `SELECT id
       FROM service_locations
       WHERE id = ANY($1::int[])`,
      [permanent_location_ids]
    );

    if (locationResult.rows.length !== permanent_location_ids.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "One or more permanent locations not found",
      });
    }

    const previousLocationId = employeeResult.rows[0].location_id;
    const newPrimaryLocationId = permanent_location_ids[0];

    await client.query(
      `UPDATE employees
       SET location_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newPrimaryLocationId, id]
    );

    await client.query(
      `DELETE FROM employee_location_assignments
       WHERE employee_id = $1
       AND assignment_type = 'PERMANENT'`,
      [id]
    );

    for (const locationId of permanent_location_ids) {
      await client.query(
        `INSERT INTO employee_location_assignments
         (
           employee_id,
           previous_location_id,
           new_location_id,
           assignment_type,
           assignment_reason
         )
         VALUES ($1, $2, $3, 'PERMANENT', $4)`,
        [
          id,
          previousLocationId,
          locationId,
          assignment_reason || "Permanent employee assignment",
        ]
      );
    }

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      employee_id: Number(id),
      permanent_location_ids,
      assignment_type: "PERMANENT",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to create permanent employee assignment",
    });
  } finally {
    client.release();
  }
};

export const getEmployeeAssignmentHistory = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;

    const employeeResult = await pool.query(
      `SELECT id FROM employees WHERE id = $1`,
      [id]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const permanentAssignments = await pool.query(
      `
      SELECT
        'PERMANENT' AS assignment_type,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT previous_location_id), NULL) AS from_location_ids,
        ARRAY_AGG(DISTINCT new_location_id) AS to_location_ids,
        NULL AS assignment_start_time,
        NULL AS assignment_end_time,
        'COMPLETED' AS assignment_status,
        MAX(created_at) AS created_at
      FROM employee_location_assignments
      WHERE employee_id = $1
      GROUP BY employee_id, assignment_reason, created_at
      `,
      [id]
    );

    const temporaryAssignments = await pool.query(
      `
      SELECT
        'TEMPORARY' AS assignment_type,
        ARRAY_AGG(DISTINCT original_location_id) AS from_location_ids,
        ARRAY_AGG(DISTINCT temporary_location_id) AS to_location_ids,
        assignment_start_time,
        assignment_end_time,
        CASE
          WHEN assignment_active = TRUE
          AND NOW() BETWEEN assignment_start_time AND assignment_end_time
          THEN 'ACTIVE'
          ELSE 'EXPIRED'
        END AS assignment_status,
        MAX(created_at) AS created_at
      FROM employee_temporary_assignments
      WHERE employee_id = $1
      GROUP BY employee_id, assignment_start_time, assignment_end_time, assignment_active, assignment_reason, created_at
      `,
      [id]
    );

    const assignments = [
      ...permanentAssignments.rows,
      ...temporaryAssignments.rows,
    ].sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );

    const cleanedAssignments = assignments.map(({ created_at, ...rest }) => rest);

    res.status(200).json({
      success: true,
      employee_id: Number(id),
      assignments: cleanedAssignments,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch employee assignment history",
    });
  }
};

