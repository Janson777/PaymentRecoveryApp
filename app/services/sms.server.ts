import Twilio from "twilio";

let client: Twilio.Twilio | undefined;

function getTwilioClient(): Twilio.Twilio {
  if (!client) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error(
        "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required"
      );
    }
    client = Twilio(accountSid, authToken);
  }
  return client;
}

export async function sendRecoverySMS(params: {
  to: string;
  body: string;
}): Promise<string> {
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!fromNumber) {
    throw new Error("TWILIO_FROM_NUMBER is required");
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";

  const message = await getTwilioClient().messages.create({
    body: params.body,
    from: fromNumber,
    to: params.to,
    statusCallback: `${appUrl}/webhooks/twilio`,
  });

  return message.sid;
}
