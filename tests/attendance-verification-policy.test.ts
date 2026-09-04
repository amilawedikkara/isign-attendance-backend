import { describe, expect, it } from "vitest";

import {
  buildRequiredVerificationSteps,
  getAttendanceVerificationFailure,
  getIncompleteVerificationSteps,
  hasActiveFaceEnrollment,
} from "../src/utils/attendanceVerificationPolicy";

describe("attendance verification policy", () => {
  it("recognises active face enrollment", () => {
    expect(
      hasActiveFaceEnrollment({
        face_enrolled: true,
        biometric_status: "ACTIVE",
      })
    ).toBe(true);
  });

  it("rejects inactive face enrollment", () => {
    expect(
      hasActiveFaceEnrollment({
        face_enrolled: false,
        biometric_status: "INACTIVE",
      })
    ).toBe(false);
  });

  it("always requires live selfie when secret code is disabled", () => {
    expect(buildRequiredVerificationSteps(false)).toEqual([
      "LIVE_SELFIE",
    ]);
  });

  it("requires secret code and live selfie when secret code is enabled", () => {
    expect(buildRequiredVerificationSteps(true)).toEqual([
      "SECRET_CODE",
      "LIVE_SELFIE",
    ]);
  });

  it("reports live selfie incomplete when selfie verification is false", () => {
    expect(
      getIncompleteVerificationSteps({
        secret_code_enabled: false,
        selfie_verified: false,
        liveness_verified: true,
      })
    ).toEqual(["LIVE_SELFIE"]);
  });

  it("reports live selfie incomplete when liveness verification is false", () => {
    expect(
      getIncompleteVerificationSteps({
        secret_code_enabled: false,
        selfie_verified: true,
        liveness_verified: false,
      })
    ).toEqual(["LIVE_SELFIE"]);
  });

  it("reports secret code and live selfie only once each", () => {
    expect(
      getIncompleteVerificationSteps({
        secret_code_enabled: true,
        secret_code_verified: false,
        selfie_verified: false,
        liveness_verified: false,
      })
    ).toEqual(["SECRET_CODE", "LIVE_SELFIE"]);
  });

  it("accepts only a completed and biometrically verified session", () => {
    expect(
      getAttendanceVerificationFailure({
        is_completed: true,
        verification_status: "VERIFIED",
        selfie_verified: true,
        liveness_verified: true,
      })
    ).toBeNull();
  });

  it("rejects a completed session without biometric verification", () => {
    expect(
      getAttendanceVerificationFailure({
        is_completed: true,
        verification_status: "VERIFIED",
        selfie_verified: false,
        liveness_verified: false,
      })
    ).toEqual({
      code: "BIOMETRIC_VERIFICATION_REQUIRED",
      message:
        "Verified live selfie and liveness are required for attendance",
    });
  });

  it("rejects a session whose status is not VERIFIED", () => {
    expect(
      getAttendanceVerificationFailure({
        is_completed: true,
        verification_status: "PENDING",
        selfie_verified: true,
        liveness_verified: true,
      })
    ).toEqual({
      code: "VERIFICATION_SESSION_NOT_VERIFIED",
      message: "Verification session is not completed and verified",
    });
  });
});
