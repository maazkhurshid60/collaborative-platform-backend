import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";

const addDocumentApi = asyncHandler(async (req: Request, res: Response) => {
    const { url, name } = req.body
    const isDocumentUrlSame = await prisma.document.findFirst({ where: { url } })
    if (isDocumentUrlSame) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.NOT_FOUND, { error: "This document has already uploaded." }, "Duplicate Error."))
    }

    const isDocumentNameSame = await prisma.document.findFirst({ where: { name } })
    if (isDocumentNameSame) {
        return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.NOT_FOUND, { error: "This document's name has already exist." }, "Duplicate Error."))
    }
    const documentCreated = await prisma.document.create({
        data: {
            url, name
        }
    })
    if (!documentCreated) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: "Something went wrong." }, "Internal Server Error."))
    }
    return res.status(StatusCodes.CREATED).json(new ApiResponse(StatusCodes.CREATED, { message: "Document has uploaded successfully.", data: documentCreated }, "Created."))

})

const getAllDocumentApi = asyncHandler(async (req: Request, res: Response) => {
    const recordPerPage = parseInt(req.query.recordPerPage as string) || 10;
    const currentPage = parseInt(req.query.currentPage as string) || 1;

    const skip = (currentPage - 1) * recordPerPage;
    const take = recordPerPage;

    const allDocument = await prisma.document.findMany({
        skip,
        take,
        orderBy: {
            createdAt: 'desc', // Optional: latest first
        },
    });

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
            data: allDocument,

        }, "Fetched.")
    );
});


const documentSharedWithClientApi = asyncHandler(async (req: Request, res: Response) => {
    const { providerId, clientId, documentId } = req.body
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

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            message: "Documents shared with client successfully.",

            data: sharedDocuments,

        }, "Fetched.")
    );
})


const documentSignByClientApi = asyncHandler(async (req: Request, res: Response) => {
    const { clientId, sharedDocumentId, eSignature, isAgree } = req.body;

    // Validate required fields
    if (!clientId || !sharedDocumentId || !eSignature || typeof isAgree !== "boolean") {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Missing or invalid input fields." }, "Bad Request")
        );
    }

    // Check if shared document exists & belongs to client
    const isShareDocumentExist = await prisma.documentShareWith.findFirst({
        where: {
            id: sharedDocumentId,
            clientId: clientId, // validate ownership
        }
    });

    if (!isShareDocumentExist) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Document not found or not assigned to this client." }, "Not Found")
        );
    }

    // Update response
    const documentUpdated = await prisma.documentShareWith.update({
        where: { id: sharedDocumentId },
        data: {
            eSignature,
            isAgree,
            updatedAt: new Date()
        }, include: {
            document: true,
            client: true,
            provider: true
        }
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

    const getAllSharedDocument = await prisma.documentShareWith.findMany({ where: { clientId } })


    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            message: "Data fetched successfully.",
            data: getAllSharedDocument
        }, "Success")
    );

})

export { addDocumentApi, getAllDocumentApi, documentSharedWithClientApi, documentSignByClientApi, getAllSharedDocumentWithClientApi }