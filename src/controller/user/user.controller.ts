import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import prisma from "../../db/db.config";
import { Role, Approve } from "../../generated/prisma/enums";
import { sendApprovalEmail } from "../../utils/nodeMailer/sendApprovalEmail";
import { UserService } from "../../services/UserService";
import { AuditLogService } from "../../services/AuditLogService";

const userService = new UserService();

const blockUserApi = asyncHandler(async (req: Request, res: Response) => {
  const { blockUserid } = req.body;
  const loginUserIdFromToken = (req as any).user.id;

  // 1. Check if block user exists
  const isBlockUserExist = await prisma.user.findUnique({
    where: { id: blockUserid },
  });
  if (!isBlockUserExist) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "User to be blocked not found" },
          "Validation failed",
        ),
      );
  }

  // 2. Get login user (who wants to block someone)
  const loginUser = await prisma.user.findUnique({
    where: { id: loginUserIdFromToken },
  });
  if (!loginUser) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "Blocking user not found" },
          "Validation failed",
        ),
      );
  }

  // 3. If already blocked, return early
  const currentBlocked = loginUser.blockedMembers || [];
  if (currentBlocked.includes(blockUserid)) {
    return res
      .status(StatusCodes.CONFLICT)
      .json(
        new ApiResponse(
          StatusCodes.CONFLICT,
          { error: "User is already blocked" },
          "Already blocked",
        ),
      );
  }

  // 4. Add blockUserid to blockedMembers list
  const updatedBlockedMembers = [...currentBlocked, blockUserid];

  // 5. Update user
  const updatedUser = await prisma.user.update({
    where: { id: loginUserIdFromToken },
    data: {
      blockedMembers: updatedBlockedMembers,
    },
  });

  // Audit Log for Blocking User
  await AuditLogService.createLog({
    userId: loginUserIdFromToken,
    action: "BLOCK USER",
    resource: "USER",
    resourceId: blockUserid,
    details: { blockedUserId: blockUserid },
  });

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { user: updatedUser },
        "User blocked successfully",
      ),
    );
});

const getAllUsersApi = asyncHandler(async (req: Request, res: Response) => {
  const allUsers = await prisma.user.findMany({
    where: {
      role: {
        not: Role.superAdmin,
      },
    },
    include: {
      client: true,
      provider: {
        include: {
          clientList: {
            include: {
              client: {
                include: {
                  user: {
                    select: {
                      id: true,
                      fullName: true,
                      profileImage: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const mappedUsers = allUsers.map((u: any) => ({
    ...u,
    clientList: u.provider?.clientList || [],
  }));

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { totalDocument: mappedUsers.length, user: mappedUsers },
        "User fetched successfully",
      ),
    );
});

const approveValidUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;

  const user = await prisma.user.findFirst({
    where: { id },
    include: { client: true, provider: true, superAdmin: true },
  });

  if (!user) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json(
        new ApiResponse(
          StatusCodes.NOT_FOUND,
          { message: "User does not exist." },
          "Not Found Error",
        ),
      );
  }

  await prisma.user.update({
    where: { id },
    data: { isApprove: Approve.APPROVED },
  });

  const email = user.email;

  if (email) {
    try {
      // For clients: look up their generated clientId; for providers: use licenseNo
      let clientId: string | null = null;
      if (user.role === Role.client) {
        const clientRecord = await prisma.client.findUnique({
          where: { userId: user.id },
          select: { clientId: true },
        });
        clientId = clientRecord?.clientId ?? null;
      }
      await sendApprovalEmail(
        email,
        user.fullName,
        clientId,
        user.role !== Role.client ? (user.licenseNo ?? undefined) : undefined,
      );
    } catch (err) {
      console.error("Approval email failed:", err);
      // Do not fail approval just because email failed
    }
  }

  // Audit Log for User Approval
  await AuditLogService.createLog({
    userId: (req as any).user?.id,
    action: "APPROVE_USER",
    resource: "USER",
    resourceId: id,
    details: { approvedUserEmail: user.email, role: user.role },
  });

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { message: "User approved successfully." },
        "Approve",
      ),
    );
});

const rejectUser = asyncHandler(async (req: Request, res: Response) => {
  const { id, name } = req.body; // removed email from destructuring as we get it from DB if needed, or unused.

  const user = await prisma.user.findFirst({ where: { id } });
  if (!user) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json(
        new ApiResponse(
          StatusCodes.NOT_FOUND,
          { message: "User doesnot exist." },
          "Not Found Error",
        ),
      );
  }

  const isUserApproved = await prisma.user.update({
    where: { id },
    data: {
      isApprove: Approve.REJECTED,
    },
  });

  // Audit Log for User Rejection
  await AuditLogService.createLog({
    userId: (req as any).user?.id,
    action: "REJECT_USER",
    resource: "USER",
    resourceId: id,
    details: { rejectedUserEmail: user.email, role: user.role },
  });

  if (isUserApproved) {
    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          { message: "User rejected successfully." },
          "reject",
        ),
      );
  }
});

const restoreUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;

  const user = await prisma.user.findFirst({ where: { id } });
  if (!user) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json(
        new ApiResponse(
          StatusCodes.NOT_FOUND,
          { message: "User doesnot exist." },
          "Not Found Error",
        ),
      );
  }

  const isUserApproved = await prisma.user.update({
    where: { id },
    data: {
      isApprove: Approve.PENDING,
    },
  });

  // Audit Log for User Restoration
  await AuditLogService.createLog({
    userId: (req as any).user?.id,
    action: "RESTORE_USER",
    resource: "USER",
    resourceId: id,
    details: { restoredUserEmail: user.email, role: user.role },
  });

  if (isUserApproved) {
    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          { message: "User restored successfully." },
          "restore",
        ),
      );
  }
});

