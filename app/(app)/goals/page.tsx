import { requireAal2 } from "@vc1023/passkey-2fa";
import { ComingSoon } from "../_components/ComingSoon";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  await requireAal2();
  return <ComingSoon section="goals" />;
}
