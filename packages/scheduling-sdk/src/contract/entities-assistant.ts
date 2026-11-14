import { z } from "zod/v4";
import { Id, Ms, Subject } from "./primitives";

/**
 * The assistants' configuration, in three tiers. The PLATFORM tier (the estate's administrator) sets the defaults every
 * organisation starts from and the ceilings none may pass; the ORGANISATION tier (an app's Owner or Admin) tunes its own
 * assistants within them, with optional overrides per role and per person for the staff assistant. Nothing has to be
 * configured: the built-in defaults below are a working assistant. `orgSettings` and `personSettings`
 * (assistant-merge.ts) are the one merge.
 *
 * Booking by the visitor assistant always asks for the five fields every booking carries (`BOOKING_REQUIRED_FIELDS`:
 * name, age, what is going on, phone and e-mail) and books only on the visitor's yes to the summary: those are the
 * booking's own rules and are not part of this configuration at all, so no tier can switch them off.
 */
export const ASSISTANT_SURFACES = ["staff", "visitor"] as const;
export const AssistantSurface = z.enum(ASSISTANT_SURFACES);
export type AssistantSurfaceName = z.infer<typeof AssistantSurface>;

/** An OpenRouter model slug (`vendor/model`, optionally `:variant`). */
export const ModelSlug = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i)
	.max(120);

export const ASSISTANT_TONES = ["warm", "neutral", "formal"] as const;
export const ASSISTANT_LANGUAGES = ["auto", "ro", "en"] as const;

const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** Prose an organisation writes into the prompt: bounded, never markup the model could mistake for the system's own. */
const PromptText = (max: number) =>
	z
		.string()
		.max(max)
		.refine(
			(s) => !/<\/?(system|data|record-data|tool)[\s>]/i.test(s),
			"no system, data or tool tags",
		);

/** A named instruction pack the model follows when one of its triggers appears, optionally limited to some tools. */
export const AssistantSkill = z.object({
	id: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
	name: z.string().trim().min(1).max(80),
	description: z.string().trim().max(400),
	/** Words or phrases that make the skill apply; empty: it always applies. */
	triggers: z.array(z.string().trim().min(1).max(60)).max(12),
	instructions: PromptText(4_000),
	/** Tool or action ids the skill may use; absent: every tool the person holds. Never more than they hold. */
	tools: z.array(z.string().min(1).max(80)).max(50).optional(),
	surfaces: z.array(AssistantSurface).min(1).max(2),
	enabled: z.boolean(),
});
export type AssistantSkillType = z.infer<typeof AssistantSkill>;

