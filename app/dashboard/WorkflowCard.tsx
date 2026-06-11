"use client";

// WLT-12 — the workflow card (design.md): one card, one action. States:
// pending_data (connect bridge) → active (real net-worth snapshot + "Set your
// target") → set-target (one-tap suggestion or own amount) → running. Strings
// VERBATIM from copy.ts (copy.md). Focus moves to the running confirmation;
// saving is announced via aria-live; reduced-motion: no animations used.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button } from "@wealth/ui";
import type { WorkflowView } from "@/app/lib/workflow";
import { COPY } from "@/app/lib/copy";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

type ErrorKind = "network" | "save" | "server" | null;

function errorCopy(e: Exclude<ErrorKind, null>): string {
  return COPY.workflowErrors[e];
}

export function WorkflowCard({ view }: { view: WorkflowView }) {
  const router = useRouter();
  const [step, setStep] = useState<"snapshot" | "target">("snapshot");
  const [ownTarget, setOwnTarget] = useState("");
  const [showOwn, setShowOwn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorKind>(null);
  const [runningTarget, setRunningTarget] = useState<number | null>(
    view.state === "running" ? view.target : null,
  );
  const runningHeadingRef = useRef<HTMLHeadingElement>(null);
  const justCompleted = useRef(false);

  // Focus lands on the outcome after completing the action (AC11).
  useEffect(() => {
    if (runningTarget !== null && justCompleted.current) runningHeadingRef.current?.focus();
  }, [runningTarget]);

  if (view.state === "none") return null;

  // ── pending_data: the connect bridge (AC6 — no dead-end, never a number) ──
  if (view.state === "pending_data") {
    return (
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6" aria-labelledby="wf-plan-title">
        <h3 id="wf-plan-title" className="text-base font-semibold text-gray-900">
          {COPY.workflow.planReadyTitle}
        </h3>
        <p className="mt-1 text-sm text-gray-600">{COPY.workflow.planReadyBody}</p>
        <div className="mt-4 flex items-center gap-4">
          <div className="max-w-xs">
            <Button onClick={() => router.push("/settings/accounts")}>{COPY.workflow.planReadyConnectCta}</Button>
          </div>
          <span className="text-sm text-gray-500">{COPY.workflow.planReadyLater}</span>
        </div>
      </section>
    );
  }

  const cfg = view.config;
  const workflowId = view.workflowId;

  // ── running: the persistent quiet row ──
  if (runningTarget !== null) {
    return (
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6" aria-labelledby="wf-running-title">
        <h3 ref={runningHeadingRef} tabIndex={-1} id="wf-running-title" className="text-base font-semibold text-gray-900 outline-none">
          {COPY.workflow.runningTitle}
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          {COPY.workflow.runningBody.replace("{amount}", money(runningTarget))}
        </p>
        <p className="mt-3 text-sm font-medium text-gray-900">
          {COPY.workflow.runningCardStatus.replace("{amount}", money(runningTarget))}
        </p>
      </section>
    );
  }

  async function save(target: number) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/workflow/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, target }),
      });
      if (!res.ok) {
        setError(res.status >= 500 || res.status === 502 ? "server" : "save");
        return;
      }
      justCompleted.current = true;
      setRunningTarget(target);
    } catch {
      setError("network");
    } finally {
      setSaving(false);
    }
  }

  // ── set-target step ──
  if (step === "target") {
    const ownValue = Number.parseFloat(ownTarget);
    const ownValid = Number.isFinite(ownValue) && ownValue !== 0;
    return (
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6" aria-labelledby="wf-target-title">
        <h3 id="wf-target-title" className="text-base font-semibold text-gray-900">
          {COPY.workflow.targetTitle}
        </h3>
        {error ? <div className="mt-3"><Banner variant="error">{errorCopy(error)}</Banner></div> : null}
        <p className="mt-2 text-sm text-gray-600">
          {COPY.workflow.targetSuggestion.replace("{amount}", money(cfg.suggestedTarget))}
        </p>
        <div className="mt-3 max-w-xs">
          <Button onClick={() => void save(cfg.suggestedTarget)} loading={saving} loadingLabel={COPY.workflow.targetSaving}>
            {COPY.workflow.targetSuggestionAccept}
          </Button>
        </div>
        {!showOwn ? (
          <button type="button" onClick={() => setShowOwn(true)} className="mt-3 text-sm font-medium text-gray-600 underline">
            {COPY.workflow.targetOwnCta}
          </button>
        ) : (
          <div className="mt-4">
            <label htmlFor="wf-own-target" className="block text-sm font-medium text-gray-700">
              {COPY.workflow.targetOwnLabel}
            </label>
            <input
              id="wf-own-target"
              type="number"
              inputMode="decimal"
              value={ownTarget}
              onChange={(e) => setOwnTarget(e.target.value)}
              className="mt-1 w-48 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="mt-3 flex gap-3">
              <div className="max-w-xs">
                <Button onClick={() => void save(ownValue)} disabled={!ownValid} loading={saving} loadingLabel={COPY.workflow.targetSaving}>
                  {COPY.workflow.targetSave}
                </Button>
              </div>
              <Button variant="secondary" onClick={() => setStep("snapshot")} disabled={saving}>
                {COPY.workflow.targetCancel}
              </Button>
            </div>
          </div>
        )}
        {/* SR announcements: saving + success (AC10/AC11) */}
        <p aria-live="polite" role="status" className="sr-only">
          {saving ? COPY.workflow.targetSaving : runningTarget !== null ? COPY.workflowA11y.targetSet : ""}
        </p>
      </section>
    );
  }

  // ── active: the snapshot + THE one action ──
  const srLabel = COPY.workflowA11y.netWorth
    .replace("{netWorth}", money(cfg.netWorth))
    .replace("{assets}", money(cfg.assets))
    .replace("{debts}", money(cfg.debts));
  return (
    <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6" aria-labelledby="wf-snapshot-title">
      <h3 id="wf-snapshot-title" className="text-base font-semibold text-gray-900">
        {COPY.workflow.snapshotTitle}
      </h3>
      {error ? <div className="mt-3"><Banner variant="error">{errorCopy(error)}</Banner></div> : null}
      <div aria-label={srLabel} role="group" className="mt-4">
        <p className="text-sm text-gray-600">{COPY.workflow.netWorthLabel}</p>
        <p className="text-3xl font-semibold tracking-tight text-gray-900">{money(cfg.netWorth)}</p>
        <p className="mt-1 text-sm text-gray-500">
          {COPY.workflow.assetsLabel} {money(cfg.assets)} <span aria-hidden="true">·</span> {COPY.workflow.debtsLabel}{" "}
          {money(cfg.debts)}
        </p>
      </div>
      <div className="mt-5 max-w-xs">
        <Button onClick={() => setStep("target")}>{COPY.workflow.action}</Button>
      </div>
    </section>
  );
}
