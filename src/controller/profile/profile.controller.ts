import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { UserService } from "../../services/UserService";
import { AuditLogService } from "../../services/AuditLogService";

const userService = new UserService();

const updateMeApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;

  if (req.body.age) req.body.age = Number(req.body.age);

  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  let profileImageUpdate;
  if (files && files["profileImage"] && files["profileImage"].length > 0) {
    profileImageUpdate = (files["profileImage"][0] as any).location;
  }

  let eSignatureUpdate;
  if (files && files["eSignature"] && files["eSignature"].length > 0) {
    eSignatureUpdate = (files["eSignature"][0] as any).location;
  }

  // Check if profileImage was requested to be cleared
  if (req.body.profileImage === "null") {
    profileImageUpdate = null;
  }

  const updatedUser = await userService.updateMe(loginUserId, {
    ...req.body,
    profileImageUpdate,
    eSignatureUpdate,
  });

  // Audit Log for Profile Update
  await AuditLogService.createLog({
    userId: loginUserId,
    action: "UPDATE PROFILE",
    resource: "USER",
    resourceId: loginUserId,
    details: { message: "User updated their profile/settings" },
  });

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(StatusCodes.OK, updatedUser, "User updated successfully"),
    );
});

const deleteMeAccountApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  await userService.deleteMe(loginUserId);

  // Audit Log for Account Deletion (Self)
  await AuditLogService.createLog({
    userId: loginUserId,
    action: "DELETE_ME",
    resource: "USER",
    resourceId: loginUserId,
    details: { message: "User deleted their own account" },
  });

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, {}, "User deleted successfully"));
});

const getMeApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const role = (req as any).user.role;

  const meData = await userService.getMe(loginUserId, role);

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, meData, "OK"));
});

export { updateMeApi, deleteMeAccountApi, getMeApi };
