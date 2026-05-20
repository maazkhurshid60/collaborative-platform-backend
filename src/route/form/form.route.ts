import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import {
    addFormTemplateApi,
    shareFormApi,
    getFormTemplateByTokenApi,
    submitFormApi,
    listFormTemplatesApi,
    deleteFormTemplateApi,
    listSharedFormsForClientApi,
    getFormTemplateRecipientsApi,
    uploadFormPdfApi
} from "../../controller/form/form.controller";
import uploadDoc from "../../utils/multer/s3DocUploader";

const formRouter = Router();


formRouter.post("/create-template", asyncHandler(addFormTemplateApi));
formRouter.get("/templates", asyncHandler(listFormTemplatesApi));
formRouter.delete("/templates/:id", asyncHandler(deleteFormTemplateApi));
formRouter.post("/share", asyncHandler(shareFormApi));
formRouter.get("/client/:clientId", asyncHandler(listSharedFormsForClientApi));
formRouter.get("/templates/:id/recipients", asyncHandler(getFormTemplateRecipientsApi));

// Authenticated Form Submission Routes (Only accessible by logged-in clients)
formRouter.get("/token/:token", asyncHandler(getFormTemplateByTokenApi));
formRouter.post("/submit/:token", asyncHandler(submitFormApi));
formRouter.post("/upload-pdf", uploadDoc.single('file'), asyncHandler(uploadFormPdfApi));

export { formRouter };
