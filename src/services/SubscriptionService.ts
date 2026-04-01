import prisma from "../db/db.config";
import { StripeService } from "./StripeService";
import { STRIPE_PRICES } from "../utils/stripe/stripe";
import { ApiError } from "../utils/apiError";
import { StatusCodes } from "http-status-codes";
import { io } from "../socket/socket";
import { sendSubscriptionSuccessEmail } from "../utils/nodeMailer/SubscriptionSuccessEmail";
import { sendSubscriptionCancellationEmail } from "../utils/nodeMailer/SubscriptionCancellationEmail";
import logger from "../utils/logger";
import e from "cors";

const stripeService = new StripeService();

export class SubscriptionService {
    async startTrial(providerId: string, invitedById?: string) {
        const provider = await prisma.provider.findUnique({
            where: { id: providerId },
            include: {
                user: {
                    omit: {
                        password: true,

                    }
                }
            }
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
                    logger.warn(`Could not cancel Stripe subscription: ${err?.message}`);
                }
            }

            await prisma.$transaction(async (tx) => {
                await tx.subscription.update({
                    where: { userId },
                    data: {
                        status: "CANCELED",
                        cancelAtPeriodEnd: false,
                        cancelReason: reason
                    }
                });

                const invoiceId = `cancel_${sub.stripeSubscriptionId}`;
                const existingPayment = await tx.payment.findFirst({
                    where: { stripeInvoiceId: invoiceId }
                });

                if (!existingPayment) {
                    await tx.payment.create({
                        data: {
                            userId,
                            amount: amountSnapshot,
                            currency,
                            status: 'CANCELED',
                            plan: sub.plan,
                            stripePaymentIntentId: `manual_cancel_${sub.stripeSubscriptionId}`,
                            stripeInvoiceId: invoiceId,
                            ...(periodStart && { periodStart }),
                            ...(periodEnd && { periodEnd })
                        }
                    });
                }
            });
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

        // 1. Search Stripe for existing customer by email if not found in DB
        if (!customerId) {
            try {
                const existingCustomers = await stripeService.listCustomers({ email, limit: 1 });
                if (existingCustomers.data.length > 0) {
                    customerId = existingCustomers.data[0].id;
                    if (user) await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
                }
            } catch (e: any) { logger.warn(`Could not search for existing customer: ${e.message}`); }
        }

        // 2. Create customer if still not found
        if (!customerId) {
            const customer = await stripeService.createCustomer(email, name, {
                userId: user?.id || "temp",
                tempUser: user ? "false" : "true"
            });
            customerId = customer.id;
            if (user) await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
        } else {
            // Update name of existing customer if it changed
            try {
                await stripeService.updateCustomer(customerId, { name, });
            } catch (e: any) {
                logger.warn(`Could not update existing Stripe customer name: ${e.message}`);
            }
        }

        // 3. Check for existing incomplete/trialing subscriptions for this customer to avoid creation of multiple "incomplete" subs
        const existingStripeSubs = await stripeService.listSubscriptions({
            customer: customerId ?? undefined,
            status: 'all',
            limit: 50 // Check more to clean up old mess if it exists
        });

        // Try to find a reusable subscription (incomplete or trialing for the same plan)
        let subscription = existingStripeSubs.data.find((s: any) =>
            (s.status === 'incomplete' || s.status === 'trialing') &&
            s.items.data[0].price.id === priceId
        );

        // Cancel other incomplete/trialing subscriptions to prevent duplicate "incomplete" rows in Stripe
        const othersToCancel = existingStripeSubs.data.filter((s: any) =>
            (s.status === 'incomplete' || s.status === 'trialing') &&
            s.id !== subscription?.id
        );

        for (const subToCancel of othersToCancel) {
            try {
                await stripeService.cancelSubscription(subToCancel.id);
            } catch (e: any) { logger.warn(`Could not cancel orphaned incomplete sub ${subToCancel.id}: ${e.message}`); }
        }

        // 4. Also cancel any existing ACTIVE/TRIALING subscription in DB if we are switching to a new one
        if (user && !subscription) {
            const existingSub = await prisma.subscription.findUnique({ where: { userId: user.id } });
            if (existingSub?.stripeSubscriptionId && existingSub.status !== 'CANCELED') {
                try {
                    await stripeService.cancelSubscription(existingSub.stripeSubscriptionId);
                } catch (e: any) { logger.warn(`Could not cancel old sub in DB: ${e.message}`); }
            }
        }

        // 5. Create new subscription if none found to reuse
        if (!subscription) {
            subscription = await stripeService.createSubscription({
                customer: customerId!,
                items: [{ price: priceId }],
                collection_method: 'charge_automatically',
                payment_behavior: 'default_incomplete',
                payment_settings: { save_default_payment_method: 'on_subscription', payment_method_types: ['card'], },
                expand: ['latest_invoice.confirmation_secret', 'latest_invoice.payment_intent', 'pending_setup_intent'],
                metadata: { planType, period, email, userId: user?.id || "temp" },
            });
        } else {
            // Re-retrieve with expansion to get fresh clientSecret
            subscription = await stripeService.retrieveSubscription(subscription.id, [
                'latest_invoice.confirmation_secret',
                'latest_invoice.payment_intent',
                'pending_setup_intent'
            ]);
        }

        if (user) {
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
                    stripeCustomerId: customerId,
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

        clientSecret = latestInvoice?.confirmation_secret?.client_secret
            || latestInvoice?.payment_intent?.client_secret
            || (subscription.pending_setup_intent as any)?.client_secret
            || null;

        if (!clientSecret && latestInvoice?.id) {
            const freshInvoice = await stripeService.retrieveInvoice(latestInvoice.id);
            clientSecret = (freshInvoice as any).confirmation_secret?.client_secret
                || (freshInvoice.payment_intent as any)?.client_secret
                || null;
        }

        if (!clientSecret) {
            throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, "Could not retrieve payment client secret. Please try again.");
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
        let planName = payment.plan || payment.user.subscription?.plan || 'Standard';
        // Capitalize first letter of plan name
        planName = planName.charAt(0).toUpperCase() + planName.slice(1).toLowerCase();

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
            last4: payment.paymentMethodLast4 || '****',
            billTo: {
                name: payment.user.fullName,
                email: payment.user.email,
                address: payment.user.address || "-",
                city: `${payment.user.state || ''}, ${payment.user.country || ''}`.replace(/^, /, '') || "-"
            },
            items: [{
                description: planName,
                subtext: "Platform Access",
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

        const resolveCustomerLast4 = async (customerId: string, subscriptionId: string): Promise<string | null> => {
            try {
                const subWithPm: any = await stripeService.retrieveSubscriptionExpanded(subscriptionId);
                const last4 = subWithPm?.default_payment_method?.card?.last4 ?? null;
                if (last4) { console.log(`[sync] last4 from sub.default_payment_method: ${last4}`); return last4; }
            } catch (e) { /* fall through */ }

            // 2. List customer payment methods (always has card after attachment)
            try {
                const pms = await stripeService.listPaymentMethods(customerId);
                const last4 = pms.data?.[0]?.card?.last4 ?? null;
                if (last4) { console.log(`[sync] last4 from customer PM list: ${last4}`); return last4; }
            } catch (e) { /* fall through */ }

            return null;
        };

        const resolveInvoiceLast4 = async (invoice: any, customerId: string, subscriptionId: string): Promise<string | null> => {
            // 1. Customer/subscription level (most reliable in new API)
            const customerLast4 = await resolveCustomerLast4(customerId, subscriptionId);
            if (customerLast4) return customerLast4;

            // 2. Direct charge on invoice (works in older API)
            if (invoice.charge && typeof invoice.charge === 'string') {
                try {
                    const ch = await stripeService.retrieveCharge(invoice.charge);
                    const l4 = (ch.payment_method_details as any)?.card?.last4 ?? null;
                    if (l4) return l4;
                } catch (e) { /* fall through */ }
            }

            // 3. Payment Intent with latest_charge expanded
            let piId: string | null = invoice.payment_intent as string | null;
            if (!piId && (invoice as any).confirmation_secret?.client_secret) {
                piId = (invoice as any).confirmation_secret.client_secret.split('_secret_')?.[0] ?? null;
            }
            if (piId?.startsWith('pi_')) {
                try {
                    const pi: any = await stripeService.retrievePaymentIntent(piId, ['latest_charge', 'payment_method']);
                    const l4 = pi.latest_charge?.payment_method_details?.card?.last4
                        || pi.payment_method?.card?.last4 || null;
                    if (l4) return l4;
                } catch (e) { /* fall through */ }
            }

            // 4. Re-fetch invoice to get charge field, then retrieve charge
            try {
                const fresh = await stripeService.retrieveInvoice(invoice.id);
                const chargeId = fresh.charge as string | null;
                if (chargeId) {
                    const ch = await stripeService.retrieveCharge(chargeId);
                    return (ch.payment_method_details as any)?.card?.last4 ?? null;
                }
            } catch (e) { /* fall through */ }

            return null;
        };

        // Get customerId for PM lookups
        const stripeCustomerId = (stripeSub as any).customer as string | null;

        for (const invoice of invoices.data) {
            if (invoice.status === 'paid' && invoice.amount_paid >= 0) {
                const existing = await prisma.payment.findFirst({
                    where: { stripeInvoiceId: invoice.id }
                });

                if (!existing) {
                    let last4: string | null = null;
                    try {
                        last4 = await resolveInvoiceLast4(invoice, stripeCustomerId ?? sub.stripeCustomerId ?? '', sub.stripeSubscriptionId ?? '');
                        console.log(`[sync] new payment last4: ${last4} for invoice ${invoice.id}`);
                    } catch (e) {
                        console.log('[sync] last4 resolve failed:', (e as any)?.message);
                    }

                    try {
                        await prisma.payment.create({
                            data: {
                                userId,
                                amount: invoice.amount_paid,
                                currency: invoice.currency,
                                status: 'SUCCEEDED',
                                plan: updatedSub.plan,
                                stripePaymentIntentId: invoice.payment_intent as string || 'synced_invoice',
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

                } else if (!existing.paymentMethodLast4) {
                    // Row exists but last4 was missing — patch it now
                    try {
                        const last4 = await resolveInvoiceLast4(invoice, stripeCustomerId ?? sub.stripeCustomerId ?? '', sub.stripeSubscriptionId ?? '');
                        if (last4) {
                            await prisma.payment.update({
                                where: { id: existing.id },
                                data: { paymentMethodLast4: last4 }
                            });
                            console.log(`[sync] patched last4 ${last4} on payment ${existing.id}`);
                        } else {
                            console.log(`[sync] could not resolve last4 for existing payment ${existing.id}`);
                        }
                    } catch (e) {
                        console.log('[sync] patch last4 failed:', (e as any)?.message);
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
            case 'payment_method.attached':
                await this.handlePaymentMethodAttached(event.data.object as any);
                break;
            case 'charge.failed':
                await this.handleChargeFailed(event.data.object as any);
                break;
            case 'charge.succeeded':
                await this.handleChargeSucceeded(event.data.object as any);
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

            // Cleanup payment methods: set new as default and remove old ones
            if (session.payment_intent) {
                try {
                    const pi = await stripeService.retrievePaymentIntent(session.payment_intent as string, ['payment_method']);
                    const pmId = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id;
                    if (pmId) {
                        await this.cleanupPaymentMethods(session.customer as string, pmId);
                    }
                } catch (err) {
                }
            } else if (session.setup_intent) {
                try {
                    const si = await stripeService.retrieveSetupIntent(session.setup_intent as string);
                    const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id;
                    if (pmId) {
                        await this.cleanupPaymentMethods(session.customer as string, pmId);
                    }
                } catch (err) {
                }
            }

            io.to(targetUserId).emit("subscription_updated");

            // Send custom Success Email
            try {
                const fullUser = await prisma.user.findUnique({ where: { id: targetUserId } });
                if (fullUser) {
                    const amountFormatted = `$${(session.amount_total / 100).toFixed(2)}`;
                    const nextBillingDateStr = currentPeriodEnd ? currentPeriodEnd.toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                    }) : undefined;

                    await sendSubscriptionSuccessEmail(
                        fullUser.email,
                        fullUser.fullName,
                        planType,
                        amountFormatted,
                        period,
                        nextBillingDateStr
                    );
                }
            } catch (emailErr: any) {
                logger.error(`Failed to send subscription success email: ${emailErr.message}`);
            }
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
                // Fetch the PI with latest_charge expanded to verify card details
                let expandedLast4: string | null = null;
                if (paymentRef && String(paymentRef).startsWith('pi_')) {
                    try {
                        const pi: any = await stripeService.retrievePaymentIntent(paymentRef, ['latest_charge', 'payment_method']);
                        const charge = pi.latest_charge;
                        expandedLast4 = charge?.payment_method_details?.card?.last4 || null;

                        logger.debug(`Expanded PaymentIntent ID: ${pi.id}, Status: ${pi.status}, Charge ID: ${charge?.id}, Card: ${charge?.payment_method_details?.card?.brand} **** ${charge?.payment_method_details?.card?.last4}`);
                    } catch (e: any) {
                    }
                }

                await this.recordPayment(prisma, subscription.userId, invoice.id, invoice.amount_paid, paymentRef, subscription.plan, invoice);

                // If we successfully expanded the PI and got last4, immediately patch the new payment record.
                // This closes the timing gap: charge.succeeded updates an OLD payment, invoice.payment_succeeded
                // creates a NEW payment that may still have null last4 if recordPayment's expand failed.
                if (expandedLast4) {
                    try {
                        const newPayment = await prisma.payment.findFirst({
                            where: { stripeInvoiceId: invoice.id }
                        });
                        if (newPayment && !newPayment.paymentMethodLast4) {
                            await prisma.payment.update({
                                where: { id: newPayment.id },
                                data: { paymentMethodLast4: expandedLast4 }
                            });
                            console.log(`✅ Patched new payment ${newPayment.id} with last4: ${expandedLast4}`);
                        }
                    } catch (e) {
                        console.log('Failed to patch new payment with last4:', e);
                    }
                }

                // Cleanup payment methods if we have a payment intent or charge
                const pmId = invoice.payment_settings?.default_payment_method || invoice.default_payment_method;
                if (pmId && typeof pmId === 'string') {
                    await this.cleanupPaymentMethods(invoice.customer as string, pmId);
                } else if (pmId && typeof pmId === 'object' && pmId.id) {
                    await this.cleanupPaymentMethods(invoice.customer as string, pmId.id);
                } else if (paymentRef && typeof paymentRef === 'string' && paymentRef.startsWith('pi_')) {
                    try {
                        const pi = await stripeService.retrievePaymentIntent(paymentRef, ['payment_method']);
                        const pmIdFromPi = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id;
                        if (pmIdFromPi) {
                            await this.cleanupPaymentMethods(invoice.customer as string, pmIdFromPi);
                        }
                    } catch (e: any) {
                        logger.error(`Error retrieving PM from PI for cleanup: ${e.message}`);
                    }
                }
            }
            if (invoice.billing_reason === 'subscription_cycle' || invoice.subscription) {
                const amountFormatted = `$${(invoice.amount_paid / 100).toFixed(2)}`;
                const planNameStr = subscription.plan.charAt(0) + subscription.plan.slice(1).toLowerCase();
                const nextBillingDateStr = new Date(invoice.lines.data[0].period.end * 1000).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                });

                io.to(subscription.userId).emit("subscription_renewal", {
                    planName: planNameStr,
                    amountBilled: amountFormatted,
                    nextBillingDate: nextBillingDateStr
                });
            }

            if (invoice.billing_reason === 'subscription_create') {
                try {
                    const fullUser = await prisma.user.findUnique({ where: { id: subscription.userId } });
                    if (fullUser) {
                        const amountFormatted = `$${(invoice.amount_paid / 100).toFixed(2)}`;
                        const nextBillingDateStr = new Date(invoice.lines.data[0].period.end * 1000).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                        });

                        // Use derived plan and billing cycle for accuracy
                        const planName = subscription.plan;
                        const billingCycle = stripeSub.metadata?.period || (stripeSub.plan?.interval === 'year' ? 'YEARLY' : 'MONTHLY');

                        await sendSubscriptionSuccessEmail(
                            fullUser.email,
                            fullUser.fullName,
                            planName,
                            amountFormatted,
                            billingCycle,
                            nextBillingDateStr
                        );
                    }
                } catch (emailErr: any) {
                    logger.error(`Failed to send subscription success email from invoice handler: ${emailErr.message}`);
                }
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
            await prisma.$transaction(async (tx) => {
                await tx.subscription.update({
                    where: { id: deletedSub.id },
                    data: { status: "CANCELED", cancelAtPeriodEnd: false }
                });

                const existingRecord = await tx.payment.findFirst({ where: { stripeInvoiceId: invoiceId } });
                if (!existingRecord) {
                    await tx.payment.create({
                        data: {
                            userId: deletedSub.userId,
                            amount: subscription.items?.data[0]?.plan?.amount || 0,
                            currency: subscription.items?.data[0]?.plan?.currency || 'usd',
                            status: 'CANCELED',
                            plan: deletedSub.plan,
                            stripePaymentIntentId: `stripe_cancel_${subscription.id}`,
                            stripeInvoiceId: invoiceId
                        }
                    });
                }
            });
            io.to(deletedSub.userId).emit("subscription_updated");

            // Send custom Cancellation Email
            try {
                const fullUser = await prisma.user.findUnique({ where: { id: deletedSub.userId } });
                if (fullUser) {
                    await sendSubscriptionCancellationEmail(
                        fullUser.email,
                        fullUser.fullName,
                        deletedSub.plan
                    );
                }
            } catch (emailErr: any) {
                logger.error(`Failed to send subscription cancellation email: ${emailErr.message}`);
            }
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

            // If the subscription has a new default payment method, trigger cleanup
            const pmId = subscription.default_payment_method;
            if (pmId && typeof pmId === 'string') {
                await this.cleanupPaymentMethods(subscription.customer as string, pmId);
            }

            io.to(existingSub.userId).emit("subscription_updated");
        }
    }

    private async recordPayment(txClient: any, userId: string, invoiceId: string, amount: number, paymentIntentId: any, plan: string, invoiceData?: any) {
        // resolved the perid dates from the invoice
        let periodStart: Date | null = null;
        let periodEnd: Date | null = null;

        if (invoiceData.lines?.data?.[0]?.period) {
            periodStart = new Date(invoiceData.lines.data[0].period.start * 1000);
            periodEnd = new Date(invoiceData.lines.data[0].period.end * 1000);
        }
        else {
            try {
                const inv = await stripeService.retrieveInvoice(invoiceId);
                periodStart = new Date(inv.lines.data[0].period.start * 1000);
                periodEnd = new Date(inv.lines.data[0].period.end * 1000);
            }
            catch (e: any) {
                logger.error(`Error resolving period dates: ${e.message}`);
            }
        }

        // Resolve last4 - only needed if charge.succeded has'nt written it yet
        let last4: string | null = null;
        try {
            let piId = paymentIntentId;
            if ((!piId || piId === 'webhook') && invoiceData?.confirmation_secret?.client_secret) {
                piId = invoiceData.confirmation_secret.client_secret.split('_secret_')?.[0];
            }
            if (piId && String(piId).startsWith('pi_')) {
                const pi: any = await stripeService.retrievePaymentIntent(
                    piId, ['latest_charge', 'payment_method']
                );
                last4 = pi.latest_charge?.payment_method_details?.card?.last4
                    || pi.payment_method?.card?.last4
                    || null;
            }
        } catch (e) { }


        if (!last4 && invoiceData?.charge) {
            try {
                const charge = await stripeService.retrieveCharge(invoiceData.charge as string);
                last4 = (charge.payment_method_details as any)?.card?.last4 || null;
            } catch (e) { }
        }

        try {
            await txClient.$transaction(async (tx: any) => {
                await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });

                await tx.payment.upsert({
                    where: { stripeInvoiceId: invoiceId },
                    create: {
                        userId,
                        amount,
                        currency: invoiceData?.currency ?? 'usd',
                        status: 'SUCCEEDED',
                        plan,
                        stripePaymentIntentId: paymentIntentId ?? 'webhook',
                        stripeInvoiceId: invoiceId,
                        paymentMethodLast4: last4,
                        invoiceUrl: invoiceData?.hosted_invoice_url ?? null,
                        periodStart,
                        periodEnd,
                    },
                    update: {
                        // Enrich the partial row charge.succeeded created
                        amount,
                        status: 'SUCCEEDED',
                        plan,
                        stripePaymentIntentId: paymentIntentId ?? 'webhook',
                        invoiceUrl: invoiceData?.hosted_invoice_url ?? null,
                        periodStart,
                        periodEnd,
                        // Only overwrite last4 if we resolved one — don't clobber what charge.succeeded wrote
                        ...(last4 ? { paymentMethodLast4: last4 } : {}),
                    }
                });
            });
        } catch (error: any) {
            if (error.code !== 'P2002') throw error;
        }

        // // Optimistic check without transaction

        // const existingBefore = await txClient.payment.findFirst({ where: { stripeInvoiceId: invoiceId } });
        // if (existingBefore) return;

        // let last4 = null;

        // // Primary: retrieve the PaymentIntent with latest_charge expanded
        // // This is the most reliable way — latest_charge always has payment_method_details.card.last4
        // try {
        //     let piId = paymentIntentId;

        //     // If no direct PI ID, parse it from confirmation_secret on the invoice
        //     if ((!piId || piId === 'webhook') && invoiceData?.confirmation_secret?.client_secret) {
        //         piId = invoiceData.confirmation_secret.client_secret.split('_secret_')?.[0];
        //     }

        //     if (piId && String(piId).startsWith('pi_')) {
        //         const pi: any = await stripeService.retrievePaymentIntent(piId as string, ['latest_charge', 'payment_method']);
        //         // Best path: latest_charge always includes payment_method_details
        //         last4 = (pi.latest_charge as any)?.payment_method_details?.card?.last4
        //             // Fallback: payment_method expanded on the PI
        //             || (pi.payment_method as any)?.card?.last4
        //             || null;
        //         if (last4) console.log(`[recordPayment] Got last4 from PI expand: ${last4}`);
        //     }
        // } catch (e) {
        //     console.log('[recordPayment] PI expand failed, trying charge directly:', (e as any)?.message);
        // }

        // // Fallback 1: retrieve the charge directly using its ID from the invoice
        // if (!last4 && invoiceData?.charge) {
        //     try {
        //         const charge = await stripeService.retrieveCharge(invoiceData.charge as string);
        //         last4 = (charge.payment_method_details as any)?.card?.last4 || null;
        //         if (last4) console.log(`[recordPayment] Got last4 from charge: ${last4}`);
        //     } catch (e) { }
        // }

        // // Fallback 2: check invoice default_payment_method if already expanded as object
        // if (!last4 && invoiceData?.default_payment_method && typeof invoiceData.default_payment_method === 'object') {
        //     last4 = (invoiceData.default_payment_method as any).card?.last4 || null;
        //     if (last4) console.log(`[recordPayment] Got last4 from default_payment_method: ${last4}`);
        // }

        // let periodStart = null;
        // let periodEnd = null;
        // if (invoiceData) {
        //     periodStart = new Date(invoiceData.lines.data[0].period.start * 1000);
        //     periodEnd = new Date(invoiceData.lines.data[0].period.end * 1000);
        // } else {
        //     try {
        //         const inv = await stripeService.retrieveInvoice(invoiceId);
        //         periodStart = new Date(inv.lines.data[0].period.start * 1000);
        //         periodEnd = new Date(inv.lines.data[0].period.end * 1000);
        //     } catch (e) { }
        // }

        // // Execute check and insert within a serialized transaction using dummy User update as a lock
        // try {
        //     await txClient.$transaction(async (tx: any) => {
        //         // Lock user row to prevent concurrent invoice sync webhooks for the same user
        //         await tx.user.update({
        //             where: { id: userId },
        //             data: { updatedAt: new Date() }
        //         });

        //         const existing = await tx.payment.findFirst({ where: { stripeInvoiceId: invoiceId } });
        //         if (existing) return;

        //         await tx.payment.create({
        //             data: {
        //                 userId,
        //                 amount,
        //                 currency: 'usd',
        //                 status: 'SUCCEEDED',
        //                 plan,
        //                 stripePaymentIntentId: paymentIntentId as string || "webhook",
        //                 stripeInvoiceId: invoiceId,
        //                 paymentMethodLast4: last4,
        //                 periodStart,
        //                 periodEnd
        //             }
        //         });
        //     });
        // } catch (error: any) {
        //     // P2002 is the Prisma error code for Unique constraint failed
        //     // It means another webhook/sync just created this payment, so we can safely ignore it.
        //     if (error.code !== 'P2002') {
        //         throw error;
        //     }
        // }
    }

    private async handleChargeFailed(charge: any) {
        const customerId = charge.customer;
        const last4 = charge.payment_method_details?.card?.last4;


        logger.debug(`payment_method_details.card: last4=${last4}`);

        if (!customerId || !last4) {

            return;
        }

        try {
            let user = await prisma.user.findFirst({
                where: { subscription: { stripeCustomerId: customerId } },
                include: { subscription: true }
            });

            if (!user) {
                user = await prisma.user.findFirst({
                    where: { stripeCustomerId: customerId },
                    include: { subscription: true }
                });
            }

            if (user) {
                let paymentToUpdate = null;

                if (charge.invoice) {
                    paymentToUpdate = await prisma.payment.findUnique({
                        where: { stripeInvoiceId: charge.invoice as string }
                    });
                }

                if (!paymentToUpdate && charge.payment_intent) {
                    paymentToUpdate = await prisma.payment.findFirst({
                        where: { stripePaymentIntentId: charge.payment_intent as string }
                    });
                }

                if (!paymentToUpdate) {
                    paymentToUpdate = await prisma.payment.findFirst({
                        where: {
                            userId: user.id,
                            status: 'FAILED',
                            createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) }
                        },
                        orderBy: { createdAt: 'desc' }
                    });
                }

                if (paymentToUpdate) {
                    await prisma.payment.update({
                        where: { id: paymentToUpdate.id },
                        data: { paymentMethodLast4: last4 }
                    });
                }
            }
        } catch (error) {
        }
    }

