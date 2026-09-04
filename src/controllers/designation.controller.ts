import { Request, Response } from "express";
import pool from "../config/db";

export const getDesignations = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id AS designation_id,
        designation_name
      FROM designations
      ORDER BY designation_name ASC
      `
    );

    res.status(200).json({
      success: true,
      designations: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch designations",
    });
  }
};