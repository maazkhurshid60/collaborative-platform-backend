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
exports.getHealthCheckStatus = void 0;
const http_status_codes_1 = require("http-status-codes");
const asyncHandler_1 = require("../../utils/asyncHandler");
const db_config_1 = __importDefault(require("../../db/db.config"));
const getHealthCheckStatus = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Server is running if this route is hit
        const serverStatus = 'Server is Up and Running';
        // 2Check database connection
        let databaseStatus;
        try {
            yield db_config_1.default.$queryRaw `SELECT 1`;
            databaseStatus = 'Database is Connected';
        }
        catch (dbError) {
            if (dbError instanceof Error) {
                databaseStatus = `Error: ${dbError.message}`;
            }
            else {
                databaseStatus = 'Unknown database error';
            }
        }
        // 3️⃣ Send response
        res.status(http_status_codes_1.StatusCodes.OK).json({
            status: 'OK',
            server: serverStatus,
            database: databaseStatus,
            timestamp: new Date(),
        });
    }
    catch (error) {
        let errorMessage = 'Unexpected error in health check';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json({
            status: 'ERROR',
            message: errorMessage,
        });
    }
}));
exports.getHealthCheckStatus = getHealthCheckStatus;
