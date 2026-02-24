import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { clientSchema, loginSchema, providerSchema, superAdminSchema, userSchema } from "../../schema/auth/auth.schema";
import { ApiResponse } from "../../utils/apiResponse";
import { StatusCodes } from "http-status-codes";
import prisma from "../../db/db.config";
import { Role, Gender, Approve } from "../../generated/prisma/enums";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { cookiesOptions } from "../../utils/constants";
import { generateResetToken } from "../../utils/generateResetPasswordToken";
import { sendResetPasswordEmail } from "../../utils/nodeMailer/ResetPassword";
import crypto from "crypto";
import { stripe, STRIPE_PRICES } from "../../utils/stripe/stripe";
import { sendApprovalEmail } from "../../utils/nodeMailer/sendApprovalEmail";




const signupApi = asyncHandler(async (req: Request, res: Response) => {
    // 1. Validate User Schema (includes email/password now)
    const userParsedData = userSchema.safeParse(req.body);
    if (!userParsedData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed")
        );
    }

    const { fullName, gender: genderInput = "male", age, contactNo, address, status = "active", licenseNo, role, email, password, country, state, publicKey, privateKey } = userParsedData.data;

    // Convert gender string to Enum
    let genderEnum: Gender = Gender.MALE;
    if (genderInput === "female") genderEnum = Gender.FEMALE;

    // 2. Check for duplicate email or licenseNo (at User level)
    // Build OR condition dynamically to avoid undefined licenseNo issues
    const orConditions: any[] = [{ email }];
    if (licenseNo) {
        orConditions.push({ licenseNo });
    }

    const existingUser = await prisma.user.findFirst({
        where: {
            OR: orConditions
        }
    });

    if (existingUser) {
        const field = existingUser.licenseNo === licenseNo ? "License Number" : "Email";
        const value = existingUser.licenseNo === licenseNo ? licenseNo : email;
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `${field} ${value} is already registered.` }, "Validation failed")
        );
    }

    // 3. Prepare Role Data & Validate role-specific fields
    let roleData: any = {};
    let createRoleCallback: (tx: any, userId: string) => Promise<any>;

    if (role === Role.client) {
        const clientParsed = clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed")
            );
        }
        const { isAccountCreatedByOwnClient } = clientParsed.data;

        createRoleCallback = async (tx, userId) => {
            return await tx.client.create({
                data: { userId, isAccountCreatedByOwnClient },
                include: { user: true }
            });
        };

    } else if (role === Role.provider) {
        const providerParsed = providerSchema.safeParse(req.body);
        if (!providerParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: providerParsed.error.errors }, "Validation failed")
            );
        }
        const { department, inviteToken } = providerParsed.data;
        roleData = { inviteToken, email }; // Store email for invitation matching
        createRoleCallback = async (tx, userId) => {
            return await tx.provider.create({
                data: { userId, department },
                include: { user: true }
            });
        };

    } else if (role === Role.superAdmin) {
        const superAdminParsed = superAdminSchema.safeParse(req.body);
        if (!superAdminParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: superAdminParsed.error.errors }, "Validation failed")
            );
        }
        createRoleCallback = async (tx, userId) => {
            return await tx.superAdmin.create({
                data: { userId },
                include: { user: true }
            });
        };
    } else {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Invalid Role" }, "Validation failed")
        );
    }
    if (!password) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Password is required for signup" }, "Validation failed")
        );
    }
    // Hash password once
    const hashedPassword = await bcrypt.hash(password, 10);
    // 3.5 Create Stripe customer and trial subscription for FREE plan (Standard Trial)
    let stripeData: { stripeCustomerId: string; stripeSubscriptionId: string; trialEnd: Date } | null = null;
    let mappedPlanType = req.body.planType;

    // Map FREE plan to STANDARD for database and processing
    if (req.body.planType === 'FREE') {
        mappedPlanType = 'STANDARD';
    }

    if (req.body.planType === 'FREE') {
        try {
            // Create Stripe customer
            const customer = await stripe.customers.create({
                email: email,
                name: fullName,
                metadata: {
                    role: role
                }
            });

            // Create trial subscription with 14-day trial period
            const subscription = await stripe.subscriptions.create({
                customer: customer.id,
                items: [{ price: STRIPE_PRICES.STANDARD.MONTHLY }],
                trial_period_days: 14,

                payment_behavior: 'default_incomplete',
                metadata: {
                    role: role,
                    email: email,
                    planType: 'STANDARD',
                    userId: 'temp'
                }
            });

            stripeData = {
                stripeCustomerId: customer.id,
                stripeSubscriptionId: subscription.id,
                trialEnd: new Date(subscription.trial_end! * 1000)
            };
        } catch (error: any) {
            console.error("❌ Stripe trial creation failed:", error);
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
                new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: error.message }, "Failed to create trial subscription")
            );
        }
    }
    // 4. Atomic Creation Transaction
    const result = await prisma.$transaction(async (tx) => {
        // Create User with email and password
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
                isApprove: Approve.PENDING,
                country,
                state,
                publicKey: publicKey ?? null,
                privateKey: privateKey ?? null,
                isLicenseValid: false, // Explicitly set default
                stripeCustomerId: stripeData?.stripeCustomerId || (req.body.stripeCustomerId as string) || (req.body.customerId as string) || null,

                hasUsedFreeTrial: Boolean(req.body.subscriptionId || (req.body.planType === 'FREE' && stripeData)),

                ...(req.body.subscriptionId && {
                    subscription: {
                        create: {
                            stripeSubscriptionId: req.body.subscriptionId,
                            plan: mappedPlanType || 'STANDARD',
                            status: 'ACTIVE'
                        }
                    }
                }),
                ...(req.body.planType && !req.body.subscriptionId && {
                    subscription: {
                        create: {
                            stripeSubscriptionId: stripeData?.stripeSubscriptionId,
                            plan: mappedPlanType,
                            status: (req.body.planType === 'FREE' && stripeData) ? 'TRIALING' : 'ACTIVE',
                            ...(req.body.planType === 'FREE' && stripeData && {
                                trialStart: new Date(),
                                trialEnd: stripeData.trialEnd
                            })
                        }
                    }
                })
            }
        });

        // Create role-specific record
        const roleCreated = await createRoleCallback(tx, userCreated.id);

        return roleCreated;
    });
    // 5. Post-Transaction Logic (Invitations for Providers)
    if (role === Role.provider && roleData.inviteToken) {
        try {
            const invitation = await prisma.invitation.findFirst({
                where: { token: roleData.inviteToken, status: "PENDING" },
                include: { invitedBy: true }
            });

            if (invitation && invitation.email.toLowerCase() === roleData.email.toLowerCase()) {
                const inviterProvider = invitation.invitedBy;
                const newProviderUserId = (result as any).userId;
                const inviterUserId = inviterProvider.userId;

                console.log(`🔗 [CHAT] Invitation matched. Linking new provider ${newProviderUserId} with inviter ${inviterUserId}`);

                if (newProviderUserId && inviterUserId && inviterUserId !== newProviderUserId) {
                    const [a, b] = [newProviderUserId, inviterUserId].sort();

                    await prisma.chatChannel.upsert({
                        where: {
                            providerAId_providerBId: {
                                providerAId: a,
                                providerBId: b
                            }
                        },
                        update: {},
                        create: {
                            providerAId: a,
                            providerBId: b
                        }
                    });

                    await prisma.invitation.update({
                        where: { id: invitation.id },
                        data: { status: "ACCEPTED" }
                    });

                    console.log(`✅ Automatic chat channel created and invitation accepted.`);
                } else {
                    console.warn(`⚠️ Chat channel skip: IDs mismatch or missing.`);
                }
            } else if (!invitation) {
                console.warn(`⚠️ Invalid, mismatched or already accepted invitation token: ${roleData.inviteToken}`);
            } else {
                console.warn(`⚠️ Invitation email mismatch. Invited: ${invitation.email}, Signup: ${roleData.email}`);
            }
        } catch (chatError) {
            console.error("❌ Error during invitation processing:", chatError);
        }
    }
    // 6. Fetch complete user data with subscription (like login does)
    let completeUserData: any = null;
    if (role === Role.provider) {
        completeUserData = await prisma.provider.findUnique({
            where: { id: (result as any).id },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        profileImage: true,
                        role: true,
                        status: true,
                        isApprove: true,
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
                        },
                        address: true
                    }
                },
                clientList: true
            }
        });
    } else if (role === Role.client) {
        completeUserData = await prisma.client.findUnique({
            where: { id: (result as any).id },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        profileImage: true,
                        role: true,
                        status: true,
                        isApprove: true,
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
                                billingCycle: true
                            }
                        }
                    }
                },
                providerList: true
            }
        });
    } else if (role === Role.superAdmin) {
        completeUserData = await prisma.superAdmin.findUnique({
            where: { id: (result as any).id },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        profileImage: true,
                        role: true,
                        status: true,
                        isApprove: true,
                        hasUsedFreeTrial: true,
                        address: true,
                        subscription: {
                            select: {
                                id: true,
                                plan: true,
                                status: true,
                                trialStart: true,
                                trialEnd: true,
                                currentPeriodEnd: true,
                                cancelAtPeriodEnd: true,
                                billingCycle: true
                            }
                        }
                    }
                }
            }
        });
    }

    // 7. Response
    const message = role === Role.client
        ? "Your account has been sent to the super admin for verification. You will receive a verification email once approved, after which you'll be able to log in."
        : "Your account has been created successfully. Please log in to continue.";

    const userData = completeUserData || result;
    // Remove password from response
    if (userData.user && (userData.user as any).password) {
        delete (userData.user as any).password;
    }

    console.log('🔍 [SIGNUP] Sending response with subscription:', userData.user?.subscription);

    // 🔧 FIX RACE CONDITION: Create initial payment record if paid subscription
    // Webhook might fire BEFORE user creation completes, so we handle it here
    if (req.body.subscriptionId && userData.user?.id) {
        try {
            const { stripe } = await import('../../utils/stripe/stripe');

            // Retrieve the subscription to get invoice details
            const stripeSub = await stripe.subscriptions.retrieve(req.body.subscriptionId as string, {
                expand: ['latest_invoice']
            });

            const latestInvoice: any = stripeSub.latest_invoice;

            // Update subscription with billing period and price details
            const subscriptionUpdateData: any = {
                currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
                stripePriceId: stripeSub.items.data[0]?.price?.id || null
            };

            // Determine billing cycle from price metadata or recurring interval
            const priceInterval = stripeSub.items.data[0]?.price?.recurring?.interval;
            if (priceInterval === 'month') {
                subscriptionUpdateData.billingCycle = 'MONTHLY';
            } else if (priceInterval === 'year') {
                subscriptionUpdateData.billingCycle = 'YEARLY';
            }

            await prisma.subscription.update({
                where: { userId: userData.user.id },
                data: subscriptionUpdateData
            });

            // Update the response object so frontend gets the latest data
            if (userData.user.subscription) {
                userData.user.subscription.currentPeriodEnd = subscriptionUpdateData.currentPeriodEnd;
                userData.user.subscription.stripePriceId = subscriptionUpdateData.stripePriceId;
                if (subscriptionUpdateData.billingCycle) {
                    userData.user.subscription.billingCycle = subscriptionUpdateData.billingCycle;
                }
            }
            console.log(`✅ Subscription updated with billing details for user ${userData.user.id}`);

            if (latestInvoice && latestInvoice.amount_paid > 0) {
                // Check if payment already exists (webhook might have created it)
                const existingPayment = await prisma.payment.findFirst({
                    where: { stripeInvoiceId: latestInvoice.id }
                });

                if (!existingPayment) {
                    let last4 = null;
                    try {
                        // Retrieve payment method details for last4
                        if (latestInvoice.payment_intent) {
                            const pi: any = await stripe.paymentIntents.retrieve(latestInvoice.payment_intent as string, {
                                expand: ['payment_method']
                            });
                            last4 = pi.payment_method?.card?.last4 || pi.metadata?.last4;
                        }

                        // Fallback to charge if needed
                        if (!last4 && latestInvoice.charge) {
                            const charge = await stripe.charges.retrieve(latestInvoice.charge as string);
                            last4 = (charge.payment_method_details as any)?.card?.last4;
                        }
                    } catch (err) {
                        console.error("⚠️ Failed to retrieve payment method details for last4 in signup:", err);
                    }

                    await prisma.payment.create({
                        data: {
                            userId: userData.user.id,
                            amount: latestInvoice.amount_paid,
                            currency: latestInvoice.currency,
                            status: 'SUCCEEDED',
                            plan: req.body.planType || 'STANDARD', // Store plan at time of payment
                            stripePaymentIntentId: latestInvoice.payment_intent || "signup_payment",
                            stripeInvoiceId: latestInvoice.id,
                            invoiceUrl: latestInvoice.hosted_invoice_url,
                            paymentMethodLast4: last4
                        }
                    });
                    console.log(`✅ Initial payment record created for user ${userData.user.id} with last4: ${last4}`);
                } else {
                    console.log(`ℹ️ Payment already exists (created by webhook)`);
                }
            }
        } catch (paymentErr) {
            console.error('⚠️ Failed to create initial payment record:', paymentErr);
            // Don't fail the signup if payment record creation fails
        }
    }

    // Auto-Login JWT
    const jwtSecret = process.env.JWT_SECRET || "default_secret";
    const token = jwt.sign(
        { userId: userData.user.id, email: userData.user.email, role },
        jwtSecret,
        { expiresIn: "45m" }
    );

    return res
        .status(StatusCodes.CREATED)
        .cookie("accessToken", token, cookiesOptions)
        .cookie("token", token, cookiesOptions)
        .json(
            new ApiResponse(StatusCodes.CREATED, { token, user: userData }, message)
        );
});
const updateMeApi = asyncHandler(async (req: Request, res: Response) => {
    const loginUserId = (req as any).user.id;

    if (req.body.age) {
        req.body.age = Number(req.body.age);
    }

    if (req.body.isAccountCreatedByOwnClient) {
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";
    }

    const files = req.files as {
        profileImage?: Express.Multer.File[];
        eSignature?: Express.Multer.File[];
    };

    const profileImage = files?.profileImage?.[0] as any;;
    const eSignature = files?.eSignature?.[0] as any;


    const existingUser = await prisma.user.findFirst({
        where: { id: loginUserId },
        select: { profileImage: true, role: true, email: true, password: true }
    });

    if (!existingUser) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "User does not exist." }, "Not Found Error.")
        );
    }

    let profileImageUpdate: string | undefined = undefined;

    if (profileImage) {
        profileImageUpdate = profileImage.location;
    }

    const userParsedData = userSchema.safeParse({
        ...req.body,
        profileImage: profileImageUpdate !== undefined ? profileImageUpdate : existingUser.profileImage
    });

    if (!userParsedData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed")
        );
    }

    const { fullName, gender, age, contactNo, address, status, licenseNo, role, country, state, email, password } = userParsedData.data;

    // Check email uniqueness if email is changing
    if (email && email !== existingUser.email) {
        const emailExists = await prisma.user.findUnique({
            where: { email }
        });
        if (emailExists) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }
    }

    let newPassword = undefined;
    if (password && password.trim() !== "") {
        newPassword = await bcrypt.hash(password, 10);
    }

    // Convert gender string to Enum
    let genderEnum: Gender = Gender.MALE;
    if (gender === "female") genderEnum = Gender.FEMALE;

    const updatedUser = await prisma.user.update({
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
            country, state,
            // Only update profileImage if it was explicitly changed
            ...(profileImageUpdate !== undefined && { profileImage: profileImageUpdate }),
            // Update email if provided
            ...(email && { email }),
            // Update password if provided
            ...(newPassword && { password: newPassword })
        }
    });

    // Handle Client Update
    if (role === Role.client) {

        const clientParsed = clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed")
            );
        }

        // Removed email/password extraction from clientParsed as they are now on User

        const updateData: any = {};

        // Handle eSignature updates
        const wantsRemove = String(req.body.eSignature).toLowerCase() === "null";
        if (eSignature) {
            updateData.eSignature = eSignature.location;
        } else if (wantsRemove) {
            updateData.eSignature = "null";
        }

        const userId = String(loginUserId);

        const clientUpdate = await prisma.client.update({
            where: { userId },
            data: updateData,
            include: {
                user: {
                    include: {
                        subscription: true
                    }
                }
            }
        });

        if (clientUpdate && clientUpdate.user && (clientUpdate.user as any).password) {
            delete (clientUpdate.user as any).password;
        }

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, clientUpdate, "User updated successfully")
        );
    }

    // Handle Provider Update
    else if (role === Role.provider) {
        const providerParsed = providerSchema.safeParse(req.body);
        if (!providerParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: providerParsed.error.errors }, "Validation failed")
            );
        }

        const { department } = providerParsed.data;

        const updateData: any = {
            department,
        };

        const providerUpdate = await prisma.provider.update({
            where: { userId: loginUserId },
            data: updateData,
            include: {
                user: {
                    include: {
                        subscription: true
                    }
                }
            }
        });

        if (providerUpdate && providerUpdate.user && (providerUpdate.user as any).password) {
            delete (providerUpdate.user as any).password;
        }

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, providerUpdate, "User updated successfully")
        );
    }
});

