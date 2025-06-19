import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
const createChatChannel = asyncHandler(async (req: Request, res: Response) => {
    const { providerId, toProviderId } = req.body;

    if (!providerId || !toProviderId) {
        return res.status(400).json({ message: 'Both providerId and toProviderId are required.' });
    }

    const [a, b] = [providerId, toProviderId].sort();

    try {
        // Ensure both providers exist in the database
        const providerA = await prisma.provider.findUnique({ where: { id: a } });
        const providerB = await prisma.provider.findUnique({ where: { id: b } });

        if (!providerA || !providerB) {
            return res.status(400).json({ message: 'One or both providers do not exist.' });
        }

        // Check if a chat channel between the two providers already exists
        let channel = await prisma.chatChannel.findFirst({
            where: { providerAId: a, providerBId: b }
        });

        if (!channel) {
            // If the channel does not exist, create it
            channel = await prisma.chatChannel.create({
                data: {
                    providerAId: a,
                    providerBId: b
                }
            });

            return res.status(StatusCodes.CREATED).json(new ApiResponse(StatusCodes.CREATED, { channel }, "Chat Channel created"));
        }

        // If the channel already exists, return the existing one
        return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { channel }, "Chat Channel already exists"));

    } catch (err) {
        return res.status(500).json({ message: 'Error creating chat channel', error: err });
    }
});


const getAllChatChannel = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId } = req.body;

    const findAllChatChannel = await prisma.chatChannel.findMany({
        where: {
            OR: [
                { providerAId: loginUserId },
                { providerBId: loginUserId }
            ]
        },
        include: {
            providerA: { include: { user: true } },
            providerB: { include: { user: true } },
        }
    });
    // AFTER fetching findAllChatChannel
    const enrichedChannels = await Promise.all(findAllChatChannel.map(async (channel) => {
        const otherUserId = channel.providerAId === loginUserId ? channel.providerBId : channel.providerAId;

        const unreadCount = await prisma.chatMessage.count({
            where: {
                chatChannelId: channel.id,
                senderId: otherUserId, // sent by other user
                readReceipts: {
                    none: {
                        providerId: loginUserId
                    }
                }
            }
        });

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
            totalUnread: unreadCount,
            lastMessage: lastMessage || null // <-- include this
        };

    }));


    return res
        .status(StatusCodes.OK)
        .json(new ApiResponse(StatusCodes.OK, { findAllChatChannel: enrichedChannels }, "Chat Channels fetched successfully"));

});



export { createChatChannel, getAllChatChannel }