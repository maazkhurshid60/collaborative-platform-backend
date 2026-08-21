import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
    host: process.env.NODE_MAILER_HOST,
    port: 587,
    secure: false, // STARTTLS on 587, not implicit TLS
    requireTLS: true,
    auth: {
        user: process.env.NODE_MAILER_USER,
        pass: process.env.NODE_MAILER_PASS,
    },
    // Reuses SMTP connections instead of opening a new one per email — matters
    // once the BullMQ email worker is sending several messages concurrently.
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
});