const logInApi = asyncHandler(async (req: Request, res: Response) => {
    const parsedLoginData = loginSchema.safeParse(req.body);

    if (!parsedLoginData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: parsedLoginData.error.errors }, "Validation failed")
        );
    }

    const { email, password } = parsedLoginData.data;

    // 1. Find User by email
    const user = await prisma.user.findUnique({
        where: { email },
        include: {
            client: true,
            provider: true,
            superAdmin: true
        }
    });

    if (!user) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: `Email: ${email} not found` }, "Validation failed")
        );
    }

    if (!user.password) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Password not set for this account" }, "Validation failed")
        );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(StatusCodes.UNAUTHORIZED).json(
            new ApiResponse(StatusCodes.UNAUTHORIZED, { error: "Incorrect password" }, "Authentication failed")
        );
    }

    const role = user.role;
    let loggedInUser: any = null;

    if (role === Role.superAdmin) {
        loggedInUser = await prisma.superAdmin.findUnique({
            where: { userId: user.id },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        profileImage: true,
                        role: true,
                        status: true,
                        isApprove: true,
                        address: true,
                        subscription: {
                            select: {
                                id: true,
                                plan: true,
                                status: true,
                                trialStart: true,
                                trialEnd: true,
                                currentPeriodEnd: true,
                                cancelAtPeriodEnd: true,
                                billingCycle: true
                            }
                        }
                    }
                }
            }
        });
    } else if (role === Role.client) {
        loggedInUser = await prisma.client.findUnique({
            where: { userId: user.id },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        profileImage: true,
                        role: true,
                        status: true,
                        isApprove: true,
                        address: true,
                        age: true,
                        contactNo: true,
                        gender: true,
                        country: true,
                        state: true,
                        licenseNo: true,
                    }
                }, providerList: true
            }
        });
    } else if (role === Role.provider) {
        loggedInUser = await prisma.provider.findUnique({
            where: { userId: user.id },
            include: {
                user: {
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
                        gender: true,
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
                                billingCycle: true
                            }
                        }
                    }
                },

            }
        });
    }

    if (!loggedInUser) {
        // Fallback if role record is missing but user exists (should not happen in consistent DB)
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: "User role data missing" }, "Login failed")
        );
    }

    const jwtSecret = process.env.JWT_SECRET || "default_secret";
    const token = jwt.sign(
        { userId: user.id, email: user.email, role },
        jwtSecret,
        { expiresIn: "45m" }
    );

    // Remove password from response
    if (loggedInUser.user && (loggedInUser.user as any).password) {
        delete (loggedInUser.user as any).password;
    }

    // DEBUG: Log what we're sending
    console.log('🔍 [LOGIN] Sending response for user:', loggedInUser.user?.email);
    console.log('🔍 [LOGIN] User object keys:', Object.keys(loggedInUser.user || {}));
    console.log('🔍 [LOGIN] Subscription data:', loggedInUser.user?.subscription);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { token, user: loggedInUser }, "Login successful")
    );
});

