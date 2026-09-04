import { Request, Response } from "express";
import bcrypt from "bcrypt";
import pool from "../config/db";

export const getDevices = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
        d.id,
        d.platform,
        d.location_id,
        sl.location_name,
        d.status_id,
        ds.status_name,
        d.code,
        d.created_at,
        d.updated_at
      FROM devices d
      LEFT JOIN service_locations sl ON d.location_id = sl.id
      LEFT JOIN device_statuses ds ON d.status_id = ds.id
      ORDER BY d.id ASC`
    );

    res.status(200).json({
      success: true,
      devices: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(200).json({
      success: false,
      message: "Failed to fetch devices",
    });
  }
};

export const getDeviceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid device ID",
      });
    }

    const result = await pool.query(
      `SELECT
        d.id,
        d.platform,
        d.location_id,
        sl.location_name,
        d.status_id,
        ds.status_name,
        d.code,
        d.created_at,
        d.updated_at
      FROM devices d
      LEFT JOIN service_locations sl ON d.location_id = sl.id
      LEFT JOIN device_statuses ds ON d.status_id = ds.id
      WHERE d.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        message: "Device not found",
      });
    }

    res.status(200).json({
      success: true,
      device: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(200).json({
      success: false,
      message: "Failed to fetch device",
    });
  }
};

export const deleteDevice = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const device = await client.query(
      "SELECT id FROM devices WHERE id = $1",
      [id]
    );

    if (device.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(200).json({
        success: false,
        message: "Device not found",
      });
    }
    await client.query("DELETE FROM devices WHERE id = $1", [id]);

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Device deleted successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    return res.status(200).json({
      success: false,
      message: "Failed to delete device",
    });
  } finally {
    client.release();
  }
};

export const registerDevice = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { device_uuid, device_model, platform, location_code } = req.body;

    if (!device_uuid || !location_code) {
      return res.status(200).json({
        success: false,
        message: "device_uuid, location_code are required",
      });
    }

    await client.query("BEGIN");

    // Resolve location_id, location_name and mobile numbers from location_code
    const locationResult = await client.query(
      "SELECT id, location_name, mobile_1, mobile_2 FROM service_locations WHERE location_code = $1",
      [location_code]
    );

    if (locationResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(200).json({
        success: false,
        message: "Invalid location_code",
      });
    }

    const { id: location_id, location_name, mobile_1, mobile_2 } = locationResult.rows[0];

    // Check if same device is already pending activation (status_id=2) at this location
    const pendingDevice = await client.query(
      `SELECT id FROM devices WHERE device_uuid = $1 AND location_id = $2 AND status_id = 2`,
      [device_uuid, location_id]
    );

    if (pendingDevice.rows.length > 0) {
      // Re-generate code and update existing pending device
      const code = String(Math.floor(1000 + Math.random() * 9000));

      await client.query(
        `UPDATE devices SET code = $1, updated_at = NOW() WHERE id = $2`,
        [code, pendingDevice.rows[0].id]
      );

      await client.query("COMMIT");

      const message = `Validate mobile for ${location_name} with OTP:${code}`;

      try {
        if (mobile_1) {
          await pool.query(
            `INSERT INTO sms_queue (number, message, status, reference) VALUES ($1, $2, 0, NULL)`,
            [mobile_1, message]
          );
        }
        if (mobile_2) {
          await pool.query(
            `INSERT INTO sms_queue (number, message, status, reference) VALUES ($1, $2, 0, NULL)`,
            [mobile_2, message]
          );
        }
      } catch (smsError) {
        console.error("[SMS Queue] Failed to queue SMS:", smsError);
      }

      return res.status(200).json({
        success: true,
        message: "New OTP generated and queued for existing pending device",
      });
    }

    // Check if location already has a different registered device
    const locationDevice = await client.query(
      "SELECT id FROM devices WHERE location_id = $1",
      [location_id]
    );

    if (locationDevice.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(200).json({
        success: false,
        message: "Another device is registered to the location",
      });
    }

    // Check device_uuid is not already registered at another location
    const existing = await client.query(
      `SELECT d.id, sl.location_name
       FROM devices d
       LEFT JOIN service_locations sl ON d.location_id = sl.id
       WHERE d.device_uuid = $1`,
      [device_uuid]
    );

    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");

      const locationName = existing.rows[0].location_name ?? "Unknown Location";

      return res.status(200).json({
        success: false,
        message: `Device already registered to ${locationName}`,
      });
    }

    // Generate random 4-digit code
    const code = String(Math.floor(1000 + Math.random() * 9000));

    // Create device
    await client.query(
      `INSERT INTO devices (device_uuid, device_model, platform, location_id, status_id, code)
       VALUES ($1, $2, $3, $4, 2, $5)`,
      [device_uuid, device_model, platform, location_id, code]
    );

    await client.query("COMMIT");

    // SMS queue inserts are best-effort — device registration succeeds regardless
    const message = `Validate mobile for ${location_name} with OTP:${code}`;

    try {
      if (mobile_1) {
        console.log("[SMS Queue] INSERT number=%s message=%s", mobile_1, message);
        await pool.query(
          `INSERT INTO sms_queue (number, message, status, reference) VALUES ($1, $2, 0, NULL)`,
          [mobile_1, message]
        );
      }

      if (mobile_2) {
        console.log("[SMS Queue] INSERT number=%s message=%s", mobile_2, message);
        await pool.query(
          `INSERT INTO sms_queue (number, message, status, reference) VALUES ($1, $2, 0, NULL)`,
          [mobile_2, message]
        );
      }
    } catch (smsError) {
      console.error("[SMS Queue] Failed to queue SMS:", smsError);
    }

    return res.status(200).json({
      success: true,
      message: "Device registered successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to register device",
    });
  } finally {
    client.release();
  }
};

