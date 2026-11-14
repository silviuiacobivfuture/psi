import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import {
	ASSISTANT_BUDGET_KEY,
	AssistantOrgDocument,
	type AssistantOrgDocumentType,
	AssistantPlatformDocument,
	type AssistantPlatformDocumentType,
	type AssistantTiers,
	ceilingBreaches,
	ceilingsOf,
	configVersion,
	orgSettings,
	personSettings,
	platformBreaches,
	skillsFor,
	stopFor,
} from "@psi/scheduling-sdk/contract";
import type { z } from "zod/v4";
import type { Ctx, HandlersOf } from "../http/context";
import { fail, forbidden } from "../http/errors";
import type { StoredDocument } from "../store/ports";
import type { UsageCounts, UsageKey } from "../store/ports-assistant";
import { StoreRefused } from "../store/types";
import { limitsChanged } from "./assistant-limits";
import { must } from "./shared";

type C = Ctx<RouteSpec>;

interface Tier<T> {
	revision: number;
	doc?: T;
	updatedAt?: number;
	updatedBy?: string;
}

/** A stored tier as the contract states it: the text is the service's own write, so one that no longer parses is a fault. */
function readTier<T extends { revision: number }>(
	ctx: C,
	stored: StoredDocument | undefined,
	schema: z.ZodType<T>,
	what: string,
): Tier<T> {
	if (stored === undefined) return { revision: 0 };
	const parsed = schema.safeParse(JSON.parse(stored.body));
	if (!parsed.success || parsed.data.revision !== stored.revision) {
		ctx.deps.log({ level: "error", event: `${what}_unreadable`, requestId: ctx.requestId });
		throw fail("internal", `the stored ${what} cannot be read`);
	}
	return {
		revision: stored.revision,
		doc: parsed.data,
		updatedAt: stored.updatedAt,
		updatedBy: stored.updatedBy,
	};
}

const platformTier = async (ctx: C): Promise<Tier<AssistantPlatformDocumentType>> =>
	readTier(
		ctx,
		await ctx.deps.store.platform.get("assistant_platform"),
		AssistantPlatformDocument,
		"assistant_platform",
	);

const orgTier = async (ctx: C): Promise<Tier<AssistantOrgDocumentType>> =>
	readTier(
		ctx,
		await ctx.deps.store.docs.get(ctx.app, "assistant_config"),
		AssistantOrgDocument,
		"assistant_config",
	);

/** The month and the day of `now` in the app's zone: the meters' periods. */
export function periodsOf(now: number, timeZone: string): { month: string; day: string } {
	const day = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	return { month: day.slice(0, 7), day };
}

async function zoneOf(ctx: C): Promise<string> {
	return (await must(ctx.deps.store.c.apps, ctx.app, ctx.app, "app")).timeZone;
}

/** The six meters of the app (each surface's month and day) and, for a person, their own staff day. */
async function meters(ctx: C, subject: string | undefined) {
	const { month, day } = periodsOf(ctx.now, await zoneOf(ctx));
	const keys: UsageKey[] = [
		{ surface: "staff", period: month, scope: "org" },
		{ surface: "staff", period: day, scope: "org" },
		{ surface: "visitor", period: month, scope: "org" },
		{ surface: "visitor", period: day, scope: "org" },
		...(subject === undefined
			? []
			: [{ surface: "staff" as const, period: day, scope: `sub:${subject}` }]),
	];
	const [sm, sd, vm, vd, mine] = await ctx.deps.store.usage.read(ctx.app, keys);
	const zero: UsageCounts = {
		messages: 0,
		inputTokens: 0,
		outputTokens: 0,
		cachedTokens: 0,
		costMicroUsd: 0,
		limitHits: 0,
	};
	return {
		period: { month, day },
		staff: { month: sm ?? zero, day: sd ?? zero, ...(mine === undefined ? {} : { mine }) },
		visitor: { month: vm ?? zero, day: vd ?? zero },
	};
}

async function orgView(ctx: C) {
	const [platform, org] = await Promise.all([platformTier(ctx), orgTier(ctx)]);
	const tiers: AssistantTiers = { platform: platform.doc, org: org.doc };
	const usage = await meters(ctx, undefined);
	return {
		...org,
		ceilings: { staff: ceilingsOf(tiers, "staff"), visitor: ceilingsOf(tiers, "visitor") },
		effective: { staff: orgSettings(tiers, "staff"), visitor: orgSettings(tiers, "visitor") },
		usage,
	};
}

/** A save refused as stale says so with the revision now held, for the form to reload. */
function stale(revision: number): never {
	throw fail("conflict", "the settings were saved by someone else; load them again", {
		reason: "stale",
		revision,
	});
}

