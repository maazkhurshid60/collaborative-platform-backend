import { Router } from "express";
import { getSuperAdminFirst, getSuperAdminById } from "../../controller/admin/superAdmin.controller";

const router = Router();

// easiest for testing
router.get("/first", getSuperAdminFirst);

// by id
router.get("/:id", getSuperAdminById);

export default router;
