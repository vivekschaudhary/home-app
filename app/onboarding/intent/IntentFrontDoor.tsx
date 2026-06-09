"use client";

import { INTENT_CLUSTERS } from "@wealth/core";
import { Banner, Button } from "@wealth/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COPY } from "@/app/lib/copy";

type ErrorKind = "save" | "network" | "server";
type Status = "idle" | "declaring" | "done" | { error: ErrorKind };

// One year — a dismissed prompt shouldn't re-appear on every login (AC5 non-
// coercion). Declaring an intent is the permanent skip (hasDeclaredIntent).
const DISMISS_COOKIE = "intent_prompt_dismissed";

export function IntentFrontDoor() {
  const router = useRouter();
  const [selected, setSelected] = useState<{ cluster: string; intentKey: string } | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const confirmRef = useRef<HTMLHeadingElement>(null);

  const done = status === "done";
  const errorKind = typeof status === "object" ? status.error : null;
  const declaring = status === "declaring";

  // Move focus to the confirmation on declare (AC10 / design.md).
  useEffect(() => {
    if (done) confirmRef.current?.focus();
  }, [done]);

  async function declare() {
    if (!selected) return;
    setStatus("declaring");
    let res: Response;
    try {
      res = await fetch("/api/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(selected),
      });
    } catch {
      setStatus({ error: "network" }); // fetch threw → offline/network
      return;
    }
    if (res.ok) {
      setStatus("done");
      return;
    }
    // Discriminated (AC9): 4xx = validation; 5xx/anything else = our side.
    setStatus({ error: res.status >= 400 && res.status < 500 ? "save" : "server" });
  }

  function explore() {
    // Persist the dismissal so the front door isn't re-prompted every login.
    document.cookie = `${DISMISS_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
    router.push("/dashboard");
  }

  // ─── Confirmation (placeholder — WLT-4 not built yet) ──────────────────────
  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-12">
        <div>
          <h1 ref={confirmRef} tabIndex={-1} className="text-2xl font-semibold text-slate-900 focus:outline-none">
            {COPY.intent.doneTitle}
          </h1>
          <p className="mt-3 text-slate-600">{COPY.intent.doneBody}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => router.push("/settings/accounts")}>{COPY.intent.doneCta}</Button>
          <Button variant="secondary" onClick={() => router.push("/dashboard")}>
            {COPY.intent.doneSecondary}
          </Button>
        </div>
      </main>
    );
  }

  // ─── The front door ────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900">{COPY.intent.title}</h1>
        <p className="mt-2 text-slate-600">{COPY.intent.subtitle}</p>
      </header>

      {errorKind && (
        <div className="mb-6">
          <Banner variant="error">{COPY.intentErrors[errorKind]}</Banner>
        </div>
      )}

      {/* One radio group across the whole screen (native `name` grouping); each
          cluster is a labelled <fieldset> for visual + a11y grouping. */}
      <div className="grid gap-5 sm:grid-cols-2" role="radiogroup" aria-label={COPY.intent.title}>
        {INTENT_CLUSTERS.map((c) => (
          <fieldset key={c.cluster} className="rounded-2xl border border-slate-200 p-5">
            <legend className="px-1 text-sm font-medium text-slate-500">{c.header}</legend>
            <div className="mt-2 flex flex-col gap-2">
              {c.intents.map((i) => {
                const checked = selected?.intentKey === i.intentKey;
                return (
                  <label
                    key={i.intentKey}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-slate-800 transition ${
                      checked ? "border-slate-900 bg-slate-50 font-medium" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="intent"
                      className="h-4 w-4 accent-slate-900"
                      checked={checked}
                      onChange={() => setSelected({ cluster: c.cluster, intentKey: i.intentKey })}
                    />
                    <span>{i.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-8 flex flex-col items-start gap-4">
        <Button onClick={declare} disabled={!selected} loading={declaring} loadingLabel={COPY.intent.declaring}>
          {COPY.intent.cta}
        </Button>
        <button
          type="button"
          onClick={explore}
          className="text-sm text-slate-500 underline-offset-2 hover:underline"
        >
          {COPY.intent.explore}
        </button>
      </div>
    </main>
  );
}
