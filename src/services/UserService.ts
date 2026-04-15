import bcrypt from "bcrypt";
import prisma from "../db/db.config";
import { Role, Gender } from "../generated/prisma/enums";
import { ApiError } from "../utils/apiError";
import { StatusCodes } from "http-status-codes";
import { AuthService } from "./AuthService";
import { SubscriptionService } from "./SubscriptionService";

const authService = new AuthService();

export class UserService {
    async getMe(loginUserId: string, role: Role) {
        // reuse the logic from AuthService for consistency
        return await authService.getCompleteUserData(loginUserId, role);
    }

    async updateMe(loginUserId: string, updateData: any) {
        const {
            fullName,
            gender,
            age,
            contactNo,
            address,
            status,
            licenseNo,
            role,
            email,
            password,
            //      country,
            state,
            profileImageUpdate,
            eSignature,
            eSignatureAction,
            department
        } = updateData;

        let newPassword = undefined;
        if (password && password.trim() !== "") {
            newPassword = await bcrypt.hash(password, 10);
        }

        let genderEnum: Gender = Gender.MALE;
        if (gender === "female" || gender === "FEMALE") genderEnum = Gender.FEMALE;
        else if (gender === "prefer_not_to_say" || gender === "PREFER_NOT_TO_SAY") genderEnum = Gender.PREFER_NOT_TO_SAY;
        else if (gender === "other" || gender === "OTHER") genderEnum = Gender.OTHER;

        await prisma.user.update({
            where: { id: loginUserId },
            data: {
                fullName,
                gender: genderEnum,
                age,
                contactNo,
                address,
                status,
                licenseNo,
                role,
                //   country,
                state,
                ...(profileImageUpdate !== undefined && { profileImage: profileImageUpdate }),
                ...(email && { email }),
                ...(newPassword && { password: newPassword })
            }
        });

        if (role === Role.client) {
            const clientUpdateData: any = {};
            if (eSignatureAction === "replace" && updateData.eSignatureUpdate) {
                clientUpdateData.eSignature = updateData.eSignatureUpdate;
            } else if (eSignatureAction === "remove") {
                clientUpdateData.eSignature = null;
            }

            const clientUpdate = await prisma.client.update({
                where: { userId: loginUserId },
                data: clientUpdateData,
                include: { user: { include: { subscription: true } } }
            });
            if (clientUpdate?.user) delete (clientUpdate.user as any).password;
            return clientUpdate;
        } else if (role === Role.provider) {
            const providerUpdate = await prisma.provider.update({
                where: { userId: loginUserId },
                data: { department },
                include: { user: { include: { subscription: true } } }
            });
            if (providerUpdate?.user) delete (providerUpdate.user as any).password;
            return providerUpdate;
        } else if (role === Role.superAdmin) {
            const adminUpdate = await prisma.superAdmin.update({
                where: { userId: loginUserId },
                data: {}, // Add superAdmin specific fields if any in future
                include: { user: { include: { subscription: true } } }
            });
            if (adminUpdate?.user) delete (adminUpdate.user as any).password;
            return adminUpdate;
        }
        return null;
    }

    async deleteMe(userId: string) {
        const user = await prisma.user.findFirst({
            where: {
                id: userId,
                role: Role.provider
            }
        });
        if (!user) {
            throw new ApiError(StatusCodes.NOT_FOUND, "User not found");
        }

        try {
            const subscriptionService = new SubscriptionService();
            await subscriptionService.cancelStripeSubscription(userId);
        } catch (error) {
            console.error("Failed to safely cancel stripe sub during deleteMe", error);
        }

        await prisma.user.delete({ where: { id: userId } });
        return { success: true };
    }

    async deleteUser(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            throw new ApiError(StatusCodes.NOT_FOUND, "User not found");
        }

        // Only providers (and potentially clients if they have subscriptions) need Stripe cleanup
        // But the user said: "deleting the provider means u cancel the subsription and delete the customer in stripe"
        // We'll attempt Stripe cleanup if they have a stripeCustomerId
        if (user.stripeCustomerId) {
            try {
                const subscriptionService = new SubscriptionService();

                await subscriptionService.cancelStripeSubscription(userId);
            } catch (error) {
                console.error(`Failed to safely cancel stripe sub for user ${userId} during deletion`, error);
            }
        }

        await prisma.user.delete({ where: { id: userId } });
        return { success: true };
    }
}
