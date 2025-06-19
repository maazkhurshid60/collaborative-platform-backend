import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { io } from "../../socket/socket";
import { STATUS_CODES } from "http";
import { ApiResponse } from "../../utils/apiResponse";
import { StatusCodes } from "http-status-codes";

const sendNotification = asyncHandler(async (req: Request, res: Response) => {
    const { recipientId, title, type, senderId, message = "" } = req.body;

    try {
        // Always create notification for recipient
        const recipientNotification = await prisma.notification.create({
            data: {
                recipientId, // Who recieve notification
                senderId,    // who send notification
                title,
                message,
                type,
            },
        });


        console.log("<<<<<<<<<<<<<<<<<<<<<<notification controller line25<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
        console.log("<<<<<<<<<<<<<<<<<<<<<<notification controller line26<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
        console.log("<<<<<<<<<<<<<<<<<<<<<notification controller line27<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
        console.log("<<<<<<<<<<<<<<<<<<<<<notification controller line28<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
        console.log("<<<<<<<<<<<<<<<<<<<<<notification controller line29<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<", recipientNotification);
        console.log("<<<<<<<<<<<<<<<<<<<<<notification controller line30<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
        console.log("<<<<<<<<<<<<<<<<<<<<<notification controller line31<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
        console.log("<<<<<<<<<<<<<<<<<<<<<notification controller line32<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
        console.log("<<<<<<<<<<<<<<<<<<<<<notification controller line33<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");


        io.to(recipientId).emit("new_notification", recipientNotification);

        let senderNotification = null;

        // Create separate notification for sender ONLY if they are different
        if (senderId && senderId !== recipientId) {
            senderNotification = await prisma.notification.create({
                data: {
                    recipientId: senderId,
                    senderId: senderId,
                    title,
                    message: "", // or customized for sender
                    type,
                },
            });

            io.to(senderId).emit("new_notification", senderNotification);
        }

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { recipientNotification, senderNotification }, "Notifications sent successfully")
        );

    } catch (err) {
        console.error("❌ Error sending notifications:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: err }, "Failed to send notification")
        );
    }
});




const getNotification = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.body;

    try {
        const notifications = await prisma.notification.findMany({
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

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { notifications }, "Notifications fetched successfully")
        );
    } catch (err) {
        console.error("❌ Error fetching notifications:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: err }, "Internal server error")
        );
    }
});


const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
    const { notificationId, userId } = req.body;

    const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
    });

    if (!notification) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, {}, "Notification not found")
        );
    }

    if (notification.recipientId !== userId) {
        return res.status(StatusCodes.FORBIDDEN).json(
            new ApiResponse(StatusCodes.FORBIDDEN, {}, "You don't have permission to delete this notification")
        );
    }

    await prisma.notification.delete({
        where: { id: notificationId },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {}, "Notification deleted successfully")
    );
});
;



export { sendNotification, getNotification, deleteNotification }
