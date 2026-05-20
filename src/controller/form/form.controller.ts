import crypto from "crypto";
import { Request, Response } from "express";


import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { io } from "../../socket/socket";
import { asyncHandler } from "../../utils/asyncHandler";
import logger from "../../utils/logger";
import { AuditLogService } from "../../services/AuditLogService";

const addFormTemplateApi = async (req: Request, res: Response) => {
  const { title, description, schema } = req.body;

  if (!title || !schema) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "Title and Form Schema are required." },
          "Bad Request",
        ),
      );
  }

  const template = await prisma.formTemplate.create({
    data: {
      title,
      description,
      schema, // JSON field
    },
  });

  await AuditLogService.createLog({
    userId: (req as any).user?.id,
    action: "CREATE_FORM_TEMPLATE",
    resource: "FORM_TEMPLATE",
    resourceId: template.id,
    details: { title: template.title },
  });

  return res
    .status(StatusCodes.CREATED)
    .json(
      new ApiResponse(
        StatusCodes.CREATED,
        { template },
        "Form template created successfully.",
      ),
    );
};

const shareFormApi = async (req: Request, res: Response) => {
  const { templateId, clientId, providerId, expirationDays } = req.body;

  if (!templateId || !providerId) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "templateId and providerId are required." },
          "Bad Request",
        ),
      );
  }


  if (clientId) {
    const existingShare = await prisma.formShare.findFirst({
      where: {
        templateId,
        clientId,
        status: { in: ["PENDING", "SUBMITTED"] },
      },
    });

    if (existingShare) {
      return res.status(StatusCodes.CONFLICT).json(
        new ApiResponse(
          StatusCodes.CONFLICT,
          {
            message:
              "Conflict",
          },
          "This form template has already been shared with this client.",
        ),
      );
    }
  }

  // High-entropy 64-character token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (expirationDays || 7));

  const share: any = await prisma.$transaction(async (tx) => {
    return await tx.formShare.create({
      data: {
        templateId,
        clientId,
        providerId,
        token,
        expiresAt,
        status: "PENDING",
      },
      include: {
        template: true,
        client: { include: { user: true } },
        provider: { include: { user: true } },
      },
    });
  });

  // Handle real-time socket notification if shared directly with a client
  if (share.client?.user) {
    const clientUser = share.client.user;
    const providerUser = share.provider?.user;

    const messageForClient = `Provider ${providerUser?.fullName || "Staff"} shared a form with you: "${share.template.title}".`;

    const clientNotification = await prisma.notification.create({
      data: {
        recipientId: clientUser.id,
        title: "New Form Assigned",
        message: messageForClient,
        type: "DOCUMENT_SHARED",
        senderId: providerUser?.id || null,
      },
    });

    io.to(`notification_room_${clientUser.id}`).emit(
      "new_notification",
      clientNotification,
    );
  }

  await AuditLogService.createLog({
    userId: share.provider?.user?.id,
    action: "SHARE_FORM_TEMPLATE",
    resource: "FORM_TEMPLATE",
    resourceId: share.templateId,
    details: {
      shareId: share.id,
      clientId: clientId || null,
      expiresAt,
    },
  });

  const secureLink = `${process.env.FRONTEND_URL || "https://app.kolabme.com"}/public/forms/${token}`;

  return res
    .status(StatusCodes.CREATED)
    .json(
      new ApiResponse(
        StatusCodes.CREATED,
        { secureLink, shareId: share.id, expiresAt },
        "Secure share link generated successfully.",
      ),
    );
};

const getFormTemplateByTokenApi = async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };

  if (!token) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "Token parameter is required." },
          "Bad Request",
        ),
      );
  }

  const share: any = await prisma.formShare.findUnique({
    where: { token },
    include: { template: true, client: { include: { user: true } } },
  });

  if (!share) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json(
        new ApiResponse(
          StatusCodes.NOT_FOUND,
          { error: "Form link not found or invalid." },
          "Not Found. Form link not found or invalid.",
        ),
      );
  }

  if (new Date() > share.expiresAt) {
    return res
      .status(StatusCodes.GONE)
      .json(
        new ApiResponse(
          StatusCodes.GONE,
          { error: "Link Expired. This share link has expired." },
          "Link Expired. This share link has expired.",
        ),
      );
  }

  if (share.status === "SUBMITTED") {
    return res
      .status(StatusCodes.LOCKED)
      .json(
        new ApiResponse(
          StatusCodes.LOCKED,
          { error: "Locked. This form has already been completed and locked." },
          "Locked. This form has already been completed and locked.",
        ),
      );
  }

  // Log the access to FormAuditTrail
  await prisma.formAuditTrail.create({
    data: {
      action: "LINK_ACCESSED",
      ipAddress: req.ip || req.socket.remoteAddress || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
      details: {
        shareId: share.id,
        templateTitle: share.template.title,
        clientId: share.clientId,
      },
    },
  });

  return res.status(StatusCodes.OK).json(
    new ApiResponse(
      StatusCodes.OK,
      {
        title: share.template.title,
        description: share.template.description,
        schema: share.template.schema,
        clientId: share.clientId,
        clientName: share.client?.user?.fullName || null,
      },
      "Template loaded successfully.",
    ),
  );
};

