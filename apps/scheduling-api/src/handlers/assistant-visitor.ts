import {
	type AssistantTiers,
	configVersion,
	orgSettings,
	type RouteSpec,
	skillsFor,
	stopFor,
} from "@psi/scheduling-sdk/contract";
import type { Ctx, HandlersOf } from "../http/context";
import { forbidden } from "../http/errors";
import { meters, orgTier, periodsOf, platformTier, zoneOf } from "./assistant";

type C = Ctx<RouteSpec>;

/**
 * The organisation's visitor assistant is its site's server's to read and meter: a service key (the pipeline already
 * held it to its own app), never a signed-in visitor, who would otherwise read the team's settings or move its meters.
 */
function siteOnly(ctx: C): void {
	if (ctx.principal.kind !== "service")
		throw forbidden("only the site's server reads and meters its assistant", {
			reason: "site_only",
		});
}

/** What governs the next visitor turn, from the stored tiers and the meters as they stand. */
async function governing(ctx: C) {
	const [platform, org] = await Promise.all([platformTier(ctx), orgTier(ctx)]);
	const tiers: AssistantTiers = { platform: platform.doc, org: org.doc };
	const settings = orgSettings(tiers, "visitor");
	const usage = (await meters(ctx, undefined)).visitor;
	const stop = stopFor(settings, usage);
	return {
		surface: "visitor" as const,
		settings,
		skills: skillsFor(tiers, "visitor"),
		version: configVersion(platform.revision, org.revision),
		...(stop === undefined ? {} : { stop }),
		usage,
	};
}

export const visitorAssistantHandlers: HandlersOf<"visitor.assistant" | "visitor.assistantUsage"> =
	{
		async "visitor.assistant"(ctx) {
			siteOnly(ctx);
			return governing(ctx);
		},

		async "visitor.assistantUsage"(ctx) {
			siteOnly(ctx);
			const { month, day } = periodsOf(ctx.now, await zoneOf(ctx));
			await ctx.deps.store.usage.add(
				ctx.app,
				[
					{ surface: "visitor", period: month, scope: "org" },
					{ surface: "visitor", period: day, scope: "org" },
				],
				ctx.body,
			);
			const { stop } = await governing(ctx);
			return stop === undefined ? {} : { stop };
		},
	};
