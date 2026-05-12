import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { uploadToS3 } from "../../utils/multer/chatMediaConfig";
import { decryptText, encryptText } from "../../utils/encryptedMessage/EncryptedMessage";
import { sendShareChatEmail } from "../../utils/nodeMailer/ShareChatEmail";
import { sendProviderSignupInviteEmail } from "../../utils/nodeMailer/InviteProviderSignupEmail";
import crypto from "crypto";
import { AuditLogService } from "../../services/AuditLogService";


const createGroupApi = asyncHandler(async (req: Request, res: Response) => {
    const { groupName, membersId, createdBy } = req.body
    const isDuplicateGroupName = await prisma.groupChat.findFirst({ where: { name: groupName } })
    if (isDuplicateGroupName) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(
                StatusCodes.CONFLICT,
                null,
                `A group with the name "${groupName}" already exists. Please try a different one.`
            )
        );
    }


    const membersRoleCheck = await prisma.provider.findMany({
        where: { id: { in: membersId } },
        select: { userId: true }
    });

    if (membersRoleCheck.length !== membersId.length) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `Only providers can be added to groups.` }, "Duplicate Error."));
    }
    const group = await prisma.groupChat.create({
        data: {
            name: groupName,
            providerId: createdBy,
            members: {
                create: membersRoleCheck.map((member) => ({
                    user: { connect: { id: member.userId } }
                }))
            }
        },
        include: {
            members: true
        }
    });

    // Audit Log for Group Creation
    await AuditLogService.createLog({
        userId: createdBy,
        action: "CREATE_GROUP",
        resource: "CHAT_GROUP",
        resourceId: group.id,
        details: { groupName: group.name, initialMemberCount: membersId.length }
    });

    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, { group }, 'New group has been created.')
    );
})

// const updateGroupApi = asyncHandler(async (req: Request, res: Response) => {
//     const { groupName, membersId } = req.body;
//     const { groupId } = req.body;

//     // Check if the group exists
//     const isGroupExist = await prisma.groupChat.findFirst({ where: { id: groupId } });
//     if (!isGroupExist) {
//         return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `Group does not exist.` }, "Duplicate Error."));
//     }

//     // Check if the group name already exists
//     const isDuplicateGroupName = await prisma.groupChat.findFirst({ where: { name: groupName } });
//     if (isDuplicateGroupName) {
//         return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `${groupName} already exists.` }, "Duplicate Error."));
//     }

//     // Check if all members are valid providers
//     const membersRoleCheck = await prisma.provider.findMany({ where: { id: { in: membersId } } });
//     if (membersRoleCheck.length !== membersId.length) {
//         return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `Only providers can be added to groups.` }, "Duplicate Error."));
//     }

//     // Get current members of the group
//     const currentMembers = await prisma.groupChat.findUnique({
//         where: { id: groupId },
//         include: { members: { select: { id: true } } }
//     });

//     if (!currentMembers) {
//         return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `Group does not exist.` }, "Group Error."));
//     }

//     // Find members to disconnect (those who are no longer in the new members list)
//     const membersToDisconnect = currentMembers.members
//         .filter(member => !membersId.includes(member.id))
//         .map(member => ({ id: member.id }));

//     // Update the group by disconnecting old members and connecting new ones
//     const updateGroup = await prisma.groupChat.update({
//         where: { id: groupId },
//         data: {
//             name: groupName,  // Update group name
//             members: {
//                 disconnect: membersToDisconnect,  // Disconnect members not in the new list
//                 connect: membersId.map((id: string) => ({ id }))  // Connect the new members
//             }
//         },
//         include: {
//             members: true // Include the updated members list in the response
//         }
//     });

//     if (updateGroup) {
//         return res.status(StatusCodes.CREATED).json(
//             new ApiResponse(StatusCodes.CREATED, { updateGroup }, 'Group has been updated.')
//         );
//     }

//     return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
//         new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { message: "Something went wrong" }, 'Group update failed.')
//     );
// });



