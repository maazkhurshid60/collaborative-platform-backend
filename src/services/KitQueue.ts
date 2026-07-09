import { Queue } from "bullmq";
import Redis from "ioredis";
import logger from "../utils/logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export let kitQueueConnection: Redis | null = null;
export let kitQueue: Queue | null = null;

if (process.env.NODE_ENV !== "test") {
    kitQueueConnection = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
    });

    kitQueueConnection.on("error", (error) => {
        logger.error("BullMQ Kit Queue Redis connection error:", error);
    });

    kitQueue = new Queue("kit-sync-queue", {
        connection: kitQueueConnection,
        defaultJobOptions: {
            removeOnComplete: true, // Auto clean up to prevent bloat
            removeOnFail: false,   // Keep failed jobs for inspection
            attempts: 5,           // Retry up to 5 times for resilience against rate limits/network drops
            backoff: {
                type: "exponential",
                delay: 5000,       // Start retries after 5 seconds
            },
        },
    });
}
