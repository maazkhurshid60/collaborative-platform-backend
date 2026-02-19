import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/apiResponse';
import { StatusCodes } from 'http-status-codes';
import prisma from '../../db/db.config';

// TEST ENDPOINT - Check what login actually returns
export const testLoginResponse = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    const provider = await prisma.provider.findFirst({
        where: { user: { email } },
        include: {
            user: {
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    profileImage: true,
                    role: true,
                    status: true,
                    isApprove: true,
                    hasUsedFreeTrial: true,
                    subscription: {
                        select: {
                            id: true,
                            plan: true,
                            status: true,
                            trialStart: true,
                            trialEnd: true,
                            currentPeriodEnd: true,
                            cancelAtPeriodEnd: true
                        }
                    }
                }
            }
        }
    });

    console.log('🔍 TEST: Provider data:', JSON.stringify(provider, null, 2));

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { provider }, 'Test successful')
    );
});
