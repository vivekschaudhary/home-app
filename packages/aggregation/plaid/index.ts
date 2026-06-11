// Plaid adapter — the ONLY module that imports the `plaid` SDK. Implements the
// provider-neutral AggregationProvider seam. Selected at runtime via the registry;
// the core never imports this file. Per-environment secret (PLAID_ENV picks
// sandbox vs production), matching the separate-secret-per-env Plaid model.

import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "plaid";
import type { AggregationProvider, FetchTransactionsPage } from "../core/provider";
import { mapAccount, mapTransaction } from "./map";

export function plaidClient(): PlaidApi {
  const env = (process.env.PLAID_ENV ?? "sandbox").toLowerCase();
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret =
    env === "production" ? process.env.PLAID_PRODUCTION_SECRET : process.env.PLAID_SANDBOX_SECRET;
  if (!clientId || !secret) {
    throw new Error("[plaid] missing PLAID_CLIENT_ID or PLAID_{SANDBOX,PRODUCTION}_SECRET");
  }
  const basePath = env === "production" ? PlaidEnvironments.production : PlaidEnvironments.sandbox;
  return new PlaidApi(
    new Configuration({
      basePath,
      baseOptions: { headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret } },
    }),
  );
}

function plaidErrorCode(e: unknown): string | undefined {
  return (e as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
}

export function createPlaidProvider(): AggregationProvider {
  return {
    id: "plaid",

    async createLinkSession({ userId, redirectUri }) {
      const webhook = process.env.PLAID_WEBHOOK_URL;
      const res = await plaidClient().linkTokenCreate({
        user: { client_user_id: userId },
        client_name: "Wealth at Your Fingertips",
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        language: "en",
        // Request the full 24-month history (Transactions ceiling); the default is 90d.
        transactions: { days_requested: 730 },
        // Real-time sync: Plaid posts SYNC_UPDATES_AVAILABLE / ITEM webhooks here.
        ...(webhook ? { webhook } : {}),
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      });
      return { clientToken: res.data.link_token, expiresAt: res.data.expiration };
    },

    async completeLink({ publicToken }) {
      const ex = await plaidClient().itemPublicTokenExchange({ public_token: publicToken });
      const accessSecret = ex.data.access_token;
      const providerConnectionId = ex.data.item_id;
      const institution: { id: string | null; name: string | null } = { id: null, name: null };
      try {
        const item = await plaidClient().itemGet({ access_token: accessSecret });
        const instId = item.data.item.institution_id ?? null;
        institution.id = instId;
        if (instId) {
          const inst = await plaidClient().institutionsGetById({
            institution_id: instId,
            country_codes: [CountryCode.Us],
          });
          institution.name = inst.data.institution.name ?? null;
        }
      } catch {
        // institution metadata is best-effort; the link still succeeds
      }
      return { providerConnectionId, accessSecret, institution };
    },

    async fetchAccounts({ accessSecret }) {
      const res = await plaidClient().accountsGet({ access_token: accessSecret });
      return res.data.accounts
        .map(mapAccount)
        .filter((a): a is NonNullable<typeof a> => a !== null);
    },

    async fetchTransactions({ accessSecret, cursor }) {
      const res = await plaidClient().transactionsSync({
        access_token: accessSecret,
        ...(cursor ? { cursor } : {}),
      });
      const d = res.data;
      return {
        added: d.added.map(mapTransaction),
        modified: d.modified.map(mapTransaction),
        removed: d.removed
          .map((r) => r.transaction_id)
          .filter((x): x is string => Boolean(x)),
        nextCursor: d.next_cursor,
        hasMore: d.has_more,
      } satisfies FetchTransactionsPage;
    },

    async getConnectionStatus({ accessSecret }) {
      try {
        await plaidClient().accountsGet({ access_token: accessSecret });
        return "active";
      } catch (e) {
        return plaidErrorCode(e) === "ITEM_LOGIN_REQUIRED" ? "needs_reauth" : "error";
      }
    },

    async removeConnection({ accessSecret }) {
      try {
        await plaidClient().itemRemove({ access_token: accessSecret });
      } catch {
        // idempotent — already-removed / invalid token is a no-op
      }
    },
  };
}
