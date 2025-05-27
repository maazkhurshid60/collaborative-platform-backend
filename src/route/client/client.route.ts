import { Router } from "express";
import { deletClient, getAllClients, getTotalClient, updateClient, addClient, updateExistingClientOnCNIC } from "../../controller/client/client.controller";
import { authJWT } from "../../middlewares/auth.middleware";
import { upload } from "../../utils/multer/multerImgConfig";


const clientRouter = Router()
clientRouter.delete("/delete-client", authJWT, deletClient)
clientRouter.patch("/update-client", authJWT, upload.single('profileImage'), updateClient)
clientRouter.patch("/update-existing-client", updateExistingClientOnCNIC)
clientRouter.post("/add-client", authJWT, upload.single('profileImage'), addClient)
clientRouter.post("/get-all-clients", authJWT, getAllClients)
clientRouter.get("/get-total-clients", authJWT, getTotalClient)

export default clientRouter