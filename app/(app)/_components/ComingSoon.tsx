import { COPY } from "@/app/lib/copy";
import { COMING_SOON_TEASER, NAV_SECTIONS } from "../nav";

// The honest placeholder for a not-yet-built section — title + teaser + badge.
// NEVER fabricated data (the real-data principle, extended to features). One
// component, parameterized by section key; server-renderable.
export function ComingSoon({ section }: { section: string }) {
  const nav = NAV_SECTIONS.find((s) => s.key === section);
  const title = nav?.label ?? section;
  const teaser = COMING_SOON_TEASER[section] ?? "";
  const Icon = nav?.icon;
  return (
    <section aria-labelledby="coming-soon-title" className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      {Icon ? <Icon aria-hidden="true" className="h-10 w-10 text-gray-300" /> : null}
      <h1 id="coming-soon-title" className="mt-4 text-xl font-semibold text-gray-900">
        {title}
      </h1>
      {teaser ? <p className="mt-2 text-sm text-gray-600">{teaser}</p> : null}
      <span className="mt-4 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
        {COPY.comingSoon.badge}
      </span>
    </section>
  );
}
