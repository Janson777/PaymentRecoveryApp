import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getCaseById } from "~/models/recovery-case.server";
import { prisma } from "~/lib/db.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const caseId = Number(params.caseId);

  if (isNaN(caseId)) {
    throw new Response("Invalid case", { status: 400 });
  }

  const recoveryCase = await getCaseById(caseId);
  if (!recoveryCase) {
    throw new Response("Case not found", { status: 404 });
  }

  const checkout = (recoveryCase as Record<string, unknown>).checkout as {
    recoveryUrl?: string;
  } | null;

  if (!checkout?.recoveryUrl) {
    throw new Response("No recovery URL available", { status: 404 });
  }

  await prisma.recoveryMessage.updateMany({
    where: {
      recoveryCaseId: caseId,
      sentAt: { not: null },
      clickedAt: null,
    },
    data: { clickedAt: new Date() },
  });

  return redirect(checkout.recoveryUrl);
}
