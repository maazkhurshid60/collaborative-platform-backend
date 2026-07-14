import { Router } from "express";
import { authJWT } from "../../middlewares/auth.middleware";
import { 
    blockUserApi, 
    deleteUserByAdminApi, 
    getAllValidUsersApi, 
    findByLicenseNo, 
    getAllUsersApi, 
    unblockUserApi, 
    approveValidUser, 
    rejectUser, 
    restoreUser, 
    searchUsersApi,
    getUsersPaginatedApi
} from "../../controller/user/user.controller";

const userRouter = Router();

userRouter.post("/license-found", findByLicenseNo);
userRouter.post("/block-user", authJWT, blockUserApi);
userRouter.post("/unblock-user", authJWT, unblockUserApi);
userRouter.delete("/admin/delete-user", authJWT, deleteUserByAdminApi);
userRouter.get("/get-all-users", authJWT, getAllUsersApi);
userRouter.get("/search-users", authJWT, searchUsersApi);
userRouter.patch("/approve-user", authJWT, approveValidUser);
userRouter.patch("/reject-user", authJWT, rejectUser);
userRouter.patch("/restore-user", authJWT, restoreUser);
userRouter.get("/get-all-valid-users", authJWT, getAllValidUsersApi);
userRouter.get("/get-users-paginated", authJWT, getUsersPaginatedApi);

export default userRouter;
