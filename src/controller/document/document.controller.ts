import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { io } from "../../socket/socket";
import { sendDocumentEmail } from "../../utils/nodeMailer/SendDocumentEmail";
import logger from "../../utils/logger";

const addDocumentApi = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file as Express.Multer.File & { location: string };;
    const { type } = req.body;
    const name = file?.originalname || req?.body?.name;

    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check if document already exists by name or S3 URL
    const existing = await prisma.document.findFirst({
        where: {
            OR: [{ name }, { url: file.location }],
        },
    });

    if (existing) {
        return res.status(409).json({ error: 'Document already exists' });
    }

    // ✅ Save document info with S3 URL
    const document = await prisma.document.create({
        data: {
            name,
            url: file.location, // ✅ S3 URL here
            type,
        },
    });

    res.status(201).json({ message: 'Uploaded successfully', document });
});


const getAllDocumentApi = asyncHandler(async (req: Request, res: Response) => {
    const { clientId, providerId } = req.body;

    if (!clientId) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Client ID is required" }, "Bad Request")
        );
    }

    const recordPerPage = parseInt(req.query.recordPerPage as string) || 10;
    const currentPage = parseInt(req.query.currentPage as string) || 1;
    const skip = (currentPage - 1) * recordPerPage;

    // Step 1: Fetch all master documents
    const allDocuments = await prisma.document.findMany({
        include: { sharedWith: true },
        orderBy: { createdAt: 'desc' },
        skip
    });

    // Step 2: Fetch shared documents with current client
    const sharedWithClient = await prisma.documentShareWith.findMany({
        where: { clientId, ...(providerId && { providerId }) },
        include: { document: true },
    });

    // Step 3: Prepare sets for agreed/unagreed docs
    const agreedDocs = sharedWithClient
        .filter((item) => item.isAgree)
        .map((item) => item.documentId);
    const onlySharedDocs = sharedWithClient
        .filter((item) => !item.isAgree)
        .map((item) => item.documentId);

    const unAgreedDocs = sharedWithClient
        .filter((item) => item.isAgree)
        .map((item) => item.documentId);


    // Step 4: Separate documents
    const completedDocuments = allDocuments.filter(doc => agreedDocs.includes(doc.id));


    const uncompletedDocuments = allDocuments.filter(doc =>
        !agreedDocs.includes(doc.id) && !onlySharedDocs.includes(doc.id)
    );
    const sharedDocuments = allDocuments.filter(doc => onlySharedDocs.includes(doc.id));

    const totalDocuments = await prisma.document.count();

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            message: "Documents fetched successfully.",
            pagination: {
                total: totalDocuments,
                currentPage,
                recordPerPage,
                totalPages: Math.ceil(totalDocuments / recordPerPage),
            },
            data: {
                completedDocuments,
                uncompletedDocuments,
                sharedDocuments,
                allDocuments
            }
        }, "Fetched.")
    );
});



