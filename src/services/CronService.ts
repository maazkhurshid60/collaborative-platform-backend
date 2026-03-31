import cron from "node-cron";
import prisma from "../db/db.config";
import { SubscriptionService } from "./SubscriptionService";
import logger from "../utils/logger";

const subscriptionService = new SubscriptionService();

export class CronService {
    static init() {
        // Run daily at 01:00 AM
        cron.schedule("0 1 * * *", async () => {
            logger.info("🕒 Starting Daily Subscription Sync Job...");
            try {
                await this.syncExpiredTrials();
            } catch (error: any) {
                logger.error("❌ Daily Sync Job Failed:", error.message);
            }
        });

        logger.info("✅ Cron Service Initialized (Daily Sync at 01:00 AM)");
    }

    private static async syncExpiredTrials() {
        const now = new Date();
        
        // Find all users whose trials have expired but status is still TRIALING
        const expiredSubs = await prisma.subscription.findMany({
            where: {
                status: "TRIALING",
                trialEnd: {
                    lt: now
                }
            }
        });

        logger.info(`🔍 Found ${expiredSubs.length} expired trials to synchronize.`);

        for (const sub of expiredSubs) {
            try {
                await subscriptionService.syncSubscription(sub.userId);
                logger.info(`✅ Synced subscription for User: ${sub.userId}`);
            } catch (error: any) {
                logger.error(`❌ Failed to sync User ${sub.userId}:`, error.message);
            }
        }
    }
}
