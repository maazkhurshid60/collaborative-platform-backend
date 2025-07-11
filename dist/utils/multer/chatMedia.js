"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const multer_1 = __importDefault(require("multer"));
const storage = multer_1.default.memoryStorage(); // Files stored in RAM
// Accept all file types
const fileFilter = (req, file, cb) => {
    cb(null, true); // Accept all files
};
const uploadChatMedia = (0, multer_1.default)({ storage, fileFilter });
exports.default = uploadChatMedia;