const updateGroupApi = asyncHandler(async (req: Request, res: Response) => {
    const { groupId, memberEmail } = req.body;

    // Check if the group exists
    const isGroupExist = await prisma.groupChat.findFirst({ where: { id: groupId } });
    if (!isGroupExist) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `Group does not exist.` }, "Duplicate Error."));
    }

    // Find member by email and get their ID
    const member = await prisma.provider.findFirst({ where: { user: { email: memberEmail } } });


    if (!member) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { message: `Member not found with email: ${memberEmail}. Please create an account. Once verified, you can join the group using this link.` }, "Member Error."));
    }

    const memberId = member.userId; // Get member's User ID

    // Get current members of the group
    const currentMembers = await prisma.groupChat.findUnique({
        where: { id: groupId },
        include: { members: { select: { id: true, userId: true } } } // Include both id and userId from GroupMembers
    });

    if (!currentMembers) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `Group does not exist.` }, "Group Error."));
    }

    // Check if the member is already in the group
    const isMemberAlreadyInGroup = currentMembers.members.some(existingMember => existingMember.userId === memberId);

    if (isMemberAlreadyInGroup) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(
                StatusCodes.CONFLICT,
                null,
                `The member is already a part of this group chat.`
            )
        );
    }

    // Create a new GroupMembers entry for the member
    const createGroupMember = await prisma.groupMembers.create({
        data: {
            userId: memberId,
            groupChatId: groupId
        }
    });

    // Now connect the new GroupMembers record to the group
    const updateGroup = await prisma.groupChat.update({
        where: { id: groupId },
        data: {
            members: {
                connect: [{ id: createGroupMember.id }] // Connect the new GroupMember by its id
            }
        },
        include: {
            members: true // Include the updated members list in the response
        }
    });

    if (updateGroup) {
        return res.status(StatusCodes.CREATED).json(
            new ApiResponse(StatusCodes.CREATED, { updateGroup }, 'You have joined the group. Please log in yourself and go to the chat for more information.')
        );
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
        new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { message: "Something went wrong" }, 'Group joining failed.')
    );
});


/**
 * Add one or more on-platform providers to an existing group chat without
 * the email-invite round-trip. Used by the "Add Member" affordance in the
 * chat header.
 *
 * Body: { groupId: string, providerIds: string[] }   (Provider record ids, not user ids)
 *
 * Authorization: the caller must already be a member of the group. We
 * silently skip providers who are already in the group (rather than failing
 * the whole batch) so the UI can add multiple at once without flickering.
 */
