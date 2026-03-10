import { Router } from "express";
import { getAllSingleConservationMessage, sendMessageToSingleConservation, deleteMessageToSingleConservation, getAllConversations, markMessagesAsRead, deleteChatChannelForUser, shareChatByEmail } from "../../controller/chat/chat.controller";
import uploadChatMedia from "../../utils/multer/chatMedia";
import { authorizeRoles } from "../../middlewares/roleCheck.middleware";

const chatRouter = Router()
chatRouter.post("/single-chat/all-messages", authorizeRoles("provider"), getAllSingleConservationMessage)
chatRouter.post("/single-chat/sent-message", uploadChatMedia.array('mediaUrl'), sendMessageToSingleConservation)
chatRouter.post("/single-chat/read-message", markMessagesAsRead)
chatRouter.post("/single-chat/get-all-message", getAllConversations)
chatRouter.post("/single-chat/share-chat", shareChatByEmail)
chatRouter.delete("/single-chat/delete-message", deleteMessageToSingleConservation)
chatRouter.delete("/single-chat/delete-channel", deleteChatChannelForUser)

export default chatRouter