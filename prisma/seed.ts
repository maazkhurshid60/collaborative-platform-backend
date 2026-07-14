import dotenv from 'dotenv';
dotenv.config();
import prisma from '../src/db/db.config';
import bcrypt from 'bcrypt';

async function main() {
    const adminEmail = 'admin@kolabme.com';
    const adminPassword = 'Admin123!';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    console.log('🌱 Seeding database...');

    // 1. Check if admin already exists
    const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail },
    });

    if (existingAdmin) {
        console.log('🗑️ Admin user already exists. Deleting and recreating to ensure correct role...');
        await prisma.user.delete({ where: { email: adminEmail } });
    }

    // 2. Create User and SuperAdmin
    await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                fullName: 'Super Admin',
                email: adminEmail,
                password: hashedPassword,
                gender: 'MALE',
                role: 'superAdmin',
                isApprove: 'APPROVED',
                status: 'ACTIVE',
                country: 'USA',
                state: 'California',
            },
        });

        await tx.superAdmin.create({
            data: {
                userId: user.id,
            },
        });
    });

    console.log('✅ Admin user created successfully!');
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);

    // 3. Create Provider
    const providerEmail = 'provider@kolabme.com';
    const providerPassword = 'Provider123!';
    const hashedProviderPassword = await bcrypt.hash(providerPassword, 10);

    const existingProvider = await prisma.user.findUnique({ where: { email: providerEmail } });
    if (existingProvider) {
        await prisma.user.delete({ where: { email: providerEmail } });
    }

    await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                fullName: 'Test Provider',
                email: providerEmail,
                password: hashedProviderPassword,
                gender: 'MALE',
                role: 'provider',
                isApprove: 'APPROVED',
                status: 'ACTIVE',
                country: 'USA',
                state: 'New York',
                licenseNo: 'LIC-PROV-001',
            },
        });

        await tx.provider.create({
            data: {
                userId: user.id,
                speciality: 'General Medicine',
            },
        });
    });

    console.log('✅ Provider user created successfully!');
    console.log(`📧 Email: ${providerEmail}`);
    console.log(`🔑 Password: ${providerPassword}`);

    // 4. Create Client
    const clientEmail = 'client@kolabme.com';
    const clientPassword = 'Client123!';
    const hashedClientPassword = await bcrypt.hash(clientPassword, 10);

    const existingClient = await prisma.user.findUnique({ where: { email: clientEmail } });
    if (existingClient) {
        await prisma.user.delete({ where: { email: clientEmail } });
    }

    await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                fullName: 'Test Client',
                email: clientEmail,
                password: hashedClientPassword,
                gender: 'MALE',
                role: 'client',
                isApprove: 'APPROVED',
                status: 'ACTIVE',
                country: 'USA',
                state: 'Texas',
                licenseNo: 'LIC-CLI-001',
            },
        });

        await tx.client.create({
            data: {
                userId: user.id,
                isAccountCreatedByOwnClient: true,
            },
        });
    });

    console.log('✅ Base Client created successfully!');

    // 5. Create Extra Providers (5)
    console.log('🌱 Seeding 5 extra providers...');
    const createdProviderIds: string[] = [];

    for (let i = 1; i <= 5; i++) {
        const email = `provider${i}@kolabme.com`;
        const exists = await prisma.user.findUnique({ where: { email } });
        if (exists) await prisma.user.delete({ where: { email } });

        await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    fullName: `Provider ${i}`,
                    email,
                    password: hashedProviderPassword, // Reuse provider password
                    gender: i % 2 === 0 ? 'FEMALE' : 'MALE',
                    role: 'provider',
                    isApprove: 'APPROVED',
                    status: 'active',
                    country: 'USA',
                    state: 'New York',
                    licenseNo: `LIC-PROV-EXTRA-${i}`,
                },
            });
            const provider = await tx.provider.create({
                data: { userId: user.id, speciality: 'General Medicine' },
            });
            createdProviderIds.push(provider.id);
        });
        console.log(`   - Created ${email}`);
    }

    // 6. Create Extra Clients (10)
    console.log('🌱 Seeding 10 extra clients with Provider links...');
    for (let i = 1; i <= 10; i++) {
        const email = `client${i}@kolabme.com`;
        const exists = await prisma.user.findUnique({ where: { email } });
        if (exists) await prisma.user.delete({ where: { email } });

        await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    fullName: `Client ${i}`,
                    email,
                    password: hashedClientPassword, // Reuse client password
                    gender: i % 2 === 0 ? 'FEMALE' : 'MALE',
                    role: 'client',
                    isApprove: 'APPROVED',
                    status: 'active',
                    country: 'USA',
                    state: 'California',
                    licenseNo: `LIC-CLI-EXTRA-${i}`,
                },
            });
            const client = await tx.client.create({
                data: { userId: user.id, isAccountCreatedByOwnClient: false }, // Set to false to indicate provider-linked
            });

            // Assign to a provider (Clients 1-2 -> Provider 1, etc)
            // i=1 -> index 0
            // i=2 -> index 0
            // i=3 -> index 1
            const providerIndex = Math.ceil(i / 2) - 1;
            if (createdProviderIds[providerIndex]) {
                await tx.providerOnClient.create({
                    data: {
                        clientId: client.id,
                        providerId: createdProviderIds[providerIndex]
                    }
                });
            }
        });
        console.log(`   - Created ${email} (Linked to Provider ${Math.ceil(i / 2)})`);
    }
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
