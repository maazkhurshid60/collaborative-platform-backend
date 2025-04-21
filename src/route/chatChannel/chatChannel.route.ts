import { Router } from "express";
import { createChatChannel } from "../../controller/chatChannel/chatChannel.controller";

const chatChannelRouter = Router()
chatChannelRouter.post("/create-chat-channel", createChatChannel)

export default chatChannelRouter