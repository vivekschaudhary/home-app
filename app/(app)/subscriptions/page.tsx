import { requireAal2 } from "@vc1023/passkey-2fa";
import { ComingSoon } from "../_components/ComingSoon";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  await requireAal2();
  return <ComingSoon section="subscriptions" />;
}
