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

  const [a, b] = [providerId, toProviderId].sort();

  try {
    const providerA = await prisma.provider.findUnique({ where: { id: a } });
    const providerB = await prisma.provider.findUnique({ where: { id: b } });

    if (!providerA || !providerB) {
      return res
        .status(400)
        .json({ message: "One or both providers do not exist." });
    }

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
            { channel },
            "Chat Channel created",
          ),
        );
    }

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          { channel },
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

  // Fetch all channels for user
  const findAllChatChannel = await prisma.chatChannel.findMany({
    where: {
      OR: [{ providerAId: loginUserId }, { providerBId: loginUserId }],
    },
    include: {
      providerA: {
        select: {
          id: true,
          user: {
            select: {
              fullName: true,
              profileImage: true,
            },
          },
        },
      },
      providerB: {
        select: {
          id: true,
          user: {
            select: {
              fullName: true,
              profileImage: true,
            },
          },
        },
      },
    },
  });

  const channelIds = findAllChatChannel.map((c) => c.id);

  // ===============================
  // ✅ BULK UNREAD COUNT
  // ===============================
  const unreadCounts = await prisma.chatMessage.groupBy({
    by: ["chatChannelId"],
    where: {
      chatChannelId: { in: channelIds },
      senderId: { not: loginUserId },
      readReceipts: { none: { providerId: loginUserId } },
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

  // ===============================
  // 🔥 FINAL ENRICHED RESPONSE
  // ===============================
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

// ===============================
// ❌ DELETE CHAT CHANNEL
// ===============================
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
