import { Router } from "express";
import { blockUserApi, changePasswordApi, deleteMeAccountApi, deleteUserByAdminApi, getAllValidUsersApi, findByLicenseNo, forgotPasswordApi, getAllUsersApi, getMeApi, logInApi, logoutApi, resetPasswordApi, signupApi, unblockUserApi, updateMeApi, approveValidUser, rejectUser, restoreUser, startTrialApi, verifyInvitationToken, checkEmailExistsApi, verifyEmailApi, resendVerificationEmailApi } from "../../controller/auth/auth.controller";
import { authJWT } from "../../middlewares/auth.middleware";
import { uploadImg } from "../../utils/multer/s3ImgUploader";
const authRouter = Router()
authRouter.post("/signup", signupApi)
authRouter.post("/check-email", checkEmailExistsApi)
authRouter.post("/license-found", findByLicenseNo)
authRouter.post("/login", logInApi)
authRouter.post("/block-user", blockUserApi)
authRouter.post("/unblock-user", authJWT, unblockUserApi)
authRouter.post("/logout", authJWT, logoutApi)
authRouter.patch(
    "/update-me",
    authJWT,
    uploadImg.fields([
        { name: 'profileImage', maxCount: 1 },
        { name: 'eSignature', maxCount: 1 },
    ]),
    updateMeApi
);
authRouter.delete("/delete-me-account", authJWT, deleteMeAccountApi)
authRouter.delete("/admin/delete-user", authJWT, deleteUserByAdminApi)
authRouter.post("/get-me", authJWT, getMeApi)
authRouter.get("/get-all-users", authJWT, getAllUsersApi)
authRouter.patch("/approve-user", authJWT, approveValidUser)
authRouter.patch("/reject-user", authJWT, rejectUser)
authRouter.patch("/restore-user", authJWT, restoreUser)
authRouter.get("/get-all-valid-users", authJWT, getAllValidUsersApi)
authRouter.patch("/change-password", authJWT, changePasswordApi)
authRouter.post("/forgot-password", forgotPasswordApi)
authRouter.patch("/reset-password/:token", resetPasswordApi)
authRouter.post("/start-trial", startTrialApi)
authRouter.post("/verify-invitation", verifyInvitationToken)

// Email Verification APIs
authRouter.post("/verify-email/:token", verifyEmailApi);
authRouter.post("/resend-verification", authJWT, resendVerificationEmailApi);


export default authRouter