import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";

interface AccessTokenPayload {
  id: number;
  email: string;
  role_id: number;
  role_name: string;
  type: "access";
}

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role_id: number;
    role_name: string;
  };
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  const token =
    authHeader &&
    authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    console.error(
      "JWT_ACCESS_SECRET is not configured"
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      secret
    ) as AccessTokenPayload;

    if (decoded.type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role_id: decoded.role_id,
      role_name: decoded.role_name,
    };

    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
};