export const activateDevice = async (req: Request, res: Response) => {
  try {
    const { location_code, otp, device_uuid } = req.body;

    if (!location_code || !otp || !device_uuid) {
      return res.status(400).json({
        success: false,
        message: "location_code, otp and device_uuid are required",
      });
    }

    const result = await pool.query(
      `
      SELECT 
        d.id,
        d.code,
        d.status_id,
        sl.id AS location_id,
        sl.location_code,
        sl.location_name
      FROM devices d
      JOIN service_locations sl ON d.location_id = sl.id
      WHERE d.device_uuid = $1 
        AND sl.location_code = $2
      `,
      [device_uuid, location_code]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        message: "Device not found for the given UUID and location code",
      });
    }

    const device = result.rows[0];

    if (device.code !== otp) {
      return res.status(200).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const activatedResult = await pool.query(
      `
      UPDATE devices d
      SET 
        status_id = 1,
        code = NULL,
        updated_at = NOW()
      FROM service_locations sl
      JOIN device_statuses ds ON ds.id = 1
      WHERE d.id = $1
        AND d.location_id = sl.id
      RETURNING
        sl.id AS location_id,
        sl.location_code,
        sl.location_name,
        d.status_id,
        ds.status_name
      `,
      [device.id]
    );

    return res.status(200).json({
      success: true,
      message: "Device activated successfully",
      device: activatedResult.rows[0],
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to activate device",
    });
  }
};

export const authenticateDevice = async (req: Request, res: Response) => {
  try {
    const { device_uuid, location_id } = req.body;

    if (!device_uuid || !location_id) {
      return res.status(400).json({
        success: false,
        message: "device_uuid and location_id are required",
      });
    }

    const result = await pool.query(
      `
      SELECT
        d.location_id,
        sl.location_name,
        d.status_id,
        ds.status_name
      FROM devices d
      LEFT JOIN service_locations sl ON d.location_id = sl.id
      LEFT JOIN device_statuses ds ON d.status_id = ds.id
      WHERE d.device_uuid = $1
        AND d.location_id = $2
      `,
      [device_uuid, location_id]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        message: "No data available",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Device authenticated successfully",
      device: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to authenticate device",
    });
  }
};

export const requestOtp = async (req: Request, res: Response) => {
  try {
    const { location_code, device_uuid } = req.body;

    if (!location_code || !device_uuid) {
      return res.status(400).json({
        success: false,
        message: "location_code and device_uuid are required",
      });
    }

    const result = await pool.query(
      `SELECT d.code, sl.location_name, sl.mobile_1, sl.mobile_2
       FROM devices d
       JOIN service_locations sl ON d.location_id = sl.id
       WHERE d.device_uuid = $1 AND sl.location_code = $2`,
      [device_uuid, location_code]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        message: "Device not found for the given UUID and location code",
      });
    }

    const { code, location_name, mobile_1, mobile_2 } = result.rows[0];

    const message = `Validate mobile for ${location_name} with OTP:${code}`;

    try {
      if (mobile_1) {
        await pool.query(
          `INSERT INTO sms_queue (number, message, status, reference) VALUES ($1, $2, 0, NULL)`,
          [mobile_1, message]
        );
      }
      if (mobile_2) {
        await pool.query(
          `INSERT INTO sms_queue (number, message, status, reference) VALUES ($1, $2, 0, NULL)`,
          [mobile_2, message]
        );
      }
    } catch (smsError) {
      console.error("[SMS Queue] Failed to queue SMS:", smsError);
    }

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to request OTP",
    });
  }
};



