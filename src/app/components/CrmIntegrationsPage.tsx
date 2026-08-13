"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Home, ChevronRight, Share2, Globe, FileSpreadsheet,
  CalendarCheck, Mail, Code2, Music,
  CheckCircle2, XCircle, AlertCircle, Copy, Check, ExternalLink,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "CONNECTED" | "DISCONNECTED" | "ERROR";

interface Integration {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  initialStatus: Status;
  lastSyncAt?: string;
  webhookUrl?: string;
  isWebsiteForm?: boolean;
}

// ─── Integration definitions ──────────────────────────────────────────────────

const INTEGRATIONS: Integration[] = [
  {
    id: "meta",
    label: "Meta (Facebook / Instagram)",
    description: "Import leads from Facebook Lead Ads and Instagram forms automatically into the pipeline.",
    icon: <Share2 className="w-5 h-5" />,
    iconBg: "bg-blue-600",
    initialStatus: "CONNECTED",
    lastSyncAt: "26 Jun 2025, 8:14 AM",
  },
  {
    id: "tiktok",
    label: "TikTok Leads",
    description: "Capture leads submitted via TikTok Lead Generation ads and route them into the funnel.",
    icon: <Music className="w-5 h-5" />,
    iconBg: "bg-slate-900",
    initialStatus: "DISCONNECTED",
  },
  {
    id: "wix",
    label: "Wix Website",
    description: "Receive form submissions from your Wix website via webhook and create leads automatically.",
    icon: <Globe className="w-5 h-5" />,
    iconBg: "bg-violet-600",
    initialStatus: "CONNECTED",
    lastSyncAt: "26 Jun 2025, 9:02 AM",
    webhookUrl: "https://app.ebright.my/api/webhooks/wix/branch-02",
  },
  {
    id: "google_forms",
    label: "Google Forms",
    description: "Sync responses from Google Forms as new leads in the pipeline with field mapping.",
    icon: <FileSpreadsheet className="w-5 h-5" />,
    iconBg: "bg-green-600",
    initialStatus: "DISCONNECTED",
  },
  {
    id: "google_cal",
    label: "Google Calendar",
    description: "Sync trial class slots and automatically send confirmation reminders from calendar events.",
    icon: <CalendarCheck className="w-5 h-5" />,
    iconBg: "bg-red-500",
    initialStatus: "DISCONNECTED",
  },
  {
    id: "outlook",
    label: "Microsoft Outlook",
    description: "Log email conversations with leads and sync calendar events for trial class scheduling.",
    icon: <Mail className="w-5 h-5" />,
    iconBg: "bg-sky-600",
    initialStatus: "DISCONNECTED",
  },
  {
    id: "website_form",
    label: "Website Form",
    description: "Embed a custom Ebright-branded form on any website to capture trial class registrations directly.",
    icon: <Code2 className="w-5 h-5" />,
    iconBg: "bg-slate-600",
    initialStatus: "CONNECTED",
    isWebsiteForm: true,
  },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  if (status === "CONNECTED") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
      <CheckCircle2 className="w-3 h-3" /> Connected
    </span>
  );
  if (status === "ERROR") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900 dark:text-red-200">
      <AlertCircle className="w-3 h-3" /> Error
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      <XCircle className="w-3 h-3" /> Disconnected
    </span>
  );
}

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({
  intg,
  status,
  onToggle,
}: {
  intg: Integration;
  status: Status;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyWebhook() {
    if (!intg.webhookUrl) return;
    navigator.clipboard.writeText(intg.webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow dark:bg-slate-900 dark:border-slate-800">
      {/* Card header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${intg.iconBg}`}>
            {intg.icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">{intg.label}</p>
            <div className="mt-1">
              <StatusBadge status={status} />
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="px-5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex-1">{intg.description}</p>

      {/* Last sync */}
      {status === "CONNECTED" && intg.lastSyncAt && (
        <p className="px-5 mt-3 text-[11px] text-slate-400">
          Last sync: {intg.lastSyncAt}
        </p>
      )}

      {/* Webhook URL */}
      {intg.webhookUrl && status === "CONNECTED" && (
        <div className="px-5 mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Webhook URL</p>
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 dark:bg-slate-800 dark:border-slate-700">
            <code className="flex-1 text-[10px] text-slate-600 dark:text-slate-300 truncate">{intg.webhookUrl}</code>
            <button
              onClick={copyWebhook}
              className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              title="Copy webhook URL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Action button */}
      <div className="px-5 py-4 mt-3">
        {intg.isWebsiteForm ? (
          <Link
            href="/crm/forms"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open Forms
          </Link>
        ) : status === "CONNECTED" ? (
          <button
            onClick={onToggle}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors dark:border-red-700 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onToggle}
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmIntegrationsPage() {
  const [statuses, setStatuses] = useState<Record<string, Status>>(
    Object.fromEntries(INTEGRATIONS.map(i => [i.id, i.initialStatus])),
  );

  function toggleConnect(id: string) {
    setStatuses(prev => ({
      ...prev,
      [id]: prev[id] === "CONNECTED" ? "DISCONNECTED" : "CONNECTED",
    }));
  }

  const connectedCount = Object.values(statuses).filter(s => s === "CONNECTED").length;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors rounded">
            <Home className="w-4 h-4" aria-hidden="true" /><span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">CNS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-700 dark:text-slate-300">Lead</span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Integrations</span>
        </nav>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Integrations</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Connect external platforms to automatically import leads and sync data.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:border-emerald-700 dark:text-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {connectedCount} of {INTEGRATIONS.length} connected
            </span>
          </div>
        </div>

        {/* Integration cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {INTEGRATIONS.map(intg => (
            <IntegrationCard
              key={intg.id}
              intg={intg}
              status={statuses[intg.id]}
              onToggle={() => toggleConnect(intg.id)}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
