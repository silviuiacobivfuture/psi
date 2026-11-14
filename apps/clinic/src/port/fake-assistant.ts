import {
	type AssistantOrgDocumentType,
	type AssistantPlatformDocumentType,
	type AssistantUsageMeterType,
	ceilingBreaches,
	ceilingsOf,
	configVersion,
	orgSettings,
	personSettings,
	platformBreaches,
	skillsFor,
	stopFor,
	ZERO_METER,
} from "@psi/scheduling-sdk/contract";
import { todayIso } from "../lib/dates";
import { type ClinicPort, PortError } from "./port";
import type { AppSlug } from "./schema";

type Part = Pick<
	ClinicPort,
	| "assistantEffective"
	| "recordAssistantUsage"
	| "assistantConfig"
	| "saveAssistantConfig"
	| "assistantPlatform"
	| "saveAssistantPlatform"
	| "callRoute"
>;

interface Held<T> {
	revision: number;
	doc?: T;
	updatedAt?: number;
	updatedBy?: string;
}

const add = (a: AssistantUsageMeterType, b: AssistantUsageMeterType): AssistantUsageMeterType => ({
	messages: a.messages + b.messages,
	inputTokens: a.inputTokens + b.inputTokens,
	outputTokens: a.outputTokens + b.outputTokens,
	cachedTokens: a.cachedTokens + b.cachedTokens,
	costMicroUsd: a.costMicroUsd + b.costMicroUsd,
	limitHits: a.limitHits + b.limitHits,
});

/**
 * The assistants' tiers and meters of the development fake, merged by the contract's own functions (the service's
 * rules, not a copy of them). It ignores who asks, as the rest of the fake does; the console's gates decide who may
 * open the screens. No route can be called by id without the real service.
 */
export function createFakeAssistant(actor: () => string): Part {
	let platform: Held<AssistantPlatformDocumentType> = { revision: 0 };
	const orgs = new Map<AppSlug, Held<AssistantOrgDocumentType>>();
	const meters = new Map<string, AssistantUsageMeterType>();
	const month = (): string => todayIso().slice(0, 7);
	const meter = (key: string): AssistantUsageMeterType => meters.get(key) ?? ZERO_METER;
	const usageOf = (app: AppSlug) => ({
		period: { month: month(), day: todayIso() },
		staff: { month: meter(`${app}|staff|${month()}`), day: meter(`${app}|staff|${todayIso()}`) },
		visitor: {
			month: meter(`${app}|visitor|${month()}`),
			day: meter(`${app}|visitor|${todayIso()}`),
		},
	});
	const tiers = (app: AppSlug) => ({ platform: platform.doc, org: orgs.get(app)?.doc });
	const view = (app: AppSlug) => {
		const t = tiers(app);
		return {
			...(orgs.get(app) ?? { revision: 0 }),
			ceilings: { staff: ceilingsOf(t, "staff"), visitor: ceilingsOf(t, "visitor") },
			effective: { staff: orgSettings(t, "staff"), visitor: orgSettings(t, "visitor") },
			usage: usageOf(app),
		};
	};
	const effective = (app: AppSlug) => {
		const settings = personSettings(tiers(app), { subject: actor(), roles: [] });
		const usage = { ...usageOf(app).staff, mine: meter(`${app}|staff|${todayIso()}|${actor()}`) };
		const stop = stopFor(settings, usage);
		return {
			surface: "staff" as const,
			settings,
			skills: skillsFor(tiers(app), "staff"),
			version: configVersion(platform.revision, orgs.get(app)?.revision ?? 0),
			...(stop === undefined ? {} : { stop }),
			usage,
		};
	};
	return {
		assistantEffective: async (app) => effective(app),
		async recordAssistantUsage(app, u) {
			const delta = {
				messages: 1,
				inputTokens: u.inputTokens,
				outputTokens: u.outputTokens,
				cachedTokens: u.cachedTokens,
				costMicroUsd: u.costMicroUsd,
				limitHits: u.limitHit ? 1 : 0,
			};
			for (const key of [
				`${app}|staff|${month()}`,
				`${app}|staff|${todayIso()}`,
				`${app}|staff|${todayIso()}|${actor()}`,
			])
				meters.set(key, add(meter(key), delta));
			return effective(app).stop;
		},
		assistantConfig: async (app) => view(app),
		async saveAssistantConfig(app, doc) {
			const held = orgs.get(app)?.revision ?? 0;
			if (doc.revision !== held) throw new PortError("conflict", "stale");
			if (ceilingBreaches(doc, { platform: platform.doc }).length > 0)
				throw new PortError("invalid", "a value passes a ceiling");
			orgs.set(app, {
				revision: held + 1,
				doc: { ...doc, revision: held + 1 },
				updatedAt: Date.now(),
				updatedBy: actor(),
			});
			return view(app);
		},
		assistantPlatform: async () => platform,
		async saveAssistantPlatform(doc) {
			if (doc.revision !== platform.revision) throw new PortError("conflict", "stale");
			if (platformBreaches(doc).length > 0)
				throw new PortError("invalid", "a default passes a ceiling");
			const revision = platform.revision + 1;
			platform = { revision, doc: { ...doc, revision }, updatedAt: Date.now(), updatedBy: actor() };
			return platform;
		},
		callRoute: async (routeId) => {
			throw new PortError(
				"not-available-yet",
				`${routeId}: the development fake has no service to call`,
			);
		},
	};
}
