"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { useId, useRef, useState } from "react";
import { humanizeCategory } from "@wealth/core";
import { Button, TextField } from "@wealth/ui";
import type { CategoryDTO } from "@/app/lib/budget-client";
import { COPY } from "@/app/lib/copy";

// WLT-22-2 — per-line-item recategorize control. Opens a keyboard-navigable menu
// of the user's categories (current marked); "+ New category" reveals an inline
// create-form. The save is async — the TRIGGER shows the saving/error state and
// the item keeps its prior category until a save succeeds (no optimistic revert).

const R = COPY.budgetRecat;
const RA = COPY.budgetRecatA11y;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export type RecatResult = { ok: true } | { ok: false; error: "invalid" | "server" | "network" };
export type CreateResult =
  | { ok: true; category: CategoryDTO }
  | { ok: false; error: "invalid" | "duplicate" | "server" | "network" };

export function CategoryPicker({
  current,
  merchant,
  amount,
  categories,
  onPick,
  onCreate,
}: {
  current: string; // the resolved current category name ("" = "Other")
  merchant: string; // for the trigger's accessible name (merchant or description)
  amount: string; // formatted, for the trigger's accessible name
  categories: CategoryDTO[];
  onPick: (categoryId: string) => Promise<RecatResult>;
  onCreate: (name: string, kind: "essential" | "discretionary") => Promise<CreateResult>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPick, setLastPick] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"essential" | "discretionary">("discretionary");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const kindName = useId();

  async function pick(categoryId: string) {
    setSaving(true);
    setError(null);
    setLastPick(categoryId);
    const res = await onPick(categoryId);
    setSaving(false);
    if (!res.ok) {
      setError(res.error === "network" ? R.errorNetwork : res.error === "invalid" ? R.errorInvalid : R.error);
    }
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

  if (creating) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-2" aria-label={RA.createForm}>
        <TextField
          label={R.newCategoryNameLabel}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={R.newCategoryNamePlaceholder}
          error={createErr ?? undefined}
          autoFocus
        />
        <fieldset className="mt-2">
          <legend className="text-xs font-medium text-gray-700">{R.kindLabel}</legend>
          <div className="mt-1 flex gap-3">
            {(["discretionary", "essential"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1 text-sm text-gray-700">
                <input type="radio" name={kindName} checked={kind === k} onChange={() => setKind(k)} />
                {k === "essential" ? R.kindEssential : R.kindDiscretionary}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-2 flex gap-2">
          <Button onClick={submitCreate} loading={createBusy} loadingLabel={R.createSaving} className="w-auto px-3 py-1.5">
            {R.createSave}
          </Button>
          <Button variant="secondary" onClick={cancelCreate} className="w-auto px-3 py-1.5">
            {R.createCancel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Menu as="div" className="relative inline-block text-left">
        <MenuButton
          ref={triggerRef}
          disabled={saving}
          aria-busy={saving || undefined}
          aria-label={fill(RA.openPicker, { merchant, amount, category: humanizeCategory(current || null) })}
          className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-60"
        >
          {saving ? R.saving : humanizeCategory(current || null)}
        </MenuButton>
        <MenuItems anchor="bottom end" className="z-50 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {categories.map((c) => (
            <MenuItem key={c.id}>
              <button
                type="button"
                onClick={() => pick(c.id)}
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-900 data-[focus]:bg-gray-100"
              >
                {c.name === current
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
      {error ? (
        <span role="alert" className="text-xs text-red-600">
          {error}{" "}
          <button
            type="button"
            onClick={() => (lastPick ? void pick(lastPick) : setError(null))}
            className="underline"
          >
            {R.retry}
          </button>
        </span>
      ) : null}
    </div>
  );
}
