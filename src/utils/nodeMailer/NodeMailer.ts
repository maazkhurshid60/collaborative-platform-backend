import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
    service: "Gmail", // or SMTP
    auth: {
        user: "softwaredevelopermudasser@gmail.com",
        pass: "smhfamtvhyzgdfnf",
    },
});

