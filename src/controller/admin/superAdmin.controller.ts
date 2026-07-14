import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import prisma from "../../db/db.config";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { Prisma } from "../../generated/prisma/client";
import { Role, Approve, PaymentStatus } from "../../generated/prisma/enums";

export const getSuperAdminFirst = asyncHandler(
  async (_req: Request, res: Response) => {
    const superAdmin = await prisma.superAdmin.findFirst({
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    if (!superAdmin) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Super admin not found",
      });
    }

    const { password, ...safe } = superAdmin as any;

    return res
      .status(StatusCodes.OK)
      .json(new ApiResponse(StatusCodes.OK, safe, "OK"));
  },
);

export const getSuperAdminById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const superAdmin = await prisma.superAdmin.findUnique({
      where: { id: id as string },
      include: { user: true },
    });

    if (!superAdmin) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Super admin not found",
      });
    }

    const { password, ...safe } = superAdmin as any;

    return res
      .status(StatusCodes.OK)
      .json(new ApiResponse(StatusCodes.OK, safe, "OK"));
  },
);

export const updateSuperAdminById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const {
      fullName,
      licenseNumber,
      age,
      address,
      // country,
      state,
      email,
      contactNo,
      gender,
    } = req.body;

    const adminData: Prisma.SuperAdminUpdateInput = {};
    const userUpdate: Record<string, any> = {};

    if (fullName !== undefined) userUpdate.fullName = fullName;
    if (licenseNumber !== undefined) userUpdate.licenseNo = licenseNumber;
    if (age !== undefined) userUpdate.age = Number(age);
    if (address !== undefined) userUpdate.address = address;
    // if (country !== undefined) userUpdate.country = country;
    if (state !== undefined) userUpdate.state = state;
    if (contactNo !== undefined) userUpdate.contactNo = contactNo;
    if (gender !== undefined) userUpdate.gender = gender.toUpperCase();
    if (email !== undefined) userUpdate.email = email;

    // Handle image upload from multer-s3
    if (req.file) {
      userUpdate.profileImage = (req.file as any).location;
    } else if (req.body.profileImage === "null") {
      userUpdate.profileImage = null;
    }

    if (
      Object.keys(adminData).length === 0 &&
      Object.keys(userUpdate).length === 0
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "No fields provided to update",
      });
    }

    if (Object.keys(userUpdate).length > 0) {
      adminData.user = {
        update: userUpdate,
      };
    }

    try {
      const superAdmin = await prisma.superAdmin.update({
        where: { id: id as string },
        data: adminData,
        include: { user: true },
      });

      const { password, ...safe } = superAdmin as any;

      return res
        .status(StatusCodes.OK)
        .json(
          new ApiResponse(
            StatusCodes.OK,
            safe,
            "Super admin updated successfully",
          ),
        );
    } catch (error: any) {
      console.error("updateSuperAdminById error:", error);

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          message: "Super admin not found",
        });
      }

      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Failed to update super admin",
        error: error?.message ?? String(error),
      });
    }
  },
);

export const getAllPayments = asyncHandler(
  async (_req: Request, res: Response) => {
    const payments = await prisma.payment.findMany({
      include: {
        user: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          payments,
          "Payments fetched successfully",
        ),
      );
  },
);

export const getAllSubscriptions = asyncHandler(
  async (_req: Request, res: Response) => {
    const subscriptions = await prisma.subscription.findMany({
      where: { hiddenFromAdmin: false },
      include: {
        user: {
          include: {
            payments: {
              where: { hiddenFromAdmin: false },
              orderBy: {
                createdAt: "desc",
              },
              take: 1,
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          subscriptions,
          "Subscriptions fetched successfully",
        ),
      );
  },
);

export const updateSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { plan, status, currentPeriodEnd } = req.body;

    const subscription = await prisma.subscription.update({
      where: { id },
      data: {
        plan,
        status,
        currentPeriodEnd: currentPeriodEnd
          ? new Date(currentPeriodEnd)
          : undefined,
      },
      include: { user: true },
    });

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          subscription,
          "Subscription updated successfully",
        ),
      );
  },
);

export const deleteSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
    });
    if (subscription) {
      await prisma.subscription.update({
        where: { id },
        data: { hiddenFromAdmin: true },
      });
      await prisma.payment.updateMany({
        where: { userId: subscription.userId },
        data: { hiddenFromAdmin: true },
      });
    }

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          null,
          "Provider billing hidden successfully",
        ),
      );
  },
);

