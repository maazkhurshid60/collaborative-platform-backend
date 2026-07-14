import { Request, Response } from "express";
import { STRIPE_WEBHOOK_SECRET } from "../../utils/stripe/stripe";
import { SubscriptionService } from "../../services/SubscriptionService";

const subscriptionService = new SubscriptionService();

export const stripeWebhookApi = async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
        console.error("Webhook Error: No stripe signature found");
        return res.status(400).send("No stripe signature found");
    }

    try {
        const rawBody = (req as any).rawBody || req.body;
        await subscriptionService.handleWebhook(rawBody, sig as string, STRIPE_WEBHOOK_SECRET!);
        res.json({ received: true });
    } catch (error: any) {
        console.error("Webhook Handler Error:", error.message);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
};
