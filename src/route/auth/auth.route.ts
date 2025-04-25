import { Router } from "express";
import { blockUserApi, deleteMeAccountApi, findByCNIC, getAllUsersApi, getMeApi, logInApi, logoutApi, signupApi, unblockUserApi, updateMeApi } from "../../controller/auth/auth.controller";
import { authJWT } from "../../middlewares/auth.middleware";
const authRouter = Router()
authRouter.post("/signup", signupApi)
authRouter.post("/cnic-found", findByCNIC)
authRouter.post("/login", logInApi)
authRouter.post("/block-user", blockUserApi)
authRouter.post("/unblock-user", authJWT, unblockUserApi)
authRouter.post("/logout", authJWT, logoutApi)
authRouter.patch("/update-me", authJWT, updateMeApi)
authRouter.delete("/delete-me-account", authJWT, deleteMeAccountApi)
authRouter.post("/get-me", authJWT, getMeApi)
authRouter.get("/get-all-users", authJWT, getAllUsersApi)


export default authRouter