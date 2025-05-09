import { Router } from "express";
import { getAllSingleConservationMessage, sendMessageToSingleConservation, deleteMessageToSingleConservation, getAllConversations, markMessagesAsRead } from "../../controller/chat/chat.controller";

const chatRouter = Router()
chatRouter.post("/single-chat/all-messages", getAllSingleConservationMessage)
chatRouter.post("/single-chat/sent-message", sendMessageToSingleConservation)
chatRouter.post("/single-chat/read-message", markMessagesAsRead)
chatRouter.post("/single-chat/get-all-message", getAllConversations)
chatRouter.delete("/single-chat/delete-message", deleteMessageToSingleConservation)

export default chatRouter