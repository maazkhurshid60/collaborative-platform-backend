import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { uploadToS3 } from "../../utils/multer/chatMediaConfig";
import {
  decryptText,
  encryptText,
} from "../../utils/encryptedMessage/EncryptedMessage";
import { sendShareChatEmail } from "../../utils/nodeMailer/ShareChatEmail";
import { getFrontendUrl } from "../../utils/nodeMailer/getFrontendUrl";
import { AuditLogService } from "../../services/AuditLogService";


const getAllSingleConservationMessage = asyncHandler(
  async (req: Request, res: Response) => {
    const { chatChannelId, loginUserId, page = 1, limit = 10 } = req.body;

    const skip = (page - 1) * limit;

    try {
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
        return res.status(StatusCodes.NOT_FOUND).json({
          message: "Provider not found"
        });
      }

      const userIdToCheck = provider.userId;

      const chatChannel = await prisma.chatChannel.findUnique({
        where: { id: chatChannelId },
        select: {
          providerAId: true,
          providerBId: true,
        },
      });

      if (!chatChannel) {
        return res.status(404).json({ message: "Chat channel not found" });
      }

      if (
        ![chatChannel.providerAId, chatChannel.providerBId].includes(
          userIdToCheck,
        )
      ) {
        return res
          .status(403)
          .json({ message: "You are not authorized to view this chat" });
      }

      // Get total message count (optional, useful for frontend pagination)
      const totalMessages = await prisma.chatMessage.count({
        where: { chatChannelId },
      });

      // Get paginated messages
      const messages = await prisma.chatMessage.findMany({
        where: { chatChannelId },
        orderBy: { createdAt: "desc" }, // latest first
        skip,
        take: limit,
        include: {
          sender: {
            select: {
              id: true,
              fullName: true,
              profileImage: true,
            },
          },
          readReceipts: {
            where: { userId: userIdToCheck },
          },
        },
      });
      // Reverse to show old → new
      const reversedMessages = messages.reverse();

      const messagesWithReadStatus = reversedMessages.map((message) => ({
        ...message, // keep all original fields
        // message: message.message, // overwrite the encrypted message with decrypted one
        message: message.message ? decryptText(message.message) : "",
        readStatus: message.readReceipts.length > 0 ? "read" : "unread",
      }));

      const unreadMessagesCount = messagesWithReadStatus.filter(
        (message) => message.readStatus === "unread",
      ).length;

      return res.status(StatusCodes.OK).json(
        new ApiResponse(
          StatusCodes.OK,
          {
            messages: messagesWithReadStatus,
            unreadMessagesCount,
            totalMessages,
            currentPage: page,
            hasMore: skip + limit < totalMessages,
          },
          "Messages fetched successfully",
        ),
      );
    } catch (err) {
      res.status(500).json({ message: "Error fetching messages", error: err });
    }
  },
);

const sendMessageToSingleConservation = asyncHandler(
  async (req: Request, res: Response) => {
    const { chatChannelId, message, type, senderId, isPhi, phiClientId } = req.body;
    const files = req.files as Express.Multer.File[]; // files from multer

    try {
      // Get the user ID from the provider ID
      const provider = await prisma.provider.findFirst({
        where: {
          OR: [
            { id: senderId },
            { userId: senderId }
          ]
        },
        select: { userId: true }
      });

      if (!provider) {
        return res.status(StatusCodes.NOT_FOUND).json({
          message: "Provider not found"
        });
      }

      const userIdToUse = provider.userId;

      const channel = await prisma.chatChannel.findUnique({
        where: { id: chatChannelId },
      });

      if (!channel) {
        return res.status(400).json({ message: "Chat channel does not exist" });
      }

      // Upload media files to S3
      let uploadedMediaUrls: string[] = [];
      if (files && files.length > 0) {
        const uploadPromises = files.map((file) => uploadToS3(file));
        uploadedMediaUrls = await Promise.all(uploadPromises);
      }

      // const encryptedMessage = message ? message : '';
      const encryptedMessage = message ? encryptText(message) : "";

      const chatMessage = await prisma.chatMessage.create({
        data: {
          senderId: userIdToUse,
          message: encryptedMessage || "",
          chatChannelId,
          mediaUrl: uploadedMediaUrls.join(","),
          type: type || "text",
          isPhi: isPhi === 'true' || isPhi === true,
          phiClientId: phiClientId || null,
          readReceipts: {
            create: {
              userId: userIdToUse,
            },
          },
        },
        include: {
          sender: {
            select: {
              id: true,
              fullName: true,
              profileImage: true,
            },
          },
        },
      });

      await prisma.chatChannel.update({
        where: { id: chatChannelId },
        data: {
          updatedAt: new Date().toISOString(),
          deletedByA: false,
          deletedByB: false,
        },
      });

      const plainMessage = {
        ...chatMessage,
        message: chatMessage.message ? decryptText(chatMessage.message) : "",
      };

      // Audit Log for Chat Message
      await AuditLogService.createLog({
        userId: userIdToUse,
        action: "SEND_MESSAGE",
        resource: "CHAT",
        resourceId: chatMessage.id,
        details: {
          chatChannelId,
          type: type || "text",
          messageTimestamp: chatMessage.createdAt.toISOString(), // HIPAA requirement: timestamp of individual chat
          hasMedia: files && files.length > 0,
          isPhi: chatMessage.isPhi,
          phiClientId: chatMessage.phiClientId
        }
      });

      return res
        .status(StatusCodes.OK)
        .json(
          new ApiResponse(
            StatusCodes.OK,
            { chatMessage: plainMessage },
            "Message sent successfully",
          ),
        );
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ message: "Error sending message", error: err });
    }
  },
);

