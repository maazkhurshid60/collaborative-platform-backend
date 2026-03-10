import bcrypt from "bcrypt";
import prisma from "../db/db.config";
import { Role, Gender, Approve } from "../generated/prisma/enums";
import { stripe, STRIPE_PRICES } from "../utils/stripe/stripe";
import { ApiError } from "../utils/apiError";
import { StatusCodes } from "http-status-codes";

export class AuthService {
    async signup(userData: any) {
        const {
            fullName,
            gender: genderInput = "male",
            age,
            contactNo,
            address,
            status = "active",
            licenseNo,
            role,
            email,
            password,
            country,
            state,
            publicKey,
            privateKey,
            planType
        } = userData;

        // 1. Convert gender string to Enum
        let genderEnum: Gender = Gender.MALE;
        if (genderInput === "female") genderEnum = Gender.FEMALE;

        // 2. Check for duplicate email or licenseNo
        const existingEmail = await prisma.user.findFirst({ where: { email } });
        if (existingEmail) {
            throw new ApiError(StatusCodes.CONFLICT, `Email ${email} is already registered.`);
        }

        if (licenseNo) {
            const existingLicense = await prisma.user.findFirst({ where: { licenseNo } });
            if (existingLicense) {
                throw new ApiError(StatusCodes.CONFLICT, `License Number ${licenseNo} is already registered.`);
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Handle Stripe trial for FREE plan or fetch existing subscription details
        let stripeData: { stripeCustomerId: string; stripeSubscriptionId: string; trialEnd?: Date; currentPeriodEnd?: Date } | null = null;
        let mappedPlanType = planType;

        const isValidDate = (d: Date | undefined) => d instanceof Date && !isNaN(d.getTime());

        if (userData.subscriptionId) {
            // User paid BEFORE signup, webhook missed them. Fetch details from Stripe so we can store next billing date.
            try {
                const existingStripeSub = await stripe.subscriptions.retrieve(userData.subscriptionId);
                // current_period_end is null on INCOMPLETE subscriptions — guard against NaN dates
                const periodEnd = existingStripeSub.current_period_end
                    ? new Date(existingStripeSub.current_period_end * 1000)
                    : undefined;
                stripeData = {
                    stripeCustomerId: existingStripeSub.customer as string,
                    stripeSubscriptionId: existingStripeSub.id,
                    ...(isValidDate(periodEnd) && { currentPeriodEnd: periodEnd })
                } as any;
            } catch (err: any) {
                console.error("❌ Failed to retrieve existing Stripe subscription during signup:", err);
            }
        } else if (planType === 'FREE') {
            mappedPlanType = 'STANDARD';
            try {
                const customer = await stripe.customers.create({
                    email: email,
                    name: fullName,
                    metadata: { role }
                });

                const subscription = await stripe.subscriptions.create({
                    customer: customer.id,
                    items: [{ price: STRIPE_PRICES.STANDARD.MONTHLY }],
                    trial_period_days: 14,
                    payment_behavior: 'default_incomplete',
                    metadata: { role, email, planType: 'STANDARD', userId: 'temp' }
                });

                const periodEnd = subscription.current_period_end
                    ? new Date(subscription.current_period_end * 1000)
                    : undefined;
                stripeData = {
                    stripeCustomerId: customer.id,
                    stripeSubscriptionId: subscription.id,
                    trialEnd: new Date(subscription.trial_end! * 1000),
                    ...(isValidDate(periodEnd) && { currentPeriodEnd: periodEnd })
                } as any;
            } catch (error: any) {
                console.error("❌ Stripe trial creation failed:", error);
                throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, "Failed to create trial subscription");
            }
        }

        // 4. Atomic Transaction
        const userResult = await prisma.$transaction(async (tx) => {
            const userCreated = await tx.user.create({
                data: {
                    fullName,
                    email,
                    password: hashedPassword,
                    gender: genderEnum,
                    age: age ?? null,
                    contactNo: contactNo ?? null,
                    address: address ?? null,
                    status: status || "active",
                    licenseNo: licenseNo ?? null,
                    role,
                    isApprove: userData.subscriptionId ? Approve.APPROVED : Approve.PENDING,
                    country,
                    state,
                    publicKey: publicKey ?? null,
                    privateKey: privateKey ?? null,
                    isLicenseValid: false,
                    stripeCustomerId: stripeData?.stripeCustomerId || userData.stripeCustomerId || userData.customerId || null,
                    hasUsedFreeTrial: Boolean(userData.subscriptionId || (planType === 'FREE' && stripeData)),
                    ...(userData.subscriptionId && {
                        subscription: {
                            create: {
                                stripeSubscriptionId: userData.subscriptionId,
                                plan: mappedPlanType || 'STANDARD',
                                status: 'ACTIVE',
                                ...(stripeData?.currentPeriodEnd && { currentPeriodEnd: stripeData.currentPeriodEnd })
                            }
                        }
                    }),
                    ...(planType && !userData.subscriptionId && {
                        subscription: {
                            create: {
                                stripeSubscriptionId: stripeData?.stripeSubscriptionId,
                                plan: mappedPlanType,
                                status: (planType === 'FREE' && stripeData) ? 'TRIALING' : 'ACTIVE',
                                ...(stripeData?.currentPeriodEnd && { currentPeriodEnd: stripeData.currentPeriodEnd }),
                                ...(planType === 'FREE' && stripeData && {
                                    trialStart: new Date(),
                                    trialEnd: stripeData.trialEnd
                                })
                            }
                        }
                    })
                }
            });

            let roleRecord;
            if (role === Role.client) {
                roleRecord = await tx.client.create({
                    data: { userId: userCreated.id, isAccountCreatedByOwnClient: userData.isAccountCreatedByOwnClient },
                    include: { user: true }
                });
            } else if (role === Role.provider) {
                roleRecord = await tx.provider.create({
                    data: { userId: userCreated.id, department: userData.department },
                    include: { user: true }
                });
            } else if (role === Role.superAdmin) {
                roleRecord = await tx.superAdmin.create({
                    data: { userId: userCreated.id },
                    include: { user: true }
                });
            }
            return roleRecord;
        });

        // 5. Invitations
        if (role === Role.provider && userData.inviteToken) {
            await this.processInvitation(userData.inviteToken, userData.email, (userResult as any).userId);
        }

        return await this.getCompleteUserData((userResult as any).userId, role);
    }

    private async processInvitation(token: string, email: string, newProviderUserId: string) {
        try {
            const invitation = await prisma.invitation.findFirst({
                where: { token, status: "PENDING" },
                include: { invitedBy: true }
            });

            if (invitation && invitation.email.toLowerCase() === email.toLowerCase()) {
                const inviterUserId = invitation.invitedBy.userId;
                if (newProviderUserId && inviterUserId && inviterUserId !== newProviderUserId) {
                    const [a, b] = [newProviderUserId, inviterUserId].sort();
                    await prisma.chatChannel.upsert({
                        where: { providerAId_providerBId: { providerAId: a, providerBId: b } },
                        update: {},
                        create: { providerAId: a, providerBId: b }
                    });
                    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } });
                }
            }
        } catch (error) {
            console.error("❌ Error during invitation processing:", error);
        }
    }

    async getCompleteUserData(userId: string, role: Role) {
        let completeUserData: any = null;
        const selectUser = {
            id: true,
            fullName: true,
            email: true,
            profileImage: true,
            role: true,
            status: true,
            isApprove: true,
            licenseNo: true,
            age: true,
            contactNo: true,
            address: true,
            country: true,
            state: true,
            hasUsedFreeTrial: true,
            subscription: {
                select: {
                    id: true,
                    plan: true,
                    status: true,
                    trialStart: true,
                    trialEnd: true,
                    currentPeriodEnd: true,
                    cancelAtPeriodEnd: true,
                    stripePriceId: true,
                    billingCycle: true
                }
            }
        };

        const safeUserWithRole = {
            select: {
                id: true,
                fullName: true,
                email: true,
                profileImage: true,
                role: true,
                status: true,
                isApprove: true,
                licenseNo: true,
                age: true,
                contactNo: true,
                address: true,
                country: true,
                state: true,
                hasUsedFreeTrial: true,
            }
        };

        if (role === Role.provider) {
            completeUserData = await prisma.provider.findUnique({
                where: { userId: userId },
                include: {
                    user: { select: selectUser },
                    clientList: {
                        include: {
                            client: {
                                include: { user: safeUserWithRole }
                            }
                        }
                    }
                }
            });
        } else if (role === Role.client) {
            completeUserData = await prisma.client.findUnique({
                where: { userId: userId },
                include: {
                    user: { select: selectUser },
                    providerList: {
                        include: {
                            provider: {
                                include: { user: safeUserWithRole }
                            }
                        }
                    }
                }
            });
        } else if (role === Role.superAdmin) {
            completeUserData = await prisma.superAdmin.findUnique({
                where: { userId: userId },
                include: { user: { select: selectUser } }
            });
        }

        if (completeUserData && completeUserData.user) {
            delete (completeUserData.user as any).password;
        }
        return completeUserData;
    }

    async login(email: string, passwordInput: string) {
        const user = await prisma.user.findUnique({
            where: { email },
            include: { client: true, provider: true, superAdmin: true }
        });

        if (!user) {
            throw new ApiError(StatusCodes.BAD_REQUEST, `Email: ${email} not found`);
        }

        if (!user.password) {
            throw new ApiError(StatusCodes.BAD_REQUEST, "Password not set for this account");
        }

        const isPasswordValid = await bcrypt.compare(passwordInput, user.password);
        if (!isPasswordValid) {
            throw new ApiError(StatusCodes.UNAUTHORIZED, "Invaild Credentails");
        }

        let roleId;
        if (user.role === Role.superAdmin) roleId = user.superAdmin?.id;
        else if (user.role === Role.client) roleId = user.client?.id;
        else if (user.role === Role.provider) roleId = user.provider?.id;

        if (!roleId) {
            throw new ApiError(StatusCodes.NOT_FOUND, `Account for ${email} is incomplete or invalid.`);
        }

        return await this.getCompleteUserData(user.id, user.role);
    }
}
