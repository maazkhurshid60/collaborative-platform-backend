import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env
dotenv.config();

import { sendFormTemplateEmail } from "./src/utils/nodeMailer/SendFormTemplateEmail";

const emailToTest = process.argv[2];

if (!emailToTest) {
  console.error("Please provide an email address to send the test email to.");
  console.error("Example: npx ts-node test-email.ts test-email-address@mail-tester.com");
  process.exit(1);
}

async function main() {
  try {
    console.log(`Sending test form template email to: ${emailToTest}...`);
    await sendFormTemplateEmail(
      emailToTest,
      "John Doe",
      "Dr. Smith",
      "Client Intake Consent Form",
      "https://app.kolabme.com/public/forms/demo-token-12345",
      "CLIENT-ID-999"
    );
    console.log("Success! Email sent. Please check mail-tester / spam inbox.");
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

main();
