import { Router } from "express";
import {
  getSuperAdminFirst,
  getSuperAdminById,
  updateSuperAdminById,
} from "../../controller/admin/superAdmin.controller";

const router = Router();


router.get("/first", getSuperAdminFirst);

router.get("/:id", getSuperAdminById);


router.patch("/:id", updateSuperAdminById);

export default router;
