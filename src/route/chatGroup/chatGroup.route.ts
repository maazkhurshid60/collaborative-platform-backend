import { Router } from "express";
import { createGroupApi, deleteGroupMessageApi, getAllGroupsApi, getGroupMessageApi, sendMessageToGroupApi, updateGroupApi } from "../../controller/chatGroup/chatGroup.controller";
import { ouRoleCheck } from "../../middlewares/roleCheck.middleware";
import { authJWT } from "../../middlewares/auth.middleware";

const chatGroupRouter = Router()

chatGroupRouter.post("/create-group", authJWT, ouRoleCheck(["provider"]), createGroupApi);
chatGroupRouter.get("/get-group-messages", getGroupMessageApi)
chatGroupRouter.post("/send-message-to-group", sendMessageToGroupApi)
chatGroupRouter.get("/get-all-group", getAllGroupsApi)
chatGroupRouter.patch("/update-group", updateGroupApi)
chatGroupRouter.delete("/delete-group-message", deleteGroupMessageApi)

export default chatGroupRouter
