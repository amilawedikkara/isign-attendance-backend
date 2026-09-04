import bcrypt from "bcrypt";
import crypto from "crypto";
import { PoolClient } from "pg";
import pool from "../config/db";
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";

const getAccessTokenExpiresInSeconds = (): number => {
  const value =
    process.env.JWT_ACCESS_EXPIRES_IN || "30m";

  const match = value
    .trim()
    .match(/^(\d+)(m|h|d)$/i);

  if (!match) {
    return 30 * 60;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "m") {
    return amount * 60;
  }

  if (unit === "h") {
    return amount * 60 * 60;
  }

  if (unit === "d") {
    return amount * 24 * 60 * 60;
  }

  return 30 * 60;
};

const DEFAULT_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

const DEFAULT_ABSOLUTE_TIMEOUT_MS =
  24 * 60 * 60 * 1000;

interface RequestContext {
  deviceInfo?: string | null;
  ipAddress?: string | null;
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshTokenMaxAgeMs: number;
  user: {
    id: number;
    fullName: string;
    email: string;
    role_id: number;
    role_name: string;
  };
}

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshTokenMaxAgeMs: number;
}

interface RefreshSession {
  id: string;
  user_id: number;
  token_hash: string;
  token_family_id: string;
  created_at: Date | string;
  last_used_at: Date | string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  revoked_reason: string | null;
  replaced_by_session_id: string | null;
  device_info: string | null;
  ip_address: string | null;
}

export class AuthServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly clearRefreshCookie = false
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

class AuthService {
  /**
   * Authenticate a user and create a refresh session.
   */
  async login(
    username: string,
    password: string,
    context: RequestContext = {}
  ): Promise<LoginResult> {
    const result = await pool.query(
      `SELECT
        users.id,
        users.full_name,
        users.email,
        users.password_hash,
        users.role_id,
        roles.role_name
      FROM users
      LEFT JOIN roles
        ON users.role_id = roles.id
      WHERE users.email = $1
        AND users.deleted_at IS NULL`,
      [username]
    );

    if (result.rows.length === 0) {
      throw new AuthServiceError(
        "INVALID_CREDENTIALS",
        401,
        "Invalid username or password"
      );
    }

    const user = result.rows[0];

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!isPasswordValid) {
      throw new AuthServiceError(
        "INVALID_CREDENTIALS",
        401,
        "Invalid username or password"
      );
    }

