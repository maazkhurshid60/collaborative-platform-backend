import { z } from "zod";
const strongPassword = z
    .string()
    .min(10, { message: "Password must be at least 10 characters long" })
    .regex(/[a-z]/, { message: "One sohuld be lower case letter" })
    .regex(/[A-Z]/, { message: "One sohuld be upper case letter" })
    .regex(/[0-9]/, { message: "One sohuld be numeric number" })
    .regex(/[^A-Za-z0-9]/, { message: "One sohuld be special character" });

export const fullNameValidator = z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(80, "Full name must be 80 characters or less.")
    .refine((val) => /^[\p{L}.'-]+(?:\s[\p{L}.'-]+)*$/u.test(val), {
        message:
            "Full name can contain only letters, spaces, hyphens (-), apostrophes ('), and periods (.).",
    });

export const licenseNoValidator = z
    .string()
    .trim()
    .nonempty("License number is required.");

export const userSchema = z.object({
    fullName: fullNameValidator,
    profileImage: z.string().nullable().optional(),
    gender: z.enum(["male", "female", "other"], { message: "Gender must be either male or female or other" }).optional(),
    age: z.coerce.number()
        .min(10, { message: "Age must be at least 10" })  // Min 2-digit number (10)
        .max(99, { message: "Age must be at most 99" }).optional(), // Max 2-digit number (99)    
    contactNo: z.string().nonempty({ message: "Contact no is required" }).min(8, { message: "Contact no not less then 8digits" }).max(20, { message: "Contact no not more then 20digits" }).optional(),
    address: z.string().optional(),
    status: z.enum(["active", "disable"], { message: "Status must be either active or disable" }).optional(),
    licenseNo: z.string().optional(),
    role: z.enum(["client", "provider", "superAdmin"], { message: "Role must be either client or provider" }),
    isApprove: z.string().optional(),
    email: z.string().nonempty("Email is required").email("Invalid email format"),
    password: strongPassword.optional(),
    country: z.string().nonempty("Country is required"),
    state: z.string().nonempty("State is required"),
    publicKey: z.string().optional(),
    privateKey: z.string().optional(),
})
// Client Schema (Extends User)
export const clientSchema = userSchema.extend({
    eSignature: z.string().optional(),
    clientShowToOthers: z.boolean().optional(),
    isAccountCreatedByOwnClient: z.coerce.boolean(),
})
// Provider Schema (Extends User)
export const providerSchema = userSchema.extend({
    department: z.string().nonempty("Department is required"),
    inviteToken: z.string().optional(),
    licenseNo: licenseNoValidator.optional(),
})
// Super Admin Schema (Extends User)
export const superAdminSchema = userSchema.extend({
    // email and password inherited from userSchema
})
// Login Schema
export const loginSchema = z.object({
    email: z.string().nonempty("Email is required").email("Invalid email format"),
    password: z.string().nonempty("Password is required"),
})


export const updateClientSchema = z.object({
    clientId: z.string().uuid(), // To identify which client to update

    // Fields for the Client model
    email: z.string().email().optional(),
    eSignature: z.string().optional(),
    clientShowToOthers: z.boolean().optional(),

    // Fields for the related User model
    fullName: z.string().min(2).optional(),
    gender: z.string().optional(),
    age: z.number().optional(),
    contactNo: z.string().optional(),
    address: z.string().optional(),
    status: z.string().optional(),
    licenseNo: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
});