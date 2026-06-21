"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { useEffect, useId, useRef, useState } from "react";
import { humanizeCategory } from "@wealth/core";
import { Button, TextField } from "@wealth/ui";
import type { CategoryDTO } from "@/app/lib/budget-client";
import { COPY } from "@/app/lib/copy";

// WLT-22-2/3 — per-line-item recategorize control. Opens a keyboard-navigable
// menu of the user's categories (current marked); "+ New category" reveals an
// inline create-form. WLT-22-3 adds the "Always categorize {merchant} this way"
// checkbox (only when the transaction has a merchant): checked + pick → the move
// becomes a rule that backfills past + applies at sync (the counted success names
// how many rows it touched). The save is async — the TRIGGER shows saving/error
// and the item keeps its prior category until success (no optimistic revert).

const R = COPY.budgetRecat;
const RA = COPY.budgetRecatA11y;
const RM = COPY.budgetRemember;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export type RecatResult = { ok: true; count: number } | { ok: false; error: "invalid" | "server" | "network" };
export type CreateResult =
  | { ok: true; category: CategoryDTO }
  | { ok: false; error: "invalid" | "duplicate" | "server" | "network" };

export function CategoryPicker({
  current,
  merchantLabel,
  amount,
  categories,
  canRemember,
  onPick,
  onCreate,
}: {
  current: string; // the resolved current category name ("" = "Other")
  merchantLabel: string; // merchant or description, for display + a11y
  amount: string; // formatted, for the trigger's accessible name
  categories: CategoryDTO[];
  canRemember: boolean; // true when the transaction has a real merchant (a rule can match)
  onPick: (categoryId: string, applyToMerchant: boolean) => Promise<RecatResult>;
  onCreate: (name: string, kind: "essential" | "discretionary") => Promise<CreateResult>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [lastPick, setLastPick] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"essential" | "discretionary">("discretionary");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const kindName = useId();

  // The create-form is a floating popover (anchored below the trigger) so it never
  // pushes/overlaps the transaction rows. Close it on Escape or an outside click.
  useEffect(() => {
    if (!creating) return;
    function close() {
      setCreating(false);
      setCreateErr(null);
      setName("");
      triggerRef.current?.focus();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [creating]);

  async function pick(categoryId: string) {
    const applyToMerchant = canRemember && remember;
    setSaving(true);
    setError(null);
    setSuccess(null);
    setLastPick(categoryId);
    const res = await onPick(categoryId, applyToMerchant);
    setSaving(false);
    if (!res.ok) {
      setError(res.error === "network" ? RM.errorNetwork : res.error === "invalid" ? R.errorInvalid : RM.error);
      return;
    }
    if (applyToMerchant) {
      // Name the breadth — how many rows the rule touched (singular/plural).
      const catName = categories.find((c) => c.id === categoryId)?.name ?? "";
      const tmpl = res.count === 1 ? RM.successOne : RM.successMany;
      setSuccess(fill(tmpl, { merchant: merchantLabel, category: humanizeCategory(catName), count: String(res.count) }));
      setRemember(false);
    }
    // The single-move (unchecked) success is the BudgetClient "Moved to…" toast.
  }

  async function submitCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setCreateErr(R.errorNameEmpty);
      return;
    }
    setCreateBusy(true);
    setCreateErr(null);
    const res = await onCreate(trimmed, kind);
    setCreateBusy(false);
    if (!res.ok) {
      setCreateErr(res.error === "duplicate" ? fill(R.errorNameDuplicate, { name: trimmed }) : R.errorCreate);
      return;
    }
    setCreating(false);
    setName("");
    setKind("discretionary");
    triggerRef.current?.focus();
    await pick(res.category.id); // created → assign it to this transaction
  }

  function cancelCreate() {
    setCreating(false);
    setCreateErr(null);
    setName("");
    triggerRef.current?.focus();
  }

  return (
    <div className="relative inline-flex flex-col items-end gap-1">
      <Menu as="div" className="relative inline-block text-left">
        <MenuButton
          ref={triggerRef}
          disabled={saving}
          aria-busy={saving || undefined}
          aria-label={fill(RA.openPicker, { merchant: merchantLabel, amount, category: humanizeCategory(current || null) })}
          className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-60"
        >
          {saving ? (canRemember && remember ? RM.applying : R.saving) : humanizeCategory(current || null)}
        </MenuButton>
        <MenuItems anchor="bottom end" className="z-50 w-64 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {canRemember ? (
            <div className="border-b border-gray-100 px-3 py-1.5">
              <label className="flex items-start gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  {fill(RM.rememberLabel, { merchant: merchantLabel })}
                  <span className="mt-0.5 block text-gray-400">{fill(RM.rememberHint, { merchant: merchantLabel })}</span>
                </span>
              </label>
            </div>
          ) : null}
          {categories.map((c) => (
            <MenuItem key={c.id}>
              <button
                type="button"
                onClick={() => pick(c.id)}
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-900 data-[focus]:bg-gray-100"
              >
                {!c.countsAsSpending
                  ? R.excludeOption // WLT-22-5 — the explicit "exclude from spending" target
                  : c.name === current
                    ? fill(RA.categoryOptionCurrent, { category: humanizeCategory(c.name) })
                    : humanizeCategory(c.name)}
              </button>
            </MenuItem>
          ))}
          <MenuItem>
            <button
              type="button"
              onClick={() => {
                setName("");
                setCreateErr(null);
                setCreating(true);
              }}
              className="block w-full border-t border-gray-100 px-3 py-1.5 text-left text-sm font-medium text-gray-700 data-[focus]:bg-gray-100"
            >
              {R.newCategory}
            </button>
          </MenuItem>
        </MenuItems>
      </Menu>
      {creating ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={RA.createForm}
          className="absolute right-0 top-full z-50 mt-1 w-56 space-y-3 rounded-md border border-gray-200 bg-white p-3 text-left shadow-lg"
        >
          <TextField
            label={R.newCategoryNameLabel}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={R.newCategoryNamePlaceholder}
            error={createErr ?? undefined}
            autoFocus
          />
          <fieldset>
            <legend className="text-sm font-medium text-gray-900">{R.kindLabel}</legend>
            <div className="mt-1.5 flex gap-4">
              {(["discretionary", "essential"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input type="radio" name={kindName} checked={kind === k} onChange={() => setKind(k)} />
                  {k === "essential" ? R.kindEssential : R.kindDiscretionary}
                </label>
              ))}
            </div>
          </fieldset>
          {canRemember ? (
            <label className="flex items-start gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5" />
              <span>{fill(RM.rememberLabel, { merchant: merchantLabel })}</span>
            </label>
          ) : null}
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={submitCreate}
              loading={createBusy}
              loadingLabel={R.createSaving}
              className="w-auto px-3 py-1.5"
            >
              {R.createSave}
            </Button>
            <button type="button" onClick={cancelCreate} className="text-sm text-gray-500 underline">
              {R.createCancel}
            </button>
          </div>
        </div>
      ) : null}
      {success ? (
        <span role="status" className="text-right text-xs text-gray-600">
          {success}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-right text-xs text-red-600">
          {error}{" "}
          <button
            type="button"
            onClick={() => (lastPick ? void pick(lastPick) : setError(null))}
            className="underline"
          >
            {RM.retry}
          </button>
        </span>
      ) : null}
    </div>
  );
}
