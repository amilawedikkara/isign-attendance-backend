import { Request, Response } from "express";
import {
  getAttendanceSummaryService,
  getAttendanceTrendsService,
  getLateAbsenteeismService,
  getRegionalPerformanceService,
} from "../services/report.service";

export const getAttendanceSummary = async (
  req: Request,
  res: Response
) => {
  try {
    const { start_date, end_date, location_id } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "start_date and end_date are required",
      });
    }

    const startDate = new Date(start_date as string);
    const endDate = new Date(end_date as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid start_date or end_date",
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: "start_date cannot be later than end_date",
      });
    }

    const summary = await getAttendanceSummaryService(
      start_date as string,
      end_date as string,
      location_id as string | undefined
    );

    return res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("Get attendance summary error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getAttendanceTrends = async (
  req: Request,
  res: Response
) => {
  try {
    const { start_date, end_date, location_id } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "start_date and end_date are required",
      });
    }

    const startDate = new Date(start_date as string);
    const endDate = new Date(end_date as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid start_date or end_date",
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: "start_date cannot be later than end_date",
      });
    }

    const trends = await getAttendanceTrendsService(
      start_date as string,
      end_date as string,
      location_id as string | undefined
    );

    return res.status(200).json({
      success: true,
      trends,
    });
  } catch (error) {
    console.error("Get attendance trends error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};export const getLateAbsenteeism = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      start_date,
      end_date,
      location_id,
      employee_id,
    } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "start_date and end_date are required",
      });
    }

    const startDate = new Date(start_date as string);
    const endDate = new Date(end_date as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid start_date or end_date",
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: "start_date cannot be later than end_date",
      });
    }

    const records = await getLateAbsenteeismService(
      start_date as string,
      end_date as string,
      location_id as string | undefined,
      employee_id as string | undefined
    );

    return res.status(200).json({
      success: true,
      records,
    });
  } catch (error) {
    console.error("Get late absenteeism report error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getRegionalPerformance = async (
  req: Request,
  res: Response
) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "start_date and end_date are required",
      });
    }

    const startDate = new Date(start_date as string);
    const endDate = new Date(end_date as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid start_date or end_date",
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: "start_date cannot be later than end_date",
      });
    }

    const regions = await getRegionalPerformanceService(
      start_date as string,
      end_date as string
    );

    return res.status(200).json({
      success: true,
      regions,
    });
  } catch (error) {
    console.error("Get regional performance report error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
