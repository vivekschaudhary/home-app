"use client";

// WLT-16 — the "since last time" recap (design.md): one card, one action.
// States: cold-start (watching) → steady (movement + progress + one action) →
// target step (adjust/raise — reuses the WLT-12 mechanism) → acked. Movement is
// stated in WORDS (never color-only). Strings VERBATIM from copy.ts. Focus moves
// to the acked line; saving is announced via aria-live; reduced-motion: no
// animations used. Renders nothing when the recap isn't visible.

import { useEffect, useRef, useState } from "react";
import { Banner, Button } from "@wealth/ui";
import type { Movement } from "@wealth/core";
import type { RecapView } from "@/app/lib/recap";
import { COPY } from "@/app/lib/copy";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
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

export function RecapCard({ view }: { view: RecapView }) {
  const [step, setStep] = useState<"recap" | "target">("recap");
  const [ownTarget, setOwnTarget] = useState("");
  const [showOwn, setShowOwn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorKind>(null);
  const [acked, setAcked] = useState(false);
  const ackedRef = useRef<HTMLParagraphElement>(null);

  // Focus lands on the outcome after completing the action (accessibility).
  useEffect(() => {
    if (acked) ackedRef.current?.focus();
  }, [acked]);

  if (!view.visible) return null;

  const { workflowId, netWorth, movement, progress, action } = view;

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

      <div aria-label={a11yLabel} role="group" className="mt-4">
        {/* movement, real or cold-start — in WORDS, never color-only */}
        <p className="text-base font-medium text-gray-900">
          {movement ? movementLine(movement) : COPY.recap.coldStart}
        </p>
        <p className="mt-1 text-sm text-gray-500">{COPY.recap.netWorthLine.replace("{netWorth}", money(netWorth))}</p>

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

      {action ? (
        <div className="mt-5 max-w-xs">
          <Button onClick={() => setStep("target")}>
            {action.type === "adjust_target" ? COPY.recap.actionAdjust : COPY.recap.actionRaise}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