const blockUserApi = asyncHandler(async (req: Request, res: Response) => {
    const { blockUserid, loginUserId } = req.body;

    // 1. Check if block user exists
    const isBlockUserExist = await prisma.user.findUnique({ where: { id: blockUserid } });
    if (!isBlockUserExist) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "User to be blocked not found" }, "Validation failed")
        );
    }

    // 2. Get login user (who wants to block someone)
    const loginUser = await prisma.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Blocking user not found" }, "Validation failed")
        );
    }

    // 3. If already blocked, return early
    if (loginUser.blockedMembers.includes(blockUserid)) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: "User is already blocked" }, "Already blocked")
        );
    }

    // 4. Add blockUserid to blockedMembers list
    const updatedBlockedMembers = [...loginUser.blockedMembers, blockUserid];

    // 5. Update user
    const updatedUser = await prisma.user.update({
        where: { id: loginUserId },
        data: {
            blockedMembers: updatedBlockedMembers,
        },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { user: updatedUser }, "User blocked successfully")
    );
});

const getAllUsersApi = asyncHandler(async (req: Request, res: Response) => {
    const allUsers = await prisma.user.findMany({
        select: {
            id: true,
            fullName: true,
            email: true,
            licenseNo: true,
            age: true,
            contactNo: true,
            address: true,
            country: true,
            state: true,
            profileImage: true,
            isApprove: true,
            role: true,
            createdAt: true,
            client: true,
            provider: true
        }
    })
    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { totalDocument: allUsers.length, user: allUsers }, "User fetched successfully")
    );
})

