import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { uploadToS3 } from "../../utils/multer/chatMediaConfig";



// const getAllSingleConservationMessage = asyncHandler(async (req: Request, res: Response) => {
//     const { chatChannelId, loginUserId } = req.body;

//     try {
//         const chatChannel = await prisma.chatChannel.findUnique({
//             where: { id: chatChannelId },
//             select: {

//                 providerAId: true,
//                 providerBId: true,
//             },
//         });

//         if (!chatChannel) {
//             return res.status(404).json({ message: 'Chat channel not found' });
//         }

//         if (![chatChannel.providerAId, chatChannel.providerBId].includes(loginUserId)) {
//             return res.status(403).json({ message: 'You are not authorized to view this chat' });
//         }

//         // Fetch the messages along with read receipt for each message
//         const messages = await prisma.chatMessage.findMany({
//             where: { chatChannelId },
//             orderBy: { createdAt: 'asc' },
//             include: {
//                 sender: { include: { user: true } },
//                 readReceipts: {
//                     where: { providerId: loginUserId }, // Get read receipt for the logged-in user
//                 }
//             },
//         });

//         // Add a field to each message to show if it's read or unread
//         const messagesWithReadStatus = messages.map(message => ({
//             ...message,
//             readStatus: message.readReceipts.length > 0 ? 'read' : 'unread',
//         }));
//         const unreadMessagesCount = messagesWithReadStatus.filter(message => message.readStatus === 'unread').length;

//         return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { messages: messagesWithReadStatus, unreadMessagesCount }, "Messages fetched successfully"));

//     } catch (err) {
//         res.status(500).json({ message: 'Error fetching messages', error: err });
//     }
// });

const getAllSingleConservationMessage = asyncHandler(async (req: Request, res: Response) => {
    const { chatChannelId, loginUserId, page = 1, limit = 10 } = req.body;
    console.log("chatChannelId received:", chatChannelId)
    console.log("loginUserId received:", loginUserId)
    const skip = (page - 1) * limit;

    try {
        const chatChannel = await prisma.chatChannel.findUnique({
            where: { id: chatChannelId },
            select: {
                providerAId: true,
                providerBId: true,
            },
        });

        if (!chatChannel) {
            return res.status(404).json({ message: 'Chat channel not found' });
        }

        if (![chatChannel.providerAId, chatChannel.providerBId].includes(loginUserId)) {
            return res.status(403).json({ message: 'You are not authorized to view this chat' });
        }

        // Get total message count (optional, useful for frontend pagination)
        const totalMessages = await prisma.chatMessage.count({
            where: { chatChannelId }
        });

        // Get paginated messages
        const messages = await prisma.chatMessage.findMany({
            where: { chatChannelId },
            orderBy: { createdAt: 'desc' }, // latest first
            skip,
            take: limit,
            include: {
                sender: { include: { user: true } },
                readReceipts: {
                    where: { providerId: loginUserId },
                }
            },
        });
        console.log("Fetched messages count:");
        console.log("Fetched messages count:");
        console.log("Fetched messages count:");
        console.log("Fetched messages count:");

        console.log("Fetched messages count:",);
        console.log("Fetched messages count:", messages.length);
        console.log("Fetched messages count:");
        console.log("Fetched messages count:");
        console.log("Fetched messages count:");
        console.log("Fetched messages count:");

        // Reverse to show old → new
        const reversedMessages = messages.reverse();

        const messagesWithReadStatus = reversedMessages.map(message => ({
            ...message,
            readStatus: message.readReceipts.length > 0 ? 'read' : 'unread',
        }));

        const unreadMessagesCount = messagesWithReadStatus.filter(message => message.readStatus === 'unread').length;

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, {
                messages: messagesWithReadStatus,
                unreadMessagesCount,
                totalMessages,
                currentPage: page,
                hasMore: skip + limit < totalMessages
            }, "Messages fetched successfully")
        );

    } catch (err) {
        res.status(500).json({ message: 'Error fetching messages', error: err });
    }
});




