import dotenv from 'dotenv';
dotenv.config();

// Fix for relative import path when running with ts-node
import prisma from '../src/db/db.config';
import bcrypt from 'bcrypt';

async function main() {
    console.log('🌱 Seeding Super Admin...');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@kolabme.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';

    // Hash the password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // 1. Check if admin already exists
    const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail },
    });

    if (existingAdmin) {
        console.log(`⚠️ User with email ${adminEmail} already exists.`);

        // Optional: Check if they are a superAdmin
        if (existingAdmin.role === 'superAdmin') {
            console.log('✅ User is already a Super Admin. No action needed.');
            return;
        } else {
            console.log('❌ User exists but is NOT a Super Admin. Please delete this user manually or use a different email.');
            return;
        }
    }

    // 2. Create User and SuperAdmin
    await prisma.$transaction(async (tx) => {
        // Create the User record
        const user = await tx.user.create({
            data: {
                fullName: 'Super Admin',
                email: adminEmail,
                password: hashedPassword,
                gender: 'MALE',
                role: 'superAdmin',
                isApprove: 'APPROVED',
                status: 'active',
                country: 'USA',
                state: 'California',
            },
        });

        // Create the SuperAdmin role record
        await tx.superAdmin.create({
            data: {
                userId: user.id,
            },
        });

        console.log(`✅ Super Admin created successfully!`);
        console.log(`UserID: ${user.id}`);
    });

    console.log('\n--- Admin Credentials ---');
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);
    console.log('-------------------------');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
