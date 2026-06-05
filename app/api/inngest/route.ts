import { serve } from "inngest/next";
import { inngest, functions } from "@wealth/jobs";

// Inngest serve endpoint — the durable-jobs runtime for aggregation sync and
// anomaly scans (kept off the request path per the architecture's Reliability
// fitness function). No functions registered yet; they land per bet.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
