"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chatChannel_controller_1 = require("../../controller/chatChannel/chatChannel.controller");
const chatChannelRouter = (0, express_1.Router)();
chatChannelRouter.post("/create-chat-channel", chatChannel_controller_1.createChatChannel);
chatChannelRouter.post("/get-all-chat-channel", chatChannel_controller_1.getAllChatChannel);
chatChannelRouter.delete("/delete-chat-channel", chatChannel_controller_1.deleteChatChannel);
exports.default = chatChannelRouter;
