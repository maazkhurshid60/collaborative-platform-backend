import { Router } from "express";
import { addDocumentApi, documentSharedWithClientApi, documentSignByClientApi, getAllDocumentApi, getAllSharedDocumentWithClientApi, } from "../../controller/document/document.controller";

const documentRouter = Router()

documentRouter.post("/create-document", addDocumentApi)
documentRouter.get("/get-all-document", getAllDocumentApi)
documentRouter.post("/document-shared-by-provider", documentSharedWithClientApi)
documentRouter.patch("/document-sign-by-client", documentSignByClientApi)
documentRouter.get("/get-all-shared-document", getAllSharedDocumentWithClientApi)


export default documentRouter