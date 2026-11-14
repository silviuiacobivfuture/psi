import { z } from "zod";
import { DateSchema, IdSchema, StaffLocaleSchema } from "./model";
import { REFUSAL_CODES } from "./port";

/**
 * The screens the console tells the assistant about, so it answers about what is open and offers
 * the right suggestions. Only ids: the assistant reads the record through the person's own token.
 */
export const STAFF_SCREENS = [
	"calendar",
	"clients",
	"client",
	"appointment",
	"packages",
	"roster",
	"requests",
	"reminders",
	"settings",
	"other",
] as const;
export type StaffScreen = (typeof STAFF_SCREENS)[number];

export const StaffPageSchema = z
	.object({
		screen: z.enum(STAFF_SCREENS),
		clientId: IdSchema.optional(),
		appointmentId: IdSchema.optional(),
		/** The room, device or person column open (the floor plan, a calendar column). */
		resourceId: IdSchema.optional(),
		date: DateSchema.optional(),
	})
	.strict();
export type StaffPage = z.infer<typeof StaffPageSchema>;

export const MAX_MESSAGE_LENGTH = 2_000;

/** What the console posts for one turn. */
export const StaffTurnInputSchema = z
	.object({
		message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
		threadId: z
			.string()
			.regex(/^[A-Za-z0-9_-]{1,64}$/)
			.optional(),
		page: StaffPageSchema.optional(),
	})
	.strict();
export type StaffTurnInput = z.infer<typeof StaffTurnInputSchema>;

const Line = z.object({ label: z.string(), value: z.string() });
export type CardLine = z.infer<typeof Line>;

const TONES = ["neutral", "good", "warn", "bad"] as const;
const Tone = z.enum(TONES);
export type Tone = z.infer<typeof Tone>;

const Row = z.object({
	title: z.string(),
	subtitle: z.string().optional(),
	badge: z.string().optional(),
	tone: Tone.optional(),
	href: z.string().optional(),
});
export type CardRow = z.infer<typeof Row>;

/**
 * What a tool result looks like on screen. Cards are built from the tool's own data, never from
 * the model's words, and carry text already in the person's language: the renderer adds none.
 */
export const StaffCardSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("agenda"),
		title: z.string(),
		rows: z.array(Row),
		empty: z.string(),
	}),
	z.object({
		kind: z.literal("client"),
		title: z.string(),
		lines: z.array(Line),
		note: z.string().optional(),
		href: z.string().optional(),
	}),
	z.object({
		kind: z.literal("slots"),
		title: z.string(),
		/** `ask` is sent as the person's next message when the slot is chosen. */
		slots: z.array(z.object({ label: z.string(), detail: z.string(), ask: z.string() })),
		empty: z.string(),
	}),
	z.object({
		kind: z.literal("list"),
		title: z.string(),
		rows: z.array(Row),
		empty: z.string(),
	}),
	z.object({
		kind: z.literal("stats"),
		title: z.string(),
		metrics: z.array(z.object({ label: z.string(), value: z.string(), tone: Tone.optional() })),
	}),
	z.object({
		kind: z.literal("proposal"),
		proposalId: z.string(),
		title: z.string(),
		lines: z.array(Line),
		destructive: z.boolean(),
		expiresAt: z.number().int(),
	}),
	z.object({
		kind: z.literal("result"),
		proposalId: z.string(),
		ok: z.boolean(),
		title: z.string(),
		lines: z.array(Line),
		links: z.array(z.object({ label: z.string(), href: z.string() })),
		/** What undoes it: a prepared proposal the person confirms with one more press. */
		undo: z.object({ proposalId: z.string(), label: z.string() }).optional(),
	}),
	/** Several people or things match: each option is tappable and sends `ask` as the next message. */
	z.object({
		kind: z.literal("choices"),
		title: z.string(),
		options: z.array(
			z.object({ label: z.string(), detail: z.string().optional(), ask: z.string() }),
		),
	}),
	/** The day at a glance: sections of items, each with a one-tap follow-up. */
	z.object({
		kind: z.literal("briefing"),
		title: z.string(),
		sections: z.array(
			z.object({
				title: z.string(),
				tone: Tone,
				items: z.array(z.object({ text: z.string(), ask: z.string().optional() })),
			}),
		),
		clear: z.string().optional(),
	}),
]);
export type StaffCard = z.infer<typeof StaffCardSchema>;

export const TURN_REFUSALS = [
	"no_principal",
	"rate_limited",
	/** The same message, in the same conversation, a moment ago: a double press, answered once. */
	"duplicate",
	"invalid",
	"unavailable",
	"language",
	/** The organisation (or its role or person settings) switched the assistant off. */
	"disabled",
	/** The organisation's monthly budget is spent and its settings stop there. */
	"budget",
	/** The organisation's tokens for the day or the month are used up. */
	"tokens",
	/** The person's own messages for the day are used up. */
	"messages_day",
	/** This conversation reached its length; a new one starts fresh. */
	"session_limit",
] as const;
export type TurnRefusal = (typeof TURN_REFUSALS)[number];

/** One step of a streamed turn. Every stream ends with exactly one `done`. */
export type StaffEvent =
	| { type: "thinking" }
	/** A tool is running or finished: the chip shows what the assistant is doing. */
	| {
			type: "tool";
			callId: string;
			tool: string;
			phase: "running" | "done" | "refused";
			label: string;
	  }
	| { type: "text"; delta: string }
	| { type: "replace"; text: string }
	| { type: "card"; card: StaffCard }
	| { type: "refusal"; reason: TurnRefusal }
	| { type: "done" };

export const ConfirmInputSchema = z.object({ proposalId: z.string().min(1).max(80) }).strict();

export const ConfirmStatusSchema = z.enum([
	"done",
	"unknown",
	"expired",
	"already_done",
	"stale",
	"no_principal",
	"audit_failed",
	...REFUSAL_CODES,
]);
export type ConfirmStatus = z.infer<typeof ConfirmStatusSchema>;

export { StaffLocaleSchema };