const deleteMessageToSingleConservation = asyncHandler(
  async (req: Request, res: Response) => {
    const { channelId, messageId, loginUserId } = req.body;

    // Check if it's a 1-on-1 chat channel OR a group channel
    const isOneOnOneChannel = await prisma.chatChannel.findFirst({
      where: { id: channelId },
    });

    const isGroupChannel = !isOneOnOneChannel
      ? await prisma.groupChat.findFirst({ where: { id: channelId } })
      : null;

    if (!isOneOnOneChannel && !isGroupChannel) {
      return res
        .status(StatusCodes.CONFLICT)
        .json(
          new ApiResponse(
            StatusCodes.CONFLICT,
            { message: `This chat channel does not exist.` },
            "Channel Not Found",
          ),
        );
    }

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
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Provider not found"
      });
    }

    const userIdToCheck = provider.userId;

    // Build the message query based on channel type (1-on-1 vs group)
    const messageQuery: any = {
      id: messageId,
      senderId: userIdToCheck, // Ensure the message is sent by the login user
    };

    if (isOneOnOneChannel) {
      messageQuery.chatChannelId = channelId;
    } else {
      messageQuery.groupId = channelId;
    }

    // Ensure the message exists and belongs to the user
    const message = await prisma.chatMessage.findFirst({
      where: messageQuery,
    });

    if (!message) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json(
          new ApiResponse(
            StatusCodes.FORBIDDEN,
            { message: `You can only delete your own messages.` },
            "Message Not Found or Permission Denied",
          ),
        );
    }

    // Proceed to delete the message
    const deletedMessage = await prisma.chatMessage.delete({
      where: { id: messageId },
    });

    // Return success response
    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          { deletedMessage },
          "Message deleted successfully.",
        ),
      );
  },
);

const deleteChatChannelForUser = asyncHandler(
  async (req: Request, res: Response) => {
    const { channelId, loginUserId } = req.body;

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
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Provider not found"
      });
    }

    const userId = provider.userId;

    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId }
    });

    if (!channel) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Chat channel not found" });
    }

    if (channel.providerAId === userId) {
      await prisma.chatChannel.update({
        where: { id: channelId },
        data: { deletedByA: true }
      });
    } else if (channel.providerBId === userId) {
      await prisma.chatChannel.update({
        where: { id: channelId },
        data: { deletedByB: true }
      });
    } else {
      return res.status(StatusCodes.FORBIDDEN).json({ message: "You are not authorized to delete this chat" });
    }

    return res
      .status(StatusCodes.OK)
      .json(new ApiResponse(StatusCodes.OK, null, "Chat deleted for you successfully"));
  }
);

const getAllConversations = asyncHandler(
  async (req: Request, res: Response) => {
    const { loginUserId } = req.body;

    try {
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
          .status(404)
          .json({ message: "Provider not found" });
      }

      const userIdToUse = provider.userId;

      // Fetch all chat channels for the logged-in user that are not deleted by them
      const chatChannels = await prisma.chatChannel.findMany({
        where: {
          OR: [
            { providerAId: userIdToUse, deletedByA: false },
            { providerBId: userIdToUse, deletedByB: false }
          ],
        },
        select: {
          id: true,
          providerAId: true,
          providerBId: true,
        },
      });

      if (chatChannels.length === 0) {
        return res
          .status(404)
          .json({ message: "No chat channels found for this user" });
      }

      // For each channel, fetch the last message
      const chatChannelsWithLastMessage = await Promise.all(
        chatChannels.map(async (channel) => {
          // Fetch the last message in the channel
          const lastMessage = await prisma.chatMessage.findFirst({
            where: { chatChannelId: channel.id },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              message: true,
              createdAt: true,
            },
          });

          // return {
          //     ...channel,
          //     lastMessage: lastMessage
          //         ? {
          //             ...lastMessage,
          //             message: lastMessage.message
          //         }
          //         : null // Include the last message (if any)
          // };
          return {
            ...channel,
            lastMessage: lastMessage
              ? {
                ...lastMessage,
                message: lastMessage.message
                  ? decryptText(lastMessage.message)
                  : "",
              }
              : null,
          };
        }),
      );

      return res.status(StatusCodes.OK).json(
        new ApiResponse(
          StatusCodes.OK,
          {
            chatChannels: chatChannelsWithLastMessage,
          },
          "Chat channels fetched successfully",
        ),
      );
    } catch (err) {
      res
        .status(500)
        .json({ message: "Error fetching chat channels", error: err });
    }
  },
);

