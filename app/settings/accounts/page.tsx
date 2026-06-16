import { redirect } from "next/navigation";

// WLT-20 — Accounts moved to the top-level /accounts inside the app shell.
// Preserve old deep links.
export default function LegacyAccountsRedirect() {
  redirect("/accounts");
}
