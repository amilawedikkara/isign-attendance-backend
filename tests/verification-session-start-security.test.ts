import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("../src/config/db", () => ({
  default: {
    connect: mocks.connect,
  },
}));

import {
  startVerificationSession,
} from "../src/controllers/verification.controller";

const makeResponse = () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));

  return {
    json,
    status,
    response: { status } as unknown as Response,
  };
};

const makeRequest = (
  attendanceType: "CHECK_IN" | "CHECK_OUT" = "CHECK_IN"
) =>
  ({
    body: {
      employee_id: 173,
      attendance_type: attendanceType,
      device_uuid: "trusted-device-1",
    },
  }) as unknown as Request;

const makeQuery = (
  employeeOverrides: Record<string, unknown>,
  openAttendanceRows: Array<Record<string, unknown>> = []
) =>
  vi.fn(async (sql: unknown) => {
    const normalizedSql = String(sql)
      .replace(/\s+/g, " ")
      .trim();

    if (normalizedSql.includes("FROM devices d")) {
      return {
        rows: [
          {
            device_id: 10,
            location_id: 1,
            device_status: "ACTIVE",
          },
        ],
      };
    }

    if (normalizedSql.includes("FROM employees e")) {
      return {
        rows: [
          {
            id: 173,
            location_id: 1,
            secret_code_enabled: false,
            face_enrolled: true,
            biometric_status: "ACTIVE",
            verification_required: true,
            employee_status: "ACTIVE",
            ...employeeOverrides,
          },
        ],
      };
    }

    if (normalizedSql.includes("FROM attendance_records")) {
      return {
        rows: openAttendanceRows,
      };
    }

    if (
      normalizedSql.includes(
        "INSERT INTO verification_sessions"
      )
    ) {
      return {
        rows: [{ id: "session-1" }],
      };
    }

    return { rows: [] };
  });

describe("verification session start biometric gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects session start without active face enrollment", async () => {
    const query = makeQuery({
      face_enrolled: false,
      biometric_status: "INACTIVE",
    });

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query,
      release,
    });

    const { status, json, response } = makeResponse();

    await startVerificationSession(
      makeRequest(),
      response
    );

    expect(status).toHaveBeenCalledWith(403);

    expect(json).toHaveBeenCalledWith({
      success: false,
      code: "FACE_ENROLLMENT_REQUIRED",
      message:
        "Active face enrollment is required before attendance verification can start.",
    });

    const sqlCalls = query.mock.calls.map(([sql]) =>
      String(sql).replace(/\s+/g, " ").trim()
    );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("ROLLBACK");
    expect(sqlCalls).not.toContain("COMMIT");

    expect(
      sqlCalls.some((sql) =>
        sql.includes(
          "INSERT INTO verification_sessions"
        )
      )
    ).toBe(false);

    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects duplicate Duty In before creating a verification session", async () => {
    const query = makeQuery(
      {
        face_enrolled: true,
        biometric_status: "ACTIVE",
      },
      [
        {
          id: 501,
          location_id: 1,
        },
      ]
    );

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query,
      release,
    });

    const { status, json, response } = makeResponse();

    await startVerificationSession(
      makeRequest("CHECK_IN"),
      response
    );

    expect(status).toHaveBeenCalledWith(409);

    expect(json).toHaveBeenCalledWith({
      success: false,
      code: "ALREADY_DUTY_IN",
      message: "Employee is already Duty In.",
    });

    const sqlCalls = query.mock.calls.map(([sql]) =>
      String(sql).replace(/\s+/g, " ").trim()
    );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("ROLLBACK");
    expect(sqlCalls).not.toContain("COMMIT");

    expect(
      sqlCalls.some((sql) =>
        sql.includes(
          "INSERT INTO verification_sessions"
        )
      )
    ).toBe(false);

    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects Duty Out when there is no open attendance at the device location", async () => {
    const query = makeQuery(
      {
        face_enrolled: true,
        biometric_status: "ACTIVE",
      },
      [
        {
          id: 502,
          location_id: 2,
        },
      ]
    );

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query,
      release,
    });

    const { status, json, response } = makeResponse();

    await startVerificationSession(
      makeRequest("CHECK_OUT"),
      response
    );

    expect(status).toHaveBeenCalledWith(409);

    expect(json).toHaveBeenCalledWith({
      success: false,
      code: "NOT_DUTY_IN",
      message:
        "Employee is not currently Duty In at this location.",
    });

    const sqlCalls = query.mock.calls.map(([sql]) =>
      String(sql).replace(/\s+/g, " ").trim()
    );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("ROLLBACK");
    expect(sqlCalls).not.toContain("COMMIT");

    expect(
      sqlCalls.some((sql) =>
        sql.includes(
          "INSERT INTO verification_sessions"
        )
      )
    ).toBe(false);

    expect(release).toHaveBeenCalledOnce();
  });

  it("always returns LIVE_SELFIE for an actively enrolled employee", async () => {
    const query = makeQuery({
      secret_code_enabled: false,
      face_enrolled: true,
      biometric_status: "ACTIVE",
    });

    const release = vi.fn();

    mocks.connect.mockResolvedValue({
      query,
      release,
    });

    const { status, json, response } = makeResponse();

    await startVerificationSession(
      makeRequest(),
      response
    );

    expect(status).toHaveBeenCalledWith(201);

    expect(json).toHaveBeenCalledWith({
      success: true,
      verification_session_id: "session-1",
      expires_in: 90,
      required_steps: [
        "LIVE_SELFIE",
      ],
    });

    const sqlCalls = query.mock.calls.map(([sql]) =>
      String(sql).replace(/\s+/g, " ").trim()
    );

    expect(
      sqlCalls.some((sql) =>
        sql.includes(
          "INSERT INTO verification_sessions"
        )
      )
    ).toBe(true);

    expect(sqlCalls).toContain("COMMIT");
    expect(sqlCalls).not.toContain("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});
