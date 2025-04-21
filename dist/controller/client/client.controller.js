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
exports.updateClient = exports.deletClient = exports.getAllClients = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const db_config_1 = __importDefault(require("../../db/db.config"));
const http_status_codes_1 = require("http-status-codes");
const apiResponse_1 = require("../../utils/apiResponse");
const client_schema_1 = require("../../schema/client/client.schema");
const client_1 = require("@prisma/client");
const getAllClients = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loginUserId } = req.body;
    // Get the login user details
    const loginUser = yield db_config_1.default.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "User not found" }, "Validation failed"));
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    // Get all clients with pagination and user data included
    const allClients = yield db_config_1.default.client.findMany({
        include: { user: true, recievedDocument: { include: { provider: { include: { user: true } }, document: true } } }, // Assuming 'user' is related to 'client'
    });
    // Filter out clients that are blocked by the logged-in user
    let filteredClients = allClients.filter(client => {
        // Make sure you're accessing 'user.id' within each 'client'
        return !loginUser.blockedMembers.includes(client.user.id); // Assuming 'client.user.id' is correct
    });
    filteredClients = filteredClients === null || filteredClients === void 0 ? void 0 : filteredClients.filter(client => !client.user.blockedMembers.includes(loginUser.id));
    const totalDocument = filteredClients.length;
    // Return the filtered clients
    res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { totalDocument, clients: filteredClients }, "All Clients fetched successfully"));
}));
exports.getAllClients = getAllClients;
const deletClient = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { clientId } = req.body;
    const isClientExist = yield db_config_1.default.client.findFirst({ where: { id: clientId } });
    if (!isClientExist) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "Client does not exist." }, ""));
    }
    const isClientDeleted = yield db_config_1.default.client.delete({ where: { id: clientId } });
    if (!isClientDeleted) {
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: "Internal Server Error." }, ""));
    }
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { isClientDeleted }, `${isClientDeleted.email} deleted successfully`));
}));
exports.deletClient = deletClient;
const updateClient = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Validate data
    const clientData = client_schema_1.clientSchema.safeParse(req.body);
    if (!clientData.success) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: clientData.error.errors }, "Validation Failed"));
    }
    const { fullName, gender, age, contactNo, address, status, cnic, email, password, clientId } = clientData.data;
    const isClientExist = yield db_config_1.default.client.findFirst({ where: { id: clientId } });
    if (!isClientExist) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "Client not found" }, "Not found"));
    }
    const isEmailExist = yield db_config_1.default.client.findFirst({
        where: {
            email,
            id: {
                not: clientId
            }
        }
    });
    if (isEmailExist) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Email ${email} already taken` }, "Duplicate Error"));
    }
    const isCnicExists = yield db_config_1.default.user.findFirst({
        where: {
            cnic,
            id: {
                not: isClientExist.userId
            }
        }
    });
    if (isCnicExists) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `CNIC ${cnic} already taken` }, "Duplicate Error"));
    }
    const isFullNameExist = yield db_config_1.default.user.findFirst({ where: { fullName, id: { not: isClientExist.userId } } });
    if (isFullNameExist) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Full Name ${fullName} already taken` }, "Duplicate Error"));
    }
    const updatedClientData = { email };
    const updatedUserData = { fullName, gender, age, contactNo, address, status, cnic, role: client_1.Role.client };
    const isUserUpdated = yield db_config_1.default.user.update({
        where: { id: isClientExist.userId },
        data: updatedUserData,
    });
    const isClientUpdated = yield db_config_1.default.client.update({
        where: { id: clientId },
        data: updatedClientData,
    });
    const updatedData = Object.assign(Object.assign({}, isUserUpdated), isClientUpdated);
    if (!isClientUpdated) {
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: "Something went wrong. Try later" }, ""));
    }
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { updatedData }, "Client updated successfully"));
}));
exports.updateClient = updateClient;
