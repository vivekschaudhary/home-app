import { getFactorStatus, requireAal2 } from "@vc1023/passkey-2fa";
import { SecurityClient } from "./SecurityClient";

export const dynamic = "force-dynamic";

// Security settings — manage second factors. Server-gated to AAL2 (AC1/AC10):
// requireAal2() redirects to /sign-in unless the session is fully verified.
export default async function SecurityPage() {
  const userId = await requireAal2();
  const status = await getFactorStatus(userId);
  return <SecurityClient initialTotpEnrolled={status.totp} />;
}
