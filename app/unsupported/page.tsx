import { AuthCard } from "@wealth/ui";
import { SignOutButton } from "@/app/components/SignOutButton";
import { COPY } from "@/app/lib/copy";

// Unsupported-browser screen (AC3). Honest block — no fake "continue anyway",
// and (per design) no TOTP promise yet.
export default function UnsupportedPage() {
  return (
    <AuthCard>
      <h1 className="text-xl font-semibold text-gray-900">{COPY.mfaUnsupported.title}</h1>
      <p className="mt-2 text-sm text-gray-600">{COPY.mfaUnsupported.body}</p>
      <div className="mt-6">
        <SignOutButton />
      </div>
    </AuthCard>
  );
}
