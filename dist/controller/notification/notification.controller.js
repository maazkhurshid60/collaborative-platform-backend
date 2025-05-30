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
    const { recipientId, title, type, senderId, message = "" } = req.body;
    try {
        // ✅ Always create notification for recipient
        const recipientNotification = yield db_config_1.default.notification.create({
            data: {
                recipientId, // jisko notification dikhegi
                senderId, // jisne action kiya
                title,
                message,
                type,
            },
        });
        socket_1.io.to(recipientId).emit("new_notification", recipientNotification);
        let senderNotification = null;
        // ✅ Create separate notification for sender ONLY if they are different
        if (senderId && senderId !== recipientId) {
            senderNotification = yield db_config_1.default.notification.create({
                data: {
                    recipientId: senderId,
                    senderId: senderId,
                    title,
                    message: "", // or customized for sender
                    type,
                },
            });
            socket_1.io.to(senderId).emit("new_notification", senderNotification);
        }
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { recipientNotification, senderNotification }, "Notifications sent successfully"));
    }
    catch (err) {
        console.error("❌ Error sending notifications:", err);
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: err }, "Failed to send notification"));
    }
}));
exports.sendNotification = sendNotification;
// const getNotification = asyncHandler(async (req: Request, res: Response) => {
//     const { userId } = req.body;
//     try {
//         const notifications = await prisma.notification.findMany({
//             where: { recipientId: userId, deletedByRecipient: false, },
//             include: {
//                 recipient: true,
//                 sender: true
//             },
//             orderBy: { createdAt: 'desc' },
//         });
//         return res.status(StatusCodes.OK).json(
//             new ApiResponse(StatusCodes.OK, { notifications }, "Notifications fetched successfully")
//         );
//     } catch (err) {
//         console.error('Error fetching notifications:', err);
//         return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
//             new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: err }, "Internal server error")
//         );
//     }
// });
const getNotification = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.body;
    try {
        const notifications = yield db_config_1.default.notification.findMany({
            where: {
                recipientId: userId,
            },
            include: {
                sender: true, // optional: agar sender ka naam dikhaana ho
                recipient: true, // optional: agar sender ka naam dikhaana ho
            },
            orderBy: {
                createdAt: 'desc',
            }
        });
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { notifications }, "Notifications fetched successfully"));
    }
    catch (err) {
        console.error("❌ Error fetching notifications:", err);
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: err }, "Internal server error"));
    }
}));
exports.getNotification = getNotification;
// const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
//     const { notificationId, userId } = req.body;
//     console.log("   const { notificationId, userId } = req.body;");
//     try {
//         const notification = await prisma.notification.findUnique({
//             where: { id: notificationId },
//         });
//         if (!notification) {
//             return res.status(StatusCodes.NOT_FOUND).json(
//                 new ApiResponse(StatusCodes.NOT_FOUND, {}, "Notification not found")
//             );
//         }
//         // Check if user is sender or recipient
//         let updateData = {};
//         if (notification.senderId === userId) {
//             updateData = { deletedBySender: true };
//         } else if (notification.recipientId === userId) {
//             updateData = { deletedByRecipient: true };
//         } else {
//             return res.status(StatusCodes.FORBIDDEN).json(
//                 new ApiResponse(StatusCodes.FORBIDDEN, {}, "You don't have permission to delete this notification")
//             );
//         }
//         // Update delete status
//         const updated = await prisma.notification.update({
//             where: { id: notificationId },
//             data: updateData,
//         });
//         return res.status(StatusCodes.OK).json(
//             new ApiResponse(StatusCodes.OK, updated, "Notification marked as deleted")
//         );
//     } catch (err) {
//         console.error('Error deleting notification:', err);
//         return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
//             new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: err }, "Internal server error")
//         );
//     }
// });
const deleteNotification = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { notificationId, userId } = req.body;
    const notification = yield db_config_1.default.notification.findUnique({
        where: { id: notificationId },
    });
    if (!notification) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, {}, "Notification not found"));
    }
    if (notification.recipientId !== userId) {
        return res.status(http_status_codes_1.StatusCodes.FORBIDDEN).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.FORBIDDEN, {}, "You don't have permission to delete this notification"));
    }
    yield db_config_1.default.notification.delete({
        where: { id: notificationId },
    });
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, {}, "Notification deleted successfully"));
}));
exports.deleteNotification = deleteNotification;
;
