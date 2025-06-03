"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const multer_1 = __importDefault(require("multer"));
const AwsS3_1 = __importDefault(require("../awsS3/AwsS3")); // ✅ Correct path to awsS3.ts
const path_1 = __importDefault(require("path"));
const multerS3 = require('multer-s3');
const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const fileFilter = (req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Only PDF and Word documents are allowed'), false);
    }
    cb(null, true);
};
const uploadDoc = (0, multer_1.default)({
    storage: multerS3({
        s3: AwsS3_1.default,
        bucket: process.env.S3_BUCKET_NAME,
        key: (req, file, cb) => {
            const ext = path_1.default.extname(file.originalname);
            cb(null, `documents/${Date.now()}-${file.originalname}`);
        },
    }),
    fileFilter,
});
exports.default = uploadDoc;
