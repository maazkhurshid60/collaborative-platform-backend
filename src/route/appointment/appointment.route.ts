import { Router } from "express";
import { authJWT } from "../../middlewares/auth.middleware";
import {
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
} from "../../controller/appointment/appointment.controller";

const appointmentRouter = Router();

// Public — no auth. Used by the "Book Appointment" widget on a provider's public profile.
appointmentRouter.get("/public/:slug/available-slots", getPublicAvailableSlotsApi);
appointmentRouter.post("/public/:slug/book", bookPublicAppointmentApi);

// Public — no auth. Guest self-service cancel, reached via the emailed link
// identified solely by the unguessable cancelToken.
appointmentRouter.get("/public/cancel/:cancelToken", getPublicAppointmentByTokenApi);
appointmentRouter.patch("/public/cancel/:cancelToken", cancelByGuestTokenApi);

// Public — no auth. Verifies a video-call join token (guest or provider) and
// returns display info only — never TURN credentials (those come only over
// the authorized Socket.IO channel, see socket.ts).
appointmentRouter.get("/public/call/:token", getPublicCallInfoApi);

// Provider only.
appointmentRouter.post("/book-provider", authJWT, bookProviderAppointmentApi);
appointmentRouter.post("/start-instant-call", authJWT, startInstantCallApi);
appointmentRouter.get("/me", authJWT, getMyAppointmentsApi);
appointmentRouter.get("/direct-call-logs", authJWT, getDirectCallLogsApi);
appointmentRouter.get("/my-call-logs", authJWT, getAllMyCallLogsApi);
appointmentRouter.delete("/me/call-logs/clear-all", authJWT, clearAllCallLogsApi);
appointmentRouter.post("/me/call-logs/bulk-delete", authJWT, bulkDeleteCallLogsApi);
appointmentRouter.delete("/me/call-logs/:appointmentId", authJWT, deleteSingleCallLogApi);
appointmentRouter.patch("/me/:appointmentId/cancel", authJWT, cancelMyAppointmentApi);
appointmentRouter.patch("/me/:appointmentId/accept", authJWT, acceptMyAppointmentApi);
appointmentRouter.patch("/me/:appointmentId/decline", authJWT, declineMyAppointmentApi);
appointmentRouter.patch("/me/:appointmentId/reschedule", authJWT, rescheduleAppointmentApi);
appointmentRouter.post("/me/:appointmentId/resend-email", authJWT, resendAppointmentEmailApi);
appointmentRouter.get("/me/:appointmentId/share-link", authJWT, getAppointmentShareLinkApi);
appointmentRouter.get("/me/:appointmentId/call-join", authJWT, getMyCallJoinInfoApi);
appointmentRouter.get("/me/:appointmentId/call-logs", authJWT, getAppointmentCallLogsApi);

export default appointmentRouter;
