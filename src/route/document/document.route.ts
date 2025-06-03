import { Router } from "express";
import { addDocumentApi, documentSharedWithClientApi, documentSignByClientApi, getAllDocumentApi, getAllSharedDocumentWithClientApi, } from "../../controller/document/document.controller";
import uploadDoc from "../../utils/multer/s3DocUploader";
import { uploadImg } from "../../utils/multer/s3ImgUploader";

const documentRouter = Router()

documentRouter.post("/create-document", uploadDoc.single('file'), addDocumentApi)
documentRouter.post("/get-all-document", getAllDocumentApi)
documentRouter.post("/document-shared-by-provider", documentSharedWithClientApi)
documentRouter.patch("/document-sign-by-client", uploadImg.single('eSignature'), documentSignByClientApi)
documentRouter.post("/get-all-shared-document", getAllSharedDocumentWithClientApi)


export default documentRouter