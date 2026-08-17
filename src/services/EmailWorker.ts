import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import logger from "../utils/logger";
import { sendNewMessageEmail } from "../utils/nodeMailer/SendNewMessageEmail";
import {
  sendBookingRequestEmailToProvider,
  sendBookingAcceptedEmailToGuest,
  sendBookingDeclinedEmailToGuest,
} from "../utils/nodeMailer/BookingEmails";
import { sendQueryReceivedEmailToProvider } from "../utils/nodeMailer/QueryEmails";

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
        logger.debug(`[EmailWorker] Processing job ${job.id} (${job.name})`);

        if (job.name === "send-chat-notification") {
          await sendNewMessageEmail(
            email,
            senderName,
            chatLink,
            chatType,
            chatName,
          );
        } else if (job.name === "send-booking-request-email") {
          await sendBookingRequestEmailToProvider(job.data);
        } else if (job.name === "send-booking-accepted-email") {
          await sendBookingAcceptedEmailToGuest(job.data);
        } else if (job.name === "send-booking-declined-email") {
          await sendBookingDeclinedEmailToGuest(job.data);
        } else if (job.name === "send-query-received-email") {
          await sendQueryReceivedEmailToProvider(job.data);
        } else {
          logger.warn(`[EmailWorker] Unknown job name: ${job.name}`);
          return { success: false };
        }

        logger.debug(
          `[EmailWorker] Successfully sent email for job ${job.id}`,
        );

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
