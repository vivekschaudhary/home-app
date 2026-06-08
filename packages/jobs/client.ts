import { Inngest } from "inngest";

/**
 * Durable-jobs client. Lives in its own module so functions can import it
 * without a circular dependency on the package barrel (which registers them).
 */
export const inngest = new Inngest({ id: "wealth-platform" });
