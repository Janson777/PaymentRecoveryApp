import { useState } from "react";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { type ShopSettings, formatDelayLabel } from "~/lib/settings";

export function SettingsForm({ settings }: { settings: ShopSettings }) {
  const actionData = useActionData<{ success?: boolean }>();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";
  const [smsEnabled, setSmsEnabled] = useState(settings.smsEnabled);

  return (
    <Form method="post" className="space-y-8">
      {actionData?.success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          Settings saved successfully.
        </div>
      )}

      {/* Recovery Workflow */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Recovery Workflow
        </h2>

        <div className="mt-6 space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="recoveryEnabled"
              value="true"
              defaultChecked={settings.recoveryEnabled}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Enable automated recovery
            </span>
          </label>

          <div>
            <label
              htmlFor="retryDelays"
              className="block text-sm font-medium text-gray-700"
            >
              Retry delays (minutes, comma-separated)
            </label>
            <input
              id="retryDelays"
              name="retryDelays"
              type="text"
              defaultValue={settings.retryDelays.join(",")}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Default: 15, 720, 2160 (15 min, 12 hrs, 36 hrs)
            </p>
          </div>
        </div>
      </div>

      {/* Channel Configuration */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Channel Configuration
          </h2>
          <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
            SMS
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Choose how to reach customers at each recovery step.
        </p>

        <div className="mt-6 space-y-5">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="smsEnabled"
              value="true"
              checked={smsEnabled}
              onChange={(e) => setSmsEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Enable SMS messaging
            </span>
          </label>
          <p className="-mt-3 pl-7 text-xs text-gray-400">
            Requires Twilio credentials configured in your environment.
          </p>

          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              smsEnabled
                ? "max-h-96 opacity-100"
                : "max-h-0 opacity-0"
            }`}
          >
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <p className="mb-3 text-sm font-medium text-gray-700">
                Channel per recovery step
              </p>
              <div className="space-y-2">
                {settings.retryDelays.map((delay, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md bg-white px-4 py-2.5 shadow-sm"
                  >
                    <span className="text-sm text-gray-700">
                      <span className="font-semibold text-gray-900">
                        Step {i + 1}
                      </span>{" "}
                      <span className="text-gray-400">
                        ({formatDelayLabel(delay)})
                      </span>
                    </span>
                    <div className="flex gap-5">
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name={`channelStep_${i}`}
                          value="EMAIL"
                          defaultChecked={
                            settings.channelSequence[i] !== "SMS"
                          }
                          className="h-3.5 w-3.5 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-gray-600">Email</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name={`channelStep_${i}`}
                          value="SMS"
                          defaultChecked={
                            settings.channelSequence[i] === "SMS"
                          }
                          className="h-3.5 w-3.5 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-gray-600">SMS</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Preserve channel config when SMS is toggled off */}
          {!smsEnabled &&
            settings.channelSequence.map((ch, i) => (
              <input
                key={i}
                type="hidden"
                name={`channelStep_${i}`}
                value={ch}
              />
            ))}
        </div>
      </div>

      {/* Confirmed Decline Templates */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Confirmed Decline Templates
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Used when we detect an explicit payment failure.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="confirmedDeclineSubject"
              className="block text-sm font-medium text-gray-700"
            >
              Email Subject
            </label>
            <input
              id="confirmedDeclineSubject"
              name="confirmedDeclineSubject"
              type="text"
              defaultValue={settings.emailTemplates.confirmedDecline.subject}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label
              htmlFor="confirmedDeclineBody"
              className="block text-sm font-medium text-gray-700"
            >
              Email Body
            </label>
            <textarea
              id="confirmedDeclineBody"
              name="confirmedDeclineBody"
              rows={3}
              defaultValue={settings.emailTemplates.confirmedDecline.body}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {smsEnabled && (
            <SmsTemplateField
              id="smsConfirmedDeclineBody"
              name="smsConfirmedDeclineBody"
              label="SMS Message"
              defaultValue={settings.smsTemplates.confirmedDecline.body}
            />
          )}
        </div>
      </div>

      {/* Likely Abandonment Templates */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Likely Abandonment Templates
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Used when we infer a late-stage checkout abandonment.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="likelyAbandonmentSubject"
              className="block text-sm font-medium text-gray-700"
            >
              Email Subject
            </label>
            <input
              id="likelyAbandonmentSubject"
              name="likelyAbandonmentSubject"
              type="text"
              defaultValue={settings.emailTemplates.likelyAbandonment.subject}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label
              htmlFor="likelyAbandonmentBody"
              className="block text-sm font-medium text-gray-700"
            >
              Email Body
            </label>
            <textarea
              id="likelyAbandonmentBody"
              name="likelyAbandonmentBody"
              rows={3}
              defaultValue={settings.emailTemplates.likelyAbandonment.body}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {smsEnabled && (
            <SmsTemplateField
              id="smsLikelyAbandonmentBody"
              name="smsLikelyAbandonmentBody"
              label="SMS Message"
              defaultValue={settings.smsTemplates.likelyAbandonment.body}
            />
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </Form>
  );
}

function SmsTemplateField({
  id,
  name,
  label,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const charCount = value.length;
  const isOverLimit = charCount > 160;

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        <span className="mr-1.5 text-xs">💬</span>
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Use <code className="rounded bg-gray-100 px-1 text-[11px]">{'{{recovery_url}}'}</code> for the recovery link
        </p>
        <span
          className={`text-xs font-medium tabular-nums ${
            isOverLimit ? "text-red-500" : "text-gray-400"
          }`}
        >
          {charCount}/160
        </span>
      </div>
    </div>
  );
}
