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
exports.deleteGroupChannel = exports.updateGroupApi = exports.getAllGroupsApi = exports.getGroupMessageApi = exports.sendMessageToGroupApi = exports.createGroupApi = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const db_config_1 = __importDefault(require("../../db/db.config"));
const http_status_codes_1 = require("http-status-codes");
const apiResponse_1 = require("../../utils/apiResponse");
const chatMediaConfig_1 = require("../../utils/multer/chatMediaConfig");
const createGroupApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { groupName, membersId, createdBy } = req.body;
    const isDuplicateGroupName = yield db_config_1.default.groupChat.findFirst({ where: { name: groupName } });
    if (isDuplicateGroupName) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { message: `${groupName} already exist.` }, "Duplicate Error."));
    }
    const membersRoleCheck = yield db_config_1.default.provider.findMany({ where: { id: { in: membersId } } });
    if (membersRoleCheck.length !== membersId.length) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { message: `Only providers can be added to groups.` }, "Duplicate Error."));
    }
    const group = yield db_config_1.default.groupChat.create({
        data: {
            name: groupName,
            providerId: createdBy,
            members: {
                create: membersId.map((id) => ({
                    Provider: { connect: { id } }
                }))
            }
        },
        include: {
            members: true
        }
    });
    return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, { group }, 'New group has created.'));
}));
exports.createGroupApi = createGroupApi;
const updateGroupApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { groupName, membersId } = req.body;
    const { groupId } = req.body;
    // Check if the group exists
    const isGroupExist = yield db_config_1.default.groupChat.findFirst({ where: { id: groupId } });
    if (!isGroupExist) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { message: `Group does not exist.` }, "Duplicate Error."));
    }
    // Check if the group name already exists
    const isDuplicateGroupName = yield db_config_1.default.groupChat.findFirst({ where: { name: groupName } });
    if (isDuplicateGroupName) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { message: `${groupName} already exists.` }, "Duplicate Error."));
    }
    // Check if all members are valid providers
    const membersRoleCheck = yield db_config_1.default.provider.findMany({ where: { id: { in: membersId } } });
    if (membersRoleCheck.length !== membersId.length) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { message: `Only providers can be added to groups.` }, "Duplicate Error."));
    }
    // Get current members of the group
    const currentMembers = yield db_config_1.default.groupChat.findUnique({
        where: { id: groupId },
        include: { members: { select: { id: true } } }
    });
    if (!currentMembers) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { message: `Group does not exist.` }, "Group Error."));
    }
    // Find members to disconnect (those who are no longer in the new members list)
    const membersToDisconnect = currentMembers.members
        .filter(member => !membersId.includes(member.id))
        .map(member => ({ id: member.id }));
    // Update the group by disconnecting old members and connecting new ones
    const updateGroup = yield db_config_1.default.groupChat.update({
        where: { id: groupId },
        data: {
            name: groupName, // Update group name
            members: {
                disconnect: membersToDisconnect, // Disconnect members not in the new list
                connect: membersId.map((id) => ({ id })) // Connect the new members
            }
        },
        include: {
            members: true // Include the updated members list in the response
        }
    });
    if (updateGroup) {
        return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, { updateGroup }, 'Group has been updated.'));
    }
    return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { message: "Something went wrong" }, 'Group update failed.'));
}));
exports.updateGroupApi = updateGroupApi;
const sendMessageToGroupApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { groupId, senderId, message, type } = req.body;
    const files = req.files;
    try {
        // Upload media files to S3
        let uploadedMediaUrls = [];
        if (files && files.length > 0) {
            const uploadPromises = files.map(file => (0, chatMediaConfig_1.uploadToS3)(file));
            uploadedMediaUrls = yield Promise.all(uploadPromises);
        }
        // Create the group chat message
        const chatMessage = yield db_config_1.default.chatMessage.create({
            data: {
                sender: { connect: { id: senderId } },
                message: message || '',
                mediaUrl: uploadedMediaUrls.join(','),
                type: type || 'text',
                group: { connect: { id: groupId } },
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
        // Create read receipts for all group members except the sender
        const groupMembers = yield db_config_1.default.groupChat.findUnique({
            where: { id: groupId },
            select: { members: { select: { id: true } } },
        });
        if (!groupMembers) {
            return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { message: 'Group members not found.' }, 'Group Members Not Found'));
        }
        const readReceipts = groupMembers.members
            .filter(member => member.id !== senderId)
            .map(member => ({
            messageId: chatMessage.id,
            providerId: member.id,
        }));
        yield db_config_1.default.groupReadReceipt.createMany({ data: readReceipts });
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { chatMessage }, 'Message sent to the group.'));
    }
    catch (err) {
        console.error(err);
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json({
            message: 'Error sending group message',
            error: err,
        });
    }
}));
exports.sendMessageToGroupApi = sendMessageToGroupApi;
const getGroupMessageApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { groupId, loginUserId, page = 1, limit = 10 } = req.body;
    const skip = (page - 1) * limit;
    // Check if group exists
    const isGroupExist = yield db_config_1.default.groupChat.findFirst({ where: { id: groupId } });
    if (!isGroupExist) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { message: `This group does not exist.` }, "Group Not Found"));
    }
    // Get total messages count for the group (useful for frontend pagination)
    const totalMessages = yield db_config_1.default.chatMessage.count({
        where: { groupId }
    });
    // Fetch paginated messages
    const groupMessages = yield db_config_1.default.chatMessage.findMany({
        where: { groupId },
        orderBy: { createdAt: 'desc' }, // latest messages first
        skip,
        take: limit,
        include: {
            sender: { include: { user: true } },
            groupReadReceipts: {
                where: { providerId: loginUserId }, // For current user's read status
            },
        },
    });
    // Reverse to display old → new
    const reversedMessages = groupMessages.reverse();
    // Add readStatus field
    const groupMessagesWithReadStatus = reversedMessages.map(message => (Object.assign(Object.assign({}, message), { readStatus: message.groupReadReceipts.length > 0 ? 'read' : 'unread' })));
    const unreadMessagesCount = groupMessagesWithReadStatus.filter(msg => msg.readStatus === 'unread').length;
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, {
        groupMessages: groupMessagesWithReadStatus,
        unreadMessagesCount,
        totalMessages,
        currentPage: page,
        hasMore: skip + limit < totalMessages,
    }, 'Fetched group messages successfully'));
}));
exports.getGroupMessageApi = getGroupMessageApi;
const getAllGroupsApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loginUserId } = req.body;
    const allgroups = yield db_config_1.default.groupChat.findMany({
        where: {
            members: {
                some: { providerId: loginUserId }
            }
        },
        include: {
            provider: { include: { user: true } },
            members: {
                include: {
                    Provider: {
                        include: {
                            user: true
                        }
                    }
                }
            }
        }
    });
    const enrichedGroups = yield Promise.all(allgroups.map((group) => __awaiter(void 0, void 0, void 0, function* () {
        const lastMessage = yield db_config_1.default.chatMessage.findFirst({
            where: { groupId: group.id },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                message: true,
                createdAt: true,
                senderId: true
            }
        });
        const unreadCount = yield db_config_1.default.chatMessage.count({
            where: {
                groupId: group.id,
                senderId: { not: loginUserId },
                readReceipts: {
                    none: {
                        providerId: loginUserId
                    }
                }
            }
        });
        return Object.assign(Object.assign({}, group), { lastMessage: lastMessage || null, unreadCount: unreadCount || 0 });
    })));
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { allgroups: enrichedGroups }, 'Fetched all groups.'));
}));
exports.getAllGroupsApi = getAllGroupsApi;
const deleteGroupChannel = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id, createdBy, } = req.body;
    if (!id) {
        return res
            .status(http_status_codes_1.StatusCodes.BAD_REQUEST)
            .json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, null, "Channel ID is required"));
    }
    if (!createdBy) {
        return res
            .status(http_status_codes_1.StatusCodes.BAD_REQUEST)
            .json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, null, "Provider ID is required"));
    }
    try {
        const group = yield db_config_1.default.groupChat.findUnique({ where: { id } });
        if ((group === null || group === void 0 ? void 0 : group.providerId) !== createdBy) {
            return res
                .status(http_status_codes_1.StatusCodes.UNAUTHORIZED)
                .json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.UNAUTHORIZED, null, "You are not allowed to delete this group"));
        }
        yield db_config_1.default.chatMessage.deleteMany({ where: { groupId: id } });
        const deletedGroup = yield db_config_1.default.groupChat.delete({ where: { id } });
        return res
            .status(http_status_codes_1.StatusCodes.OK)
            .json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { channel: deletedGroup }, "Conversation deleted successfully"));
    }
    catch (error) {
        return res
            .status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR)
            .json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error }, "Internal Server Error"));
    }
}));
exports.deleteGroupChannel = deleteGroupChannel;
