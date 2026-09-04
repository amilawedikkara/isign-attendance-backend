import { Request, Response } from "express";
import pool from "../config/db";

export const getRoles = async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM roles");

    res.status(200).json({
      success: true,
      roles: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch roles",
    });
  }
};

export const createRole = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { role_name, permissions } = req.body;

    if (!role_name || !Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "role_name and permissions are required",
      });
    }

    await client.query("BEGIN");

    const roleResult = await client.query(
      "INSERT INTO roles (role_name) VALUES ($1) RETURNING *",
      [role_name]
    );

    const role = roleResult.rows[0];

    const permissionResult = await client.query(
      "SELECT id FROM permissions WHERE permission_code = ANY($1)",
      [permissions]
    );

    if (permissionResult.rows.length !== permissions.length) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "One or more permissions are invalid",
      });
    }

    for (const permission of permissionResult.rows) {
      await client.query(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)",
        [role.id, permission.id]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      role: {
        ...role,
        permissions,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to create role",
    });
  } finally {
    client.release();
  }
};

export const updateRole = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { role_name, permissions } = req.body;

    if (!role_name || !Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "role_name and permissions are required",
      });
    }

    await client.query("BEGIN");

    const roleResult = await client.query(
      `UPDATE roles
       SET role_name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [role_name, id]
    );

    if (roleResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    const permissionResult = await client.query(
      "SELECT id FROM permissions WHERE permission_code = ANY($1)",
      [permissions]
    );

    if (permissionResult.rows.length !== permissions.length) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "One or more permissions are invalid",
      });
    }

    await client.query("DELETE FROM role_permissions WHERE role_id = $1", [id]);

    for (const permission of permissionResult.rows) {
      await client.query(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)",
        [id, permission.id]
      );
    }

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      role: {
        ...roleResult.rows[0],
        permissions,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to update role",
    });
  } finally {
    client.release();
  }
};

export const deleteRole = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const roleCheck = await client.query(
      "SELECT * FROM roles WHERE id = $1",
      [id]
    );

    if (roleCheck.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    await client.query(
      "DELETE FROM role_permissions WHERE role_id = $1",
      [id]
    );

    await client.query(
      "DELETE FROM roles WHERE id = $1",
      [id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Role deleted successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to delete role",
    });
  } finally {
    client.release();
  }
};

