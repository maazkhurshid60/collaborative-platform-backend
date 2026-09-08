// utils/awsS3/uploadToS3.ts
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Express } from 'express';
import s3 from '../awsS3/AwsS3';

export const uploadToS3 = async (file: Express.Multer.File): Promise<string> => {
    const fileExt = path.extname(file.originalname).toLowerCase();
    const key = `chat-media/${uuidv4()}${fileExt}`;

    let contentType = file.mimetype;
    if (fileExt === '.webm') contentType = 'audio/webm';
    else if (fileExt === '.mp3') contentType = 'audio/mpeg';
    else if (fileExt === '.ogg') contentType = 'audio/ogg';
    else if (fileExt === '.wav') contentType = 'audio/wav';
    else if (fileExt === '.m4a' || fileExt === '.mp4') contentType = 'audio/mp4';
    else if (fileExt === '.jpg' || fileExt === '.jpeg') contentType = 'image/jpeg';
    else if (fileExt === '.png') contentType = 'image/png';
    else if (fileExt === '.pdf') contentType = 'application/pdf';

    const params = {
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: key,
        Body: file.buffer,
        ContentType: contentType || 'application/octet-stream',
    };

    await s3.putObject(params).promise();

    return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};
