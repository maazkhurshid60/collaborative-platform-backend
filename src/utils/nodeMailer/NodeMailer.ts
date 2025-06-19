import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
    host: process.env.NODE_MAILER_HOST,
    port: 587,
    auth: {
        user: process.env.NODE_MAILER_USER, // from Mailtrap
        pass: process.env.NODE_MAILER_PASS, // from Mailtrap
    },
});
