import { Router } from "express";
import { inviteProviderSignupApi } from "../../controller/invitationEmail/providerInvite.controller";

const router = Router();

router.post("/provider-signup", inviteProviderSignupApi);

export default router;
