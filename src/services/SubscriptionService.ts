import prisma from "../db/db.config";
import { StripeService } from "./StripeService";
import Stripe from "stripe";
import { STRIPE_PRICES } from "../utils/stripe/stripe";
import { ApiError } from "../utils/apiError";
import { StatusCodes } from "http-status-codes";
import { io } from "../socket/socket";

const stripeService = new StripeService();

export class SubscriptionService {
    async startTrial(providerId: string, invitedById?: string) {
        const provider = await prisma.provider.findUnique({
            where: { id: providerId },
            include: { user: true }
        });

        if (!provider) {
            throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found.");
        }

        // 1. Create or retrieve Stripe Customer
        const customer = await stripeService.createCustomer(
            provider.user.email,
            provider.user.fullName,
            { userId: provider.user.id }
        );

        // 2. Create Stripe trial subscription
        const stripeSubscription = await stripeService.createSubscription({
            customer: customer.id,
            items: [{ price: STRIPE_PRICES.STANDARD.MONTHLY! }],
            trial_period_days: 14,
            metadata: { userId: provider.user.id }
        });

        // 3. Create Subscription in DB
        const sub = await prisma.subscription.create({
            data: {
                userId: provider.user.id,
                stripeCustomerId: customer.id,
                stripeSubscriptionId: stripeSubscription.id,
                plan: "STANDARD",
                status: "TRIALING",
                trialStart: new Date(),
                trialEnd: new Date((stripeSubscription.trial_end || (Date.now() / 1000 + 14 * 24 * 60 * 60)) * 1000)
            }
        });

        // 4. Handle Invited Chat Initialization
        if (invitedById) {
            const inviter = await prisma.provider.findUnique({
                where: { id: invitedById },
                select: { userId: true }
            });

            if (inviter) {
                const [a, b] = [provider.user.id, inviter.userId].sort();
                await prisma.chatChannel.upsert({
                    where: { providerAId_providerBId: { providerAId: a, providerBId: b } },
                    update: {},
                    create: { providerAId: a, providerBId: b }
                });
            }
        }

        return sub;
    }

