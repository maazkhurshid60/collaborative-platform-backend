import dotenv from "dotenv";
dotenv.config();
import prisma from "./src/db/db.config";

async function main() {
    const providers = await prisma.provider.findMany({
        select: {
            user: {
                select: {
                    fullName: true,
                    gender: true
                }
            }
        }
    });

    console.table(providers.map(p => ({
        fullName: p.user.fullName,
        gender: p.user.gender
    })));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
