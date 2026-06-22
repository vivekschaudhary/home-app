// WLT-20 — the app shell's single source of truth (the "mounting contract").
// Drives the sidebar, the active state, AND the <ComingSoon> stubs. A feature
// bet "mounts" by flipping its section status coming_soon → live and dropping in
// a real page — zero shell rework.
import type { ComponentType, SVGProps } from "react";
import {
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  BuildingLibraryIcon,
  ChartPieIcon,
  FlagIcon,
  HomeIcon,
  QueueListIcon,
  ScaleIcon,
} from "@heroicons/react/24/outline";
import { COPY } from "@/app/lib/copy";

export type NavStatus = "live" | "coming_soon";

export interface NavSection {
  key: string;
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  status: NavStatus;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  { key: "dashboard", label: COPY.nav.dashboard, href: "/dashboard", icon: HomeIcon, status: "live" },
  { key: "budget", label: COPY.nav.budget, href: "/budget", icon: ChartPieIcon, status: "live" },
  { key: "goals", label: COPY.nav.goals, href: "/goals", icon: FlagIcon, status: "coming_soon" },
  { key: "debt", label: COPY.nav.debt, href: "/debt", icon: ScaleIcon, status: "coming_soon" },
  { key: "investments", label: COPY.nav.investments, href: "/investments", icon: ArrowTrendingUpIcon, status: "coming_soon" },
  { key: "subscriptions", label: COPY.nav.subscriptions, href: "/subscriptions", icon: ArrowPathIcon, status: "live" }, // WLT-24-1
  // WLT-23-1 — the all-accounts ledger; adjacent to Accounts (the activity *in* them).
  { key: "transactions", label: COPY.nav.transactions, href: "/transactions", icon: QueueListIcon, status: "live" },
  { key: "accounts", label: COPY.nav.accounts, href: "/accounts", icon: BuildingLibraryIcon, status: "live" },
];

/** The coming-soon teaser for a section key (the <ComingSoon> body). */
export const COMING_SOON_TEASER: Record<string, string> = {
  budget: COPY.comingSoon.budget,
  goals: COPY.comingSoon.goals,
  debt: COPY.comingSoon.debt,
  investments: COPY.comingSoon.investments,
  subscriptions: COPY.comingSoon.subscriptions,
};

/** Active when the path equals the href or is nested under it (e.g. /accounts/x). */
export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
