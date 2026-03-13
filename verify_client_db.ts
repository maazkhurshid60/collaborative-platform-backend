import dotenv from 'dotenv';
dotenv.config();
import prisma from './src/db/db.config';

async function verifyClient() {
    const targetClientId = "CLT-20260225-8BA16A";
    const client = await prisma.client.findFirst({
        where: {
            OR: [
                { clientId: targetClientId },
                { clientId: " " + targetClientId } // Checking if it somehow has a space in DB too
            ]
        },
        include: {
            user: { select: { fullName: true, email: true } }
        }
    });

    if (!client) {
        // List all clients to see what we have
        const allClients = await prisma.client.findMany({
            take: 10,
            select: { clientId: true }
        });
        return;
    }


}

verifyClient()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
