import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../utils/apiResponse";

export const authorizeRoles = (...allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
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
                userId: string;
                email: string;
                role: string;
            };

            if (!allowedRoles.includes(decoded.role)) {
                res.status(StatusCodes.FORBIDDEN).json(
                    new ApiResponse(StatusCodes.FORBIDDEN, {}, "Access denied: Insufficient role")
                );
                return;
            }

            // Attach user to request object
            (req as any).user = decoded;
            next();
        } catch (error) {
            res.status(StatusCodes.UNAUTHORIZED).json(
                new ApiResponse(StatusCodes.UNAUTHORIZED, {}, "Invalid token")
            );
        }
    };
};
