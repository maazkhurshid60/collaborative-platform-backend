import { Router } from "express";
import { authJWT } from "../../middlewares/auth.middleware";

import {
  changePasswordApi,
  forgotPasswordApi,
  logInApi,
  logoutApi,
  resetPasswordApi,
  signupApi,
  startTrialApi,
  verifyInvitationToken,
  checkEmailExistsApi,
  verifyEmailApi,
  resendVerificationEmailApi,
} from "../../controller/auth/auth.controller";

const authRouter = Router();

authRouter.post("/signup", signupApi);
authRouter.post("/check-email", checkEmailExistsApi);
authRouter.post("/login", logInApi);
authRouter.post("/logout", authJWT, logoutApi);
authRouter.patch("/change-password", authJWT, changePasswordApi);
authRouter.post("/forgot-password", forgotPasswordApi);
authRouter.patch("/reset-password/:token", resetPasswordApi);
authRouter.post("/start-trial", startTrialApi);
authRouter.post("/verify-invitation", verifyInvitationToken);

// Email Verification APIs
authRouter.post("/verify-email/:token", verifyEmailApi);
authRouter.post("/resend-verification", authJWT, resendVerificationEmailApi);

export default authRouter;
