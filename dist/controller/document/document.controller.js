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
    const { url, name } = req.body;
    const isDocumentUrlSame = yield db_config_1.default.document.findFirst({ where: { url } });
    if (isDocumentUrlSame) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "This document has already uploaded." }, "Duplicate Error."));
    }
    const isDocumentNameSame = yield db_config_1.default.document.findFirst({ where: { name } });
    if (isDocumentNameSame) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "This document's name has already exist." }, "Duplicate Error."));
    }
    const documentCreated = yield db_config_1.default.document.create({
        data: {
            url, name
        }
    });
    if (!documentCreated) {
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: "Something went wrong." }, "Internal Server Error."));
    }
    return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, { message: "Document has uploaded successfully.", data: documentCreated }, "Created."));
}));
exports.addDocumentApi = addDocumentApi;
const getAllDocumentApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const recordPerPage = parseInt(req.query.recordPerPage) || 10;
    const currentPage = parseInt(req.query.currentPage) || 1;
    const skip = (currentPage - 1) * recordPerPage;
    const take = recordPerPage;
    const allDocument = yield db_config_1.default.document.findMany({
        skip,
        take,
        orderBy: {
            createdAt: 'desc', // Optional: latest first
        },
    });
    const totalDocuments = yield db_config_1.default.document.count();
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, {
        message: "Documents fetched successfully.",
        pagination: {
            total: totalDocuments,
            currentPage,
            recordPerPage,
            totalPages: Math.ceil(totalDocuments / recordPerPage),
        },
        data: allDocument,
    }, "Fetched."));
}));
exports.getAllDocumentApi = getAllDocumentApi;
const documentSharedWithClientApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { providerId, clientId, documentId } = req.body;
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
const documentSignByClientApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { clientId, sharedDocumentId, eSignature, isAgree } = req.body;
    // Validate required fields
    if (!clientId || !sharedDocumentId || !eSignature || typeof isAgree !== "boolean") {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: "Missing or invalid input fields." }, "Bad Request"));
    }
    // Check if shared document exists & belongs to client
    const isShareDocumentExist = yield db_config_1.default.documentShareWith.findFirst({
        where: {
            id: sharedDocumentId,
            clientId: clientId, // validate ownership
        }
    });
    if (!isShareDocumentExist) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "Document not found or not assigned to this client." }, "Not Found"));
    }
    // Update response
    const documentUpdated = yield db_config_1.default.documentShareWith.update({
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
    const getAllSharedDocument = yield db_config_1.default.documentShareWith.findMany({ where: { clientId } });
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, {
        message: "Data fetched successfully.",
        data: getAllSharedDocument
    }, "Success"));
}));
exports.getAllSharedDocumentWithClientApi = getAllSharedDocumentWithClientApi;
