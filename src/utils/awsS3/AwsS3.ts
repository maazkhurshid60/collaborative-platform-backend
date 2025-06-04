// src/utils/awsS3/AwsS3.ts
import AWS from 'aws-sdk';

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SECRET_KEY!,
    region: process.env.AWS_REGION!,
});

const s3: AWS.S3 = new AWS.S3();
export default s3;

