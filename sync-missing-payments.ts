
import prisma from "./src/db/db.config";
import { stripe } from "./src/utils/stripe/stripe";

async function main() {
    const userEmail = "anas-ahmad@gmail.com";
    console.log(`Syncing payments for ${userEmail}...`);

    const user = await prisma.user.findUnique({
        where: { email: userEmail }
    });

    if (!user || !user.stripeCustomerId) {
        console.error("User not found or no Stripe Customer ID linked.");
        return;
    }

    console.log(`Found User: ${user.id} | Stripe ID: ${user.stripeCustomerId}`);

    // Fetch all paid invoices from Stripe
    const invoices = await stripe.invoices.list({
        customer: user.stripeCustomerId,
        status: 'paid',
        limit: 100
    });

    console.log(`Stripe returned ${invoices.data.length} paid invoices.`);

    for (const invoice of invoices.data) {
        // Check if exists in DB
        const existingPayment = await prisma.payment.findFirst({
            where: { stripeInvoiceId: invoice.id }
        });

        if (existingPayment) {
            console.log(`✅ EXISITNG: Invoice ${invoice.id} ($${invoice.amount_paid / 100})`);
            continue;
        }

        console.log(`⚠️ MISSING: Invoice ${invoice.id} ($${invoice.amount_paid / 100}) - Syncing...`);

        // Get Payment Method details for last4
        let last4 = null;
        if (invoice.payment_intent) {
            try {
                const pi = await stripe.paymentIntents.retrieve(invoice.payment_intent as string, {
                    expand: ['payment_method']
                });
                // Safe cast/access
                const pm: any = pi.payment_method;
                last4 = pm?.card?.last4 || null;
            } catch (e) {
                console.error("Failed to get PI:", e);
            }
        }

        // Create Payment
        await prisma.payment.create({
            data: {
                userId: user.id,
                amount: invoice.amount_paid,
                currency: invoice.currency,
                status: 'SUCCEEDED',
                plan: (invoice.lines.data[0]?.plan?.nickname || "STANDARD").toUpperCase(),
                stripePaymentIntentId: invoice.payment_intent as string || `sync_${Date.now()}`,
                stripeInvoiceId: invoice.id,
                invoiceUrl: invoice.hosted_invoice_url,
                paymentMethodLast4: last4,
                createdAt: new Date(invoice.created * 1000) // Use Stripe timestamp
            }
        });
        console.log(`🎉 Synced Invoice ${invoice.id}`);
    }

    console.log("Done!");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
