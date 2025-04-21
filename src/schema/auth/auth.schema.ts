import { z } from "zod";

export const userSchema = z.object({
    fullName: z.string().nonempty().min(3, { message: "Full Name not less then 3letters." }),
    profileImage: z.string().optional(),
    gender: z.enum(["male", "female", "other"], { message: "Gender must be either male or female or other" }).optional(),
    age: z.number()
        .min(10, { message: "Age must be at least 10" })  // Min 2-digit number (10)
        .max(99, { message: "Age must be at most 99" }).optional(), // Max 2-digit number (99)    
    contactNo: z.string().nonempty().min(8, { message: "Contact no not less then 8digits" }).max(20, { message: "Contact no not more then 20digits" }).optional(),
    address: z.string().nonempty().min(10, { message: "Not less then 10letters" }).optional(),
    status: z.enum(["active", "disable"], { message: "Status must be either active or disable" }).optional(),
    cnic: z.string().nonempty().min(12, { message: "Not" }),
    role: z.enum(["client", "provider"], { message: "Role must be either client or provider" })
})
// Client Schema (Extends User)
export const clientSchema = userSchema.extend({
    eSignature: z.string().optional(),
    email: z.string().nonempty("Email is required").email("Invalid email format"),
    password: z
        .string()
        .min(10, { message: "Password not less then 10letters" })
        .max(50, "Password not more then 50letters")
        .optional().refine((password) => !password || (password.length >= 10 && password.length <= 50), {
            message: "Password must be between 10 and 50 characters",
        }),
    isAccountCreatedByOwnClient: z.boolean().default(false)
})

// Provider Schema (Extends User)
export const providerSchema = userSchema.extend({
    email: z.string().nonempty("Email is required").email("Invalid email format"),
    password: z
        .string()
        .min(10, { message: "Password not less then 10letters" })
        .max(50, "Password not more then 50letters"),
    department: z.string().nonempty("Department is required"),


})


// Login Schema
export const loginSchema = z.object({
    email: z.string().nonempty("Email is required").email("Invalid email format"),
    password: z
        .string().nonempty("Password is required")
        .min(10, { message: "Password not less then 10letters" })
        .max(50, "Password not more then 50letters"),
})