import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler";

// The authJWT middleware verifies the token and attaches the user data to the request object
export const authJWT = asyncHandler(
    async (req: any, res: Response, next: NextFunction) => {
        try {
            // Get the token from cookies or Authorization header
            const token =
                req.cookies?.accessToken ||
                req.cookies?.token ||
                req.header("Authorization")?.replace("Bearer ", "");

            if (!token) {
                return res.status(401).json({ message: "Unauthorized Request. Token not found." });
            }

            const jwtSecret = process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET;
            if (!jwtSecret) {
                return res.status(500).json({ message: "JWT secret not set in environment variables" });
            }

            // FIX: Using jwt.verify to cryptographically validate the signature
            const decodedToken = jwt.verify(token, jwtSecret);

            if (typeof decodedToken === 'object' && decodedToken !== null) {
                const { userId, id, email, role } = decodedToken as { userId?: string, id?: string; email: string; role: string };

                // Normalize identity fields
                req.user = {
                    id: id || userId,
                    email,
                    role
                };
                next();
            } else {
                return res.status(401).json({ message: "Invalid token structure" });
            }
        } catch (error: any) {
            console.error("Auth Middleware Error:", error.message);
            const message = error.name === "TokenExpiredError" ? "Token has expired" : "Invalid Access Token";
            return res.status(401).json({ message });
        }
    }
);