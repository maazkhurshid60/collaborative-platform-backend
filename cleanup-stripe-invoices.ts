
import { stripe } from "./src/utils/stripe/stripe";
import Stripe from "stripe";

async function main() {
    console.log("Fetching all invoices from Stripe...");

    let hasMore = true;
    let startingAfter: string | undefined = undefined;
    let deletedCount = 0;
    let voidedCount = 0;

    while (hasMore) {
        const invoices: Stripe.ApiList<Stripe.Invoice> = await stripe.invoices.list({
            limit: 100,
            starting_after: startingAfter
        });

        if (invoices.data.length === 0) {
            hasMore = false;
            break;
        }

        for (const invoice of invoices.data) {
            try {
                if (invoice.status === 'draft') {
                    await stripe.invoices.del(invoice.id);
                    console.log(`🗑️ Deleted draft invoice: ${invoice.id}`);
                    deletedCount++;
                } else if (invoice.status === 'open' || invoice.status === 'uncollectible') {
                    await stripe.invoices.voidInvoice(invoice.id);
                    console.log(`🚫 Voided invoice: ${invoice.id}`);
                    voidedCount++;
                } else if (invoice.status === 'paid') {
                    console.log(`⚠️ Skipping PAID invoice ${invoice.id} (Cannot delete via API, requires manual refund/credit note)`);
                } else if (invoice.status === 'void') {
                    console.log(`ℹ️ Invoice ${invoice.id} is already void.`);
                }
            } catch (error: any) {
                console.error(`❌ Failed to process invoice ${invoice.id}:`, error.message);
            }
        }

        if (invoices.has_more) {
            startingAfter = invoices.data[invoices.data.length - 1].id;
        } else {
            hasMore = false;
        }
    }

    console.log(`\nCleanup Complete!`);
    console.log(`Deleted Drafts: ${deletedCount}`);
    console.log(`Voided Invoices: ${voidedCount}`);
}

main()
    .catch(console.error);
