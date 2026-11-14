import type { StorePort } from "@psi/scheduling-api/store-types";
import { planReseed, type Step } from "./plan";

export interface ReseedReport {
	app: string;
	steps: Array<{ kind: Step["kind"]; name: string; missing?: string[]; added?: string[] }>;
	/** How many roles were rewritten (0 on a dry run). */
	written: number;
}

const nextOf = (s: Step) =>
	s.kind === "rewrite" ? s.next : s.kind === "not_contained" ? s.next : undefined;

/**
 * Re-seeds the roles of each app in the store into their composed form (the roles each includes, its own keys the rest),
 * keeping what every role holds in the end, the Owner gaining the Owner-only keys. Writes the store only; the
 * authorization tuples follow with `reconcile-authz` (then `--prune`), which adds the inclusion tuples before the flat
 * ones go, so nobody loses a permission in between. Idempotent: a second run finds nothing to write.
 */
export async function reseed(input: {
	store: StorePort;
	apps: ReadonlyArray<string>;
	dryRun: boolean;
	now: number;
	/** Keys new to the seed that the seed roles holding them gain (planReseed). */
	addKeys?: ReadonlyArray<string>;
}): Promise<ReseedReport[]> {
	const out: ReseedReport[] = [];
	for (const app of input.apps) {
		const steps = planReseed(await input.store.c.roles.list(app), input.now, input.addKeys ?? []);
		let written = 0;
		if (!input.dryRun)
			for (const step of steps) {
				const next = nextOf(step);
				if (next !== undefined && (await input.store.c.roles.replace(next))) written += 1;
			}
		out.push({
			app,
			steps: steps.map((s) => ({
				kind: s.kind,
				name: s.kind === "missing" ? s.name : s.role.name,
				...(s.kind === "not_contained" ? { missing: s.missing } : {}),
				...((s.kind === "rewrite" || s.kind === "not_contained") && s.added.length > 0
					? { added: s.added }
					: {}),
			})),
			written,
		});
	}
	return out;
}
