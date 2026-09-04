import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import {
  authService,
  AuthServiceError,
} from "../services/auth.service";

const getRefreshCookieOptions = (maxAge?: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/v1/auth",
  ...(maxAge !== undefined ? { maxAge } : {}),
});

const handleAuthError = (
  error: unknown,
  res: Response,
  fallbackMessage = "Internal server error"
) => {
  if (error instanceof AuthServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
};

/**
 * POST /api/v1/auth/login
 */
export const loginUser = async (
  req: Request,
  res: Response
) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    const loginResult = await authService.login(
      username,
      password,
      {
        deviceInfo: req.get("user-agent") || null,
        ipAddress: req.ip || null,
      }
    );

    res.cookie(
      "refresh_token",
      loginResult.refreshToken,
      getRefreshCookieOptions(
        loginResult.refreshTokenMaxAgeMs
      )
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      access_token: loginResult.accessToken,
      expires_in: loginResult.expiresIn,
      user: loginResult.user,
    });
  } catch (error) {
    return handleAuthError(error, res);
  }
};

/**
 * POST /api/v1/auth/refresh
 */
export const refreshAccessToken = async (
  req: Request,
  res: Response
) => {
  try {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        code: "REFRESH_TOKEN_MISSING",
        message: "Refresh token is missing",
      });
    }

    const refreshResult =
      await authService.refreshAccessToken(
        refreshToken,
        {
          deviceInfo: req.get("user-agent") || null,
          ipAddress: req.ip || null,
        }
      );

    res.cookie(
      "refresh_token",
      refreshResult.refreshToken,
      getRefreshCookieOptions(
        refreshResult.refreshTokenMaxAgeMs
      )
    );

    return res.status(200).json({
      success: true,
      message: "New access token generated",
      access_token: refreshResult.accessToken,
      expires_in: refreshResult.expiresIn,
    });
  } catch (error) {
    if (
      error instanceof AuthServiceError &&
      error.clearRefreshCookie
    ) {
      res.clearCookie(
        "refresh_token",
        getRefreshCookieOptions()
      );
    }

    return handleAuthError(error, res);
  }
};

/**
 * POST /api/v1/auth/logout
 */
export const logoutUser = async (
  req: Request,
  res: Response
) => {
  const refreshToken = req.cookies?.refresh_token;

  try {
    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    res.clearCookie(
      "refresh_token",
      getRefreshCookieOptions()
    );

    return res.status(200).json({
      success: true,
      message: refreshToken
        ? "Logged out successfully"
        : "Already logged out",
    });
  } catch (error) {
    res.clearCookie(
      "refresh_token",
      getRefreshCookieOptions()
    );

    return handleAuthError(error, res);
  }
};

/**
 * POST /api/v1/auth/logout-all
 */
export const logoutAllUsers = async (
  req: Request,
  res: Response
) => {
  const refreshToken = req.cookies?.refresh_token;

  try {
    if (!refreshToken) {
      res.clearCookie(
        "refresh_token",
        getRefreshCookieOptions()
      );

      return res.status(200).json({
        success: true,
        message: "Already logged out",
      });
    }

    await authService.logoutAll(refreshToken);

    res.clearCookie(
      "refresh_token",
      getRefreshCookieOptions()
    );

    return res.status(200).json({
      success: true,
      message: "All sessions revoked successfully",
    });
  } catch (error) {
    res.clearCookie(
      "refresh_token",
      getRefreshCookieOptions()
    );

    return handleAuthError(error, res);
  }
};

/**
 * GET /api/v1/auth/me
 */
export const getCurrentUser = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const currentUser =
      await authService.getCurrentUser(userId);

    return res.status(200).json({
      success: true,
      ...currentUser,
    });
  } catch (error) {
    return handleAuthError(
      error,
      res,
      "Failed to fetch current user"
    );
  }
};