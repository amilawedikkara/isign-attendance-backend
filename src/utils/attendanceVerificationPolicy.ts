export interface FaceEnrollmentState {
  face_enrolled?: unknown;
  biometric_status?: unknown;
}

export interface VerificationCompletionState {
  secret_code_enabled?: unknown;
  secret_code_verified?: unknown;
  selfie_verified?: unknown;
  liveness_verified?: unknown;
}

export interface AttendanceVerificationState {
  is_completed?: unknown;
  verification_status?: unknown;
  selfie_verified?: unknown;
  liveness_verified?: unknown;
}

export interface AttendanceVerificationFailure {
  code: string;
  message: string;
}

export const hasActiveFaceEnrollment = (
  state: FaceEnrollmentState
): boolean =>
  state.face_enrolled === true &&
  state.biometric_status === "ACTIVE";

export const buildRequiredVerificationSteps = (
  secretCodeEnabled: boolean
): string[] => {
  const requiredSteps: string[] = [];

  if (secretCodeEnabled) {
    requiredSteps.push("SECRET_CODE");
  }

  requiredSteps.push("LIVE_SELFIE");

  return requiredSteps;
};

export const getIncompleteVerificationSteps = (
  session: VerificationCompletionState
): string[] => {
  const incompleteSteps: string[] = [];

  if (
    session.secret_code_enabled === true &&
    session.secret_code_verified !== true
  ) {
    incompleteSteps.push("SECRET_CODE");
  }

  if (
    session.selfie_verified !== true ||
    session.liveness_verified !== true
  ) {
    incompleteSteps.push("LIVE_SELFIE");
  }

  return incompleteSteps;
};

export const getAttendanceVerificationFailure = (
  session: AttendanceVerificationState
): AttendanceVerificationFailure | null => {
  if (
    session.is_completed !== true ||
    session.verification_status !== "VERIFIED"
  ) {
    return {
      code: "VERIFICATION_SESSION_NOT_VERIFIED",
      message: "Verification session is not completed and verified",
    };
  }

  if (
    session.selfie_verified !== true ||
    session.liveness_verified !== true
  ) {
    return {
      code: "BIOMETRIC_VERIFICATION_REQUIRED",
      message:
        "Verified live selfie and liveness are required for attendance",
    };
  }

  return null;
};
