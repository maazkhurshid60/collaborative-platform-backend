import { Queue } from "bullmq";
import Redis from "ioredis";
import logger from "../utils/logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export let emailQueueConnection: Redis | null = null;
export let emailQueue: Queue | null = null;

if (process.env.NODE_ENV !== "test") {
  emailQueueConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  emailQueueConnection.on("error", (error) => {
    logger.error("BullMQ Email Queue Redis connection error:", error);
  });

  emailQueue = new Queue("email-jobs", {
    connection: emailQueueConnection,
    defaultJobOptions: {
      removeOnComplete: true, // Auto clean up completed jobs to prevent Redis bloat
      removeOnFail: 50, // Keep the last 50 failed jobs for diagnostic/retry purposes
      attempts: 3, // Retry up to 3 times on failure
      backoff: {
        type: "exponential",
        delay: 1000, // Start retries after 1 second
      },
    },
  });
}
