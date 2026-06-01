import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { decryptText } from "../../utils/encryptedMessage/EncryptedMessage";
import { resolveChatUser } from "../../utils/resolveChatUser";

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
    // Find the users (preventing admin chat)
    const userA = await resolveChatUser(providerId);
    const userB = await resolveChatUser(toProviderId);

    if (!userA || !userB) {
      return res
        .status(400)
        .json({
          message: "One or both users do not exist or are not authorized.",
        });
    }

    // Sort User IDs for consistent compound key
    const [a, b] = [userA.id, userB.id].sort();

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
    if (channel.providerAId === userA.id) {
      await prisma.chatChannel.update({
        where: { id: channel.id },
        data: { deletedByA: false },
      });
    } else if (channel.providerBId === userA.id) {
      await prisma.chatChannel.update({
        where: { id: channel.id },
        data: { deletedByB: false },
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

  // Resolve user
  const user = await resolveChatUser(loginUserId);

  if (!user) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json(
        new ApiResponse(
          StatusCodes.NOT_FOUND,
          null,
          "User not found or not authorized",
        ),
      );
  }

  const userIdToSearch = user.id;

  // Fetch all channels for user that are not deleted by them
  const findAllChatChannel = await prisma.chatChannel.findMany({
    where: {
      OR: [
        { providerAId: userIdToSearch, deletedByA: false },
        { providerBId: userIdToSearch, deletedByB: false },
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

const getAllUsersForChat = asyncHandler(async (req: Request, res: Response) => {
  const { loginUserId } = req.body;
  const user = await resolveChatUser(loginUserId);

  if (!user) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json(new ApiResponse(StatusCodes.NOT_FOUND, null, "User not found"));
  }

  // Fetch the full user to see their role and relations
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      provider: {
        include: { clientList: { select: { client: { select: { userId: true } } } } }
      },
      client: {
        include: { providerList: { select: { provider: { select: { userId: true } } } } }
      }
    }
  });

  let userWhereClause: any = {
    id: { not: user.id },
    isApprove: "APPROVED",
    role: { not: "superAdmin" },
  };

  if (fullUser?.role === "provider" && fullUser.provider) {
    // A provider can chat with ALL other providers, but ONLY their own clients
    const myClientUserIds = fullUser.provider.clientList.map(pc => pc.client.userId);
    userWhereClause.OR = [
      { role: "provider" },
      { role: "client", id: { in: myClientUserIds } }
    ];
  } else if (fullUser?.role === "client" && fullUser.client) {
    // A client can ONLY chat with their assigned providers
    const myProviderUserIds = fullUser.client.providerList.map(pc => pc.provider.userId);
    userWhereClause.id = { in: myProviderUserIds, not: user.id };
  }

  const users = await prisma.user.findMany({
    where: userWhereClause,
    select: {
      id: true,
      fullName: true,
      email: true,
      profileImage: true,
      role: true,
      status: true,
      isApprove: true,
      provider: {
        select: {
          speciality: true,
        },
      },
    },
  });

  const formattedUsers = users.map((u) => ({
    id: u.id,
    speciality: u.provider?.speciality || null,
    user: {
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      profileImage: u.profileImage,
      role: u.role,
      status: u.status,
      isApprove: u.isApprove,
    },
  }));

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { users: formattedUsers },
        "Users fetched successfully",
      ),
    );
});

export {
  createChatChannel,
  getAllChatChannel,
  deleteChatChannel,
  getAllUsersForChat,
};
