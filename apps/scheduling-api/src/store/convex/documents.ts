import { z } from "zod";
import type { DocumentsPort } from "../ports";
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

/** Documents over `apiDocuments`: the save is one compare-and-set transaction in the store. */
export function documentsPort(rpc: Rpc): DocumentsPort {
	return {
		async get(app, kind) {
			const out = await rpc.query("apiDocuments:get", { tenant: app, kind }, Got);
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
		async put(app, kind, expected, body) {
			const out = await rpc.mutation(
				"apiDocuments:put",
				{ tenant: app, actor: actorArg(), kind, expected, body },
				Put,
			);
			if (!out.ok) throw new StoreRefused(out.reason);
			return { revision: out.revision, updatedAt: out.updatedAt };
		},
	};
}
