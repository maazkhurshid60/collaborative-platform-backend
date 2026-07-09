import { Worker, Job } from "bullmq";
import Redis from "ioredis";

import { kitApiClient } from "../integrations/kit/KitV4ApiClient";
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

        await kitApiClient.upsertSubscriber(email, fullName || "");

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
