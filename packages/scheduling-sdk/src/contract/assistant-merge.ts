import {
	type AssistantCeilingsType,
	type AssistantOrgDocumentType,
	type AssistantPlatformDocumentType,
	AssistantSettings,
	type AssistantSettingsPatch,
	type AssistantSettingsType,
	type AssistantSkillType,
	type AssistantStaffOverrideType,
	type AssistantStopName,
	type AssistantSurfaceName,
	type AssistantUsageMeterType,
} from "./entities-assistant";

/** The model both assistants run on when nobody chose one. */
export const ASSISTANT_DEFAULT_MODEL = "xiaomi/mimo-v2.6-flash";

const COMMON: Omit<
	AssistantSettingsType,
	"maxOutputTokens" | "maxToolCalls" | "ratePerMinute" | "messages" | "temperature" | "timeouts"
> = {
	enabled: true,
	model: { primary: ASSISTANT_DEFAULT_MODEL, fallbacks: [], summary: ASSISTANT_DEFAULT_MODEL },
	pageSize: 25,
	tokens: { perRequest: 120_000, perDay: 20_000_000, perMonth: 300_000_000 },
	// 50 dollars a month, a hard stop: an organisation that needs more raises it, within the platform's ceiling.
	budget: { monthlyMicroUsd: 50_000_000, hardStop: true },
	prompt: {},
	tone: "warm",
	language: "auto",
	booking: { horizonDays: 21, offerCallback: true },
	handoff: { enabled: true, afterRefusals: 2 },
	memory: { retentionDays: 30, historyMessages: 10, compactAfter: 40 },
	logging: { redactPii: true, keepTranscripts: false },
	cacheTtlSeconds: 30,
};

/** What runs when no tier says anything: the assistants exactly as they behave without configuration. */
export const BUILT_IN_SETTINGS: Readonly<Record<AssistantSurfaceName, AssistantSettingsType>> = {
	staff: {
		...COMMON,
		temperature: 0.2,
		maxOutputTokens: 6_144,
		maxToolCalls: 8,
		timeouts: { idleMs: 25_000, totalMs: 90_000 },
		ratePerMinute: 30,
		messages: { perSession: 200, perDay: 400 },
	},
	visitor: {
		...COMMON,
		temperature: 0.5,
		maxOutputTokens: 4_096,
		maxToolCalls: 4,
		timeouts: { idleMs: 20_000, totalMs: 60_000 },
		ratePerMinute: 10,
		messages: { perSession: 40, perDay: 20 },
	},
};

const CEILINGS: AssistantCeilingsType = {
	models: [ASSISTANT_DEFAULT_MODEL],
	temperature: 1,
	maxOutputTokens: 8_192,
	maxToolCalls: 12,
	pageSize: 100,
	totalMs: 180_000,
	ratePerMinute: 120,
	messagesPerDay: 2_000,
	tokensPerRequest: 200_000,
	tokensPerMonth: 1_000_000_000,
	budgetMonthlyMicroUsd: 200_000_000,
	retentionDays: 90,
	forceRedaction: true,
};

/** The estate's ceilings until its administrator saves others. */
export const BUILT_IN_CEILINGS: Readonly<Record<AssistantSurfaceName, AssistantCeilingsType>> = {
	staff: CEILINGS,
	visitor: { ...CEILINGS, messagesPerDay: 200, ratePerMinute: 30 },
};

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/** `patch` laid over `base`, part by part; a part the patch leaves out (or sets undefined) is the base's. */
function overlay(base: Plain, patch: Plain): Plain {
	const out: Plain = { ...base };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) continue;
		const held = out[key];
		out[key] = isPlain(held) && isPlain(value) ? overlay(held, value) : value;
	}
	return out;
}

function laid(
	base: AssistantSettingsType,
	patch: AssistantSettingsPatch | undefined,
): AssistantSettingsType {
	if (patch === undefined) return base;
	return AssistantSettings.parse(overlay(base, patch));
}

