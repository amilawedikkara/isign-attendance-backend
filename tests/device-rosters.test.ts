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
  getDeviceRosters,
} from "../src/controllers/device.controller";

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
  query: Record<string, unknown> = {
    device_uuid: "trusted-device-1",
    start_date: "2026-08-03",
    end_date: "2026-08-10",
  }
) =>
  ({
    query,
  }) as unknown as Request;

describe("device roster endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("requires device_uuid", async () => {
    const { status, json, response } = makeResponse();

    await getDeviceRosters(
      makeRequest({
        start_date: "2026-08-03",
        end_date: "2026-08-10",
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

  it("rejects invalid date values", async () => {
    const { status, json, response } = makeResponse();

    await getDeviceRosters(
      makeRequest({
        device_uuid: "trusted-device-1",
        start_date: "2026-02-30",
        end_date: "2026-08-10",
      }),
      response
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: "Dates must use YYYY-MM-DD format",
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown device", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [],
    });

    const { status, json, response } = makeResponse();

    await getDeviceRosters(
      makeRequest(),
      response
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: "Device not found",
    });
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("rejects a device that is not active", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          device_id: 10,
          location_id: 12,
          location_name: "Mobile Test Branch",
          status_name: "Inactive",
        },
      ],
    });

    const { status, json, response } = makeResponse();

    await getDeviceRosters(
      makeRequest(),
      response
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: "Device is not active or trusted",
    });
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("returns only the registered device location roster range", async () => {
    const rosters = [
      {
        roster_id: 101,
        employee_id: 173,
        employee_name: "MOBTEST003",
        gid: "MOBTEST003",
        designation_name: "Paramedic",
        shift_start_time: "2026-08-03T08:00:00.000Z",
        shift_end_time: "2026-08-03T20:00:00.000Z",
        status_id: 1,
        roster_status: "Scheduled",
      },
    ];

    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            device_id: 10,
            location_id: 12,
            location_name: "Mobile Test Branch",
            status_name: "Active",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: rosters,
      });

    const { status, json, response } = makeResponse();

    await getDeviceRosters(
      makeRequest(),
      response
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      success: true,
      location: {
        location_id: 12,
        location_name: "Mobile Test Branch",
      },
      start_date: "2026-08-03",
      end_date: "2026-08-10",
      rosters,
    });

    expect(mocks.query).toHaveBeenCalledTimes(2);

    expect(mocks.query.mock.calls[0][1]).toEqual([
      "trusted-device-1",
    ]);

    expect(mocks.query.mock.calls[1][1]).toEqual([
      12,
      "2026-08-03",
      "2026-08-10",
    ]);

    const rosterSql = String(
      mocks.query.mock.calls[1][0]
    )
      .replace(/\s+/g, " ")
      .trim();

    expect(rosterSql).toContain(
      "WHERE r.location_id = $1"
    );
    expect(rosterSql).toContain(
      "JOIN employee_statuses es"
    );
    expect(rosterSql).toContain(
      "es.status_name = 'Active'"
    );
    expect(rosterSql).toContain(
      "r.shift_end_time > $2::date"
    );
    expect(rosterSql).toContain(
      "r.shift_start_time < ($3::date + INTERVAL '1 day')"
    );
    expect(rosterSql).not.toContain("employee_code");
  });
});
