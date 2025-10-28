"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptText = encryptText;
exports.decryptText = decryptText;
const crypto_1 = __importDefault(require("crypto"));
const key = Buffer.from(process.env.ENCRYPTION_KEY, 'base64'); // 👈 VERY IMPORTANT
const IV_LENGTH = 16;
function encryptText(plainText) {
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return iv.toString('base64') + ':' + encrypted;
}
function decryptText(encryptedText) {
    const [ivStr, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivStr, 'base64');
    const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