const sendMessageToSingleConservation = asyncHandler(async (req: Request, res: Response) => {
    const { chatChannelId, message, type, senderId } = req.body;
    const files = req.files as Express.Multer.File[]; // files from multer

    try {
        const channel = await prisma.chatChannel.findUnique({
            where: { id: chatChannelId },
        });

        if (!channel) {
            return res.status(400).json({ message: 'Chat channel does not exist' });
        }

        // Upload media files to S3
        let uploadedMediaUrls: string[] = [];
        if (files && files.length > 0) {
            const uploadPromises = files.map(file => uploadToS3(file));
            uploadedMediaUrls = await Promise.all(uploadPromises);
        }

        const chatMessage = await prisma.chatMessage.create({
            data: {
                senderId,
                message: message || '', // fallback if empty
                chatChannelId,
                mediaUrl: uploadedMediaUrls.join(','), // store as CSV or use separate Media table
                type: type || 'text',
                readReceipts: {
                    create: {
                        providerId: senderId,
                    },
                },
            },
        });

        await prisma.chatChannel.update({
            where: { id: chatChannelId },
            data: {
                updatedAt: new Date().toISOString(),
            },
        });

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { chatMessage }, 'Message sent successfully')
        );
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error sending message', error: err });
    }
});


const deleteMessageToSingleConservation = asyncHandler(async (req: Request, res: Response) => {
    const { channelId, messageId, loginUserId } = req.body;

    // Ensure the channel exists
    const isChannelExist = await prisma.chatChannel.findFirst({
        where: { id: channelId },
    });

    if (!isChannelExist) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { message: `This chat channe; does not exist.` }, "Channel Not Found")
        );
    }

    // Ensure the message exists and check if the message is sent by the logged-in user
    const message = await prisma.chatMessage.findFirst({
        where: {
            id: messageId,
            chatChannelId: channelId, // Ensure the message belongs to the channel
            senderId: loginUserId, // Ensure the message is sent by the login user
        },
    });

    if (!message) {
        return res.status(StatusCodes.FORBIDDEN).json(
            new ApiResponse(StatusCodes.FORBIDDEN, { message: `You can only delete your own messages.` }, "Message Not Found or Permission Denied")
        );
    }

    // Proceed to delete the message
    const deletedMessage = await prisma.chatMessage.delete({
        where: { id: messageId },
    });

    // Return success response
    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { deletedMessage }, 'Message deleted successfully.')
    );

})


const getAllConversations = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId } = req.body;

    try {
        // Fetch all chat channels for the logged-in user
        const chatChannels = await prisma.chatChannel.findMany({
            where: {
                OR: [
                    { providerAId: loginUserId },
                    { providerBId: loginUserId }
                ]
            },
            select: {
                id: true,
                providerAId: true,
                providerBId: true
            }
        });

        if (chatChannels.length === 0) {
            return res.status(404).json({ message: 'No chat channels found for this user' });
        }

        // For each channel, fetch the last message
        const chatChannelsWithLastMessage = await Promise.all(chatChannels.map(async (channel) => {
            // Fetch the last message in the channel
            const lastMessage = await prisma.chatMessage.findFirst({
                where: { chatChannelId: channel.id },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    message: true,
                    createdAt: true
                }
            });

            return {
                ...channel,
                lastMessage: lastMessage || null // Include the last message (if any)
            };
        }));

        return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, {
            chatChannels: chatChannelsWithLastMessage
        }, "Chat channels fetched successfully"));

    } catch (err) {
        res.status(500).json({ message: 'Error fetching chat channels', error: err });
    }
});


// POST /chat/read-messages
const markMessagesAsRead = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId, chatChannelId, groupId } = req.body;

    try {
        // Determine the filter based on chat type
        const messageFilter: any = {
            readReceipts: {
                none: {
                    providerId: loginUserId
                }
            },
            NOT: {
                senderId: loginUserId
            }
        };

        if (chatChannelId) {
            messageFilter.chatChannelId = chatChannelId;
        } else if (groupId) {
            messageFilter.groupId = groupId;
        } else {
            return res.status(StatusCodes.BAD_REQUEST).json({
                message: 'Either chatChannelId or groupId must be provided.'
            });
        }

        // Get all unread messages
        const unreadMessages = await prisma.chatMessage.findMany({
            where: messageFilter,
            select: { id: true }
        });

        // Mark them as read
        await prisma.readReceipt.createMany({
            data: unreadMessages.map(msg => ({
                messageId: msg.id,
                providerId: loginUserId
            })),
            skipDuplicates: true,
        });

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, null, 'Messages marked as read')
        );
    } catch (error) {
        console.error('Error marking messages as read:', error);
        return res.status(500).json({ message: 'Error marking messages as read' });
    }
});



export { getAllSingleConservationMessage, sendMessageToSingleConservation, deleteMessageToSingleConservation, getAllConversations, markMessagesAsRead }


