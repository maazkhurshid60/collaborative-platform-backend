"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chat_controller_1 = require("../../controller/chat/chat.controller");
const chatRouter = (0, express_1.Router)();
chatRouter.get("/single-chat/all-messages", chat_controller_1.getAllSingleConservationMessage);
chatRouter.post("/single-chat/sent-message", chat_controller_1.sendMessageToSingleConservation);
chatRouter.delete("/single-chat/delete-message", chat_controller_1.deleteMessageToSingleConservation);
exports.default = chatRouter;
