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
exports.markMessagesAsRead = exports.getAllConversations = exports.deleteMessageToSingleConservation = exports.sendMessageToSingleConservation = exports.getAllSingleConservationMessage = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const db_config_1 = __importDefault(require("../../db/db.config"));
const http_status_codes_1 = require("http-status-codes");
const apiResponse_1 = require("../../utils/apiResponse");
const chatMediaConfig_1 = require("../../utils/multer/chatMediaConfig");
const EncryptedMessage_1 = require("../../utils/encryptedMessage/EncryptedMessage");
const getAllSingleConservationMessage = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { chatChannelId, loginUserId, page = 1, limit = 10 } = req.body;
    const skip = (page - 1) * limit;
    try {
        const chatChannel = yield db_config_1.default.chatChannel.findUnique({
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
        const totalMessages = yield db_config_1.default.chatMessage.count({
            where: { chatChannelId }
        });
        // Get paginated messages
        const messages = yield db_config_1.default.chatMessage.findMany({
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
        // Reverse to show old → new
        const reversedMessages = messages.reverse();
        const messagesWithReadStatus = reversedMessages.map(message => (Object.assign(Object.assign({}, message), { 
            // message: message.message, // overwrite the encrypted message with decrypted one
            message: message.message ? (0, EncryptedMessage_1.decryptText)(message.message) : '', readStatus: message.readReceipts.length > 0 ? 'read' : 'unread' })));
        const unreadMessagesCount = messagesWithReadStatus.filter(message => message.readStatus === 'unread').length;
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, {
            messages: messagesWithReadStatus,
            unreadMessagesCount,
            totalMessages,
            currentPage: page,
            hasMore: skip + limit < totalMessages
        }, "Messages fetched successfully"));
    }
    catch (err) {
        res.status(500).json({ message: 'Error fetching messages', error: err });
    }
}));
exports.getAllSingleConservationMessage = getAllSingleConservationMessage;
const sendMessageToSingleConservation = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { chatChannelId, message, type, senderId } = req.body;
    const files = req.files; // files from multer
    try {
        const channel = yield db_config_1.default.chatChannel.findUnique({
            where: { id: chatChannelId },
        });
        if (!channel) {
            return res.status(400).json({ message: 'Chat channel does not exist' });
        }
        // Upload media files to S3
        let uploadedMediaUrls = [];
        if (files && files.length > 0) {
            const uploadPromises = files.map(file => (0, chatMediaConfig_1.uploadToS3)(file));
            uploadedMediaUrls = yield Promise.all(uploadPromises);
        }
        // const encryptedMessage = message ? message : '';
        const encryptedMessage = message ? (0, EncryptedMessage_1.encryptText)(message) : '';
        const chatMessage = yield db_config_1.default.chatMessage.create({
            data: {
                senderId,
                message: encryptedMessage || '',
                chatChannelId,
                mediaUrl: uploadedMediaUrls.join(','),
                type: type || 'text',
                readReceipts: {
                    create: {
                        providerId: senderId,
                    },
                },
            },
            include: {
                sender: {
                    include: {
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
        yield db_config_1.default.chatChannel.update({
            where: { id: chatChannelId },
            data: {
                updatedAt: new Date().toISOString(),
            },
        });
        const plainMessage = Object.assign(Object.assign({}, chatMessage), { message: chatMessage.message ? (0, EncryptedMessage_1.decryptText)(chatMessage.message) : '' });
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { chatMessage: plainMessage }, 'Message sent successfully'));
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error sending message', error: err });
    }
}));
exports.sendMessageToSingleConservation = sendMessageToSingleConservation;
const deleteMessageToSingleConservation = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { channelId, messageId, loginUserId } = req.body;
    // Ensure the channel exists
    const isChannelExist = yield db_config_1.default.chatChannel.findFirst({
        where: { id: channelId },
    });
    if (!isChannelExist) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { message: `This chat channe; does not exist.` }, "Channel Not Found"));
    }
    // Ensure the message exists and check if the message is sent by the logged-in user
    const message = yield db_config_1.default.chatMessage.findFirst({
        where: {
            id: messageId,
            chatChannelId: channelId, // Ensure the message belongs to the channel
            senderId: loginUserId, // Ensure the message is sent by the login user
        },
    });
    if (!message) {
        return res.status(http_status_codes_1.StatusCodes.FORBIDDEN).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.FORBIDDEN, { message: `You can only delete your own messages.` }, "Message Not Found or Permission Denied"));
    }
    // Proceed to delete the message
    const deletedMessage = yield db_config_1.default.chatMessage.delete({
        where: { id: messageId },
    });
    // Return success response
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { deletedMessage }, 'Message deleted successfully.'));
}));
exports.deleteMessageToSingleConservation = deleteMessageToSingleConservation;
const getAllConversations = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loginUserId } = req.body;
    try {
        // Fetch all chat channels for the logged-in user
        const chatChannels = yield db_config_1.default.chatChannel.findMany({
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
        const chatChannelsWithLastMessage = yield Promise.all(chatChannels.map((channel) => __awaiter(void 0, void 0, void 0, function* () {
            // Fetch the last message in the channel
            const lastMessage = yield db_config_1.default.chatMessage.findFirst({
                where: { chatChannelId: channel.id },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    message: true,
                    createdAt: true
                }
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
            return Object.assign(Object.assign({}, channel), { lastMessage: lastMessage
                    ? Object.assign(Object.assign({}, lastMessage), { message: lastMessage.message ? (0, EncryptedMessage_1.decryptText)(lastMessage.message) : '' }) : null });
        })));
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, {
            chatChannels: chatChannelsWithLastMessage
        }, "Chat channels fetched successfully"));
    }
    catch (err) {
        res.status(500).json({ message: 'Error fetching chat channels', error: err });
    }
}));
exports.getAllConversations = getAllConversations;
// POST /chat/read-messages
const markMessagesAsRead = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loginUserId, chatChannelId, groupId } = req.body;
    try {
        // Determine the filter based on chat type
        const messageFilter = {
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
        }
        else if (groupId) {
            messageFilter.groupId = groupId;
        }
        else {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                message: 'Either chatChannelId or groupId must be provided.'
            });
        }
        // Get all unread messages
        const unreadMessages = yield db_config_1.default.chatMessage.findMany({
            where: messageFilter,
            select: { id: true }
        });
        // Mark them as read
        yield db_config_1.default.readReceipt.createMany({
            data: unreadMessages.map(msg => ({
                messageId: msg.id,
                providerId: loginUserId
            })),
            skipDuplicates: true,
        });
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, null, 'Messages marked as read'));
    }
    catch (error) {
        console.error('Error marking messages as read:', error);
        return res.status(500).json({ message: 'Error marking messages as read' });
    }
}));
exports.markMessagesAsRead = markMessagesAsRead;
