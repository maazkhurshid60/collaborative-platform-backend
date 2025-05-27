"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteNotification = exports.getNotification = exports.sendNotification = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const db_config_1 = __importDefault(require("../../db/db.config"));
const socket_1 = require("../../socket/socket");
const apiResponse_1 = require("../../utils/apiResponse");
const http_status_codes_1 = require("http-status-codes");
const sendNotification = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { recipientId, title, type } = req.body;
    console.log("📦 Notification recipientId:", recipientId);
    const user = yield db_config_1.default.user.findUnique({ where: { id: recipientId } });
    console.log("🔍 Does user exist?", user);
    try {
        const notification = yield db_config_1.default.notification.create({
            data: {
                recipientId,
                title,
                message: "",
                type,
            },
        });
        console.log("<<<<<<<<<<<<<<message notificaiton data", "recipientId", recipientId, "title", title, "message", "type", type);
        // Emit real-time notification to recipient
        socket_1.io.to(recipientId).emit('new_notification', notification);
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { notification }, "Notificaion sent successfully"));
    }
    catch (err) {
        console.error('Error creating notification:', err);
        // return res.status(500).json({ error: 'Internal server error' });
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: err }, "Internal server error"));
    }
}));
exports.sendNotification = sendNotification;
const getNotification = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.body;
    try {
        const notifications = yield db_config_1.default.notification.findMany({
            where: { recipientId: userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(notifications);
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { notifications }, "Notificaion fetched successfully"));
    }
    catch (err) {
        console.error('Error fetching notifications:', err);
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: err }, "Internal server error"));
    }
}));
exports.getNotification = getNotification;
const deleteNotification = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { notificationId } = req.body;
    try {
        const notifications = yield db_config_1.default.notification.delete({
            where: { id: notificationId },
        });
        // res.json(notifications);
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { notifications }, "Notificaion delete successfully"));
    }
    catch (err) {
        console.error('Error fetching notifications:', err);
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: err }, "Internal server error"));
    }
}));
exports.deleteNotification = deleteNotification;
