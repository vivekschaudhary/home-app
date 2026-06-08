// Browser-side calls to the aggregation routes. Types are duplicated (not
// imported from @wealth/aggregation) so no server code leaks into the client bundle.

export interface AccountView {
  id: string;
  name: string;
  kind: string;
  mask: string | null;
  balanceCurrent: string | null;
  balanceAvailable: string | null;
  balanceUpdatedAt: string | null;
}

export interface ConnectionView {
  connectionId: string;
  provider: string;
  institutionName: string | null;
  healthStatus: string;
  lastSyncedAt: string | null;
  accounts: AccountView[];
}

export type AggError = "cancelled" | "institutionUnavailable" | "network" | "server";

export async function startLink(): Promise<
  { ok: true; clientToken: string } | { ok: false; error: AggError }
> {
  try {
    const res = await fetch("/api/aggregation/link/start", { method: "POST" });
    if (!res.ok) return { ok: false, error: "server" };
    const data = (await res.json()) as { clientToken?: string };
    if (!data.clientToken) return { ok: false, error: "server" };
    return { ok: true, clientToken: data.clientToken };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function completeLink(
  publicToken: string,
): Promise<{ ok: true; connectionId: string } | { ok: false; error: AggError }> {
  try {
    const res = await fetch("/api/aggregation/link/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicToken }),
    });
    if (!res.ok) return { ok: false, error: "server" };
    const data = (await res.json()) as { connectionId?: string };
    if (!data.connectionId) return { ok: false, error: "server" };
    return { ok: true, connectionId: data.connectionId };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function fetchConnections(): Promise<ConnectionView[]> {
  try {
    const res = await fetch("/api/aggregation/connections");
    if (!res.ok) return [];
    const data = (await res.json()) as { connections?: ConnectionView[] };
    return data.connections ?? [];
  } catch {
    return [];
  }
}

export async function disconnectConnection(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/aggregation/connections/${id}/disconnect`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}
