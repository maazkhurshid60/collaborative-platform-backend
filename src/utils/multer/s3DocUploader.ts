
import multer from 'multer';
import s3 from '../awsS3/AwsS3'; // ✅ Correct path to awsS3.ts
import path from 'path';

const multerS3 = require('multer-s3') as any;
const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const fileFilter = (req: any, file: any, cb: any) => {
    if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Only PDF and Word documents are allowed'), false);
    }
    cb(null, true);
};

const uploadDoc = multer({
    storage: multerS3({
        s3,
        bucket: process.env.S3_BUCKET_NAME!,

        key: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, key?: string) => void) => {
            const ext = path.extname(file.originalname);
            cb(null, `documents/${Date.now()}-${file.originalname}`);
        },
    }),
    fileFilter,
});


export default uploadDoc;
