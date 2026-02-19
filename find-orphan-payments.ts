
import prisma from "./src/db/db.config";

async function main() {
    console.log("Searching for all payments of $29.00...");
    const payments = await prisma.payment.findMany({
        where: { amount: 2900 },
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' }
    });

    console.log(`Found ${payments.length} payments of $29.00:`);
    payments.forEach(p => {
        console.log(`- Date: ${p.createdAt.toISOString()} | User: ${p.user?.email} | Invoice: ${p.stripeInvoiceId}`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
