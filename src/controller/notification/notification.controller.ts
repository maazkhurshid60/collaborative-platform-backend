import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { io } from "../../socket/socket";
import { STATUS_CODES } from "http";
import { ApiResponse } from "../../utils/apiResponse";
import { StatusCodes } from "http-status-codes";

const sendNotification = asyncHandler(async (req: Request, res: Response) => {
    const { recipientId, title, type } = req.body;
    console.log("📦 Notification recipientId:", recipientId);
    const user = await prisma.user.findUnique({ where: { id: recipientId } });
    console.log("🔍 Does user exist?", user);
    try {
        const notification = await prisma.notification.create({
            data: {
                recipientId,
                title,
                message: "",
                type,
            },
        });
        console.log("<<<<<<<<<<<<<<message notificaiton data", "recipientId", recipientId, "title", title, "message", "type", type);

        // Emit real-time notification to recipient
        io.to(recipientId).emit('new_notification', notification);

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { notification }, "Notificaion sent successfully")
        );
    } catch (err) {
        console.error('Error creating notification:', err);
        // return res.status(500).json({ error: 'Internal server error' });

        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: err }, "Internal server error")
        );
    }
})



const getNotification = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.body;
    try {
        const notifications = await prisma.notification.findMany({
            where: { recipientId: userId },
            orderBy: { createdAt: 'desc' },
        });

        res.json(notifications);

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { notifications }, "Notificaion fetched successfully")
        );
    } catch (err) {
        console.error('Error fetching notifications:', err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: err }, "Internal server error")
        );
    }
})


const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
    const { notificationId } = req.body;
    try {
        const notifications = await prisma.notification.delete({
            where: { id: notificationId },
        });

        // res.json(notifications);

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { notifications }, "Notificaion delete successfully")
        );
    } catch (err) {
        console.error('Error fetching notifications:', err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: err }, "Internal server error")
        );
    }
})

export { sendNotification, getNotification, deleteNotification }