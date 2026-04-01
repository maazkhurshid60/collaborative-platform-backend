import { Router } from "express";
import { deleteNotification, getNotification, sendNotification, getUnreadNotificationCount, markNotificationsAsSeen } from "../../controller/notification/notification.controller";

const notificationRouter = Router()

notificationRouter.post("/send-notification", sendNotification)
notificationRouter.post("/get-notification", getNotification)
notificationRouter.get("/unread-count/:userId", getUnreadNotificationCount)
notificationRouter.post("/mark-as-seen", markNotificationsAsSeen)
notificationRouter.delete("/delete-notification", deleteNotification)

export default notificationRouter