export const getProviderContactInfo = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.params.userId as string;

    const provider = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        provider: true,
      },
    });

    if (!provider) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Provider not found",
      });
    }

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          provider,
          "Provider contact info fetched successfully",
        ),
      );
  },
);

export const getProviderSubscriptionInfo = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.params.userId as string;

    const subscription = await prisma.subscription.findFirst({
      where: { userId, hiddenFromAdmin: false },
    });

    if (!subscription) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Subscription not found",
      });
    }

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          subscription,
          "Subscription info fetched successfully",
        ),
      );
  },
);

export const getProviderPaymentHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.params.userId as string;

    const payments = await prisma.payment.findMany({
      where: { userId, hiddenFromAdmin: false },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          payments,
          "Payment history fetched successfully",
        ),
      );
  },
);

export const getAllAuditLogs = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 50,
      action,
      resource,
      userId,
      search,
    } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {
      user: {
        role: {
          not: "superAdmin",
        },
      },
    };

    if (action) where.action = action as string;
    if (resource) where.resource = resource as string;
    if (userId) where.userId = userId as string;

    if (search) {
      const searchString = search as string;
      where.OR = [
        { action: { contains: searchString, mode: "insensitive" } },
        { resource: { contains: searchString, mode: "insensitive" } },
        { user: { fullName: { contains: searchString, mode: "insensitive" } } },
        { user: { email: { contains: searchString, mode: "insensitive" } } },
      ];
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        timestamp: "desc",
      },
      skip,
      take: Number(limit),
    });

    const total = await prisma.auditLog.count({ where });

    return res.status(StatusCodes.OK).json(
      new ApiResponse(
        StatusCodes.OK,
        {
          logs,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
        "Audit logs fetched successfully",
      ),
    );
  },
);

export const deleteAuditLog = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    await prisma.auditLog.delete({
      where: { id: id as string },
    });

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(StatusCodes.OK, null, "Audit log deleted successfully"),
      );
  },
);

export const bulkDeleteAuditLogs = asyncHandler(
  async (req: Request, res: Response) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Please provide an array of log IDs to delete",
      });
    }

    await prisma.auditLog.deleteMany({
      where: {
        id: { in: ids },
      },
    });

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          null,
          "Selected audit logs deleted successfully",
        ),
      );
  },
);

export const getAllSubmittedDocuments = asyncHandler(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const documents = await prisma.formSubmission.findMany({
      include: {
        share: {
          include: {
            template: true,
            client: {
              include: { user: true },
            },
            provider: {
              include: { user: true },
            },
          },
        },
      },
      orderBy: {
        submittedAt: "desc",
      },
      skip,
      take: Number(limit),
    });

    const total = await prisma.formSubmission.count();

    return res.status(StatusCodes.OK).json(
      new ApiResponse(
        StatusCodes.OK,
        {
          documents,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
        "Submitted documents fetched successfully",
      ),
    );
  },
);

export const getSuperAdminDashboardStats = asyncHandler(
  async (_req: Request, res: Response) => {
    const [
      userStats,
      payments,
      recentPendingProviders,
      recentPayments,
      recentActivities,
    ] = await Promise.all([
      prisma.user.groupBy({
        by: ["role", "isApprove"],
        _count: { _all: true },
      }),

      prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCEEDED },
        _sum: { amount: true },
      }),

      prisma.user.findMany({
        where: { role: Role.provider, isApprove: Approve.PENDING },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      prisma.payment.findMany({
        where: { status: PaymentStatus.SUCCEEDED },
        include: {
          user: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      prisma.auditLog.findMany({
        include: {
          user: {
            select: {
              fullName: true,
              role: true,
            },
          },
        },
        orderBy: { timestamp: "desc" },
        take: 5,
      }),
    ]);

    let activeProviders = 0;
    let pendingProviders = 0;
    let totalClients = 0;

    userStats.forEach((stat) => {
      if (stat.role === Role.provider && stat.isApprove === Approve.APPROVED) {
        activeProviders = stat._count._all;
      } else if (stat.role === Role.provider && stat.isApprove === Approve.PENDING) {
        pendingProviders = stat._count._all;
      } else if (stat.role === Role.client) {
        totalClients += stat._count._all;
      }
    });

    res.status(StatusCodes.OK).json(
      new ApiResponse(
        StatusCodes.OK,
        {
          activeProviders,
          pendingProviders,
          totalClients,
          totalRevenue: (payments._sum.amount as number) / 100,
          recentPendingProviders,
          recentPayments,
          recentActivities,
        },
        "Dashboard stats fetched successfully",
      ),
    );
  },
);
