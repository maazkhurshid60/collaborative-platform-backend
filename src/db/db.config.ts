import { PrismaClient } from "../generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'staging' || process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('rds.amazonaws.com')
        ? { rejectUnauthorized: false }
        : false
})
const adapter = new PrismaPg(pool)

const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development'
        ? ["warn", "error"] // Only show warnings and errors in development
        : ["error"], // Only show errors in production
    errorFormat: 'minimal',

})

// Graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});

export default prisma
