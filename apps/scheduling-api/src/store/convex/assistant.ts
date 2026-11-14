import { z } from "zod";
import type { AssistantUsagePort, PlatformDocumentsPort } from "../ports-assistant";
import { StoreRefused } from "../types";
import { actorArg } from "./call";
import { Refusal, type Rpc } from "./rpc";

const Got = z.union([
	z.object({ ok: z.literal(true), found: z.literal(false) }),
	z.object({
		ok: z.literal(true),
		found: z.literal(true),
		revision: z.number(),
		body: z.string(),
		updatedAt: z.number(),
		updatedBy: z.string(),
	}),
	Refusal,
]);
const Put = z.union([
	z.object({ ok: z.literal(true), revision: z.number(), updatedAt: z.number() }),
	Refusal,
]);
const Added = z.union([z.object({ ok: z.literal(true) }), Refusal]);
const Counts = z.object({
	messages: z.number(),
	inputTokens: z.number(),
	outputTokens: z.number(),
	cachedTokens: z.number(),
	costMicroUsd: z.number(),
	limitHits: z.number(),
});
const Read = z.union([z.object({ ok: z.literal(true), counts: z.array(Counts) }), Refusal]);

/** The estate's documents over `apiAssistant`: one compare-and-set transaction per save. */
export function platformDocumentsPort(rpc: Rpc): PlatformDocumentsPort {
	return {
		async get(kind) {
			const out = await rpc.query("apiAssistant:getPlatform", { kind }, Got);
			if (!out.ok) throw new StoreRefused(out.reason);
			return out.found
				? {
						revision: out.revision,
						body: out.body,
						updatedAt: out.updatedAt,
						updatedBy: out.updatedBy,
					}
				: undefined;
		},
		async put(kind, expected, body) {
			const out = await rpc.mutation(
				"apiAssistant:putPlatform",
				{ actor: actorArg(), kind, expected, body },
				Put,
			);
			if (!out.ok) throw new StoreRefused(out.reason);
			return { revision: out.revision, updatedAt: out.updatedAt };
		},
	};
}

/** The assistants' meters over `apiAssistant`: a turn's use is added to every meter it counts in, in one transaction. */
export function assistantUsagePort(rpc: Rpc): AssistantUsagePort {
	return {
		async add(app, keys, delta) {
			const out = await rpc.mutation(
				"apiAssistant:addUsage",
				{ tenant: app, keys: [...keys], delta },
				Added,
			);
			if (!out.ok) throw new StoreRefused(out.reason);
		},
		async read(app, keys) {
			const out = await rpc.query("apiAssistant:readUsage", { tenant: app, keys: [...keys] }, Read);
			if (!out.ok) throw new StoreRefused(out.reason);
			return out.counts;
		},
	};
}