// const approveValidUser = asyncHandler(async (req: Request, res: Response) => {
//     const { id, name, email } = req.body

//     const isUserExist = await prisma.user.findFirst({ where: { id } })
//     if (!isUserExist) {
//         return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error"))
//     }

//     const isUserApproved = await prisma.user.update({
//         where: { id }, data: {
//             isApprove: "approve"
//         }
//     })
//     // await sendVerificationEmail(email, name);


//     if (isUserApproved) {
//         return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { message: "User approved successfully." }, "Approve"))
//     }

// })


const approveValidUser = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.body;

    const user = await prisma.user.findFirst({
        where: { id },
        include: { client: true, provider: true, superAdmin: true },
    });

    if (!user) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { message: "User does not exist." }, "Not Found Error")
        );
    }

    await prisma.user.update({
        where: { id },
        data: { isApprove: Approve.APPROVED },
    });

    const email = user.email;

    if (email) {
        try {
            await sendApprovalEmail(email, user.fullName, user.licenseNo ?? "");
        } catch (err) {
            console.error("Approval email failed:", err);
            // Do not fail approval just because email failed
        }
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { message: "User approved successfully." }, "Approve")
    );
});

const rejectUser = asyncHandler(async (req: Request, res: Response) => {
    const { id, name } = req.body // removed email from destructuring as we get it from DB if needed, or unused.

    const user = await prisma.user.findFirst({ where: { id } })
    if (!user) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error"))
    }

    const isUserApproved = await prisma.user.update({
        where: { id }, data: {
            isApprove: Approve.REJECTED
        }
    })

    // If we need to send email, use user.email
    // await sendVerificationEmail(user.email, name);

    if (isUserApproved) {
        return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { message: "User rejected successfully." }, "reject"))
    }

})
const restoreUser = asyncHandler(async (req: Request, res: Response) => {
    const { id, name } = req.body

    const user = await prisma.user.findFirst({ where: { id } })
    if (!user) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error"))
    }

    const isUserApproved = await prisma.user.update({
        where: { id }, data: {
            isApprove: Approve.PENDING
        }
    })

    // if email needed, use user.email
    // await sendVerificationEmail(user.email, name);


    if (isUserApproved) {
        return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { message: "User restored successfully." }, "restore"))
    }

})

