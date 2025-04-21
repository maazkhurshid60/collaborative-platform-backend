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
                req.header("Authorization")?.replace("Bearer ", "");

            if (!token) {
                return res.status(401).json({ message: "Unauthorized Request" });
            }

            if (!process.env.ACCESS_TOKEN_SECRET) {
                return res.status(500).json({ message: "Access token secret not set in environment variables" });
            }

            // Decode the token
            const decodedToken = jwt.decode(token);

            if (typeof decodedToken === 'object' && decodedToken !== null) {
                const { id, email, exp, role } = decodedToken as { id: string; email: string; exp: number; role: string };

                // Check if the token has expired
                const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
                if (exp < currentTime) {
                    return res.status(401).json({ message: "Token has expired" });
                }

                // Attach the user data to the request object
                req.user = { id, email, role }; // Add role along with id and email
                next(); // Proceed to the next middleware or route handler
            } else {
                return res.status(401).json({ message: "Invalid token" });
            }
        } catch (error) {
            return res.status(401).json({ message: error || "Invalid Access Token" });
        }
    }
);