const submitFormApi = async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  const { submittedBy, data, signature, pdfUrl } = req.body;
  const ipAddress = req.ip || req.socket?.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  if (!token || !submittedBy || !data || !signature) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "Missing required fields for submission." },
          "Bad Request",
        ),
      );
  }

  try {
    // 1. Warm up connection pool & perform preliminary check outside transaction to prevent transaction cold-start timeouts
    const shareCheck = await prisma.formShare.findUnique({
      where: { token },
      include: { submission: true },
    });

    if (!shareCheck) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json(
          new ApiResponse(
            StatusCodes.NOT_FOUND,
            { error: "Form share link not found." },
            "Not Found",
          ),
        );
    }

    if (new Date() > shareCheck.expiresAt) {
      return res
        .status(StatusCodes.GONE)
        .json(
          new ApiResponse(
            StatusCodes.GONE,
            { error: "Form link has expired." },
            "Link Expired",
          ),
        );
    }

    if (shareCheck.clientId && shareCheck.clientId !== submittedBy) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json(
          new ApiResponse(
            StatusCodes.UNAUTHORIZED,
            { error: "You are not authorized to submit this form." },
            "Unauthorized",
          ),
        );
    }

    if (shareCheck.status === "SUBMITTED" || shareCheck.submission) {
      return res
        .status(StatusCodes.CONFLICT)
        .json(
          new ApiResponse(
            StatusCodes.CONFLICT,
            { error: "This form has already been submitted and locked." },
            "Already Submitted",
          ),
        );
    }

    // 2. Perform the atomic update inside transaction (connection is now warm and ready!)
    const submissionResult: any = await prisma.$transaction(
      async (tx) => {
        // Find share link with pessimistic locking
        const share: any = await tx.formShare.findUnique({
          where: { token },
          include: {
            submission: true,
            template: true,
            client: { include: { user: true } },
            provider: { include: { user: true } },
          },
        });

        if (!share) {
          throw new Error("INVALID_LINK");
        }

        if (new Date() > share.expiresAt) {
          throw new Error("LINK_EXPIRED");
        }

        // STRICT RECIPIENT VALIDATION: Verify client matches target recipient
        if (share.clientId && share.clientId !== submittedBy) {
          throw new Error("UNAUTHORIZED_RECIPIENT");
        }

        // STRICT SINGLE-SUBMISSION LOCK
        if (share.status === "SUBMITTED" || share.submission) {
          throw new Error("FORM_ALREADY_LOCKED");
        }

        // Create immutable submission record
        const submission = await tx.formSubmission.create({
          data: {
            shareId: share.id,
            submittedBy,
            data,
            signature,
            ipAddress,
            userAgent,
            isLocked: true,
            pdfUrl: pdfUrl || null,
          },
        });

        // Update share link status to SUBMITTED
        await tx.formShare.update({
          where: { id: share.id },
          data: { status: "SUBMITTED" },
        });

        // Log HIPAA Audit Trail
        await tx.formAuditTrail.create({
          data: {
            submissionId: submission.id,
            action: "SUBMITTED_AND_LOCKED",
            ipAddress,
            userAgent,
            details: {
              templateTitle: share.templateId,
              clientEmail: share.client?.user?.email || "unknown",
            },
          },
        });

        return { submission, share };
      },
      {
        maxWait: 15000, // maximum time to acquire a connection from pool
        timeout: 30000, // maximum time for the transaction to execute
      },
    );

    // Trigger real-time notifications to the provider that client has signed the form
    const providerUserId = submissionResult.share.provider?.user?.id;
    const clientUserId = submissionResult.share.client?.user?.id;
    const clientName =
      submissionResult.share.client?.user?.fullName || "Client";

    if (providerUserId) {
      const messageForProvider = `Client ${clientName} completed and locked the form: "${submissionResult.share.template.title}".`;

      const providerNotification = await prisma.notification.create({
        data: {
          recipientId: providerUserId,
          senderId: clientUserId || null,
          title: "Form Completed & Locked",
          message: messageForProvider,
          type: "DOCUMENT_SIGNED",
        },
      });

      io.to(`notification_room_${providerUserId}`).emit(
        "new_notification",
        providerNotification,
      );
    }

    // Log the main event via global AuditLog
    await AuditLogService.createLog({
      userId: clientUserId || null,
      action: "SUBMIT_AND_LOCK_FORM",
      resource: "FORM_SUBMISSION",
      resourceId: submissionResult.submission.id,
      details: {
        shareId: submissionResult.share.id,
        templateTitle: submissionResult.share.template.title,
      },
    });

    return res.status(StatusCodes.OK).json(
      new ApiResponse(
        StatusCodes.OK,
        {
          message: "Form successfully submitted and locked.",
          submissionId: submissionResult.submission.id,
        },
        "Success",
      ),
    );
  } catch (error: any) {
    if (error.message === "INVALID_LINK") {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json(
          new ApiResponse(
            StatusCodes.NOT_FOUND,
            { error: "Invalid share link." },
            "Not Found",
          ),
        );
    }
    if (error.message === "LINK_EXPIRED") {
      return res
        .status(StatusCodes.GONE)
        .json(
          new ApiResponse(
            StatusCodes.GONE,
            { error: "This link has expired." },
            "Expired",
          ),
        );
    }
    if (error.message === "UNAUTHORIZED_RECIPIENT") {
      return res.status(StatusCodes.FORBIDDEN).json(
        new ApiResponse(
          StatusCodes.FORBIDDEN,
          {
            error:
              "Access Denied: You are not the authorized client designated to submit this form.",
          },
          "Forbidden",
        ),
      );
    }
    if (error.message === "FORM_ALREADY_LOCKED") {
      return res.status(StatusCodes.LOCKED).json(
        new ApiResponse(
          StatusCodes.LOCKED,
          {
            error:
              "This form has already been completed and is locked to prevent modification.",
          },
          "Locked",
        ),
      );
    }

    logger.error("Error processing form submission:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json(
        new ApiResponse(
          StatusCodes.INTERNAL_SERVER_ERROR,
          { error: "Internal Server Error during form submission." },
          "Error",
        ),
      );
  }
};