const getAllValidUsersApi = asyncHandler(async (req: Request, res: Response) => {
    const allUsers = await prisma.user.findMany({
        where: {
            isApprove: Approve.APPROVED,
            NOT: {
                role: Role.superAdmin
            }
        }
    })
    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { totalDocument: allUsers.length, user: allUsers }, "User fetched successfully")
    );
})

const unblockUserApi = asyncHandler(async (req: Request, res: Response) => {
    const { blockUserid, loginUserId } = req.body;

    // 1. Check if block user exists
    const isBlockUserExist = await prisma.user.findUnique({ where: { id: blockUserid } });
    if (!isBlockUserExist) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "User to be blocked not found" }, "Validation failed")
        );
    }

    // 2. Get login user (who wants to block someone)
    const loginUser = await prisma.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Blocking user not found" }, "Validation failed")
        );
    }

    const updatedBlockedMembersList = loginUser.blockedMembers?.filter(data => data !== blockUserid)
    const updatedUser = await prisma.user.update({
        where: { id: loginUserId },
        data: {
            blockedMembers: updatedBlockedMembersList,
        },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { user: updatedUser }, "User unblocked successfully")
    );
})

const logoutApi = asyncHandler(async (req: Request, res: Response) => {
    // Clearing all possible token variants
    return res
        .clearCookie("accessToken", cookiesOptions)
        .clearCookie("token", cookiesOptions)
        .clearCookie("refreshToken", cookiesOptions)
        .status(200)
        .json(new ApiResponse(StatusCodes.OK, {}, "Logout successful"));
});

