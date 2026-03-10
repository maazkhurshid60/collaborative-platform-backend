
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const c = {
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

async function main() {
    // Block production
    if (process.env.NODE_ENV === "production") {
        console.log(c.red("❌ Cannot run in production."));
        process.exit(1);
    }

    console.log(c.cyan("\n🗑️  Clearing all records (tables stay intact)...\n"));

    // Delete in FK order — children first, parents last
    const steps = [
        { name: "payments", fn: () => prisma.Payment.deleteMany() },
        { name: "chatChannels", fn: () => prisma.chatChannel.deleteMany() },
        { name: "subscriptions", fn: () => prisma.subscription.deleteMany() },
        { name: "providers", fn: () => prisma.provider.deleteMany() },
        { name: "users", fn: () => prisma.user.deleteMany() },
    ];

    for (const step of steps) {
        try {
            const result = await step.fn();
            console.log(c.green(`  ✅ ${step.name.padEnd(16)} → ${result.count} records cleared`));
        } catch (err: any) {
            console.log(`  ⚠️  ${step.name.padEnd(16)} → skipped (${err.message})`);
        }
    }

    console.log(c.bold(c.green("\n✅ Done — all records cleared, all tables intact.\n")));
    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(c.red("Fatal:"), err.message);
    await prisma.$disconnect();
    process.exit(1);
});