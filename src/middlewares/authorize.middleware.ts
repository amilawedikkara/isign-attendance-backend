import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export const authorizeRoles = (
  ...allowedRoles: string[]
) => {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userRole = req.user?.role_name;

      if (!userRole) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: "Forbidden",
        });
      }

      return next();
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Authorization failed",
      });
    }
  };
};