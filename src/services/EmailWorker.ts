import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import logger from "../utils/logger";
import { sendNewMessageEmail } from "../utils/nodeMailer/SendNewMessageEmail";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export let emailWorkerConnection: Redis | null = null;

if (process.env.NODE_ENV !== "test") {
  emailWorkerConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  emailWorkerConnection.on("error", (error) => {
    logger.error("BullMQ Email Worker Redis connection error:", error);
  });
}

export const initEmailWorker = () => {
  if (process.env.NODE_ENV === "test") {
    logger.debug("Skipping Email Worker initialization in test environment");
    return null;
  }

  const worker = new Worker(
    "email-jobs",
    async (job: Job) => {
      const { email, senderName, chatLink, chatType, chatName } = job.data;

      try {
        if (job.name === "send-chat-notification") {
          logger.debug(`[EmailWorker] Processing job ${job.id} for ${email}`);
          await sendNewMessageEmail(
            email,
            senderName,
            chatLink,
            chatType,
            chatName,
          );
          logger.debug(
            `[EmailWorker] Successfully sent email for job ${job.id}`,
          );
        } else {
          logger.warn(`[EmailWorker] Unknown job name: ${job.name}`);
        }

        return { success: true };
      } catch (error) {
        logger.error(
          `[EmailWorker] Error processing job ${job.id} (Type: ${job.name}):`,
          error,
        );
        throw error; // Triggers BullMQ retry
      }
    },
    {
      connection: emailWorkerConnection!,
      concurrency: 5, // Allow up to 5 concurrent emails to be sent
    },
  );

  worker.on("completed", (job) => {
    logger.debug(`Email Worker: Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    logger.error(
      `Email Worker: Job ${job?.id} failed with error: ${err.message}`,
    );
  });

  return worker;
};
