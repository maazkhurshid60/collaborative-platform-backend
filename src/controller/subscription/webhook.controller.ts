import { Request, Response } from "express";
import prisma from "../../db/db.config";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../../utils/stripe/stripe";
import { io } from "../../socket/socket";


export const stripeWebhookApi = async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent((req as any).rawBody, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = session.metadata?.userId;
                const userDataEmail = session.metadata?.email;
                const subscriptionId = session.subscription as string;
                const planType = session.metadata?.planType || 'PRO';
                const period = session.metadata?.period || 'MONTHLY'; // Extract period

                console.log("🔔 [Webhook] checkout.session.completed", { userId, email: userDataEmail, subscriptionId, planType, period });

                if (subscriptionId) {
                    let targetUserId = userId === 'temp' ? null : userId;

                    // 1. Resolve User
                    if (!targetUserId && userDataEmail) {
                        const user = await prisma.user.findUnique({
                            where: { email: userDataEmail }
                        });
                        if (user) targetUserId = user.id;
                    }

                    if (targetUserId) {
                        try {
                            // Use transaction for safer updates
                            await prisma.$transaction(async (tx) => {
                                // A. Handle Old Subscription Cancellation
                                const existingSub = await tx.subscription.findUnique({
                                    where: { userId: targetUserId }
                                });

                                if (existingSub?.stripeSubscriptionId && existingSub.stripeSubscriptionId !== subscriptionId) {
                                    console.log(`⚠️ [Webhook] Cancelling old subscription ${existingSub.stripeSubscriptionId} for user ${targetUserId}`);
                                    try {
                                        await stripe.subscriptions.cancel(existingSub.stripeSubscriptionId);
                                    } catch (err) {
                                        console.error("❌ [Webhook] Failed to cancel old subscription:", err);
                                    }
                                }

                                // B. Update User Approval & Subscription
                                console.log(`🔄 [Webhook] Upserting subscription for user ${targetUserId}`);
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
                                                    stripePriceId: session.line_items?.[0]?.price?.id,
                                                    plan: planType as any,
                                                    billingCycle: period
                                                },
                                                update: {
                                                    stripeCustomerId: session.customer as string,
                                                    stripeSubscriptionId: subscriptionId,
                                                    status: "ACTIVE",
                                                    stripePriceId: session.line_items?.[0]?.price?.id,
                                                    plan: planType as any,
                                                    billingCycle: period
                                                }
                                            }
                                        },
                                        hasUsedFreeTrial: true, // Mark trial as used for this user
                                    }
                                });

                                // C. Create Payment Record (If Paid)
                                if (session.payment_status === 'paid') {
                                    const amount = session.amount_total || 0;
                                    const currency = session.currency || 'usd';

                                    // Idempotency Check
                                    const existingPayment = await tx.payment.findFirst({
                                        where: { stripeInvoiceId: session.invoice as string }
                                    });

                                    if (!existingPayment && session.invoice && amount > 0) {
                                        console.log(`💰 [Webhook] Recording payment from Checkout Session ($${amount / 100})`);
                                        let last4 = null;
                                        try {
                                            if (session.payment_intent) {
                                                const pi: any = await stripe.paymentIntents.retrieve(session.payment_intent as string, {
                                                    expand: ['payment_method']
                                                });
                                                last4 = pi.payment_method?.card?.last4 || pi.metadata?.last4;
                                            }

                                            // Fallback to searching charges if PI didn't have it
                                            if (!last4 && session.payment_intent) {
                                                const charges = await stripe.charges.list({
                                                    payment_intent: session.payment_intent as string,
                                                    limit: 1
                                                });
                                                last4 = charges.data[0]?.payment_method_details?.card?.last4;
                                            }
                                        } catch (err) {
                                            console.warn("⚠️ [Webhook] Failed to retrieve last4:", err);
                                        }

                                        let periodStart = null;
                                        let periodEnd = null;
                                        try {
                                            if (session.invoice) {
                                                const inv = await stripe.invoices.retrieve(session.invoice as string);
                                                periodStart = new Date(inv.lines.data[0].period.start * 1000);
                                                periodEnd = new Date(inv.lines.data[0].period.end * 1000);
                                            }
                                        } catch (e) { console.warn("⚠️ Failed to get period for session invoice:", e); }

                                        await tx.payment.create({
                                            data: {
                                                userId: targetUserId,
                                                amount: amount,
                                                currency: currency,
                                                status: 'SUCCEEDED',
                                                plan: planType as string || 'PRO', // Store plan at time of payment
                                                stripePaymentIntentId: session.payment_intent as string || "checkout_session",
                                                stripeInvoiceId: session.invoice as string,
                                                paymentMethodLast4: last4,
                                                periodStart: periodStart,
                                                periodEnd: periodEnd
                                            }
                                        });
                                    } else {
                                        console.log(`ℹ️ [Webhook] Payment skipped (Exists: ${!!existingPayment}, Amount: ${amount})`);
                                    }
                                }
                            });

                            // Emit update to frontend
                            io.to(targetUserId).emit("subscription_updated");
                        } catch (txError) {
                            console.error(`❌ [Webhook] Transaction failed for user ${targetUserId}:`, txError);
                        }
                    } else {
                        console.error("❌ [Webhook] User not found for checkout session", { userId, email: userDataEmail });
                    }
                }
                break;
            }
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                const subscriptionId = invoice.subscription as string;
                const email = invoice.customer_email;

                console.log(`🔔 [Webhook] invoice.payment_succeeded`, { subscriptionId, email, amount: invoice.amount_paid });

                if (!subscriptionId) {
                    console.log("⚠️ [Webhook] No subscription ID in invoice, skipping.");
                    break;
                }

                // 1. Try to find subscription locally
                let subscription = await prisma.subscription.findUnique({
                    where: { stripeSubscriptionId: subscriptionId }
                });

                let stripeSub: any = null;

                // 2. RECOVERY LOGIC (If subscription not found locally)
                if (!subscription) {
                    console.warn(`⚠️ [Webhook] Subscription ${subscriptionId} not found locally. Attempting recovery...`);
                    try {
                        stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
                        const { userId, planType, period } = stripeSub.metadata || {};
                        const subEmail = stripeSub.metadata?.email || email;

                        console.log(`📊 [Webhook] Stripe metadata:`, { userId, planType, email: subEmail, period });

                        let targetUserId = userId === 'temp' ? null : userId;

                        // Try resolve user by Email if ID missing
                        if (!targetUserId && subEmail) {
                            const user = await prisma.user.findUnique({ where: { email: subEmail } });
                            if (user) targetUserId = user.id;
                        }

                        if (targetUserId) {
                            console.log(`✅ [Webhook] Resolved user: ${targetUserId}`);

                            // Upsert Subscription
                            try {
                                const statusMap: Record<string, string> = {
                                    'active': "ACTIVE",
                                    'past_due': "PAST_DUE",
                                    'canceled': "CANCELED",
                                    'unpaid': "UNPAID",
                                    'trialing': "TRIALING",
                                };
                                const mappedStatus = statusMap[stripeSub.status] || "ACTIVE";

                                // Determine Billing Cycle
                                const interval = stripeSub.plan?.interval || 'month'; // 'month' or 'year'
                                const billingCycle = period || (interval === 'year' ? 'YEARLY' : 'MONTHLY');

                                console.log(`🔄 [Webhook] Upserting subscription record...`);
                                subscription = await prisma.subscription.upsert({
                                    where: { userId: targetUserId },
                                    create: {
                                        userId: targetUserId,
                                        stripeCustomerId: stripeSub.customer as string,
                                        stripeSubscriptionId: subscriptionId,
                                        status: mappedStatus as any,
                                        plan: (planType || "STANDARD") as any,
                                        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
                                        billingCycle: billingCycle
                                    },
                                    update: {
                                        stripeSubscriptionId: subscriptionId,
                                        status: mappedStatus as any,
                                        plan: (planType || "STANDARD") as any,
                                        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
                                        billingCycle: billingCycle
                                    }
                                });

                                // Ensure free trial is marked used
                                await prisma.user.update({
                                    where: { id: targetUserId },
                                    data: { hasUsedFreeTrial: true }
                                });

                            } catch (upsertError) {
                                console.error(`❌ [Webhook] Upsert failed (Race condition?):`, upsertError);
                                // Try valid lookup one last time in case race condition meant it was created by another process
                                subscription = await prisma.subscription.findUnique({ where: { userId: targetUserId } });
                            }
                        } else {
                            console.error(`❌ [Webhook] Could not resolve user for subscription ${subscriptionId}`);
                        }
                    } catch (stripeErr) {
                        console.error("❌ [Webhook] Recovery failed:", stripeErr);
                    }
                }

                // 3. Process Payment & Update Status
                if (subscription) {
                    console.log(`✅ [Webhook] Processing invoice for user ${subscription.userId}`);
                    try {
                        // Update status if we haven't already
                        if (!stripeSub) {
                            try {
                                stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
                            } catch (e) { console.warn("Could not fetch latest stripe sub status"); }
                        }

                        const statusMap: Record<string, string> = {
                            'active': "ACTIVE", 'past_due': "PAST_DUE", 'canceled': "CANCELED",
                            'unpaid': "UNPAID", 'trialing': "TRIALING",
                        };
                        const mappedStatus = statusMap[stripeSub?.status] || "ACTIVE";

                        const interval = stripeSub?.plan?.interval || 'month';
                        const billingCycle = (stripeSub?.metadata?.period) || (interval === 'year' ? 'YEARLY' : 'MONTHLY');

                        await prisma.subscription.update({
                            where: { id: subscription.id },
                            data: {
                                status: mappedStatus as any,
                                currentPeriodEnd: new Date(invoice.lines.data[0].period.end * 1000),
                                cancelAtPeriodEnd: stripeSub?.cancel_at_period_end ?? false,
                                billingCycle: billingCycle
                            }
                        });


                        // Idempotency Check for Payment
                        const existingPayment = await prisma.payment.findFirst({
                            where: { stripeInvoiceId: invoice.id }
                        });

                        if (!existingPayment && invoice.amount_paid > 0) {
                            console.log(`💰 [Webhook] Creating payment record for invoice ${invoice.id}`);
                            let last4 = null;
                            try {
                                if (invoice.charge) {
                                    const charge = await stripe.charges.retrieve(invoice.charge as string);
                                    last4 = (charge.payment_method_details as any)?.card?.last4;
                                }
                                if (!last4 && invoice.payment_intent) {
                                    const pi: any = await stripe.paymentIntents.retrieve(invoice.payment_intent as string, { expand: ['payment_method'] });
                                    last4 = pi.payment_method?.card?.last4;
                                }
                            } catch (err) { console.warn("⚠️ Failed to get last4:", err); }

                            await prisma.payment.create({
                                data: {
                                    userId: subscription.userId,
                                    amount: invoice.amount_paid,
                                    currency: invoice.currency,
                                    status: 'SUCCEEDED',
                                    plan: subscription.plan,
                                    stripePaymentIntentId: invoice.payment_intent as string || "trial_invoice",
                                    stripeInvoiceId: invoice.id,
                                    invoiceUrl: invoice.hosted_invoice_url,
                                    paymentMethodLast4: last4,
                                    periodStart: new Date(invoice.lines.data[0].period.start * 1000),
                                    periodEnd: new Date(invoice.lines.data[0].period.end * 1000)
                                }
                            });
                        } else if (existingPayment && (!existingPayment.periodStart || !existingPayment.periodEnd)) {
                            console.log(`🔄 [Webhook] Backfilling period data for invoice ${invoice.id}`);
                            await prisma.payment.update({
                                where: { id: existingPayment.id },
                                data: {
                                    periodStart: new Date(invoice.lines.data[0].period.start * 1000),
                                    periodEnd: new Date(invoice.lines.data[0].period.end * 1000)
                                }
                            });
                        } else {
                            console.log(`ℹ️ [Webhook] Payment skipped (Exists: ${!!existingPayment}, Amount: ${invoice.amount_paid})`);
                        }

                        // Check for renewal
                        const paymentCount = await prisma.payment.count({ where: { userId: subscription.userId } });
                        if (paymentCount > 1) {
                            io.to(subscription.userId).emit("subscription_renewal", {
                                type: 'renewal',
                                amount: invoice.amount_paid,
                                currency: invoice.currency,
                                nextBillingDate: new Date(invoice.lines.data[0].period.end * 1000),
                                plan: subscription.plan
                            });
                        }

                        // Emit update
                        io.to(subscription.userId).emit("subscription_updated");

                    } catch (innerError) {
                        console.error(`❌ [Webhook] Error processing invoice logic:`, innerError);
                    }
                } else {
                    console.error("❌ [Webhook] Failed to link invoice to any subscription/user.");
                }
                break;
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const subscriptionId = invoice.subscription as string;
                console.log(`⚠️ [Webhook] invoice.payment_failed for ${subscriptionId}`);
                await prisma.subscription.updateMany({
                    where: { stripeSubscriptionId: subscriptionId },
                    data: { status: "PAST_DUE" }
                });
                const sub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subscriptionId }, select: { userId: true } });
                if (sub) {
                    // Create FAILED Payment Record
                    const existingPayment = await prisma.payment.findFirst({
                        where: { stripeInvoiceId: invoice.id }
                    });

                    if (!existingPayment) {
                        await prisma.payment.create({
                            data: {
                                userId: sub.userId,
                                amount: invoice.amount_due,
                                currency: invoice.currency,
                                status: 'FAILED',
                                plan: "STANDARD", // Default, or fetch from subscription if needed
                                stripePaymentIntentId: invoice.payment_intent as string || "failed_invoice",
                                stripeInvoiceId: invoice.id,
                                invoiceUrl: invoice.hosted_invoice_url,
                                paymentMethodLast4: null
                            }
                        });
                        console.log(`❌ [Webhook] Recorded FAILED payment for invoice ${invoice.id}`);
                    }

                    io.to(sub.userId).emit("subscription_updated");
                }
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                console.log(`⚠️ [Webhook] customer.subscription.deleted for ${subscription.id}`);

                // Find the sub record for this Stripe subscription
                const deletedSub = await prisma.subscription.findUnique({
                    where: { stripeSubscriptionId: subscription.id },
                    select: { userId: true, id: true }
                });

                if (deletedSub) {
                    // Check if the user ALREADY has a NEWER subscription (different stripe ID)
                    // This means the cancellation was triggered by an upgrade — don't overwrite with CANCELED
                    const currentSub = await prisma.subscription.findUnique({
                        where: { userId: deletedSub.userId },
                        select: { stripeSubscriptionId: true, status: true }
                    });

                    const isUpgradeFlow = currentSub &&
                        currentSub.stripeSubscriptionId !== subscription.id &&
                        ['ACTIVE', 'TRIALING', 'INCOMPLETE'].includes(currentSub.status as string);

                    if (isUpgradeFlow) {
                        console.log(`ℹ️ [Webhook] Skipping CANCELED update for ${subscription.id} — user ${deletedSub.userId} already has a newer subscription (upgrade flow)`);
                    } else {
                        // Genuine cancellation — update DB and notify frontend
                        const sub = await prisma.subscription.findUnique({ where: { userId: deletedSub.userId } });

                        // Idempotency: Check if we already recorded this cancellation (e.g. from manual API)
                        const existingCancelRecord = await prisma.payment.findFirst({
                            where: { stripeInvoiceId: `cancel_${subscription.id}`, status: 'CANCELED' }
                        });

                        if (existingCancelRecord) {
                            console.log(`ℹ️ [Webhook] Cancellation already recorded for ${subscription.id}, skipping duplicate Payment entry.`);
                            await prisma.subscription.updateMany({
                                where: { stripeSubscriptionId: subscription.id },
                                data: { status: "CANCELED", cancelAtPeriodEnd: false }
                            });
                        } else {
                            // Correct fallback prices: Standard ($29/$278), Pro ($79/$756)
                            const amountSnapshot = subscription.items?.data[0]?.plan?.amount ||
                                (sub?.plan === 'PRO' ? (sub?.billingCycle === 'YEARLY' ? 75600 : 7900) : (sub?.billingCycle === 'YEARLY' ? 27800 : 2900));

                            await prisma.$transaction([
                                prisma.subscription.updateMany({
                                    where: { stripeSubscriptionId: subscription.id },
                                    data: { status: "CANCELED", cancelAtPeriodEnd: false }
                                }),
                                prisma.payment.create({
                                    data: {
                                        userId: deletedSub.userId,
                                        amount: amountSnapshot,
                                        currency: subscription.items?.data[0]?.plan?.currency || 'usd',
                                        status: 'CANCELED',
                                        plan: sub?.plan || "STANDARD",
                                        stripePaymentIntentId: `stripe_cancel_${subscription.id}`,
                                        stripeInvoiceId: `cancel_${subscription.id}`
                                    }
                                })
                            ]);
                            console.log(`✅ [Webhook] Marked subscription ${subscription.id} as CANCELED for user ${deletedSub.userId} (Price: ${amountSnapshot / 100})`);
                        }
                        io.to(deletedSub.userId).emit("subscription_updated");
                    }
                }
                break;
            }
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                console.log("🚀 [Webhook] customer.subscription.updated:", subscription.id);
                const existingSub = await prisma.subscription.findUnique({
                    where: { stripeSubscriptionId: subscription.id }
                });

                if (existingSub) {
                    const statusMap: Record<string, string> = {
                        'active': "ACTIVE",
                        'past_due': "PAST_DUE",
                        'canceled': "CANCELED",
                        'unpaid': "UNPAID",
                        'trialing': "TRIALING",
                    };
                    const updates: any = {
                        status: statusMap[subscription.status] || 'ACTIVE',
                        cancelAtPeriodEnd: subscription.cancel_at_period_end,
                        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : undefined
                    };
                    await prisma.subscription.update({
                        where: { id: existingSub.id },
                        data: updates
                    });
                    io.to(existingSub.userId).emit("subscription_updated");
                } else {
                    console.warn(`⚠️ [Webhook] update event received for unknown subscription ${subscription.id}`);
                }
                break;
            }
        }
        res.json({ received: true });
    } catch (error) {
        console.error("Webhook Handler Error:", error);
        res.status(500).json({ error: "Webhook handler failed" });
    }
};