const getAllValidUsersApi = asyncHandler(
  async (req: Request, res: Response) => {
    const allUsers = await prisma.user.findMany({
      where: {
        isApprove: Approve.APPROVED,
        NOT: {
          role: Role.superAdmin,
        },
      },
      include: {
        client: true,
        provider: {
          include: {
            clientList: {
              include: {
                client: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        fullName: true,
                        profileImage: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const mappedUsers = allUsers.map((u: any) => ({
      ...u,
      clientList: u.provider?.clientList || [],
    }));

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          { totalDocument: mappedUsers.length, user: mappedUsers },
          "User fetched successfully",
        ),
      );
  },
);

const unblockUserApi = asyncHandler(async (req: Request, res: Response) => {
  const { blockUserid } = req.body;

  // 1. Check if block user exists
  const isBlockUserExist = await prisma.user.findUnique({
    where: { id: blockUserid },
  });
  if (!isBlockUserExist) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "User to be blocked not found" },
          "Validation failed",
        ),
      );
  }

  // 2. Get login user (who wants to unblock someone)
  const loginUserIdFromToken = (req as any).user.id;
  const loginUser = await prisma.user.findUnique({
    where: { id: loginUserIdFromToken },
  });
  if (!loginUser) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "Unblocking user not found" },
          "Validation failed",
        ),
      );
  }

  const currentBlocked = loginUser.blockedMembers || [];
  const updatedBlockedMembersList = currentBlocked.filter(
    (data) => data !== blockUserid,
  );
  const updatedUser = await prisma.user.update({
    where: { id: loginUserIdFromToken },
    data: {
      blockedMembers: updatedBlockedMembersList,
    },
  });

  // Audit Log for Unblocking User
  await AuditLogService.createLog({
    userId: loginUserIdFromToken,
    action: "UNBLOCK USER",
    resource: "USER",
    resourceId: blockUserid,
    details: { unblockedUserId: blockUserid },
  });

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { user: updatedUser },
        "User unblocked successfully",
      ),
    );
});

const deleteUserByAdminApi = asyncHandler(
  async (req: Request, res: Response) => {
    const { targetUserId } = req.body;
    const requesterRole = (req as any).user.role;

    if (requesterRole !== Role.superAdmin) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json(
          new ApiResponse(
            StatusCodes.FORBIDDEN,
            null,
            "Only admins can delete other users",
          ),
        );
    }

    if (!targetUserId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json(
          new ApiResponse(
            StatusCodes.BAD_REQUEST,
            null,
            "Target user ID is required",
          ),
        );
    }

    await userService.deleteUser(targetUserId);

    // Audit Log for Account Deletion (Admin)
    await AuditLogService.createLog({
      userId: (req as any).user?.id,
      action: "DELETE_USER",
      resource: "USER",
      resourceId: targetUserId,
      details: { message: "Admin deleted a user" },
    });

    return res
      .status(StatusCodes.OK)
      .json(new ApiResponse(StatusCodes.OK, {}, "User deleted successfully"));
  },
);