/** Every setting of one surface, whole: what the defaults hold and what the merge returns. */
export const AssistantSettings = z.object({
	enabled: z.boolean(),
	/**
	 * `primary` answers (then `fallbacks`, in order); `summary` writes the short summary a long conversation's older part
	 * is folded into (`memory.compactAfter`): a cheap model, held to the same ceiling list.
	 */
	model: z.object({
		primary: ModelSlug,
		fallbacks: z.array(ModelSlug).max(3),
		summary: ModelSlug,
	}),
	temperature: z.number().min(0).max(1.5),
	/** The longest answer one model call may write; `tokens.perRequest` caps it too (the lower holds). */
	maxOutputTokens: int(256, 16_384),
	/** Tool rounds in one reply; then the reply is written in words. */
	maxToolCalls: int(0, 24),
	/** The most rows one read returns (a page; the next one is asked with its cursor). */
	pageSize: int(5, 100),
	timeouts: z.object({ idleMs: int(5_000, 120_000), totalMs: int(10_000, 300_000) }),
	/** Turns one person (staff) or one visitor key (visitor) may start per minute. */
	ratePerMinute: int(1, 600),
	/** Messages: per conversation, per day per person / visitor / address. */
	messages: z.object({ perSession: int(1, 1_000), perDay: int(1, 10_000) }),
	/**
	 * Tokens. `perRequest`: one turn, prompt and answer of every model call in it together; once a turn reaches it, it
	 * calls no more tools and answers, and no call writes more than it (nor more than `maxOutputTokens`). `perDay` and
	 * `perMonth`: the organisation's, a turn past either is refused.
	 */
	tokens: z.object({
		perRequest: int(1_000, 400_000),
		perDay: int(10_000, 1_000_000_000),
		perMonth: int(10_000, 10_000_000_000),
	}),
	/** The organisation's monthly spend on this surface, in micro-dollars; `hardStop` refuses turns once it is reached. */
	budget: z.object({ monthlyMicroUsd: int(0, 100_000_000_000), hardStop: z.boolean() }),
	prompt: z.object({
		override: PromptText(8_000).optional(),
		append: PromptText(4_000).optional(),
	}),
	tone: z.enum(ASSISTANT_TONES),
	language: z.enum(ASSISTANT_LANGUAGES),
	/** Visitor surface: how far ahead the assistant offers slots, and whether it may offer a call back instead. */
	booking: z.object({ horizonDays: int(1, 90), offerCallback: z.boolean() }),
	handoff: z.object({
		enabled: z.boolean(),
		/** Refusals in one conversation after which the assistant offers a person to talk to. */
		afterRefusals: int(1, 10),
		contact: z.string().trim().max(200).optional(),
	}),
	memory: z.object({
		/** Every message of a conversation is deleted this many days after it was written. */
		retentionDays: int(1, 365),
		/** Messages of the conversation the model reads back. */
		historyMessages: int(2, 50),
		/** Past this many messages the older part is folded into a short summary (by `model.summary`). */
		compactAfter: int(6, 400),
	}),
	/**
	 * `redactPii`: the logs never hold an e-mail address, a phone number or a personal number (what the assistant logs
	 * is a stage and an error, never a message). `keepTranscripts`: each finished turn's question and answer are written
	 * to the app's log as a `transcript` line (redacted when `redactPii`); off, no message text is ever logged.
	 */
	logging: z.object({ redactPii: z.boolean(), keepTranscripts: z.boolean() }),
	/** Read answers kept per person for this long (0: no cache); a change empties it. */
	cacheTtlSeconds: int(0, 600),
});
export type AssistantSettingsType = z.infer<typeof AssistantSettings>;

/** What a tier changes: any part, the rest inherited. */
export const AssistantSettingsPatchSchema = AssistantSettings.extend({
	model: AssistantSettings.shape.model.partial(),
	timeouts: AssistantSettings.shape.timeouts.partial(),
	messages: AssistantSettings.shape.messages.partial(),
	tokens: AssistantSettings.shape.tokens.partial(),
	budget: AssistantSettings.shape.budget.partial(),
	prompt: AssistantSettings.shape.prompt.partial(),
	booking: AssistantSettings.shape.booking.partial(),
	handoff: AssistantSettings.shape.handoff.partial(),
	memory: AssistantSettings.shape.memory.partial(),
	logging: AssistantSettings.shape.logging.partial(),
})
	.partial()
	.strict();
export type AssistantSettingsPatch = z.infer<typeof AssistantSettingsPatchSchema>;

/** What a role or a person may be given apart from the organisation's staff settings: access and their own limits. */
export const AssistantStaffOverride = z
	.object({
		enabled: z.boolean(),
		model: ModelSlug,
		maxToolCalls: int(0, 24),
		messagesPerDay: int(1, 10_000),
		tokensPerRequest: int(1_000, 400_000),
	})
	.partial()
	.strict();
export type AssistantStaffOverrideType = z.infer<typeof AssistantStaffOverride>;

/** The highest any organisation may set; the platform's defaults sit within them too. */
export const AssistantCeilings = z.object({
	models: z.array(ModelSlug).min(1).max(40),
	temperature: z.number().min(0).max(1.5),
	maxOutputTokens: int(256, 16_384),
	maxToolCalls: int(0, 24),
	pageSize: int(5, 100),
	totalMs: int(10_000, 300_000),
	ratePerMinute: int(1, 600),
	messagesPerDay: int(1, 10_000),
	tokensPerRequest: int(1_000, 400_000),
	tokensPerMonth: int(10_000, 10_000_000_000),
	budgetMonthlyMicroUsd: int(0, 100_000_000_000),
	retentionDays: int(1, 365),
	/** True: the logs never keep a person's details, whatever an organisation sets. */
	forceRedaction: z.boolean(),
});
export type AssistantCeilingsType = z.infer<typeof AssistantCeilings>;

