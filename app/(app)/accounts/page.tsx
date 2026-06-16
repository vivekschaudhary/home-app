import { requireAal2 } from "@vc1023/passkey-2fa";
import { handlers } from "@/app/lib/aggregation";
import { AccountsClient } from "./AccountsClient";

export const dynamic = "force-dynamic";

// Accounts — connect a bank + see connected accounts. AAL2-gated server-side
// (requireAal2 redirects to /sign-in unless the session is fully verified).
export default async function AccountsPage() {
  const userId = await requireAal2();
  const connections = await handlers.connectionsList({ userId });
  return <AccountsClient initialConnections={connections} />;
}
