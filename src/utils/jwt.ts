import * as jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_TOKEN_EXPIRES_IN =
  (process.env.JWT_ACCESS_EXPIRES_IN ||
    "30m") as jwt.SignOptions["expiresIn"];

const REFRESH_TOKEN_EXPIRES_IN =
  (process.env.JWT_REFRESH_EXPIRES_IN ||
    "1d") as jwt.SignOptions["expiresIn"];

export interface TokenUser {
  id: number;
  email: string;
  role_id: number;
  role_name: string;
}

export interface RefreshTokenPayload {
  user_id: number;
  session_id: string;
  token_family_id: string;
  type: "refresh";
}

export const generateAccessToken = (user: TokenUser): string => {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not configured");
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role_id: user.role_id,
      role_name: user.role_name,
      type: "access",
    },
    secret,
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    }
  );
};

export const generateRefreshToken = (
  payload: RefreshTokenPayload
): string => {
  const secret = process.env.JWT_REFRESH_SECRET;

  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET is not configured");
  }

  return jwt.sign(payload, secret, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
};

export const verifyRefreshToken = (
  token: string
): RefreshTokenPayload => {
  const secret = process.env.JWT_REFRESH_SECRET;

  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET is not configured");
  }

  const decoded = jwt.verify(token, secret) as RefreshTokenPayload;

  if (decoded.type !== "refresh") {
    throw new Error("Invalid token type");
  }

  return decoded;
};

export const hashRefreshToken = (token: string): string => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};