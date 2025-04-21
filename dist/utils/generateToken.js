"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRefreshToken = exports.generateAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const generateAccessToken = (user) => {
    var _a;
    const secret = process.env.ACCESS_TOKEN_SECRET;
    const expiry = process.env.ACCESS_TOKEN_EXPIRY || "1d";
    if (!secret) {
        throw new Error("ACCESS_TOKEN_SECRET is not defined in environment variables.");
    }
    return jsonwebtoken_1.default.sign({
        id: user.id,
        email: user.email,
        role: (_a = user.role) === null || _a === void 0 ? void 0 : _a.name,
    }, secret, { expiresIn: expiry } // Explicitly type the options object
    );
};
exports.generateAccessToken = generateAccessToken;
const generateRefreshToken = (user) => {
    const secret = process.env.REFRESH_TOKEN_SECRET;
    const expiry = process.env.REFRESH_TOKEN_EXPIRY || "10d";
    if (!secret) {
        throw new Error("REFRESH_TOKEN_SECRET is not defined in environment variables.");
    }
    return jsonwebtoken_1.default.sign({ id: user.id }, secret, { expiresIn: expiry } // Explicitly type the options object
    );
};
exports.generateRefreshToken = generateRefreshToken;
