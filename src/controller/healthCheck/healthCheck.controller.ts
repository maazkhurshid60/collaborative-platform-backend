import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";

const getHealthCheckStatus = asyncHandler(async (req: Request, res: Response) => {
    try {
        // Server is running if this route is hit
        const serverStatus = 'Server is Up and Running';

        // 2Check database connection
        let databaseStatus: string;
        try {
            await prisma.$queryRaw`SELECT 1`;
            databaseStatus = 'Database is Connected';
        } catch (dbError: unknown) {
            if (dbError instanceof Error) {
                databaseStatus = `Error: ${dbError.message}`;
            } else {
                databaseStatus = 'Unknown database error';
            }
        }

        // 3️⃣ Send response
        res.status(StatusCodes.OK).json({
            status: 'OK',
            server: serverStatus,
            database: databaseStatus,
            timestamp: new Date(),
        });
    } catch (error: unknown) {
        let errorMessage = 'Unexpected error in health check';

        if (error instanceof Error) {
            errorMessage = error.message;
        }

        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            status: 'ERROR',
            message: errorMessage,
        });
    }
}

)

export { getHealthCheckStatus }