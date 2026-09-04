import { Request, Response } from "express";
import pool from "../config/db";

export const getRosters = async (req: Request, res: Response) => {
  try {
    const { employee_id, location_id, roster_date } = req.query;

    let query = `
      SELECT 
        id AS roster_id,
        employee_id,
        location_id,
        shift_start_time,
        shift_end_time,
        status_id
      FROM rosters
      WHERE 1=1
    `;

    const values: any[] = [];

    if (employee_id) {
      values.push(employee_id);
      query += ` AND employee_id = $${values.length}`;
    }

    if (location_id) {
      values.push(location_id);
      query += ` AND location_id = $${values.length}`;
    }

    if (roster_date) {
      values.push(roster_date);
      query += ` AND DATE(shift_start_time) = $${values.length}`;
    }

    query += ` ORDER BY shift_start_time ASC`;

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      rosters: result.rows,
    });
  } catch (error) {
    console.error("Get rosters error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const createRoster = async (req: Request, res: Response) => {
  try {
    const {
      employee_id,
      location_id,
      shift_start_time,
      shift_end_time,
      status_id,
    } = req.body;

    if (
      !employee_id ||
      !location_id ||
      !shift_start_time ||
      !shift_end_time ||
      !status_id
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO rosters
      (employee_id, location_id, shift_start_time, shift_end_time, status_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [employee_id, location_id, shift_start_time, shift_end_time, status_id]
    );

    res.status(201).json({
      success: true,
      message: "Roster created successfully",
      roster: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating roster:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create roster",
    });
  }
};

export const updateRoster = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const {
      shift_start_time,
      shift_end_time,
      status_id,
    } = req.body;

    const existingRoster = await pool.query(
      `SELECT * FROM rosters WHERE id = $1`,
      [id]
    );

    if (existingRoster.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Roster not found",
      });
    }

    const result = await pool.query(
      `
      UPDATE rosters
      SET
        shift_start_time = $1,
        shift_end_time = $2,
        status_id = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
      `,
      [shift_start_time, shift_end_time, status_id, id]
    );

    res.status(200).json({
      success: true,
      message: "Roster updated successfully",
      roster: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating roster:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update roster",
    });
  }
};

export const deleteRoster = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM rosters WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Roster not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Roster deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting roster:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete roster",
    });
  }
};