declare module 'multer-s3' {
    import { StorageEngine } from 'multer';
    import { S3 } from 'aws-sdk';
    import { Request } from 'express';

    interface Options {
        s3: S3;
        bucket: string;
        acl?: string;
        key?: (
            req: Request,
            file: Express.Multer.File,
            cb: (error: Error | null, key?: string) => void
        ) => void;
    }

    function multerS3(options: Options): StorageEngine;

    export = multerS3;
}