const listFormTemplatesApi = async (req: Request, res: Response) => {
  try {
    const templates = await prisma.formTemplate.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        shares: true,
      },
    });

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          { templates },
          "Form templates retrieved successfully.",
        ),
      );
  } catch (error) {
    logger.error("Error retrieving form templates:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json(
        new ApiResponse(
          StatusCodes.INTERNAL_SERVER_ERROR,
          { error: "Internal Server Error during retrieving templates." },
          "Error",
        ),
      );
  }
};

const deleteFormTemplateApi = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await prisma.formTemplate.deleteMany({
      where: { id: String(id) },
    });

    if (result.count === 0) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json(
          new ApiResponse(
            StatusCodes.NOT_FOUND,
            { error: "Form template not found or already deleted." },
            "Not Found",
          ),
        );
    }

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          null,
          "Form template deleted successfully.",
        ),
      );
  },
);

const listSharedFormsForClientApi = asyncHandler(
  async (req: Request, res: Response) => {
    const { clientId } = req.params;

    const shares = await prisma.formShare.findMany({
      where: { clientId: String(clientId) },
      include: {
        template: true,
        provider: { include: { user: true } },
        submission: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          { shares },
          "Shared forms retrieved successfully.",
        ),
      );
  },
);

const getFormTemplateRecipientsApi = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const providerId =
      (req.query.providerId as string) ||
      (req.body?.providerId as string) ||
      undefined;
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit as string) || 10, 1),
      100,
    );
    const status = (req.query.status as string | undefined)?.toLowerCase();

    if (!id) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json(
          new ApiResponse(
            StatusCodes.BAD_REQUEST,
            { error: "Form Template ID is required" },
            "Bad Request",
          ),
        );
    }
    if (!providerId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json(
          new ApiResponse(
            StatusCodes.BAD_REQUEST,
            { error: "providerId is required" },
            "Bad Request",
          ),
        );
    }

    const where: any = {
      templateId: id,
      providerId,
    };

    if (status === "signed" || status === "submitted") {
      where.status = "SUBMITTED";
    } else if (status === "awaiting" || status === "pending") {
      where.status = "PENDING";
    }

    const [shares, total] = await Promise.all([
      prisma.formShare.findMany({
        where,
        include: {
          client: {
            include: {
              user: true,
            },
          },
          submission: true,
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.formShare.count({ where }),
    ]);

    const recipients = shares.map((share: any) => ({
      id: share.id,
      clientId: share.clientId,
      fullName: share.client?.user?.fullName ?? "Unnamed client",
      email: share.client?.user?.email ?? null,
      isSigned: share.status === "SUBMITTED",
      eSignature: share.submission?.signature ?? null,
      submission: share.submission ?? null,
      updatedAt: share.updatedAt,
    }));

    return res.status(StatusCodes.OK).json(
      new ApiResponse(
        StatusCodes.OK,
        {
          message: "Form template recipients fetched successfully.",
          data: {
            recipients,
            pagination: {
              total,
              page,
              limit,
              totalPages: Math.max(Math.ceil(total / limit), 1),
            },
          },
        },
        "Fetched.",
      ),
    );
  },
);

const uploadFormPdfApi = async (req: Request, res: Response) => {
  const file = req.file as Express.Multer.File & { location: string };
  if (!file) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ error: "No file uploaded" });
  }
  return res.status(StatusCodes.OK).json({
    message: "PDF uploaded successfully",
    url: file.location,
  });
};

export {
  addFormTemplateApi,
  shareFormApi,
  getFormTemplateByTokenApi,
  submitFormApi,
  listFormTemplatesApi,
  deleteFormTemplateApi,
  listSharedFormsForClientApi,
  getFormTemplateRecipientsApi,
  uploadFormPdfApi,
};
