"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateResetToken = generateResetToken;
const crypto_1 = __importDefault(require("crypto"));
function generateResetToken() {
    const token = crypto_1.default.randomBytes(32).toString("hex");
    const hashedToken = crypto_1.default.createHash("sha256").update(token).digest("hex");
    return { token, hashedToken };
}
