import express from "express";
import {
    createCheckoutSessionApi,
    activateFreePlanApi,
    cancelSubscriptionApi,
    getAllPaymentsApi,
    getAllInvoicesApi,
    createSubscriptionIntentApi,
    syncSubscriptionApi
} from "../../controller/subscription/subscription.controller";
import { stripeWebhookApi } from "../../controller/subscription/webhook.controller";
import { authJWT } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/roleCheck.middleware"; // Assuming these exist

const subscriptionRouter = express.Router();

// Webhook (needs raw body parser in app.ts usually, or handle here)
subscriptionRouter.post("/webhook", express.raw({ type: 'application/json' }), stripeWebhookApi);

// Secured Routes
subscriptionRouter.post("/create-checkout-session", authJWT, authorizeRoles("provider"), createCheckoutSessionApi);
subscriptionRouter.post("/activate-free-plan", authJWT, authorizeRoles("provider"), activateFreePlanApi);
subscriptionRouter.post("/cancel-subscription", authJWT, authorizeRoles("provider"), cancelSubscriptionApi);
subscriptionRouter.post("/sync", authJWT, authorizeRoles("provider"), syncSubscriptionApi);

// Public Routes
subscriptionRouter.post("/intent", createSubscriptionIntentApi);

// Invoice/Payment Views
subscriptionRouter.get("/payments", authJWT, authorizeRoles("provider"), getAllPaymentsApi);
subscriptionRouter.get("/admin/invoices", authJWT, authorizeRoles("superAdmin"), getAllInvoicesApi);

export default subscriptionRouter;