/** Every value held within the ceilings: the platform's word is final, whatever a tier stored. */
export function clampToCeilings(
	s: AssistantSettingsType,
	c: AssistantCeilingsType,
): AssistantSettingsType {
	const allowed = (m: string): boolean => c.models.includes(m);
	const fallbacks = s.model.fallbacks.filter(allowed);
	const primary = allowed(s.model.primary)
		? s.model.primary
		: (fallbacks[0] ?? c.models[0] ?? s.model.primary);
	return {
		...s,
		model: {
			primary,
			fallbacks: fallbacks.filter((m) => m !== primary),
			summary: allowed(s.model.summary) ? s.model.summary : primary,
		},
		temperature: Math.min(s.temperature, c.temperature),
		maxOutputTokens: Math.min(s.maxOutputTokens, c.maxOutputTokens),
		maxToolCalls: Math.min(s.maxToolCalls, c.maxToolCalls),
		pageSize: Math.min(s.pageSize, c.pageSize),
		timeouts: {
			totalMs: Math.min(s.timeouts.totalMs, c.totalMs),
			idleMs: Math.min(s.timeouts.idleMs, c.totalMs),
		},
		ratePerMinute: Math.min(s.ratePerMinute, c.ratePerMinute),
		messages: { ...s.messages, perDay: Math.min(s.messages.perDay, c.messagesPerDay) },
		tokens: {
			perRequest: Math.min(s.tokens.perRequest, c.tokensPerRequest),
			perDay: Math.min(s.tokens.perDay, c.tokensPerMonth),
			perMonth: Math.min(s.tokens.perMonth, c.tokensPerMonth),
		},
		budget: {
			...s.budget,
			monthlyMicroUsd: Math.min(s.budget.monthlyMicroUsd, c.budgetMonthlyMicroUsd),
		},
		memory: { ...s.memory, retentionDays: Math.min(s.memory.retentionDays, c.retentionDays) },
		logging: { ...s.logging, redactPii: c.forceRedaction || s.logging.redactPii },
	};
}

export interface AssistantTiers {
	platform?: AssistantPlatformDocumentType | undefined;
	org?: AssistantOrgDocumentType | undefined;
}

export function ceilingsOf(
	tiers: AssistantTiers,
	surface: AssistantSurfaceName,
): AssistantCeilingsType {
	return tiers.platform?.ceilings[surface] ?? BUILT_IN_CEILINGS[surface];
}

/**
 * One surface's settings for an organisation: built-in defaults, then the platform's defaults, then the organisation's
 * own, each a patch over the one before; then clamped to the platform's ceilings.
 */
export function orgSettings(
	tiers: AssistantTiers,
	surface: AssistantSurfaceName,
): AssistantSettingsType {
	const platform = laid(BUILT_IN_SETTINGS[surface], tiers.platform?.defaults[surface]);
	return clampToCeilings(laid(platform, tiers.org?.[surface]), ceilingsOf(tiers, surface));
}

/** Several overrides as one: the most generous of each (a person holding two roles has what either gives). */
function generous(list: ReadonlyArray<AssistantStaffOverrideType>): AssistantStaffOverrideType {
	const max = (k: "maxToolCalls" | "messagesPerDay" | "tokensPerRequest"): number | undefined => {
		const values = list.flatMap((o) => (o[k] === undefined ? [] : [o[k]]));
		return values.length === 0 ? undefined : Math.max(...values);
	};
	const enabled = list.flatMap((o) => (o.enabled === undefined ? [] : [o.enabled]));
	const model = list.find((o) => o.model !== undefined)?.model;
	return {
		...(enabled.length === 0 ? {} : { enabled: enabled.includes(true) }),
		...(model === undefined ? {} : { model }),
		...(max("maxToolCalls") === undefined ? {} : { maxToolCalls: max("maxToolCalls") }),
		...(max("messagesPerDay") === undefined ? {} : { messagesPerDay: max("messagesPerDay") }),
		...(max("tokensPerRequest") === undefined ? {} : { tokensPerRequest: max("tokensPerRequest") }),
	};
}

function applyOverride(
	s: AssistantSettingsType,
	o: AssistantStaffOverrideType,
): AssistantSettingsType {
	return {
		...s,
		...(o.enabled === undefined ? {} : { enabled: s.enabled && o.enabled }),
		...(o.model === undefined ? {} : { model: { ...s.model, primary: o.model } }),
		...(o.maxToolCalls === undefined ? {} : { maxToolCalls: o.maxToolCalls }),
		...(o.messagesPerDay === undefined
			? {}
			: { messages: { ...s.messages, perDay: o.messagesPerDay } }),
		...(o.tokensPerRequest === undefined
			? {}
			: { tokens: { ...s.tokens, perRequest: o.tokensPerRequest } }),
	};
}

export interface AssistantPerson {
	subject: string;
	roles: ReadonlyArray<string>;
}

/**
 * The staff settings for one person: the organisation's, then the most generous of their roles' overrides, then their
 * own; clamped to the ceilings once more. An organisation that switched the assistant off cannot be switched back on by
 * a role or a person.
 */
export function personSettings(
	tiers: AssistantTiers,
	person: AssistantPerson,
): AssistantSettingsType {
	const base = orgSettings(tiers, "staff");
	const byRole = tiers.org?.roles ?? {};
	const roles = generous(
		person.roles.flatMap((r) => {
			const o = byRole[r];
			return o === undefined ? [] : [o];
		}),
	);
	const own = tiers.org?.people[person.subject] ?? {};
	return clampToCeilings(
		applyOverride(applyOverride(base, roles), own),
		ceilingsOf(tiers, "staff"),
	);
}

