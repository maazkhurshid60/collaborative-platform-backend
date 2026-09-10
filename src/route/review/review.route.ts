import { Router } from "express";
import { authJWT } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/roleCheck.middleware";
import {
    createReviewApi,
    getProviderReviewsApi,
    getMyReviewsApi,
} from "../../controller/review/review.controller";

const reviewRouter = Router();

// Public — no auth. Shown on a provider's public profile page.
reviewRouter.get("/provider/:providerId", getProviderReviewsApi);

// Client only — leave a review for a completed session.
reviewRouter.post("/", authJWT, authorizeRoles("client"), createReviewApi);

// Provider only — their own received reviews.
reviewRouter.get("/me", authJWT, authorizeRoles("provider"), getMyReviewsApi);

export default reviewRouter;