const addExistingProvidersToGroupApi = asyncHandler(async (req: Request, res: Response) => {
    const { groupId, providerIds } = req.body as { groupId?: string; providerIds?: string[] };
    const callerUserId = (req as any).user?.id as string | undefined;

    if (!groupId || !Array.isArray(providerIds) || providerIds.length === 0) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, null, "groupId and providerIds[] are required")
        );
    }

    // 1. Group must exist + load current members so we can dedupe.
    //    Also pull the creator's userId so we can enforce the
    //    "only-creator-can-invite" restriction below.
    const group = await prisma.groupChat.findUnique({
        where: { id: groupId },
        include: {
            members: { select: { userId: true } },
            provider: { select: { userId: true } }
        }
    });
    if (!group) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, null, "Group not found")
        );
    }

    // 2. Caller must be a member of the group.
    if (!callerUserId || !group.members.some(m => m.userId === callerUserId)) {
        return res.status(StatusCodes.FORBIDDEN).json(
            new ApiResponse(StatusCodes.FORBIDDEN, null, "Only group members can add others to this group")
        );
    }

    // 2b. If the creator has locked the group with `membersCanInvite=false`,
    //     only the creator themselves can add members. Source-of-truth
    //     enforcement so a stale/tampered frontend can't bypass the rule.
    const creatorUserId = group.provider?.userId;
    const isCreator = !!creatorUserId && creatorUserId === callerUserId;
    if (!group.membersCanInvite && !isCreator) {
        return res.status(StatusCodes.FORBIDDEN).json(
            new ApiResponse(
                StatusCodes.FORBIDDEN,
                null,
                "Only the group admin can add members to this group"
            )
        );
    }

    // 3. Resolve Provider records → userIds. Reject the request if any id
    //    doesn't map to a real provider so the frontend gets a clear signal.
    const providers = await prisma.provider.findMany({
        where: { id: { in: providerIds } },
        select: { id: true, userId: true, user: { select: { fullName: true } } }
    });
    if (providers.length !== providerIds.length) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, null, "One or more providers are invalid")
        );
    }

    // 4. Skip providers who are already in the group.
    const existingUserIds = new Set(group.members.map(m => m.userId));
    const toAdd = providers.filter(p => !existingUserIds.has(p.userId));

    if (toAdd.length === 0) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, null, "All selected providers are already in this group")
        );
    }

    // 5. Insert the new GroupMembers rows atomically.
    await prisma.$transaction(
        toAdd.map(p =>
            prisma.groupMembers.create({
                data: { userId: p.userId, groupChatId: groupId }
            })
        )
    );

    // Audit Log for Adding Members to Group
    await AuditLogService.createLog({
        userId: callerUserId!,
        action: "ADD_GROUP_MEMBERS",
        resource: "CHAT_GROUP",
        resourceId: groupId,
        details: { addedMemberCount: toAdd.length, addedMemberNames: toAdd.map(p => p.user?.fullName) }
    });

    const addedNames = toAdd.map(p => p.user?.fullName).filter(Boolean);
    const skippedCount = providerIds.length - toAdd.length;

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            addedCount: toAdd.length,
            skippedCount,
            addedNames,
            groupId,
        }, `Added ${toAdd.length} member${toAdd.length === 1 ? "" : "s"} to the group`)
    );
});

/**
 * Update group permissions. Currently the only permission is `membersCanInvite`,
 * a toggle that lets the group creator restrict who can invite/add members.
 *
 * Body: { groupId: string, membersCanInvite: boolean }
 *
 * Authorization: only the group creator (group.provider.userId === caller)
 * may flip this. Other members get 403 — even regular members of the group.
 */
const updateGroupPermissionsApi = asyncHandler(async (req: Request, res: Response) => {
    const { groupId, membersCanInvite } = req.body as { groupId?: string; membersCanInvite?: boolean };
    const callerUserId = (req as any).user?.id as string | undefined;

    if (!groupId || typeof membersCanInvite !== "boolean") {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, null, "groupId and membersCanInvite (boolean) are required")
        );
    }

    const group = await prisma.groupChat.findUnique({
        where: { id: groupId },
        include: { provider: { select: { userId: true } } }
    });
    if (!group) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, null, "Group not found")
        );
    }

    // Only the creator can change group permissions.
    if (!callerUserId || group.provider?.userId !== callerUserId) {
        return res.status(StatusCodes.FORBIDDEN).json(
            new ApiResponse(StatusCodes.FORBIDDEN, null, "Only the group admin can change permissions")
        );
    }

    const updated = await prisma.groupChat.update({
        where: { id: groupId },
        data: { membersCanInvite },
        select: { id: true, membersCanInvite: true }
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, updated, "Group permissions updated")
    );
});

