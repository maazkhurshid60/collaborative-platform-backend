import { Router } from "express";
import {
  deletProvider,
  getAllUnblockProviders,
  updateProvider,
  getTotalProviders,
  getProviderStats,
} from "../../controller/provider/provider.controller";

import { uploadImg } from "../../utils/multer/s3ImgUploader";

const providerRouter = Router();
providerRouter.delete("/delete-provider", deletProvider);
providerRouter.patch(
  "/update-provider",
  uploadImg.single("profileImage"),
  updateProvider
);
providerRouter.post("/get-all-providers", getAllUnblockProviders);
providerRouter.get("/get-total-providers", getTotalProviders);
providerRouter.get("/stats", getProviderStats);
providerRouter.get("/stats/:loginUserId", getProviderStats);

export default providerRouter;