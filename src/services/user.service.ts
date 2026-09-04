import bcrypt from "bcrypt";
import pool from "../config/db";
import { authService } from "./auth.service";

export class UserServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "UserServiceError";
  }
}

interface CreateUserInput {
  user_name: string;
  email: string;
  password: string;
  role_id: number;
}

interface UpdateUserInput {
  user_name: string;
  email: string;
  role_id: number;
  region_ids?: number[];
}

class UserService {
  /**
   * Get all users.
   */
  async getUsers() {
    const result = await pool.query(
      `SELECT
        users.id,
        users.full_name AS user_name,
        users.email,
        users.role_id,
        roles.role_name,
        users.created_at,
        users.updated_at
      FROM users
      LEFT JOIN roles
        ON users.role_id = roles.id
      WHERE users.deleted_at IS NULL
      ORDER BY users.id ASC`
    );

    return result.rows;
  }

  /**
   * Create a new user.
   */
  async createUser(input: CreateUserInput) {
    const {
      user_name,
      email,
      password,
      role_id,
    } = input;

    const existingUser = await pool.query(
      `SELECT id
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new UserServiceError(
        400,
        "Email already exists"
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    const result = await pool.query(
      `INSERT INTO users (
        full_name,
        email,
        password_hash,
        role_id
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        full_name AS user_name,
        email,
        role_id`,
      [
        user_name,
        email,
        hashedPassword,
        role_id,
      ]
    );

    return result.rows[0];
  }

  /**
   * Update a user and their region assignments.
   *
   * If role or region access changes,
   * all active refresh sessions are revoked.
   */
  async updateUser(
    userId: number,
    input: UpdateUserInput
  ) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const {
        user_name,
        email,
        role_id,
        region_ids,
      } = input;

      // Get current user role
     const currentUserResult =
      await client.query(
        `SELECT role_id
        FROM users
        WHERE id = $1
          AND deleted_at IS NULL`,
        [userId]
      );

      if (currentUserResult.rows.length === 0) {
        throw new UserServiceError(
          404,
          "User not found"
        );
      }

      const currentRoleId = Number(
        currentUserResult.rows[0].role_id
      );

      // Get current region assignments
      const currentRegionsResult =
        await client.query(
          `SELECT region_id
           FROM user_regions
           WHERE user_id = $1
           ORDER BY region_id`,
          [userId]
        );

      const currentRegionIds =
        currentRegionsResult.rows.map(
          (row) => Number(row.region_id)
        );

      // Validate requested role
      const roleResult = await client.query(
        `SELECT role_name
         FROM roles
         WHERE id = $1`,
        [role_id]
      );

      if (roleResult.rows.length === 0) {
        throw new UserServiceError(
          400,
          "Invalid role_id"
        );
      }

      const roleName =
        roleResult.rows[0].role_name;

      if (
        roleName !== "Administrator" &&
        !Array.isArray(region_ids)
      ) {
        throw new UserServiceError(
          400,
          "region_ids are required for non-administrator users"
        );
      }

      // Normalize authorization values
      const newRoleId = Number(role_id);

      const newRegionIds =
        roleName === "Administrator"
          ? []
          : (region_ids || []).map(
              (regionId) => Number(regionId)
            );

      // Compare old and new role
      const roleChanged =
        currentRoleId !== newRoleId;

      // Compare old and new region access
      const currentRegionIdsSorted = [
        ...currentRegionIds,
      ].sort((a, b) => a - b);

      const newRegionIdsSorted = [
        ...newRegionIds,
      ].sort((a, b) => a - b);

      const regionsChanged =
        currentRegionIdsSorted.length !==
          newRegionIdsSorted.length ||
        currentRegionIdsSorted.some(
          (regionId, index) =>
            regionId !==
            newRegionIdsSorted[index]
        );

      const authorizationChanged =
        roleChanged || regionsChanged;

      // Update user
      const result = await client.query(
        `UPDATE users
        SET
          full_name = $1,
          email = $2,
          role_id = $3,
          updated_at = NOW()
        WHERE id = $4
          AND deleted_at IS NULL
        RETURNING
          id,
          full_name AS user_name,
          email,
          role_id`,
        [
          user_name,
          email,
          newRoleId,
          userId,
        ]
      );
   

      // Replace region assignments
      await client.query(
        `DELETE FROM user_regions
         WHERE user_id = $1`,
        [userId]
      );

      if (roleName !== "Administrator") {
        for (const regionId of newRegionIds) {
          await client.query(
            `INSERT INTO user_regions (
              user_id,
              region_id
            )
            VALUES ($1, $2)`,
            [userId, regionId]
          );
        }
      }

      if (authorizationChanged) {
        await authService.revokeUserSessions(
          userId,
          "ACCESS_CHANGED"
        );
      }

      await client.query("COMMIT");

      return {
        ...result.rows[0],
        region_ids:
          roleName === "Administrator"
            ? []
            : newRegionIds,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
 * Soft delete a user.
 */
  async deleteUser(userId: number) {
    // Check whether active user exists and get role
    const userResult = await pool.query(
      `SELECT
        u.id,
        r.role_name
      FROM users u
      JOIN roles r
        ON u.role_id = r.id
      WHERE u.id = $1
        AND u.deleted_at IS NULL`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new UserServiceError(
        404,
        "User not found"
      );
    }

    const roleName =
      userResult.rows[0].role_name;

    // Prevent deleting the last active Administrator
    if (roleName === "Administrator") {
      const adminCountResult =
        await pool.query(
          `SELECT COUNT(*) AS count
          FROM users u
          JOIN roles r
            ON u.role_id = r.id
          WHERE r.role_name = 'Administrator'
            AND u.deleted_at IS NULL`
        );

      const adminCount = Number(
        adminCountResult.rows[0].count
      );

      if (adminCount <= 1) {
        throw new UserServiceError(
          400,
          "Cannot delete the last Administrator user"
        );
      }
    }

    // Soft delete user
    await pool.query(
      `UPDATE users
      SET
        deleted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL`,
      [userId]
    );

    await authService.revokeUserSessions(
      userId,
      "USER_DELETED"
    );
  }
}

export const userService = new UserService();