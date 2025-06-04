// src/types/express/index.d.ts
import 'multer';

declare module 'multer' {
    interface File {
        location?: string; // Add the custom S3 field
    }
}
