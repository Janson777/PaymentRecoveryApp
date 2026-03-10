import type { ActionFunctionArgs } from "@remix-run/node";
import {
  verifyTwilioSignature,
  isOptOutKeyword,
  isOptInKeyword,
} from "~/lib/twilio.server";
import { updateDeliveryStatus } from "~/models/recovery-message.server";
import { recordOptOut, removeOptOut } from "~/models/sms-opt-out.server";

const EMPTY_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const formData = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    params[key] = String(value);
  }

  const signature = request.headers.get("X-Twilio-Signature");
  if (!signature) {
    return new Response("Missing signature", { status: 401 });
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const webhookUrl = `${appUrl}/webhooks/twilio`;

  if (!verifyTwilioSignature(signature, webhookUrl, params)) {
    console.warn("Twilio webhook signature verification failed");
    return new Response("Invalid signature", { status: 401 });
  }

  const messageSid = params.MessageSid;
  const messageStatus = params.MessageStatus;
  const body = params.Body;

  if (messageStatus && messageSid) {
    await handleStatusCallback(messageSid, messageStatus, params.ErrorCode);
  } else if (body !== undefined) {
    await handleIncomingMessage(body, params.From, params.To);
  }

  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

async function handleStatusCallback(
  messageSid: string,
  status: string,
  errorCode?: string
): Promise<void> {
  if (errorCode) {
    console.warn(
      `Twilio delivery error for ${messageSid}: status=${status} error=${errorCode}`
    );
  }

  await updateDeliveryStatus(messageSid, status);
}

async function handleIncomingMessage(
  body: string,
  from: string,
  to: string
): Promise<void> {
  if (isOptOutKeyword(body)) {
    console.log(`SMS opt-out received from ${from}`);
    await recordOptOut(from);
  } else if (isOptInKeyword(body)) {
    console.log(`SMS opt-in received from ${from}`);
    await removeOptOut(from);
  } else {
    console.log(
      `Incoming SMS from ${from} to ${to}: ${body.substring(0, 50)}...`
    );
  }
}
