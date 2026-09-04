import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock("../src/config/db", () => ({
  default: {
    connect: mocks.connect,
    query: mocks.poolQuery,
  },
}));

import {
  completeVerificationSession,
} from "../src/controllers/verification.controller";

import {
  createVerifiedCheckIn,
  createVerifiedCheckOut,
} from "../src/controllers/attendance.controller";

const makeResponse = () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));

  return {
    json,
    status,
    response: { status } as unknown as Response,
  };
};

describe("verification session biometric completion gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects completion when active face enrollment is unavailable", async () => {
    mocks.poolQuery.mockImplementation(async (sql: unknown) => {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();

      if (normalizedSql.includes("FROM verification_sessions")) {
        return {
          rows: [
            {
              id: "session-1",
              secret_code_enabled: false,
              secret_code_verified: false,
              selfie_verified: false,
              liveness_verified: false,
              is_completed: false,
              is_used: false,
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              face_enrolled: false,
              biometric_status: "INACTIVE",
            },
          ],
        };
      }

      return { rows: [] };
    });

    const req = {
      params: { id: "session-1" },
    } as unknown as Request;

    const { status, json, response } = makeResponse();

    await completeVerificationSession(req, response);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      success: false,
      code: "FACE_ENROLLMENT_REQUIRED",
      message:
        "Active face enrollment is required to complete attendance verification.",
    });

    const sqlCalls = mocks.poolQuery.mock.calls.map(([sql]) =>
      String(sql).replace(/\s+/g, " ").trim()
    );

    expect(
      sqlCalls.some((sql) =>
        sql.includes("UPDATE verification_sessions")
      )
    ).toBe(false);
  });

  it("rejects completion when selfie or liveness is not verified", async () => {
    mocks.poolQuery.mockImplementation(async (sql: unknown) => {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();

      if (normalizedSql.includes("FROM verification_sessions")) {
        return {
          rows: [
            {
              id: "session-1",
              secret_code_enabled: false,
              secret_code_verified: false,
              selfie_verified: false,
              liveness_verified: false,
              is_completed: false,
              is_used: false,
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              face_enrolled: true,
              biometric_status: "ACTIVE",
            },
          ],
        };
      }

      return { rows: [] };
    });

    const req = {
      params: { id: "session-1" },
    } as unknown as Request;

    const { status, json, response } = makeResponse();

    await completeVerificationSession(req, response);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: "Verification steps are incomplete",
      incomplete_steps: ["LIVE_SELFIE"],
    });

    const sqlCalls = mocks.poolQuery.mock.calls.map(([sql]) =>
      String(sql).replace(/\s+/g, " ").trim()
    );

    expect(
      sqlCalls.some((sql) =>
        sql.includes("UPDATE verification_sessions")
      )
    ).toBe(false);
  });

  it("allows completion only when selfie and liveness are verified", async () => {
    mocks.poolQuery.mockImplementation(async (sql: unknown) => {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();

      if (normalizedSql.includes("FROM verification_sessions")) {
        return {
          rows: [
            {
              id: "session-1",
              secret_code_enabled: false,
              secret_code_verified: false,
              selfie_verified: true,
              liveness_verified: true,
              is_completed: false,
              is_used: false,
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              face_enrolled: true,
              biometric_status: "ACTIVE",
            },
          ],
        };
      }

      return { rows: [] };
    });

    const req = {
      params: { id: "session-1" },
    } as unknown as Request;

    const { status, json, response } = makeResponse();

    await completeVerificationSession(req, response);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        verification_completed: true,
        verification_session_id: "session-1",
        verification_status: "VERIFIED",
      })
    );

    const sqlCalls = mocks.poolQuery.mock.calls.map(([sql]) =>
      String(sql).replace(/\s+/g, " ").trim()
    );

    expect(
      sqlCalls.some((sql) =>
        sql.includes("UPDATE verification_sessions")
      )
    ).toBe(true);
  });
});

describe.each([
  ["verified check-in", createVerifiedCheckIn],
  ["verified check-out", createVerifiedCheckOut],
])("%s biometric attendance gate", (_name, handler) => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    [
      "selfie verification is false",
      {
        selfie_verified: false,
        liveness_verified: true,
        verification_status: "VERIFIED",
        is_completed: true,
      },
      "BIOMETRIC_VERIFICATION_REQUIRED",
    ],
    [
      "liveness verification is false",
      {
        selfie_verified: true,
        liveness_verified: false,
        verification_status: "VERIFIED",
        is_completed: true,
      },
      "BIOMETRIC_VERIFICATION_REQUIRED",
    ],
    [
      "verification status is not VERIFIED",
      {
        selfie_verified: true,
        liveness_verified: true,
        verification_status: "PENDING",
        is_completed: true,
      },
      "VERIFICATION_SESSION_NOT_VERIFIED",
    ],
  ])("rejects attendance when %s", async (_label, overrides, expectedCode) => {
    const query = vi.fn(async (sql: unknown) => {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();

      if (normalizedSql.includes("FROM verification_sessions")) {
        return {
          rows: [
            {
              id: "session-1",
              employee_id: 173,
              location_id: 1,
              is_used: false,
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              ...overrides,
            },
          ],
        };
      }

      return { rows: [] };
    });

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query,
      release,
    });

    const req = {
      body: {
        verification_session_id: "session-1",
        latitude: 6.9271,
        longitude: 79.8612,
        record_time: new Date().toISOString(),
      },
    } as unknown as Request;

    const { status, json, response } = makeResponse();

    await handler(req, response);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: expectedCode,
      })
    );

    const sqlCalls = query.mock.calls.map(([sql]) =>
      String(sql).replace(/\s+/g, " ").trim()
    );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("ROLLBACK");
    expect(sqlCalls).not.toContain("COMMIT");

    expect(
      sqlCalls.some((sql) =>
        sql.includes("INSERT INTO attendance_records")
      )
    ).toBe(false);

    expect(
      sqlCalls.some((sql) =>
        sql.includes("UPDATE attendance_records")
      )
    ).toBe(false);

    expect(release).toHaveBeenCalledOnce();
  });
});
