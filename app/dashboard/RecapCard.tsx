"use client";

// WLT-16 — the "since last time" recap (design.md): one card, one action.
// States: cold-start (watching) → steady (movement + progress + one action) →
// target step (adjust/raise — reuses the WLT-12 mechanism) → acked. Movement is
// stated in WORDS (never color-only). Strings VERBATIM from copy.ts. Focus moves
// to the acked line; saving is announced via aria-live; reduced-motion: no
// animations used. Renders nothing when the recap isn't visible.

import { useEffect, useRef, useState } from "react";
import { Banner, Button } from "@wealth/ui";
import type { Movement, SpendingComparison } from "@wealth/core";
import type { RecapAnomaly, RecapView } from "@/app/lib/recap";
import { COPY } from "@/app/lib/copy";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function anomalyLine(a: RecapAnomaly): string {
  if (a.kind === "large_charge") {
    return COPY.anomaly.largeCharge
      .replace("{amount}", money(a.summary.amount))
      .replace("{category}", a.summary.category ?? "Other")
      .replace("{date}", a.summary.date ?? "");
  }
  return COPY.anomaly.lowBalance.replace("{amount}", money(a.summary.amount));
}

type ErrorKind = "network" | "save" | "server" | null;
function errorCopy(e: Exclude<ErrorKind, null>): string {
  return COPY.recapErrors[e];
}

function movementLine(m: Movement): string {
  if (m.direction === "up") return COPY.recap.movementUp.replace("{amount}", money(m.delta));
  if (m.direction === "down") return COPY.recap.movementDown.replace("{amount}", money(m.delta));
  return COPY.recap.movementFlat;
}

function movementForA11y(m: Movement | null): string {
  if (!m) return COPY.recap.coldStart;
  return movementLine(m);
}

function spendComparisonLine(s: SpendingComparison): string {
  if (!s.comparable || !s.delta) return COPY.recapSpend.noComparison;
  if (s.delta.direction === "more") return COPY.recapSpend.more.replace("{amount}", money(s.delta.amount));
  if (s.delta.direction === "less") return COPY.recapSpend.less.replace("{amount}", money(s.delta.amount));
  return COPY.recapSpend.same;
}

function topCategoriesText(s: SpendingComparison): string {
  return s.topCategories.map((c) => `${c.category} ${money(c.amount)}`).join(" · ");
}

