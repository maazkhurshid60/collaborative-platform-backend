"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chatChannel_controller_1 = require("../../controller/chatChannel/chatChannel.controller");
const chatChannelRouter = (0, express_1.Router)();
chatChannelRouter.post("/create-chat-channel", chatChannel_controller_1.createChatChannel);
exports.default = chatChannelRouter;