export const assistantHandlers: HandlersOf<
	| "assistantPlatform.get"
	| "assistantPlatform.put"
	| "assistantConfig.get"
	| "assistantConfig.put"
	| "assistantUsage.get"
	| "me.assistant"
	| "me.assistantUsage"
> = {
	async "assistantPlatform.get"(ctx) {
		return platformTier(ctx);
	},

	async "assistantPlatform.put"(ctx) {
		const edited = ctx.body.doc.revision;
		const breaches = platformBreaches(ctx.body.doc);
		if (breaches.length > 0)
			throw fail("invalid", "a default passes a ceiling", { fields: breaches });
		const next = { ...ctx.body.doc, revision: edited + 1 };
		try {
			const saved = await ctx.deps.store.platform.put(
				"assistant_platform",
				edited,
				JSON.stringify(next),
			);
			ctx.auditTarget("assistant-platform");
			ctx.note({ revision: saved.revision });
			return {
				revision: saved.revision,
				doc: next,
				updatedAt: saved.updatedAt,
				updatedBy: ctx.subject,
			};
		} catch (error) {
			if (!(error instanceof StoreRefused) || error.reason !== "stale") throw error;
			stale((await ctx.deps.store.platform.get("assistant_platform"))?.revision ?? 0);
		}
	},

	async "assistantConfig.get"(ctx) {
		return orgView(ctx);
	},

	async "assistantConfig.put"(ctx) {
		const edited = ctx.body.doc.revision;
		// The budget and the limits are the Owner's: anyone else may save the rest, never a change to those.
		const held = await orgTier(ctx);
		if (limitsChanged(held.doc, ctx.body.doc) && !(await ctx.canAll(ASSISTANT_BUDGET_KEY)))
			throw forbidden("the assistant's budget and limits are the Owner's", {
				permission: ASSISTANT_BUDGET_KEY,
				reason: "assistant_budget",
			});
		const platform = await platformTier(ctx);
		const breaches = ceilingBreaches(ctx.body.doc, { platform: platform.doc });
		if (breaches.length > 0)
			throw fail("invalid", "a value passes the estate's ceiling", { fields: breaches });
		const next = { ...ctx.body.doc, revision: edited + 1 };
		try {
			const saved = await ctx.deps.store.docs.put(
				ctx.app,
				"assistant_config",
				edited,
				JSON.stringify(next),
			);
			ctx.auditTarget("assistant-config");
			ctx.note({ revision: saved.revision, skills: next.skills.length });
			return orgView(ctx);
		} catch (error) {
			if (!(error instanceof StoreRefused) || error.reason !== "stale") throw error;
			stale((await ctx.deps.store.docs.get(ctx.app, "assistant_config"))?.revision ?? 0);
		}
	},

	async "assistantUsage.get"(ctx) {
		return meters(ctx, undefined);
	},

	async "me.assistant"(ctx) {
		const [platform, org] = await Promise.all([platformTier(ctx), orgTier(ctx)]);
		const tiers: AssistantTiers = { platform: platform.doc, org: org.doc };
		// The roles come from the membership the service holds, never from the caller.
		const member = await ctx.deps.store.c.members.get(ctx.app, ctx.subject);
		const settings = personSettings(tiers, { subject: ctx.subject, roles: member?.roles ?? [] });
		const usage = (await meters(ctx, ctx.subject)).staff;
		const stop = stopFor(settings, usage);
		return {
			surface: "staff" as const,
			settings,
			skills: skillsFor(tiers, "staff"),
			version: configVersion(platform.revision, org.revision),
			...(stop === undefined ? {} : { stop }),
			usage,
		};
	},

	async "me.assistantUsage"(ctx) {
		const { month, day } = periodsOf(ctx.now, await zoneOf(ctx));
		const b = ctx.body;
		await ctx.deps.store.usage.add(
			ctx.app,
			[
				{ surface: "staff", period: month, scope: "org" },
				{ surface: "staff", period: day, scope: "org" },
				{ surface: "staff", period: day, scope: `sub:${ctx.subject}` },
			],
			{
				// A turn refused by a limit is a limit met, not a message.
				messages: b.limitHit ? 0 : 1,
				inputTokens: b.inputTokens,
				outputTokens: b.outputTokens,
				cachedTokens: b.cachedTokens,
				costMicroUsd: b.costMicroUsd,
				limitHits: b.limitHit ? 1 : 0,
			},
		);
		const [platform, org] = await Promise.all([platformTier(ctx), orgTier(ctx)]);
		const member = await ctx.deps.store.c.members.get(ctx.app, ctx.subject);
		const settings = personSettings(
			{ platform: platform.doc, org: org.doc },
			{ subject: ctx.subject, roles: member?.roles ?? [] },
		);
		const stop = stopFor(settings, (await meters(ctx, ctx.subject)).staff);
		return stop === undefined ? {} : { stop };
	},
};
