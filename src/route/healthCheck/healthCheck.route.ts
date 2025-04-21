import { Router } from "express";
import { getHealthCheckStatus } from "../../controller/healthCheck/healthCheck.controller";

const healthCheckRouter = Router()

healthCheckRouter.get("/healthCheck", getHealthCheckStatus)

export default healthCheckRouter