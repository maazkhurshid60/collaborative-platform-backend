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
exports.updateExistingClientOnCNIC = exports.addClient = exports.getTotalClient = exports.updateClient = exports.deletClient = exports.getAllClients = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const db_config_1 = __importDefault(require("../../db/db.config"));
const http_status_codes_1 = require("http-status-codes");
const apiResponse_1 = require("../../utils/apiResponse");
const client_schema_1 = require("../../schema/client/client.schema");
const client_1 = require("@prisma/client");
const auth_schema_1 = require("../../schema/auth/auth.schema");
const bcrypt_1 = __importDefault(require("bcrypt"));
const getAllClients = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loginUserId } = req.body;
    // 1. Get the login user details
    const loginUser = yield db_config_1.default.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "User not found" }, "Validation failed"));
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    // 2. Get all clients with user info, documents, and provider list
    const allClients = yield db_config_1.default.client.findMany({
        skip,
        take: limit,
        orderBy: {
            createdAt: 'desc' // 👈 Get latest first
        },
        include: {
            user: true,
            recievedDocument: {
                include: {
                    provider: {
                        include: { user: true }
                    },
                    document: true
                }
            },
            providerList: {
                include: {
                    provider: {
                        include: { user: true }
                    }
                }
            }
        }
    });
    // 3. Filter out clients that are blocked by the logged-in user
    let filteredClients = allClients.filter(client => !loginUser.blockedMembers.includes(client.user.id) &&
        !client.user.blockedMembers.includes(loginUser.id));
    const totalDocument = filteredClients.length;
    // 4. Return the filtered clients with associated providers
    res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { totalDocument, clients: filteredClients }, "All Clients fetched successfully"));
}));
exports.getAllClients = getAllClients;
const deletClient = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { clientId } = req.body;
    const isClientExist = yield db_config_1.default.user.findFirst({ where: { id: clientId } });
    console.log("clientid", isClientExist);
    if (!isClientExist) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "Client does not exist." }, ""));
    }
    const isClientDeleted = yield db_config_1.default.user.delete({ where: { id: clientId } });
    if (!isClientDeleted) {
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: "Internal Server Error." }, ""));
    }
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { isClientDeleted }, `${isClientDeleted.fullName} deleted successfully`));
}));
exports.deletClient = deletClient;
const updateClient = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Validate data
    const clientData = client_schema_1.clientSchema.safeParse(req.body);
    if (!clientData.success) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: clientData.error.errors }, "Validation Failed"));
    }
    const { fullName, gender, age, contactNo, address, status, cnic, email, password, clientId } = clientData.data;
    // Hash password if provided
    const hashedPassword = yield bcrypt_1.default.hash(password !== null && password !== void 0 ? password : "", 10);
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
    const updatedClientData = { email, password: hashedPassword };
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
const getTotalClient = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const allClient = yield db_config_1.default.client.findMany({
        include: { user: true, recievedDocument: { include: { provider: { include: { user: true } }, document: true } } }, // Assuming 'user' is related to 'client'
    });
    res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { totalDocument: allClient.length, providers: allClient }, "All Providers fetched successfully"));
}));
exports.getTotalClient = getTotalClient;
const addClient = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // 1. Validate user schema
    const userParsedData = auth_schema_1.userSchema.safeParse(req.body);
    if (!userParsedData.success) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed"));
    }
    const { fullName, gender = "male", age, contactNo, address, status = "active", cnic, role } = userParsedData.data;
    // 2. Check for duplicate CNIC
    const existingUser = yield db_config_1.default.user.findFirst({ where: { cnic } });
    if (existingUser) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `CNIC ${cnic} is already registered.` }, "Validation failed"));
    }
    // 3. Create User
    const userData = { fullName, gender, age, contactNo, address, status, cnic, role };
    const userCreated = yield db_config_1.default.user.create({ data: userData });
    // 4. Handle Client Signup
    if (role === client_1.Role.client) {
        const clientParsed = client_schema_1.clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed"));
        }
        const { isAccountCreatedByOwnClient, email, password, providerId } = clientParsed.data;
        // Check for duplicate client email
        const existingClient = yield db_config_1.default.client.findFirst({ where: { email } });
        if (existingClient) {
            return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed"));
        }
        // Hash password if provided
        const hashedPassword = yield bcrypt_1.default.hash(password !== null && password !== void 0 ? password : "", 10);
        // 5. Create Client
        const clientCreated = yield db_config_1.default.client.create({
            data: {
                userId: userCreated.id,
                isAccountCreatedByOwnClient,
                email,
                password: hashedPassword
            },
            include: {
                user: true
            }
        });
        // 6. Link provider to client
        if (providerId) {
            yield db_config_1.default.providerOnClient.create({
                data: {
                    providerId,
                    clientId: clientCreated === null || clientCreated === void 0 ? void 0 : clientCreated.id
                }
            });
        }
        return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, clientCreated, "Client created and linked to provider successfully"));
    }
    // 7. If not client role (e.g. provider role), return success
    return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, userCreated, "User created successfully"));
}));
exports.addClient = addClient;
const updateExistingClientOnCNIC = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Validate data
    const clientData = client_schema_1.clientSchema.safeParse(req.body);
    if (!clientData.success) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: clientData.error.errors }, "Validation Failed"));
    }
    const { fullName, gender, age, contactNo, address, status, cnic, email, password, clientId } = clientData.data;
    // Hash password if provided
    const hashedPassword = yield bcrypt_1.default.hash(password !== null && password !== void 0 ? password : "", 10);
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
    const updatedClientData = { email, password: hashedPassword };
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
exports.updateExistingClientOnCNIC = updateExistingClientOnCNIC;
