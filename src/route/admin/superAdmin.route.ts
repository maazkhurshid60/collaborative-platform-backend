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
  getAllAuditLogs,
  deleteAuditLog,
  bulkDeleteAuditLogs,
  getAllSubmittedDocuments,
} from "../../controller/admin/superAdmin.controller";

import { uploadImg } from "../../utils/multer/s3ImgUploader";
import { authorizeRoles } from "../../middlewares/roleCheck.middleware";

const router = Router();

// Apply role check to all routes in this router
router.use(authorizeRoles("superAdmin"));


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

router.get("/audit-logs/all", getAllAuditLogs);
router.delete("/audit-logs/:id", deleteAuditLog);
router.post("/audit-logs/bulk-delete", bulkDeleteAuditLogs);

router.get("/submitted-documents/all", getAllSubmittedDocuments);

export default router;
