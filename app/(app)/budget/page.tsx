import { requireAal2 } from "@vc1023/passkey-2fa";
import { ComingSoon } from "../_components/ComingSoon";

// WLT-20 — a feature bet replaces this stub + flips the section to 'live' in
// nav.ts (zero shell rework). requireAal2() keeps the route gated (AC3).
export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  await requireAal2();
  return <ComingSoon section="budget" />;
}
