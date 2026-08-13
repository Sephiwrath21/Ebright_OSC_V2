"use client";

import { useState } from "react";

export interface CredentialData {
  candidateName: string;
  candidateEmail: string;
  username: string;
  tempPassword: string;
  loginLink: string;
}

/**
 * Step 2 of the Create Induction Profile modal — shows generated credentials
 * with copy buttons for each field. Single Done button closes the modal.
 */
interface Props {
  data: CredentialData;
  onDone: () => void;
}

export function CredentialScreen({ data, onDone }: Props) {
  return (
    <>
      <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span aria-hidden="true">✓</span> Induction profile created
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Share these credentials with the candidate so they can begin onboarding.
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          aria-label="Close"
          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-lg leading-none px-2"
        >
          ×
        </button>
      </header>

      <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
        {/* Green credential card */}
        <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900 p-4 space-y-3">
          <CredRow label="Candidate" value={`${data.candidateName} (${data.candidateEmail})`} copyable={false} />
          <CredRow label="Username" value={data.username} copyable />
          <CredRow label="Temporary Password" value={data.tempPassword} copyable mono />
          <CredRow label="Onboarding Login Link" value={data.loginLink} copyable mono />
        </div>

        {/* Blue info box */}
        <div className="rounded-md border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900 px-3 py-2.5 text-xs text-blue-800 dark:text-blue-200 flex items-start gap-2">
          <span aria-hidden="true">📧</span>
          <span>
            An email with login details has been queued to send automatically.
            <span className="block text-[10px] text-blue-700/70 dark:text-blue-300/70 mt-0.5">
              (Note: real email sending is stubbed for now — credentials are logged to the server console)
            </span>
          </span>
        </div>
      </div>

      <footer className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end bg-slate-50 dark:bg-slate-800">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Done
        </button>
      </footer>
    </>
  );
}

function CredRow({
  label,
  value,
  copyable,
  mono,
}: {
  label: string;
  value: string;
  copyable: boolean;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — could fall back to a textarea+execCommand
      // hack, but most modern browsers + HTTPS support clipboard.writeText.
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800/80 dark:text-emerald-300/80">{label}</p>
      <div className="flex items-center justify-between gap-2 rounded-md bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 px-3 py-2">
        <span className={`text-xs text-slate-900 dark:text-slate-100 break-all flex-1 ${mono ? "font-mono" : ""}`}>
          {value}
        </span>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded bg-slate-900 dark:bg-slate-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-slate-700 dark:hover:bg-slate-600"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}
