import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import prisma from "../db/db.config";
import logger from "../utils/logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export let workerConnection: Redis | null = null;

if (process.env.NODE_ENV !== "test") {
  workerConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  workerConnection.on("error", (error) => {
    logger.error("BullMQ Worker Redis connection error:", error);
  });
}

export const initAuditLogWorker = () => {
  if (process.env.NODE_ENV === "test") {
    logger.debug(
      "Skipping Audit Log Worker initialization in test environment",
    );
    return null;
  }

  logger.info("Initializing Audit Log Queue Worker...");

  const worker = new Worker(
    "audit-logs",
    async (job: Job) => {
      const { userId, action, resource, resourceId, details } = job.data;

      try {
        if (userId) {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
          });

          // Bypass logging for superAdmin
          if (user?.role === "superAdmin") {
            logger.debug(
              `Skipping audit log creation for superAdmin (userId: ${userId})`,
            );
            return null;
          }
        }

        const log = await prisma.auditLog.create({
          data: {
            userId,
            action,
            resource,
            resourceId,
            details: details || {},
          },
        });

        logger.debug(
          `Audit log successfully saved to database for job ${job.id}`,
        );
        return log;
      } catch (error) {
        logger.error(
          `Error processing job ${job.id} (Action: ${action}):`,
          error,
        );
        throw error; // This triggers retry policies in BullMQ
      }
    },
    {
      connection: workerConnection!,
      concurrency: 5, // Allow up to 5 concurrent logs to be processed
    },
  );

  worker.on("completed", (job) => {
    logger.debug(`Audit Log Worker: Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    logger.error(
      `Audit Log Worker: Job ${job?.id} failed with error: ${err.message}`,
    );
  });

  return worker;
};
