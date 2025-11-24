import { Router } from "express";
import { getAllPublicSingleConservationMessage } from "../../controller/chat/chat.controller";
import { getPublicGroupMessageApi } from "../../controller/chatGroup/chatGroup.controller";
const publicChatRouter = Router();
publicChatRouter.post(
  "/single-chat/all-messages",
  getAllPublicSingleConservationMessage,
);
publicChatRouter.post(
  "/get-group-messages",
  getPublicGroupMessageApi,
);
export default publicChatRouter;
