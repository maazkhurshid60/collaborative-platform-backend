import prisma from "../db/db.config";

export class AuditLogService {
    static async createLog(data: {
        userId?: string;
        action: string;
        resource: string;
        resourceId?: string;
        details?: any;
    }) {
        try {
            if (data.userId) {
                const user = await prisma.user.findUnique({
                    where: { id: data.userId },
                    select: { role: true }
                });

                if (user?.role === "superAdmin") {
                    return null;
                }
            }

            return await prisma.auditLog.create({
                data: {
                    userId: data.userId,
                    action: data.action,
                    resource: data.resource,
                    resourceId: data.resourceId,
                    details: data.details || {},
                }
            });
        } catch (error) {
            console.error("Failed to create audit log:", error);
            return null;
        }
    }
}
