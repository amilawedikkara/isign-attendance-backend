import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  verifyRefreshToken: vi.fn(),
  hashRefreshToken: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
}));

vi.mock("../src/config/db", () => ({
  default: {
    query: mocks.query,
    connect: mocks.connect,
  },
}));

vi.mock("../src/utils/jwt", async () => {
  const actual = await vi.importActual<
    typeof import("../src/utils/jwt")
  >("../src/utils/jwt");

  return {
    ...actual,
    verifyRefreshToken:
      mocks.verifyRefreshToken,
    hashRefreshToken:
      mocks.hashRefreshToken,
    generateAccessToken:
      mocks.generateAccessToken,
    generateRefreshToken:
      mocks.generateRefreshToken,
  };
});

import {
  authService,
  AuthServiceError,
} from "../src/services/auth.service";

describe("authentication security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects login for a soft-deleted user", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [],
    });

    await expect(
      authService.login(
        "login.user@example.com",
        "Password123"
      )
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
      message: "Invalid username or password",
    } satisfies Partial<AuthServiceError>);

    expect(mocks.query).toHaveBeenCalledOnce();

    const sql = String(
      mocks.query.mock.calls[0][0]
    )
      .replace(/\s+/g, " ")
      .trim();

    expect(sql).toContain(
      "AND users.deleted_at IS NULL"
    );
  });

  it("rejects refresh for a soft-deleted user even when the refresh session is active", async () => {
    const refreshToken =
      "valid-refresh-token";

    const clientQuery = vi.fn(
      async (sql: unknown) => {
        const normalizedSql = String(sql)
          .replace(/\s+/g, " ")
          .trim();

        if (normalizedSql === "BEGIN") {
          return { rows: [] };
        }

        if (
          normalizedSql.includes(
            "FROM refresh_sessions"
          ) &&
          normalizedSql.includes("FOR UPDATE")
        ) {
          return {
            rows: [
              {
                id: "session-1",
                user_id: 4,
                token_hash:
                  "expected-token-hash",
                token_family_id:
                  "family-1",
                created_at: new Date(),
                last_used_at: new Date(),
                expires_at: new Date(
                  Date.now() +
                    60 * 60 * 1000
                ),
                revoked_at: null,
                revoked_reason: null,
                replaced_by_session_id: null,
                device_info: null,
                ip_address: null,
              },
            ],
          };
        }

        if (
          normalizedSql.includes(
            "FROM users"
          ) &&
          normalizedSql.includes(
            "users.deleted_at IS NULL"
          )
        ) {
          return {
            rows: [],
          };
        }

        if (normalizedSql === "ROLLBACK") {
          return { rows: [] };
        }

        return {
          rows: [],
        };
      }
    );

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query: clientQuery,
      release,
    });

    mocks.verifyRefreshToken.mockReturnValue({
      user_id: 4,
      session_id: "session-1",
      token_family_id: "family-1",
      type: "refresh",
    });

    mocks.hashRefreshToken.mockReturnValue(
      "expected-token-hash"
    );

    await expect(
      authService.refreshAccessToken(
        refreshToken
      )
    ).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
      statusCode: 401,
      message: "User was not found",
    } satisfies Partial<AuthServiceError>);

    const sqlCalls =
      clientQuery.mock.calls.map(
        ([sql]) =>
          String(sql)
            .replace(/\s+/g, " ")
            .trim()
      );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("ROLLBACK");

    expect(
      sqlCalls.some((sql) =>
        sql.includes(
          "AND users.deleted_at IS NULL"
        )
      )
    ).toBe(true);

    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects refresh for a revoked session", async () => {
    const refreshToken =
      "valid-refresh-token";

    const clientQuery = vi.fn(
      async (sql: unknown) => {
        const normalizedSql = String(sql)
          .replace(/\s+/g, " ")
          .trim();

        if (normalizedSql === "BEGIN") {
          return { rows: [] };
        }

        if (
          normalizedSql.includes(
            "FROM refresh_sessions"
          ) &&
          normalizedSql.includes("FOR UPDATE")
        ) {
          return {
            rows: [
              {
                id: "session-1",
                user_id: 4,
                token_hash:
                  "expected-token-hash",
                token_family_id:
                  "family-1",
                created_at: new Date(),
                last_used_at: new Date(),
                expires_at: new Date(
                  Date.now() +
                    60 * 60 * 1000
                ),
                revoked_at: new Date(),
                revoked_reason:
                  "USER_DELETED",
                replaced_by_session_id: null,
                device_info: null,
                ip_address: null,
              },
            ],
          };
        }

        if (normalizedSql === "ROLLBACK") {
          return { rows: [] };
        }

        return {
          rows: [],
        };
      }
    );

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query: clientQuery,
      release,
    });

    mocks.verifyRefreshToken.mockReturnValue({
      user_id: 4,
      session_id: "session-1",
      token_family_id: "family-1",
      type: "refresh",
    });

    await expect(
      authService.refreshAccessToken(
        refreshToken
      )
    ).rejects.toMatchObject({
      code: "SESSION_REVOKED",
      statusCode: 401,
      message:
        "Refresh session has been revoked",
    } satisfies Partial<AuthServiceError>);

    const sqlCalls =
      clientQuery.mock.calls.map(
        ([sql]) =>
          String(sql)
            .replace(/\s+/g, " ")
            .trim()
      );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("detects reuse of an already-rotated refresh token", async () => {
    const refreshToken = "old-refresh-token";

    const clientQuery = vi.fn(
      async (sql: unknown) => {
        const normalizedSql = String(sql)
          .replace(/\s+/g, " ")
          .trim();

        if (normalizedSql === "BEGIN") {
          return { rows: [] };
        }

        if (
          normalizedSql.includes(
            "FROM refresh_sessions"
          ) &&
          normalizedSql.includes("FOR UPDATE")
        ) {
          return {
            rows: [
              {
                id: "session-old",
                user_id: 4,
                token_hash: "old-token-hash",
                token_family_id: "family-1",
                created_at: new Date(),
                last_used_at: new Date(),
                expires_at: new Date(
                  Date.now() + 60 * 60 * 1000
                ),
                revoked_at: new Date(),
                revoked_reason: "TOKEN_ROTATED",
                replaced_by_session_id:
                  "session-new",
                device_info: null,
                ip_address: null,
              },
            ],
          };
        }

        if (
          normalizedSql.includes(
            "UPDATE refresh_sessions"
          ) &&
          normalizedSql.includes(
            "WHERE token_family_id = $1"
          )
        ) {
          return {
            rows: [],
            rowCount: 2,
          };
        }

        if (normalizedSql === "COMMIT") {
          return { rows: [] };
        }

        return {
          rows: [],
        };
      }
    );

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query: clientQuery,
      release,
    });

    mocks.verifyRefreshToken.mockReturnValue({
      user_id: 4,
      session_id: "session-old",
      token_family_id: "family-1",
      type: "refresh",
    });

    await expect(
      authService.refreshAccessToken(refreshToken)
    ).rejects.toMatchObject({
      code: "TOKEN_REUSE_DETECTED",
      statusCode: 401,
      message:
        "Refresh token reuse was detected. Please log in again.",
      clearRefreshCookie: true,
    } satisfies Partial<AuthServiceError>);

    const sqlCalls = clientQuery.mock.calls.map(
      ([sql]) =>
        String(sql)
          .replace(/\s+/g, " ")
          .trim()
    );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("COMMIT");

    expect(
      sqlCalls.some((sql) =>
        sql.includes(
          "WHERE token_family_id = $1"
        )
      )
    ).toBe(true);

    expect(sqlCalls).not.toContain("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects refresh when the session idle timeout has expired", async () => {
    const refreshToken = "valid-refresh-token";

    const clientQuery = vi.fn(
      async (sql: unknown) => {
        const normalizedSql = String(sql)
          .replace(/\s+/g, " ")
          .trim();

        if (normalizedSql === "BEGIN") {
          return { rows: [] };
        }

        if (
          normalizedSql.includes(
            "FROM refresh_sessions"
          ) &&
          normalizedSql.includes("FOR UPDATE")
        ) {
          return {
            rows: [
              {
                id: "session-idle-expired",
                user_id: 4,
                token_hash: "expected-token-hash",
                token_family_id: "family-1",
                created_at: new Date(),
                last_used_at: new Date(
                  Date.now() - 2 * 60 * 60 * 1000
                ),
                expires_at: new Date(
                  Date.now() + 60 * 60 * 1000
                ),
                revoked_at: null,
                revoked_reason: null,
                replaced_by_session_id: null,
                device_info: null,
                ip_address: null,
              },
            ],
          };
        }

        if (
          normalizedSql.includes(
            "SESSION_IDLE_TIMEOUT"
          )
        ) {
          return {
            rows: [],
            rowCount: 1,
          };
        }

        if (normalizedSql === "COMMIT") {
          return { rows: [] };
        }

        return {
          rows: [],
        };
      }
    );

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query: clientQuery,
      release,
    });

    mocks.verifyRefreshToken.mockReturnValue({
      user_id: 4,
      session_id: "session-idle-expired",
      token_family_id: "family-1",
      type: "refresh",
    });

    await expect(
      authService.refreshAccessToken(refreshToken)
    ).rejects.toMatchObject({
      code: "SESSION_IDLE_TIMEOUT",
      statusCode: 401,
      message:
        "Refresh session expired due to inactivity",
      clearRefreshCookie: true,
    } satisfies Partial<AuthServiceError>);

    const sqlCalls = clientQuery.mock.calls.map(
      ([sql]) =>
        String(sql)
          .replace(/\s+/g, " ")
          .trim()
    );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("COMMIT");

    expect(
      sqlCalls.some((sql) =>
        sql.includes("SESSION_IDLE_TIMEOUT")
      )
    ).toBe(true);

    expect(sqlCalls).not.toContain("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects refresh when the session absolute timeout has expired", async () => {
    const refreshToken = "valid-refresh-token";

    const clientQuery = vi.fn(
      async (sql: unknown) => {
        const normalizedSql = String(sql)
          .replace(/\s+/g, " ")
          .trim();

        if (normalizedSql === "BEGIN") {
          return { rows: [] };
        }

        if (
          normalizedSql.includes(
            "FROM refresh_sessions"
          ) &&
          normalizedSql.includes("FOR UPDATE")
        ) {
          return {
            rows: [
              {
                id: "session-absolute-expired",
                user_id: 4,
                token_hash: "expected-token-hash",
                token_family_id: "family-1",
                created_at: new Date(
                  Date.now() - 25 * 60 * 60 * 1000
                ),
                last_used_at: new Date(),
                expires_at: new Date(
                  Date.now() - 60 * 1000
                ),
                revoked_at: null,
                revoked_reason: null,
                replaced_by_session_id: null,
                device_info: null,
                ip_address: null,
              },
            ],
          };
        }

        if (
          normalizedSql.includes(
            "SESSION_ABSOLUTE_TIMEOUT"
          )
        ) {
          return {
            rows: [],
            rowCount: 1,
          };
        }

        if (normalizedSql === "COMMIT") {
          return { rows: [] };
        }

        return {
          rows: [],
        };
      }
    );

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query: clientQuery,
      release,
    });

    mocks.verifyRefreshToken.mockReturnValue({
      user_id: 4,
      session_id: "session-absolute-expired",
      token_family_id: "family-1",
      type: "refresh",
    });

    await expect(
      authService.refreshAccessToken(refreshToken)
    ).rejects.toMatchObject({
      code: "SESSION_ABSOLUTE_TIMEOUT",
      statusCode: 401,
      message: "Refresh session has expired",
      clearRefreshCookie: true,
    } satisfies Partial<AuthServiceError>);

    const sqlCalls = clientQuery.mock.calls.map(
      ([sql]) =>
        String(sql)
          .replace(/\s+/g, " ")
          .trim()
    );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("COMMIT");

    expect(
      sqlCalls.some((sql) =>
        sql.includes(
          "SESSION_ABSOLUTE_TIMEOUT"
        )
      )
    ).toBe(true);

    expect(sqlCalls).not.toContain("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects refresh when the token hash does not match the session", async () => {
    const refreshToken = "valid-refresh-token";

    const clientQuery = vi.fn(
      async (sql: unknown) => {
        const normalizedSql = String(sql)
          .replace(/\s+/g, " ")
          .trim();

        if (normalizedSql === "BEGIN") {
          return { rows: [] };
        }

        if (
          normalizedSql.includes(
            "FROM refresh_sessions"
          ) &&
          normalizedSql.includes("FOR UPDATE")
        ) {
          return {
            rows: [
              {
                id: "session-1",
                user_id: 4,
                token_hash: "stored-token-hash",
                token_family_id: "family-1",
                created_at: new Date(),
                last_used_at: new Date(),
                expires_at: new Date(
                  Date.now() + 60 * 60 * 1000
                ),
                revoked_at: null,
                revoked_reason: null,
                replaced_by_session_id: null,
                device_info: null,
                ip_address: null,
              },
            ],
          };
        }

        if (normalizedSql === "ROLLBACK") {
          return { rows: [] };
        }

        return {
          rows: [],
        };
      }
    );

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query: clientQuery,
      release,
    });

    mocks.verifyRefreshToken.mockReturnValue({
      user_id: 4,
      session_id: "session-1",
      token_family_id: "family-1",
      type: "refresh",
    });

    mocks.hashRefreshToken.mockReturnValue(
      "different-token-hash"
    );

    await expect(
      authService.refreshAccessToken(refreshToken)
    ).rejects.toMatchObject({
      code: "REFRESH_TOKEN_MISMATCH",
      statusCode: 401,
      message:
        "Refresh token does not match the session",
      clearRefreshCookie: true,
    } satisfies Partial<AuthServiceError>);

    const sqlCalls = clientQuery.mock.calls.map(
      ([sql]) =>
        String(sql)
          .replace(/\s+/g, " ")
          .trim()
    );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("ROLLBACK");

    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects refresh when the session does not exist", async () => {
    const refreshToken = "valid-refresh-token";

    const clientQuery = vi.fn(
      async (sql: unknown) => {
        const normalizedSql = String(sql)
          .replace(/\s+/g, " ")
          .trim();

        if (normalizedSql === "BEGIN") {
          return { rows: [] };
        }

        if (
          normalizedSql.includes(
            "FROM refresh_sessions"
          ) &&
          normalizedSql.includes("FOR UPDATE")
        ) {
          return {
            rows: [],
          };
        }

        if (normalizedSql === "ROLLBACK") {
          return { rows: [] };
        }

        return {
          rows: [],
        };
      }
    );

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query: clientQuery,
      release,
    });

    mocks.verifyRefreshToken.mockReturnValue({
      user_id: 4,
      session_id: "missing-session",
      token_family_id: "family-1",
      type: "refresh",
    });

    await expect(
      authService.refreshAccessToken(refreshToken)
    ).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
      statusCode: 401,
      message: "Refresh session was not found",
      clearRefreshCookie: true,
    } satisfies Partial<AuthServiceError>);

    const sqlCalls = clientQuery.mock.calls.map(
      ([sql]) =>
        String(sql)
          .replace(/\s+/g, " ")
          .trim()
    );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("successfully rotates an active refresh session", async () => {
    const refreshToken = "old-refresh-token";

    const clientQuery = vi.fn(
      async (sql: unknown) => {
        const normalizedSql = String(sql)
          .replace(/\s+/g, " ")
          .trim();

        if (normalizedSql === "BEGIN") {
          return { rows: [] };
        }

        if (
          normalizedSql.includes(
            "FROM refresh_sessions"
          ) &&
          normalizedSql.includes("FOR UPDATE")
        ) {
          return {
            rows: [
              {
                id: "session-old",
                user_id: 4,
                token_hash: "old-token-hash",
                token_family_id: "family-1",
                created_at: new Date(),
                last_used_at: new Date(),
                expires_at: new Date(
                  Date.now() + 60 * 60 * 1000
                ),
                revoked_at: null,
                revoked_reason: null,
                replaced_by_session_id: null,
                device_info: null,
                ip_address: null,
              },
            ],
          };
        }

        if (
          normalizedSql.includes(
            "FROM users"
          ) &&
          normalizedSql.includes(
            "users.deleted_at IS NULL"
          )
        ) {
          return {
            rows: [
              {
                id: 4,
                email: "manager@example.com",
                role_id: 2,
                role_name: "EME Area Manager",
              },
            ],
          };
        }

        if (
          normalizedSql.includes(
            "INSERT INTO refresh_sessions"
          )
        ) {
          return {
            rows: [],
            rowCount: 1,
          };
        }

        if (
          normalizedSql.includes(
            "revoked_reason = 'TOKEN_ROTATED'"
          )
        ) {
          return {
            rows: [],
            rowCount: 1,
          };
        }

        if (normalizedSql === "COMMIT") {
          return { rows: [] };
        }

        return {
          rows: [],
        };
      }
    );

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query: clientQuery,
      release,
    });

    mocks.verifyRefreshToken.mockReturnValue({
      user_id: 4,
      session_id: "session-old",
      token_family_id: "family-1",
      type: "refresh",
    });

    mocks.hashRefreshToken
      .mockReturnValueOnce("old-token-hash")
      .mockReturnValueOnce("new-token-hash");

    mocks.generateAccessToken.mockReturnValue(
      "new-access-token"
    );

    mocks.generateRefreshToken.mockReturnValue(
      "new-refresh-token"
    );

    const result =
      await authService.refreshAccessToken(
        refreshToken
      );

    expect(result.accessToken).toBe(
      "new-access-token"
    );

    expect(result.refreshToken).toBe(
      "new-refresh-token"
    );

    expect(result.expiresIn).toBe(1800);

    const sqlCalls = clientQuery.mock.calls.map(
      ([sql]) =>
        String(sql)
          .replace(/\s+/g, " ")
          .trim()
    );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("COMMIT");
    expect(sqlCalls).not.toContain("ROLLBACK");

    expect(
      sqlCalls.some((sql) =>
        sql.includes(
          "INSERT INTO refresh_sessions"
        )
      )
    ).toBe(true);

    expect(
      sqlCalls.some((sql) =>
        sql.includes(
          "revoked_reason = 'TOKEN_ROTATED'"
        )
      )
    ).toBe(true);

    expect(release).toHaveBeenCalledOnce();
  });

});
