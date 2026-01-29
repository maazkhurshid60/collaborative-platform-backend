import request from "supertest";
import app from "../../../app";
import prisma from "../../../db/db.config";
import * as mailer from "../../../utils/nodeMailer/InviteProviderSignupEmail";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";

// Mock the dependencies
jest.mock("../../../db/db.config", () => ({
    provider: {
        findFirst: jest.fn(),
    },
    invitation: {
        create: jest.fn(),
    },
    $disconnect: jest.fn(),
}));

jest.mock("../../../utils/nodeMailer/InviteProviderSignupEmail", () => ({
    sendProviderSignupInviteEmail: jest.fn(),
}));

// Mock authJWT middleware to bypass authentication for these tests
// Or we can just provide a valid token if we want to test with the middleware
const jwtSecret = process.env.ACCESS_TOKEN_SECRET || "test-secret";

describe("Provider Invitation Flow", () => {
    let token: string;

    beforeAll(() => {
        process.env.ACCESS_TOKEN_SECRET = jwtSecret;
        token = jwt.sign({ id: "admin-user-id", email: "admin@test.com", role: "admin" }, jwtSecret);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const invitationData = {
        invitationEmail: "new-provider@test.com",
        invitedByUserId: "admin-user-id",
    };

    it("should successfully send an invitation email and create a record", async () => {
        // 1. Mock existing provider search (none found)
        (prisma.provider.findFirst as jest.Mock).mockResolvedValueOnce(null);

        // 2. Mock invitation creation
        (prisma.invitation.create as jest.Mock).mockResolvedValueOnce({ id: "invite-id" });

        // 3. Mock inviter lookup (found admin)
        (prisma.provider.findFirst as jest.Mock).mockResolvedValueOnce({
            id: "admin-user-id",
            user: { fullName: "Admin User" }
        });

        // 4. Mock email sending
        (mailer.sendProviderSignupInviteEmail as jest.Mock).mockResolvedValueOnce(true);

        const response = await request(app)
            .post("/api/v1/individual-invites/provider-signup")
            .set("Authorization", `Bearer ${token}`)
            .send(invitationData);

        expect(response.status).toBe(StatusCodes.OK);
        expect(response.body.message).toBe("OK");
        expect(response.body.data.message).toContain("Invite email sent");

        expect(prisma.provider.findFirst).toHaveBeenCalledTimes(2);
        expect(prisma.invitation.create).toHaveBeenCalled();
        expect(mailer.sendProviderSignupInviteEmail).toHaveBeenCalledWith(
            invitationData.invitationEmail,
            "Admin User",
            expect.any(String)
        );
    });

    it("should return conflict if provider is already registered", async () => {
        (prisma.provider.findFirst as jest.Mock).mockResolvedValueOnce({ id: "existing-id" });

        const response = await request(app)
            .post("/api/v1/individual-invites/provider-signup")
            .set("Authorization", `Bearer ${token}`)
            .send(invitationData);

        expect(response.status).toBe(StatusCodes.CONFLICT);
        expect(response.body.message).toContain("already registered");
        expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it("should return bad request if required fields are missing", async () => {
        const response = await request(app)
            .post("/api/v1/individual-invites/provider-signup")
            .set("Authorization", `Bearer ${token}`)
            .send({ invitationEmail: "test@test.com" }); // Missing invitedByUserId

        expect(response.status).toBe(StatusCodes.BAD_REQUEST);
        expect(response.body.message).toContain("required");
    });

    it("should return internal server error if email fails to send", async () => {
        (prisma.provider.findFirst as jest.Mock).mockResolvedValueOnce(null);
        (prisma.invitation.create as jest.Mock).mockResolvedValueOnce({ id: "invite-id" });
        (prisma.provider.findFirst as jest.Mock).mockResolvedValueOnce({
            id: "admin-user-id",
            user: { fullName: "Admin User" }
        });

        (mailer.sendProviderSignupInviteEmail as jest.Mock).mockRejectedValueOnce(new Error("Email failed"));

        const response = await request(app)
            .post("/api/v1/individual-invites/provider-signup")
            .set("Authorization", `Bearer ${token}`)
            .send(invitationData);

        expect(response.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body.message).toContain("Failed to send invite email");
    });
});
