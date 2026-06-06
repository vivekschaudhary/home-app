import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { SignUpFlow } from "./SignUpFlow";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  // Funnel entry (AC10). user_id is null pre-account; feeds the TTFV clock.
  await emitFunnel(FUNNEL_EVENTS.SIGNUP_STARTED, null);
  return <SignUpFlow />;
}