const findByLicenseNo = asyncHandler(async (req: Request, res: Response) => {
  // Accept either clientId (for clients) or licenseNo (for providers — legacy)
  let { clientId, licenseNo } = req.body;

  if (clientId) clientId = clientId.trim();
  if (licenseNo) licenseNo = licenseNo.trim();

  if (!clientId && !licenseNo) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "Client ID is required" },
          "Validation failed",
        ),
      );
  }

  let foundUser: any = null;

  if (clientId) {
    // New flow: clients look up by their auto-generated clientId
    const clientRecord = await prisma.client.findUnique({
      where: { clientId },
      include: {
        user: true,
      },
    });

    if (!clientRecord) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json(
          new ApiResponse(
            StatusCodes.NOT_FOUND,
            { error: "Client ID not found" },
            "Record not found",
          ),
        );
    }

    // Return in same shape as the old licenseNo response so frontend works
    foundUser = {
      ...clientRecord.user,
      client: {
        id: clientRecord.id,
        isAccountCreatedByOwnClient: clientRecord.isAccountCreatedByOwnClient,
        clientId: clientRecord.clientId,
      },
    };
  } else {
    // Legacy: look up by licenseNo (for providers or old clients)
    foundUser = await prisma.user.findFirst({
      where: { licenseNo },
      include: { client: true },
    });

    if (!foundUser) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json(
          new ApiResponse(
            StatusCodes.NOT_FOUND,
            { error: "License number not found" },
            "Record not found",
          ),
        );
    }
  }

  // Remove passwords before returning
  if (foundUser.client && (foundUser.client as any).password) {
    delete (foundUser.client as any).password;
  }
  if (foundUser.password) {
    delete foundUser.password;
  }

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, foundUser, "Record found."));
});

const searchUsersApi = asyncHandler(async (req: Request, res: Response) => {
  const { q } = req.query;
  const loginUserId = (req as any).user.id;
  const loginUserRole = (req as any).user.role;

  if (!q || typeof q !== "string") {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          null,
          "Search query 'q' is required",
        ),
      );
  }

  const searchTerm = q.trim();

  const userSearchFilter = {
    OR: [
      { fullName: { contains: searchTerm, mode: "insensitive" as const } },
      { email: { contains: searchTerm, mode: "insensitive" as const } },
      { licenseNo: { contains: searchTerm, mode: "insensitive" as const } },
    ],
  };

  let clientWhereClause: any = {
    user: {
      ...userSearchFilter,
      id: { not: loginUserId },
    },
  };

  if (loginUserRole === Role.provider) {
    const provider = await prisma.provider.findUnique({
      where: { userId: loginUserId },
    });
    const providerId = provider?.id;

    clientWhereClause.OR = [
      { clientShowToOthers: true },
      { createdByProviderId: providerId },
      {
        providerList: {
          some: { providerId: providerId },
        },
      },
    ];
  } else if (loginUserRole === Role.client) {
    clientWhereClause.userId = loginUserId;
  }

  const clients = await prisma.client.findMany({
    where: clientWhereClause,
    include: {
      user: true,
      providerList: {
        include: {
          provider: {
            include: { user: true },
          },
        },
      },
    },
    take: 20,
  });

  const providers = await prisma.provider.findMany({
    where: {
      user: {
        ...userSearchFilter,
        id: { not: loginUserId },
      },
    },
    include: {
      user: true,
      clientList: {
        include: {
          client: {
            include: { user: true },
          },
        },
      },
    },
    take: 20,
  });

  const allUsers = [...clients, ...providers];

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { totalDocument: allUsers.length, users: allUsers },
        "Users searched successfully",
      ),
    );
});

const getUsersPaginatedApi = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 7;
  const status = req.query.status as string; // "PENDING", "APPROVED", "REJECTED", "all"
  const role = req.query.role as string; // "provider", "client", "all"
  const search = req.query.search as string;

  const skip = (page - 1) * limit;

  let whereClause: any = {
    role: {
      not: Role.superAdmin,
    },
  };

  if (status && status !== "all") {
    whereClause.isApprove = status as Approve;
  }

  if (role && role !== "all") {
    whereClause.role = role as Role;
  }

  if (search) {
    whereClause.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { licenseNo: { contains: search, mode: "insensitive" } },
      { state: { contains: search, mode: "insensitive" } }
    ];
  }

  const [allUsers, totalCount] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      include: {
        client: true,
      },
      skip,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.user.count({
      where: whereClause,
    }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      { users: allUsers, totalPages, totalCount, currentPage: page },
      "Users fetched successfully"
    )
  );
});

export {
  blockUserApi,
  getAllUsersApi,
  approveValidUser,
  rejectUser,
  restoreUser,
  getAllValidUsersApi,
  unblockUserApi,
  deleteUserByAdminApi,
  findByLicenseNo,
  searchUsersApi,
  getUsersPaginatedApi,
};
