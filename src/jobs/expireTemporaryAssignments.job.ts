import pool from "../config/db";

export const expireTemporaryAssignments = async () => {
  try {
    const result = await pool.query(`
      UPDATE employee_temporary_assignments
      SET assignment_active = FALSE,
          updated_at = NOW()
      WHERE assignment_active = TRUE
        AND assignment_end_time < NOW()
    `);

    console.log(`Expired temporary assignments updated: ${result.rowCount}`);
  } catch (error) {
    console.error("Failed to expire temporary assignments:", error);
  }
};