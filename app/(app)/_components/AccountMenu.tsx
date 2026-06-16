"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@vc1023/passkey-2fa/client";
import { COPY } from "@/app/lib/copy";

// Bottom-of-nav account control: email → Security + Sign out (Headless UI Menu —
// roving focus, Esc + click-away close). Sign-out reuses the package helper,
// same as app/components/SignOutButton.tsx.
export function AccountMenu({ email }: { email?: string | null }) {
  const router = useRouter();

  async function onSignOut() {
    await signOut();
    router.push("/sign-in");
  }

  return (
    <Menu as="div" className="relative">
      <MenuButton
        aria-label={COPY.a11y.accountMenu}
        title={email ?? undefined}
        className="flex w-full items-center rounded-md border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
      >
        <span className="truncate">{email ?? COPY.a11y.accountMenu}</span>
      </MenuButton>
      <MenuItems
        anchor="top start"
        className="z-50 w-56 rounded-md border border-gray-200 bg-white p-1 shadow-lg focus:outline-none"
      >
        <MenuItem>
          <Link
            href="/settings/security"
            className="block rounded px-3 py-2 text-sm text-gray-700 data-[focus]:bg-gray-100"
          >
            {COPY.account.security}
          </Link>
        </MenuItem>
        <MenuItem>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="block w-full rounded px-3 py-2 text-left text-sm text-gray-700 data-[focus]:bg-gray-100"
          >
            {COPY.account.signOut}
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
