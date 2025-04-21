"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cookiesOptions = exports.ALLOWED_HEADERS = exports.ALLOWED_METHODS = exports.WHITE_LIST_DOMAINS = exports.CPUS_COUNT = exports.MORGRAN_FORMAT = exports.PORT_NUMBER = void 0;
const os_1 = __importDefault(require("os"));
exports.PORT_NUMBER = process.env.PORT || 7000;
exports.MORGRAN_FORMAT = ":remote-addr - :remote-user :method :url :status :response-time ms";
exports.CPUS_COUNT = os_1.default.cpus().length;
exports.WHITE_LIST_DOMAINS = ['http://localhost:5173', 'http://localhost:4173'];
exports.ALLOWED_METHODS = ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];
exports.ALLOWED_HEADERS = ['Content-Type', 'Authorization'];
// export const cookiesOptions: CookieOptions = {
//     httpOnly: false,
//     secure: (process.env.NODE_ENV === 'STAGING' || process.env.NODE_ENV === 'PRODUCTION') ?? false,
//     sameSite: 'none'
// }
exports.cookiesOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'STAGING' || process.env.NODE_ENV === 'PRODUCTION',
    sameSite: 'none'
};
