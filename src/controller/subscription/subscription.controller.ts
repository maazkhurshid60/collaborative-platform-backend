import { NextFunction, Request, Response } from "express";
import prisma from "../../db/db.config";
import { stripe, STRIPE_PRICES } from "../../utils/stripe/stripe";
import { io } from "../../socket/socket";

// Create Checkout Session (Legacy - for existing users)
export const createCheckoutSessionApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const { planType, period } = req.body; // planType: 'STANDARD' | 'PRO', period: 'MONTHLY' | 'YEARLY'

        if (!planType || !period) {
            return res.status(400).json({ message: "Plan type and period are required" });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true }
        });

        if (!user) return res.status(404).json({ message: "User not found" });

        // Get Price ID
        const priceId = STRIPE_PRICES[planType as keyof typeof STRIPE_PRICES]?.[period as keyof typeof STRIPE_PRICES.STANDARD];
        if (!priceId) return res.status(400).json({ message: "Invalid plan or period" });

        // Create or Get Stripe Customer
        let customerId = user.stripeCustomerId || user.subscription?.stripeCustomerId;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.fullName,
                metadata: { userId: user.id }
            });
            customerId = customer.id;
        }

        // Checkout Session Config
        const sessionConfig: any = {
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${process.env.FRONTEND_URL}/payment-success`,
            cancel_url: `${process.env.FRONTEND_URL}/payment-failure`,
            metadata: { userId: user.id, planType }
        };

        // Add Trial for Standard Plan ONLY if user hasn't used it yet
        if (planType === 'STANDARD' && !user.hasUsedFreeTrial) {
            sessionConfig.subscription_data = {
                trial_period_days: 14, // 14-day trial
                metadata: { planType, userId: user.id, email: user.email }
            };
            console.log(`✅ Granting STANDARD trial to user ${user.id}`);
        } else if (planType === 'STANDARD' && user.hasUsedFreeTrial) {
            console.log(`⚠️ User ${user.id} already used free trial - no trial granted`);
            // No trial, they'll be charged immediately
            sessionConfig.subscription_data = {
                metadata: { planType, userId: user.id, email: user.email }
            };
        } else {
            // PRO plan or any other plan - always include user identity in subscription metadata
            sessionConfig.subscription_data = {
                metadata: { planType, userId: user.id, email: user.email }
            };
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);

        res.status(200).json({ url: session.url });
    } catch (error) {
        next(error);
    }
};
export const createSubscriptionIntentApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, name, planType, period } = req.body;

        if (!email || !planType || !period) {
            return res.status(400).json({ message: "Email, Plan type, and Period are required" });
        }

        // Get Price ID
        const priceId = STRIPE_PRICES[planType as keyof typeof STRIPE_PRICES]?.[period as keyof typeof STRIPE_PRICES.STANDARD];
        console.log('📊 Debug - planType:', planType, 'period:', period, 'priceId:', priceId);
        if (!priceId) return res.status(400).json({ message: "Invalid plan or period" });

        // 1. Create or Get Customer
        let user = await prisma.user.findUnique({ where: { email } });
        let customerId = user?.stripeCustomerId;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email,
                name,
                metadata: {
                    userId: user?.id || "temp",
                    tempUser: user ? "false" : "true"
                }
            });
            customerId = customer.id;

            // SAVE IMMEDIATELY if user exists
            if (user) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { stripeCustomerId: customerId }
                });
            }
        }

        // 2. Check Trial Eligibility (Standard Plan activation skips trial as requested)
        // We will mark the trial as used immediately for existing users below.
        const shouldGrantTrial = false;

        console.log('🔍 Plan Selection:', { planType, userId: user?.id || 'new_user' });

        // 3. Create Subscription
        const subscriptionConfig: any = {
            customer: customerId,
            items: [{ price: priceId }],
            // FORCE automatic charging to ensure payment intent creation
            collection_method: 'charge_automatically',
            payment_behavior: 'default_incomplete',
            payment_settings: {
                save_default_payment_method: 'on_subscription',
                payment_method_types: ['card']
            },
            expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
            metadata: {
                planType: planType || "STANDARD",
                period: period || "MONTHLY",
                email: email,
                userId: user?.id || "temp"
            }
        };

        // 3. Cancel any existing active/trialing subscription in Stripe BEFORE creating a new one
        const existingSub = await prisma.subscription.findUnique({ where: { userId: user?.id || "" } });
        if (existingSub?.stripeSubscriptionId) {
            try {
                const stripeSub = await stripe.subscriptions.retrieve(existingSub.stripeSubscriptionId);
                // Cancel immediately if it's trialing, active, or past_due
                if (['trialing', 'active', 'past_due', 'incomplete'].includes(stripeSub.status)) {
                    await stripe.subscriptions.cancel(existingSub.stripeSubscriptionId);
                    console.log(`🗑️ Cancelled existing Stripe subscription ${existingSub.stripeSubscriptionId} (status: ${stripeSub.status}) before upgrade`);
                }
            } catch (cancelErr: any) {
                // If sub doesn't exist in Stripe anymore, that's fine — just log and continue
                console.warn(`⚠️ Could not cancel old subscription ${existingSub.stripeSubscriptionId}:`, cancelErr?.message);
            }
        }

        // 3b. Create new Subscription
        const subscription = await stripe.subscriptions.create(subscriptionConfig);

        // SAVE IMMEDIATELY: Ensure the subscription ID is linked even if payment is incomplete
        if (user) {
            await prisma.subscription.upsert({
                where: { userId: user.id },
                create: {
                    userId: user.id,
                    stripeCustomerId: customerId,
                    stripeSubscriptionId: subscription.id,
                    plan: (planType || "STANDARD") as any,
                    status: (subscription.status.toUpperCase()) as any,
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                    billingCycle: period
                },
                update: {
                    stripeSubscriptionId: subscription.id,
                    plan: (planType || "STANDARD") as any,
                    status: (subscription.status.toUpperCase()) as any,
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                    billingCycle: period
                }
            });
            console.log(`✅ Linked subscription ${subscription.id} to user ${user.id} (Status: ${subscription.status})`);
        }

        // Restore "mark trial as used" for this user immediately
        if (user) {
            await prisma.user.update({
                where: { id: user.id },
                data: { hasUsedFreeTrial: true }
            });
            console.log(`✅ Marked trial as used for user ${user.id}`);
        }

        let latestInvoice = subscription.latest_invoice as any;
        let clientSecret = latestInvoice?.payment_intent?.client_secret;

        // RETRY MECHANISM: If client_secret is missing, Stripe might be slow to finalize the invoice
        if (!clientSecret && latestInvoice?.id) {
            console.log("⚠️ clientSecret missing, retrying invoice retrieval...");
            for (let i = 0; i < 3; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
                try {
                    const refreshedInvoice = await stripe.invoices.retrieve(latestInvoice.id, {
                        expand: ['payment_intent']
                    });
                    if (refreshedInvoice.payment_intent?.client_secret) {
                        clientSecret = refreshedInvoice.payment_intent.client_secret;
                        latestInvoice = refreshedInvoice;
                        console.log("✅ Retrieved clientSecret on retry", i + 1);
                        break;
                    }
                } catch (err) {
                    console.error(`Retry ${i + 1} failed:`, err);
                }
            }
        }

        // FALLBACK: Check pending_setup_intent
        if (!clientSecret && subscription.pending_setup_intent) {
            clientSecret = (subscription.pending_setup_intent as any).client_secret;
            if (clientSecret) console.log("⚠️ Using pending_setup_intent client_secret");
        }

        if (!clientSecret) {
            console.error("❌ ERROR: clientSecret is missing after all attempts.");
            console.log("📊 Debug State:", {
                subscription_status: subscription.status,
                invoice_status: latestInvoice?.status,
                invoice_amount: latestInvoice?.amount_due,
                payment_intent_type: typeof latestInvoice?.payment_intent
            });

            return res.status(500).json({
                message: "Failed to initialize payment. Please try again.",
                debug: `Missing client_secret. Invoice status: ${latestInvoice?.status}, Amount: ${latestInvoice?.amount_due}`
            });
        }

        res.status(200).json({
            subscriptionId: subscription.id,
            clientSecret: clientSecret,
            customerId: customerId
        });

    } catch (error) {
        next(error);
    }
};
export const activateFreePlanApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const { planType } = req.body;

        const existingSub = await prisma.subscription.findUnique({ where: { userId } });
        if (existingSub) {
            return res.status(400).json({ message: "Subscription already exists" });
        }

        const isStandardTrial = planType === 'STANDARD';
        const endDate = isStandardTrial
            ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
            : null;

        await prisma.subscription.create({
            data: {
                userId,
                stripeCustomerId: isStandardTrial ? `trial_${userId}` : `free_${userId}`,
                plan: (planType || "FREE") as any,
                status: "ACTIVE",
                ...(endDate && { trialEnd: endDate })
            }
        });

        const message = isStandardTrial
            ? "14-day free trial activated successfully"
            : "Free plan activated successfully";

        res.status(200).json({ message });
    } catch (error) {
        next(error);
    }
};
export const cancelSubscriptionApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const { reason } = req.body;

        const sub = await prisma.subscription.findUnique({ where: { userId } });

        if (!sub) {
            return res.status(404).json({ message: "No active subscription found" });
        }

        // 1. If it's a Stripe subscription, cancel immediately (to revoke access)
        // User requested immediate UI restriction upon cancellation
        if (sub.stripeSubscriptionId) {
            // 1. Retrieve the subscription from Stripe to get current plan details
            const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);

            // 2. Actually cancel in Stripe
            await stripe.subscriptions.cancel(sub.stripeSubscriptionId);

            // Correct fallback prices based on frontend: Standard ($29/$278), Pro ($79/$756)
            const amountSnapshot = stripeSub.items.data[0].plan.amount ||
                (sub.plan === 'PRO' ? (sub.billingCycle === 'YEARLY' ? 75600 : 7900) : (sub.billingCycle === 'YEARLY' ? 27800 : 2900));

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
                        currency: stripeSub.items.data[0].plan.currency || 'usd',
                        status: 'CANCELED',
                        plan: sub.plan,
                        stripePaymentIntentId: `manual_cancel_${Date.now()}`,
                        stripeInvoiceId: `cancel_${sub.stripeSubscriptionId}`,
                        periodStart: new Date(stripeSub.current_period_start * 1000),
                        periodEnd: new Date(stripeSub.current_period_end * 1000)
                    }
                })
            ]);
            console.log(`✅ [Manual Cancel] Recorded history for user ${userId} (Price: ${amountSnapshot / 100})`);

            // Emit update to frontend IMMEDIATELY
            io.to(userId).emit("subscription_updated");

            return res.status(200).json({ message: "Subscription canceled successfully." });
        }

        // 2. If it's a trial/free plan (no Stripe subscription), cancel immediately in DB
        await prisma.subscription.update({
            where: { userId },
            data: {
                status: "CANCELED",
                cancelReason: reason
            }
        });

        // Emit update to frontend IMMEDIATELY
        io.to(userId).emit("subscription_updated");

        res.status(200).json({ message: "Subscription canceled successfully." });
    } catch (error) {
        next(error);
    }
};

export const getAllPaymentsApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        console.log("userId", userId);
        const payments = await prisma.payment.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        fullName: true,
                        email: true,
                        address: true,
                        country: true,
                        state: true,
                        subscription: {
                            select: {
                                billingCycle: true,
                                currentPeriodEnd: true,
                                plan: true,
                                status: true,

                            }
                        }
                    }
                }
            }
        });
        console.log(`[getAllPaymentsApi] User: ${userId} | Found: ${payments.length} payments`);
        payments.forEach(p => console.log(`- P: ${p.id} | Status: ${p.status}`));

        // Transform to include all billing details
        const paymentsWithDetails = payments.map(payment => {
            const planName = payment.plan || payment.user.subscription?.plan || 'Standard';
            const billingCycle = payment.user.subscription?.billingCycle || 'Monthly';

            // Format Amount (Cents to Dollar String)
            const amountFormatted = `$${(payment.amount / 100).toFixed(2)}`;

            // Map Invoice Number (Fallback if Stripe ID is missing)
            const invoiceNo = payment.stripeInvoiceId || `INV-${new Date(payment.createdAt).getFullYear()}-${payment.id.split('-')[0].toUpperCase()}`;

            // Map Status to Frontend requirements ("paid", "pending", "overdue", "canceled")
            let status = payment.status.toLowerCase();
            if (status === 'succeeded' || status === 'paid') status = 'paid';
            if (status === 'failed') status = 'overdue';
            if (status === 'canceled') status = 'canceled';

            return {
                id: payment.id,
                invoiceNo: invoiceNo,
                date: (payment.periodStart || payment.createdAt).toISOString().split('T')[0],
                dueDate: (payment.periodEnd || payment.createdAt).toISOString().split('T')[0],

                amount: amountFormatted,
                status: status,
                plan: planName,
                last4: payment.paymentMethodLast4 || '4242',

                // RAW DATA for frontend calculations/formatting
                rawAmount: payment.amount / 100,
                createdAt: payment.createdAt,

                // Billing Details for Invoice Modal
                billTo: {
                    name: payment.user.fullName,
                    email: payment.user.email,
                    address: payment.user.address || "-", // Fallback
                    city: `${payment.user.state || ''}, ${payment.user.country || ''}`.replace(/^, /, '') || "-"
                },
                items: [
                    {
                        description: `${planName} Plan`,
                        subtext: `${billingCycle} subscription`,
                        qty: "01",
                        price: amountFormatted,
                        amount: amountFormatted,
                        status: status === 'paid' ? 'Paid' : (status === 'overdue' ? 'Overdue' : (status === 'canceled' ? 'Canceled' : 'Pending'))
                    }
                ],
                subtotal: amountFormatted,
                tax: "$0.00",
                total: amountFormatted,
                notes: payment.status === 'CANCELED'
                    ? `Thank you for your business! This reflects your subscription cancellation for the ${billingCycle === 'YEARLY' ? 'Annual' : 'Monthly'} term.`
                    : `Thank you for your business! ${billingCycle === 'YEARLY' ? 'Annual' : 'Monthly'} subscription payment.`
            };
        });

        res.status(200).json(paymentsWithDetails);
    } catch (error) {
        next(error);
    }
};

// Force Sync local DB with Stripe status
export const syncSubscriptionApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.id;
        const sub = await prisma.subscription.findUnique({
            where: { userId }
        });

        if (!sub || !sub.stripeSubscriptionId) {
            return res.status(404).json({ message: "No stripe subscription found to sync" });
        }


        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);

        const statusMap: Record<string, string> = {
            'active': "ACTIVE",
            'past_due': "PAST_DUE",
            'canceled': "CANCELED",
            'unpaid': "UNPAID",
            'trialing': "TRIALING",
            'incomplete': "INCOMPLETE",
            'incomplete_expired': "INCOMPLETE_EXPIRED"
        };

        const mappedStatus = statusMap[stripeSub.status] || "ACTIVE";

        const updatedSub = await prisma.subscription.update({
            where: { userId },
            data: {
                status: mappedStatus as any,
                currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
                plan: (stripeSub.metadata?.planType || sub.plan) as any,
                cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
                billingCycle: (stripeSub.metadata?.period) || (stripeSub.plan?.interval === 'year' ? 'YEARLY' : 'MONTHLY')
            }
        });

        // 2. Fetch Latest Invoices to sync payments (solves race condition with webhook)
        console.log(`🔍 [Sync] Checking latest invoices for subscription ${sub.stripeSubscriptionId}`);
        const invoices = await stripe.invoices.list({
            subscription: sub.stripeSubscriptionId,
            limit: 5
        });

        for (const invoice of invoices.data) {
            if (invoice.status === 'paid' && invoice.amount_paid > 0) {
                const existingPayment = await prisma.payment.findFirst({
                    where: { stripeInvoiceId: invoice.id }
                });

                if (!existingPayment) {
                    console.log(`💰 [Sync] Recording missing payment for invoice ${invoice.id}`);
                    let last4 = null;
                    try {
                        if (invoice.charge) {
                            const charge = await stripe.charges.retrieve(invoice.charge as string);
                            last4 = (charge.payment_method_details as any)?.card?.last4;
                        }
                    } catch (e) { /* ignore */ }

                    await prisma.payment.create({
                        data: {
                            userId: userId,
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
                } else if (!existingPayment.periodStart || !existingPayment.periodEnd) {
                    console.log(`🔄 [Sync] Backfilling missing period data for invoice ${invoice.id}`);
                    await prisma.payment.update({
                        where: { id: existingPayment.id },
                        data: {
                            periodStart: new Date(invoice.lines.data[0].period.start * 1000),
                            periodEnd: new Date(invoice.lines.data[0].period.end * 1000)
                        }
                    });
                }
            }
        }
        res.status(200).json({
            message: "Subscription synced successfully",
            status: updatedSub.status,
            subscription: updatedSub
        });
    } catch (error) {
        next(error);
    }
};
// Admin: Get All Invoices
export const getAllInvoicesApi = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { providerId } = req.query;

        const whereClause = providerId ? { userId: String(providerId) } : {};

        const payments = await prisma.payment.findMany({
            where: whereClause,
            include: {
                user: {
                    select: { fullName: true, email: true, role: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json(payments);
    } catch (error) {
        next(error);
    }
};