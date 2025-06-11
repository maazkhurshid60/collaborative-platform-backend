import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";

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
    const { groupId, senderId, message, mediaUrl, type } = req.body;

    const chatMessage = await prisma.chatMessage.create({
        data: {
            sender: { connect: { id: senderId } },
            message,
            mediaUrl: mediaUrl || '',
            type: type || 'text',
            group: { connect: { id: groupId } },
        },
    });

    // Create read receipts for all group members (excluding the sender)
    const groupMembers = await prisma.groupChat.findUnique({
        where: { id: groupId },
        select: { members: { select: { id: true } } },
    });

    if (!groupMembers) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `Group members not found.` }, "Group Members Not Found"));
    }

    const readReceipts = groupMembers.members
        .filter(member => member.id !== senderId)
        .map(member => ({
            messageId: chatMessage.id,
            providerId: member.id,
        }));

    await prisma.groupReadReceipt.createMany({
        data: readReceipts,
    });

    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { chatMessage }, 'Message sent to the group.'));
});




const getGroupMessageApi = asyncHandler(async (req: Request, res: Response) => {
    const { groupId, loginUserId } = req.body;

    const isGroupExist = await prisma.groupChat.findFirst({ where: { id: groupId } });
    if (!isGroupExist) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, { message: `This group does not exist.` }, "Group Not Found"));
    }

    const groupMessages = await prisma.chatMessage.findMany({
        where: { groupId: groupId },
        include: {
            sender: { include: { user: true } },
            groupReadReceipts: {
                where: { providerId: loginUserId }, // Get read receipt for the logged-in user
            },
        },
    });

    const groupMessagesWithReadStatus = groupMessages.map(message => ({
        ...message,
        readStatus: message.groupReadReceipts.length > 0 ? 'read' : 'unread',
    }));

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { groupMessages: groupMessagesWithReadStatus }, 'Fetched group messages successfully')
    );
});



const getAllGroupsApi = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId } = req.body
    const allgroups = await prisma.groupChat.findMany({ where: { members: { some: { providerId: loginUserId } } }, include: { members: { include: { Provider: { include: { user: true } } } } } })

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { allgroups }, 'Fetched all groups.')
    );
})

const deleteGroupMessageApi = asyncHandler(async (req: Request, res: Response) => {
    const { groupId, messageId, loginUserId } = req.body;

    // Ensure the group exists
    const isGroupExist = await prisma.groupChat.findFirst({
        where: { id: groupId },
    });

    if (!isGroupExist) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { message: `This group does not exist.` }, "Group Not Found")
        );
    }

    // Ensure the message exists and check if the message is sent by the logged-in user
    const message = await prisma.chatMessage.findFirst({
        where: {
            id: messageId,
            groupId: groupId, // Ensure the message belongs to the group
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
});


export { createGroupApi, sendMessageToGroupApi, getGroupMessageApi, getAllGroupsApi, updateGroupApi, deleteGroupMessageApi }

