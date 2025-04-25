import { Router } from "express";
import { deletClient, getAllClients, getTotalClient, updateClient, addClient, updateExistingClientOnCNIC } from "../../controller/client/client.controller";
import { authJWT } from "../../middlewares/auth.middleware";


const clientRouter = Router()
clientRouter.delete("/delete-client", authJWT, deletClient)
clientRouter.patch("/update-client", authJWT, updateClient)
clientRouter.patch("/update-existing-client", updateExistingClientOnCNIC)
clientRouter.post("/add-client", authJWT, addClient)
clientRouter.post("/get-all-clients", authJWT, getAllClients)
clientRouter.get("/get-total-clients", authJWT, getTotalClient)

export default clientRouter