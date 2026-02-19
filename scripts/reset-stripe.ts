import dotenv from 'dotenv';
import Stripe from 'stripe';

// Load environment variables
dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
    console.error("❌ STRIPE_SECRET_KEY is missing in .env");
    process.exit(1);
}

const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2025-12-15.clover',
});

async function deleteAllTestCustomers() {
    console.log("🔄 Starting Stripe test data cleanup...");

    if (!stripeSecretKey?.startsWith('sk_test_')) {
        console.error("❌ ABORTING: STRIPE_SECRET_KEY does not appear to be a test key (must start with 'sk_test_').");
        console.error("   This script only runs in test mode to prevent accidental data loss.");
        process.exit(1);
    }

    let deletedCount = 0;
    let hasMore = true;
    let lastId: string | undefined = undefined;

    while (hasMore) {
        const customers: Stripe.Response<Stripe.ApiList<Stripe.Customer>> = await stripe.customers.list({
            limit: 100,
            starting_after: lastId,
        });

        if (customers.data.length === 0) {
            hasMore = false;
            break;
        }

        console.log(`Found ${customers.data.length} customers to delete...`);

        // Delete in parallel chunks
        const deletePromises = customers.data.map((customer: Stripe.Customer | Stripe.DeletedCustomer) =>
            stripe.customers.del(customer.id)
                .then(() => {
                    process.stdout.write('.');
                    deletedCount++;
                })
                .catch(err => console.error(`\nFailed to delete customer ${customer.id}: ${err.message}`))
        );

        await Promise.all(deletePromises);

        lastId = customers.data[customers.data.length - 1].id;
        hasMore = customers.has_more;
    }

    console.log(`\n\n✅ Successfully deleted ${deletedCount} customers (and their subscriptions/payment methods).`);
}

async function deleteAllInvoices() {
    console.log("🔄 Starting Stripe invoice cleanup...");

    let deletedCount = 0;
    let voidedCount = 0;
    let hasMore = true;
    let lastId: undefined | string = undefined;

    while (hasMore) {
        const invoices: Stripe.Response<Stripe.ApiList<Stripe.Invoice>> = await stripe.invoices.list({
            limit: 100,
            starting_after: lastId,
        });

        if (invoices.data.length === 0) {
            hasMore = false;
            break;
        }

        console.log(`Found ${invoices.data.length} invoices to process...`);

        const promises = invoices.data.map(async (invoice) => {
            try {
                if (invoice.status === 'draft') {
                    await stripe.invoices.del(invoice.id);
                    process.stdout.write('D'); // D for Deleted
                    deletedCount++;
                } else if (invoice.status === 'open' || invoice.status === 'uncollectible') {
                    await stripe.invoices.voidInvoice(invoice.id);
                    process.stdout.write('V'); // V for Voided
                    voidedCount++;
                } else {
                    process.stdout.write('.'); // Skipped (Paid/Void)
                }
            } catch (err: any) {
                console.error(`\nFailed to process invoice ${invoice.id}: ${err.message}`);
            }
        });

        await Promise.all(promises);

        lastId = invoices.data[invoices.data.length - 1].id;
        hasMore = invoices.has_more;
    }

    console.log(`\n\n✅ Cleanup complete: ${deletedCount} deleted (drafts), ${voidedCount} voided.`);
}

async function main() {
    await deleteAllInvoices();
    await deleteAllTestCustomers();
}

main().catch(err => {
    console.error("\n❌ Error:", err);
    process.exit(1);
});
