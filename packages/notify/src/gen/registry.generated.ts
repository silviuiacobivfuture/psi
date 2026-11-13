// The estate's novu-bridge imports this exact path from every catalogue package it is given
// (NOVU_BRIDGE_CATALOGUES, apps/novu-bridge/src/catalogue-packages.ts in SEB). Unlike SEB's catalogue
// packages it is hand-written: psi's workflows are code (src/workflows.ts), not generated from YAML.
import { APP_KEYS } from "../apps";
import { workflowsOf } from "../workflows";

/** The shape SEB's `RegistryEntry` has: the catalogue's app, and the workflows its bridge serves. */
export const RUNTIME = APP_KEYS.map((app) => ({
	catalog: { app, events: {}, silent: {}, categories: [] as string[] },
	workflows: () => workflowsOf(app),
}));
