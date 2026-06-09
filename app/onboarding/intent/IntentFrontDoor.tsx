"use client";

import { INTENT_CLUSTERS } from "@wealth/core";
import { Banner, Button } from "@wealth/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { COPY } from "@/app/lib/copy";

type Status = "idle" | "declaring" | "done" | "error";

export function IntentFrontDoor() {
  const router = useRouter();
  const [selected, setSelected] = useState<{ cluster: string; intentKey: string } | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  async function declare() {
    if (!selected) return;
    setStatus("declaring");
    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(selected),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  // ─── Confirmation (placeholder — WLT-4 not built yet) ──────────────────────
  if (status === "done") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-12">
        <div aria-live="polite">
          <h1 className="text-2xl font-semibold text-slate-900">{COPY.intent.doneTitle}</h1>
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

      {status === "error" && (
        <div className="mb-6">
          <Banner variant="error">{COPY.intentErrors.save}</Banner>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {INTENT_CLUSTERS.map((c) => (
          <fieldset key={c.cluster} className="rounded-2xl border border-slate-200 p-5">
            <legend className="px-1 text-sm font-medium text-slate-500">{c.header}</legend>
            <div className="mt-2 flex flex-col gap-2" role="radiogroup" aria-label={`${c.header} — choose one`}>
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
        <Button
          onClick={declare}
          disabled={!selected}
          loading={status === "declaring"}
          loadingLabel={COPY.intent.declaring}
        >
          {COPY.intent.cta}
        </Button>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-sm text-slate-500 underline-offset-2 hover:underline"
        >
          {COPY.intent.explore}
        </button>
      </div>
    </main>
  );
}