const sendMessageToGroupApi = asyncHandler(async (req: Request, res: Response) => {
    const { groupId, senderId, message, type, isPhi, phiClientId } = req.body;
    const files = req.files as Express.Multer.File[];

    try {
        // Get the user ID from the provider ID (handling case where provider ID might be passed instead of user ID)
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
                message: "Sender provider not found"
            });
        }

        const userIdToUse = provider.userId;

        // Upload media files to S3
        let uploadedMediaUrls: string[] = [];
        if (files && files.length > 0) {
            const uploadPromises = files.map(file => uploadToS3(file));
            uploadedMediaUrls = await Promise.all(uploadPromises);
        }
        // Encrypt message
        const encryptedMessage = message ? encryptText(message) : '';
        // Create the group chat message
        const chatMessage = await prisma.chatMessage.create({
            data: {
                senderId: userIdToUse,
                message: encryptedMessage,
                mediaUrl: uploadedMediaUrls.join(','),
                type: type || 'text',
                isPhi: isPhi === 'true' || isPhi === true,
                phiClientId: phiClientId || null,
                groupId: groupId,
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


        // Create read receipts for all group members except the sender
        const groupMembers = await prisma.groupChat.findUnique({
            where: { id: groupId },
            select: { members: { select: { userId: true } } },
        });

        if (!groupMembers) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { message: 'Group members not found.' }, 'Group Members Not Found')
            );
        }

        const readReceipts = groupMembers.members
            .filter(member => member.userId !== userIdToUse)
            .map(member => ({
                messageId: chatMessage.id,
                userId: member.userId,
            }));

        await prisma.groupReadReceipt.createMany({ data: readReceipts });

        const plainMessage = {
            ...chatMessage,
            message: chatMessage.message ? decryptText(chatMessage.message) : ''
        };

        // Audit Log for Group Chat Message
        await AuditLogService.createLog({
            userId: userIdToUse,
            action: "SEND_GROUP_MESSAGE",
            resource: "CHAT_GROUP",
            resourceId: chatMessage.id,
            details: {
                groupId,
                type: type || 'text',
                messageTimestamp: chatMessage.createdAt.toISOString(),
                hasMedia: files && files.length > 0,
                isPhi: chatMessage.isPhi,
                phiClientId: chatMessage.phiClientId
            }
        });

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { chatMessage: plainMessage }, 'Message sent to the group.')
        );
    } catch (err) {
        console.error(err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message: 'Error sending group message',
            error: err,
        });
    }
});

// const getGroupMessageApi = asyncHandler(async (req: Request, res: Response) => {
//     const { groupId, loginUserId, page = 1, limit = 10 } = req.body;

//     const skip = (page - 1) * limit;

//     // Check if group exists
//     const isGroupExist = await prisma.groupChat.findFirst({ where: { id: groupId } });
//     if (!isGroupExist) {
//         return res.status(StatusCodes.CONFLICT).json(
//             new ApiResponse(StatusCodes.CONFLICT, { message: `This group does not exist.` }, "Group Not Found")
//         );
//     }

//     // Get total messages count for the group (useful for frontend pagination)
//     const totalMessages = await prisma.chatMessage.count({
//         where: { groupId }
//     });

//     // Fetch paginated messages
//     const groupMessages = await prisma.chatMessage.findMany({
//         where: { groupId },
//         orderBy: { createdAt: 'desc' }, // latest messages first
//         skip,
//         take: limit,
//         include: {
//             sender: { include: { user: true } },
//             groupReadReceipts: {
//                 where: { providerId: loginUserId }, // For current user's read status
//             },
//         },
//     });

//     // Reverse to display old → new
//     const reversedMessages = groupMessages.reverse();

//     // Add readStatus field
//     // const groupMessagesWithReadStatus = reversedMessages.map(message => ({
//     //     ...message,
//     //     readStatus: message.groupReadReceipts.length > 0 ? 'read' : 'unread',
//     // }));
//     const groupMessagesWithReadStatus = reversedMessages.map(message => ({
//         ...message,
//         message: message.message ? decryptText(message.message) : '',
//         readStatus: message.groupReadReceipts.length > 0 ? 'read' : 'unread',
//     }));

//     const unreadMessagesCount = groupMessagesWithReadStatus.filter(msg => msg.readStatus === 'unread').length;

