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
exports.getAllChatChannel = exports.createChatChannel = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const db_config_1 = __importDefault(require("../../db/db.config"));
const http_status_codes_1 = require("http-status-codes");
const apiResponse_1 = require("../../utils/apiResponse");
const createChatChannel = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { providerId, toProviderId } = req.body;
    if (!providerId || !toProviderId) {
        return res.status(400).json({ message: 'Both providerId and toProviderId are required.' });
    }
    const [a, b] = [providerId, toProviderId].sort();
    try {
        // Ensure both providers exist in the database
        const providerA = yield db_config_1.default.provider.findUnique({ where: { id: a } });
        const providerB = yield db_config_1.default.provider.findUnique({ where: { id: b } });
        if (!providerA || !providerB) {
            return res.status(400).json({ message: 'One or both providers do not exist.' });
        }
        // Check if a chat channel between the two providers already exists
        let channel = yield db_config_1.default.chatChannel.findFirst({
            where: { providerAId: a, providerBId: b }
        });
        if (!channel) {
            // If the channel does not exist, create it
            channel = yield db_config_1.default.chatChannel.create({
                data: {
                    providerAId: a,
                    providerBId: b
                }
            });
            return res.status(http_status_codes_1.StatusCodes.CREATED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.CREATED, { channel }, "Chat Channel created"));
        }
        // If the channel already exists, return the existing one
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { channel }, "Chat Channel already exists"));
    }
    catch (err) {
        return res.status(500).json({ message: 'Error creating chat channel', error: err });
    }
}));
exports.createChatChannel = createChatChannel;
const getAllChatChannel = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { loginUserId } = req.body;
    const findAllChatChannel = yield db_config_1.default.chatChannel.findMany({
        where: {
            OR: [
                { providerAId: loginUserId },
                { providerBId: loginUserId }
            ]
        },
        include: {
            providerA: { include: { user: true } },
            providerB: { include: { user: true } },
        }
    });
    return res
        .status(http_status_codes_1.StatusCodes.OK)
        .json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { findAllChatChannel }, "Chat Channels fetched successfully"));
}));
exports.getAllChatChannel = getAllChatChannel;
