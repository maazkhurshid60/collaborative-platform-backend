import dotenv from "dotenv";
dotenv.config();
import prisma from "./src/db/db.config";

async function main() {
    const users = await prisma.user.findMany({
        select: {
            fullName: true,
            email: true,
            gender: true,
            role: true
        }
    });

    console.table(users);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
