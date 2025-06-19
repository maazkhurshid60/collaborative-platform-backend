// utils/awsS3/uploadToS3.ts
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Express } from 'express';
import s3 from '../awsS3/AwsS3';

export const uploadToS3 = async (file: Express.Multer.File): Promise<string> => {
    const fileExt = path.extname(file.originalname);
    const key = `chat-media/${uuidv4()}${fileExt}`;

    const params = {
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
    };

    await s3.putObject(params).promise();

    return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};
