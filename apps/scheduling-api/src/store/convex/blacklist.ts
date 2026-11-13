import { z } from "zod";
import type { BlacklistPort } from "../ports";
import { StoreRefused } from "../types";
import { actorArg } from "./call";
import { Refusal, type Rpc } from "./rpc";

const Category = z.enum(["no_show_repeated", "unpaid", "abusive", "duplicate", "other"]);
const Severity = z.enum(["warn", "block_online", "block_all"]);
const MatchedBy = z.enum(["client", "phone", "email"]);

const Entry = z.object({
	id: z.string(),
	client: z.string().optional(),
	phone: z.string().optional(),
	email: z.string().optional(),
	name: z.string().optional(),
	reason: z.string(),
	category: Category,
	severity: Severity,
	active: z.boolean(),
	expiresAt: z.number().optional(),
	createdBy: z.string(),
	createdAt: z.number(),
	updatedBy: z.string(),
	updatedAt: z.number(),
	version: z.number(),
});
/** A refusal with what it carries: the field names a bad entry got wrong, or the twin an entry duplicates. */
const Refused = z.object({
	ok: z.literal(false),
	reason: z.string(),
	problems: z.array(z.string()).optional(),
	id: z.string().optional(),
});
const Created = z.union([z.object({ ok: z.literal(true), id: z.string() }), Refused]);
const Changed = z.union([
	z.object({ ok: z.literal(true), changed: z.boolean(), version: z.number() }),
	Refused,
]);
const Done = z.union([z.object({ ok: z.literal(true) }), Refusal]);
const One = z.union([z.object({ ok: z.literal(true), entry: Entry }), Refusal]);
const Many = z.union([z.object({ ok: z.literal(true), entries: z.array(Entry) }), Refusal]);
const Check = z.union([
	z.object({
		ok: z.literal(true),
		hit: z
			.object({
				entry: z.string(),
				severity: Severity,
				category: Category,
				reason: z.string(),
				matchedBy: MatchedBy,
				matched: z.array(MatchedBy),
				nameAgrees: z.boolean(),
			})
			.nullable(),
	}),
	Refusal,
]);
const Events = z.union([
	z.object({
		ok: z.literal(true),
		events: z.array(
			z.object({
				id: z.string(),
				at: z.number(),
				kind: z.enum(["online_refused", "overridden"]),
				entry: z.string(),
				severity: Severity,
				category: Category,
				matchedBy: MatchedBy,
				channel: z.enum(["form", "guide", "callback", "staff"]),
				actor: z.string().optional(),
				authority: z.enum(["ack", "staff", "admin"]).optional(),
				overrideReason: z.string().optional(),
				subject: z.string().optional(),
			}),
		),
	}),
	Refusal,
]);

function refusal(out: z.infer<typeof Refused>): StoreRefused {
	return new StoreRefused(out.reason, {
		...(out.problems === undefined ? {} : { problems: out.problems }),
		...(out.id === undefined ? {} : { id: out.id }),
	});
}

/** What is given, without the fields left out: the wrappers read an absent field and an undefined one differently. */
const defined = (o: object): Record<string, unknown> =>
	Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** The blacklist over `apiBlacklist`: the wrappers do the matching, the limits and the audit in the transaction of the write. */
export function blacklistPort(rpc: Rpc): BlacklistPort {
	return {
		async list(app, includeInactive) {
			const out = await rpc.query("apiBlacklist:list", { tenant: app, includeInactive }, Many);
			if (!out.ok) throw new StoreRefused(out.reason);
			return out.entries;
		},
		async get(app, id) {
			const out = await rpc.query("apiBlacklist:get", { tenant: app, entry: id }, One);
			if (out.ok) return out.entry;
			if (out.reason === "not_found") return undefined;
			throw new StoreRefused(out.reason);
		},
		async create(app, input, limit) {
			const out = await rpc.mutation(
				"apiBlacklist:create",
				{ tenant: app, actor: actorArg(), entry: defined(input), limit },
				Created,
			);
			if (!out.ok) throw refusal(out);
			return { id: out.id };
		},
		async update(app, id, patch, clear, expectedVersion, limit) {
			const out = await rpc.mutation(
				"apiBlacklist:update",
				{
					tenant: app,
					actor: actorArg(),
					entry: id,
					patch: defined(patch),
					clear,
					limit,
					...(expectedVersion === undefined ? {} : { expectedVersion }),
				},
				Changed,
			);
			if (!out.ok) throw refusal(out);
			return { changed: out.changed, version: out.version };
		},
		async remove(app, id) {
			const out = await rpc.mutation(
				"apiBlacklist:remove",
				{ tenant: app, actor: actorArg(), entry: id },
				Done,
			);
			if (!out.ok) throw new StoreRefused(out.reason);
		},
		async check(app, who) {
			const out = await rpc.query("apiBlacklist:check", { tenant: app, ...defined(who) }, Check);
			if (!out.ok) throw new StoreRefused(out.reason);
			return out.hit;
		},
		async screen(app, channel, contact) {
			const out = await rpc.mutation(
				"apiBlacklist:screen",
				{ tenant: app, channel, contact: defined(contact) },
				Done,
			);
			if (out.ok) return false;
			if (out.reason === "unavailable_online") return true;
			throw new StoreRefused(out.reason);
		},
		async events(app, query) {
			const out = await rpc.query(
				"apiBlacklist:events",
				{ tenant: app, ...defined(query) },
				Events,
			);
			if (!out.ok) throw new StoreRefused(out.reason);
			return out.events;
		},
	};
}
