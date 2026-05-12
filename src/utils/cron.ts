import cron from "node-cron";
import prisma from "../db/db.config";
import logger from "./logger";

/**
 * Scheduled tasks for HIPAA compliance and system maintenance.
 */
export const setupCronJobs = () => {
    // 1. Audit Log Retention: Run daily at midnight to delete logs older than 90 days.
    // Cron schedule: 0 0 * * * (Midnight every day)
    cron.schedule("0 0 * * *", async () => {
        logger.info("Running daily Audit Log cleanup...");
        try {
            const retentionDays = 90;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            const result = await prisma.auditLog.deleteMany({
                where: {
                    timestamp: {
                        lt: cutoffDate,
                    },
                },
            });

            logger.info(`Successfully deleted ${result.count} audit logs older than ${retentionDays} days.`);
        } catch (error) {
            logger.error("Error during Audit Log cleanup:", error);
        }
    });

    logger.info("✅ Cron jobs initialized.");
};
