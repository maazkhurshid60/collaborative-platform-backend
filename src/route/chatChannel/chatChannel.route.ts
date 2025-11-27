import { Router } from "express";
import { createChatChannel, getAllChatChannel, deleteChatChannel } from "../../controller/chatChannel/chatChannel.controller";

const chatChannelRouter = Router()
chatChannelRouter.post("/create-chat-channel", createChatChannel)
chatChannelRouter.post("/get-all-chat-channel", getAllChatChannel)
chatChannelRouter.delete("/delete-chat-channel", deleteChatChannel)
export default chatChannelRouter