    async createCheckoutSession(userId: string, planType: string, period: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true }
        });

        if (!user) throw new ApiError(StatusCodes.NOT_FOUND, "User not found");

        const normalizedPlan = planType.toUpperCase();
        const normalizedPeriod = period.toUpperCase();
        const priceId = (STRIPE_PRICES as any)[normalizedPlan]?.[normalizedPeriod];
        if (!priceId) throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid plan or period");

        let customerId = user.stripeCustomerId || user.subscription?.stripeCustomerId;

        if (!customerId) {
            const customer = await stripeService.createCustomer(user.email, user.fullName, { userId: user.id });
            customerId = customer.id;
        }

        const sessionConfig: any = {
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${process.env.FRONTEND_URL}/payment-success`,
            cancel_url: `${process.env.FRONTEND_URL}/payment-failure`,
            metadata: { userId: user.id, planType }
        };

        if (planType === 'STANDARD' && !user.hasUsedFreeTrial) {
            sessionConfig.subscription_data = {
                trial_period_days: 14,
                metadata: { planType, userId: user.id, email: user.email }
            };
        } else {
            sessionConfig.subscription_data = {
                metadata: { planType, userId: user.id, email: user.email }
            };
        }

        return await stripeService.createCheckoutSession(sessionConfig);
    }

    async cancelSubscription(userId: string, reason?: string) {
        const sub = await prisma.subscription.findUnique({ where: { userId } });
        if (!sub) throw new ApiError(StatusCodes.NOT_FOUND, "No active subscription found");

        if (sub.stripeSubscriptionId) {
            let amountSnapshot = 0;
            let currency = 'usd';
            let periodStart: Date | null = null;
            let periodEnd: Date | null = null;

            // Attempt to retrieve + cancel on Stripe.
            // If the sub was already cancelled (e.g. from a previous failed attempt),
            // Stripe returns "No such subscription" — we ignore that and just update the DB.
            try {
                const stripeSub = await stripeService.retrieveSubscription(sub.stripeSubscriptionId);
                amountSnapshot = stripeSub.items.data[0].plan.amount || 0;
                currency = stripeSub.items.data[0].plan.currency || 'usd';

                // current_period_start/end are null on INCOMPLETE subscriptions — guard against NaN dates
                if (stripeSub.current_period_start) {
                    periodStart = new Date(stripeSub.current_period_start * 1000);
                }
                if (stripeSub.current_period_end) {
                    periodEnd = new Date(stripeSub.current_period_end * 1000);
                }

                await stripeService.cancelSubscription(sub.stripeSubscriptionId);
            } catch (err: any) {
                // "resource_missing" means subscription is already gone from Stripe — safe to continue with DB update
                if (err?.code !== 'resource_missing') {
                    console.warn("Could not cancel Stripe subscription:", err?.message);
                }
            }

            await prisma.$transaction([
                prisma.subscription.update({
                    where: { userId },
                    data: {
                        status: "CANCELED",
                        cancelAtPeriodEnd: false,
                        cancelReason: reason
                    }
                }),
                prisma.payment.create({
                    data: {
                        userId,
                        amount: amountSnapshot,
                        currency,
                        status: 'CANCELED',
                        plan: sub.plan,
                        stripePaymentIntentId: `manual_cancel_${Date.now()}`,
                        stripeInvoiceId: `cancel_${sub.stripeSubscriptionId}_${Date.now()}`,
                        ...(periodStart && { periodStart }),
                        ...(periodEnd && { periodEnd })
                    }
                })
            ]);
        } else {
            await prisma.subscription.update({
                where: { userId },
                data: { status: "CANCELED", cancelReason: reason }
            });
        }

        io.to(userId).emit("subscription_updated");
        return { success: true };
    }

    async createSubscriptionIntent(data: { email: string, name: string, planType: string, period: string }) {
        const { email, name, planType, period } = data;
        const normalizedPlan = planType.toUpperCase();
        const normalizedPeriod = period.toUpperCase();
        const priceId = (STRIPE_PRICES as any)[normalizedPlan]?.[normalizedPeriod];
        if (!priceId) throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid plan or period");

        let user = await prisma.user.findUnique({ where: { email } });
        let customerId = user?.stripeCustomerId;

        if (!customerId) {
            const customer = await stripeService.createCustomer(email, name, {
                userId: user?.id || "temp",
                tempUser: user ? "false" : "true"
            });
            customerId = customer.id;
            if (user) await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
        }

        // Cancel existing
        if (user) {
            const existingSub = await prisma.subscription.findUnique({ where: { userId: user.id } });
            if (existingSub?.stripeSubscriptionId) {
                try {
                    await stripeService.cancelSubscription(existingSub.stripeSubscriptionId);
                } catch (e) { console.warn("Could not cancel old sub", e); }
            }
        }

        const subscription = await stripeService.createSubscription({
            customer: customerId!,
            items: [{ price: priceId }],
            collection_method: 'charge_automatically',
            payment_behavior: 'default_incomplete',
            payment_settings: { save_default_payment_method: 'on_subscription', payment_method_types: ['card'] },
            expand: ['latest_invoice.confirmation_secret', 'latest_invoice.payment_intent', 'pending_setup_intent'],
            metadata: { planType, period, email, userId: user?.id || "temp" }
        });

        console.log("Subscription details", subscription)
        if (user) {
            // Compute an estimated period end based on biling cycle
            // We cannot trust `subscription.current_period_end` at this point because
            // the subscription is INCOMPLETE (payment hasn't happened yet) and the date
            // from Stripe may reflect a trial or yearly interval incorrectly.
            // The webhook (`invoice.payment_succeeded`) will overwrite this with the real value.
            const estimatedPeriodEnd = normalizedPeriod === 'YEARLY'
                ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            await prisma.subscription.upsert({
                where: { userId: user.id },
                create: {
                    userId: user.id,
                    stripeCustomerId: customerId,
                    stripeSubscriptionId: subscription.id,
                    plan: planType as any,
                    status: 'INCOMPLETE' as any,
                    currentPeriodEnd: estimatedPeriodEnd,
                    billingCycle: period
                },
                update: {
                    stripeSubscriptionId: subscription.id,
                    plan: planType as any,
                    status: 'INCOMPLETE' as any,
                    currentPeriodEnd: estimatedPeriodEnd,
                    billingCycle: period
                }
            });
            await prisma.user.update({ where: { id: user.id }, data: { hasUsedFreeTrial: true } });
        }

        let clientSecret: string | null = null;

        const latestInvoice = subscription.latest_invoice as any;

        // API 2025-12-15.clover+: confirmation_secret replaces payment_intent on Invoice
        // Keep payment_intent as fallback for older API versions
        clientSecret = latestInvoice?.confirmation_secret?.client_secret
            || latestInvoice?.payment_intent?.client_secret
            || (subscription.pending_setup_intent as any)?.client_secret
            || null;

        // Last resort: retrieve the invoice manually with both fields expanded
        if (!clientSecret && latestInvoice?.id) {
            const freshInvoice = await stripeService.retrieveInvoice(latestInvoice.id);
            clientSecret = (freshInvoice as any).confirmation_secret?.client_secret
                || (freshInvoice.payment_intent as any)?.client_secret
                || null;
        }

        if (!clientSecret) {
            throw new ApiError(
                StatusCodes.INTERNAL_SERVER_ERROR,
                "Could not retrieve payment client secret from Stripe. Please try again."
            );
        }

        return { subscriptionId: subscription.id, clientSecret, customerId };

    }

    async activateFreePlan(userId: string, planType: string) {
        const existingSub = await prisma.subscription.findUnique({ where: { userId } });
        if (existingSub) throw new ApiError(StatusCodes.BAD_REQUEST, "Subscription already exists");

        const normalizedPlan = planType?.toUpperCase() || "STANDARD";
        const isStandardTrial = normalizedPlan === 'STANDARD';
        const endDate = isStandardTrial ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null;

        return await prisma.subscription.create({
            data: {
                userId,
                stripeCustomerId: isStandardTrial ? `trial_${userId}` : `free_${userId}`,
                plan: (normalizedPlan === "PRO" ? "PRO" : "STANDARD") as any,
                status: "ACTIVE",
                ...(endDate && { trialEnd: endDate })
            }
        });
    }

    async getAllPayments(userId: string) {
        const payments = await prisma.payment.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { user: { include: { subscription: true } } }
        });
        return payments.map(p => this.formatPayment(p));
    }

    private formatPayment(payment: any) {
        const planName = payment.plan || payment.user.subscription?.plan || 'Standard';
        const billingCycle = payment.user.subscription?.billingCycle || 'Monthly';
        const amountFormatted = `$${(payment.amount / 100).toFixed(2)}`;
        const invoiceNo = payment.stripeInvoiceId || `INV-${new Date(payment.createdAt).getFullYear()}-${payment.id.split('-')[0].toUpperCase()}`;

        let status = payment.status.toLowerCase();
        if (status === 'succeeded' || status === 'paid') status = 'paid';
        if (status === 'failed') status = 'overdue';

        return {
            id: payment.id,
            invoiceNo,
            date: (payment.periodStart || payment.createdAt).toISOString().split('T')[0],
            dueDate: (payment.periodEnd || payment.createdAt).toISOString().split('T')[0],
            amount: amountFormatted,
            status,
            plan: planName,
            last4: payment.paymentMethodLast4 || '4242',
            billTo: {
                name: payment.user.fullName,
                email: payment.user.email,
                address: payment.user.address || "-",
                city: `${payment.user.state || ''}, ${payment.user.country || ''}`.replace(/^, /, '') || "-"
            },
            items: [{
                description: `${planName} Plan`,
                subtext: `${billingCycle} subscription`,
                qty: "01",
                price: amountFormatted,
                amount: amountFormatted,
                status: status === 'paid' ? 'Paid' : (status === 'overdue' ? 'Overdue' : (status === 'canceled' ? 'Canceled' : 'Pending'))
            }],
            subtotal: amountFormatted,
            total: amountFormatted
        };
    }

    async syncSubscription(userId: string) {
        let sub = await prisma.subscription.findUnique({ where: { userId } });

        // If there's no subscription or no Stripe ID yet, try to find one on Stripe via the customer ID
        if (sub && !sub.stripeSubscriptionId) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            const customerId = user?.stripeCustomerId || (sub as any).stripeCustomerId;
            if (customerId) {
                try {
                    const stripeSubs = await stripeService.listSubscriptions({ customer: customerId, limit: 1, status: 'active' });
                    if (stripeSubs?.data?.length > 0) {
                        const found = stripeSubs.data[0];
                        // Link this subscription
                        sub = await prisma.subscription.update({
                            where: { userId },
                            data: {
                                stripeSubscriptionId: found.id,
                                stripeCustomerId: customerId,
                                currentPeriodEnd: new Date(found.current_period_end * 1000),
                                status: 'ACTIVE'
                            }
                        });
                    }
                } catch (e) { /* could not find from Stripe */ }
            }
        }

        if (!sub || !sub.stripeSubscriptionId) throw new ApiError(StatusCodes.NOT_FOUND, "No stripe subscription found");

        const stripeSub = await stripeService.retrieveSubscription(sub.stripeSubscriptionId);

        // Prefer the period end from the latest PAID invoice to avoid using data from an INCOMPLETE subscription
        // which may not have confirmed billing dates yet.
        let confirmedPeriodEnd: Date | null = null;
        try {
            const latestInvoices = await stripeService.listInvoices({ subscription: sub.stripeSubscriptionId, limit: 1, status: 'paid' });
            if (latestInvoices.data.length > 0) {
                const latestInvoice = latestInvoices.data[0];
                const lineEnd = latestInvoice.lines?.data?.[0]?.period?.end;
                if (lineEnd) confirmedPeriodEnd = new Date(lineEnd * 1000);
            }
        } catch (e) { /* fallback to subscription current_period_end below */ }

        const statusMap: Record<string, string> = {
            'active': "ACTIVE", 'past_due': "PAST_DUE", 'canceled': "CANCELED",
            'unpaid': "UNPAID", 'trialing': "TRIALING", 'incomplete': "INCOMPLETE"
        };

        // If the subscription is INCOMPLETE but we have confirmed period from paid invoice, use ACTIVE
        const derivedStatus = confirmedPeriodEnd
            ? "ACTIVE"
            : ((stripeSub.status === 'trialing' && sub.status === 'ACTIVE') ? 'ACTIVE' : (statusMap[stripeSub.status] || "ACTIVE"));

        const updatedSub = await prisma.subscription.update({
            where: { userId },
            data: {
                status: derivedStatus as any,
                currentPeriodEnd: confirmedPeriodEnd || new Date(stripeSub.current_period_end * 1000),
                plan: (stripeSub.metadata?.planType || sub.plan) as any,
                cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
                billingCycle: stripeSub.metadata?.period || (stripeSub.plan?.interval === 'year' ? 'YEARLY' : 'MONTHLY')
            }
        });

        // Sync payments
        const invoices = await stripeService.listInvoices({ subscription: sub.stripeSubscriptionId, limit: 5 });
        for (const invoice of invoices.data) {
            if (invoice.status === 'paid' && invoice.amount_paid >= 0) {
                const existing = await prisma.payment.findFirst({ where: { stripeInvoiceId: invoice.id } });
                if (!existing) {
                    let last4 = null;
                    try {
                        if (invoice.charge) {
                            const charge = await stripeService.retrieveCharge(invoice.charge as string);
                            last4 = (charge.payment_method_details as any)?.card?.last4;
                        }
                    } catch (e) { }
                    try {
                        await prisma.payment.create({
                            data: {
                                userId,
                                amount: invoice.amount_paid,
                                currency: invoice.currency,
                                status: 'SUCCEEDED',
                                plan: updatedSub.plan,
                                stripePaymentIntentId: invoice.payment_intent as string || "synced_invoice",
                                stripeInvoiceId: invoice.id,
                                invoiceUrl: invoice.hosted_invoice_url,
                                paymentMethodLast4: last4,
                                periodStart: new Date(invoice.lines.data[0].period.start * 1000),
                                periodEnd: new Date(invoice.lines.data[0].period.end * 1000)
                            }
                        });
                    } catch (err: any) {
                        if (err.code !== 'P2002') throw err;
                    }
                }
            }
        }
        return updatedSub;
    }

    async handleWebhook(rawBody: any, sig: string, secret: string) {
        const event = stripeService.constructWebhookEvent(rawBody, sig, secret);

        switch (event.type) {
            case 'checkout.session.completed':
                await this.handleCheckoutSessionCompleted(event.data.object as any);
                break;
            case 'invoice.payment_succeeded':
                await this.handleInvoicePaymentSucceeded(event.data.object as any);
                break;
            case 'invoice.payment_failed':
                await this.handleInvoicePaymentFailed(event.data.object as any);
                break;
            case 'customer.subscription.deleted':
                await this.handleSubscriptionDeleted(event.data.object as any);
                break;
            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdated(event.data.object as any);
                break;
        }
    }

    private async handleCheckoutSessionCompleted(session: any) {
        const userId = session.metadata?.userId;
        const email = session.metadata?.email;
        const subscriptionId = session.subscription as string;
        const planType = session.metadata?.planType || 'PRO';
        const period = session.metadata?.period || 'MONTHLY';

        if (!subscriptionId) return;

        // Fetch the full Stripe subscription to get currentPeriodEnd
        const stripeSub = await stripeService.retrieveSubscription(subscriptionId);
        const currentPeriodEnd = stripeSub?.current_period_end
            ? new Date(stripeSub.current_period_end * 1000)
            : null;

        let targetUserId = userId === 'temp' ? null : userId;
        if (!targetUserId && email) {
            const user = await prisma.user.findUnique({ where: { email } });
            if (user) targetUserId = user.id;
        }

        if (targetUserId) {
            await prisma.$transaction(async (tx) => {
                const existingSub = await tx.subscription.findUnique({ where: { userId: targetUserId } });
                if (existingSub?.stripeSubscriptionId && existingSub.stripeSubscriptionId !== subscriptionId) {
                    try {
                        await stripeService.cancelSubscription(existingSub.stripeSubscriptionId);
                    } catch (err) {
                        console.log("Error in Stripe subscription", err)
                    }
                }

                await tx.user.update({
                    where: { id: targetUserId },
                    data: {
                        isApprove: "APPROVED",
                        subscription: {
                            upsert: {
                                create: {
                                    stripeCustomerId: session.customer as string,
                                    stripeSubscriptionId: subscriptionId,
                                    status: "ACTIVE",
                                    plan: planType as any,
                                    billingCycle: period,
                                    currentPeriodEnd,  // ← fix: save period end
                                },
                                update: {
                                    stripeCustomerId: session.customer as string,
                                    stripeSubscriptionId: subscriptionId,
                                    status: "ACTIVE",
                                    plan: planType as any,
                                    billingCycle: period,
                                    currentPeriodEnd,  // ← fix: save period end
                                }
                            }
                        },
                        hasUsedFreeTrial: true,
                    }
                });

            });
            io.to(targetUserId).emit("subscription_updated");
        }
    }

    private async handleInvoicePaymentSucceeded(invoice: any) {
        const subscriptionId = invoice.subscription as string;
        if (!subscriptionId) return;

        let subscription = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subscriptionId } });

        if (!subscription) {
            const stripeSub = await stripeService.retrieveSubscription(subscriptionId);
            const { userId, planType, period } = stripeSub.metadata || {};
            const subEmail = stripeSub.metadata?.email || invoice.customer_email;
            let targetUserId = userId === 'temp' ? null : userId;

            if (!targetUserId && subEmail) {
                const user = await prisma.user.findUnique({ where: { email: subEmail } });
                if (user) targetUserId = user.id;
            }

            if (targetUserId) {
                subscription = await prisma.subscription.upsert({
                    where: { userId: targetUserId },
                    create: {
                        userId: targetUserId,
                        stripeCustomerId: stripeSub.customer as string,
                        stripeSubscriptionId: subscriptionId,
                        status: "ACTIVE",
                        plan: (planType || "STANDARD") as any,
                        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
                        billingCycle: period || (stripeSub.plan?.interval === 'year' ? 'YEARLY' : 'MONTHLY')
                    },
                    update: {
                        stripeSubscriptionId: subscriptionId,
                        status: "ACTIVE",
                        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000)
                    }
                });
                await prisma.user.update({
                    where: { id: targetUserId },
                    data: {
                        isApprove: "APPROVED",
                        hasUsedFreeTrial: true
                    }
                });
            }
        }

        if (subscription) {
            const stripeSub = await stripeService.retrieveSubscription(subscriptionId);
            await prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                    status: "ACTIVE",
                    currentPeriodEnd: new Date(invoice.lines.data[0].period.end * 1000),
                    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
                    billingCycle: stripeSub.metadata?.period || (stripeSub.plan?.interval === 'year' ? 'YEARLY' : 'MONTHLY')
                }
            });

            if (invoice.amount_paid >= 0) {
                // On Stripe API 2025-12-15.clover, payment_intent and charge are both null.
                // The PI ID is embedded in confirmation_secret.client_secret: "pi_xxx_secret_yyy" → "pi_xxx"
                const piIdFromSecret = (invoice as any).confirmation_secret?.client_secret?.split('_secret_')?.[0] || null;
                const paymentRef = invoice.payment_intent || invoice.charge || piIdFromSecret || "webhook";
                await this.recordPayment(prisma, subscription.userId, invoice.id, invoice.amount_paid, paymentRef, subscription.plan, invoice);
            }
            io.to(subscription.userId).emit("subscription_updated");
        }
    }

    private async handleInvoicePaymentFailed(invoice: any) {
        const subscriptionId = invoice.subscription as string;
        if (!subscriptionId) return;

        await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subscriptionId },
            data: { status: "PAST_DUE" }
        });

        const sub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subscriptionId } });
        if (sub) {
            await prisma.payment.create({
                data: {
                    userId: sub.userId,
                    amount: invoice.amount_due,
                    currency: invoice.currency,
                    status: 'FAILED',
                    plan: sub.plan,
                    stripePaymentIntentId: invoice.payment_intent as string || "failed_invoice",
                    stripeInvoiceId: invoice.id,
                    invoiceUrl: invoice.hosted_invoice_url
                }
            });
            io.to(sub.userId).emit("subscription_updated");
        }
    }

    private async handleSubscriptionDeleted(subscription: any) {
        const deletedSub = await prisma.subscription.findUnique({
            where: { stripeSubscriptionId: subscription.id }
        });

        if (deletedSub) {
            const currentSub = await prisma.subscription.findUnique({ where: { userId: deletedSub.userId } });
            if (currentSub && currentSub.stripeSubscriptionId !== subscription.id && ['ACTIVE', 'TRIALING'].includes(currentSub.status)) {
                return; // Upgrade flow
            }

            const invoiceId = `cancel_${subscription.id}`;
            const existingRecord = await prisma.payment.findFirst({ where: { stripeInvoiceId: invoiceId } });
            if (existingRecord) return;

            await prisma.$transaction([
                prisma.subscription.update({
                    where: { id: deletedSub.id },
                    data: { status: "CANCELED", cancelAtPeriodEnd: false }
                }),
                prisma.payment.create({
                    data: {
                        userId: deletedSub.userId,
                        amount: subscription.items?.data[0]?.plan?.amount || 0,
                        currency: subscription.items?.data[0]?.plan?.currency || 'usd',
                        status: 'CANCELED',
                        plan: deletedSub.plan,
                        stripePaymentIntentId: `stripe_cancel_${subscription.id}`,
                        stripeInvoiceId: invoiceId
                    }
                })
            ]);
            io.to(deletedSub.userId).emit("subscription_updated");
        }
    }

    private async handleSubscriptionUpdated(subscription: any) {
        const existingSub = await prisma.subscription.findUnique({
            where: { stripeSubscriptionId: subscription.id }
        });

        if (existingSub) {
            const statusMap: Record<string, string> = {
                'active': "ACTIVE", 'past_due': "PAST_DUE", 'canceled': "CANCELED",
                'unpaid': "UNPAID", 'trialing': "TRIALING",
            };

            let newStatus = statusMap[subscription.status] || 'ACTIVE';
            if (subscription.status === 'trialing' && existingSub.status === 'ACTIVE') {
                newStatus = 'ACTIVE';
            }

            await prisma.subscription.update({
                where: { id: existingSub.id },
                data: {
                    status: newStatus as any,
                    cancelAtPeriodEnd: subscription.cancel_at_period_end,
                    currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : undefined
                }
            });
            io.to(existingSub.userId).emit("subscription_updated");
        }
    }

    private async recordPayment(txClient: any, userId: string, invoiceId: string, amount: number, paymentIntentId: any, plan: string, invoiceData?: any) {
        // Optimistic check without transaction
        const existingBefore = await txClient.payment.findFirst({ where: { stripeInvoiceId: invoiceId } });
        if (existingBefore) return;

        let last4 = null;

        // 1st try: use paymentIntentId directly (may be the PI ID extracted from confirmation_secret)
        try {
            if (paymentIntentId && paymentIntentId !== 'webhook' && String(paymentIntentId).startsWith('pi_')) {
                const pi: any = await stripeService.retrievePaymentIntent(paymentIntentId as string, ['payment_method']);
                last4 = pi.payment_method?.card?.last4;
            }
        } catch (e) {
            console.log("Error in 1st try:", e);
        }

        // 2nd try: get last4 from the charge on the invoice (present after payment succeeds)
        if (!last4 && invoiceData?.charge) {
            try {
                const charge = await stripeService.retrieveCharge(invoiceData.charge as string);
                last4 = (charge.payment_method_details as any)?.card?.last4;
            } catch (e) { }
        }

        // 3rd try: extract PI ID from confirmation_secret.client_secret on the invoice
        if (!last4 && invoiceData?.confirmation_secret?.client_secret) {
            try {
                const piId = invoiceData.confirmation_secret.client_secret.split('_secret_')?.[0];
                if (piId?.startsWith('pi_')) {
                    const pi: any = await stripeService.retrievePaymentIntent(piId, ['payment_method']);
                    last4 = pi.payment_method?.card?.last4;
                }
            } catch (e) { }
        }

        let periodStart = null;
        let periodEnd = null;
        if (invoiceData) {
            periodStart = new Date(invoiceData.lines.data[0].period.start * 1000);
            periodEnd = new Date(invoiceData.lines.data[0].period.end * 1000);
        } else {
            try {
                const inv = await stripeService.retrieveInvoice(invoiceId);
                periodStart = new Date(inv.lines.data[0].period.start * 1000);
                periodEnd = new Date(inv.lines.data[0].period.end * 1000);
            } catch (e) { }
        }

        // Execute check and insert within a serialized transaction using dummy User update as a lock
        try {
            await txClient.$transaction(async (tx: any) => {
                // Lock user row to prevent concurrent invoice sync webhooks for the same user
                await tx.user.update({
                    where: { id: userId },
                    data: { updatedAt: new Date() }
                });

                const existing = await tx.payment.findFirst({ where: { stripeInvoiceId: invoiceId } });
                if (existing) return;

                await tx.payment.create({
                    data: {
                        userId,
                        amount,
                        currency: 'usd',
                        status: 'SUCCEEDED',
                        plan,
                        stripePaymentIntentId: paymentIntentId as string || "webhook",
                        stripeInvoiceId: invoiceId,
                        paymentMethodLast4: last4,
                        periodStart,
                        periodEnd
                    }
                });
            });
        } catch (error: any) {
            // P2002 is the Prisma error code for Unique constraint failed
            // It means another webhook/sync just created this payment, so we can safely ignore it.
            if (error.code !== 'P2002') {
                throw error;
            }
        }
    }

    public async cancelStripeSubscription(userId: string) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId }
            });
            if (user && user.stripeCustomerId) {
                await stripeService.deleteCustomer(user.stripeCustomerId);
                console.log(`Successfully deleted Stripe customer for user: ${userId}`);
            }
        } catch (error) {
            console.error("Error canceling Stripe subscription for user:", userId, error);
            // We catch so account deletion can continue even if stripe fails
        }
    }
}