    const sessionId = crypto.randomUUID();
    const tokenFamilyId = crypto.randomUUID();

    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role_id: user.role_id,
      role_name: user.role_name,
    });

    const refreshToken = generateRefreshToken({
      user_id: user.id,
      session_id: sessionId,
      token_family_id: tokenFamilyId,
      type: "refresh",
    });

    const refreshTokenHash =
      hashRefreshToken(refreshToken);

    const absoluteTimeoutMs =
      this.getAbsoluteTimeoutMs();

    const expiresAt = new Date(
      Date.now() + absoluteTimeoutMs
    );

    await pool.query(
      `INSERT INTO refresh_sessions (
        id,
        user_id,
        token_hash,
        token_family_id,
        expires_at,
        device_info,
        ip_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        sessionId,
        user.id,
        refreshTokenHash,
        tokenFamilyId,
        expiresAt,
        context.deviceInfo || null,
        context.ipAddress || null,
      ]
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: getAccessTokenExpiresInSeconds(),
      refreshTokenMaxAgeMs: absoluteTimeoutMs,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name,
      },
    };
  }

  /**
   * Validate and rotate a refresh token.
   */
  async refreshAccessToken(
    refreshToken: string,
    context: RequestContext = {}
  ): Promise<RefreshResult> {
    const decodedRefreshToken =
      this.decodeRefreshToken(refreshToken);

    const client = await pool.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const session =
        await this.getRefreshSessionForUpdate(
          client,
          decodedRefreshToken.session_id
        );

      if (session.revoked_at) {
        if (
          session.revoked_reason === "TOKEN_ROTATED"
        ) {
          await client.query(
            `UPDATE refresh_sessions
             SET
               revoked_at = COALESCE(
                 revoked_at,
                 NOW()
               ),
               revoked_reason = CASE
                 WHEN revoked_at IS NULL
                   THEN 'TOKEN_REUSE_DETECTED'
                 ELSE revoked_reason
               END
             WHERE token_family_id = $1`,
            [session.token_family_id]
          );

          await client.query("COMMIT");
          transactionStarted = false;

          throw new AuthServiceError(
            "TOKEN_REUSE_DETECTED",
            401,
            "Refresh token reuse was detected. Please log in again.",
            true
          );
        }

        throw new AuthServiceError(
          "SESSION_REVOKED",
          401,
          "Refresh session has been revoked",
          true
        );
      }

      const now = Date.now();

      const expiresAt = new Date(
        session.expires_at
      ).getTime();

      if (expiresAt <= now) {
        await client.query(
          `UPDATE refresh_sessions
           SET
             revoked_at = COALESCE(
               revoked_at,
               NOW()
             ),
             revoked_reason = COALESCE(
               revoked_reason,
               'SESSION_ABSOLUTE_TIMEOUT'
             )
           WHERE id = $1`,
          [session.id]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        throw new AuthServiceError(
          "SESSION_ABSOLUTE_TIMEOUT",
          401,
          "Refresh session has expired",
          true
        );
      }

      const idleTimeoutMs =
        this.getIdleTimeoutMs();

      const lastUsedAt = new Date(
        session.last_used_at
      ).getTime();

      if (now - lastUsedAt > idleTimeoutMs) {
        await client.query(
          `UPDATE refresh_sessions
           SET
             revoked_at = COALESCE(
               revoked_at,
               NOW()
             ),
             revoked_reason = COALESCE(
               revoked_reason,
               'SESSION_IDLE_TIMEOUT'
             )
           WHERE id = $1`,
          [session.id]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        throw new AuthServiceError(
          "SESSION_IDLE_TIMEOUT",
          401,
          "Refresh session expired due to inactivity",
          true
        );
      }

      const receivedTokenHash =
        hashRefreshToken(refreshToken);

      if (
        receivedTokenHash !== session.token_hash
      ) {
        throw new AuthServiceError(
          "REFRESH_TOKEN_MISMATCH",
          401,
          "Refresh token does not match the session",
          true
        );
      }

      const userResult = await client.query(
        `SELECT
          users.id,
          users.email,
          users.role_id,
          roles.role_name
        FROM users
        LEFT JOIN roles
          ON users.role_id = roles.id
        WHERE users.id = $1
          AND users.deleted_at IS NULL`,
        [session.user_id]
      );

      if (userResult.rows.length === 0) {
        throw new AuthServiceError(
          "USER_NOT_FOUND",
          401,
          "User was not found",
          true
        );
      }

      const user = userResult.rows[0];

      const newAccessToken =
        generateAccessToken({
          id: user.id,
          email: user.email,
          role_id: user.role_id,
          role_name: user.role_name,
        });

      const newSessionId = crypto.randomUUID();

      const newRefreshToken =
        generateRefreshToken({
          user_id: user.id,
          session_id: newSessionId,
          token_family_id:
            session.token_family_id,
          type: "refresh",
        });

      const newRefreshTokenHash =
        hashRefreshToken(newRefreshToken);

      await client.query(
        `INSERT INTO refresh_sessions (
          id,
          user_id,
          token_hash,
          token_family_id,
          expires_at,
          device_info,
          ip_address
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newSessionId,
          user.id,
          newRefreshTokenHash,
          session.token_family_id,
          session.expires_at,
          context.deviceInfo || null,
          context.ipAddress || null,
        ]
      );

      const rotationResult = await client.query(
        `UPDATE refresh_sessions
         SET
           revoked_at = NOW(),
           revoked_reason = 'TOKEN_ROTATED',
           replaced_by_session_id = $1
         WHERE id = $2
           AND revoked_at IS NULL`,
        [newSessionId, session.id]
      );

      if (rotationResult.rowCount !== 1) {
        throw new AuthServiceError(
          "SESSION_ROTATION_FAILED",
          409,
          "Refresh session could not be rotated",
          true
        );
      }

      await client.query("COMMIT");
      transactionStarted = false;

      const remainingSessionLifetimeMs =
        Math.max(expiresAt - Date.now(), 0);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: getAccessTokenExpiresInSeconds(),
        refreshTokenMaxAgeMs:
          remainingSessionLifetimeMs,
      };
    } catch (error) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Revoke one refresh session.
   *
   * Logout is intentionally idempotent.
   */
  async logout(
    refreshToken: string
  ): Promise<void> {
    let decodedRefreshToken;

    try {
      decodedRefreshToken =
        verifyRefreshToken(refreshToken);
    } catch {
      return;
    }

    const refreshTokenHash =
      hashRefreshToken(refreshToken);

    await pool.query(
      `UPDATE refresh_sessions
       SET
         revoked_at = NOW(),
         revoked_reason = 'LOGOUT'
       WHERE id = $1
         AND token_hash = $2
         AND revoked_at IS NULL`,
      [
        decodedRefreshToken.session_id,
        refreshTokenHash,
      ]
    );
  }

  /**
   * Revoke every active refresh session for a user.
   */
  async logoutAll(
    refreshToken: string
  ): Promise<void> {
    const decodedRefreshToken =
      this.decodeRefreshToken(refreshToken);

    const sessionResult = await pool.query(
      `SELECT *
       FROM refresh_sessions
       WHERE id = $1`,
      [decodedRefreshToken.session_id]
    );

    if (sessionResult.rows.length === 0) {
      throw new AuthServiceError(
        "SESSION_NOT_FOUND",
        401,
        "Refresh session was not found",
        true
      );
    }

    const session =
      sessionResult.rows[0] as RefreshSession;

    if (session.revoked_at) {
      throw new AuthServiceError(
        "SESSION_REVOKED",
        401,
        "Refresh session has been revoked",
        true
      );
    }

    const receivedTokenHash =
      hashRefreshToken(refreshToken);

    if (
      receivedTokenHash !== session.token_hash
    ) {
      throw new AuthServiceError(
        "REFRESH_TOKEN_MISMATCH",
        401,
        "Refresh token does not match the session",
        true
      );
    }

    await pool.query(
      `UPDATE refresh_sessions
       SET
         revoked_at = NOW(),
         revoked_reason = 'LOGOUT_ALL'
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [session.user_id]
    );
  }

  /**
   * Revoke every active refresh session for a user.
   *
   * Used when the user's authorization changes
   * (role, regions, permissions, etc.).
   */
  async revokeUserSessions(
    userId: number,
    reason: string
  ): Promise<void> {
    await pool.query(
      `UPDATE refresh_sessions
      SET
        revoked_at = NOW(),
        revoked_reason = $2
      WHERE user_id = $1
        AND revoked_at IS NULL`,
      [userId, reason]
    );
  }

  /**
   * Return the logged-in user's profile and access scope.
   */
  async getCurrentUser(userId: number) {
    const userResult = await pool.query(
      `SELECT
        users.id,
        users.full_name AS user_name,
        users.email,
        users.role_id
      FROM users
      WHERE users.id = $1
        AND users.deleted_at IS NULL`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new AuthServiceError(
        "USER_NOT_FOUND",
        404,
        "User not found"
      );
    }

    const [
      assignedRegionsResult,
      assignedLocationsResult,
      permissionsResult,
    ] = await Promise.all([
      pool.query(
        `SELECT
          r.id AS region_id,
          r.region_name
        FROM user_regions ur
        JOIN regions r
          ON ur.region_id = r.id
        WHERE ur.user_id = $1
        ORDER BY r.id`,
        [userId]
      ),

      pool.query(
        `SELECT
          sl.location_name
        FROM user_regions ur
        JOIN service_locations sl
          ON ur.region_id = sl.region_id
        WHERE ur.user_id = $1
        ORDER BY sl.location_name`,
        [userId]
      ),

      pool.query(
        `SELECT
          p.permission_code
        FROM users u
        JOIN role_permissions rp
          ON u.role_id = rp.role_id
        JOIN permissions p
          ON rp.permission_id = p.id
        WHERE u.id = $1
        ORDER BY p.permission_code`,
        [userId]
      ),
    ]);

    return {
      user: userResult.rows[0],

      assignedRegions:
        assignedRegionsResult.rows,

      assignedLocations:
        assignedLocationsResult.rows.map(
          (row) => row.location_name
        ),

      permissions:
        permissionsResult.rows.map(
          (row) => row.permission_code
        ),
    };
  }

  /**
   * Verify and decode a refresh-token JWT.
   */
  private decodeRefreshToken(
    refreshToken: string
  ) {
    try {
      return verifyRefreshToken(refreshToken);
    } catch {
      throw new AuthServiceError(
        "REFRESH_TOKEN_INVALID",
        401,
        "Refresh token is invalid or expired",
        true
      );
    }
  }

  /**
   * Retrieve and lock a session during rotation.
   */
  private async getRefreshSessionForUpdate(
    client: PoolClient,
    sessionId: string
  ): Promise<RefreshSession> {
    const sessionResult = await client.query(
      `SELECT *
       FROM refresh_sessions
       WHERE id = $1
       FOR UPDATE`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      throw new AuthServiceError(
        "SESSION_NOT_FOUND",
        401,
        "Refresh session was not found",
        true
      );
    }

    return sessionResult.rows[0] as RefreshSession;
  }

  private getIdleTimeoutMs(): number {
    return this.parseDurationToMs(
      process.env
        .REFRESH_SESSION_IDLE_TIMEOUT ||
        process.env.SESSION_IDLE_TIMEOUT,
      DEFAULT_IDLE_TIMEOUT_MS
    );
  }

  private getAbsoluteTimeoutMs(): number {
    return this.parseDurationToMs(
      process.env
        .REFRESH_SESSION_ABSOLUTE_TIMEOUT ||
        process.env.JWT_REFRESH_EXPIRES_IN,
      DEFAULT_ABSOLUTE_TIMEOUT_MS
    );
  }

  /**
   * Supports values such as:
   * 30m, 60m, 8h, 1d
   */
  private parseDurationToMs(
    value: string | undefined,
    fallbackMs: number
  ): number {
    if (!value) {
      return fallbackMs;
    }

    const match = value
      .trim()
      .match(/^(\d+)(m|h|d)$/i);

    if (!match) {
      return fallbackMs;
    }

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();

    if (unit === "m") {
      return amount * 60 * 1000;
    }

    if (unit === "h") {
      return amount * 60 * 60 * 1000;
    }

    if (unit === "d") {
      return amount * 24 * 60 * 60 * 1000;
    }

    return fallbackMs;
  }
}

export const authService = new AuthService();