import { Router } from "express";
import { deletClient, getAllClients, getTotalClient, updateClient, addClient, updateExistingClientOnLicenseNo, addExistingClientToProvider } from "../../controller/client/client.controller";
import { authJWT } from "../../middlewares/auth.middleware";
import { upload } from "../../utils/multer/multerImgConfig";
import { uploadImg } from "../../utils/multer/s3ImgUploader";


const clientRouter = Router()
clientRouter.delete("/delete-client", authJWT, deletClient)
clientRouter.patch("/update-client", authJWT, uploadImg.single('profileImage'), updateClient)
clientRouter.patch("/update-existing-client", updateExistingClientOnLicenseNo)
clientRouter.post("/add-client", authJWT, uploadImg.single('profileImage'), addClient)
clientRouter.post("/add-existing-client-to-provider", authJWT, uploadImg.single('profileImage'), addExistingClientToProvider)
clientRouter.post("/get-all-clients", authJWT, getAllClients)
clientRouter.get("/get-total-clients", authJWT, getTotalClient)

export default clientRouter