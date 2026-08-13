import { Router } from "express";
import { authJWT } from "../../middlewares/auth.middleware";
import {
    submitPublicQueryApi,
    getMyQueriesApi,
    deleteMyQueryApi,
} from "../../controller/providerQuery/providerQuery.controller";

const providerQueryRouter = Router();

// Public — no auth. Used by the "Send a Query" form on a provider's public profile.
providerQueryRouter.post("/public/:slug", submitPublicQueryApi);

// Provider only — flat list of queries addressed to them.
providerQueryRouter.get("/me", authJWT, getMyQueriesApi);
providerQueryRouter.delete("/me/:queryId", authJWT, deleteMyQueryApi);

export default providerQueryRouter;
