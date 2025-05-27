import { Router } from "express";
import { getNotification, sendNotification } from "../../controller/notification/notification.controller";

const notificationRouter = Router()

notificationRouter.post("/send-notification", sendNotification)
notificationRouter.post("/get-notification", getNotification)

export default notificationRouter