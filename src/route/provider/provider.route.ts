import { Router } from "express";
import { deletProvider, getAllUnblockProviders, updateProvider, getTotalProviders } from "../../controller/provider/provider.controller";


const providerRouter = Router()
providerRouter.delete("/delete-provider", deletProvider)
providerRouter.patch("/update-provider", updateProvider)
providerRouter.post("/get-all-providers", getAllUnblockProviders)
providerRouter.get("/get-total-providers", getTotalProviders)

export default providerRouter