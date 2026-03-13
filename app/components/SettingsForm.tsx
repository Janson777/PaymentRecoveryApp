import { useState } from "react";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import type { ShopSettings } from "~/lib/settings";

const ATTEMPT_CONFIGS = [
  { label: "Attempt 1", unit: "min", min: 5, max: 60, step: 5, toMinutes: (v: number) => v, fromMinutes: (m: number) => m },
  { label: "Attempt 2", unit: "hrs", min: 1, max: 48, step: 1, toMinutes: (v: number) => v * 60, fromMinutes: (m: number) => Math.round(m / 60) },
  { label: "Attempt 3", unit: "days", min: 0.5, max: 7, step: 0.5, toMinutes: (v: number) => v * 1440, fromMinutes: (m: number) => Math.round((m / 1440) * 2) / 2 },
] as const;

function sliderDisplayValue(stepIndex: number, nativeValue: number): string {
  const cfg = ATTEMPT_CONFIGS[stepIndex];
  if (cfg.unit === "min") return `${nativeValue} min`;
  if (cfg.unit === "hrs") return nativeValue === 1 ? "1 hr" : `${nativeValue} hrs`;
  if (nativeValue === 0.5) return "12 hrs";
  if (nativeValue === 1) return "1 day";
  if (nativeValue % 1 === 0.5) return `${nativeValue} days`;
  return `${nativeValue} days`;
}

export function SettingsForm({ settings }: { settings: ShopSettings }) {
  const actionData = useActionData<{ success?: boolean }>();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";
  const [smsEnabled, setSmsEnabled] = useState(settings.smsEnabled);

  const [channels, setChannels] = useState<("EMAIL" | "SMS" | "NONE")[]>(() =>
    [0, 1, 2].map((i) => settings.channelSequence[i] ?? "EMAIL")
  );

  const [sliderValues, setSliderValues] = useState<number[]>(() =>
    [0, 1, 2].map((i) => {
      const minutes = settings.retryDelays[i] ?? [15, 720, 2160][i];
      return ATTEMPT_CONFIGS[i].fromMinutes(minutes);
    })
  );

  function setChannel(index: number, value: "EMAIL" | "SMS" | "NONE") {
    setChannels((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function setSlider(index: number, value: number) {
    setSliderValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

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

        <div className="mt-6">
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
          Configure timing and channel for each recovery attempt.
        </p>

        <div className="mt-6 space-y-5">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="smsEnabled"
              value="true"
              checked={smsEnabled}
              onChange={(e) => {
                setSmsEnabled(e.target.checked);
                if (!e.target.checked) {
                  setChannels((prev) => prev.map((ch) => ch === "SMS" ? "EMAIL" : ch));
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Enable SMS messaging
            </span>
          </label>
          <p className="-mt-3 pl-7 text-xs text-gray-400">
            Requires Twilio credentials configured in your environment.
          </p>

          {/* Attempt rows */}
          <div className="space-y-3">
            {ATTEMPT_CONFIGS.map((cfg, i) => {
              const isNone = channels[i] === "NONE";
              const minutesValue = cfg.toMinutes(sliderValues[i]);

              return (
                <div
                  key={i}
                  className={`rounded-lg border bg-white p-4 shadow-sm transition-colors ${
                    isNone
                      ? "border-gray-100 bg-gray-50"
                      : "border-gray-200"
                  }`}
                >
                  {/* Hidden inputs for form submission */}
                  <input type="hidden" name={`retryDelay_${i}`} value={minutesValue} />
                  <input type="hidden" name={`channelStep_${i}`} value={channels[i]} />

                  <div className="flex items-center gap-4">
                    {/* Step label */}
                    <span className="w-24 shrink-0 text-sm font-semibold text-gray-900">
                      {cfg.label}
                    </span>

                    {/* Delay slider — hidden when NONE */}
                    {!isNone ? (
                      <div className="flex w-[400px] shrink-0 items-center gap-3">
                        <input
                          type="range"
                          min={cfg.min}
                          max={cfg.max}
                          step={cfg.step}
                          value={sliderValues[i]}
                          onChange={(e) => setSlider(i, Number(e.target.value))}
                          className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-indigo-600 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-600"
                        />
                        <span className="w-16 shrink-0 text-left text-sm font-medium tabular-nums text-indigo-600">
                          {sliderDisplayValue(i, sliderValues[i])}
                        </span>
                      </div>
                    ) : (
                      <div className="flex w-[400px] shrink-0 items-center">
                        <span className="text-sm italic text-gray-400">
                          Disabled
                        </span>
                      </div>
                    )}

                    {/* Channel radios — fixed-width columns for vertical alignment, pushed right */}
                    <div className="ml-auto flex shrink-0 items-center border-l border-gray-200 pl-6">
                      <label className="flex w-20 items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          checked={channels[i] === "EMAIL"}
                          onChange={() => setChannel(i, "EMAIL")}
                          className="h-3.5 w-3.5 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-gray-600">Email</span>
                      </label>

                      {smsEnabled ? (
                        <label className="flex w-16 items-center gap-1.5 text-sm">
                          <input
                            type="radio"
                            checked={channels[i] === "SMS"}
                            onChange={() => setChannel(i, "SMS")}
                            className="h-3.5 w-3.5 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-gray-600">SMS</span>
                        </label>
                      ) : (
                        <span className="w-16" />
                      )}

                      {i > 0 ? (
                        <label className="flex w-16 items-center gap-1.5 text-sm">
                          <input
                            type="radio"
                            checked={channels[i] === "NONE"}
                            onChange={() => setChannel(i, "NONE")}
                            className="h-3.5 w-3.5 border-gray-300 text-gray-400 focus:ring-gray-400"
                          />
                          <span className="text-gray-400">None</span>
                        </label>
                      ) : (
                        <span className="w-16" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-400">
            Delay is measured from the time a decline is detected. Attempts set to
            &ldquo;None&rdquo; are skipped.
          </p>
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
