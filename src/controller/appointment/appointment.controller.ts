import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { AppointmentService } from "../../services/AppointmentService";
import { AvailabilityService, LIST_SAFETY_BUFFER_MINUTES } from "../../services/AvailabilityService";
import prisma from "../../db/db.config";

const appointmentService = new AppointmentService();
const availabilityService = new AvailabilityService();

const VALID_SESSION_TYPES = ["ONLINE", "IN_PERSON", "HOME_VISIT"];

const getPublicAvailableSlotsApi = asyncHandler(async (req: Request, res: Response) => {
  const identifier = String(req.params.slug);
  const { from, to } = req.query;

  const fromDate = from ? new Date(String(from)) : new Date();
  const toDate = to ? new Date(String(to)) : new Date(fromDate.getTime() + 14 * 24 * 60 * 60000);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate <= fromDate) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(new ApiResponse(StatusCodes.BAD_REQUEST, null, "Invalid date range"));
  }

  let profile = await prisma.providerProfile.findFirst({
    where: {
      OR: [
        { slug: identifier },
        { providerId: identifier },
        { id: identifier },
        { provider: { userId: identifier } },
      ],
    },
  });

  let providerId = profile?.providerId;

  if (!providerId) {
    const provider = await prisma.provider.findFirst({
      where: {
        OR: [{ id: identifier }, { userId: identifier }],
      },
    });
    if (provider) {
      providerId = provider.id;
    }
  }

  if (!providerId) {
    return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, null, "Provider not found"));
  }

  const result = await availabilityService.computeAvailableSlots(
    providerId,
    fromDate,
    toDate,
    LIST_SAFETY_BUFFER_MINUTES,
  );
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

const bookProviderAppointmentApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const { targetProviderId, startTime, sessionType, notes } = req.body;

  if (
    !String(targetProviderId || "").trim() ||
    !String(startTime || "").trim() ||
    !VALID_SESSION_TYPES.includes(sessionType)
  ) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Please fill out all required fields.");
  }

  const appointment = await appointmentService.bookProviderAppointment(loginUserId, {
    targetProviderId,
    startTime,
    sessionType,
    notes,
  });

  return res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse(StatusCodes.CREATED, appointment, "Consultation session request submitted successfully"));
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

const getMyCallJoinInfoApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const appointmentId = String(req.params.appointmentId);

  const joinInfo = await appointmentService.getProviderCallJoinInfo(loginUserId, appointmentId);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, joinInfo, "OK"));
});

const getPublicCallInfoApi = asyncHandler(async (req: Request, res: Response) => {
  const token = String(req.params.token);
  const callInfo = await appointmentService.getPublicCallInfo(token);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, callInfo, "OK"));
});

const startInstantCallApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const { targetProviderId, callType } = req.body;

  if (!String(targetProviderId || "").trim()) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Target provider ID is required.");
  }

  const mode = callType === "audio" ? "audio" : "video";

  const result = await appointmentService.startInstantCall(loginUserId, {
    targetProviderId,
    callType: mode,
  });

  return res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse(StatusCodes.CREATED, result, "Instant call initiated successfully"));
});

const getAppointmentCallLogsApi = asyncHandler(async (req: Request, res: Response) => {
  const appointmentId = String(req.params.appointmentId);
  const logs = await prisma.appointmentCallLog.findMany({
    where: { appointmentId },
    orderBy: { occurredAt: "desc" },
  });
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, logs, "Call logs fetched successfully"));
});

export {
  getPublicAvailableSlotsApi,
  bookPublicAppointmentApi,
  bookProviderAppointmentApi,
  startInstantCallApi,
  getMyAppointmentsApi,
  cancelMyAppointmentApi,
  acceptMyAppointmentApi,
  declineMyAppointmentApi,
  getPublicAppointmentByTokenApi,
  cancelByGuestTokenApi,
  getMyCallJoinInfoApi,
  getPublicCallInfoApi,
  getAppointmentCallLogsApi,
};
