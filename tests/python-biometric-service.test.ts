import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  isAxiosError: vi.fn(),
  append: vi.fn(),
  getHeaders: vi.fn(() => ({
    "content-type": "multipart/form-data",
  })),
  createReadStream: vi.fn(() => ({ mockedStream: true })),
}));

vi.mock("axios", () => ({
  default: {
    post: mocks.post,
    isAxiosError: mocks.isAxiosError,
  },
}));

vi.mock("form-data", () => ({
  default: class MockFormData {
    append = mocks.append;
    getHeaders = mocks.getHeaders;
  },
}));

vi.mock("fs", () => ({
  default: {
    createReadStream: mocks.createReadStream,
  },
}));

describe("python biometric service error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.PYTHON_BIOMETRIC_BASE_URL = "http://python.test";

    mocks.isAxiosError.mockImplementation(
      (error: unknown) =>
        Boolean((error as { isAxiosError?: boolean })?.isAxiosError)
    );
  });

  it("returns Python success response unchanged", async () => {
    const pythonResponse = {
      success: true,
      face_detected: true,
      liveness_passed: true,
      face_verified: true,
      confidence_score: 0.91,
      risk_score: 0.0,
      message: "Face verification passed.",
    };

    mocks.post.mockResolvedValueOnce({
      data: pythonResponse,
    });

    const { verifyFaceWithPythonService } = await import(
      "../src/services/pythonBiometric.service"
    );

    const result = await verifyFaceWithPythonService(
      "session-1",
      173,
      "reference.jpg",
      "selfie.jpg"
    );

    expect(result).toEqual(pythonResponse);
  });

  it("classifies a timeout clearly", async () => {
    mocks.post.mockRejectedValueOnce(
      Object.assign(new Error("timeout"), {
        isAxiosError: true,
        code: "ECONNABORTED",
      })
    );

    const { verifyFaceWithPythonService } = await import(
      "../src/services/pythonBiometric.service"
    );

    await expect(
      verifyFaceWithPythonService(
        "session-1",
        173,
        "reference.jpg",
        "selfie.jpg"
      )
    ).rejects.toMatchObject({
      name: "PythonBiometricServiceError",
      code: "VERIFICATION_SERVICE_TIMEOUT",
      httpStatus: 504,
      message:
        "The face verification service did not respond in time. Please try again.",
    });
  });

  it("classifies a connection failure clearly", async () => {
    mocks.post.mockRejectedValueOnce(
      Object.assign(new Error("connect ECONNREFUSED"), {
        isAxiosError: true,
        code: "ECONNREFUSED",
      })
    );

    const { verifyFaceWithPythonService } = await import(
      "../src/services/pythonBiometric.service"
    );

    await expect(
      verifyFaceWithPythonService(
        "session-1",
        173,
        "reference.jpg",
        "selfie.jpg"
      )
    ).rejects.toMatchObject({
      code: "VERIFICATION_SERVICE_UNAVAILABLE",
      httpStatus: 502,
      message:
        "The face verification service is temporarily unavailable. Please try again.",
    });
  });

  it("classifies Python HTTP 500 clearly", async () => {
    mocks.post.mockRejectedValueOnce(
      Object.assign(new Error("HTTP 500"), {
        isAxiosError: true,
        response: {
          status: 500,
        },
      })
    );

    const { verifyFaceWithPythonService } = await import(
      "../src/services/pythonBiometric.service"
    );

    await expect(
      verifyFaceWithPythonService(
        "session-1",
        173,
        "reference.jpg",
        "selfie.jpg"
      )
    ).rejects.toMatchObject({
      code: "VERIFICATION_SERVICE_ERROR",
      httpStatus: 502,
      message:
        "The face verification service encountered an internal error. Please try again.",
      technicalMessage:
        "Python verification service returned HTTP 500.",
    });
  });

  it("rejects an invalid Python response", async () => {
    mocks.post.mockResolvedValueOnce({
      data: {
        message: "Missing success field",
      },
    });

    const { verifyFaceWithPythonService } = await import(
      "../src/services/pythonBiometric.service"
    );

    await expect(
      verifyFaceWithPythonService(
        "session-1",
        173,
        "reference.jpg",
        "selfie.jpg"
      )
    ).rejects.toMatchObject({
      code: "VERIFICATION_SERVICE_INVALID_RESPONSE",
      httpStatus: 502,
      message:
        "The face verification service returned an invalid response. Please try again.",
    });
  });
});
