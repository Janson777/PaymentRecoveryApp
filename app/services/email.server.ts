import { ServerClient } from "postmark";

let client: ServerClient | undefined;

function getPostmarkClient(): ServerClient {
  if (!client) {
    const token = process.env.POSTMARK_API_TOKEN;
    if (!token) {
      throw new Error("POSTMARK_API_TOKEN is required");
    }
    client = new ServerClient(token);
  }
  return client;
}

export async function sendRecoveryEmail(params: {
  to: string;
  subject: string;
  body: string;
  recoveryUrl: string;
  trackingUrl?: string;
}): Promise<string> {
  const fromEmail =
    process.env.POSTMARK_FROM_EMAIL || "noreply@yourdomain.com";

  const htmlBody = buildRecoveryHtml({
    body: params.body,
    recoveryUrl: params.recoveryUrl,
    trackingUrl: params.trackingUrl,
  });

  const result = await getPostmarkClient().sendEmail({
    From: fromEmail,
    To: params.to,
    Subject: params.subject,
    HtmlBody: htmlBody,
    TextBody: `${params.body}\n\nComplete your order: ${params.recoveryUrl}`,
    MessageStream: "outbound",
  });

  return result.MessageID;
}

function buildRecoveryHtml(params: {
  body: string;
  recoveryUrl: string;
  trackingUrl?: string;
}): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="padding: 32px; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb;">
        <p style="font-size: 16px; line-height: 1.6;">${params.body}</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${params.recoveryUrl}"
             style="display: inline-block; padding: 14px 28px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
            Complete Your Order
          </a>
        </div>
        <p style="font-size: 13px; color: #6b7280; text-align: center;">
          If you've already completed your purchase, please ignore this email.
        </p>
      </div>
      ${params.trackingUrl ? `<img src="${params.trackingUrl}" width="1" height="1" style="display:none" alt="" />` : ""}
    </body>
    </html>
  `.trim();
}
