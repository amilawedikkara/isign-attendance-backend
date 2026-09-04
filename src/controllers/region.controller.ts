import { Request, Response } from "express";
import pool from "../config/db";

export const getRegions = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
         id,
         region_name
       FROM regions
       ORDER BY region_name ASC`
    );

    return res.status(200).json({
      success: true,
      regions: result.rows,
    });
  } catch (error) {
    console.error("Get regions error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch regions",
    });
  }
};