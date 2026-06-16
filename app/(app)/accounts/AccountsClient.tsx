"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { AccountCard, Banner, Button, ConfirmDialog, Toast } from "@wealth/ui";
import {
  type AggError,
  type ConnectionView,
  completeLink,
  disconnectConnection,
  fetchConnections,
  startLink,
} from "@/app/lib/aggregation-client";
import { COPY } from "@/app/lib/copy";
import { isImporting, statusFor } from "./import-state";

function errorCopy(e: AggError): string {
  switch (e) {
    case "cancelled":
      return COPY.aggregationErrors.cancelled;
    case "institutionUnavailable":
      return COPY.aggregationErrors.institutionUnavailable;
    case "network":
      return COPY.aggregationErrors.network;
    default:
      return COPY.aggregationErrors.server;
  }
}

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function AccountsClient({ initialConnections }: { initialConnections: ConnectionView[] }) {
  const [connections, setConnections] = useState<ConnectionView[]>(initialConnections);
  const [consentOpen, setConsentOpen] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<ConnectionView | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const refresh = useCallback(async () => {
    setConnections(await fetchConnections());
  }, []);

  // Reconcile with the live server state on mount (#36). This page is
  // force-dynamic and changes out-of-band — the connect modal, background sync —
  // and Next can hand a STALE prefetched payload (e.g. cached while the user had
  // no accounts, before connecting). Without this, an empty/stale initial render
  // persists on navigate-back and never recovers; trusting `initialConnections`
  // forever is the bug. The server render stays the fast first paint; this
  // guarantees correctness.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // While ANY connection is still in its import window, poll so transactions +
  // the settled state surface. Server-derived (created_at) → this resumes after
  // navigating away and back, not just for the session that connected (AC7).
  const anyImporting = connections.some(isImporting);
  useEffect(() => {
    if (!anyImporting) return;
    const t = setInterval(() => {
      void refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [anyImporting, refresh]);

  const onPlaidSuccess = useCallback(
    async (publicToken: string) => {
      setLinkToken(null);
      setBusy(true);
      const res = await completeLink(publicToken);
      setBusy(false);
      if (!res.ok) {
        setError(errorCopy(res.error));
        return;
      }
      setError(null);
      setToast(COPY.connect.success);
      // The new connection is in its import window → the polling effect takes over.
      await refresh();
    },
    [refresh],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken) => {
      void onPlaidSuccess(publicToken);
    },
    onExit: (err) => {
      setLinkToken(null);
      setError(err ? COPY.aggregationErrors.institutionUnavailable : COPY.aggregationErrors.cancelled);
    },
  });

  // Plaid Link is unwrapped — open the provider's own modal once the token is ready.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function beginConnect() {
    setConsentOpen(false);
    setError(null);
    setBusy(true);
    const res = await startLink();
    setBusy(false);
    if (!res.ok) {
      setError(errorCopy(res.error));
      return;
    }
    setLinkToken(res.clientToken);
  }

  async function confirmDisconnect() {
    const target = disconnectTarget;
    if (!target) return;
    setDisconnectTarget(null);
    setConnections((cs) => cs.filter((c) => c.connectionId !== target.connectionId)); // optimistic
    const ok = await disconnectConnection(target.connectionId);
    if (!ok) {
      setError(COPY.aggregationErrors.server);
      await refresh();
    }
  }

  const hasAccounts = connections.some((c) => c.accounts.length > 0) || connections.length > 0;

  return (
    <div>
      {/* WLT-20: rendered inside the app shell — the shell provides nav/chrome. */}
      <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-gray-900 outline-none">
        {COPY.accounts.title}
      </h1>

      <section className="mt-6 space-y-4">
        {error ? <Banner variant="error">{error}</Banner> : null}

        {!hasAccounts ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
            <h2 className="text-base font-semibold text-gray-900">{COPY.accounts.emptyTitle}</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">{COPY.accounts.emptyBody}</p>
            <div className="mx-auto mt-5 max-w-xs">
              <Button onClick={() => setConsentOpen(true)} loading={busy} loadingLabel={COPY.connect.preparing}>
                {COPY.accounts.emptyCta}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {connections.flatMap((conn) => {
                const { status, label } = statusFor(conn);
                return conn.accounts.map((a) => (
                  <AccountCard
                    key={a.id}
                    institutionName={conn.institutionName}
                    accountName={a.name}
                    kind={a.kind}
                    mask={a.mask}
                    balance={a.balanceCurrent}
                    status={status}
                    statusLabel={label}
                    lastSyncedLabel={
                      conn.lastSyncedAt
                        ? COPY.accounts.rowLastSynced.replace("{time}", relativeTime(conn.lastSyncedAt))
                        : null
                    }
                    ariaLabel={`${conn.institutionName ?? a.name} ${a.kind}${a.mask ? ` ending in ${a.mask}` : ""} — ${label}${a.balanceCurrent ? `, balance ${a.balanceCurrent}` : ""}`}
                    action={
                      <button
                        type="button"
                        onClick={() => setDisconnectTarget(conn)}
                        className="text-xs font-medium text-gray-500 underline hover:text-gray-700"
                      >
                        {COPY.accounts.disconnect}
                      </button>
                    }
                  />
                ));
              })}
            </ul>
            {anyImporting ? (
              <p aria-live="polite" className="text-sm text-gray-500">
                {COPY.accounts.importingNote}
              </p>
            ) : null}
            <div className="max-w-xs">
              <Button
                variant="secondary"
                onClick={() => setConsentOpen(true)}
                loading={busy}
                loadingLabel={COPY.connect.preparing}
              >
                {COPY.accounts.addAnother}
              </Button>
            </div>
          </>
        )}
      </section>

      {consentOpen ? (
        <ConsentDialog onConfirm={beginConnect} onCancel={() => setConsentOpen(false)} busy={busy} />
      ) : null}

      <ConfirmDialog
        open={disconnectTarget !== null}
        title={COPY.disconnectConfirm.title}
        body={COPY.disconnectConfirm.body}
        confirmLabel={COPY.disconnectConfirm.cta}
        cancelLabel={COPY.disconnectConfirm.cancel}
        onConfirm={confirmDisconnect}
        onCancel={() => setDisconnectTarget(null)}
      />

      {toast ? <Toast message={toast} /> : null}
    </div>
  );
}

// Explicit consent before the Plaid modal opens (the highest-trust screen).
// Custom (not ConfirmDialog) because it carries structured what/why/retention.
function ConsentDialog({
  onConfirm,
  onCancel,
  busy,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl outline-none"
      >
        <h2 id="consent-title" className="text-lg font-semibold text-gray-900">
          {COPY.consent.title}
        </h2>
        <p className="mt-2 text-sm text-gray-600">{COPY.consent.body}</p>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-gray-900">{COPY.consent.accessHeading}</dt>
            <dd className="mt-1">
              <ul className="list-disc space-y-0.5 pl-5 text-gray-600">
                <li>{COPY.consent.accessItem1}</li>
                <li>{COPY.consent.accessItem2}</li>
              </ul>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">{COPY.consent.whyHeading}</dt>
            <dd className="mt-1 text-gray-600">{COPY.consent.whyBody}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">{COPY.consent.retentionHeading}</dt>
            <dd className="mt-1 text-gray-600">{COPY.consent.retentionBody}</dd>
          </div>
        </dl>

        <div className="mt-6 flex gap-3">
          <Button onClick={onConfirm} loading={busy} loadingLabel={COPY.connect.preparing}>
            {COPY.consent.cta}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {COPY.consent.notNow}
          </Button>
        </div>
      </div>
    </div>
  );
}