const deleteMeAccountApi = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId } = req.body

    const isUserExist = await prisma.user.findFirst({ where: { id: loginUserId } })

    if (!isUserExist) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error"))
    }


    const isUserDeleted = await prisma.user.delete({ where: { id: loginUserId } })

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { message: "" }, "User deleted successfully")
    );

})
const getMeApi = asyncHandler(async (req: Request, res: Response) => {
    const loginUserId = (req as any).user.id;
    const role = (req as any).user.role;

    let getMeDetails
    // Handle Clients
    if (role === Role.client) {
        getMeDetails = await prisma.client.findFirst({
            where: { userId: loginUserId },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        address: true,
                        contactNo: true,
                        gender: true,
                        role: true,
                        status: true,
                        isApprove: true,
                        licenseNo: true,
                        age: true,
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
                                billingCycle: true
                            }
                        }
                    }
                }
            }
        })

        if (getMeDetails && (getMeDetails as any).password) {
            delete (getMeDetails as any).password;
        }

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { data: getMeDetails }, "OK")
        );


    }
    // Handle Provider
    else if (role === Role.provider) {
        getMeDetails = await prisma.provider.findFirst({
            where: { userId: loginUserId },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        address: true,
                        role: true,
                        status: true,
                        licenseNo: true,
                        country: true,
                        state: true,
                        isApprove: true,
                        age: true,
                        contactNo: true,
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
                                billingCycle: true
                            }
                        }
                    }
                },
                clientList: {
                    select: {
                        client: {
                            select: {
                                user: {
                                    select: {
                                        fullName: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })

        if (getMeDetails && (getMeDetails as any).password) {
            delete (getMeDetails as any).password;
        }

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { data: getMeDetails }, "OK")
        );
    }
});
const findByLicenseNo = asyncHandler(async (req: Request, res: Response) => {
    const { licenseNo } = req.body
    if (!licenseNo) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "License number is required" }, "Validation failed")
        );
    }

    const licenseNoFound = await prisma.user.findFirst({
        where: { licenseNo },
        include: { client: true }
    })

    if (!licenseNoFound) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "License number not found" }, "Record not found")
        );
    }

    // Remove passwords before returning
    if (licenseNoFound.client && (licenseNoFound.client as any).password) {
        delete (licenseNoFound.client as any).password;
    }
    if ((licenseNoFound as any).password) {
        delete (licenseNoFound as any).password;
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { data: licenseNoFound }, "Record found.")
    );
})

