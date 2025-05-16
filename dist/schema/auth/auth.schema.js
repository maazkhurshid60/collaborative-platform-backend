"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginSchema = exports.providerSchema = exports.clientSchema = exports.userSchema = void 0;
const zod_1 = require("zod");
exports.userSchema = zod_1.z.object({
    fullName: zod_1.z.string().nonempty().min(3, { message: "Full Name not less then 3letters." }),
    profileImage: zod_1.z.string().optional(),
    gender: zod_1.z.enum(["male", "female", "other"], { message: "Gender must be either male or female or other" }).optional(),
    age: zod_1.z.number()
        .min(10, { message: "Age must be at least 10" }) // Min 2-digit number (10)
        .max(99, { message: "Age must be at most 99" }).optional(), // Max 2-digit number (99)    
    contactNo: zod_1.z.string().nonempty().min(8, { message: "Contact no not less then 8digits" }).max(20, { message: "Contact no not more then 20digits" }).optional(),
    address: zod_1.z.string().nonempty().min(10, { message: "Not less then 10letters" }).optional(),
    status: zod_1.z.enum(["active", "disable"], { message: "Status must be either active or disable" }).optional(),
    cnic: zod_1.z.string().nonempty().min(12, { message: "CNIC could not less then 12 character" }).max(20, { message: "CNIC could not more then 20 character" }),
    role: zod_1.z.enum(["client", "provider"], { message: "Role must be either client or provider" })
});
// Client Schema (Extends User)
exports.clientSchema = exports.userSchema.extend({
    eSignature: zod_1.z.string().optional(),
    email: zod_1.z.string().nonempty("Email is required").email("Invalid email format"),
    password: zod_1.z
        .string()
        .optional()
        .refine((val) => !val || val.length >= 10, { message: "Password is required and should not be less than 10 characters" }),
    isAccountCreatedByOwnClient: zod_1.z.boolean().default(false)
});
// Provider Schema (Extends User)
exports.providerSchema = exports.userSchema.extend({
    email: zod_1.z.string().nonempty("Email is required").email("Invalid email format"),
    password: zod_1.z
        .string()
        .min(10, { message: "Password not less then 10letters" })
        .max(50, "Password not more then 50letters").optional(),
    department: zod_1.z.string().nonempty("Department is required"),
});
// Login Schema
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().nonempty("Email is required").email("Invalid email format"),
    password: zod_1.z
        .string().nonempty("Password is required")
        .min(10, { message: "Password not less then 10letters" })
        .max(50, "Password not more then 50letters"),
});
