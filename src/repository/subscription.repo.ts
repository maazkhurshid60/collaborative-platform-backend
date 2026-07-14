import prisma from "../db/db.config";

class SubscriptionRepo {
    async createSubscription(userId: string, plan: string) {
        await prisma.subscription.create({
            data: {
                userId,
                plan: plan === "PRO" ? "PRO" : "STANDARD",
                status: "TRIALING", // Always start here
                stripeCustomerId: "",
            }
        });
    }
}

export const subscriptionRepo = new SubscriptionRepo();