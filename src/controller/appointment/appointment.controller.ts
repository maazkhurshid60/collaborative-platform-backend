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

const getDirectCallLogsApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user?.id || (req as any).user?.userId;
  const targetProviderId = String(req.query.targetProviderId);

  const logs = await appointmentService.getDirectCallLogs(loginUserId, targetProviderId);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, logs, "Direct call logs fetched successfully"));
});

const getAllMyCallLogsApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user?.id || (req as any).user?.userId;
  const logs = await appointmentService.getAllMyCallLogs(loginUserId);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, logs, "All call logs fetched successfully"));
});

const resendAppointmentEmailApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id || (req as any).user?.userId;
  const appointmentId = String(req.params.appointmentId);

  const result = await appointmentService.resendAppointmentEmail(loginUserId, appointmentId);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, result, "Meeting email resent successfully"));
});

const getAppointmentShareLinkApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id || (req as any).user?.userId;
  const appointmentId = String(req.params.appointmentId);

  const result = await appointmentService.getAppointmentShareLink(loginUserId, appointmentId);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, result, "Share link generated successfully"));
});

const rescheduleAppointmentApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id || (req as any).user?.userId;
  const appointmentId = String(req.params.appointmentId);
  const { newStartTime, reason } = req.body;

  const result = await appointmentService.rescheduleAppointment(
    loginUserId,
    appointmentId,
    newStartTime,
    reason,
  );
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, result, "Appointment rescheduled successfully"));
});

const deleteSingleCallLogApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id || (req as any).user?.userId;
  const appointmentId = String(req.params.appointmentId);

  const result = await appointmentService.deleteSingleCallLog(loginUserId, appointmentId);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, result, "Call log deleted successfully"));
});

const bulkDeleteCallLogsApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id || (req as any).user?.userId;
  const { appointmentIds } = req.body;

  if (!Array.isArray(appointmentIds) || appointmentIds.length === 0) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Please provide an array of appointmentIds to delete");
  }

  const result = await appointmentService.bulkDeleteCallLogs(loginUserId, appointmentIds);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, result, "Call logs deleted successfully"));
});

const clearAllCallLogsApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id || (req as any).user?.userId;

  const result = await appointmentService.clearAllCallLogs(loginUserId);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, result, "All call logs cleared successfully"));
});

const addSessionNotesApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id || (req as any).user?.userId;
  const appointmentId = String(req.params.appointmentId);
  const { sessionNotes } = req.body;

  if (!String(sessionNotes || "").trim()) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Session notes are required.");
  }

  const result = await appointmentService.addSessionNotes(loginUserId, appointmentId, String(sessionNotes).trim());
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, result, "Session notes saved"));
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
  resendAppointmentEmailApi,
  getAppointmentShareLinkApi,
  rescheduleAppointmentApi,
  deleteSingleCallLogApi,
  bulkDeleteCallLogsApi,
  clearAllCallLogsApi,
  getPublicAppointmentByTokenApi,
  cancelByGuestTokenApi,
  getMyCallJoinInfoApi,
  getPublicCallInfoApi,
  getAppointmentCallLogsApi,
  getDirectCallLogsApi,
  getAllMyCallLogsApi,
  addSessionNotesApi,
};
