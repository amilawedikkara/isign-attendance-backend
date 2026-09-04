import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../src/config/db", () => ({
  default: {
    query: mocks.query,
  },
}));

import {
  getDeviceAttendanceHistory,
  startDeviceAttendanceHistorySession,
} from "../src/controllers/deviceAttendanceHistory.controller";

const makeResponse = () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));

  return {
    json,
    status,
    response: { status } as unknown as Response,
  };
};

const makeStartRequest = (
  body: Record<string, unknown> = {
    device_uuid: "trusted-device-1",
    employee_id: 173,
  }
) =>
  ({
    body,
  }) as unknown as Request;

const makeHistoryRequest = (
  verificationSessionId = "history-session-1"
) =>
  ({
    query: {
      verification_session_id: verificationSessionId,
    },
  }) as unknown as Request;

const activeDevice = {
  device_id: 10,
  location_id: 12,
  location_name: "Mobile Test Branch",
  status_name: "Active",
};

const activeEmployee = {
  employee_id: 173,
  location_id: 12,
  secret_code_enabled: true,
  employee_status: "Active",
};

describe("device attendance history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("requires device_uuid when starting a history session", async () => {
    const { status, json, response } = makeResponse();

    await startDeviceAttendanceHistorySession(
      makeStartRequest({
        employee_id: 173,
      }),
      response
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: "device_uuid is required",
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects an employee outside the registered device location", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [activeDevice],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            ...activeEmployee,
            location_id: 99,
          },
        ],
      });

    const { status, json, response } = makeResponse();

    await startDeviceAttendanceHistorySession(
      makeStartRequest(),
      response
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: "Employee is not allocated to this device location",
    });
  });

  it("reuses an active history session so attempts cannot be reset", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [activeDevice],
      })
      .mockResolvedValueOnce({
        rows: [activeEmployee],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "history-session-1",
            expires_at: "2026-08-07T21:00:00.000Z",
            secret_code_attempts: 2,
            max_secret_code_attempts: 3,
          },
        ],
      });

    const { status, json, response } = makeResponse();

    await startDeviceAttendanceHistorySession(
      makeStartRequest(),
      response
    );

    expect(status).toHaveBeenCalledWith(200);

    expect(json).toHaveBeenCalledWith({
      success: true,
      verification_session_id: "history-session-1",
      expires_at: "2026-08-07T21:00:00.000Z",
      remaining_attempts: 1,
    });

    expect(mocks.query).toHaveBeenCalledTimes(3);

    const reuseSql = String(
      mocks.query.mock.calls[2][0]
    )
      .replace(/\s+/g, " ")
      .trim();

    expect(reuseSql).toContain(
      "required_steps @> ARRAY[$3]::text[]"
    );
  });

  it("creates a history-only verification session", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [activeDevice],
      })
      .mockResolvedValueOnce({
        rows: [activeEmployee],
      })
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "history-session-new",
            expires_at: "2026-08-07T21:00:00.000Z",
            secret_code_attempts: 0,
            max_secret_code_attempts: 3,
          },
        ],
      });

    const { status, json, response } = makeResponse();

    await startDeviceAttendanceHistorySession(
      makeStartRequest(),
      response
    );

    expect(status).toHaveBeenCalledWith(201);

    const insertSql = String(
      mocks.query.mock.calls[3][0]
    )
      .replace(/\s+/g, " ")
      .trim();

    expect(insertSql).toContain(
      "INSERT INTO verification_sessions"
    );
    expect(insertSql).toContain(
      "ARRAY[$4]::text[]"
    );

    expect(mocks.query.mock.calls[3][1]).toEqual([
      173,
      10,
      12,
      "ATTENDANCE_HISTORY",
    ]);
  });

  it("does not expose history before secret-code verification", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "history-session-1",
          employee_id: 173,
          location_id: 12,
          secret_code_verified: false,
          expires_at: "2099-08-07T21:00:00.000Z",
          is_used: false,
          required_steps: ["ATTENDANCE_HISTORY"],
          device_id: 10,
          device_status: "Active",
          location_name: "Mobile Test Branch",
          full_name: "Mobile Test Face",
          gid: "MOBTEST003",
          employee_location_id: 12,
          employee_status: "Active",
          designation_name: "Paramedic",
        },
      ],
    });

    const { status, json, response } = makeResponse();

    await getDeviceAttendanceHistory(
      makeHistoryRequest(),
      response
    );

    expect(status).toHaveBeenCalledWith(403);

    expect(json).toHaveBeenCalledWith({
      success: false,
      message: "Secret code verification is required",
    });

    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("returns only the verified employee 30-day history", async () => {
    const attendance = [
      {
        attendance_id: 501,
        employee_id: 173,
        location_id: 12,
        check_in_time: "2026-08-07T06:00:00.000Z",
        check_out_time: "2026-08-07T14:00:00.000Z",
        attendance_date: "2026-08-07",
        status_id: 2,
        attendance_status: "CHECKED_OUT",
        verification_status: "VERIFIED",
      },
      {
        attendance_id: 500,
        employee_id: 173,
        location_id: 12,
        check_in_time: "2026-08-06T06:00:00.000Z",
        check_out_time: null,
        attendance_date: "2026-08-06",
        status_id: 1,
        attendance_status: "CHECKED_IN",
        verification_status: "VERIFIED",
      },
    ];

    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "history-session-1",
            employee_id: 173,
            location_id: 12,
            secret_code_verified: true,
            expires_at: "2099-08-07T21:00:00.000Z",
            is_used: false,
            required_steps: ["ATTENDANCE_HISTORY"],
            device_id: 10,
            device_status: "Active",
            location_name: "Mobile Test Branch",
            full_name: "Mobile Test Face",
            gid: "MOBTEST003",
            employee_location_id: 12,
            employee_status: "Active",
            designation_name: "Paramedic",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            start_date: "2026-07-09",
            end_date: "2026-08-07",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: attendance,
      });

    const { status, json, response } = makeResponse();

    await getDeviceAttendanceHistory(
      makeHistoryRequest(),
      response
    );

    expect(status).toHaveBeenCalledWith(200);

    expect(json).toHaveBeenCalledWith({
      success: true,
      location: {
        location_id: 12,
        location_name: "Mobile Test Branch",
      },
      employee: {
        employee_id: 173,
        full_name: "Mobile Test Face",
        gid: "MOBTEST003",
        designation_name: "Paramedic",
      },
      start_date: "2026-07-09",
      end_date: "2026-08-07",
      summary: {
        present_days: 2,
        completed_shifts: 1,
        currently_duty_in: 1,
      },
      attendance,
    });

    const attendanceSql = String(
      mocks.query.mock.calls[2][0]
    )
      .replace(/\s+/g, " ")
      .trim();

    expect(attendanceSql).toContain(
      "ar.employee_id = $1"
    );
    expect(attendanceSql).toContain(
      "ar.location_id = $2"
    );
    expect(attendanceSql).toContain(
      "CURRENT_DATE - INTERVAL '29 days'"
    );

    expect(mocks.query.mock.calls[2][1]).toEqual([
      173,
      12,
    ]);
  });
});
