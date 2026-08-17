import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { AppointmentService } from "../../services/AppointmentService";
import { AvailabilityService } from "../../services/AvailabilityService";
import prisma from "../../db/db.config";

const appointmentService = new AppointmentService();
const availabilityService = new AvailabilityService();

const VALID_SESSION_TYPES = ["ONLINE", "IN_PERSON", "HOME_VISIT"];

const getPublicAvailableSlotsApi = asyncHandler(async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const { from, to } = req.query;

  const fromDate = from ? new Date(String(from)) : new Date();
  const toDate = to ? new Date(String(to)) : new Date(fromDate.getTime() + 14 * 24 * 60 * 60000);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate <= fromDate) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(new ApiResponse(StatusCodes.BAD_REQUEST, null, "Invalid date range"));
  }

  const profile = await prisma.providerProfile.findUnique({ where: { slug } });
  if (!profile || !profile.isPublished) {
    return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, null, "Provider not found"));
  }

  const result = await availabilityService.computeAvailableSlots(profile.providerId, fromDate, toDate);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, result, "OK"));
});

const bookPublicAppointmentApi = asyncHandler(async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const { startTime, sessionType, guestName, guestEmail, guestPhone, notes } = req.body;

  if (
    !String(startTime || "").trim() ||
    !VALID_SESSION_TYPES.includes(sessionType) ||
    !String(guestName || "").trim() ||
    !String(guestEmail || "").trim()
  ) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Please fill out all required fields.");
  }

  const appointment = await appointmentService.bookPublicAppointment(slug, {
    startTime,
    sessionType,
    guestName,
    guestEmail,
    guestPhone,
    notes,
  });

  return res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse(StatusCodes.CREATED, appointment, "Booking request submitted successfully"));
});

const getMyAppointmentsApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const { status, from, to } = req.query;

  const appointments = await appointmentService.getMyAppointments(loginUserId, {
    status: status ? String(status) : undefined,
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
  });

  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, appointments, "OK"));
});

const cancelMyAppointmentApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const appointmentId = String(req.params.appointmentId);

  const appointment = await appointmentService.cancelMyAppointment(loginUserId, appointmentId);
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, appointment, "Appointment cancelled successfully"));
});

const acceptMyAppointmentApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const appointmentId = String(req.params.appointmentId);

  const appointment = await appointmentService.acceptAppointment(loginUserId, appointmentId);
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, appointment, "Booking request accepted"));
});

const declineMyAppointmentApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const appointmentId = String(req.params.appointmentId);

  const appointment = await appointmentService.declineAppointment(loginUserId, appointmentId);
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, appointment, "Booking request declined"));
});

const getPublicAppointmentByTokenApi = asyncHandler(async (req: Request, res: Response) => {
  const cancelToken = String(req.params.cancelToken);
  const appointment = await appointmentService.getPublicAppointmentByToken(cancelToken);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, appointment, "OK"));
});

const cancelByGuestTokenApi = asyncHandler(async (req: Request, res: Response) => {
  const cancelToken = String(req.params.cancelToken);
  const appointment = await appointmentService.cancelByGuestToken(cancelToken);
  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, appointment, "Appointment cancelled successfully"));
});

export {
  getPublicAvailableSlotsApi,
  bookPublicAppointmentApi,
  getMyAppointmentsApi,
  cancelMyAppointmentApi,
  acceptMyAppointmentApi,
  declineMyAppointmentApi,
  getPublicAppointmentByTokenApi,
  cancelByGuestTokenApi,
};
