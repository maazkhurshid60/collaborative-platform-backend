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
exports.deleteDocumentApi = exports.getAllSharedDocumentWithClientApi = exports.documentSignByClientApi = exports.documentSharedWithClientApi = exports.getAllDocumentApi = exports.addDocumentApi = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const db_config_1 = __importDefault(require("../../db/db.config"));
const http_status_codes_1 = require("http-status-codes");
const apiResponse_1 = require("../../utils/apiResponse");
const socket_1 = require("../../socket/socket");
const SendDocumentEmail_1 = require("../../utils/nodeMailer/SendDocumentEmail");
const addDocumentApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const file = req.file;
    ;
    const { type } = req.body;
    const name = (file === null || file === void 0 ? void 0 : file.originalname) || ((_a = req === null || req === void 0 ? void 0 : req.body) === null || _a === void 0 ? void 0 : _a.name);
    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // Check if document already exists by name or S3 URL
    const existing = yield db_config_1.default.document.findFirst({
        where: {
            OR: [{ name }, { url: file.location }],
        },
    });
    if (existing) {
        return res.status(409).json({ error: 'Document already exists' });
    }
    // ✅ Save document info with S3 URL
    const document = yield db_config_1.default.document.create({
        data: {
            name,
            url: file.location, // ✅ S3 URL here
            type,
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
    const onlySharedDocs = sharedWithClient
        .filter((item) => !item.isAgree)
        .map((item) => item.documentId);
    const unAgreedDocs = sharedWithClient
        .filter((item) => item.isAgree)
        .map((item) => item.documentId);
    // Step 4: Separate documents
    const completedDocuments = allDocuments.filter(doc => agreedDocs.includes(doc.id));
    const uncompletedDocuments = allDocuments.filter(doc => !agreedDocs.includes(doc.id) && !onlySharedDocs.includes(doc.id));
    const sharedDocuments = allDocuments.filter(doc => onlySharedDocs.includes(doc.id));
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
            sharedDocuments,
            allDocuments
        }
    }, "Fetched."));
}));
exports.getAllDocumentApi = getAllDocumentApi;
const documentSharedWithClientApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { providerId, clientId, documentId, senderId, clientEmail } = req.body;
    const alreadySharedDocs = yield db_config_1.default.documentShareWith.findMany({
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
    const sharedDocuments = yield Promise.all(documentId.map((documentId) => db_config_1.default.documentShareWith.create({
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
    })));
    for (const doc of sharedDocuments) {
        const clientUser = yield db_config_1.default.user.findUnique({
            where: { id: doc.client.userId },
            select: { id: true, fullName: true }
        });
        const providerUser = yield db_config_1.default.user.findUnique({
            where: { id: doc.provider.userId },
            select: { id: true, fullName: true }
        });
        if (!clientUser || !providerUser) {
            console.warn(`⚠️ User not found for client or provider.`);
            continue;
        }
        const messageForClient = `Provider ${providerUser.fullName} shared a document with you.`;
        const messageForProvider = `You shared a document with ${clientUser.fullName}.`;
        // ✅ Create notification for CLIENT
        const clientNotification = yield db_config_1.default.notification.create({
            data: {
                recipientId: clientUser.id,
                title: 'New Document Shared',
                message: messageForClient,
                type: 'DOCUMENT_SHARED',
                senderId: senderId,
            }
        });
        yield (0, SendDocumentEmail_1.sendDocumentEmail)(clientEmail, clientUser.fullName, providerUser.fullName);
        socket_1.io.to(clientUser.id).emit('new_notification', clientNotification);
        // Create notification for PROVIDER
        const providerNotification = yield db_config_1.default.notification.create({
            data: {
                recipientId: providerUser.id,
                title: 'New Document Shared',
                message: messageForProvider,
                type: 'DOCUMENT_SHARED',
                senderId: senderId
            }
        });
        socket_1.io.to(providerUser.id).emit('new_notification', providerNotification);
    }
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, {
        message: "Documents shared with client successfully.",
        data: sharedDocuments
    }, "Fetched."));
}));
exports.documentSharedWithClientApi = documentSharedWithClientApi;
const documentSignByClientApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const { clientId, sharedDocumentId, isAgree, senderId, eSignature } = req.body;
    console.log(">>>>>>>");
    console.log(">>>>>>>");
    console.log(">>>>>>>");
    console.log(">>>>>>>");
    console.log(">>>>>>>");
    console.log(">>>>>>>", req.body);
    console.log(">>>>>>>", clientId, sharedDocumentId, isAgree, senderId, eSignature);
    console.log(">>>>>>>");
    console.log(">>>>>>>");
    console.log(">>>>>>>");
    console.log(">>>>>>>");
    console.log(">>>>>>>");
    if (!clientId || !sharedDocumentId || !eSignature || isAgree === undefined) {
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
    const providerUserId = (_b = (_a = documentUpdated === null || documentUpdated === void 0 ? void 0 : documentUpdated.provider) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.id;
    const clientUserId = senderId; // Client who signed
    const clientName = (_d = (_c = documentUpdated === null || documentUpdated === void 0 ? void 0 : documentUpdated.client) === null || _c === void 0 ? void 0 : _c.user) === null || _d === void 0 ? void 0 : _d.fullName;
    if (!providerUserId || !clientUserId) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, {}, "User IDs missing."));
    }
    const messageForProvider = `Client ${clientName} signed the document.`;
    // 🔔 Create notification for Provider
    const providerNotification = yield db_config_1.default.notification.create({
        data: {
            recipientId: providerUserId,
            senderId: clientUserId,
            title: 'Document Signed',
            message: messageForProvider,
            type: 'DOCUMENT_SIGNED'
        }
    });
    socket_1.io.to(providerUserId).emit('new_notification', providerNotification);
    // 🔔 Create notification for Client
    const clientNotification = yield db_config_1.default.notification.create({
        data: {
            recipientId: clientUserId,
            senderId: clientUserId,
            title: 'Document Signed',
            message: 'You signed the document successfully.',
            type: 'DOCUMENT_SIGNED'
        }
    });
    socket_1.io.to(clientUserId).emit('new_notification', clientNotification);
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
const deleteDocumentApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.body;
    const isDocumentExist = yield db_config_1.default.document.findFirst({ where: { id } });
    if (!isDocumentExist) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { message: "Document not found" }, "Validation failed"));
    }
    const isDocumentDelete = yield db_config_1.default.document.delete({ where: { id } });
    if (isDocumentDelete) {
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { message: "Document has deleted successfully" }, "Success"));
    }
    return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { message: "Internal Server Error. Try Later" }, "Internal Server Error"));
}));
exports.deleteDocumentApi = deleteDocumentApi;
