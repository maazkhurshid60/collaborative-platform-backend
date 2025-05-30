import { Router } from "express";
import { sendInvitationEmailApi } from "../../controller/invitationEmail/invitationEmail.controller";


const invitationEmailRouter = Router()

invitationEmailRouter.post("/invite-someone", sendInvitationEmailApi)
export default invitationEmailRouter
