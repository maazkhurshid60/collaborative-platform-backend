import { z } from "zod";

// provider Schema (Extends User)
export const providerSchema = z.object({
    department: z.string().nonempty("Department is required"),
    providerId: z.string().nonempty("Provider Id is required"),
    email: z.string().nonempty("Email is required").email("Invalid email format"),
    password: z
        .string()
        .min(10, { message: "Password not less then 10letters" })
        .max(50, "Password not more then 50letters")
        .optional().refine((password) => !password || (password.length >= 10 && password.length <= 50), {
            message: "Password must be between 10 and 50 characters",
        }),
    fullName: z.string().nonempty().min(3, { message: "Full Name not less then 3letters." }),
    profileImage: z.string().optional(),
    gender: z.enum(["male", "female", "other"], { message: "Gender must be either male or female or other" }),
    age: z.number()
        .min(10, { message: "Age must be at least 10" })  // Min 2-digit number (10)
        .max(99, { message: "Age must be at most 99" }), // Max 2-digit number (99)    
    contactNo: z.string().nonempty().min(8, { message: "Contact no not less then 8digits" }).max(20, { message: "Contact no not more then 20digits" }),
    address: z.string().nonempty().min(10, { message: "Not less then 10letters" }),
    status: z.enum(["active", "disable"], { message: "Status must be either active or disable" }),
    licenseNo: z.string().nonempty().min(12, { message: "Not" }),
    isAccountCreatedByOwnprovider: z.boolean().default(false),
    role: z.string().optional()

})