import jwt from "jsonwebtoken";

const generateAccessToken = (user: any): string => {
    const secret = process.env.ACCESS_TOKEN_SECRET as string;
    const expiry = process.env.ACCESS_TOKEN_EXPIRY || "1d";

    if (!secret) {
        throw new Error("ACCESS_TOKEN_SECRET is not defined in environment variables.");
    }
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role?.name,
        },
        secret,
        { expiresIn: expiry } as jwt.SignOptions // Explicitly type the options object
    );
};

const generateRefreshToken = (user: any): string => {
    const secret = process.env.REFRESH_TOKEN_SECRET as string;
    const expiry = process.env.REFRESH_TOKEN_EXPIRY || "10d";
    if (!secret) {
        throw new Error("REFRESH_TOKEN_SECRET is not defined in environment variables.");
    }
    return jwt.sign(
        { id: user.id },
        secret,
        { expiresIn: expiry } as jwt.SignOptions // Explicitly type the options object
    );
};

export { generateAccessToken, generateRefreshToken };