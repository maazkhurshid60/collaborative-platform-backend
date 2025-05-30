import { Router } from "express";
import { deleteNotification, getNotification, sendNotification } from "../../controller/notification/notification.controller";

const notificationRouter = Router()

notificationRouter.post("/send-notification", sendNotification)
notificationRouter.post("/get-notification", getNotification)
notificationRouter.delete("/delete-notification", deleteNotification)

export default notificationRouter