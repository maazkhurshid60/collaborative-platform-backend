"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transporter = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
exports.transporter = nodemailer_1.default.createTransport({
    host: process.env.NODE_MAILER_HOST,
    port: 587,
    auth: {
        user: process.env.NODE_MAILER_USER, // from Mailtrap
        pass: process.env.NODE_MAILER_PASS, // from Mailtrap
    },
});