const changePasswordApi = asyncHandler(async (req: Request, res: Response) => {
    const { oldPassword, newPassword, loginUserId, confirmPassword, role } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { message: "All fields are required" }, "Validation failed")
        );
    }

    if (newPassword !== confirmPassword) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { message: "Confirm and New Password should match" }, "Validation failed")
        );
    }

    // Find User (source of truth for password)
    const user = await prisma.user.findUnique({
        where: { id: loginUserId }
    });

    if (!user) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { message: "User does not exist." }, "Validation failed")
        );
    }

    const isPasswordMatch = await bcrypt.compare(oldPassword, user.password);

    if (isPasswordMatch) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: loginUserId },
            data: { password: hashedPassword }
        });

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { message: "Password has updated successfully" }, "Password has updated successfully")
        );
    } else {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { message: "Password not Matched" }, "Password not Match")
        );
    }
});

const forgotPasswordApi = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    const user = await prisma.user.findFirst({ where: { email } });

    if (!user) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is not found.` }, "Validation failed")
        );
    }

    const { token, hashedToken } = generateResetToken();

    const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
            // NOTE: Fields missing in schema
            // resetPasswordToken: hashedToken,
            // resetPasswordExpires: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
        },
    });

    try {
        await sendResetPasswordEmail(email, user.fullName, token);
    } catch (err) {
        console.error("Failed to send reset email");
    }

    return res.status(200).json(
        new ApiResponse(200, { success: true, user: updatedUser }, "Reset link sent successfully")
    );
});


const resetPasswordApi = asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;
    const { newPassword } = req.body;

    return res.status(StatusCodes.NOT_IMPLEMENTED).json(
        new ApiResponse(StatusCodes.NOT_IMPLEMENTED, null, "Password reset is currently disabled as the database schema does not support reset tokens.")
    );

    /*
    // ORIGINAL LOGIC DISABLED DUE TO MISSING SCHEMA FIELDS (resetPasswordToken, resetPasswordExpires)
    const hashedToken = crypto.createHash("sha256").update(token as string).digest("hex");

    const user = await prisma.user.findFirst({
        where: {
            // resetPasswordToken: hashedToken,
            // resetPasswordExpires: { gt: new Date() },
        },
    });

    if (!user) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Invalid or expired token" }, "Token invalid")
        );
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: hashedNewPassword,
            // resetPasswordToken: null,
            // resetPasswordExpires: null,
        },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { message: "Password reset successful" }, "Success")
    );
    */
});


const startTrialApi = asyncHandler(async (req: Request, res: Response) => {
    const { newProviderId, invitedById } = req.body;

    if (!newProviderId) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, null, "newProviderId is required.")
        );
    }

    try {
        const provider = await prisma.provider.findUnique({
            where: { id: newProviderId },
            include: { user: true }
        });

        if (!provider) {
            return res.status(StatusCodes.NOT_FOUND).json(
                new ApiResponse(StatusCodes.NOT_FOUND, null, "Provider not found.")
            );
        }

        // 1. Create or retrieve Stripe Customer
        let stripeCustomerId: string;
        const customer = await stripe.customers.create({
            email: provider.user.email,
            name: provider.user.fullName,
            metadata: { userId: provider.user.id }
        });
        stripeCustomerId = customer.id;

        // 2. Create Stripe trial subscription
        const stripeSubscription = await stripe.subscriptions.create({
            customer: stripeCustomerId,
            items: [{ price: STRIPE_PRICES.STANDARD.MONTHLY }],
            trial_period_days: 14,
            metadata: { userId: provider.user.id }
        });

        // 3. Create Subscription in DB
        await prisma.subscription.create({
            data: {
                userId: provider.user.id,
                stripeCustomerId: stripeCustomerId,
                stripeSubscriptionId: stripeSubscription.id,
                plan: "STANDARD",
                status: "TRIALING",
                trialStart: new Date(),
                // trailEnd: new Date(stripeSubscription.current_period_end * 1000),
                // currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000)
            }
        });

        // 4. Handle Invited Chat Initialization
        if (invitedById) {
            const [a, b] = [newProviderId, invitedById].sort();
            const existingChannel = await prisma.chatChannel.findFirst({
                where: { providerAId: a, providerBId: b }
            });

            if (!existingChannel) {
                await prisma.chatChannel.create({
                    data: {
                        providerAId: a,
                        providerBId: b,
                    }
                });
            }
        }

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { message: "Trial started successfully." }, "OK")
        );
    } catch (error) {
        console.error("Start trial error:", error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, null, "Failed to start trial.")
        );
    }
});

const verifyInvitationToken = asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, null, "Token is required.")
        );
    }
    const invitation = await prisma.invitation.findUnique({
        where: {
            token: token
        },
        include: {
            invitedBy: {
                select: {
                    user: {
                        select: {
                            fullName: true,
                            address: true,
                            country: true,
                            state: true,
                            licenseNo: true
                        }
                    }
                }
            }
        }
    })

    if (!invitation || invitation.status !== "PENDING") {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, null, "Invalid or expired token.")
        )
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            email: invitation.email,
            invitedByName: invitation.invitedBy.user.fullName,
        }, "OK")
    )
})

// Check if email or license number already exists (called before navigating to plan selection)
const checkEmailExistsApi = asyncHandler(async (req: Request, res: Response) => {
    const { email, licenseNo } = req.body;

    if (!email) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Email is required" }, "Validation failed")
        );
    }

    const existingEmail = await prisma.user.findUnique({
        where: { email }
    });

    if (existingEmail) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { exists: true, field: 'Email' }, "Email already registered")
        );
    }

    if (licenseNo) {
        const existingLicense = await prisma.user.findFirst({
            where: { licenseNo }
        });

        if (existingLicense) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { exists: true, field: 'License Number' }, "License Number already registered")
            );
        }
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { exists: false }, "Available")
    );
});


export {
    signupApi, logInApi, blockUserApi, unblockUserApi, logoutApi, updateMeApi, deleteMeAccountApi, approveValidUser, rejectUser, restoreUser,
    getMeApi, getAllUsersApi, findByLicenseNo, changePasswordApi, forgotPasswordApi, resetPasswordApi, getAllValidUsersApi, startTrialApi, verifyInvitationToken,
    checkEmailExistsApi
};
