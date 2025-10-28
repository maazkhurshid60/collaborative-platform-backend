"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginSchema = exports.superAdminSchema = exports.providerSchema = exports.clientSchema = exports.userSchema = void 0;
const zod_1 = require("zod");
const strongPassword = zod_1.z
    .string()
    .min(8, { message: "Kam az kam 8 characters ka password hona chahiye" })
    .regex(/[a-z]/, { message: "Ek lowercase letter hona chahiye" })
    .regex(/[A-Z]/, { message: "Ek uppercase letter hona chahiye" })
    .regex(/[0-9]/, { message: "Ek number hona chahiye" })
    .regex(/[^A-Za-z0-9]/, { message: "Ek special character hona chahiye" });
exports.userSchema = zod_1.z.object({
    fullName: zod_1.z.string().nonempty().min(3, { message: "Full Name not less then 3letters." }),
    profileImage: zod_1.z.string().optional(),
    gender: zod_1.z.enum(["male", "female", "other"], { message: "Gender must be either male or female or other" }).optional(),
    age: zod_1.z.coerce.number()
        .min(10, { message: "Age must be at least 10" }) // Min 2-digit number (10)
        .max(99, { message: "Age must be at most 99" }).optional(), // Max 2-digit number (99)    
    contactNo: zod_1.z.string().nonempty().min(8, { message: "Contact no not less then 8digits" }).max(20, { message: "Contact no not more then 20digits" }).optional(),
    address: zod_1.z.string().nonempty().min(1, { message: "This field is required" }).optional(),
    status: zod_1.z.enum(["active", "disable"], { message: "Status must be either active or disable" }).optional(),
    licenseNo: zod_1.z.string().nonempty().min(1, { message: "license number is required." }),
    role: zod_1.z.enum(["client", "provider", "superadmin"], { message: "Role must be either client or provider" }),
    isApprove: zod_1.z.string().optional(),
    country: zod_1.z.string().nonempty("Country is required"),
    state: zod_1.z.string().nonempty("State is required"),
    publicKey: zod_1.z.string().optional(),
    privateKey: zod_1.z.string().optional(),
});
// Client Schema (Extends User)
exports.clientSchema = exports.userSchema.extend({
    eSignature: zod_1.z.string().optional(),
    clientShowToOthers: zod_1.z.boolean().optional(),
    email: zod_1.z.string().nonempty("Email is required").email("Invalid email format"),
    password: zod_1.z.string().optional(),
    isAccountCreatedByOwnClient: zod_1.z.coerce.boolean(),
});
// Provider Schema (Extends User)
exports.providerSchema = exports.userSchema.extend({
    email: zod_1.z.string().nonempty("Email is required").email("Invalid email format"),
    password: zod_1.z.string().optional(),
    department: zod_1.z.string().nonempty("Department is required"),
});
// Super Admin Schema (Extends User)
exports.superAdminSchema = exports.userSchema.extend({
    email: zod_1.z.string().nonempty("Email is required").email("Invalid email format"),
    password: zod_1.z
        .string()
        .min(10, { message: "Password not less then 10letters" })
        .max(50, "Password not more then 50letters").optional(),
});
// Login Schema
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().nonempty("Email is required").email("Invalid email format"),
    password: zod_1.z
        .string().nonempty("Password is required")
        .min(10, { message: "Password not less then 10letters" })
        .max(50, "Password not more then 50letters"),
});