const documentSharedWithClientApi = asyncHandler(async (req: Request, res: Response) => {
    const { providerId, clientId, documentId, senderId, clientEmail } = req.body;
    logger.debug(`Document share request: providerId=${providerId}, clientId=${clientId}, senderId=${senderId}, documents=${documentId}`);

    const alreadySharedDocs = await prisma.documentShareWith.findMany({
        where: {
            providerId,
            clientId,
            documentId: {
                in: documentId
            }
        },
        include: {
            document: true
        }
    });

    if (alreadySharedDocs.length > 0) {
        const alreadySharedDocNames = alreadySharedDocs.map(doc => doc.document.name);
        const docList = alreadySharedDocNames.join(', ');


        return res.status(409).json({
            error: `The following documents have already been shared: ${docList}`,
            alreadyShared: alreadySharedDocNames
        });
    }
    const sharedDocuments = await Promise.all(
        documentId.map((documentId: string) =>
            prisma.documentShareWith.create({
                data: {
                    providerId,
                    clientId,
                    documentId
                },
                include: {
                    document: true,
                    client: true,
                    provider: true
                }
            })
        )
    );
    for (const doc of sharedDocuments) {
        const clientUser = await prisma.user.findUnique({
            where: { id: doc.client.userId },
            select: { id: true, fullName: true, email: true }
        });

        const providerUser = await prisma.user.findUnique({
            where: { id: doc.provider.userId },
            select: { id: true, fullName: true }
        });

        if (!clientUser || !providerUser) {
            logger.warn(`User not found for client or provider in document sharing.`);
            continue;
        }

        const messageForClient = `Provider ${providerUser.fullName} shared a document with you.`;
        const messageForProvider = `You shared a document with ${clientUser.fullName}.`;

        // ✅ Create notification for CLIENT
        const clientNotification = await prisma.notification.create({
            data: {
                recipientId: clientUser.id,
                title: 'New Document Shared',
                message: messageForClient,
                type: 'DOCUMENT_SHARED',
                senderId: senderId,
            }
        });

        await sendDocumentEmail(
            clientUser.email,
            clientUser.fullName,
            providerUser.fullName,
            doc.client.clientId || ""
        );
        io.to(`notification_room_${clientUser.id}`).emit('new_notification', clientNotification);

        // Create notification for PROVIDER
        const providerNotification = await prisma.notification.create({
            data: {
                recipientId: providerUser.id,
                title: 'New Document Shared',
                message: messageForProvider,
                type: 'DOCUMENT_SHARED',
                senderId: senderId
            }
        });

        io.to(`notification_room_${providerUser.id}`).emit('new_notification', providerNotification);
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            message: "Documents shared with client successfully.",
            data: sharedDocuments
        }, "Fetched.")
    );
});




const documentSignByClientApi = asyncHandler(async (req: Request, res: Response) => {
    const { clientId, sharedDocumentId, isAgree, senderId, eSignature } = req.body;
    logger.debug(`Document sign request: clientId=${clientId}, sharedDocumentId=${sharedDocumentId}, isAgree=${isAgree}`);


    if (!clientId || !sharedDocumentId || !eSignature || isAgree === undefined) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Missing or invalid input fields." }, "Bad Request")
        );
    }

    const isShareDocumentExist = await prisma.documentShareWith.findFirst({
        where: {
            id: sharedDocumentId,
            clientId,
        }
    });

    if (!isShareDocumentExist) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Document not found or not assigned to this client." }, "Not Found")
        );
    }

    const documentUpdated = await prisma.documentShareWith.update({
        where: { id: sharedDocumentId },
        data: {
            eSignature: eSignature,
            isAgree: isAgree,
            updatedAt: new Date()
        },
        include: {
            document: true,
            client: { include: { user: true } },
            provider: { include: { user: true } }
        }
    });

    const providerUserId = documentUpdated?.provider?.user?.id;
    const clientUserId = senderId; // Client who signed
    const clientName = documentUpdated?.client?.user?.fullName;

    if (!providerUserId || !clientUserId) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, {}, "User IDs missing.")
        );
    }

    const messageForProvider = `Client ${clientName} signed the document.`;

    // 🔔 Create notification for Provider
    const providerNotification = await prisma.notification.create({
        data: {
            recipientId: providerUserId,
            senderId: clientUserId,
            title: 'Document Signed',
            message: messageForProvider,
            type: 'DOCUMENT_SIGNED'
        }
    });

    if (providerUserId !== clientUserId) {
        io.to(`notification_room_${providerUserId}`).emit('new_notification', providerNotification);
    }

    // 🔔 Create notification for Client
    const clientNotification = await prisma.notification.create({
        data: {
            recipientId: clientUserId,
            senderId: clientUserId,
            title: 'Document Signed',
            message: 'You signed the document successfully.',
            type: 'DOCUMENT_SIGNED'
        }
    });

    io.to(`notification_room_${clientUserId}`).emit('new_notification', clientNotification);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            message: "Your response has been recorded successfully.",
            data: documentUpdated
        }, "Success")
    );
});


