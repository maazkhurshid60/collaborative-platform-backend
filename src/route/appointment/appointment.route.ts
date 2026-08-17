import { Router } from "express";
import { authJWT } from "../../middlewares/auth.middleware";
import {
    getPublicAvailableSlotsApi,
    bookPublicAppointmentApi,
    getMyAppointmentsApi,
    cancelMyAppointmentApi,
    acceptMyAppointmentApi,
    declineMyAppointmentApi,
    getPublicAppointmentByTokenApi,
    cancelByGuestTokenApi,
} from "../../controller/appointment/appointment.controller";

const appointmentRouter = Router();

// Public — no auth. Used by the "Book Appointment" widget on a provider's public profile.
appointmentRouter.get("/public/:slug/available-slots", getPublicAvailableSlotsApi);
appointmentRouter.post("/public/:slug/book", bookPublicAppointmentApi);

// Public — no auth. Guest self-service cancel, reached via the emailed link
// identified solely by the unguessable cancelToken.
appointmentRouter.get("/public/cancel/:cancelToken", getPublicAppointmentByTokenApi);
appointmentRouter.patch("/public/cancel/:cancelToken", cancelByGuestTokenApi);

// Provider only.
appointmentRouter.get("/me", authJWT, getMyAppointmentsApi);
appointmentRouter.patch("/me/:appointmentId/cancel", authJWT, cancelMyAppointmentApi);
appointmentRouter.patch("/me/:appointmentId/accept", authJWT, acceptMyAppointmentApi);
appointmentRouter.patch("/me/:appointmentId/decline", authJWT, declineMyAppointmentApi);

export default appointmentRouter;