export const getDeviceEmployees = async (req: Request, res: Response) => {
  try {
    const { device_uuid } = req.query;

    if (!device_uuid || typeof device_uuid !== "string") {
      return res.status(400).json({
        success: false,
        message: "device_uuid is required",
      });
    }

    const deviceResult = await pool.query(
      `
      SELECT
        d.id AS device_id,
        d.location_id,
        sl.location_name,
        ds.status_name
      FROM devices d
      JOIN service_locations sl
        ON d.location_id = sl.id
      JOIN device_statuses ds
        ON d.status_id = ds.id
      WHERE d.device_uuid = $1
      LIMIT 1
      `,
      [device_uuid]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Device not found",
      });
    }

    const device = deviceResult.rows[0];

    if (device.status_name !== "Active") {
      return res.status(403).json({
        success: false,
        message: "Device is not active or trusted",
      });
    }

    const employeesResult = await pool.query(
      `
      SELECT
        e.id AS employee_id,
        e.full_name,
        e.gid,
        e.profile_image_url AS profile_image
      FROM employees e
      JOIN employee_statuses es
        ON e.status_id = es.id
      WHERE e.location_id = $1
        AND es.status_name = 'Active'
      ORDER BY e.full_name ASC
      `,
      [device.location_id]
    );

    return res.status(200).json({
      success: true,
      location: {
        location_id: device.location_id,
        location_name: device.location_name,
      },
      employees: employeesResult.rows,
    });
  } catch (error) {
    console.error("Error fetching device employees:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getDeviceCurrentDutyIn = async (req: Request, res: Response) => {
  try {
    const { device_uuid } = req.query;

    if (!device_uuid || typeof device_uuid !== "string") {
      return res.status(400).json({
        success: false,
        message: "device_uuid is required",
      });
    }

    const deviceResult = await pool.query(
      `
      SELECT
        d.id AS device_id,
        d.location_id,
        sl.location_name,
        ds.status_name
      FROM devices d
      JOIN service_locations sl
        ON d.location_id = sl.id
      JOIN device_statuses ds
        ON d.status_id = ds.id
      WHERE d.device_uuid = $1
      LIMIT 1
      `,
      [device_uuid]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Device not found",
      });
    }

    const device = deviceResult.rows[0];

    if (device.status_name !== "Active") {
      return res.status(403).json({
        success: false,
        message: "Device is not active or trusted",
      });
    }

    const employeesResult = await pool.query(
      `
      SELECT
        e.id AS employee_id,
        e.full_name,
        e.gid,
        ar.check_in_time,
        e.profile_image_url AS profile_image
      FROM attendance_records ar
      JOIN employees e
        ON ar.employee_id = e.id
      JOIN employee_statuses es
        ON e.status_id = es.id
      WHERE ar.location_id = $1
        AND ar.check_out_time IS NULL
        AND es.status_name = 'Active'
      ORDER BY ar.check_in_time DESC
      `,
      [device.location_id]
    );

    return res.status(200).json({
      success: true,
      location: {
        location_id: device.location_id,
        location_name: device.location_name,
      },
      employees: employeesResult.rows,
    });
  } catch (error) {
    console.error("Error fetching current Duty In employees:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getDeviceRosters = async (
  req: Request,
  res: Response
) => {
  try {
    const { device_uuid, start_date, end_date } = req.query;

    if (!device_uuid || typeof device_uuid !== "string") {
      return res.status(400).json({
        success: false,
        message: "device_uuid is required",
      });
    }

    if (
      !start_date ||
      typeof start_date !== "string" ||
      !end_date ||
      typeof end_date !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "start_date and end_date are required",
      });
    }

    const isValidDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
      }

      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));

      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    };

    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({
        success: false,
        message: "Dates must use YYYY-MM-DD format",
      });
    }

    if (start_date > end_date) {
      return res.status(400).json({
        success: false,
        message: "start_date must not be after end_date",
      });
    }

    const deviceResult = await pool.query(
      `
      SELECT
        d.id AS device_id,
        d.location_id,
        sl.location_name,
        ds.status_name
      FROM devices d
      JOIN service_locations sl
        ON d.location_id = sl.id
      JOIN device_statuses ds
        ON d.status_id = ds.id
      WHERE d.device_uuid = $1
      LIMIT 1
      `,
      [device_uuid]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Device not found",
      });
    }

    const device = deviceResult.rows[0];

    if (device.status_name !== "Active") {
      return res.status(403).json({
        success: false,
        message: "Device is not active or trusted",
      });
    }

    const rosterResult = await pool.query(
      `
      SELECT
        r.id AS roster_id,
        r.employee_id,
        e.full_name AS employee_name,
        e.gid,
        dg.designation_name,
        r.shift_start_time,
        r.shift_end_time,
        r.status_id,
        rs.status_name AS roster_status
      FROM rosters r
      JOIN employees e
        ON r.employee_id = e.id
      JOIN employee_statuses es
        ON e.status_id = es.id
      LEFT JOIN designations dg
        ON e.designation_id = dg.id
      LEFT JOIN roster_statuses rs
        ON r.status_id = rs.id
      WHERE r.location_id = $1
        AND es.status_name = 'Active'
        AND r.shift_end_time > $2::date
        AND r.shift_start_time < ($3::date + INTERVAL '1 day')
      ORDER BY
        r.shift_start_time ASC,
        e.full_name ASC
      `,
      [device.location_id, start_date, end_date]
    );

    return res.status(200).json({
      success: true,
      location: {
        location_id: device.location_id,
        location_name: device.location_name,
      },
      start_date,
      end_date,
      rosters: rosterResult.rows,
    });
  } catch (error) {
    console.error("Error fetching device rosters:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
