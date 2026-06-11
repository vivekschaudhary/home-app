// Durable-jobs barrel. The client lives in ./client (so functions can import it
// without a cycle); this file registers the concrete functions per bet. Served by
// app/api/inngest/route.ts. Off the request path (architecture.md → Reliability).
import {
  aggregationBackfill,
  aggregationRefresh,
  aggregationScheduledRefresh,
} from "./aggregation/sync";

export { inngest } from "./client";
export { CONNECTION_LINKED_EVENT, CONNECTION_REFRESH_EVENT } from "./aggregation/sync";

export const functions = [aggregationBackfill, aggregationRefresh, aggregationScheduledRefresh];
