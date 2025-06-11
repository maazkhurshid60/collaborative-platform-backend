"use strict";
// import nodemailer from "nodemailer";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transporter = void 0;
// export const transporter = nodemailer.createTransport({
//     service: "Gmail", // or SMTP
//     auth: {
//         user: "softwaredevelopermudasser@gmail.com",
//         pass: "smhfamtvhyzgdfnf",
//     },
// });
const nodemailer_1 = __importDefault(require("nodemailer"));
exports.transporter = nodemailer_1.default.createTransport({
    host: 'sandbox.smtp.mailtrap.io',
    port: 587,
    auth: {
        user: 'f56632beee8877', // from Mailtrap
        pass: 'e8698977b05260', // from Mailtrap
    },
});
