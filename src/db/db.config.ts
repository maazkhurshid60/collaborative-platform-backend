import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
        ? ["warn", "error"] // Only show warnings and errors in development
        : ["error"], // Only show errors in production
    errorFormat: 'minimal'
})

// Graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});

export default prisma
