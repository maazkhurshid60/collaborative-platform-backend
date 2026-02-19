
import prisma from "./src/db/db.config";

async function main() {
    console.log("Fetching latest 20 payments...");
    const payments = await prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { user: { select: { email: true, id: true } } }
    });
    console.log(JSON.stringify(payments, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
