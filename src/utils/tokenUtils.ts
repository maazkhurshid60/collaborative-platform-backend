import jwt from "jsonwebtoken";

interface DecodedUser {
    id: string;
    email: string;
    exp: number;
    role: string;
}

export const verifyToken = (token: string): DecodedUser => {
    if (!process.env.ACCESS_TOKEN_SECRET) {
        throw new Error("Access token secret not set in environment variables");
    }

    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET) as DecodedUser;
        return decoded;
    } catch (error) {
        throw new Error("Invalid or expired token");
    }
};
