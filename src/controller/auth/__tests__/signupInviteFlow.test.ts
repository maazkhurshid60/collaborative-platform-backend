import request from "supertest";
import app from "../../../app";
import prisma from "../../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { Role } from "@prisma/client";

// Mock the dependencies
jest.mock("../../../db/db.config", () => {
    const mockPrisma = {
        user: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        provider: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        invitation: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        chatChannel: {
            upsert: jest.fn(),
        },
        $transaction: jest.fn(),
        $disconnect: jest.fn(),
    };
    return mockPrisma;
});

describe("Signup with Invitation Flow", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const validSignupData = {
        fullName: "Invited Provider",
        licenseNo: "LIC-12345",
        role: "provider",
        country: "USA",
        state: "California",
        department: "Cardiology",
        email: "invited@test.com",
        password: "Password123!",
        inviteToken: "valid-invite-token"
    };

    it("should create a chat channel and accept invitation on successful signup", async () => {
        // 1. Mock user and provider uniqueness checks
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.provider.findFirst as jest.Mock).mockResolvedValue(null);

        // 2. Mock the transaction
        const mockCreatedUser = { id: "new-user-id", ...validSignupData };
        const mockCreatedProvider = { id: "new-provider-id", userId: "new-user-id" };

        (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
            // Inside the transaction, it calls tx.user.create and then createRoleCallback
            // We need to pass a mock 'tx' object to the callback
            const tx = {
                user: { create: jest.fn().mockResolvedValue(mockCreatedUser) },
                provider: { create: jest.fn().mockResolvedValue(mockCreatedProvider) },
            };
            return await callback(tx);
        });

        // 3. Mock invitation lookup (Post-Transaction)
        (prisma.invitation.findUnique as jest.Mock).mockResolvedValue({
            id: "invite-id",
            token: "valid-invite-token",
            email: "invited@test.com",
            status: "PENDING",
            invitedById: "inviter-id"
        });

        // 4. Mock inviter lookup
        (prisma.provider.findUnique as jest.Mock).mockResolvedValue({
            id: "inviter-id",
        });

        // 5. Mock chat channel creation and invitation update
        (prisma.chatChannel.upsert as jest.Mock).mockResolvedValue({ id: "chat-id" });
        (prisma.invitation.update as jest.Mock).mockResolvedValue({ id: "invite-id", status: "ACCEPTED" });

        const response = await request(app)
            .post("/api/v1/auth/signup")
            .send(validSignupData);

        expect(response.status).toBe(StatusCodes.CREATED);

        // Check if invitation was searched for
        expect(prisma.invitation.findUnique).toHaveBeenCalledWith({
            where: { token: "valid-invite-token", status: "PENDING" }
        });

        // Verify chat channel creation
        expect(prisma.chatChannel.upsert).toHaveBeenCalled();

        // Verify invitation update
        expect(prisma.invitation.update).toHaveBeenCalledWith({
            where: { id: "invite-id" },
            data: { status: "ACCEPTED" }
        });
    });

    it("should not create a chat channel if inviteToken is invalid", async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.provider.findFirst as jest.Mock).mockResolvedValue(null);

        (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
            const tx = {
                user: { create: jest.fn().mockResolvedValue({ id: "u" }) },
                provider: { create: jest.fn().mockResolvedValue({ id: "p" }) },
            };
            return await callback(tx);
        });

        // Mock invitation lookup returning null (invalid token)
        (prisma.invitation.findUnique as jest.Mock).mockResolvedValue(null);

        const response = await request(app)
            .post("/api/v1/auth/signup")
            .send({ ...validSignupData, inviteToken: "invalid-token" });

        expect(response.status).toBe(StatusCodes.CREATED);
        expect(prisma.chatChannel.upsert).not.toHaveBeenCalled();
        expect(prisma.invitation.update).not.toHaveBeenCalled();
    });
});
