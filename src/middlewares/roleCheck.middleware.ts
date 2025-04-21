import { NextFunction, Response, Request } from "express";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

// A middleware to check user roles
export const ouRoleCheck = (roles: string[]) => {
    return asyncHandler(async (req: any, res: any, next: any) => {
        console.log("Allowed roles:", roles);

        // Ensure the user is logged in (req.user is populated by the authentication middleware)
        if (!req.user) {
            throw new ApiError(401, "You must be logged in to access this route");
        }

        // Check if the user's role matches one of the allowed roles
        if (!roles.includes(req.user.role)) {
            throw new ApiError(403, `You are not authorized to access this route. Role: ${req.user.role} is not allowed`);
        }

        // Proceed to the next middleware/route handler if the role is correct
        next();
    });
};
