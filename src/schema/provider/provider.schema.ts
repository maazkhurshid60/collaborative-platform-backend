import { z } from "zod";

// provider Schema (Extends User)
export const providerSchema = z.object({
    speciality: z.string().nonempty("Speciality is required"),
    providerId: z.string().nonempty("Provider Id is required"),
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
    gender: z.enum(["MALE", "FEMALE", "PREFER_NOT_TO_SAY", "OTHER", "male", "female", "prefer_not_to_say", "other"], { message: "Gender must be either male, female, other, or prefer_not_to_say" }).transform((val) => {
        return val.toUpperCase() as "MALE" | "FEMALE" | "PREFER_NOT_TO_SAY" | "OTHER";
    }),
    age: z.number()
        .min(10, { message: "Age must be at least 10" })  // Min 2-digit number (10)
        .max(99, { message: "Age must be at most 99" }), // Max 2-digit number (99)    
    contactNo: z.string().nonempty().min(8, { message: "Contact no not less then 8digits" }).max(20, { message: "Contact no not more then 20digits" }),
    address: z.string().nonempty().min(1, { message: "Not less then 10letters" }),
    status: z.enum(["active", "disable"], { message: "Status must be either active or disable" }),
    licenseNo: z.string().nonempty({ message: "License No is required." }),
    isAccountCreatedByOwnprovider: z.boolean().default(false),
    role: z.string().optional()

})
