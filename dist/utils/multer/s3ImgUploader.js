"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImg = void 0;
const multer_1 = __importDefault(require("multer"));
const multerS3 = require("multer-s3");
const path_1 = __importDefault(require("path"));
const aws_sdk_1 = __importDefault(require("aws-sdk"));
// Directly create the S3 instance here (no import confusion)
aws_sdk_1.default.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.AWS_REGION,
});
const s3 = new aws_sdk_1.default.S3(); // ✅ 100% v2 compatible
const uploadImg = (0, multer_1.default)({
    storage: multerS3({
        s3: s3, // 👈 FORCE override type mismatch
        bucket: process.env.S3_BUCKET_NAME,
        // acl: 'public-read',
        key: (req, file, cb) => {
            const ext = path_1.default.extname(file.originalname);
            cb(null, `images/${Date.now()}-${file.originalname}`);
        },
    }),
});
exports.uploadImg = uploadImg;
