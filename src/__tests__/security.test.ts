import request from "supertest";
import app from "../app";
import jwt from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";

// Increase timeout globally for this file
jest.setTimeout(30000);

// Mocking Prisma to avoid DB dependency in this security logic test
jest.mock("../db/db.config", () => ({
    provider: {
        findFirst: jest.fn(),
    },
    user: {
        findUnique: jest.fn(),
    },
    invitation: {
        create: jest.fn(),
        findFirst: jest.fn(),
    },
    $disconnect: jest.fn(),
}));

import prisma from "../db/db.config";

const JWT_SECRET = process.env.ACCESS_TOKEN_SECRET || "test-secret";

describe("Security Vulnerability Tests", () => {
    let providerToken: string;
    let clientToken: string;

    beforeAll(() => {
        process.env.ACCESS_TOKEN_SECRET = JWT_SECRET;
        providerToken = jwt.sign({ id: "provider-123", email: "provider@test.com", role: "provider" }, JWT_SECRET);
        clientToken = jwt.sign({ id: "client-456", email: "client@test.com", role: "client" }, JWT_SECRET);
    });

    describe("IDOR / Identity Spoofing", () => {
        it("VULNERABILITY: should allow spoofing invitedByUserId in provider-signup", async () => {
            // Currently, the controller uses req.body.invitedByUserId instead of token ID
            (prisma.provider.findFirst as jest.Mock).mockResolvedValueOnce(null); // No existing invitee
            (prisma.invitation.create as jest.Mock).mockResolvedValueOnce({ id: "invite-1" });
            (prisma.provider.findFirst as jest.Mock).mockResolvedValueOnce({
                id: "SPOOFED-ID",
                user: { fullName: "Spoofed User" }
            });

            const response = await request(app)
                .post("/api/v1/individual-invites/provider-signup")
                .set("Authorization", `Bearer ${providerToken}`) // Token is for provider-123
                .send({
                    invitationEmail: "new@test.com",
                    invitedByUserId: "SPOOFED-ID" // Request body claims a different ID
                });

            // This should ideally fail if fixed, but currently it likely passes
            expect(response.status).not.toBe(StatusCodes.FORBIDDEN);
            expect(response.status).not.toBe(StatusCodes.UNAUTHORIZED);
        });
    });

    describe("Role-Based Access Control (RBAC)", () => {
        it("VULNERABILITY: should allow client to access provider invitation route", async () => {
            const response = await request(app)
                .post("/api/v1/individual-invites/provider-signup")
                .set("Authorization", `Bearer ${clientToken}`) // Token is for a CLIENT
                .send({
                    invitationEmail: "new@test.com",
                    invitedByUserId: "client-456"
                });

            // If fixed, this should be 403 Forbidden. Currently it might be 200 or 400/409/500
            expect(response.status).not.toBe(StatusCodes.FORBIDDEN);
        });
    });

    describe("Sensitive Data Exposure", () => {
        it("VULNERABILITY: should check if get-me returns password field", async () => {
            (prisma.provider.findFirst as jest.Mock).mockResolvedValueOnce({
                id: "user-123",
                email: "test@test.com",
                password: "HASHED_PASSWORD_THAT_SHOULD_BE_PRIVATE",
                role: "provider",
                user: { fullName: "Test User", role: "provider" }
            });

            const response = await request(app)
                .post("/api/v1/auth/get-me")
                .set("Authorization", `Bearer ${providerToken}`)
                .send({ loginUserId: "user-123", role: "provider" }); // Matches current insecure controller logic

            // Password should NOT be in the response
            // The response structure is { data: { data: getMeDetails } } due to ApiResponse and controller wrapper
            expect(response.body.data).toBeDefined();
            expect(response.body.data.data).toBeDefined();
            expect(response.body.data.data.password).toBeUndefined();
        });
    });
});
