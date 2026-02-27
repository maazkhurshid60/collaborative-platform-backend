const { PrismaClient } = require("./src/generated/prisma");
const prisma = new PrismaClient();

async function main() {
    const providerId = "fad11b11-74b0-4b40-b9ec-bfd5d5d50f99";
    console.log(`Checking for Provider with ID: ${providerId}`);

    const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        include: { user: true }
    });

    if (provider) {
        console.log("Provider found!");
        console.log(JSON.stringify(provider, null, 2));
    } else {
        console.log("Provider NOT found!");

        // Check if it's a User ID instead
        const user = await prisma.user.findUnique({
            where: { id: providerId },
            include: { provider: true }
        });

        if (user) {
            console.log("Found a User with this ID instead!");
            console.log(JSON.stringify(user, null, 2));
            if (user.provider) {
                console.log(`The correct Provider ID for this user is: ${user.provider.id}`);
            } else {
                console.log("This user does not have an associated Provider record.");
            }
        } else {
            console.log("No User found with this ID either.");
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