//     return res.status(StatusCodes.OK).json(
//         new ApiResponse(StatusCodes.OK, {
//             groupMessages: groupMessagesWithReadStatus,
//             unreadMessagesCount,
//             totalMessages,
//             currentPage: page,
//             hasMore: skip + limit < totalMessages,
//         }, 'Fetched group messages successfully')
//     );
// });
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
        // OPTIMIZATION: Only select necessary fields
        include: {
            sender: {
                select: {
                    fullName: true,
                    profileImage: true
                }
            },
            // If the frontend doesn't use the per-message read status effectively, 
            // you might even be able to remove this include, but keeping it for logic is fine.
            groupReadReceipts: {
                where: { userId: loginUserId },
            },
        },
    });

    // Reverse to display old → new
    const reversedMessages = groupMessages.reverse();

    const groupMessagesWithReadStatus = reversedMessages.map(message => ({
        ...message,
        message: message.message ? decryptText(message.message) : '',
        readStatus: message.groupReadReceipts.length > 0 ? 'read' : 'unread',
        // Optional: Remove groupReadReceipts from the final response if not used directly
        groupReadReceipts: undefined
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
const getPublicGroupMessageApi = asyncHandler(async (req: Request, res: Response) => {
    const { groupId, page = 1, limit = 10 } = req.body;

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
            sender: true,
            groupReadReceipts: true
        },
    });

    // Reverse to display old → new
    const reversedMessages = groupMessages.reverse();

    // Add readStatus field
    // const groupMessagesWithReadStatus = reversedMessages.map(message => ({
    //     ...message,
    //     readStatus: message.groupReadReceipts.length > 0 ? 'read' : 'unread',
    // }));
    const groupMessagesWithReadStatus = reversedMessages.map(message => ({
        ...message,
        message: message.message ? decryptText(message.message) : '',
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
                some: { userId: loginUserId }
            }
        },
        include: {
            provider: {
                select: {
                    id: true,
                    user: {
                        select: {
                            fullName: true
                        }
                    }
                }
            },
            members: {
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            fullName: true,
                            profileImage: true,
                            provider: {
                                select: {
                                    id: true
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    // Resolve userId if loginUserId is a Provider ID
    const provider = await prisma.provider.findFirst({
        where: {
            OR: [
                { id: loginUserId },
                { userId: loginUserId }
            ]
        },
        select: { userId: true }
    });

    const userIdToSearch = provider ? provider.userId : loginUserId;

    const enrichedGroups = await Promise.all(
        allgroups.map(async (group) => {
            const lastMessage = await prisma.chatMessage.findFirst({
                where: { groupId: group.id },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    message: true,
                    createdAt: true,
                    senderId: true,
                    type: true,
                    mediaUrl: true
                }
            });

            const unreadCount = await prisma.chatMessage.count({
                where: {
                    groupId: group.id,
                    senderId: { not: userIdToSearch },
                    groupReadReceipts: {
                        none: {
                            userId: userIdToSearch
                        }
                    }
                }
            });

            // return {
            //     ...group,
            //     lastMessage: lastMessage || null,
            //     unreadCount: unreadCount || 0
            // };

            return {
                ...group,
                lastMessage: lastMessage
                    ? {
                        ...lastMessage,
                        message: lastMessage.message ? decryptText(lastMessage.message) : '',
                    }
                    : null,
                unreadCount: unreadCount || 0,
            };

        })
    );

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { allgroups: enrichedGroups }, 'Fetched all groups.')
    );
});

const deleteGroupChannel = asyncHandler(async (req: Request, res: Response) => {
    const { id, createdBy, } = req.body;

    if (!id) {
        return res
            .status(StatusCodes.BAD_REQUEST)
            .json(new ApiResponse(StatusCodes.BAD_REQUEST, null, "Channel ID is required"));
    }

    if (!createdBy) {
        return res
            .status(StatusCodes.BAD_REQUEST)
            .json(new ApiResponse(StatusCodes.BAD_REQUEST, null, "Provider ID is required"));
    }

    try {
        const group = await prisma.groupChat.findUnique({ where: { id } });
        if (group?.providerId !== createdBy) {
            return res
                .status(StatusCodes.UNAUTHORIZED)
                .json(new ApiResponse(StatusCodes.UNAUTHORIZED, null, "You are not allowed to delete this group"));
        }

        await prisma.chatMessage.deleteMany({ where: { groupId: id } });


        const deletedGroup = await prisma.groupChat.delete({ where: { id } });

        return res
            .status(StatusCodes.OK)
            .json(new ApiResponse(StatusCodes.OK, { channel: deletedGroup }, "Conversation deleted successfully"));

    } catch (error) {
        return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json(new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error }, "Internal Server Error"));
    }
});


