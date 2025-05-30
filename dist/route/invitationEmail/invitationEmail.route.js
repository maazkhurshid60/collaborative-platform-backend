"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const invitationEmail_controller_1 = require("../../controller/invitationEmail/invitationEmail.controller");
const invitationEmailRouter = (0, express_1.Router)();
invitationEmailRouter.post("/invite-someone", invitationEmail_controller_1.sendInvitationEmailApi);
exports.default = invitationEmailRouter;