    private async handleChargeSucceeded(charge: any) {
        const customerId = charge.customer;
        const last4 = charge.payment_method_details?.card?.last4;
        const invoiceId = charge.invoice as string | null;

        logger.info(`charge succeeded: last4=${last4}`);

        if (!customerId || !last4) {
            logger.warn("Missing customerId or last4 in charge succeeded webhook");
            return;
        }

        // find the user — try subscription.stripeCustomerId first, then user.stripeCustomerId
        // (for new accounts the subscription row may not be linked yet when charge.succeeded fires)
        let user = await prisma.user.findFirst({
            where: { subscription: { stripeCustomerId: customerId } },
            select: { id: true, subscription: true },
        });

        if (!user) {
            user = await prisma.user.findFirst({
                where: { stripeCustomerId: customerId },
                select: { id: true, subscription: true },
            });
        }

        if (!user) {
            logger.warn(`No customer found for customerId: ${customerId}`);
            return;
        }

        logger.info(`Found user for charge: ${user.id}`);


        if (invoiceId) {
            // partial data payment data store

            try {
                await prisma.payment.upsert({
                    where: { stripeInvoiceId: invoiceId },
                    create: {
                        userId: user.id,
                        amount: charge.amount ?? 0,
                        currency: charge.currency ?? 'usd',
                        status: "SUCCEEDED",
                        plan: (user as any).subscription?.plan ?? "STANDARD",
                        stripePaymentIntentId: charge.payment_intent as string ?? charge.id,
                        stripeInvoiceId: invoiceId,
                        paymentMethodLast4: last4,
                    },
                    update: {
                        // row already exist
                        paymentMethodLast4: last4,
                    }
                });
                // upserted for partial payment 
                logger.info(`✅ Upserted partial payment for invoice ${invoiceId} with last4: ${last4}`);

            } catch (error: any) {
                // unique contrint race on concurrent webhooks - safe ingore
                if (error?.code !== 'P2002') logger.error(`Error upserting payment in charge.succeeded: ${error.message}`);
            }
        }

        else {
            // No invoice ID — patch the most recent payment with last4
            const recent = await prisma.payment.findFirst({
                where: {
                    userId: user.id,
                    status: { not: "CANCELED" },
                    createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) }
                },
                orderBy: { createdAt: "desc" },
            });

