
import { Request } from "express";
export interface AuthenticatedRequest extends Request {
    id: string;
    role: string;
    email: string;
    user: User
}

export interface User {
    id: string,
    email: string,
    // role: string
}