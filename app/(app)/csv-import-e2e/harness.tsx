"use client";

import { useState } from "react";
import { CsvImportWizard } from "@/app/(app)/accounts/CsvImportWizard";

export function CsvImportWizardHarness({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string;
}) {
  const [outcome, setOutcome] = useState<"open" | "done" | "cancelled">("open");

  if (outcome !== "open") {
    return <p data-testid="wizard-outcome">{outcome}</p>;
  }

  return (
    <div className="max-w-lg p-6">
      <CsvImportWizard
        accountId={accountId}
        accountCurrency={currency}
        onDone={() => setOutcome("done")}
        onCancel={() => setOutcome("cancelled")}
      />
    </div>
  );
}
