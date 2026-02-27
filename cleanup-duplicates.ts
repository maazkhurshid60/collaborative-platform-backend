import 'dotenv/config';
import prisma from './src/db/db.config';

async function main() {
    console.log("Looking for duplicate payments...");

    // Get all payments that have a stripeInvoiceId
    const payments = await prisma.payment.findMany({
        where: {
            stripeInvoiceId: { not: null }
        },
        orderBy: {
            createdAt: 'asc' // Keep the first created, delete subsequent
        }
    });

    const seenIds = new Set<string>();
    const toDelete: string[] = [];

    for (const payment of payments) {
        if (!payment.stripeInvoiceId) continue;

        if (seenIds.has(payment.stripeInvoiceId)) {
            toDelete.push(payment.id);
        } else {
            seenIds.add(payment.stripeInvoiceId);
        }
    }

    if (toDelete.length > 0) {
        console.log(`Found ${toDelete.length} duplicate payments. Deleting...`);
        const result = await prisma.payment.deleteMany({
            where: {
                id: { in: toDelete }
            }
        });
        console.log(`Deleted ${result.count} duplicate records.`);
    } else {
        console.log("No duplicate payments found.");
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
