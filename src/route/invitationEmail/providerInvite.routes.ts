import { Router } from "express";
import { inviteProviderSignupApi } from "../../controller/invitationEmail/providerInvite.controller";

const router = Router();

// POST /invites/provider-signup
router.post("/provider-signup", inviteProviderSignupApi);

export default router;
