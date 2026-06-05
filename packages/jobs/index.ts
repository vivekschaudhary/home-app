import { Inngest } from "inngest";

/**
 * Durable-jobs client. Aggregation sync + scheduled anomaly scans run here,
 * off the request path (architecture.md → Reliability fitness function +
 * /packages/jobs boundary). Concrete functions are added per bet.
 */
export const inngest = new Inngest({ id: "wealth-platform" });

export const functions = [];
