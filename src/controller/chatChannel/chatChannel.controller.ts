import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { decryptText } from "../../utils/encryptedMessage/EncryptedMessage";

// ===============================
// ✅ CREATE CHAT CHANNEL
// ===============================
const createChatChannel = asyncHandler(async (req: Request, res: Response) => {
  const { providerId, toProviderId } = req.body;

  if (!providerId || !toProviderId) {
    return res
      .status(400)
      .json({ message: "Both providerId and toProviderId are required." });
  }

  try {
    // Find the providers to get their userId
    const providerA = await prisma.provider.findFirst({
      where: {
        OR: [
          { id: providerId },
          { userId: providerId }
        ]
      },
      select: { userId: true }
    });
    const providerB = await prisma.provider.findFirst({
      where: {
        OR: [
          { id: toProviderId },
          { userId: toProviderId }
        ]
      },
      select: { userId: true }
    });

    if (!providerA || !providerB) {
      return res
        .status(400)
        .json({ message: "One or both providers do not exist." });
    }

    // Sort User IDs for consistent compound key
    const [a, b] = [providerA.userId, providerB.userId].sort();

    // Check if channel exists
    let channel = await prisma.chatChannel.findFirst({
      where: { providerAId: a, providerBId: b },
    });

    if (!channel) {
      channel = await prisma.chatChannel.create({
        data: { providerAId: a, providerBId: b },
      });

      return res
        .status(StatusCodes.CREATED)
        .json(
          new ApiResponse(
            StatusCodes.CREATED,
            { newChatChannel: channel },
            "Chat Channel created",
          ),
        );
    }

    // If the channel exists, make sure it's unhidden for the person reaching out
    if (channel.providerAId === providerA.userId) {
      await prisma.chatChannel.update({
        where: { id: channel.id },
        data: { deletedByA: false }
      });
    } else if (channel.providerBId === providerA.userId) {
      await prisma.chatChannel.update({
        where: { id: channel.id },
        data: { deletedByB: false }
      });
    }

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          { newChatChannel: channel },
          "Chat Channel already exists",
        ),
      );
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Error creating chat channel", error: err });
  }
});

// ===============================
// ✅ GET ALL CHAT CHANNELS
// ===============================
const getAllChatChannel = asyncHandler(async (req: Request, res: Response) => {
  const { loginUserId } = req.body;

  // Get the user ID from the provider ID
  const provider = await prisma.provider.findFirst({
    where: {
      OR: [
        { id: loginUserId },
        { userId: loginUserId }
      ]
    },
    select: { userId: true }
  });

  if (!provider) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json(
        new ApiResponse(
          StatusCodes.NOT_FOUND,
          null,
          "Provider not found",
        ),
      );
  }

  const userIdToSearch = provider.userId;

  // Fetch all channels for user that are not deleted by them
  const findAllChatChannel = await prisma.chatChannel.findMany({
    where: {
      OR: [
        { providerAId: userIdToSearch, deletedByA: false },
        { providerBId: userIdToSearch, deletedByB: false }
      ],
    },
    include: {
      providerA: {
        select: {
          id: true,
          fullName: true,
          profileImage: true,
        },
      },
      providerB: {
        select: {
          id: true,
          fullName: true,
          profileImage: true,
        },
      },
    },
  });

  const channelIds = findAllChatChannel.map((c) => c.id);


  const unreadCounts = await prisma.chatMessage.groupBy({
    by: ["chatChannelId"],
    where: {
      chatChannelId: { in: channelIds },
      senderId: { not: userIdToSearch },
      readReceipts: { none: { userId: userIdToSearch } },
    },
    _count: { id: true },
  });

  const unreadMap = Object.fromEntries(
    unreadCounts.map((u) => [u.chatChannelId, u._count.id]),
  );

  // ===============================
  // ✅ BULK LAST MESSAGE FETCH
  // ===============================
  const lastMessages = await prisma.chatMessage.findMany({
    where: { chatChannelId: { in: channelIds } },
    orderBy: { createdAt: "desc" },
    distinct: ["chatChannelId"],
    select: {
      id: true,
      message: true,
      createdAt: true,
      senderId: true,
      chatChannelId: true,
      type: true,
      mediaUrl: true,
    },
  });

  const lastMessageMap = Object.fromEntries(
    lastMessages.map((m) => [
      m.chatChannelId,
      { ...m, message: m.message ? decryptText(m.message) : "" },
    ]),
  );


  const enrichedChannels = findAllChatChannel.map((channel) => ({
    ...channel,
    totalUnread: unreadMap[channel.id] || 0,
    lastMessage: lastMessageMap[channel.id] || null,
  }));

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { findAllChatChannel: enrichedChannels },
        "Chat Channels fetched successfully",
      ),
    );
});

const deleteChatChannel = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;

  if (!id) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          null,
          "Channel ID is required",
        ),
      );
  }

  try {
    await prisma.chatMessage.deleteMany({ where: { chatChannelId: id } });
    const isChatDeleted = await prisma.chatChannel.delete({ where: { id } });

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          { channel: isChatDeleted },
          "Conversation deleted successfully",
        ),
      );
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json(
        new ApiResponse(
          StatusCodes.INTERNAL_SERVER_ERROR,
          { error },
          "Internal Server Error",
        ),
      );
  }
});

export { createChatChannel, getAllChatChannel, deleteChatChannel };
