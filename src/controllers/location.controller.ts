import { Request, Response } from "express";
import pool from "../config/db";

export const getLocations = async (req: Request, res: Response) => {
  try {
    const { region_id } = req.query;

    let query = `
      SELECT
        service_locations.id AS location_id,
        service_locations.location_name,
        service_locations.location_code,
        service_locations.latitude,
        service_locations.longitude,
        service_locations.region_id,
        regions.region_name
      FROM service_locations
      LEFT JOIN regions ON service_locations.region_id = regions.id
    `;

    const values: any[] = [];

    if (region_id) {
      query += ` WHERE service_locations.region_id = $1`;
      values.push(region_id);
    }

    query += ` ORDER BY service_locations.id ASC`;

    const result = await pool.query(query, values);

    res.status(200).json({
      success: true,
      locations: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch locations",
    });
  }
};


export const createLocation = async (req: Request, res: Response) => {
  try {
    const {
      location_name,
      location_code,
      region_id,
      latitude,
      longitude,
    } = req.body;

    if (!location_name || !location_code || !region_id || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "location_name, location_code, region_id, latitude and longitude are required",
      });
    }

    const existingLocation = await pool.query(
      `SELECT id
       FROM service_locations
       WHERE LOWER(location_name) = LOWER($1)
       AND region_id = $2`,
      [location_name, region_id]
    );

    if (existingLocation.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Location already exists in this region",
      });
    }

    const existingCode = await pool.query(
      `SELECT id
       FROM service_locations
       WHERE location_code = $1`,
      [location_code]
    );

    if (existingCode.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Location code already exists",
      });
    }

    const result = await pool.query(
      `INSERT INTO service_locations
       (location_name, location_code, region_id, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
         id AS location_id,
         location_name,
         location_code,
         region_id,
         latitude,
         longitude`,
      [location_name, location_code, region_id, latitude, longitude]
    );

    res.status(201).json({
      success: true,
      location: result.rows[0],
    });

  } catch (error: any) {
    console.error(error);

    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Location code already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create location",
    });
  }
};

export const updateLocation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const {
      location_name,
      location_code,
      region_id,
      latitude,
      longitude,
    } = req.body;

    if (!location_name || !location_code || !region_id || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "location_name, location_code, region_id, latitude and longitude are required",
      });
    }

    const existingLocation = await pool.query(
      `SELECT id
       FROM service_locations
       WHERE id = $1`,
      [id]
    );

    if (existingLocation.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Location not found",
      });
    }

    const duplicateLocation = await pool.query(
      `SELECT id
       FROM service_locations
       WHERE LOWER(location_name) = LOWER($1)
       AND region_id = $2
       AND id != $3`,
      [location_name, region_id, id]
    );

    if (duplicateLocation.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Location already exists in this region",
      });
    }

    const duplicateCode = await pool.query(
      `SELECT id
       FROM service_locations
       WHERE location_code = $1
       AND id != $2`,
      [location_code, id]
    );

    if (duplicateCode.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Location code already exists",
      });
    }

    const result = await pool.query(
      `UPDATE service_locations
       SET location_name = $1,
           location_code = $2,
           region_id = $3,
           latitude = $4,
           longitude = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING
         id AS location_id,
         location_name,
         location_code,
         region_id,
         latitude,
         longitude`,
      [location_name, location_code, region_id, latitude, longitude, id]
    );

    res.status(200).json({
      success: true,
      location: result.rows[0],
    });
  } catch (error: any) {
    console.error(error);

    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Location code already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update location",
    });
  }
};

export const deleteLocation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM service_locations WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Location not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Location deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to delete location",
    });
  }
};

