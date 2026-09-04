import axios from "axios";
import FormData from "form-data";
import fs from "fs";

const PYTHON_BIOMETRIC_BASE_URL =
  process.env.PYTHON_BIOMETRIC_BASE_URL;

export type PythonBiometricServiceErrorCode =
  | "VERIFICATION_SERVICE_CONFIGURATION_ERROR"
  | "VERIFICATION_SERVICE_TIMEOUT"
  | "VERIFICATION_SERVICE_UNAVAILABLE"
  | "VERIFICATION_SERVICE_ERROR"
  | "VERIFICATION_SERVICE_INVALID_RESPONSE";

export class PythonBiometricServiceError extends Error {
  constructor(
    public readonly code: PythonBiometricServiceErrorCode,
    message: string,
    public readonly httpStatus: number,
    public readonly technicalMessage: string
  ) {
    super(message);
    this.name = "PythonBiometricServiceError";
  }
}

export const verifyFaceWithPythonService = async (
  verificationSessionId: string,
  employeeId: number,
  referenceImagePath: string,
  liveSelfiePath: string
) => {
  if (!PYTHON_BIOMETRIC_BASE_URL) {
    throw new PythonBiometricServiceError(
      "VERIFICATION_SERVICE_CONFIGURATION_ERROR",
      "The face verification service is not configured correctly. Please contact support.",
      500,
      "PYTHON_BIOMETRIC_BASE_URL is missing."
    );
  }

  try {
    const formData = new FormData();

    formData.append("verification_session_id", verificationSessionId);
    formData.append("employee_id", employeeId.toString());
    formData.append(
      "reference_image",
      fs.createReadStream(referenceImagePath)
    );
    formData.append(
      "live_selfie_image",
      fs.createReadStream(liveSelfiePath)
    );
    formData.append("captured_at", new Date().toISOString());
    formData.append("camera_source", "MOBILE_CAMERA");

    const response = await axios.post(
      `${PYTHON_BIOMETRIC_BASE_URL}/api/v1/internal/verification/face/verify`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 30000,
        validateStatus: (status) => [200, 400, 403].includes(status),
      }
    );

    if (
      !response.data ||
      typeof response.data !== "object" ||
      typeof response.data.success !== "boolean"
    ) {
      throw new PythonBiometricServiceError(
        "VERIFICATION_SERVICE_INVALID_RESPONSE",
        "The face verification service returned an invalid response. Please try again.",
        502,
        "Python response did not contain a valid success value."
      );
    }

    return response.data;
  } catch (error) {
    if (error instanceof PythonBiometricServiceError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        throw new PythonBiometricServiceError(
          "VERIFICATION_SERVICE_TIMEOUT",
          "The face verification service did not respond in time. Please try again.",
          504,
          "Python verification request timed out after 30 seconds."
        );
      }

      if (error.response) {
        throw new PythonBiometricServiceError(
          "VERIFICATION_SERVICE_ERROR",
          "The face verification service encountered an internal error. Please try again.",
          502,
          `Python verification service returned HTTP ${error.response.status}.`
        );
      }

      throw new PythonBiometricServiceError(
        "VERIFICATION_SERVICE_UNAVAILABLE",
        "The face verification service is temporarily unavailable. Please try again.",
        502,
        `Could not connect to Python verification service: ${
          error.code || "NETWORK_ERROR"
        }.`
      );
    }

    throw new PythonBiometricServiceError(
      "VERIFICATION_SERVICE_UNAVAILABLE",
      "The face verification service is temporarily unavailable. Please try again.",
      502,
      error instanceof Error
        ? error.message
        : "Unexpected verification service connection error."
    );
  }
};
