"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notification_controller_1 = require("../../controller/notification/notification.controller");
const notificationRouter = (0, express_1.Router)();
notificationRouter.post("/send-notification", notification_controller_1.sendNotification);
notificationRouter.post("/get-notification", notification_controller_1.getNotification);
notificationRouter.delete("/delete-notification", notification_controller_1.deleteNotification);
exports.default = notificationRouter;
