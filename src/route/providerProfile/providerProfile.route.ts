import { Router } from "express";
import { authJWT } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/roleCheck.middleware";
import {
    getMyProviderProfileApi,
    updateMyProviderProfileApi,
    setPublishStatusApi,
    setVerificationFlagsApi,
    searchPublicProviderProfilesApi,
    getPublicProviderProfileApi,
} from "../../controller/providerProfile/providerProfile.controller";

const providerProfileRouter = Router();

providerProfileRouter.get("/me", authJWT, getMyProviderProfileApi);
providerProfileRouter.put("/me", authJWT, updateMyProviderProfileApi);
providerProfileRouter.patch("/publish", authJWT, setPublishStatusApi);

// superAdmin only — provider cannot self-verify identity/background check.
providerProfileRouter.patch(
    "/:providerId/verification",
    authJWT,
    authorizeRoles("superAdmin"),
    setVerificationFlagsApi,
);

// Public — no auth. Used by the landing page's "Find a Provider" search.
providerProfileRouter.get("/public-search", searchPublicProviderProfilesApi);

// Public — no auth. Used for the shareable profile link.
providerProfileRouter.get("/public/:slug", getPublicProviderProfileApi);

export default providerProfileRouter;
