"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = void 0;
const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch((error) => next(res.status(error.statusCode || 500).json({
            success: false,
            message: error.message
        })));
    };
};
exports.asyncHandler = asyncHandler;
