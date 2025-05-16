import { Router } from "express";
import { addDocumentApi, documentSharedWithClientApi, documentSignByClientApi, getAllDocumentApi, getAllSharedDocumentWithClientApi, } from "../../controller/document/document.controller";
import uploadDoc from "../../utils/multer/multerDocConfig";
import { upload } from "../../utils/multer/multerImgConfig";

const documentRouter = Router()

documentRouter.post("/create-document", uploadDoc.single('file'), addDocumentApi)
documentRouter.post("/get-all-document", getAllDocumentApi)
documentRouter.post("/document-shared-by-provider", documentSharedWithClientApi)
documentRouter.patch("/document-sign-by-client", upload.single('eSignature'), documentSignByClientApi)
documentRouter.post("/get-all-shared-document", getAllSharedDocumentWithClientApi)


export default documentRouter