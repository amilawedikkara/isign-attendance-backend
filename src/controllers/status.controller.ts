import { Request, Response } from "express";
import pool from "../config/db";

export const getStatuses = async (req: Request, res: Response) => {
  try {
    const employeeStatuses = await pool.query(
      `SELECT id, status_name FROM employee_statuses ORDER BY id ASC`
    );

    const attendanceStatuses = await pool.query(
      `SELECT id, status_name FROM attendance_statuses ORDER BY id ASC`
    );

    const rosterStatuses = await pool.query(
      `SELECT id, status_name FROM roster_statuses ORDER BY id ASC`
    );

    const deviceStatuses = await pool.query(
      `SELECT id, status_name FROM device_statuses ORDER BY id ASC`
    );

    return res.status(200).json({
      success: true,
      statuses: {
        employee_statuses: employeeStatuses.rows,
        attendance_statuses: attendanceStatuses.rows,
        roster_statuses: rosterStatuses.rows,
        device_statuses: deviceStatuses.rows,
      },
    });
  } catch (error) {
    console.error("Get statuses error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch statuses",
    });
  }
};