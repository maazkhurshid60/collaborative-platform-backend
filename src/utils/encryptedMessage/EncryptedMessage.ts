import crypto from 'crypto';

const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64'); // 👈 VERY IMPORTANT
const IV_LENGTH = 16;

export function encryptText(plainText: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return iv.toString('base64') + ':' + encrypted;
}

export function decryptText(encryptedText: string): string {
    const [ivStr, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivStr, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}