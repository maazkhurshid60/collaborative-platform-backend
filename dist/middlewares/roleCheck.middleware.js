"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRoles = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const http_status_codes_1 = require("http-status-codes");
const apiResponse_1 = require("../utils/apiResponse");
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(http_status_codes_1.StatusCodes.UNAUTHORIZED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.UNAUTHORIZED, {}, "Unauthorized"));
            return;
        }
        const token = authHeader.split(" ")[1];
        try {
            const jwtSecret = process.env.JWT_SECRET || "default_secret";
            const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
            if (!allowedRoles.includes(decoded.role)) {
                res.status(http_status_codes_1.StatusCodes.FORBIDDEN).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.FORBIDDEN, {}, "Access denied: Insufficient role"));
                return;
            }
            // Attach user to request object
            req.user = decoded;
            next();
        }
        catch (error) {
            res.status(http_status_codes_1.StatusCodes.UNAUTHORIZED).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.UNAUTHORIZED, {}, "Invalid token"));
        }
    };
};
exports.authorizeRoles = authorizeRoles;
