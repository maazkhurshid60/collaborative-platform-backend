import { Router } from "express";
import { deletClient, getAllClients, updateClient } from "../../controller/client/client.controller";


const clientRouter = Router()
clientRouter.delete("/delete-client", deletClient)
clientRouter.patch("/update-client", updateClient)
clientRouter.get("/get-all-clients", getAllClients)

export default clientRouter