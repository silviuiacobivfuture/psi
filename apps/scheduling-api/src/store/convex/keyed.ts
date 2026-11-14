import { z } from "zod";
import type { KeyedPort } from "../ports";
import { StoreRefused } from "../types";
import { Refusal, type Rpc } from "./rpc";

const Entry = z.object({
	key: z.string(),
	body: z.string(),
	revision: z.number(),
	updatedAt: z.number(),
});
const Got = z.union([
	z.object({ ok: z.literal(true), found: z.literal(false) }),
	z.object({ ok: z.literal(true), found: z.literal(true) }).extend(Entry.omit({ key: true }).shape),
	Refusal,
]);
const Put = z.union([
	z.object({ ok: z.literal(true), revision: z.number(), updatedAt: z.number() }),
	Refusal,
]);
const Listed = z.union([z.object({ ok: z.literal(true), entries: z.array(Entry) }), Refusal]);
const Removed = z.union([z.object({ ok: z.literal(true), removed: z.boolean() }), Refusal]);

/** The engagement store over `apiKeyed`: the save is one compare-and-set transaction in the store. */
export function keyedPort(rpc: Rpc): KeyedPort {
	return {
		async get(app, ns, key) {
			const out = await rpc.query("apiKeyed:get", { tenant: app, ns, entry: key }, Got);
			if (!out.ok) throw new StoreRefused(out.reason);
			return out.found
				? { key, body: out.body, revision: out.revision, updatedAt: out.updatedAt }
				: undefined;
		},
		async put(app, ns, key, expected, body) {
			const out = await rpc.mutation(
				"apiKeyed:put",
				{ tenant: app, ns, entry: key, expected, body },
				Put,
			);
			if (!out.ok) throw new StoreRefused(out.reason);
			return { revision: out.revision, updatedAt: out.updatedAt };
		},
		async list(app, ns, options) {
			const out = await rpc.query(
				"apiKeyed:list",
				{ tenant: app, ns, prefix: options?.prefix ?? "", limit: options?.limit ?? 200 },
				Listed,
			);
			if (!out.ok) throw new StoreRefused(out.reason);
			return out.entries;
		},
		async remove(app, ns, key) {
			const out = await rpc.mutation("apiKeyed:remove", { tenant: app, ns, entry: key }, Removed);
			if (!out.ok) throw new StoreRefused(out.reason);
			return out.removed;
		},
	};
}
