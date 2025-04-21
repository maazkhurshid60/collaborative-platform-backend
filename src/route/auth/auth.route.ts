import { Router } from "express";
import { blockUser, deleteMeAccountApi, getMeApi, logInApi, logout, signupApi, unblockUser, updateMeApi } from "../../controller/auth/auth.controller";
import { authJWT } from "../../middlewares/auth.middleware";
const authRouter = Router()
authRouter.post("/signup", signupApi)
authRouter.post("/login", logInApi)
authRouter.post("/block-user", blockUser)
authRouter.post("/unblock-user", authJWT, unblockUser)
authRouter.post("/logout", authJWT, logout)
authRouter.patch("/update-me", authJWT, updateMeApi)
authRouter.delete("/delete-me-account", authJWT, deleteMeAccountApi)
authRouter.get("/get-me", authJWT, getMeApi)


export default authRouter