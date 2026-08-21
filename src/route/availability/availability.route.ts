import { Router } from "express";
import { authJWT } from "../../middlewares/auth.middleware";
import {
    getMyWeeklyAvailabilityApi,
    setMyWeeklyAvailabilityApi,
    getMyBookingSettingsApi,
    setMyBookingSettingsApi,
    getMyTimeOffApi,
    addMyTimeOffApi,
    removeMyTimeOffApi,
} from "../../controller/availability/availability.controller";

const availabilityRouter = Router();

// Provider only.
availabilityRouter.get("/weekly", authJWT, getMyWeeklyAvailabilityApi);
availabilityRouter.put("/weekly", authJWT, setMyWeeklyAvailabilityApi);

availabilityRouter.get("/settings", authJWT, getMyBookingSettingsApi);
availabilityRouter.put("/settings", authJWT, setMyBookingSettingsApi);

availabilityRouter.get("/time-off", authJWT, getMyTimeOffApi);
availabilityRouter.post("/time-off", authJWT, addMyTimeOffApi);
availabilityRouter.delete("/time-off/:timeOffId", authJWT, removeMyTimeOffApi);

export default availabilityRouter;