const shareGroupChatByEmail = asyncHandler(async (req: Request, res: Response) => {
    const { groupId, email, loginUserId } = req.body;

    if (!groupId || !email || !loginUserId) {
        return res.status(StatusCodes.BAD_REQUEST).json({
            message: "groupId, email, and loginUserId are required",
        });
    }

    try {
        const group = await prisma.groupChat.findUnique({
            where: { id: groupId },
            include: {
                members: { select: { userId: true } },
                provider: { select: { userId: true } }
            }
        });

        if (!group) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: "Group chat not found" });
        }

        const sender = await prisma.user.findUnique({
            where: { id: loginUserId },
            include: { provider: true } // Need provider ID to set as invitedBy
        });

        if (!sender) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: "Sender not found" });
        }

        // Same gate as the direct-add endpoint: when the creator has locked
        // the group, only they can send invites (email or otherwise).
        const creatorUserId = group.provider?.userId;
        const isSenderCreator = !!creatorUserId && creatorUserId === loginUserId;
        if (!group.membersCanInvite && !isSenderCreator) {
            return res.status(StatusCodes.FORBIDDEN).json({
                message: "Only the group admin can invite members to this group"
            });
        }

        // 1. Check if the email belongs to an existing user
        const existingUser = await prisma.user.findFirst({
            where: { email: email.toLowerCase() },
            include: { provider: true, client: true, superAdmin: true }
        });

        if (existingUser) {
            // Check if already in group
            const isAlreadyMember = group.members.some(member => member.userId === existingUser.id);
            if (isAlreadyMember) {
                return res.status(StatusCodes.CONFLICT).json(
                    new ApiResponse(StatusCodes.CONFLICT, null, "User is already a member of this group chat.")
                );
            }

            // User exists but is not in the group. Add them.
            const createGroupMember = await prisma.groupMembers.create({
                data: {
                    userId: existingUser.id,
                    groupChatId: groupId
                }
            });

            await prisma.groupChat.update({
                where: { id: groupId },
                data: {
                    members: { connect: [{ id: createGroupMember.id }] }
                }
            });

            return res.status(StatusCodes.OK).json(
                new ApiResponse(StatusCodes.OK, null, "User added successfully")
            );
        }

        // 2. User completely new, create invitation
        // First check if a pending invitation already exists for this email
        const existingInvite = await prisma.invitation.findFirst({
            where: { email: email.toLowerCase(), status: 'PENDING' }
        });

        let token: string;
        let invitedById = sender.provider?.id;

        // Ensure inviter is a provider, otherwise try to find first provider to act as inviter
        if (!invitedById) {
            const anyProvider = await prisma.provider.findFirst();
            if (anyProvider) invitedById = anyProvider.id;
        }

        if (existingInvite) {
            // Just update the groupId on the existing invite to make sure they join the group on signup
            token = existingInvite.token;
            await prisma.invitation.update({
                where: { id: existingInvite.id },
                data: { groupId }
            });
        } else {
            // Create a new invitation 
            if (!invitedById) {
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
                    new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, null, "Cannot create invitation: no provider found to act as inviter.")
                );
            }
            token = crypto.randomBytes(32).toString("hex");
            await prisma.invitation.create({
                data: {
                    token,
                    email: email.toLowerCase(),
                    invitedById,
                    groupId
                }
            });
        }

        // Send the standard provider signup invite email
        await sendProviderSignupInviteEmail(
            email.toLowerCase(),
            sender.fullName || "A Kolabme User",
            token
        );

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, null, "Invitation email sent successfully. They will join the group upon signing up.")
        );
    } catch (error) {
        console.error("Error sharing group chat:", error);
        return res.status(500).json({ message: "Error sharing group chat", error });
    }
});

export { createGroupApi, getPublicGroupMessageApi, sendMessageToGroupApi, getGroupMessageApi, getAllGroupsApi, updateGroupApi, deleteGroupChannel, shareGroupChatByEmail, addExistingProvidersToGroupApi, updateGroupPermissionsApi }