            console.log("Patched recent payment: ", {
                recentid: recent?.id,
                last4: last4,
            });

            if (recent && !recent.paymentMethodLast4) {
                await prisma.payment.update({
                    where: { id: recent.id },
                    data: { paymentMethodLast4: last4 },
                });
                console.log(`✅ Patched recent payment ${recent.id} with last4: ${last4}`);
            }
        }



        // // charge.succeeded always includes payment_method_details.card.last4 without any expansion
        // const customerId = charge.customer;
        // const last4 = charge.payment_method_details?.card?.last4;

        // console.log('\n========== [charge.succeeded] ==========');
        // console.log('charge.id:', charge.id);
        // console.log('charge.customer:', customerId);
        // console.log('payment_method_details.card:', {
        //     brand: charge.payment_method_details?.card?.brand,
        //     last4: charge.payment_method_details?.card?.last4,
        // });

        // if (!customerId || !last4) {
        //     return;
        // }

        // try {
        //     // Try via subscription.stripeCustomerId first, then fall back to user.stripeCustomerId
        //     let user = await prisma.user.findFirst({
        //         where: { subscription: { stripeCustomerId: customerId } },
        //         include: { subscription: true }
        //     });

        //     if (!user) {
        //         user = await prisma.user.findFirst({
        //             where: { stripeCustomerId: customerId },
        //             include: { subscription: true }
        //         });
        //     }

        //     if (user) {
        //         console.log('✅ Found user:', user.id);

        //         let paymentToUpdate = null;

        //         // 1. Try finding by Stripe Invoice ID if available on the charge
        //         if (charge.invoice) {
        //             paymentToUpdate = await prisma.payment.findUnique({
        //                 where: { stripeInvoiceId: charge.invoice as string }
        //             });
        //             if (paymentToUpdate) console.log(`[charge.succeeded] Map to payment via invoice: ${paymentToUpdate.id}`);
        //         }

        //         // 2. Try finding by Payment Intent ID
        //         if (!paymentToUpdate && charge.payment_intent) {
        //             paymentToUpdate = await prisma.payment.findFirst({
        //                 where: { stripePaymentIntentId: charge.payment_intent as string }
        //             });
        //             if (paymentToUpdate) console.log(`[charge.succeeded] Map to payment via payment_intent: ${paymentToUpdate.id}`);
        //         }

        //         // 3. Fallback: Find the most recent SUCCEEDED or non-CANCELED payment for this user (within last 30 mins)
        //         if (!paymentToUpdate) {
        //             paymentToUpdate = await prisma.payment.findFirst({
        //                 where: {
        //                     userId: user.id,
        //                     status: { not: 'CANCELED' },
        //                     createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } // last 30 mins
        //                 },
        //                 orderBy: { createdAt: 'desc' }
        //             });
        //             if (paymentToUpdate) console.log(`[charge.succeeded] Map to most recent payment: ${paymentToUpdate.id}`);
        //         }

        //         if (paymentToUpdate) {
        //             await prisma.payment.update({
        //                 where: { id: paymentToUpdate.id },
        //                 data: { paymentMethodLast4: last4 }
        //             });
        //             console.log(`✅ Updated payment ${paymentToUpdate.id} with last4: ${last4}`);
        //         } else {
        //             console.log('⚠️  No suitable payment record found for user yet — will rely on invoice.payment_succeeded');
        //         }
        //     } else {
        //         console.log('❌ No user found for customerId:', customerId);
        //     }
        // } catch (error) {
        //     console.error("Error in handleChargeSucceeded:", error);
        // }
        // console.log('========================================\n');
    }

    private async handlePaymentMethodAttached(paymentMethod: any) {
        const customerId = paymentMethod.customer;
        const pmId = paymentMethod.id;
        const last4 = paymentMethod.card?.last4;
        if (!customerId || !last4) return;

        logger.info(`[StripeWebhook] Payment method ${pmId} attached to customer ${customerId}`);

        try {
            const user = await prisma.user.findFirst({
                where: { subscription: { stripeCustomerId: customerId } },
                include: { subscription: true }
            });

            if (user) {
                // 1. Sync last4 to recent payments
                const latestPayment = await prisma.payment.findFirst({
                    where: {
                        userId: user.id,
                        status: { not: 'CANCELED' }
                    },
                    orderBy: { createdAt: 'desc' }
                });

                if (latestPayment) {
                    await prisma.payment.update({
                        where: { id: latestPayment.id },
                        data: { paymentMethodLast4: last4 }
                    });
                    logger.info(`Updated payment ${latestPayment.id} with last4: ${last4}`);
                }

                // 2. Trigger cleanup! If a user attaches a NEW card, we usually want it to be the only card.
                // We'll treat this as the new default for the customer.
                await this.cleanupPaymentMethods(customerId, pmId);
            }
        } catch (error) {
            console.error("Error in handlePaymentMethodAttached:", error);
        }
    }

    private async cleanupPaymentMethods(customerId: string, newPaymentMethodId: string) {
        logger.info(`[StripeCleanup] Starting cleanup for customer ${customerId}. New PM: ${newPaymentMethodId}`);
        try {
            // 1. Set the new payment method as the default for the customer
            await stripeService.updateCustomer(customerId, {
                invoice_settings: {
                    default_payment_method: newPaymentMethodId,
                },
            });
            logger.info(`[StripeCleanup] Set ${newPaymentMethodId} as default for ${customerId}`);

            // 2. List all card payment methods for the customer
            const paymentMethods = await stripeService.listPaymentMethods(customerId);

            // 3. Detach all other payment methods
            let detachedCount = 0;
            for (const pm of paymentMethods.data) {
                if (pm.id !== newPaymentMethodId) {
                    try {
                        await stripeService.detachPaymentMethod(pm.id);
                        logger.info(`[StripeCleanup] Successfully detached old PM: ${pm.id}`);
                        detachedCount++;
                    } catch (detachError: any) {
                        logger.error(`[StripeCleanup] Failed to detach PM ${pm.id}: ${detachError.message}`);
                    }
                }
            }
            logger.info(`[StripeCleanup] Cleanup complete for ${customerId}. Detached ${detachedCount} old methods.`);
        } catch (error: any) {
            logger.error(`[StripeCleanup] CRITICAL Error during cleanup for ${customerId}: ${error.message}`);
        }
    }

    public async cancelStripeSubscription(userId: string) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId }
            });
            if (user && user.stripeCustomerId) {
                await stripeService.deleteCustomer(user.stripeCustomerId);
                logger.info(`Successfully deleted Stripe customer for user: ${userId}`);
            }
        } catch (error: any) {
            logger.error(`Error canceling Stripe subscription for user: ${userId} ${error.message}`);
            // We catch so account deletion can continue even if stripe fails
        }
    }
}


