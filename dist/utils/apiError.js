"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = exports.ApiError = void 0;
class ApiError extends Error {
    constructor(statusCode, message = "Something Went Wrong", errors = [], stack = "") {
        super(message);
        this.statusCode = statusCode;
        this.data = null;
        this.message = message;
        this.success = false;
        this.errors = errors;
        if (stack) {
            this.stack = stack;
        }
        else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.ApiError = ApiError;
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = statusCode < 400 ? "success" : "error";
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
