import { Router } from "express";
import {
  addFormTemplateApi,
  shareFormApi,
  getFormTemplateByTokenApi,
  submitFormApi,
  listFormTemplatesApi,
  deleteFormTemplateApi,
  listSharedFormsForClientApi,
  getFormTemplateRecipientsApi,
  uploadFormPdfApi,
  getFormTemplateApi,
  updateFormTemplateApi,
  deleteProviderFormSubmissionsApi,
  deleteExpiredFormShareApi,
} from "../../controller/form/form.controller";
import uploadDoc from "../../utils/multer/s3DocUploader";

const formRouter = Router();

formRouter.post("/create-template", addFormTemplateApi);
formRouter.get("/templates", listFormTemplatesApi);
formRouter.get("/templates/:id", getFormTemplateApi);
formRouter.put("/templates/:id", updateFormTemplateApi);
formRouter.delete("/templates/:id", deleteFormTemplateApi);
formRouter.delete("/templates/:id/provider-submissions", deleteProviderFormSubmissionsApi);
formRouter.post("/share", shareFormApi);
formRouter.get("/client/:clientId", listSharedFormsForClientApi);
formRouter.get(
  "/templates/:id/recipients",
  getFormTemplateRecipientsApi,
);

// Protected ==> Authenticated Form Submission Routes (Only accessible by logged-in clients)
formRouter.get("/token/:token", getFormTemplateByTokenApi);
formRouter.post("/submit/:token", submitFormApi);
formRouter.delete("/share/:shareId/expired", deleteExpiredFormShareApi);
formRouter.post(
  "/upload-pdf",
  uploadDoc.single("file"),
  uploadFormPdfApi,
);

export { formRouter };
