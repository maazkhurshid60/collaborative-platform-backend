import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";



const getAllSingleConservationMessage = asyncHandler(async (req: Request, res: Response) => {
    const { chatChannelId, loginUserId } = req.body;

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

        // Fetch the messages along with read receipt for each message
        const messages = await prisma.chatMessage.findMany({
            where: { chatChannelId },
            orderBy: { createdAt: 'asc' },
            include: {
                sender: true,
                readReceipts: {
                    where: { providerId: loginUserId }, // Get read receipt for the logged-in user
                }
            },
        });

        // Add a field to each message to show if it's read or unread
        const messagesWithReadStatus = messages.map(message => ({
            ...message,
            readStatus: message.readReceipts.length > 0 ? 'read' : 'unread',
        }));

        return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { messages: messagesWithReadStatus }, "Messages fetched successfully"));

    } catch (err) {
        res.status(500).json({ message: 'Error fetching messages', error: err });
    }
});



const sendMessageToSingleConservation = asyncHandler(async (req: Request, res: Response) => {
    const { chatChannelId, message, mediaUrl, type, senderId } = req.body;

    try {
        const channel = await prisma.chatChannel.findUnique({
            where: { id: chatChannelId }
        });

        if (!channel) {
            return res.status(400).json({ message: 'Chat channel does not exist' });
        }

        // Create the message in the database
        const chatMessage = await prisma.chatMessage.create({
            data: {
                senderId,
                message,
                chatChannelId,
                mediaUrl: mediaUrl || '',
                type: type || 'text',
            },
        });

        // Add a read receipt for the recipient(s)
        const recipientIds = [channel.providerAId, channel.providerBId].filter(id => id !== senderId);
        const readReceipts = recipientIds.map(providerId => ({
            messageId: chatMessage.id,
            providerId,
        }));

        await prisma.readReceipt.createMany({
            data: readReceipts,
        });

        return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { chatMessage }, "Message sent successfully"));

    } catch (err) {
        res.status(500).json({ message: 'Error sending message', error: err });
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







export { getAllSingleConservationMessage, sendMessageToSingleConservation, deleteMessageToSingleConservation }



//code without read/unread status tracking will be removed if above api worked correct at frontend


// const sendMessageToSingleConservation = asyncHandler(async (req: Request, res: Response) => {
//     const { chatChannelId, message, mediaUrl, type, senderId } = req.body;

//     try {
//         // Check if the chatChannelId exists
//         const channel = await prisma.chatChannel.findUnique({
//             where: {
//                 id: chatChannelId // Ensure the chatChannelId exists in the database
//             }
//         });

//         // If the channel does not exist, return an error
//         if (!channel) {
//             return res.status(400).json({ message: 'Chat channel does not exist' });
//         }

//         // Create the message in the database
//         const chatMessage = await prisma.chatMessage.create({
//             data: {
//                 senderId,
//                 message,
//                 chatChannelId,
//                 mediaUrl: mediaUrl || '',  // Default to empty if not provided
//                 type: type || 'text'  // Default to 'text' if type is not provided
//             }
//         });

//         return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { chatMessage }, "Message sent successfully"));

//     } catch (err) {
//         res.status(500).json({ message: 'Error sending message', error: err });
//     }
// });


// const getAllSingleConservationMessage = asyncHandler(async (req: Request, res: Response) => {
//     const { chatChannelId, loginUserId } = req.body;

//     try {
//         // Fetch the chat channel to check if the user is part of the channel
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

//         // Ensure the logged-in user is either providerA or providerB in the channel
//         if (![chatChannel.providerAId, chatChannel.providerBId].includes(loginUserId)) {
//             return res.status(403).json({ message: 'You are not authorized to view this chat' });
//         }

//         // Now, fetch the messages for the specific channel and ensure the user can see them
//         const messages = await prisma.chatMessage.findMany({
//             where: { chatChannelId },
//             orderBy: { createdAt: 'asc' },
//             include: { sender: true },
//         });

//         return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { messages }, "Messages fetched successfully"));

//     } catch (err) {
//         res.status(500).json({ message: 'Error fetching messages', error: err });
//     }
// });