import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { AvailabilityService } from "../../services/AvailabilityService";

const availabilityService = new AvailabilityService();

const getMyWeeklyAvailabilityApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const availability = await availabilityService.getMyWeeklyAvailability(loginUserId);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, availability, "OK"));
});

const setMyWeeklyAvailabilityApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const days = Array.isArray(req.body.days) ? req.body.days : [];
  const availability = await availabilityService.setMyWeeklyAvailability(loginUserId, days);
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, availability, "Availability updated successfully"));
});

const getMyBookingSettingsApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const settings = await availabilityService.getMyBookingSettings(loginUserId);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, settings, "OK"));
});

const setMyBookingSettingsApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const { timezone, appointmentDurationMinutes, bufferMinutes } = req.body;
  const settings = await availabilityService.setMyBookingSettings(loginUserId, {
    timezone,
    appointmentDurationMinutes,
    bufferMinutes,
  });
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, settings, "Booking settings updated successfully"));
});

const getMyTimeOffApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const timeOff = await availabilityService.getMyTimeOff(loginUserId);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, timeOff, "OK"));
});

const addMyTimeOffApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const { startDate, endDate, reason } = req.body;
  const timeOff = await availabilityService.addMyTimeOff(loginUserId, { startDate, endDate, reason });
  return res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse(StatusCodes.CREATED, timeOff, "Time off added successfully"));
});

const removeMyTimeOffApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const timeOffId = String(req.params.timeOffId);
  await availabilityService.removeMyTimeOff(loginUserId, timeOffId);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, null, "Time off removed successfully"));
});

export {
  getMyWeeklyAvailabilityApi,
  setMyWeeklyAvailabilityApi,
  getMyBookingSettingsApi,
  setMyBookingSettingsApi,
  getMyTimeOffApi,
  addMyTimeOffApi,
  removeMyTimeOffApi,
};
