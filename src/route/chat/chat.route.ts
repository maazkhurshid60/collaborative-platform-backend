import { Router } from "express";
import { getAllSingleConservationMessage, sendMessageToSingleConservation, deleteMessageToSingleConservation } from "../../controller/chat/chat.controller";

const chatRouter = Router()
chatRouter.post("/single-chat/all-messages", getAllSingleConservationMessage)
chatRouter.post("/single-chat/sent-message", sendMessageToSingleConservation)
chatRouter.delete("/single-chat/delete-message", deleteMessageToSingleConservation)

export default chatRouter