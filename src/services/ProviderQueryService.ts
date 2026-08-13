import prisma from "../db/db.config";
import { ApiError } from "../utils/apiError";
import { StatusCodes } from "http-status-codes";
import { Approve } from "../generated/prisma/enums";
import { io } from "../socket/socket";

export class ProviderQueryService {
    // Public — no auth. Only allowed when the profile is published, the
    // provider account is approved, and the provider currently has
    // allowQueries enabled.
    async submitPublicQuery(
        slug: string,
        data: { guestName: string; guestEmail: string; guestPhone?: string; message: string },
    ) {
        const profile = await prisma.providerProfile.findUnique({
            where: { slug },
            include: { provider: { include: { user: true } } },
        });

        if (!profile || !profile.isPublished) {
            throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
        }

        const { provider } = profile;

        if (provider.user.isApprove !== Approve.APPROVED) {
            throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
        }

        if (!profile.allowQueries) {
            throw new ApiError(
                StatusCodes.BAD_REQUEST,
                "This provider isn't accepting new queries right now.",
            );
        }

        const query = await prisma.providerQuery.create({
            data: {
                providerId: provider.id,
                guestName: data.guestName,
                guestEmail: data.guestEmail,
                guestPhone: data.guestPhone,
                message: data.message,
            },
        });

        const notification = await prisma.notification.create({
            data: {
                recipientId: provider.userId,
                title: "New Provider Query",
                message: `${data.guestName} sent you a new query.`,
                type: "QUERY_SUBMITTED",
            },
        });

        io.to(`notification_room_${provider.userId}`).emit("new_notification", notification);

        return query;
    }

    // Provider-only — flat list of queries addressed to them, newest first.
    async getMyQueries(loginUserId: string) {
        const provider = await prisma.provider.findUnique({ where: { userId: loginUserId } });

        if (!provider) {
            throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
        }

        return prisma.providerQuery.findMany({
            where: { providerId: provider.id },
            orderBy: { createdAt: "desc" },
        });
    }

    async deleteMyQuery(loginUserId: string, queryId: string) {
        const provider = await prisma.provider.findUnique({ where: { userId: loginUserId } });

        if (!provider) {
            throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
        }

        const existing = await prisma.providerQuery.findFirst({
            where: { id: queryId, providerId: provider.id },
        });

        if (!existing) {
            throw new ApiError(StatusCodes.NOT_FOUND, "Query not found");
        }

        return prisma.providerQuery.delete({
            where: { id: queryId },
        });
    }
}
