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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ouRoleCheck = void 0;
const apiError_1 = require("../utils/apiError");
const asyncHandler_1 = require("../utils/asyncHandler");
// A middleware to check user roles
const ouRoleCheck = (roles) => {
    return (0, asyncHandler_1.asyncHandler)((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        console.log("Allowed roles:", roles);
        // Ensure the user is logged in (req.user is populated by the authentication middleware)
        if (!req.user) {
            throw new apiError_1.ApiError(401, "You must be logged in to access this route");
        }
        // Check if the user's role matches one of the allowed roles
        if (!roles.includes(req.user.role)) {
            throw new apiError_1.ApiError(403, `You are not authorized to access this route. Role: ${req.user.role} is not allowed`);
        }
        // Proceed to the next middleware/route handler if the role is correct
        next();
    }));
};
exports.ouRoleCheck = ouRoleCheck;
