import { COPY } from "@/app/lib/copy";
import { NAV_SECTIONS } from "../nav";
import { AccountMenu } from "./AccountMenu";
import { NavItem } from "./NavItem";

// The nav surface — reused by the desktop fixed sidebar AND the mobile drawer.
// `onNavigate` lets the drawer close when a nav item is tapped.
export function Sidebar({ email, onNavigate }: { email?: string | null; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-4 bg-white p-4">
      <div className="px-2 pt-1 text-sm font-semibold text-gray-900">{COPY.shell.brand}</div>
      <nav aria-label={COPY.shell.navLabel} className="flex flex-1 flex-col gap-1">
        {NAV_SECTIONS.map((s) => (
          <NavItem key={s.key} section={s} onNavigate={onNavigate} />
        ))}
      </nav>
      <AccountMenu email={email} />
    </div>
  );
}
