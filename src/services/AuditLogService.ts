import { auditLogQueue } from "./AuditLogQueue";
import logger from "../utils/logger";

export class AuditLogService {
    static async createLog(data: {
        userId?: string;
        action: string;
        resource: string;
        resourceId?: string;
        details?: any;
    }) {
        try {
            if (process.env.NODE_ENV === "test" || !auditLogQueue) {
                logger.debug("Bypassing BullMQ audit log in test/uninitialized environment");
                return { id: "mock-test-job-id", data } as any;
            }

            // Queue the job to be processed asynchronously in the background
            const job = await auditLogQueue.add("create-audit-log", {
                userId: data.userId,
                action: data.action,
                resource: data.resource,
                resourceId: data.resourceId,
                details: data.details,
            });
            return job;
        } catch (error) {
            logger.error("Failed to queue audit log job in BullMQ:", error);
            return null;
        }
    }
}

