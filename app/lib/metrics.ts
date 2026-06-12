// WLT-13 — the instrument panel's server-side reads + the admin gate.
// Server-only: the metric views have SELECT revoked from authenticated/anon
// (0007), so reads go through the service role here and NEVER reach the client
// as a capability — only the rendered aggregates do. No PII anywhere (the
// views aggregate; events carry enums/ids only).

import { createServiceSupabase } from "@vc1023/passkey-2fa";

/** ADMIN_EMAILS env allow-list (comma-separated, case-insensitive). */
export function isAdmin(email: string | null | undefined, allowList = process.env.ADMIN_EMAILS): boolean {
  if (!email || !allowList) return false;
  const normalized = email.trim().toLowerCase();
  return allowList
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

export interface TtfvSummary {
  nCompleted: number;
  nSignups: number;
  p80TtfvSeconds: number | null;
  medianTtfvSeconds: number | null;
  medianSplitLinkedSeconds: number | null;
  medianSplitAssembledSeconds: number | null;
}

export interface WawuWeek {
  weekStart: string;
  wawu: number;
}

export interface FunnelStage {
  stage: string;
  stageOrder: number;
  users: number;
}

export interface MetricsSnapshot {
  ttfv: TtfvSummary;
  wawu: WawuWeek[];
  funnel: FunnelStage[];
}

export async function readMetrics(): Promise<MetricsSnapshot> {
  const svc = createServiceSupabase();

  const [ttfvRes, wawuRes, funnelRes] = await Promise.all([
    svc.from("metrics_ttfv_summary").select("*").single(),
    svc.from("metrics_wawu_weekly").select("*").limit(12),
    svc.from("metrics_funnel_stages").select("*").order("stage_order"),
  ]);
  if (ttfvRes.error || wawuRes.error || funnelRes.error) {
    throw new Error("[metrics] view read failed"); // page maps to the copy error line
  }

  const t = ttfvRes.data as Record<string, number | null>;
  return {
    ttfv: {
      nCompleted: Number(t.n_completed ?? 0),
      nSignups: Number(t.n_signups ?? 0),
      p80TtfvSeconds: t.p80_ttfv_seconds === null ? null : Number(t.p80_ttfv_seconds),
      medianTtfvSeconds: t.median_ttfv_seconds === null ? null : Number(t.median_ttfv_seconds),
      medianSplitLinkedSeconds: t.median_split_linked_seconds === null ? null : Number(t.median_split_linked_seconds),
      medianSplitAssembledSeconds:
        t.median_split_assembled_seconds === null ? null : Number(t.median_split_assembled_seconds),
    },
    wawu: (wawuRes.data ?? []).map((r) => {
      const row = r as { week_start: string; wawu: number };
      return { weekStart: row.week_start, wawu: Number(row.wawu) };
    }),
    funnel: (funnelRes.data ?? []).map((r) => {
      const row = r as { stage: string; stage_order: number; users: number };
      return { stage: row.stage, stageOrder: Number(row.stage_order), users: Number(row.users) };
    }),
  };
}

/** "14m 32s" (readable duration); "—" when absent. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
