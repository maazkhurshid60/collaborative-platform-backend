"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const document_controller_1 = require("../../controller/document/document.controller");
const multerDocConfig_1 = __importDefault(require("../../utils/multer/multerDocConfig"));
const multerImgConfig_1 = require("../../utils/multer/multerImgConfig");
const documentRouter = (0, express_1.Router)();
documentRouter.post("/create-document", multerDocConfig_1.default.single('file'), document_controller_1.addDocumentApi);
documentRouter.post("/get-all-document", document_controller_1.getAllDocumentApi);
documentRouter.post("/document-shared-by-provider", document_controller_1.documentSharedWithClientApi);
documentRouter.patch("/document-sign-by-client", multerImgConfig_1.upload.single('eSignature'), document_controller_1.documentSignByClientApi);
documentRouter.post("/get-all-shared-document", document_controller_1.getAllSharedDocumentWithClientApi);
exports.default = documentRouter;
