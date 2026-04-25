interface DashboardPhoneReminderProps {
  shopDomain: string;
}

/**
 * Shown on the dashboard overview to Pro merchants who have SMS enabled.
 * SMS recovery can only reach customers whose phone number was captured at
 * checkout — this reminder nudges the merchant to configure Shopify's
 * checkout settings so phone is Optional or Required.
 *
 * This is a lighter sibling of the amber PhoneCollectionBanner used inside
 * the settings form; it's intentionally compact so it doesn't overwhelm the
 * overview page.
 */
export function DashboardPhoneReminder({
  shopDomain,
}: DashboardPhoneReminderProps) {
  const adminUrl = `https://${shopDomain}/admin/settings/checkout`;

  return (
    <div
      role="note"
      aria-label="Phone number collection reminder"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.774a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-indigo-900">
            SMS recovery is on — make sure checkout collects phone numbers
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-indigo-700/80">
            In your Shopify admin, set{" "}
            <span className="font-medium">Shipping address phone number</span>{" "}
            to <span className="font-medium">Optional</span> or{" "}
            <span className="font-medium">Required</span>. Customers without a
            phone on file will automatically fall back to email.
          </p>
        </div>
      </div>
      <a
        href={adminUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Open checkout settings
        <svg
          className="h-3 w-3"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.25 5.5a.75.75 0 00-.75.75v8.5a.75.75 0 00.75.75h8.5a.75.75 0 00.75-.75V10a.75.75 0 011.5 0v4.75A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4H9a.75.75 0 010 1.5H4.25z"
            clipRule="evenodd"
          />
          <path
            fillRule="evenodd"
            d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
            clipRule="evenodd"
          />
        </svg>
      </a>
    </div>
  );
}
