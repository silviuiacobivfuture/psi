import { resolve } from "node:path";

/**
 * Where the integration tests find the local Convex backend. The defaults are the shared
 * `psi-convex` on 3210 with its secrets in `<repo>/.data/convex`; a session that must not touch
 * that one starts its own (`PSI_CONVEX_NAME`, `PSI_CONVEX_PORT`, `PSI_CONVEX_DATA`, README).
 */
export const CONVEX_DATA =
	process.env.PSI_CONVEX_DATA ?? resolve(import.meta.dirname, "../../../../.data/convex");
export const CONVEX_URL =
	process.env.CONVEX_URL ?? `http://127.0.0.1:${process.env.PSI_CONVEX_PORT ?? "3210"}`;
