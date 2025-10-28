"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chat_controller_1 = require("../../controller/chat/chat.controller");
const chatMedia_1 = __importDefault(require("../../utils/multer/chatMedia"));
const roleCheck_middleware_1 = require("../../middlewares/roleCheck.middleware");
const chatRouter = (0, express_1.Router)();
chatRouter.post("/single-chat/all-messages", (0, roleCheck_middleware_1.authorizeRoles)("provider"), chat_controller_1.getAllSingleConservationMessage);
chatRouter.post("/single-chat/sent-message", chatMedia_1.default.array('mediaUrl'), chat_controller_1.sendMessageToSingleConservation);
chatRouter.post("/single-chat/read-message", chat_controller_1.markMessagesAsRead);
chatRouter.post("/single-chat/get-all-message", chat_controller_1.getAllConversations);
chatRouter.delete("/single-chat/delete-message", chat_controller_1.deleteMessageToSingleConservation);
exports.default = chatRouter;
