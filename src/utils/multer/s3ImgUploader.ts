import multer from 'multer';
import multerS3 = require('multer-s3');
import path from 'path';
import AWS from 'aws-sdk';

// Directly create the S3 instance here (no import confusion)
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SECRET_KEY!,
    region: process.env.AWS_REGION!,
});

const s3 = new AWS.S3(); // ✅ 100% v2 compatible

const uploadImg = multer({
    storage: multerS3({
        s3: s3 as any, // 👈 FORCE override type mismatch
        bucket: process.env.S3_BUCKET_NAME!,
        // acl: 'public-read',
        key: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `images/${Date.now()}-${file.originalname}`);
        },
    }),
});

export { uploadImg };
