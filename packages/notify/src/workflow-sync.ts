import { z } from "zod";
import { APP_KEYS } from "./apps";
import { CATALOGUE, workflowId } from "./catalogue";

/** The workflow ids this package serves to the estate's one Novu bridge: every entry of the catalogue, for every app. */
export function servedWorkflowIds(): string[] {
	return APP_KEYS.flatMap((app) =>
		CATALOGUE.map((e) => workflowId(app, e.event, e.audience)),
	).sort();
}

export interface SyncDiff {
	/** Served by the bridge, not (yet) in Novu: the deploy's sync has not run, or ran against an older bridge. */
	missing: string[];
	/** In Novu under one of our apps' prefixes, but no longer served: a removed entry the next sync will delete. */
	stale: string[];
}

/** What the next sync would change: pure, so a deploy can say it before it runs. */
export function diffWorkflows(served: readonly string[], present: readonly string[]): SyncDiff {
	const have = new Set(present);
	const want = new Set(served);
	const ours = (id: string): boolean => APP_KEYS.some((app) => id.startsWith(`${app}-`));
	return {
		missing: served.filter((id) => !have.has(id)),
		stale: present.filter((id) => ours(id) && !want.has(id)),
	};
}

const Page = z.object({
	workflows: z.array(z.object({ workflowId: z.string() })),
	totalCount: z.number().int().nonnegative(),
});

export interface NovuReadOptions {
	apiUrl: string;
	secretKey: string;
	fetch?: typeof globalThis.fetch;
}

/** The workflow ids the Novu environment holds (read-only, paged), for comparing with what the bridge serves. */
export async function presentWorkflowIds(options: NovuReadOptions): Promise<string[]> {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const base = options.apiUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
	const ids: string[] = [];
	for (let offset = 0; ; offset += 100) {
		const res = await doFetch(`${base}/v2/workflows?limit=100&offset=${offset}`, {
			headers: { authorization: `ApiKey ${options.secretKey}`, accept: "application/json" },
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) throw new Error(`Novu answered ${res.status}`);
		const page = Page.parse(await res.json());
		ids.push(...page.workflows.map((w) => w.workflowId));
		if (page.workflows.length === 0 || ids.length >= page.totalCount) return ids;
	}
}
