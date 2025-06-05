import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { clientSchema, loginSchema, providerSchema, userSchema } from "../../schema/auth/auth.schema";
import { ApiResponse } from "../../utils/apiResponse";
import { StatusCodes } from "http-status-codes";
import prisma from "../../db/db.config";
import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { cookiesOptions } from "../../utils/constants";


const signupApi = asyncHandler(async (req: Request, res: Response) => {
    // Validate User Schema
    const userParsedData = userSchema.safeParse(req.body);
    if (!userParsedData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed")
        );
    }
    //get data for user
    const { fullName, gender = "male", age, contactNo, address, status = "active", cnic, role } = userParsedData.data;

    // Check if User Exists
    const existingUser = await prisma.user.findFirst({ where: { cnic } });
    if (existingUser) {

        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `CNIC ${cnic} is already registered.` }, "Validation failed")
        );
    }


    const userData: any = {
        fullName, gender, age, contactNo, address, status, cnic, role
    };
    if (gender !== undefined) userData.gender = gender;
    if (age !== undefined) userData.age = age;
    if (contactNo !== undefined) userData.contactNo = contactNo;
    if (address !== undefined) userData.address = address;
    if (status !== undefined) userData.status = status;

    const userCreated = await prisma.user.create({
        data: userData,
    });

    // Handle Client Signup
    if (role === Role.client) {
        const clientParsed = clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed")
            );
        }
        //get client data
        const { isAccountCreatedByOwnClient, email, password } = clientParsed.data;
        //check duplicate client
        const existingClient = await prisma.client.findFirst({ where: { email } });
        if (existingClient) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }
        //hashing the client's password
        const hashedPassword = await bcrypt.hash(password ?? "", 10);

        const clientCreated = await prisma.client.create({ data: { userId: userCreated.id, isAccountCreatedByOwnClient, email, password: hashedPassword }, include: { user: true } });
        return res.status(StatusCodes.CREATED).json(
            new ApiResponse(StatusCodes.CREATED, clientCreated, "User created successfully")
        );
    }
    // Handle Provider Signup
    else if (role === Role.provider) {
        const providerParsed = providerSchema.safeParse(req.body);
        if (!providerParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: providerParsed.error.errors }, "Validation failed")
            );
        }

        const { department, email, password } = providerParsed.data;
        const existingUserByEmail = await prisma.provider.findFirst({ where: { email } });
        if (existingUserByEmail) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email ${email} is already registered.` }, "Validation failed")
            );
        }

        const hashedPassword = await bcrypt.hash(password ?? "", 10);
        const existingProvider = await prisma.provider.findFirst({ where: { email } });
        if (existingProvider) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }

        const providerCreated = await prisma.provider.create({ data: { userId: userCreated.id, department, email, password: hashedPassword }, include: { user: true } });
        return res.status(StatusCodes.CREATED).json(
            new ApiResponse(StatusCodes.CREATED, providerCreated, "User created successfully")
        );
    }


});



// const updateMeApi = asyncHandler(async (req: Request, res: Response) => {
//     // Validate User Schema
//     const userParsedData = userSchema.safeParse(req.body);
//     if (!userParsedData.success) {
//         return res.status(StatusCodes.BAD_REQUEST).json(
//             new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed")
//         );
//     }

//     console.log(",,,,,,,,,,,,,,,,,,,,,,,,,,,,,", req.file);

//     const { loginUserId } = req.body;

//     const isUserExist = await prisma.user.findFirst({ where: { id: loginUserId } });

//     //Check user exist 
//     if (!isUserExist) {
//         return res.status(StatusCodes.NOT_FOUND).json(
//             new ApiResponse(StatusCodes.NOT_FOUND, { error: "User is not exist." }, "Not Found Error.")
//         );
//     }

//     const { fullName, gender, age, contactNo, address, status, cnic, role } = userParsedData.data;

//     // Update User
//     const updatedUser = await prisma.user.update({
//         where: { id: loginUserId },
//         data: { fullName, gender, age, contactNo, address, status, cnic, role }
//     });

//     // Handle Client Update
//     if (role === Role.client) {
//         const clientParsed = clientSchema.safeParse(req.body);
//         if (!clientParsed.success) {
//             return res.status(StatusCodes.BAD_REQUEST).json(
//                 new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed")
//             );
//         }

//         const { email, password } = clientParsed.data;


//         const existingClient = await prisma.client.findFirst({ where: { email, NOT: { userId: loginUserId } } });
//         if (existingClient) {
//             return res.status(StatusCodes.CONFLICT).json(
//                 new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
//             );
//         }

//         // Build update data
//         const updateData: any = {
//             email,

//         };

//         if (password) {
//             console.log("client uploaded<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>", password);

//             updateData.password = await bcrypt.hash(password, 10);
//         }


//         if (req.file) {
//             console.log("<<<<<<<<<<<<<<<<<<<<>>>>>>>>>>>>>>>>>>>>,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,", req.file);

//             updateData.eSignature = req.file?.path;
//         }

//         const clientUpdate = await prisma.client.update({
//             where: { userId: loginUserId },
//             data: updateData,
//             include: { user: true }
//         });

//         return res.status(StatusCodes.OK).json(
//             new ApiResponse(StatusCodes.OK, clientUpdate, "User updated successfully")
//         );
//     }

//     // Handle Provider Update
//     else if (role === Role.provider) {
//         const providerParsed = providerSchema.safeParse(req.body);
//         if (!providerParsed.success) {
//             return res.status(StatusCodes.BAD_REQUEST).json(
//                 new ApiResponse(StatusCodes.BAD_REQUEST, { error: providerParsed.error.errors }, "Validation failed")
//             );
//         }

//         const { email, password, department } = providerParsed.data;

//         const existingProvider = await prisma.provider.findFirst({ where: { email, NOT: { userId: loginUserId } } });
//         if (existingProvider) {
//             return res.status(StatusCodes.CONFLICT).json(
//                 new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
//             );
//         }

//         const updateData: any = {
//             email,
//             department
//         };

//         if (password) {
//             updateData.password = await bcrypt.hash(password, 10);
//         }

//         const providerUpdate = await prisma.provider.update({
//             where: { userId: loginUserId },
//             data: updateData,
//             include: { user: true }
//         });

//         return res.status(StatusCodes.OK).json(
//             new ApiResponse(StatusCodes.OK, providerUpdate, "User updated successfully")
//         );
//     }
// });

const updateMeApi = asyncHandler(async (req: Request, res: Response) => {
    // Convert values from form-data strings to appropriate types
    if (req.body.age) {
        req.body.age = Number(req.body.age);
    }

    if (req.body.isAccountCreatedByOwnClient) {
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";
    }

    // Extract uploaded files
    const files = req.files as {
        profileImage?: Express.Multer.File[];
        eSignature?: Express.Multer.File[];
    };

    const profileImage = files?.profileImage?.[0] as any;;
    const eSignature = files?.eSignature?.[0] as any;

    // Get existing user data
    const { loginUserId } = req.body;
    const existingUser = await prisma.user.findFirst({
        where: { id: loginUserId },
        select: { profileImage: true, role: true }
    });

    if (!existingUser) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "User does not exist." }, "Not Found Error.")
        );
    }

    // Handle profile image updates
    let profileImageUpdate: string = "null";
    if (profileImage) {
        profileImageUpdate = profileImage.location;
    }


    // Validate User Schema
    const userParsedData = userSchema.safeParse({
        ...req.body,
        profileImage: profileImageUpdate !== undefined ? profileImageUpdate : existingUser.profileImage
    });

    if (!userParsedData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed")
        );
    }

    const { fullName, gender, age, contactNo, address, status, cnic, role } = userParsedData.data;

    // Update User
    const updatedUser = await prisma.user.update({
        where: { id: loginUserId },
        data: {
            fullName,
            gender,
            age,
            contactNo,
            address,
            status,
            cnic,
            role,
            // Only update profileImage if it was explicitly changed
            ...(profileImageUpdate !== undefined && { profileImage: profileImageUpdate })
        }
    });

    // Handle Client Update
    if (role === Role.client) {
        const clientParsed = clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed")
            );
        }

        const { email, password } = clientParsed.data;

        const existingClient = await prisma.client.findFirst({
            where: { email, NOT: { userId: loginUserId } }
        });

        if (existingClient) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }

        const updateData: any = {
            email,
        };

        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        // Handle eSignature updates
        if (eSignature) {
            updateData.eSignature = eSignature.location;
        } else {
            updateData.eSignature = "null";
        }
        const userId = String(loginUserId);

        const clientUpdate = await prisma.client.update({
            where: { userId },
            data: updateData,
            include: { user: true }
        });


        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, clientUpdate, "User updated successfully")
        );
    }

    // Handle Provider Update
    else if (role === Role.provider) {
        const providerParsed = providerSchema.safeParse(req.body);
        if (!providerParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: providerParsed.error.errors }, "Validation failed")
            );
        }

        const { email, password, department } = providerParsed.data;

        const existingProvider = await prisma.provider.findFirst({
            where: { email, NOT: { userId: loginUserId } }
        });

        if (existingProvider) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }

        const updateData: any = {
            email,
            department,
        };

        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const providerUpdate = await prisma.provider.update({
            where: { userId: loginUserId },
            data: updateData,
            include: { user: true }
        });

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, providerUpdate, "User updated successfully")
        );
    }
});



const logInApi = asyncHandler(async (req: Request, res: Response) => {
    // Validate request body with Zod
    const parsedLoginData = loginSchema.safeParse(req.body);

    if (!parsedLoginData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: parsedLoginData.error.errors }, "Validation failed")
        );
    }

    // Extract email and password
    const { email, password } = parsedLoginData.data;

    // Check if user exists in 'client' or 'provider'
    const user = await prisma.provider.findFirst({
        where: { email },
        include: {
            user: true,
            clientList: {
                include: {
                    client: {
                        include: {
                            user: true
                        }
                    }
                }
            }
        }
    })
        || await prisma.client.findFirst({ where: { email }, include: { user: true, providerList: true } });

    if (!user) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: `Email: ${email} not found` }, "Validation failed")
        );
    }

    // Check if password is null (for clients where password may be optional)
    if (!user.password) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Password not set for this account" }, "Validation failed")
        );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(StatusCodes.UNAUTHORIZED).json(
            new ApiResponse(StatusCodes.UNAUTHORIZED, { error: "Password is wrong" }, "Authentication failed")
        );
    }

    // Determine the role based on the user type (this was corrected)
    const role = user?.user?.role === "provider" ? "provider" : "client";

    // Generate JWT Token
    const jwtSecret = process.env.JWT_SECRET || "default_secret"; // Ensure this is set in the environment
    const token = jwt.sign(
        { userId: user.id, email: user.email, role },
        jwtSecret,
        { expiresIn: "7d" } // Token expires in 7 days
    );

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { token, user }, "Login successful")
    );
});

const blockUserApi = asyncHandler(async (req: Request, res: Response) => {
    const { blockUserid, loginUserId } = req.body;

    // 1. Check if block user exists
    const isBlockUserExist = await prisma.user.findUnique({ where: { id: blockUserid } });
    if (!isBlockUserExist) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "User to be blocked not found" }, "Validation failed")
        );
    }

    // 2. Get login user (who wants to block someone)
    const loginUser = await prisma.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Blocking user not found" }, "Validation failed")
        );
    }

    // 3. If already blocked, return early
    if (loginUser.blockedMembers.includes(blockUserid)) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: "User is already blocked" }, "Already blocked")
        );
    }

    // 4. Add blockUserid to blockedMembers list
    const updatedBlockedMembers = [...loginUser.blockedMembers, blockUserid];
    console.log("updatedBlockedMembers", updatedBlockedMembers);

    // 5. Update user
    const updatedUser = await prisma.user.update({
        where: { id: loginUserId },
        data: {
            blockedMembers: updatedBlockedMembers,
        },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { user: updatedUser }, "User blocked successfully")
    );
});

const getAllUsersApi = asyncHandler(async (req: Request, res: Response) => {
    const allUsers = await prisma.user.findMany()
    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { totalDocument: allUsers.length, user: allUsers }, "User fetched successfully")
    );
})

const unblockUserApi = asyncHandler(async (req: Request, res: Response) => {
    const { blockUserid, loginUserId } = req.body;

    // 1. Check if block user exists
    const isBlockUserExist = await prisma.user.findUnique({ where: { id: blockUserid } });
    if (!isBlockUserExist) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "User to be blocked not found" }, "Validation failed")
        );
    }

    // 2. Get login user (who wants to block someone)
    const loginUser = await prisma.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Blocking user not found" }, "Validation failed")
        );
    }

    const updatedBlockedMembersList = loginUser.blockedMembers?.filter(data => data !== blockUserid)
    const updatedUser = await prisma.user.update({
        where: { id: loginUserId },
        data: {
            blockedMembers: updatedBlockedMembersList,
        },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { user: updatedUser }, "User unblocked successfully")
    );
})

const logoutApi = asyncHandler(async (req: Request, res: Response) => {
    // Clearing the cookies by setting them to empty with an expiration time in the past
    return res
        .clearCookie("accessToken", cookiesOptions)
        .clearCookie("refreshToken", cookiesOptions)
        .status(200)
        .json(new ApiResponse(StatusCodes.OK, {}, "Logout successful"));
});

const deleteMeAccountApi = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId } = req.body
    console.log("id>>>>>>>>", loginUserId);

    const isUserExist = await prisma.user.findFirst({ where: { id: loginUserId } })
    console.log(">>>>>>>>>>", isUserExist);

    if (!isUserExist) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error"))
    }

    console.log("<<<<<<<<<<<", loginUserId);

    const isUserDeleted = await prisma.user.delete({ where: { id: loginUserId } })
    console.log(">>>>>>>>>>>>>>>", isUserDeleted);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { message: "" }, "User deleted successfully")
    );

})



const getMeApi = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId, role } = req.body

    let getMeDetails
    // Handle Client
    if (role === Role.client) {
        getMeDetails = await prisma.client.findFirst({ where: { id: loginUserId }, include: { user: true } })

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { data: getMeDetails }, "OK")
        );


    }
    // Handle Provider
    else if (role === Role.provider) {
        getMeDetails = await prisma.provider.findFirst({
            where: { id: loginUserId }, include: {
                user: true,
                clientList: {
                    include: {
                        client: {
                            include: {
                                user: true
                            }
                        }
                    }
                }
            }
        })

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { data: getMeDetails }, "OK")
        );
    }
});


const findByCNIC = asyncHandler(async (req: Request, res: Response) => {
    const { cnic } = req.body
    if (cnic === "") {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { message: " CNIC isrequired" }, "Validation failed")
        );
    }

    const cnicFound = await prisma.user.findFirst({
        where: { cnic }, include: { client: true }
    })
    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { data: cnicFound }, "Record found.")
    );


})


const changePasswordApi = asyncHandler(async (req: Request, res: Response) => {
    const { oldPassword,
        newPassword,
        loginUserId, confirmPassword, role } = req.body

    if (oldPassword === "" ||
        newPassword === "") {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { message: "All fields are isrequired" }, "Validation failed")
        );
    }


    if (newPassword !== confirmPassword) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { message: "Confirm and New Password should be matched" }, "Validation failed")
        );
    }


    if (role === Role.provider) {
        const findUser = await prisma.provider.findFirst({ where: { id: loginUserId }, include: { user: true } })

        if (!findUser) {

            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { message: " User does not exist." }, "Validation failed")
            );
        }

        const isPasswordMatch = await bcrypt.compare(oldPassword, findUser?.password)
        if (isPasswordMatch) {
            const hashedPassword = await bcrypt.hash(newPassword ?? "", 10);
            const updatePassword = await prisma.provider.update({
                where: { id: loginUserId }, data: {
                    password: hashedPassword

                }
            })

            if (updatePassword) {

                return res.status(StatusCodes.OK).json(
                    new ApiResponse(StatusCodes.OK, { message: "Password has updated successfully" }, "Password has updated successfully")
                );
            }
            else {
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
                    new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { message: "Internal Server Error" }, "Internal Server Error")
                );
            }
        }
        else {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { message: "Password not Matched" }, "Password not Match")
            );
        }


    }

    if (role === Role.client) {
        const findUser = await prisma.client.findFirst({ where: { id: loginUserId }, include: { user: true } })

        if (!findUser) {

            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { message: " User does not exist." }, "Validation failed")
            );
        }

        const isPasswordMatch = await bcrypt.compare(
            oldPassword ?? "",
            findUser?.password ?? ""
        ); if (isPasswordMatch) {
            const hashedPassword = await bcrypt.hash(newPassword ?? "", 10);
            const updatePassword = await prisma.client.update({
                where: { id: loginUserId }, data: {
                    password: hashedPassword

                }
            })

            if (updatePassword) {

                return res.status(StatusCodes.OK).json(
                    new ApiResponse(StatusCodes.OK, { message: "Password has updated successfully" }, "Password has updated successfully")
                );
            }
            else {
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
                    new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { message: "Internal Server Error" }, "Internal Server Error")
                );
            }
        }
        else {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { message: "Password not Matched" }, "Password not Match")
            );
        }


    }

})

export { signupApi, logInApi, blockUserApi, unblockUserApi, logoutApi, updateMeApi, deleteMeAccountApi, getMeApi, getAllUsersApi, findByCNIC, changePasswordApi };
