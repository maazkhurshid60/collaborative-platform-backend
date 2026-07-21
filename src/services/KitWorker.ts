import { Worker, Job } from "bullmq";
import Redis from "ioredis";

import { kitApiClient } from "../integrations/kit/KitV4ApiClient";
import { kitConfig } from "../config/kit.config";
import prisma from "../db/db.config";
import logger from "../utils/logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export let kitWorkerConnection: Redis | null = null;

if (process.env.NODE_ENV !== "test") {
  kitWorkerConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  kitWorkerConnection.on("error", (error) => {
    logger.error("BullMQ Kit Worker Redis connection error:", error);
  });
}

export const initKitWorker = () => {
  if (process.env.NODE_ENV === "test") {
    logger.debug("Skipping Kit Worker initialization in test environment");
    return null;
  }

  logger.info("Initializing Kit Queue Worker...");

  const worker = new Worker(
    "kit-sync-queue",
    async (job: Job) => {
      const { email, fullName } = job.data;

      try {
        if (!email) {
          logger.warn(`Kit Worker: Job ${job.id} skipped due to missing email`);
          return;
        }

        // Fetch user information to determine plan and subscription status
        const user = await prisma.user.findUnique({
          where: { email },
          include: { subscription: true },
        });

        // const displayName = user?.fullName || fullName || "";

        // Sync/upsert subscriber in Kit and get ID
        // const subscriberId = await kitApiClient.upsertSubscriber(email, displayName);

        // Handle tags if the user is a provider
        if (user && user.role === "provider") {
          const isPremium = !!(
            user.subscription &&
            user.subscription.status === "ACTIVE" &&
            ["STANDARD", "PRO"].includes(user.subscription.plan)
          );

          const freeTagId = kitConfig.freeUserTagId;
          const premiumTagId = kitConfig.premiumUserTagId;

          if (isPremium) {
            // Apply Premium User tag
            if (premiumTagId) {
              await kitApiClient.assignTagByEmail(email, premiumTagId);
            }
            // Remove Free User tag
            if (freeTagId) {
              await kitApiClient
                .removeTagByEmail(email, freeTagId)
                .catch((err) => {
                  logger.warn(
                    `Kit Worker: Failed to remove Free User tag from ${email}: ${err.message}`,
                  );
                });
            }
          } else {
            // Apply Free User tag
            if (freeTagId) {
              await kitApiClient.assignTagByEmail(email, freeTagId);
            }
            // Remove Premium User tag
            if (premiumTagId) {
              await kitApiClient
                .removeTagByEmail(email, premiumTagId)
                .catch((err) => {
                  logger.warn(
                    `Kit Worker: Failed to remove Premium User tag from ${email}: ${err.message}`,
                  );
                });
            }
          }
        }

        return { success: true, email };
      } catch (error) {
        logger.error(`Error processing Kit sync for job ${job.id}:`, error);
        // Throwing the error here tells BullMQ to retry the job according to our backoff strategy
        throw error;
      }
    },
    {
      connection: kitWorkerConnection!,
      concurrency: 5, // Process up to 5 Kit API calls concurrently
    },
  );

  worker.on("completed", (job) => {
    logger.debug(`Kit Worker: Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    logger.error(
      `Kit Worker: Job ${job?.id} finally failed after all retries. Error: ${err.message}`,
    );
  });

  return worker;
};
