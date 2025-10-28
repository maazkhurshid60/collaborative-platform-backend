import { z } from "zod";
const strongPassword = z
    .string()
    .min(8, { message: "Kam az kam 8 characters ka password hona chahiye" })
    .regex(/[a-z]/, { message: "Ek lowercase letter hona chahiye" })
    .regex(/[A-Z]/, { message: "Ek uppercase letter hona chahiye" })
    .regex(/[0-9]/, { message: "Ek number hona chahiye" })
    .regex(/[^A-Za-z0-9]/, { message: "Ek special character hona chahiye" });
export const userSchema = z.object({
    fullName: z.string().nonempty().min(3, { message: "Full Name not less then 3letters." }),
    profileImage: z.string().optional(),
    gender: z.enum(["male", "female", "other"], { message: "Gender must be either male or female or other" }).optional(),
    age: z.coerce.number()
        .min(10, { message: "Age must be at least 10" })  // Min 2-digit number (10)
        .max(99, { message: "Age must be at most 99" }).optional(), // Max 2-digit number (99)    
    contactNo: z.string().nonempty().min(8, { message: "Contact no not less then 8digits" }).max(20, { message: "Contact no not more then 20digits" }).optional(),
    address: z.string().nonempty().min(1, { message: "This field is required" }).optional(),
    status: z.enum(["active", "disable"], { message: "Status must be either active or disable" }).optional(),
    licenseNo: z.string().nonempty().min(1, { message: "license number is required." }),
    role: z.enum(["client", "provider", "superadmin"], { message: "Role must be either client or provider" }),
    isApprove: z.string().optional(),
    country: z.string().nonempty("Country is required"),
    state: z.string().nonempty("State is required"),
    publicKey: z.string().optional(),
    privateKey: z.string().optional(),
})
// Client Schema (Extends User)
export const clientSchema = userSchema.extend({
    eSignature: z.string().optional(),
    clientShowToOthers: z.boolean().optional(),
    email: z.string().nonempty("Email is required").email("Invalid email format"),

    password: z.string().optional(),



    isAccountCreatedByOwnClient: z.coerce.boolean(),
})

// Provider Schema (Extends User)
export const providerSchema = userSchema.extend({
    email: z.string().nonempty("Email is required").email("Invalid email format"),
    password: z.string().optional(),


    department: z.string().nonempty("Department is required"),


})

// Super Admin Schema (Extends User)

export const superAdminSchema = userSchema.extend({
    email: z.string().nonempty("Email is required").email("Invalid email format"),
    password: z
        .string()
        .min(10, { message: "Password not less then 10letters" })
        .max(50, "Password not more then 50letters").optional(),
})


// Login Schema
export const loginSchema = z.object({
    email: z.string().nonempty("Email is required").email("Invalid email format"),
    password: z
        .string().nonempty("Password is required")
        .min(10, { message: "Password not less then 10letters" })
        .max(50, "Password not more then 50letters"),
})