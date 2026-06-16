"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type NavSection, isActiveNav } from "../nav";

// One nav link. Active = filled + medium weight + aria-current (never color alone).
export function NavItem({ section, onNavigate }: { section: NavSection; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActiveNav(pathname ?? "", section.href);
  const Icon = section.icon;
  return (
    <Link
      href={section.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      <Icon
        aria-hidden="true"
        className={`h-5 w-5 shrink-0 ${active ? "text-gray-900" : "text-gray-400 group-hover:text-gray-600"}`}
      />
      <span className="truncate">{section.label}</span>
    </Link>
  );
}
