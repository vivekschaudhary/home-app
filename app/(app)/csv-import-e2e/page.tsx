import { notFound } from "next/navigation";
import { requireAal2 } from "@vc1023/passkey-2fa";
import { CsvImportWizardHarness } from "./harness";

// E2E test harness — not served in production.
// Mounts CsvImportWizard through a real AAL2-gated RSC session before the
// wizard is wired to a production page (WLT-27-5). The (app) layout's
// requireAal2() gates the route; this page adds belt-and-suspenders.

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ accountId?: string; currency?: string }>;

export default async function CsvImportE2EPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  await requireAal2();
  const p = await searchParams;
  return (
    <CsvImportWizardHarness
      accountId={p.accountId ?? "e2e-test-account"}
      currency={p.currency ?? "USD"}
    />
  );
}
