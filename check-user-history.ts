
import prisma from "./src/db/db.config";

async function main() {
    const userEmail = process.argv[2] || "muhammadjunaid9394@gmail.com";




    const userEmails = await prisma.$queryRaw`SELECT email from "User" where email = ${userEmail}`;

    console.log(userEmails);

    console.log(`Fetching history for ${userEmail}...`);

    const user = await prisma.user.findUnique({
        where: { email: userEmail },
        include: {
            subscription: true,
            payments: {
                orderBy: { createdAt: 'desc' }
            }
        }
    });

    if (!user) {
        console.log("User not found!");
        return;
    }

    console.log("User:", {
        id: user.id,
        stripeCustomerId: user.stripeCustomerId,
        hasUsedFreeTrial: user.hasUsedFreeTrial
    });

    console.log("\nCurrent Subscription:", user.subscription);

    console.log(`\nPayments Found: ${user.payments.length}`);
    user.payments.forEach((p, i) => {
        console.log(`[${i + 1}] ID: ${p.id} | UserID: ${p.userId} | Amount: $${p.amount / 100} | Status: ${p.status} | Invoice: ${p.stripeInvoiceId}`);
    });
}


main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
