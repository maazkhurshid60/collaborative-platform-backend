"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const document_controller_1 = require("../../controller/document/document.controller");
const s3DocUploader_1 = __importDefault(require("../../utils/multer/s3DocUploader"));
const documentRouter = (0, express_1.Router)();
documentRouter.post("/create-document", s3DocUploader_1.default.single('file'), document_controller_1.addDocumentApi);
documentRouter.post("/get-all-document", document_controller_1.getAllDocumentApi);
documentRouter.post("/document-shared-by-provider", document_controller_1.documentSharedWithClientApi);
documentRouter.patch("/document-sign-by-client", document_controller_1.documentSignByClientApi);
documentRouter.post("/get-all-shared-document", document_controller_1.getAllSharedDocumentWithClientApi);
documentRouter.delete("/delete-document", document_controller_1.deleteDocumentApi);
exports.default = documentRouter;
