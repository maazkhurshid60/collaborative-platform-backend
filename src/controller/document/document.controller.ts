import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { io } from "../../socket/socket";

const addDocumentApi = asyncHandler(async (req: Request, res: Response) => {

    const file = req?.file;
    const { type } = req.body
    const name = file?.originalname || req?.body?.name;  // Use filename or name from body
    console.log("type", type);

    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check if document already exists
    const existing = await prisma.document.findFirst({
        where: {
            OR: [{ name }, { url: `/uploads/${file.filename}` }],
        },
    });

    if (existing) {
        return res.status(409).json({ error: 'Document already exists' });
    }

    // Save document info in DB
    const document = await prisma.document.create({
        data: {
            name,
            url: `/uploads/${file.filename}`,
            type
        },
    });

    res.status(201).json({ message: 'Uploaded successfully', document });
})

const getAllDocumentApi = asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.body;

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
        include: { sharedRecords: true },
        orderBy: { createdAt: 'desc' },
        skip
    });

    // Step 2: Fetch shared documents with current client
    const sharedWithClient = await prisma.documentShareWith.findMany({
        where: { clientId },
        include: { document: true },
    });

    // Step 3: Prepare sets for agreed/unagreed docs
    const agreedDocs = sharedWithClient
        .filter((item) => item.isAgree)
        .map((item) => item.documentId);

    const unAgreedDocs = sharedWithClient
        .filter((item) => !item.isAgree)
        .map((item) => item.documentId);

    // Step 4: Separate documents
    const completedDocuments = allDocuments.filter(doc => agreedDocs.includes(doc.id));
    const uncompletedDocuments = allDocuments.filter(doc =>
        unAgreedDocs.includes(doc.id) ||
        !sharedWithClient.find(d => d.documentId === doc.id) // Not shared yet = uncompleted
    );

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
            }
        }, "Fetched.")
    );
});



const documentSharedWithClientApi = asyncHandler(async (req: Request, res: Response) => {
    const { providerId, clientId, documentId } = req.body
    const existing = await prisma.documentShareWith.findFirst({
        where: {
            providerId,
            clientId,
            documentId: {
                in: documentId  // ✅ Now using `in` for array check
            }
        }
    });
    if (existing) {

        return res.status(409).json({ error: 'Document already shared' });
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
                    provider: true,

                }
            })
        )
    );


    // Notify client
    for (const doc of sharedDocuments) {
        const clientUser = await prisma.user.findUnique({
            where: { id: doc.client.userId },
            select: { id: true, fullName: true }
        });

        const providerUser = await prisma.user.findUnique({
            where: { id: doc.provider.userId },
            select: { fullName: true }
        });

        if (!clientUser) {
            console.warn(`⚠️ User not found for clientId: ${doc.client.userId}`);
            continue; // Skip if client user doesn't exist
        }

        await prisma.notification.create({
            data: {
                recipientId: clientUser.id,
                title: 'New Document Shared',
                message: `Provider ${providerUser?.fullName || "Provider"} shared a document with you.`,
                type: 'DOCUMENT_SHARED'
            }
        });

        io.to(clientUser.id).emit('new_notification', {
            title: 'New Document Shared',
            message: `Provider ${providerUser?.fullName || "Provider"} shared a document with you.`,
            type: 'DOCUMENT_SHARED',
            recipientId: clientUser.id
        });
    }


    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            message: "Documents shared with client successfully.",

            data: sharedDocuments,

        }, "Fetched.")
    );
})



const documentSignByClientApi = asyncHandler(async (req: Request, res: Response) => {
    const { clientId, sharedDocumentId, isAgree } = req.body;
    const eSignatureFile = req.file;

    if (!clientId || !sharedDocumentId || !eSignatureFile || isAgree === undefined) {
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
            eSignature: eSignatureFile.filename,
            isAgree: isAgree === "true",
            updatedAt: new Date()
        },
        include: {
            document: true,
            client: { include: { user: true } },
            provider: { include: { user: true } }
        }
    });

    // Notify provider (get their user.id)
    const providerUserId = documentUpdated?.provider?.user?.id!;
    console.log("providerid", providerUserId);

    await prisma.notification.create({
        data: {
            recipientId: providerUserId,
            title: 'Document Signed',
            message: `Client ${documentUpdated?.client?.user?.fullName} signed the document.`,
            type: 'DOCUMENT_SIGNED'
        }
    });

    if (!providerUserId) {
        return res.status(404).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Provider user ID not found" }, "Not Found")
        );
    }
    io.to(providerUserId).emit('new_notification', {
        title: 'Document Signed',
        message: `Client ${documentUpdated?.client?.user?.fullName} signed the document.`,
        type: 'DOCUMENT_SIGNED',
        recipientId: providerUserId
    });


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

export { addDocumentApi, getAllDocumentApi, documentSharedWithClientApi, documentSignByClientApi, getAllSharedDocumentWithClientApi }