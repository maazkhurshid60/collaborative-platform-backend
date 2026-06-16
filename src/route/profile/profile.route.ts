import { Router } from "express";
import { authJWT } from "../../middlewares/auth.middleware";
import { uploadImg } from "../../utils/multer/s3ImgUploader";
import { deleteMeAccountApi, getMeApi, updateMeApi } from "../../controller/profile/profile.controller";

const profileRouter = Router();

profileRouter.patch(
    "/update-me",
    authJWT,
    uploadImg.fields([
        { name: 'profileImage', maxCount: 1 },
        { name: 'eSignature', maxCount: 1 },
    ]),
    updateMeApi
);
profileRouter.delete("/delete-me-account", authJWT, deleteMeAccountApi);
profileRouter.post("/get-me", authJWT, getMeApi);

export default profileRouter;
