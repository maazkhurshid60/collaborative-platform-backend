import { transporter } from "./NodeMailer";
import { getFrontendUrl } from "./getFrontendUrl";
import { renderEmail } from "../emailTemplateRenderer";
import { queryReceivedProviderTemplate } from "../../templates/emails/queryReceivedProvider.template";

export interface QueryReceivedEmailData {
  providerEmail: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  message: string;
}

export async function sendQueryReceivedEmailToProvider(data: QueryReceivedEmailData) {
  const html = renderEmail(
    "query-received-provider",
    queryReceivedProviderTemplate,
    { ...data, dashboardUrl: `${getFrontendUrl()}/queries` },
    "New Provider Query",
  );

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: data.providerEmail,
    subject: `New query from ${data.guestName}`,
    html,
  });
}
