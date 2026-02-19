import prisma from './src/db/db.config';

async function checkClient() {
    const clientId = "99f12735-5c93-4345-b91f-1c13b6b81fd6";
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: {
            user: { select: { fullName: true, email: true } },
            providerList: {
                include: {
                    provider: {
                        include: { user: { select: { fullName: true, id: true } } }
                    }
                }
            }
        }
    });

    if (!client) {
        console.log("Client not found");
        return;
    }

    console.log("Client Found:");
    console.log({
        id: client.id,
        fullName: client.user.fullName,
        createdByProviderId: client.createdByProviderId,
        providerOnClientList: client.providerList.map(p => ({
            providerId: p.providerId,
            providerFullName: p.provider.user.fullName,
            providerUserId: p.provider.user.id
        }))
    });

    // Also check providers in the system to see which one might match
    // const providers = await prisma.provider.findMany({ include: { user: true } });
    // console.log("All Providers:", providers.map(p => ({ id: p.id, fullName: p.user.fullName })));
}

checkClient()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
