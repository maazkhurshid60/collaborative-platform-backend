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
exports.getAllSharedDocumentWithClientApi = exports.documentSignByClientApi = exports.documentSharedWithClientApi = exports.getAllDocumentApi = exports.addDocumentApi = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const db_config_1 = __importDefault(require("../../db/db.config"));
const http_status_codes_1 = require("http-status-codes");
const apiResponse_1 = require("../../utils/apiResponse");
const addDocumentApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const file = req === null || req === void 0 ? void 0 : req.file;
    const name = (file === null || file === void 0 ? void 0 : file.originalname) || ((_a = req === null || req === void 0 ? void 0 : req.body) === null || _a === void 0 ? void 0 : _a.name); // Use filename or name from body
    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // Check if document already exists
    const existing = yield db_config_1.default.document.findFirst({
        where: {
            OR: [{ name }, { url: `/uploads/${file.filename}` }],
        },
    });
    if (existing) {
        return res.status(409).json({ error: 'Document already exists' });
    }
    // Save document info in DB
    const document = yield db_config_1.default.document.create({
        data: {
            name,
            url: `/uploads/${file.filename}`,
        },
    });
    res.status(201).json({ message: 'Uploaded successfully', document });
}));
exports.addDocumentApi = addDocumentApi;
const getAllDocumentApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { clientId } = req.body;
    if (!clientId) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: "Client ID is required" }, "Bad Request"));
    }
    const recordPerPage = parseInt(req.query.recordPerPage) || 10;
    const currentPage = parseInt(req.query.currentPage) || 1;
    const skip = (currentPage - 1) * recordPerPage;
    // Step 1: Fetch all master documents
    const allDocuments = yield db_config_1.default.document.findMany({
        include: { sharedRecords: true },
        orderBy: { createdAt: 'desc' },
        skip
    });
    // Step 2: Fetch shared documents with current client
    const sharedWithClient = yield db_config_1.default.documentShareWith.findMany({
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
    const uncompletedDocuments = allDocuments.filter(doc => unAgreedDocs.includes(doc.id) ||
        !sharedWithClient.find(d => d.documentId === doc.id) // Not shared yet = uncompleted
    );
    const totalDocuments = yield db_config_1.default.document.count();
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, {
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
    }, "Fetched."));
}));
exports.getAllDocumentApi = getAllDocumentApi;
const documentSharedWithClientApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { providerId, clientId, documentId } = req.body;
    const existing = yield db_config_1.default.documentShareWith.findFirst({
        where: {
            providerId,
            clientId,
            documentId: {
                in: documentId // ✅ Now using `in` for array check
            }
        }
    });
    if (existing) {
        return res.status(409).json({ error: 'Document already shared' });
    }
    const sharedDocuments = yield Promise.all(documentId.map((documentId) => db_config_1.default.documentShareWith.create({
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
    })));
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, {
        message: "Documents shared with client successfully.",
        data: sharedDocuments,
    }, "Fetched."));
}));
exports.documentSharedWithClientApi = documentSharedWithClientApi;
// const documentSignByClientApi = asyncHandler(async (req: Request, res: Response) => {
//     const { clientId, sharedDocumentId, eSignature, isAgree } = req.body;
//     // Validate required fields
//     if (!clientId || !sharedDocumentId || !eSignature || typeof isAgree !== "boolean") {
//         return res.status(StatusCodes.BAD_REQUEST).json(
//             new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Missing or invalid input fields." }, "Bad Request")
//         );
//     }
//     // Check if shared document exists & belongs to client
//     const isShareDocumentExist = await prisma.documentShareWith.findFirst({
//         where: {
//             id: sharedDocumentId,
//             clientId: clientId, // validate ownership
//         }
//     });
//     if (!isShareDocumentExist) {
//         return res.status(StatusCodes.NOT_FOUND).json(
//             new ApiResponse(StatusCodes.NOT_FOUND, { error: "Document not found or not assigned to this client." }, "Not Found")
//         );
//     }
//     // Update response
//     const documentUpdated = await prisma.documentShareWith.update({
//         where: { id: sharedDocumentId },
//         data: {
//             eSignature,
//             isAgree,
//             updatedAt: new Date()
//         }, include: {
//             document: true,
//             client: true,
//             provider: true
//         }
//     });
//     return res.status(StatusCodes.OK).json(
//         new ApiResponse(StatusCodes.OK, {
//             message: "Your response has been recorded successfully.",
//             data: documentUpdated
//         }, "Success")
//     );
// });
const documentSignByClientApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { clientId, sharedDocumentId, isAgree } = req.body;
    const eSignatureFile = req.file;
    if (!clientId || !sharedDocumentId || !eSignatureFile || isAgree === undefined) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: "Missing or invalid input fields." }, "Bad Request"));
    }
    const isShareDocumentExist = yield db_config_1.default.documentShareWith.findFirst({
        where: {
            id: sharedDocumentId,
            clientId,
        }
    });
    if (!isShareDocumentExist) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "Document not found or not assigned to this client." }, "Not Found"));
    }
    const documentUpdated = yield db_config_1.default.documentShareWith.update({
        where: { id: sharedDocumentId },
        data: {
            eSignature: eSignatureFile.filename, // Save just the filename or full path
            isAgree: isAgree === "true", // since it's coming from formData, it's a string
            updatedAt: new Date()
        },
        include: {
            document: true,
            client: true,
            provider: true
        }
    });
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, {
        message: "Your response has been recorded successfully.",
        data: documentUpdated
    }, "Success"));
}));
exports.documentSignByClientApi = documentSignByClientApi;
const getAllSharedDocumentWithClientApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { clientId } = req.body;
    if (!clientId) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, {
            message: "Client id is required."
        }, "Bad Request"));
    }
    const getAllSharedDocument = yield db_config_1.default.documentShareWith.findMany({ where: { clientId }, include: { document: true, provider: { include: { user: true } } } });
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, {
        message: "Data fetched successfully.",
        data: getAllSharedDocument
    }, "Success"));
}));
exports.getAllSharedDocumentWithClientApi = getAllSharedDocumentWithClientApi;
