const mockQueueAdd = jest.fn();

jest.mock("../services/AuditLogQueue", () => ({
    auditLogQueue: {
        add: mockQueueAdd,
    },
}));

import { AuditLogService } from "../services/AuditLogService";

describe("AuditLogService", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should successfully add an audit log to the queue", async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "development"; // Bypass the test env bypass

        try {
            const logData = {
                userId: "user-123",
                action: "user.login",
                resource: "auth",
                resourceId: "session-456",
                details: { ip: "127.0.0.1" },
            };

            mockQueueAdd.mockResolvedValue({ id: "job-1" });

            const result = await AuditLogService.createLog(logData);

            expect(mockQueueAdd).toHaveBeenCalledWith("create-audit-log", logData);
            expect(result).toEqual({ id: "job-1" });
        } finally {
            process.env.NODE_ENV = originalEnv;
        }
    });

    it("should handle error gracefully and return null when queuing fails", async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "development"; // Bypass the test env bypass

        try {
            const logData = {
                action: "system.event",
                resource: "system",
            };

            mockQueueAdd.mockRejectedValue(new Error("Redis offline"));

            const result = await AuditLogService.createLog(logData);

            expect(mockQueueAdd).toHaveBeenCalledWith("create-audit-log", {
                userId: undefined,
                action: "system.event",
                resource: "system",
                resourceId: undefined,
                details: undefined,
            });
            expect(result).toBeNull();
        } finally {
            process.env.NODE_ENV = originalEnv;
        }
    });
});
