import { Queue } from "bullmq";
import Redis from "ioredis";
import logger from "../utils/logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export let queueConnection: Redis | null = null;
export let auditLogQueue: Queue | null = null;

if (process.env.NODE_ENV !== "test") {
    queueConnection = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
    });

    queueConnection.on("error", (error) => {
        logger.error("BullMQ Queue Redis connection error:", error);
    });

    auditLogQueue = new Queue("audit-logs", {
        connection: queueConnection,
        defaultJobOptions: {
            removeOnComplete: true, // Auto clean up completed jobs to prevent Redis bloat
            removeOnFail: false,   // Keep failed jobs for diagnostic/retry purposes
            attempts: 3,           // Retry up to 3 times on failure
            backoff: {
                type: "exponential",
                delay: 1000,       // Start retries after 1 second
            },
        },
    });
}