// POST /chat/read-messages
const markMessagesAsRead = asyncHandler(async (req: Request, res: Response) => {
  const { loginUserId, chatChannelId, groupId } = req.body;

  try {
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
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Provider not found"
      });
    }

    const userIdToUse = provider.userId;

    // Determine the filter based on chat type
    const messageFilter: any = {
      readReceipts: {
        none: {
          userId: userIdToUse,
        },
      },
      NOT: {
        senderId: userIdToUse,
      },
    };

    if (chatChannelId) {
      messageFilter.chatChannelId = chatChannelId;
    } else if (groupId) {
      messageFilter.groupId = groupId;
    } else {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Either chatChannelId or groupId must be provided.",
      });
    }

    // Get all unread messages
    const unreadMessages = await prisma.chatMessage.findMany({
      where: messageFilter,
      select: { id: true },
    });

    if (unreadMessages.length > 0) {
      if (chatChannelId) {
        // Mark them as read in ReadReceipt table
        await prisma.readReceipt.createMany({
          data: unreadMessages.map((msg) => ({
            messageId: msg.id,
            userId: userIdToUse,
          })),
          skipDuplicates: true,
        });
      } else if (groupId) {
        // Mark them as read in GroupReadReceipt table
        await prisma.groupReadReceipt.createMany({
          data: unreadMessages.map((msg) => ({
            messageId: msg.id,
            userId: userIdToUse,
          })),
          skipDuplicates: true,
        });
      }
    }

    return res
      .status(StatusCodes.OK)
      .json(new ApiResponse(StatusCodes.OK, null, "Messages marked as read"));
  } catch (error) {
    console.error("Error marking messages as read:", error);
    return res.status(500).json({ message: "Error marking messages as read" });
  }
});
const getAllPublicSingleConservationMessage = asyncHandler(
  async (req: Request, res: Response) => {
    const { chatChannelId, page = 1, limit = 10 } = req.body;

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
        return res.status(404).json({ message: "Chat channel not found" });
      }

      // if (
      //   ![chatChannel.providerAId, chatChannel.providerBId].includes(
      //     loginUserId,
      //   )
      // ) {
      //   return res
      //     .status(403)
      //     .json({ message: "You are not authorized to view this chat" });
      // }

      // Get total message count (optional, useful for frontend pagination)
      const totalMessages = await prisma.chatMessage.count({
        where: { chatChannelId },
      });

      // Get paginated messages
      const messages = await prisma.chatMessage.findMany({
        where: { chatChannelId },
        orderBy: { createdAt: "desc" }, // latest first
        skip,
        take: limit,
        include: {
          sender: {
            select: {
              id: true,
              fullName: true,
              profileImage: true,
            },
          },
          readReceipts: true,
        },
      });
      // Reverse to show old → new
      const reversedMessages = messages.reverse();

      const messagesWithReadStatus = reversedMessages.map((message) => ({
        ...message, // keep all original fields
        // message: message.message, // overwrite the encrypted message with decrypted one
        message: message.message ? decryptText(message.message) : "",
        readStatus: message.readReceipts.length > 0 ? "read" : "unread",
      }));

      const unreadMessagesCount = messagesWithReadStatus.filter(
        (message) => message.readStatus === "unread",
      ).length;

      return res.status(StatusCodes.OK).json(
        new ApiResponse(
          StatusCodes.OK,
          {
            messages: messagesWithReadStatus,
            unreadMessagesCount,
            totalMessages,
            currentPage: page,
            hasMore: skip + limit < totalMessages,
          },
          "Messages fetched successfully",
        ),
      );
    } catch (err) {
      res.status(500).json({ message: "Error fetching messages", error: err });
    }
  },
);

const shareChatByEmail = asyncHandler(async (req: Request, res: Response) => {
  const { chatChannelId, email, loginUserId } = req.body;

  if (!chatChannelId || !email || !loginUserId) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "chatChannelId, email, and loginUserId are required",
    });
  }

  try {
    const chatChannel = await prisma.chatChannel.findUnique({
      where: { id: chatChannelId },
    });

    if (!chatChannel) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Chat channel not found" });
    }

    const sender = await prisma.user.findUnique({
      where: { id: loginUserId },
      select: { fullName: true }
    });

    const frontendUrl = getFrontendUrl();
    const chatLink = `${frontendUrl}/invite-chat/individual/${chatChannelId}`;

    await sendShareChatEmail(
      email,
      sender?.fullName || "A user",
      chatLink,
      'individual'
    );

    return res.status(StatusCodes.OK).json(
      new ApiResponse(StatusCodes.OK, null, "Chat shared successfully via email")
    );
  } catch (error) {
    console.error("Error sharing chat:", error);
    return res.status(500).json({ message: "Error sharing chat", error });
  }
});

export {
  getAllSingleConservationMessage,
  sendMessageToSingleConservation,
  deleteMessageToSingleConservation,
  deleteChatChannelForUser,
  getAllConversations,
  getAllPublicSingleConservationMessage,
  markMessagesAsRead,
  shareChatByEmail,
};
