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
exports.addExistingClientToProvider = exports.updateExistingClientOnLicenseNo = exports.addClient = exports.getTotalClient = exports.updateClient = exports.deletClient = exports.getAllClients = void 0;
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
    const { clientId, providerId } = req.body;
    // 1. Check if client exists
    const client = yield db_config_1.default.client.findUnique({ where: { id: clientId } });
    if (!client) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "Client not found." }, ""));
    }
    // 2. Check if the provider-client relation exists
    const link = yield db_config_1.default.providerOnClient.findFirst({
        where: {
            clientId,
            providerId
        }
    });
    if (!link) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "Client is not linked to this provider." }, ""));
    }
    // 3. Delete the link only (not the actual client/user)
    yield db_config_1.default.providerOnClient.delete({
        where: {
            id: link.id
        }
    });
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, null, "Client removed from your list successfully"));
}));
exports.deletClient = deletClient;
const updateClient = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Convert age to number if provided
    if (req.body.age) {
        req.body.age = Number(req.body.age);
    }
    // Convert boolean string to actual boolean
    if (req.body.isAccountCreatedByOwnClient) {
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";
    }
    // Validate data using Zod schema
    const clientData = client_schema_1.clientSchema.safeParse(req.body);
    if (!clientData.success) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: clientData.error.errors }, "Validation Failed"));
    }
    // Destructure validated data
    const { fullName, gender, age, contactNo, address, status, licenseNo, email, password, clientId, clientShowToOthers, state, country } = clientData.data;
    // Hash password only if provided
    let hashedPassword;
    if (password && password.trim() !== "") {
        hashedPassword = yield bcrypt_1.default.hash(password, 10);
    }
    // Check if client exists
    const isClientExist = yield db_config_1.default.client.findFirst({
        where: { id: clientId },
        include: { user: true }
    });
    if (!isClientExist) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "Client not found" }, "Not found"));
    }
    // Check for duplicate email (excluding current client)
    const isEmailExist = yield db_config_1.default.client.findFirst({
        where: {
            email,
            id: { not: clientId }
        }
    });
    if (isEmailExist) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Email ${email} already taken` }, "Duplicate Error"));
    }
    // Check for duplicate licenseNo (excluding current user)
    const isLicenseNoExists = yield db_config_1.default.user.findFirst({
        where: {
            licenseNo,
            id: { not: isClientExist.userId }
        }
    });
    if (isLicenseNoExists) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `License Number ${licenseNo} already taken` }, "Duplicate Error"));
    }
    // Check for duplicate full name (excluding current user)
    const isFullNameExist = yield db_config_1.default.user.findFirst({
        where: {
            fullName,
            id: { not: isClientExist.userId }
        }
    });
    // Only check for duplicate full name if it was changed
    if (fullName !== isClientExist.user.fullName) {
        const isFullNameExist = yield db_config_1.default.user.findFirst({
            where: {
                fullName,
                id: { not: isClientExist.userId }
            }
        });
        if (isFullNameExist) {
            return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Full Name ${fullName} already taken` }, "Duplicate Error"));
        }
    }
    const clientShowToOthersBool = clientShowToOthers === "true";
    // Prepare client update data
    const updatedClientData = { email, clientShowToOthers: clientShowToOthersBool, };
    if (hashedPassword) {
        updatedClientData.password = hashedPassword;
    }
    // Prepare user update data
    const updatedUserData = {
        fullName,
        gender,
        age,
        contactNo,
        address,
        status,
        licenseNo,
        state, country,
        isApprove: "approve",
        role: client_1.Role.client
    };
    // Handle profile image updates
    if (req.file) {
        // New file uploaded - update with new image path
        const file = req.file;
        updatedUserData.profileImage = file === null || file === void 0 ? void 0 : file.location;
    }
    else if (req.body.profileImage === "null") {
        // Explicit removal requested - set to null
        updatedUserData.profileImage = null;
    }
    // If neither case, profileImage won't be included in update (keeps existing)
    // Update user record
    const isUserUpdated = yield db_config_1.default.user.update({
        where: { id: isClientExist.userId, },
        data: updatedUserData,
    });
    // Update client record
    const isClientUpdated = yield db_config_1.default.client.update({
        where: { id: clientId },
        data: updatedClientData,
    });
    // Combine updated data for response
    const updatedData = Object.assign(Object.assign({}, isUserUpdated), isClientUpdated);
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { updatedData }, "Client updated successfully"));
}));
exports.updateClient = updateClient;
const getTotalClient = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const allClient = yield db_config_1.default.client.findMany({
        include: {
            user: true, recievedDocument: { include: { provider: { include: { user: true } }, document: true } }, providerList: {
                include: {
                    provider: {
                        include: { user: true }
                    }
                }
            }
        }, // Assuming 'user' is related to 'client'
    });
    res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { totalDocument: allClient.length, clients: allClient }, "All Clients fetched successfully"));
}));
exports.getTotalClient = getTotalClient;
const addClient = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (req.body.age)
        req.body.age = Number(req.body.age);
    if (req.body.isAccountCreatedByOwnClient)
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";
    // 1. Validate user schema
    const userParsedData = auth_schema_1.userSchema.safeParse(req.body);
    if (!userParsedData.success) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed"));
    }
    const { fullName, gender = "male", age, contactNo, address, status = "active", licenseNo, role, isApprove, country, state, } = userParsedData.data;
    const { email, password, isAccountCreatedByOwnClient, providerId, clientShowToOthers } = req.body;
    let profileImageUrl = null;
    if (req.file) {
        const file = req.file;
        profileImageUrl = (_a = file.location) !== null && _a !== void 0 ? _a : null;
    }
    // 2. Check if user with licenseNo already exists
    const existingUser = yield db_config_1.default.user.findFirst({ where: { licenseNo } });
    if (existingUser) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, null, "This license number is already registered"));
    }
    // Check for duplicate client email
    const existingClientEmail = yield db_config_1.default.client.findFirst({ where: { email } });
    if (existingClientEmail) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, null, `Email: ${email} is already taken.`));
    }
    // 3. Proceed to create new user
    const userCreated = yield db_config_1.default.user.create({
        data: {
            fullName,
            gender,
            age,
            contactNo,
            address,
            status,
            licenseNo,
            country, state,
            role,
            isApprove,
            profileImage: profileImageUrl
        }
    });
    // 4. If role is client, create client and link provider
    if (role === client_1.Role.client) {
        const clientParsed = client_schema_1.clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed"));
        }
        const hashedPassword = yield bcrypt_1.default.hash(password !== null && password !== void 0 ? password : "", 10);
        const clientShowToOthersBool = clientShowToOthers === "true";
        const clientCreated = yield db_config_1.default.client.create({
            data: {
                userId: userCreated.id,
                isAccountCreatedByOwnClient,
                clientShowToOthers: clientShowToOthersBool,
                email,
                password: hashedPassword
            },
            include: {
                user: true
            }
        });
        if (providerId) {
            yield db_config_1.default.providerOnClient.create({
                data: {
                    providerId,
                    clientId: clientCreated.id
                }
            });
        }
        return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, clientCreated, "Client Data has been sent to the super admin for verification. Client will receive a verification email once approved, after which Client will be able to log in."));
    }
    // 5. If role is not client
    return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, userCreated, "User created successfully"));
}));
exports.addClient = addClient;
const addExistingClientToProvider = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (req.body.age)
        req.body.age = Number(req.body.age);
    if (req.body.isAccountCreatedByOwnClient)
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";
    // 1. Validate user schema
    const userParsedData = auth_schema_1.userSchema.safeParse(req.body);
    if (!userParsedData.success) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed"));
    }
    const { fullName, gender = "male", age, contactNo, address, status = "active", licenseNo, role, isApprove, country, state } = userParsedData.data;
    const { email, password, isAccountCreatedByOwnClient, providerId, clientShowToOthers } = req.body;
    let profileImageUrl = null;
    if (req.file) {
        const file = req.file;
        profileImageUrl = (_a = file.location) !== null && _a !== void 0 ? _a : null;
    }
    // 2. Check if user with licenseNo already exists
    const existingUser = yield db_config_1.default.user.findFirst({ where: { licenseNo } });
    if (existingUser) {
        // Ensure the role is 'client'
        if ((existingUser === null || existingUser === void 0 ? void 0 : existingUser.role) !== client_1.Role.client) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, null, "This license number is registered but not as a client"));
        }
        // Fetch existing client by userId
        const existingClient = yield db_config_1.default.client.findUnique({
            where: { userId: existingUser.id }
        });
        if (!existingClient) {
            return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, null, "Client record not found for existing license number"));
        }
        // Check if already linked to the same provider
        const alreadyLinked = yield db_config_1.default.providerOnClient.findFirst({
            where: {
                clientId: existingClient.id,
                providerId
            }
        });
        if (alreadyLinked) {
            return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, null, "This provider has already added the client"));
        }
        // Link existing client to current provider
        const clientCreated = yield db_config_1.default.providerOnClient.create({
            data: {
                providerId,
                clientId: existingClient.id
            }
        });
        if (isApprove === "pending") {
            return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, clientCreated, "Client Data has been already sent to the super admin for verification. Client will receive a verification email once approved, after which Client will be able to log in."));
        }
        return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, existingClient, "Existing client linked to provider successfully"));
    }
    // 3. Proceed to create new user
    const userCreated = yield db_config_1.default.user.create({
        data: {
            fullName,
            gender,
            age,
            contactNo,
            address,
            status,
            licenseNo,
            role,
            isApprove, country, state,
            profileImage: profileImageUrl
        }
    });
    // 4. If role is client, create client and link provider
    if (role === client_1.Role.client) {
        const clientParsed = client_schema_1.clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed"));
        }
        // Check for duplicate client email
        const existingClientEmail = yield db_config_1.default.client.findFirst({ where: { email } });
        if (existingClientEmail) {
            return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed"));
        }
        const hashedPassword = yield bcrypt_1.default.hash(password !== null && password !== void 0 ? password : "", 10);
        const clientShowToOthersBool = clientShowToOthers === "true";
        const clientCreated = yield db_config_1.default.client.create({
            data: {
                userId: userCreated.id,
                isAccountCreatedByOwnClient,
                clientShowToOthers: clientShowToOthersBool,
                email,
                password: hashedPassword
            },
            include: {
                user: true
            }
        });
        if (providerId) {
            yield db_config_1.default.providerOnClient.create({
                data: {
                    providerId,
                    clientId: clientCreated.id
                }
            });
        }
        return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, clientCreated, "Client created and linked to provider successfully"));
    }
    // 5. If role is not client
    return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, userCreated, "User created successfully"));
}));
exports.addExistingClientToProvider = addExistingClientToProvider;
//logined provider can add existing client(not present in logined provider list) by just one add button click without entering record manually
const updateExistingClientOnLicenseNo = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Validate data
    const clientData = client_schema_1.clientSchema.safeParse(req.body);
    if (!clientData.success) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: clientData.error.errors }, "Validation Failed"));
    }
    let { fullName, gender, age, contactNo, address, status, licenseNo, email, password, clientId } = clientData.data;
    // Normalize email
    email = email.trim().toLowerCase();
    // Hash password if provided
    const hashedPassword = yield bcrypt_1.default.hash(password !== null && password !== void 0 ? password : "", 10);
    // Check if client exists
    const isClientExist = yield db_config_1.default.client.findFirst({ where: { id: clientId } });
    if (!isClientExist) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "Client not found" }, "Not found"));
    }
    // Check for duplicate email only if it's being changed
    if (email !== isClientExist.email.trim().toLowerCase()) {
        const isEmailExist = yield db_config_1.default.client.findFirst({
            where: {
                email: email, // the new email
                id: {
                    not: clientId, // ensure it doesn’t belong to the same client
                },
            },
        });
        if (isEmailExist) {
            return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Email ${email} already taken by another client` }, "Duplicate Email"));
        }
    }
    // Check for duplicate licenseNo
    const isLicenseNoExists = yield db_config_1.default.user.findFirst({
        where: {
            licenseNo,
            id: {
                not: isClientExist.userId
            }
        }
    });
    if (isLicenseNoExists) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `license number ${licenseNo} already taken` }, "Duplicate Error"));
    }
    // Check for duplicate Full Name
    const isFullNameExist = yield db_config_1.default.user.findFirst({
        where: {
            fullName,
            id: {
                not: isClientExist.userId
            }
        }
    });
    if (isFullNameExist) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Full Name ${fullName} already taken` }, "Duplicate Error"));
    }
    // Prepare update data
    const updatedClientData = {
        email,
        password: hashedPassword,
    };
    const updatedUserData = {
        fullName,
        gender,
        age,
        contactNo,
        address,
        status,
        licenseNo,
        role: client_1.Role.client,
    };
    // Update user and client
    const isUserUpdated = yield db_config_1.default.user.update({
        where: { id: isClientExist.userId },
        data: updatedUserData,
    });
    const isClientUpdated = yield db_config_1.default.client.update({
        where: { id: clientId },
        data: updatedClientData,
    });
    if (!isClientUpdated) {
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: "Something went wrong. Try later" }, ""));
    }
    const updatedData = Object.assign(Object.assign({}, isUserUpdated), isClientUpdated);
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { updatedData }, "Client updated successfully"));
}));
exports.updateExistingClientOnLicenseNo = updateExistingClientOnLicenseNo;
