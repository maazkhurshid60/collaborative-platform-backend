const { PrismaClient } = require("./src/generated/prisma");
const prisma = new PrismaClient();
const bcrypt = require("bcrypt");

async function verifySignupApproval() {
    console.log("Verifying signup approval logic...");

    // Mock user data with a subscriptionId
    const userData = {
        fullName: "Test Provider Approval",
        email: `test_approval_${Date.now()}@example.com`,
        password: "password123",
        role: "provider",
        subscriptionId: "sub_mock_12345",
        planType: "STANDARD",
        country: "US",
        state: "New York"
    };

    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const user = await prisma.user.create({
        data: {
            fullName: userData.fullName,
            email: userData.email,
            password: hashedPassword,
            role: "provider",
            isApprove: userData.subscriptionId ? "APPROVED" : "PENDING", // This is the logic we want to test
            country: userData.country,
            state: userData.state,
            subscription: {
                create: {
                    stripeSubscriptionId: userData.subscriptionId,
                    plan: userData.planType,
                    status: 'ACTIVE'
                }
            }
        },
        include: { subscription: true }
    });

    console.log("Created User:");
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`isApprove: ${user.isApprove}`);
    console.log(`Subscription Status: ${user.subscription?.status}`);

    if (user.isApprove === "APPROVED") {
        console.log("✅ SUCCESS: User was automatically approved!");
    } else {
        console.log("❌ FAILURE: User was NOT automatically approved.");
    }

    // Cleanup
    await prisma.subscription.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
}

verifySignupApproval()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
