// types/express-multer-s3.d.ts
import "multer";

declare module "multer" {
    interface File {
        location?: string; // S3 file URL
        key?: string;      // S3 object key
        bucket?: string;   // S3 bucket name
    }
}
