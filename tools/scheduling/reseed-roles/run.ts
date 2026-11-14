import type { StorePort } from "@psi/scheduling-api/store-types";
import { type Baseline, planReseed, type Step } from "./plan";

export interface ReseedReport {
	app: string;
	steps: Array<{ kind: Step["kind"]; name: string }>;
	/** How many roles were rewritten (0 on a dry run). */
	written: number;
}

/**
 * Re-seeds the roles of each app in the store: every untouched seed role takes its composed form (its own keys and the
 * roles it includes). Writes the store only; the authorization tuples follow with `reconcile-authz` (then `--prune`),
 * which adds the inclusion tuples before the flat ones go, so nobody loses a permission in between. Idempotent: a second
 * run finds every role `current`.
 */
export async function reseed(input: {
	store: StorePort;
	apps: ReadonlyArray<string>;
	baseline: Baseline;
	dryRun: boolean;
	now: number;
}): Promise<ReseedReport[]> {
	const out: ReseedReport[] = [];
	for (const app of input.apps) {
		const steps = planReseed(await input.store.c.roles.list(app), input.baseline, input.now);
		let written = 0;
		if (!input.dryRun)
			for (const step of steps)
				if (step.kind === "rewrite" && (await input.store.c.roles.replace(step.next))) written += 1;
		out.push({
			app,
			steps: steps.map((s) => ({
				kind: s.kind,
				name: s.kind === "missing" ? s.name : s.role.name,
			})),
			written,
		});
	}
	return out;
}
