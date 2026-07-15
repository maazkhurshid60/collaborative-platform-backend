import { Router } from "express";
import { submitContactQuery } from "../../controller/contact/contact.controller";

const router = Router();

router.post("/", submitContactQuery);

export default router;
