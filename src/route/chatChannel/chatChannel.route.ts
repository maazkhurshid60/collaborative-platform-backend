import { Router } from "express";
import { createChatChannel, getAllChatChannel } from "../../controller/chatChannel/chatChannel.controller";

const chatChannelRouter = Router()
chatChannelRouter.post("/create-chat-channel", createChatChannel)
chatChannelRouter.post("/get-all-chat-channel", getAllChatChannel)

export default chatChannelRouter