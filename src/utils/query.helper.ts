import prisma from "../db/db.config";

// Find Overdue Users (Past Due)
export const getOverdueUsers = async () => {
    return await prisma.subscription.findMany({
        where: { status: 'PAST_DUE' },
        include: {
            user: {
                include: {
                    _count: {
                        select: { payments: true }
                    }
                }
            }
        }
    });
}

// Find Canceled Users
export const getCanceledUsers = async () => {
    return await prisma.subscription.findMany({
        where: { status: 'CANCELED' },
        include: { user: true }
    });
}
