import { Router } from "express";
import {
  getSuperAdminFirst,
  getSuperAdminById,
  updateSuperAdminById,
  getAllPayments,
  getAllSubscriptions,
  updateSubscription,
  deleteSubscription,
  getProviderContactInfo,
  getProviderSubscriptionInfo,
  getProviderPaymentHistory,
  syncProviderSubscription,
} from "../../controller/admin/superAdmin.controller";

import { uploadImg } from "../../utils/multer/s3ImgUploader";

const router = Router();


router.get("/first", getSuperAdminFirst);

router.get("/:id", getSuperAdminById);


router.patch("/:id", uploadImg.single('profileImage'), updateSuperAdminById);

router.get("/payments/all", getAllPayments);

router.get("/subscriptions/all", getAllSubscriptions);
router.put("/subscriptions/:id", updateSubscription);
router.delete("/subscriptions/:id", deleteSubscription);

router.get("/provider/:userId/contact-info", getProviderContactInfo);
router.get("/provider/:userId/subscription-info", getProviderSubscriptionInfo);
router.get("/provider/:userId/payment-history", getProviderPaymentHistory);
router.post("/provider/:userId/sync", syncProviderSubscription);

export default router;
