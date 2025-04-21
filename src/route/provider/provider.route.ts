import { Router } from "express";
import { deletProvider, getAllProviders, updateProvider } from "../../controller/provider/provider.controller";


const providerRouter = Router()
providerRouter.delete("/delete-provider", deletProvider)
providerRouter.patch("/update-provider", updateProvider)
providerRouter.get("/get-all-providers", getAllProviders)

export default providerRouter