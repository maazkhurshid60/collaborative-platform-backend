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
exports.findByCNIC = exports.getAllUsersApi = exports.getMeApi = exports.deleteMeAccountApi = exports.updateMeApi = exports.logoutApi = exports.unblockUserApi = exports.blockUserApi = exports.logInApi = exports.signupApi = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const auth_schema_1 = require("../../schema/auth/auth.schema");
const apiResponse_1 = require("../../utils/apiResponse");
const http_status_codes_1 = require("http-status-codes");
const db_config_1 = __importDefault(require("../../db/db.config"));
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const constants_1 = require("../../utils/constants");
const signupApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Validate User Schema
    const userParsedData = auth_schema_1.userSchema.safeParse(req.body);
    if (!userParsedData.success) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed"));
    }
    //get data for user
    const { fullName, gender = "male", age, contactNo, address, status = "active", cnic, role } = userParsedData.data;
    // Check if User Exists
    const existingUser = yield db_config_1.default.user.findFirst({ where: { cnic } });
    if (existingUser) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `CNIC ${cnic} is already registered.` }, "Validation failed"));
    }
    const userData = {
        fullName, gender, age, contactNo, address, status, cnic, role
    };
    if (gender !== undefined)
        userData.gender = gender;
    if (age !== undefined)
        userData.age = age;
    if (contactNo !== undefined)
        userData.contactNo = contactNo;
    if (address !== undefined)
        userData.address = address;
    if (status !== undefined)
        userData.status = status;
    const userCreated = yield db_config_1.default.user.create({
        data: userData,
    });
    // Handle Client Signup
    if (role === client_1.Role.client) {
        const clientParsed = auth_schema_1.clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed"));
        }
        //get client data
        const { isAccountCreatedByOwnClient, email, password } = clientParsed.data;
        //check duplicate client
        const existingClient = yield db_config_1.default.client.findFirst({ where: { email } });
        if (existingClient) {
            return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed"));
        }
        //hashing the client's password
        const hashedPassword = yield bcrypt_1.default.hash(password !== null && password !== void 0 ? password : "", 10);
        const clientCreated = yield db_config_1.default.client.create({ data: { userId: userCreated.id, isAccountCreatedByOwnClient, email, password: hashedPassword }, include: { user: true } });
        return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, clientCreated, "User created successfully"));
    }
    // Handle Provider Signup
    else if (role === client_1.Role.provider) {
        const providerParsed = auth_schema_1.providerSchema.safeParse(req.body);
        if (!providerParsed.success) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: providerParsed.error.errors }, "Validation failed"));
        }
        const { department, email, password } = providerParsed.data;
        const existingUserByEmail = yield db_config_1.default.provider.findFirst({ where: { email } });
        if (existingUserByEmail) {
            return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Email ${email} is already registered.` }, "Validation failed"));
        }
        const hashedPassword = yield bcrypt_1.default.hash(password !== null && password !== void 0 ? password : "", 10);
        const existingProvider = yield db_config_1.default.provider.findFirst({ where: { email } });
        if (existingProvider) {
            return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed"));
        }
        const providerCreated = yield db_config_1.default.provider.create({ data: { userId: userCreated.id, department, email, password: hashedPassword }, include: { user: true } });
        return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, providerCreated, "User created successfully"));
    }
}));
exports.signupApi = signupApi;
const updateMeApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Validate User Schema
    const userParsedData = auth_schema_1.userSchema.safeParse(req.body);
    if (!userParsedData.success) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed"));
    }
    console.log(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,", req.body);
    const { loginUserId } = req.body;
    const isUserExist = yield db_config_1.default.user.findFirst({ where: { id: loginUserId } });
    //Check user exist 
    if (!isUserExist) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "User is not exist." }, "Not Found Error."));
    }
    const { fullName, gender, age, contactNo, address, status, cnic, role } = userParsedData.data;
    // Update User
    const updatedUser = yield db_config_1.default.user.update({
        where: { id: loginUserId },
        data: { fullName, gender, age, contactNo, address, status, cnic, role }
    });
    // Handle Client Signup
    if (role === client_1.Role.client) {
        const clientParsed = auth_schema_1.clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed"));
        }
        const { email, password } = clientParsed.data;
        const existingClient = yield db_config_1.default.client.findFirst({ where: { email, NOT: { userId: loginUserId } } });
        if (existingClient) {
            return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed"));
        }
        const hashedPassword = yield bcrypt_1.default.hash(password !== null && password !== void 0 ? password : "", 10);
        const clientUpdate = yield db_config_1.default.client.update({ where: { userId: loginUserId }, data: { email, password: hashedPassword }, include: { user: true } });
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, clientUpdate, "User updated successfully"));
    } // Handle Provider Signup
    else if (role === client_1.Role.provider) {
        const providerParsed = auth_schema_1.providerSchema.safeParse(req.body);
        if (!providerParsed.success) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: providerParsed.error.errors }, "Validation failed"));
        }
        const { email, password, department } = providerParsed.data;
        const existingProvider = yield db_config_1.default.provider.findFirst({ where: { email, NOT: { userId: loginUserId } } });
        if (existingProvider) {
            return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed"));
        }
        let hashedPassword;
        if (password) {
            hashedPassword = yield bcrypt_1.default.hash(password, 10);
        }
        const providerUpdate = yield db_config_1.default.provider.update({ where: { userId: loginUserId }, data: { email, password: hashedPassword, department }, include: { user: true } });
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, providerUpdate, "User updated successfully"));
    }
}));
exports.updateMeApi = updateMeApi;
const logInApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // Validate request body with Zod
    const parsedLoginData = auth_schema_1.loginSchema.safeParse(req.body);
    if (!parsedLoginData.success) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: parsedLoginData.error.errors }, "Validation failed"));
    }
    // Extract email and password
    const { email, password } = parsedLoginData.data;
    // Check if user exists in 'client' or 'provider'
    const user = (yield db_config_1.default.provider.findFirst({ where: { email }, include: { user: true } }))
        || (yield db_config_1.default.client.findFirst({ where: { email }, include: { user: true } }));
    if (!user) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: `Email: ${email} not found` }, "Validation failed"));
    }
    // Check if password is null (for clients where password may be optional)
    if (!user.password) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: "Password not set for this account" }, "Validation failed"));
    }
    // Verify password
    const isPasswordValid = yield bcrypt_1.default.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(http_status_codes_1.StatusCodes.UNAUTHORIZED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.UNAUTHORIZED, { error: "Password is wrong" }, "Authentication failed"));
    }
    // Determine the role based on the user type (this was corrected)
    const role = ((_a = user === null || user === void 0 ? void 0 : user.user) === null || _a === void 0 ? void 0 : _a.role) === "provider" ? "provider" : "client";
    // Generate JWT Token
    const jwtSecret = process.env.JWT_SECRET || "default_secret"; // Ensure this is set in the environment
    const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, role }, jwtSecret, { expiresIn: "7d" } // Token expires in 7 days
    );
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { token, user }, "Login successful"));
}));
exports.logInApi = logInApi;
const blockUserApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { blockUserid, loginUserId } = req.body;
    // 1. Check if block user exists
    const isBlockUserExist = yield db_config_1.default.user.findUnique({ where: { id: blockUserid } });
    if (!isBlockUserExist) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: "User to be blocked not found" }, "Validation failed"));
    }
    // 2. Get login user (who wants to block someone)
    const loginUser = yield db_config_1.default.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: "Blocking user not found" }, "Validation failed"));
    }
    // 3. If already blocked, return early
    if (loginUser.blockedMembers.includes(blockUserid)) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: "User is already blocked" }, "Already blocked"));
    }
    // 4. Add blockUserid to blockedMembers list
    const updatedBlockedMembers = [...loginUser.blockedMembers, blockUserid];
    console.log("updatedBlockedMembers", updatedBlockedMembers);
    // 5. Update user
    const updatedUser = yield db_config_1.default.user.update({
        where: { id: loginUserId },
        data: {
            blockedMembers: updatedBlockedMembers,
        },
    });
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { user: updatedUser }, "User blocked successfully"));
}));
exports.blockUserApi = blockUserApi;
const getAllUsersApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const allUsers = yield db_config_1.default.user.findMany();
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { totalDocument: allUsers.length, user: allUsers }, "User fetched successfully"));
}));
exports.getAllUsersApi = getAllUsersApi;
const unblockUserApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { blockUserid, loginUserId } = req.body;
    // 1. Check if block user exists
    const isBlockUserExist = yield db_config_1.default.user.findUnique({ where: { id: blockUserid } });
    if (!isBlockUserExist) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: "User to be blocked not found" }, "Validation failed"));
    }
    // 2. Get login user (who wants to block someone)
    const loginUser = yield db_config_1.default.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: "Blocking user not found" }, "Validation failed"));
    }
    const updatedBlockedMembersList = (_a = loginUser.blockedMembers) === null || _a === void 0 ? void 0 : _a.filter(data => data !== blockUserid);
    const updatedUser = yield db_config_1.default.user.update({
        where: { id: loginUserId },
        data: {
            blockedMembers: updatedBlockedMembersList,
        },
    });
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { user: updatedUser }, "User unblocked successfully"));
}));
exports.unblockUserApi = unblockUserApi;
const logoutApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Clearing the cookies by setting them to empty with an expiration time in the past
    return res
        .clearCookie("accessToken", constants_1.cookiesOptions)
        .clearCookie("refreshToken", constants_1.cookiesOptions)
        .status(200)
        .json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, {}, "Logout successful"));
}));
exports.logoutApi = logoutApi;
const deleteMeAccountApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loginUserId } = req.body;
    console.log("id>>>>>>>>", loginUserId);
    const isUserExist = yield db_config_1.default.user.findFirst({ where: { id: loginUserId } });
    console.log(">>>>>>>>>>", isUserExist);
    if (!isUserExist) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error"));
    }
    console.log("<<<<<<<<<<<", loginUserId);
    const isUserDeleted = yield db_config_1.default.user.delete({ where: { id: loginUserId } });
    console.log(">>>>>>>>>>>>>>>", isUserDeleted);
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { message: "" }, "User deleted successfully"));
}));
exports.deleteMeAccountApi = deleteMeAccountApi;
const getMeApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loginUserId, role } = req.body;
    let getMeDetails;
    // Handle Client
    if (role === client_1.Role.client) {
        getMeDetails = yield db_config_1.default.client.findFirst({ where: { id: loginUserId }, include: { user: true } });
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { data: getMeDetails }, "OK"));
    }
    // Handle Provider
    else if (role === client_1.Role.provider) {
        getMeDetails = yield db_config_1.default.provider.findFirst({ where: { id: loginUserId }, include: { user: true } });
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { data: getMeDetails }, "OK"));
    }
}));
exports.getMeApi = getMeApi;
const findByCNIC = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { cnic } = req.body;
    if (cnic === "") {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { message: " CNIC isrequired" }, "Validation failed"));
    }
    const cnicFound = yield db_config_1.default.user.findFirst({
        where: { cnic }, include: { client: true }
    });
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { data: cnicFound }, "Record found."));
}));
exports.findByCNIC = findByCNIC;
