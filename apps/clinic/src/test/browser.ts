import { createRequire } from "node:module";

export { AXE_RUN, launch, ViolationsSchema } from "@psi/ui/browser-testing";

/** The clinic's own axe-core build (its version is pinned in this app's package.json). */
export const AXE_SOURCE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
