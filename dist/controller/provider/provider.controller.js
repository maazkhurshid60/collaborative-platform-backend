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
exports.updateProvider = exports.deletProvider = exports.getAllProviders = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const db_config_1 = __importDefault(require("../../db/db.config"));
const http_status_codes_1 = require("http-status-codes");
const apiResponse_1 = require("../../utils/apiResponse");
const client_1 = require("@prisma/client");
const provider_schema_1 = require("../../schema/provider/provider.schema");
const getAllProviders = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loginUserId } = req.body;
    // Get the login user details
    const loginUser = yield db_config_1.default.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "User not found" }, "Validation failed"));
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const allProviders = yield db_config_1.default.provider.findMany({ skip, take: limit, include: { user: true, sharedDocument: { include: { document: true, client: { include: { user: true } } } } } });
    const filteredProviders = allProviders.filter(provider => !loginUser.blockedMembers.includes(provider.user.id));
    const totalDocument = filteredProviders.length;
    res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { totalDocument: totalDocument, providers: filteredProviders }, "All Providers fetched successfully"));
}));
exports.getAllProviders = getAllProviders;
const deletProvider = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { providerId } = req.body;
    const isProviderExist = yield db_config_1.default.provider.findFirst({ where: { id: providerId } });
    if (!isProviderExist) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "Provider does not exist." }, ""));
    }
    const isProviderDeleted = yield db_config_1.default.provider.delete({ where: { id: providerId } });
    if (!isProviderDeleted) {
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: "Internal Server Error." }, ""));
    }
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { isProviderDeleted }, `${isProviderDeleted.email} deleted successfully`));
}));
exports.deletProvider = deletProvider;
const updateProvider = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Validate data
    const providerData = provider_schema_1.providerSchema.safeParse(req.body);
    if (!providerData.success) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.BAD_REQUEST, { error: providerData.error.errors }, "Validation Failed"));
    }
    const { fullName, gender, age, contactNo, address, status, cnic, email, password, providerId, department } = providerData.data;
    const isProviderExist = yield db_config_1.default.provider.findFirst({ where: { id: providerId } });
    if (!isProviderExist) {
        return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.NOT_FOUND, { error: "Provider not found" }, "Not found"));
    }
    const isEmailExist = yield db_config_1.default.provider.findFirst({
        where: {
            email,
            id: {
                not: providerId
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
                not: isProviderExist.userId
            }
        }
    });
    if (isCnicExists) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `CNIC ${cnic} already taken` }, "Duplicate Error"));
    }
    const isFullNameExist = yield db_config_1.default.user.findFirst({ where: { fullName, id: { not: isProviderExist.userId } } });
    if (isFullNameExist) {
        return res.status(http_status_codes_1.StatusCodes.CONFLICT).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CONFLICT, { error: `Full Name ${fullName} already taken` }, "Duplicate Error"));
    }
    const updatedproviderData = { email, department };
    const updatedUserData = { fullName, gender, age, contactNo, address, status, cnic, role: client_1.Role.provider };
    const isUserUpdated = yield db_config_1.default.user.update({
        where: { id: isProviderExist.userId },
        data: updatedUserData,
    });
    const isProviderUpdated = yield db_config_1.default.provider.update({
        where: { id: providerId },
        data: updatedproviderData,
    });
    const updatedData = Object.assign(Object.assign({}, isUserUpdated), isProviderUpdated);
    if (!isProviderUpdated) {
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: "Something went wrong. Try later" }, ""));
    }
    return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { updatedData }, "Provider updated successfully"));
}));
exports.updateProvider = updateProvider;