export const AssistantPlatformDocument = z.object({
	revision: z.number().int().min(0),
	defaults: z.object({
		staff: AssistantSettingsPatchSchema,
		visitor: AssistantSettingsPatchSchema,
	}),
	ceilings: z.object({ staff: AssistantCeilings, visitor: AssistantCeilings }),
});
export type AssistantPlatformDocumentType = z.infer<typeof AssistantPlatformDocument>;

export const AssistantOrgDocument = z.object({
	revision: z.number().int().min(0),
	staff: AssistantSettingsPatchSchema,
	visitor: AssistantSettingsPatchSchema,
	skills: z.array(AssistantSkill).max(20),
	/** By role id (`owner`, `reception`, …): a person holding several gets the most generous of them. */
	roles: z.record(Id, AssistantStaffOverride),
	/** By sign-in subject: applied after the roles. */
	people: z.record(Subject, AssistantStaffOverride),
});
export type AssistantOrgDocumentType = z.infer<typeof AssistantOrgDocument>;

/** A tier as read: revision 0 and no document is "never saved" (the defaults hold). */
const Stored = <T extends z.ZodType>(doc: T) =>
	z.object({
		revision: z.number().int().min(0),
		doc: doc.optional(),
		updatedAt: Ms.optional(),
		updatedBy: Subject.optional(),
	});

export const AssistantPlatformConfig = Stored(AssistantPlatformDocument);
export const AssistantPlatformPut = z.object({ doc: AssistantPlatformDocument });

export const AssistantUsageMeter = z.object({
	messages: z.number().int().min(0),
	inputTokens: z.number().int().min(0),
	outputTokens: z.number().int().min(0),
	cachedTokens: z.number().int().min(0),
	costMicroUsd: z.number().int().min(0),
	limitHits: z.number().int().min(0),
});
export type AssistantUsageMeterType = z.infer<typeof AssistantUsageMeter>;

/** One surface's meters: the organisation's month and day, and (staff) the caller's own day. */
export const AssistantUsageSurface = z.object({
	month: AssistantUsageMeter,
	day: AssistantUsageMeter,
	mine: AssistantUsageMeter.optional(),
});

export const AssistantUsage = z.object({
	period: z.object({
		month: z.string().regex(/^\d{4}-\d{2}$/),
		day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	}),
	staff: AssistantUsageSurface,
	visitor: AssistantUsageSurface,
});
export type AssistantUsageType = z.infer<typeof AssistantUsage>;

export const AssistantOrgConfig = Stored(AssistantOrgDocument).extend({
	/** What the platform allows, so the form shows the limits it is held to. */
	ceilings: z.object({ staff: AssistantCeilings, visitor: AssistantCeilings }),
	/** What applies now for each surface (before any role or person override). */
	effective: z.object({ staff: AssistantSettings, visitor: AssistantSettings }),
	usage: AssistantUsage,
});
export const AssistantOrgPut = z.object({ doc: AssistantOrgDocument });

/** Why a turn may not start: the switch, or a limit of the organisation or of the person reached. */
export const ASSISTANT_STOPS = [
	"disabled",
	"budget",
	"tokens_month",
	"tokens_day",
	"messages_day",
] as const;
export const AssistantStop = z.enum(ASSISTANT_STOPS);
export type AssistantStopName = z.infer<typeof AssistantStop>;

/** The configuration that governs the caller's next turn, their skills, and whether a limit already stops it. */
export const AssistantEffective = z.object({
	surface: AssistantSurface,
	settings: AssistantSettings,
	skills: z.array(AssistantSkill),
	/** Changes when any tier changes: a cache of anything derived from the configuration keys on it. */
	version: z.string().min(1).max(80),
	stop: AssistantStop.optional(),
	usage: AssistantUsageSurface,
});
export type AssistantEffectiveType = z.infer<typeof AssistantEffective>;

/** What one finished turn used; the service adds it to the organisation's meters and to the caller's own. */
export const AssistantUsageRecord = z.object({
	surface: z.literal("staff"),
	inputTokens: int(0, 2_000_000),
	outputTokens: int(0, 2_000_000),
	cachedTokens: int(0, 2_000_000),
	costMicroUsd: int(0, 5_000_000),
	/** The turn was refused by a limit (counted, so a meter shows how often people hit one). */
	limitHit: z.boolean(),
});
