import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  verifyFace: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("../src/config/db", () => ({
  default: {
    connect: mocks.connect,
  },
}));

vi.mock("../src/services/pythonBiometric.service", () => ({
  verifyFaceWithPythonService: mocks.verifyFace,
}));

vi.mock("fs", () => ({
  default: {
    existsSync: mocks.existsSync,
  },
}));

import { uploadLiveSelfie } from "../src/controllers/verification.controller";

describe("uploadLiveSelfie Python service failures", () => {
  let query: ReturnType<typeof vi.fn>;
  let release: ReturnType<typeof vi.fn>;
  let status: ReturnType<typeof vi.fn>;
  let json: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.existsSync.mockReturnValue(true);

    query = vi.fn(async (sql: unknown) => {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();

      if (normalizedSql.includes("FROM verification_sessions")) {
        return {
          rows: [
            {
              id: "session-1",
              employee_id: 173,
              is_used: false,
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              secret_code_verified: true,
              secret_code_enabled: true,
              face_enrolled: true,
              biometric_status: "ACTIVE",
              image_path: "C:\\test-images\\reference.jpg",
            },
          ],
        };
      }

      return { rows: [] };
    });

    release = vi.fn();

    mocks.connect.mockResolvedValue({
      query,
      release,
    });

    json = vi.fn();
    status = vi.fn(() => ({ json }));
  });

  it("returns 409 and does not call Python when the reference image file is missing", async () => {
    mocks.existsSync.mockReturnValueOnce(false);

    const req = {
      params: { id: "session-1" },
      file: { path: "C:\\test-images\\live-selfie.jpg" },
    } as unknown as Request;

    const res = {
      status,
    } as unknown as Response;

    await uploadLiveSelfie(req, res);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      success: false,
      code: "FACE_ENROLLMENT_IMAGE_MISSING",
      message:
        "The enrolled face image is missing. Please re-enrol the employee's face.",
    });

    expect(mocks.verifyFace).not.toHaveBeenCalled();

    const sqlCalls = query.mock.calls.map(([sql]) =>
      String(sql).replace(/\s+/g, " ").trim()
    );

    expect(sqlCalls).toContain("BEGIN");
    expect(sqlCalls).toContain("ROLLBACK");
    expect(sqlCalls).not.toContain("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "timeout",
      pythonError: {
        code: "VERIFICATION_SERVICE_TIMEOUT",
        message:
          "The face verification service did not respond in time. Please try again.",
        httpStatus: 504,
        technicalMessage:
          "Python verification request timed out after 30 seconds.",
      },
      expectedStatus: 504,
      expectedCode: "VERIFICATION_SERVICE_TIMEOUT",
      expectedMessage:
        "The face verification service did not respond in time. Please try again.",
    },
    {
      name: "connection failure",
      pythonError: {
        code: "VERIFICATION_SERVICE_UNAVAILABLE",
        message:
          "The face verification service is temporarily unavailable. Please try again.",
        httpStatus: 502,
        technicalMessage:
          "Could not connect to Python verification service.",
      },
      expectedStatus: 502,
      expectedCode: "VERIFICATION_SERVICE_UNAVAILABLE",
      expectedMessage:
        "The face verification service is temporarily unavailable. Please try again.",
    },
    {
      name: "Python HTTP 500",
      pythonError: {
        code: "VERIFICATION_SERVICE_ERROR",
        message:
          "The face verification service encountered an internal error. Please try again.",
        httpStatus: 502,
        technicalMessage:
          "Python verification service returned HTTP 500.",
      },
      expectedStatus: 502,
      expectedCode: "VERIFICATION_SERVICE_ERROR",
      expectedMessage:
        "The face verification service encountered an internal error. Please try again.",
    },
  ])(
    "returns a meaningful response and writes no verification flags for $name",
    async ({
      pythonError,
      expectedStatus,
      expectedCode,
      expectedMessage,
    }) => {
      mocks.verifyFace.mockRejectedValueOnce(pythonError);

      const req = {
        params: { id: "session-1" },
        file: { path: "C:\\test-images\\live-selfie.jpg" },
      } as unknown as Request;

      const res = {
        status,
      } as unknown as Response;

      await uploadLiveSelfie(req, res);

      expect(status).toHaveBeenCalledWith(expectedStatus);
      expect(json).toHaveBeenCalledWith({
        success: false,
        code: expectedCode,
        message: expectedMessage,
        retryable: true,
        error_reference: expectedCode,
      });

      const sqlCalls = query.mock.calls.map(([sql]) =>
        String(sql).replace(/\s+/g, " ").trim()
      );

      expect(sqlCalls).toContain("BEGIN");
      expect(sqlCalls).toContain("ROLLBACK");
      expect(sqlCalls).not.toContain("COMMIT");
      expect(
        sqlCalls.some((sql) => sql.includes("UPDATE verification_sessions"))
      ).toBe(false);

      expect(release).toHaveBeenCalledOnce();
    }
  );
});
