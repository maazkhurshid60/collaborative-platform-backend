import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../utils/apiResponse";

export const authorizeRoles = (...allowedRoles: string[]) => {
    return (req: any, res: Response, next: NextFunction): void => {
        // 1. Check if user is already attached (from authJWT middleware)
        const user = req.user;

        if (user) {
            if (!allowedRoles.includes(user.role)) {
                res.status(StatusCodes.FORBIDDEN).json(
                    new ApiResponse(StatusCodes.FORBIDDEN, {}, "Access denied: Insufficient role")
                );
                return;
            }
            return next();
        }

        // 2. Fallback: Verify token if not already verified (standalone usage)
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(StatusCodes.UNAUTHORIZED).json(
                new ApiResponse(StatusCodes.UNAUTHORIZED, {}, "Unauthorized")
            );
            return;
        }

        const token = authHeader.split(" ")[1];

        try {
            const jwtSecret = process.env.JWT_SECRET || "default_secret";
            const decoded = jwt.verify(token, jwtSecret) as {
                userId?: string;
                id?: string;
                email: string;
                role: string;
            };

            const role = decoded.role;

            if (!allowedRoles.includes(role)) {
                res.status(StatusCodes.FORBIDDEN).json(
                    new ApiResponse(StatusCodes.FORBIDDEN, {}, "Access denied: Insufficient role")
                );
                return;
            }

            // Attach normalized user to request object
            req.user = {
                id: decoded.id || decoded.userId,
                email: decoded.email,
                role: decoded.role
            };
            next();
        } catch (error) {
            res.status(StatusCodes.UNAUTHORIZED).json(
                new ApiResponse(StatusCodes.UNAUTHORIZED, {}, "Invalid token")
            );
        }
    };
};
