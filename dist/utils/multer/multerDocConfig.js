"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// middlewares/multer.ts
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
// Setup storage
const storage = multer_1.default.diskStorage({
    destination: './uploads/docs/',
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
// Optional: Add file type filter (PDF/DOC/DOCX)
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Only PDF and Word documents are allowed'));
    }
    cb(null, true);
};
const uploadDoc = (0, multer_1.default)({ storage, fileFilter });
exports.default = uploadDoc;
