import { Request, Response } from "express";
import {
  userService,
  UserServiceError,
} from "../services/user.service";

const handleUserError = (
  error: unknown,
  res: Response,
  fallbackMessage: string
) => {
  if (error instanceof UserServiceError) {
    return res.status(error.statusCode).json({
      success: false,
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
 * GET /api/v1/users
 */
export const getUsers = async (
  req: Request,
  res: Response
) => {
  try {
    const users = await userService.getUsers();

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    return handleUserError(
      error,
      res,
      "Failed to fetch users"
    );
  }
};

/**
 * POST /api/v1/users
 */
export const createUser = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      user_name,
      email,
      password,
      role_id,
    } = req.body;

    if (
      !user_name ||
      !email ||
      !password ||
      !role_id
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const user = await userService.createUser({
      user_name,
      email,
      password,
      role_id: Number(role_id),
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user,
    });
  } catch (error) {
    return handleUserError(
      error,
      res,
      "Failed to create user"
    );
  }
};

/**
 * PUT /api/v1/users/:id
 */
export const updateUser = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = Number(req.params.id);

    const {
      user_name,
      email,
      role_id,
      region_ids,
    } = req.body;

    if (
      !user_name ||
      !email ||
      !role_id
    ) {
      return res.status(400).json({
        success: false,
        message:
          "user_name, email and role_id are required",
      });
    }

    const user = await userService.updateUser(
      userId,
      {
        user_name,
        email,
        role_id: Number(role_id),
        region_ids,
      }
    );

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    return handleUserError(
      error,
      res,
      "Failed to update user"
    );
  }
};

/**
 * DELETE /api/v1/users/:id
 */
export const deleteUser = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = Number(req.params.id);

    await userService.deleteUser(userId);

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    return handleUserError(
      error,
      res,
      "Failed to delete user"
    );
  }
};