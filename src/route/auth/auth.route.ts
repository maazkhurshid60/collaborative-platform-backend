import { Router } from "express";
import { blockUserApi, changePasswordApi, deleteMeAccountApi, findByLicenseNo, getAllUsersApi, getMeApi, logInApi, logoutApi, signupApi, unblockUserApi, updateMeApi } from "../../controller/auth/auth.controller";
import { authJWT } from "../../middlewares/auth.middleware";
import { uploadImg } from "../../utils/multer/s3ImgUploader";
const authRouter = Router()
authRouter.post("/signup", signupApi)
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
authRouter.post("/get-me", authJWT, getMeApi)
authRouter.get("/get-all-users", authJWT, getAllUsersApi)
authRouter.patch("/change-password", authJWT, changePasswordApi)


export default authRouter