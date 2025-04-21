"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authJWT = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const asyncHandler_1 = require("../utils/asyncHandler");
// The authJWT middleware verifies the token and attaches the user data to the request object
exports.authJWT = (0, asyncHandler_1.asyncHandler)((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // Get the token from cookies or Authorization header
        const token = ((_a = req.cookies) === null || _a === void 0 ? void 0 : _a.accessToken) ||
            ((_b = req.header("Authorization")) === null || _b === void 0 ? void 0 : _b.replace("Bearer ", ""));
        if (!token) {
            return res.status(401).json({ message: "Unauthorized Request" });
        }
        if (!process.env.ACCESS_TOKEN_SECRET) {
            return res.status(500).json({ message: "Access token secret not set in environment variables" });
        }
        // Decode the token
        const decodedToken = jsonwebtoken_1.default.decode(token);
        if (typeof decodedToken === 'object' && decodedToken !== null) {
            const { id, email, exp, role } = decodedToken;
            // Check if the token has expired
            const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
            if (exp < currentTime) {
                return res.status(401).json({ message: "Token has expired" });
            }
            // Attach the user data to the request object
            req.user = { id, email, role }; // Add role along with id and email
            next(); // Proceed to the next middleware or route handler
        }
        else {
            return res.status(401).json({ message: "Invalid token" });
        }
    }
    catch (error) {
        return res.status(401).json({ message: error || "Invalid Access Token" });
    }
}));
