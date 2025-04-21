"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientSchema = void 0;
const zod_1 = require("zod");
// Client Schema (Extends User)
exports.clientSchema = zod_1.z.object({
    eSignature: zod_1.z.string().optional(),
    clientId: zod_1.z.string().nonempty("Client Id is required"),
    email: zod_1.z.string().nonempty("Email is required").email("Invalid email format"),
    password: zod_1.z
        .string()
        .min(10, { message: "Password not less then 10letters" })
        .max(50, "Password not more then 50letters")
        .optional().refine((password) => !password || (password.length >= 10 && password.length <= 50), {
        message: "Password must be between 10 and 50 characters",
    }),
    fullName: zod_1.z.string().nonempty().min(3, { message: "Full Name not less then 3letters." }),
    profileImage: zod_1.z.string().optional(),
    gender: zod_1.z.enum(["male", "female", "other"], { message: "Gender must be either male or female or other" }),
    age: zod_1.z.number()
        .min(10, { message: "Age must be at least 10" }) // Min 2-digit number (10)
        .max(99, { message: "Age must be at most 99" }), // Max 2-digit number (99)    
    contactNo: zod_1.z.string().nonempty().min(8, { message: "Contact no not less then 8digits" }).max(20, { message: "Contact no not more then 20digits" }),
    address: zod_1.z.string().nonempty().min(10, { message: "Not less then 10letters" }),
    status: zod_1.z.enum(["active", "disable"], { message: "Status must be either active or disable" }),
    cnic: zod_1.z.string().nonempty().min(12, { message: "Not" }),
    isAccountCreatedByOwnClient: zod_1.z.boolean().default(false),
    role: zod_1.z.string().optional()
});
