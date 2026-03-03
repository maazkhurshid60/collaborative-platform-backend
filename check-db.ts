import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `
    console.log('Tables found in public schema:', tables)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