/** The organisation's skills for a surface that are switched on. */
export function skillsFor(
	tiers: AssistantTiers,
	surface: AssistantSurfaceName,
): Array<AssistantSkillType> {
	return (tiers.org?.skills ?? []).filter((s) => s.enabled && s.surfaces.includes(surface));
}

/** Where a value breaks a ceiling, as `<surface>.<path>`: a save that names any is refused, nothing stored. */
export function ceilingBreaches(
	org: AssistantOrgDocumentType,
	tiers: AssistantTiers,
): Array<string> {
	const out: Array<string> = [];
	for (const surface of ["staff", "visitor"] as const) {
		const c = ceilingsOf(tiers, surface);
		const p = org[surface];
		const over = (path: string, value: number | undefined, max: number): void => {
			if (value !== undefined && value > max) out.push(`${surface}.${path}`);
		};
		for (const m of [p.model?.primary, ...(p.model?.fallbacks ?? []), p.model?.summary])
			if (m !== undefined && !c.models.includes(m)) out.push(`${surface}.model`);
		over("temperature", p.temperature, c.temperature);
		over("maxOutputTokens", p.maxOutputTokens, c.maxOutputTokens);
		over("maxToolCalls", p.maxToolCalls, c.maxToolCalls);
		over("pageSize", p.pageSize, c.pageSize);
		over("timeouts.totalMs", p.timeouts?.totalMs, c.totalMs);
		over("ratePerMinute", p.ratePerMinute, c.ratePerMinute);
		over("messages.perDay", p.messages?.perDay, c.messagesPerDay);
		over("tokens.perRequest", p.tokens?.perRequest, c.tokensPerRequest);
		over("tokens.perMonth", p.tokens?.perMonth, c.tokensPerMonth);
		over("budget.monthlyMicroUsd", p.budget?.monthlyMicroUsd, c.budgetMonthlyMicroUsd);
		over("memory.retentionDays", p.memory?.retentionDays, c.retentionDays);
		if (c.forceRedaction && p.logging?.redactPii === false)
			out.push(`${surface}.logging.redactPii`);
	}
	const staff = ceilingsOf(tiers, "staff");
	for (const [where, o] of [
		...Object.entries(org.roles).map(([k, v]) => [`roles.${k}`, v] as const),
		...Object.entries(org.people).map(([k, v]) => [`people.${k}`, v] as const),
	]) {
		if (o.model !== undefined && !staff.models.includes(o.model)) out.push(`${where}.model`);
		if (o.maxToolCalls !== undefined && o.maxToolCalls > staff.maxToolCalls)
			out.push(`${where}.maxToolCalls`);
		if (o.messagesPerDay !== undefined && o.messagesPerDay > staff.messagesPerDay)
			out.push(`${where}.messagesPerDay`);
		if (o.tokensPerRequest !== undefined && o.tokensPerRequest > staff.tokensPerRequest)
			out.push(`${where}.tokensPerRequest`);
	}
	const ids = org.skills.map((s) => s.id);
	if (new Set(ids).size !== ids.length) out.push("skills.id");
	return [...new Set(out)];
}

/** The platform's own defaults must sit within its ceilings, or no organisation could start inside them. */
export function platformBreaches(doc: AssistantPlatformDocumentType): Array<string> {
	return ceilingBreaches(
		{
			revision: 0,
			staff: doc.defaults.staff,
			visitor: doc.defaults.visitor,
			skills: [],
			roles: {},
			people: {},
		},
		{ platform: doc },
	);
}

export const ZERO_METER: AssistantUsageMeterType = {
	messages: 0,
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	costMicroUsd: 0,
	limitHits: 0,
};

const tokensOf = (m: AssistantUsageMeterType): number => m.inputTokens + m.outputTokens;

/**
 * Whether a limit already stops the next turn, in the order a person should hear it: switched off, the money, the
 * organisation's tokens for the month, then for the day, then the person's own messages for the day.
 */
export function stopFor(
	s: AssistantSettingsType,
	usage: {
		month: AssistantUsageMeterType;
		day: AssistantUsageMeterType;
		mine?: AssistantUsageMeterType | undefined;
	},
): AssistantStopName | undefined {
	if (!s.enabled) return "disabled";
	if (s.budget.hardStop && usage.month.costMicroUsd >= s.budget.monthlyMicroUsd) return "budget";
	if (tokensOf(usage.month) >= s.tokens.perMonth) return "tokens_month";
	if (tokensOf(usage.day) >= s.tokens.perDay) return "tokens_day";
	if (usage.mine !== undefined && usage.mine.messages >= s.messages.perDay) return "messages_day";
	return undefined;
}

/** A short fingerprint of the tiers' revisions: equal while nothing was saved. */
export function configVersion(platformRevision: number, orgRevision: number): string {
	return `p${platformRevision}.o${orgRevision}`;
}
