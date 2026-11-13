import type { HandlersOf } from "../http/context";
import { forbidden, notFound } from "../http/errors";
import type { BlacklistRow } from "../store/ports";
import { StoreRefused } from "../store/types";

/** `severity_not_allowed` is the caller's role being too weak for what they asked: a refusal of permission, not of input. */
async function asked<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof StoreRefused && error.reason === "severity_not_allowed")
			throw forbidden("the role may flag at warn level only", { permission: "blacklist_create" });
		throw error;
	}
}

const out = (row: BlacklistRow) => row;

export const blacklistHandlers: HandlersOf<
	| "blacklist.check"
	| "blacklist.events"
	| "blacklist.list"
	| "blacklist.create"
	| "blacklist.get"
	| "blacklist.update"
	| "blacklist.remove"
> = {
	async "blacklist.list"(ctx) {
		const rows = await ctx.deps.store.blacklist.list(ctx.app, ctx.query.includeInactive === "true");
		return { items: rows.sort((a, b) => b.createdAt - a.createdAt).map(out) };
	},

	async "blacklist.create"(ctx) {
		// Creating at any severity needs `blacklist_create`; `blacklist_create_warn` alone flags at warn level.
		const held = await ctx.authorizeAny(
			["blacklist_create", "blacklist_create_warn"],
			"sched_role",
			ctx.app,
		);
		const limit = held.includes("blacklist_create") ? "any" : "warn_only";
		const { id } = await asked(() => ctx.deps.store.blacklist.create(ctx.app, ctx.body, limit));
		ctx.note({ severity: ctx.body.severity, category: ctx.body.category });
		const row = await ctx.deps.store.blacklist.get(ctx.app, id);
		if (row === undefined) throw notFound("entry");
		return out(row);
	},

	async "blacklist.get"(ctx) {
		const row = await ctx.deps.store.blacklist.get(ctx.app, String(ctx.params.id));
		if (row === undefined) throw notFound("entry");
		return out(row);
	},

	async "blacklist.update"(ctx) {
		const { clear, expectedVersion, ...patch } = ctx.body;
		const id = String(ctx.params.id);
		const done = await ctx.deps.store.blacklist.update(
			ctx.app,
			id,
			patch,
			clear ?? [],
			expectedVersion,
			"any",
		);
		ctx.note({ changed: Object.keys(ctx.body), version: done.version });
		const row = await ctx.deps.store.blacklist.get(ctx.app, id);
		if (row === undefined) throw notFound("entry");
		return { entry: out(row), changed: done.changed };
	},

	async "blacklist.remove"(ctx) {
		await ctx.deps.store.blacklist.remove(ctx.app, String(ctx.params.id));
		return { ok: true as const };
	},

	async "blacklist.check"(ctx) {
		return { hit: await ctx.deps.store.blacklist.check(ctx.app, ctx.query) };
	},

	async "blacklist.events"(ctx) {
		return { items: await ctx.deps.store.blacklist.events(ctx.app, ctx.query) };
	},
};