export function RecapCard({ view }: { view: RecapView }) {
  const [step, setStep] = useState<"recap" | "target">("recap");
  const [ownTarget, setOwnTarget] = useState("");
  const [showOwn, setShowOwn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorKind>(null);
  const [acked, setAcked] = useState(false);
  // WLT-18: the anomaly callout's own outcome (null = still open).
  const [anomalyOutcome, setAnomalyOutcome] = useState<null | "acted" | "dismissed">(null);
  const [anomalySaving, setAnomalySaving] = useState(false);
  const [anomalyError, setAnomalyError] = useState<ErrorKind>(null);
  const ackedRef = useRef<HTMLParagraphElement>(null);

  // Focus lands on the outcome after completing the action (accessibility).
  useEffect(() => {
    if (acked || anomalyOutcome === "acted") ackedRef.current?.focus();
  }, [acked, anomalyOutcome]);

  if (!view.visible) return null;

  const { workflowId, netWorth, movement, progress, action, spending, anomaly } = view;
  // The anomaly is THE one action while open; it outranks the target action.
  const anomalyActive = anomaly !== null && anomalyOutcome === null;

  async function resolveAnomaly(status: "acted" | "dismissed") {
    if (!anomaly) return;
    setAnomalySaving(true);
    setAnomalyError(null);
    try {
      const res = await fetch(`/api/anomaly/${anomaly.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(status === "acted" ? { status, workflowId } : { status }),
      });
      if (!res.ok) {
        setAnomalyError(res.status >= 500 ? "server" : "save");
        return;
      }
      setAnomalyOutcome(status);
    } catch {
      setAnomalyError("network");
    } finally {
      setAnomalySaving(false);
    }
  }

  async function save(target: number, kind: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/recap/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, target, kind }),
      });
      if (!res.ok) {
        setError(res.status >= 500 ? "server" : "save");
        return;
      }
      setAcked(true);
    } catch {
      setError("network");
    } finally {
      setSaving(false);
    }
  }

  // ── acked: the quiet confirmation (focus lands here) ──
  if (acked) {
    return (
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6" aria-labelledby="recap-acked-title">
        <h3 id="recap-acked-title" className="text-base font-semibold text-gray-900">
          {COPY.recap.heading}
        </h3>
        <p ref={ackedRef} tabIndex={-1} role="status" className="mt-3 text-sm font-medium text-gray-900 outline-none">
          {COPY.recap.ackedLine}
        </p>
        <p aria-live="polite" className="sr-only">
          {COPY.recapA11y.acked}
        </p>
      </section>
    );
  }

  // ── anomaly reviewed: the quiet "noted" confirmation (focus lands here) ──
  if (anomalyOutcome === "acted") {
    return (
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6" aria-labelledby="recap-anomaly-acked-title">
        <h3 id="recap-anomaly-acked-title" className="text-base font-semibold text-gray-900">
          {COPY.recap.heading}
        </h3>
        <p ref={ackedRef} tabIndex={-1} role="status" className="mt-3 text-sm font-medium text-gray-900 outline-none">
          {COPY.anomaly.acked}
        </p>
        <p aria-live="polite" className="sr-only">
          {COPY.anomalyA11y.acked}
        </p>
      </section>
    );
  }

  // ── target step: adjust/raise (reuses the WLT-12 target mechanism) ──
  if (step === "target" && action) {
    const ownValue = Number.parseFloat(ownTarget);
    const ownValid = Number.isFinite(ownValue) && ownValue !== 0;
    return (
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6" aria-labelledby="recap-target-title">
        <h3 id="recap-target-title" className="text-base font-semibold text-gray-900">
          {action.type === "adjust_target" ? COPY.recap.actionAdjust : COPY.recap.actionRaise}
        </h3>
        {error ? (
          <div className="mt-3">
            <Banner variant="error">{errorCopy(error)}</Banner>
          </div>
        ) : null}
        <p className="mt-2 text-sm text-gray-600">
          {COPY.recap.targetSuggestion.replace("{amount}", money(action.suggestedTarget))}
        </p>
        <div className="mt-3 max-w-xs">
          <Button
            onClick={() => void save(action.suggestedTarget, action.kind)}
            loading={saving}
            loadingLabel={COPY.recap.actionSaving}
          >
            {COPY.recap.targetSuggestionAccept}
          </Button>
        </div>
        {!showOwn ? (
          <button
            type="button"
            onClick={() => setShowOwn(true)}
            className="mt-3 text-sm font-medium text-gray-600 underline"
          >
            {COPY.recap.targetOwnCta}
          </button>
        ) : (
          <div className="mt-4">
            <label htmlFor="recap-own-target" className="block text-sm font-medium text-gray-700">
              {COPY.recap.targetOwnLabel}
            </label>
            <input
              id="recap-own-target"
              type="number"
              inputMode="decimal"
              value={ownTarget}
              onChange={(e) => setOwnTarget(e.target.value)}
              className="mt-1 w-48 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="mt-3 flex gap-3">
              <div className="max-w-xs">
                <Button
                  onClick={() => void save(ownValue, action.kind)}
                  disabled={!ownValid}
                  loading={saving}
                  loadingLabel={COPY.recap.actionSaving}
                >
                  {COPY.recap.targetSave}
                </Button>
              </div>
              <Button variant="secondary" onClick={() => setStep("recap")} disabled={saving}>
                {COPY.recap.targetCancel}
              </Button>
            </div>
          </div>
        )}
        <p aria-live="polite" role="status" className="sr-only">
          {saving ? COPY.recap.actionSaving : ""}
        </p>
      </section>
    );
  }

  // ── recap: movement + progress + the one action ──
  const a11yLabel = COPY.recapA11y.recap
    .replace("{movement}", movementForA11y(movement))
    .replace("{netWorth}", money(netWorth))
    .replace("{percent}", String(progress.percent))
    .replace("{target}", money(progress.target));

  return (
    <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6" aria-labelledby="recap-title">
      <h3 id="recap-title" className="text-base font-semibold text-gray-900">
        {COPY.recap.heading}
      </h3>
      {error ? (
        <div className="mt-3">
          <Banner variant="error">{errorCopy(error)}</Banner>
        </div>
      ) : null}

      {/* anomaly — "worth a look" (WLT-18); plain, dismissible, THE one action while open */}
      {anomalyActive && anomaly ? (
        <div
          className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4"
          role="group"
          aria-label={COPY.anomalyA11y.callout.replace("{summary}", anomalyLine(anomaly))}
        >
          <p className="text-sm font-medium text-gray-900">{COPY.anomaly.heading}</p>
          <p className="mt-1 text-sm text-gray-700">{anomalyLine(anomaly)}</p>
          {anomalyError ? (
            <div className="mt-3">
              <Banner variant="error">{errorCopy(anomalyError)}</Banner>
            </div>
          ) : null}
          <div className="mt-3 flex items-center gap-3">
            <div className="max-w-xs">
              <Button onClick={() => void resolveAnomaly("acted")} loading={anomalySaving} loadingLabel={COPY.anomaly.reviewing}>
                {COPY.anomaly.reviewCta}
              </Button>
            </div>
            <Button variant="secondary" onClick={() => void resolveAnomaly("dismissed")} disabled={anomalySaving}>
              {COPY.anomaly.dismissCta}
            </Button>
          </div>
          <p aria-live="polite" role="status" className="sr-only">
            {anomalySaving ? COPY.anomaly.reviewing : ""}
          </p>
        </div>
      ) : null}

      <div aria-label={a11yLabel} role="group" className="mt-4">
        {/* movement, real or cold-start — in WORDS, never color-only */}
        <p className="text-base font-medium text-gray-900">
          {movement ? movementLine(movement) : COPY.recap.coldStart}
        </p>
        <p className="mt-1 text-sm text-gray-500">{COPY.recap.netWorthLine.replace("{netWorth}", money(netWorth))}</p>

        {/* spending — "where your money went" (WLT-17); display only, no action */}
        {spending ? (
          <div
            className="mt-4 border-t border-gray-100 pt-4"
            aria-label={COPY.recapA11y.spend
              .replace("{total}", money(spending.thisWeek))
              .replace("{comparison}", spendComparisonLine(spending))
              .replace("{categories}", topCategoriesText(spending) || "—")}
            role="group"
          >
            <p className="text-sm font-medium text-gray-900">{COPY.recapSpend.heading}</p>
            <p className="mt-1 text-sm text-gray-700">
              {COPY.recapSpend.thisWeek.replace("{total}", money(spending.thisWeek))}{" "}
              <span aria-hidden="true">·</span> {spendComparisonLine(spending)}
            </p>
            {spending.topCategories.length > 0 ? (
              <p className="mt-1 text-sm text-gray-500">
                {COPY.recapSpend.topLabel}: {topCategoriesText(spending)}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* progress toward target — the thing that now tracks */}
        <p className="mt-4 text-sm text-gray-600">{COPY.recap.progressLabel}</p>
        <div
          role="progressbar"
          aria-valuenow={Math.max(0, Math.min(100, progress.percent))}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={COPY.recapA11y.progressBar.replace("{percent}", String(progress.percent))}
          className="mt-1 h-2 w-full max-w-sm overflow-hidden rounded-full bg-gray-100"
        >
          <div
            aria-hidden="true"
            className="h-full rounded-full bg-gray-900"
            style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
          />
        </div>
        <p className="mt-1 text-sm text-gray-700">
          {COPY.recap.progressValue.replace("{current}", money(progress.current)).replace("{target}", money(progress.target))}{" "}
          <span aria-hidden="true">·</span> {COPY.recap.progressPercent.replace("{percent}", String(progress.percent))}
        </p>
        <p className="mt-1 text-sm text-gray-600">
          {progress.status === "behind" ? COPY.recap.behind : COPY.recap.onTrack}
        </p>
      </div>

      {/* the target action — suppressed while an anomaly is the active one action (at-most-one) */}
      {action && !anomalyActive ? (
        <div className="mt-5 max-w-xs">
          <Button onClick={() => setStep("target")}>
            {action.type === "adjust_target" ? COPY.recap.actionAdjust : COPY.recap.actionRaise}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
