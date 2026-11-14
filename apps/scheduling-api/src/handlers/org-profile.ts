import { OrgProfile, type OrgProfileType, type RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Ctx, HandlersOf } from "../http/context";
import { fail } from "../http/errors";
import { StoreRefused } from "../store/types";
import { must } from "./shared";

type C = Ctx<RouteSpec>;
const KIND = "org_profile";

/** The stored profile as the contract states it: the text is the service's own write, so one that no longer parses is a fault. */
function profileOf(ctx: C, body: string): OrgProfileType {
	const parsed = OrgProfile.safeParse(JSON.parse(body));
	if (!parsed.success) {
		ctx.deps.log({ level: "error", event: "org_profile_unreadable", requestId: ctx.requestId });
		throw fail("internal", "the stored organisation profile cannot be read");
	}
	return parsed.data;
}

/** The names of what a save changed, for the journal: field names only, never a value. */
function changedFields(before: OrgProfileType | undefined, after: OrgProfileType): string[] {
	const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]) as Set<
		keyof OrgProfileType
	>;
	return [...keys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after[k])).sort();
}

export const orgProfileHandlers: HandlersOf<
	"orgProfile.get" | "orgProfile.put" | "visitor.contact"
> = {
	async "orgProfile.get"(ctx) {
		const stored = await ctx.deps.store.docs.get(ctx.app, KIND);
		if (stored === undefined) return { revision: 0 };
		return {
			revision: stored.revision,
			profile: profileOf(ctx, stored.body),
			updatedAt: stored.updatedAt,
			updatedBy: stored.updatedBy,
		};
	},

	async "orgProfile.put"(ctx) {
		const { revision, profile } = ctx.body;
		const held = await ctx.deps.store.docs.get(ctx.app, KIND);
		const before = held === undefined ? undefined : profileOf(ctx, held.body);
		try {
			const saved = await ctx.deps.store.docs.put(ctx.app, KIND, revision, JSON.stringify(profile));
			ctx.note({ revision: saved.revision, fields: changedFields(before, profile) });
			return {
				revision: saved.revision,
				profile,
				updatedAt: saved.updatedAt,
				updatedBy: ctx.subject,
			};
		} catch (error) {
			if (!(error instanceof StoreRefused) || error.reason !== "stale") throw error;
			const now = await ctx.deps.store.docs.get(ctx.app, KIND);
			throw fail("conflict", "the profile was saved by someone else; load it again", {
				reason: "stale",
				revision: now?.revision ?? 0,
			});
		}
	},

	async "visitor.contact"(ctx) {
		const app = await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app");
		const stored = await ctx.deps.store.docs.get(ctx.app, KIND);
		return {
			name: app.name,
			...(stored === undefined ? {} : { profile: profileOf(ctx, stored.body) }),
		};
	},
};