const getAllSharedDocumentWithClientApi = asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.body

    if (!clientId) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, {
                message: "Client id is required."
            }, "Bad Request")
        );
    }

    const getAllSharedDocument = await prisma.documentShareWith.findMany({ where: { clientId }, include: { document: true, provider: { include: { user: true } } } })


    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            message: "Data fetched successfully.",
            data: getAllSharedDocument
        }, "Success")
    );

})



const deleteDocumentApi = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.body
    const isDocumentExist = await prisma.document.findFirst({ where: { id } })
    if (!isDocumentExist) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { message: "Document not found" }, "Validation failed")
        );
    }

    const isDocumentDelete = await prisma.document.delete({ where: { id } })
    if (isDocumentDelete) {

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { message: "Document has deleted successfully" }, "Success")
        );
    }


    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
        new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { message: "Internal Server Error. Try Later" }, "Internal Server Error")
    );

})

/**
 * Paginated recipients for a single document, scoped to the calling provider.
 *
 * Drives the "Document Recipients" modal in the provider-side Document Sharing
 * tab. Rows are sorted awaiting-first (so the provider sees outstanding work
 * before completed signatures), then by recency.
 *
 * Query params:
 *   - providerId  required — which provider's shares to consider
 *   - page        default 1
 *   - limit       default 10 (capped server-side at 100)
 *   - status      optional: "signed" | "awaiting" — narrows the list
 */
const getDocumentRecipientsApi = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const providerId = (req.query.providerId as string) || (req.body?.providerId as string) || undefined;
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 100);
    const status = (req.query.status as string | undefined)?.toLowerCase();

    if (!id) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Document ID is required" }, "Bad Request")
        );
    }
    if (!providerId) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "providerId is required" }, "Bad Request")
        );
    }

    const where: any = { documentId: id, providerId };
    if (status === "signed") where.eSignature = { not: null };
    else if (status === "awaiting") where.eSignature = null;

    const [rows, total] = await Promise.all([
        prisma.documentShareWith.findMany({
            where,
            include: { client: { include: { user: true } } },
            // Awaiting (eSignature null) sorts before signed when we asc-order by eSignature
            // (Prisma + Postgres: NULLS FIRST for asc by default; for SQLite the same holds).
            // Tie-break by most-recently-updated so the active items rise to the top.
            orderBy: [{ eSignature: "asc" }, { updatedAt: "desc" }],
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.documentShareWith.count({ where }),
    ]);

    const recipients = rows.map((r: any) => ({
        id: r.id,
        clientId: r.clientId,
        fullName: r.client?.user?.fullName ?? "Unnamed client",
        email: r.client?.user?.email ?? null,
        isSigned: Boolean(r.eSignature),
        eSignature: r.eSignature ?? null,
        updatedAt: r.updatedAt,
    }));

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            message: "Recipients fetched successfully.",
            data: {
                recipients,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.max(Math.ceil(total / limit), 1),
                },
            },
        }, "Fetched.")
    );
});

/**
 * Returns the master document catalog with `sharedWith` rows joined in.
 * Optionally scoped to a single provider so `sharedWith` only contains shares
 * that belong to the calling provider — keeps the per-(doc, client) status
 * derivation clean on the frontend.
 *
 * Used by the provider-side "Document Sharing" tab to drive a doc-first view.
 */
const getAllMasterDocumentsApi = asyncHandler(async (req: Request, res: Response) => {
    const providerId = (req.query.providerId as string) || (req.body?.providerId as string) || undefined;

    const documents = await prisma.document.findMany({
        include: {
            sharedWith: providerId
                ? { where: { providerId } }
                : true,
        },
        orderBy: { createdAt: 'desc' },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            message: "Documents fetched successfully.",
            data: { documents },
        }, "Fetched.")
    );
});

export { addDocumentApi, getAllDocumentApi, documentSharedWithClientApi, documentSignByClientApi, getAllSharedDocumentWithClientApi, deleteDocumentApi, getAllMasterDocumentsApi, getDocumentRecipientsApi }
