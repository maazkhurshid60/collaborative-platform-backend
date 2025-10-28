"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../../controller/auth/auth.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const s3ImgUploader_1 = require("../../utils/multer/s3ImgUploader");
const authRouter = (0, express_1.Router)();
authRouter.post("/signup", auth_controller_1.signupApi);
authRouter.post("/license-found", auth_controller_1.findByLicenseNo);
authRouter.post("/login", auth_controller_1.logInApi);
authRouter.post("/block-user", auth_controller_1.blockUserApi);
authRouter.post("/unblock-user", auth_middleware_1.authJWT, auth_controller_1.unblockUserApi);
authRouter.post("/logout", auth_middleware_1.authJWT, auth_controller_1.logoutApi);
authRouter.patch("/update-me", auth_middleware_1.authJWT, s3ImgUploader_1.uploadImg.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'eSignature', maxCount: 1 },
]), auth_controller_1.updateMeApi);
authRouter.delete("/delete-me-account", auth_middleware_1.authJWT, auth_controller_1.deleteMeAccountApi);
authRouter.post("/get-me", auth_middleware_1.authJWT, auth_controller_1.getMeApi);
authRouter.get("/get-all-users", auth_middleware_1.authJWT, auth_controller_1.getAllUsersApi);
authRouter.patch("/approve-user", auth_middleware_1.authJWT, auth_controller_1.approveValidUser);
authRouter.patch("/reject-user", auth_middleware_1.authJWT, auth_controller_1.rejectUser);
authRouter.patch("/restore-user", auth_middleware_1.authJWT, auth_controller_1.restoreUser);
authRouter.get("/get-all-valid-users", auth_middleware_1.authJWT, auth_controller_1.getAllValidUsersApi);
authRouter.patch("/change-password", auth_middleware_1.authJWT, auth_controller_1.changePasswordApi);
authRouter.post("/forgot-password", auth_controller_1.forgotPasswordApi);
authRouter.patch("/reset-password/:token", auth_controller_1.resetPasswordApi);
exports.default = authRouter;
