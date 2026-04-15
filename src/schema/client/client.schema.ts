import { z } from "zod";

// Client Schema (Extends User)
export const clientSchema = z.object({
    eSignature: z.string().optional(),
    clientShowToOthers: z.string().optional(),
    clientId: z.string().optional(),
    email: z.string().nonempty("Email is required").email("Enter valid email address"),
    password: z
        .string()
        .min(10, { message: "Password not less then 10letters" })
        .max(50, "Password not more then 50letters")
        .optional().refine((password) => !password || (password.length >= 10 && password.length <= 50), {
            message: "Password must be between 10 and 50 characters",
        }),
    fullName: z.string().nonempty().min(3, { message: "Full Name not less then 3letters." }),
    profileImage: z.string().optional(),
    gender: z.enum(["male", "female", "other", "prefer_not_to_say"], { message: "Gender must be either male, female, other, or prefer_not_to_say" }),
    age: z.number()
        .min(10, { message: "Age must be at least 10" })  // Min 2-digit number (10)
        .max(99, { message: "Age must be at most 99" }), // Max 2-digit number (99)    
    contactNo: z.string().nonempty().min(8, { message: "Contact no not less then 8digits" }).max(20, { message: "Contact no not more then 20digits" }),
    address: z.string().nonempty().min(1, { message: "Not less then 10letters" }),
    status: z.enum(["active", "disable"], { message: "Status must be either active or disable" }),
    // clientId is auto-generated on creation, not supplied by the user
    isAccountCreatedByOwnClient: z.boolean().default(false),
    role: z.string().optional(),
    providerId: z.string().optional(),
    // country: z.literal("US", { message: "Only United States is supported" }),
    state: z.string().min(1, "State is required"),

})
