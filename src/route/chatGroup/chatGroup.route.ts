import { Router } from "express";
import {
  createGroupApi,
  deleteGroupChannel,
  getAllGroupsApi,
  getGroupMessageApi,
  sendMessageToGroupApi,
  updateGroupApi,
  shareGroupChatByEmail,
  addExistingProvidersToGroupApi,
  updateGroupPermissionsApi,
} from "../../controller/chatGroup/chatGroup.controller";
import { authJWT } from "../../middlewares/auth.middleware";
import { markMessagesAsRead } from "../../controller/chat/chat.controller";
import uploadChatMedia from "../../utils/multer/chatMedia";

const chatGroupRouter = Router();

chatGroupRouter.post("/create-group", authJWT, createGroupApi);
chatGroupRouter.post("/get-group-messages", getGroupMessageApi);
chatGroupRouter.post(
  "/send-message-to-group",
  uploadChatMedia.array("mediaUrl"),
  sendMessageToGroupApi,
);
chatGroupRouter.post("/get-all-group", getAllGroupsApi);
chatGroupRouter.post("/share-group-chat", shareGroupChatByEmail);
chatGroupRouter.post("/read-message", markMessagesAsRead);
chatGroupRouter.patch("/update-group", updateGroupApi);
chatGroupRouter.patch("/add-members", authJWT, addExistingProvidersToGroupApi);
chatGroupRouter.patch("/permissions", authJWT, updateGroupPermissionsApi);
chatGroupRouter.delete("/delete-group-message", deleteGroupChannel);

export default chatGroupRouter;
