import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { uploadToS3 } from "../../utils/multer/chatMediaConfig";

const createGroupApi = asyncHandler(async (req: Request, res: Response) => {
    const { groupName, membersId } = req.body
    const isDuplicateGroupName = await prisma.groupChat.findFirst({ where: { name: groupName } })
    if (isDuplicateGroupName) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `${groupName} already exist.` }, "Duplicate Error."))
    }

    const membersRoleCheck = await prisma.provider.findMany({ where: { id: { in: membersId } } })
    if (membersRoleCheck.length !== membersId.length) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `Only providers can be added to groups.` }, "Duplicate Error."));
    }
    const group = await prisma.groupChat.create({
        data: {
            name: groupName,
            members: {
                create: membersId.map((id: string) => ({
                    Provider: { connect: { id } }
                }))
            }
        },
        include: {
            members: true
        }
    });

    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, { group }, 'New group has created.')
    );
})

const updateGroupApi = asyncHandler(async (req: Request, res: Response) => {
    const { groupName, membersId } = req.body;
    const { groupId } = req.body;

    // Check if the group exists
    const isGroupExist = await prisma.groupChat.findFirst({ where: { id: groupId } });
    if (!isGroupExist) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `Group does not exist.` }, "Duplicate Error."));
    }

    // Check if the group name already exists
    const isDuplicateGroupName = await prisma.groupChat.findFirst({ where: { name: groupName } });
    if (isDuplicateGroupName) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `${groupName} already exists.` }, "Duplicate Error."));
    }

    // Check if all members are valid providers
    const membersRoleCheck = await prisma.provider.findMany({ where: { id: { in: membersId } } });
    if (membersRoleCheck.length !== membersId.length) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `Only providers can be added to groups.` }, "Duplicate Error."));
    }

    // Get current members of the group
    const currentMembers = await prisma.groupChat.findUnique({
        where: { id: groupId },
        include: { members: { select: { id: true } } }
    });

    if (!currentMembers) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `Group does not exist.` }, "Group Error."));
    }

    // Find members to disconnect (those who are no longer in the new members list)
    const membersToDisconnect = currentMembers.members
        .filter(member => !membersId.includes(member.id))
        .map(member => ({ id: member.id }));

    // Update the group by disconnecting old members and connecting new ones
    const updateGroup = await prisma.groupChat.update({
        where: { id: groupId },
        data: {
            name: groupName,  // Update group name
            members: {
                disconnect: membersToDisconnect,  // Disconnect members not in the new list
                connect: membersId.map((id: string) => ({ id }))  // Connect the new members
            }
        },
        include: {
            members: true // Include the updated members list in the response
        }
    });

    if (updateGroup) {
        return res.status(StatusCodes.CREATED).json(
            new ApiResponse(StatusCodes.CREATED, { updateGroup }, 'Group has been updated.')
        );
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
        new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { message: "Something went wrong" }, 'Group update failed.')
    );
});



const sendMessageToGroupApi = asyncHandler(async (req: Request, res: Response) => {
    const { groupId, senderId, message, type } = req.body;
    const files = req.files as Express.Multer.File[];

    try {
        // Upload media files to S3
        let uploadedMediaUrls: string[] = [];
        if (files && files.length > 0) {
            const uploadPromises = files.map(file => uploadToS3(file));
            uploadedMediaUrls = await Promise.all(uploadPromises);
        }

        // Create the group chat message
        const chatMessage = await prisma.chatMessage.create({
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
        const groupMembers = await prisma.groupChat.findUnique({
            where: { id: groupId },
            select: { members: { select: { id: true } } },
        });

        if (!groupMembers) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { message: 'Group members not found.' }, 'Group Members Not Found')
            );
        }

        const readReceipts = groupMembers.members
            .filter(member => member.id !== senderId)
            .map(member => ({
                messageId: chatMessage.id,
                providerId: member.id,
            }));

        await prisma.groupReadReceipt.createMany({ data: readReceipts });

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { chatMessage }, 'Message sent to the group.')
        );
    } catch (err) {
        console.error(err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message: 'Error sending group message',
            error: err,
        });
    }
});




const getGroupMessageApi = asyncHandler(async (req: Request, res: Response) => {
    const { groupId, loginUserId, page = 1, limit = 10 } = req.body;

    const skip = (page - 1) * limit;

    // Check if group exists
    const isGroupExist = await prisma.groupChat.findFirst({ where: { id: groupId } });
    if (!isGroupExist) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { message: `This group does not exist.` }, "Group Not Found")
        );
    }

    // Get total messages count for the group (useful for frontend pagination)
    const totalMessages = await prisma.chatMessage.count({
        where: { groupId }
    });

    // Fetch paginated messages
    const groupMessages = await prisma.chatMessage.findMany({
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
    const groupMessagesWithReadStatus = reversedMessages.map(message => ({
        ...message,
        readStatus: message.groupReadReceipts.length > 0 ? 'read' : 'unread',
    }));

    const unreadMessagesCount = groupMessagesWithReadStatus.filter(msg => msg.readStatus === 'unread').length;

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            groupMessages: groupMessagesWithReadStatus,
            unreadMessagesCount,
            totalMessages,
            currentPage: page,
            hasMore: skip + limit < totalMessages,
        }, 'Fetched group messages successfully')
    );
});



const getAllGroupsApi = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId } = req.body;

    const allgroups = await prisma.groupChat.findMany({
        where: {
            members: {
                some: { providerId: loginUserId }
            }
        },
        include: {
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

    const enrichedGroups = await Promise.all(
        allgroups.map(async (group) => {
            const lastMessage = await prisma.chatMessage.findFirst({
                where: { groupId: group.id },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    message: true,
                    createdAt: true,
                    senderId: true
                }
            });

            const unreadCount = await prisma.chatMessage.count({
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

            return {
                ...group,
                lastMessage: lastMessage || null,
                unreadCount: unreadCount || 0
            };
        })
    );

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { allgroups: enrichedGroups }, 'Fetched all groups.')
    );
});



const deleteGroupChannel = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.body;

    if (!id) {
        return res
            .status(StatusCodes.BAD_REQUEST)
            .json(new ApiResponse(StatusCodes.BAD_REQUEST, null, "Channel ID is required"));
    }

    try {
        const isAllChatMessagesDeleted = await prisma.chatMessage.deleteMany({ where: { groupId: id } });
        const isChatDeleted = await prisma.groupChat.delete({ where: { id } });

        return res
            .status(StatusCodes.OK)
            .json(new ApiResponse(StatusCodes.OK, { channel: isChatDeleted }, "Conversation deleted successfully"));

    } catch (error) {
        return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json(new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error }, "Internal Server Error"));
    }
});


export { createGroupApi, sendMessageToGroupApi, getGroupMessageApi, getAllGroupsApi, updateGroupApi, deleteGroupChannel }

