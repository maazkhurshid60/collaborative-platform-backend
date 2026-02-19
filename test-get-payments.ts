
import prisma from "./src/db/db.config";

async function main() {
    const userEmail = "anas-ahmad@gmail.com";
    const user = await prisma.user.findUnique({ where: { email: userEmail } });

    if (!user) {
        console.error("User not found");
        return;
    }

    console.log(`Checking payments for User ID: ${user.id}`);

    const payments = await prisma.payment.findMany({
        where: { userId: user.id },
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

    console.log(`Query returned ${payments.length} payments.`);
    payments.forEach(p => {
        console.log(`- ID: ${p.id} | Amount: ${p.amount} | Status: ${p.status}`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
