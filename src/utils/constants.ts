// Defining CONSTANTS for the Application
import { CookieOptions } from "express";
import os from "os";

export const PORT_NUMBER = process.env.PORT || 7000;
export const MORGRAN_FORMAT = ":remote-addr - :remote-user :method :url :status :response-time ms";
export const CPUS_COUNT = os.cpus().length;

export const WHITE_LIST_DOMAINS: string[] = ['http://localhost:5173', 'http://localhost:4173', "https://collaborative-platform-frontend.vercel.app"];
export const ALLOWED_METHODS: string[] = ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];
export const ALLOWED_HEADERS: string[] = ['Content-Type', 'Authorization'];


// export const cookiesOptions: CookieOptions = {
//     httpOnly: false,
//     secure: (process.env.NODE_ENV === 'STAGING' || process.env.NODE_ENV === 'PRODUCTION') ?? false,
//     sameSite: 'none'
// }

export const cookiesOptions: CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'STAGING' || process.env.NODE_ENV === 'PRODUCTION',
    sameSite: 'none'
};
