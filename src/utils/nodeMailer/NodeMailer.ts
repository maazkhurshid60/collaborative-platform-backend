// import nodemailer from "nodemailer";

// export const transporter = nodemailer.createTransport({
//     service: "Gmail", // or SMTP
//     auth: {
//         user: "softwaredevelopermudasser@gmail.com",
//         pass: "smhfamtvhyzgdfnf",
//     },
// });




import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
    host: 'sandbox.smtp.mailtrap.io',
    port: 587,
    auth: {
        user: 'f56632beee8877', // from Mailtrap
        pass: 'e8698977b05260', // from Mailtrap
    },
});
