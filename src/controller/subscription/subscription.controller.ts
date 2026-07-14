import { Request, Response, NextFunction } from "express";
import { io } from "../../socket/socket";
import { SubscriptionService } from "../../services/SubscriptionService";
import { ApiResponse } from "../../utils/apiResponse";
import { StatusCodes } from "http-status-codes";
import { AuditLogService } from "../../services/AuditLogService";

const subscriptionService = new SubscriptionService();

// Create Checkout Session (Legacy - for existing users)
export const createCheckoutSessionApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const { planType, period } = req.body;

        if (!planType || !period) {
            return res.status(StatusCodes.BAD_REQUEST).json(new ApiResponse(StatusCodes.BAD_REQUEST, null, "Plan type and period are required"));
        }

        const session = await subscriptionService.createCheckoutSession(userId, planType, period);
        res.status(StatusCodes.OK).json({ url: session.url });
    } catch (error) {
        next(error);
    }
};
export const createSubscriptionIntentApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, name, planType, period } = req.body;
        if (!email || !planType || !period) {
            return res.status(StatusCodes.BAD_REQUEST).json(new ApiResponse(StatusCodes.BAD_REQUEST, null, "Email, Plan type, and Period are required"));
        }

        const data = await subscriptionService.createSubscriptionIntent({ email, name, planType, period });
        res.status(StatusCodes.OK).json(data);
    } catch (error) {
        next(error);
    }
};
export const activateFreePlanApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const { planType } = req.body;
        await subscriptionService.activateFreePlan(userId, planType);

        // Audit Log for Free Plan Activation
        await AuditLogService.createLog({
            userId: userId,
            action: "ACTIVATE FREE PLAN",
            resource: "SUBSCRIPTION",
            resourceId: userId,
            details: { planType }
        });

        res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, null, "Plan activated successfully"));
    } catch (error) {
        next(error);
    }
};
export const cancelSubscriptionApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const { reason } = req.body;
        await subscriptionService.cancelSubscription(userId, reason);

        // Audit Log for Subscription Cancellation
        await AuditLogService.createLog({
            userId: userId,
            action: "CANCEL SUBSCRIPTION",
            resource: "SUBSCRIPTION",
            resourceId: userId,
            details: { reason }
        });

        res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, null, "Subscription canceled successfully"));
    } catch (error) {
        next(error);
    }
};

export const getAllPaymentsApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const payments = await subscriptionService.getAllPayments(userId);
        res.status(StatusCodes.OK).json(payments);
    } catch (error) {
        next(error);
    }
};

// Force Sync local DB with Stripe status
export const syncSubscriptionApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const updatedSub = await subscriptionService.syncSubscription(userId);

        // Audit Log for Subscription Sync
        await AuditLogService.createLog({
            userId: userId,
            action: "SYNC SUBSCRIPTION",
            resource: "SUBSCRIPTION",
            resourceId: userId,
            details: { message: "Subscription status synced with Stripe" }
        });

        res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, updatedSub, "Subscription synced successfully"));
    } catch (error) {
        next(error);
    }
};
// Admin: Get All Invoices
export const getAllInvoicesApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { providerId } = req.query;
        const payments = await subscriptionService.getAllPayments(String(providerId || ""));
        res.status(StatusCodes.OK).json(payments);
    } catch (error) {
        next(error);
    }
};