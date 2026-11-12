import { z } from "zod";
import { ModelIdSchema } from "./model";

/**
 * How a profile converses, as its owner tunes it at runtime (psi: the CMS's "Comportamentul AI"
 * studio): the conversation style, the team's own notes, the topics, the contact route, the model
 * and its creativity, and a few lines of copy. None of it reaches the safety rules: crisis, the
 * limits, injection, abuse, PII, scope and the claims check are the engine's and the profile's,
 * always on, and the team's notes sit in a delimited section the model is told ranks below them.
 */
export interface ConversationStyle {
	warmth: "low" | "medium" | "high";
	length: "short" | "medium" | "long";
	/** The T-V distinction where a language has one (Romanian „tu” / „dumneavoastră”). */
	formality: "informal" | "formal";
	followUps: "never" | "sometimes" | "often";
}

/** The style the bundled packs and psi's profiles were written in before it was tunable. */
export const DEFAULT_STYLE: ConversationStyle = {
	warmth: "high",
	length: "medium",
	formality: "informal",
	followUps: "sometimes",
};

export type ContactRoute = "phone" | "contact" | "booking";
export type Creativity = "precise" | "balanced" | "creative";

/** The answering model's temperature per creativity step; `balanced` is the engine's default. */
export const CREATIVITY_TEMPERATURE: Readonly<Record<Creativity, number>> = {
	precise: 0.2,
	balanced: 0.5,
	creative: 0.8,
};

/** The copy lines the engine itself may say, per locale. */
export interface BehaviourCopy {
	/** Replaces the profile's `unknown` line ("not on our site"). */
	unknown?: string;
	/** The team's redirect for an out-of-scope question, given to the model as its wording. */
	outOfScope?: string;
}

export interface TurnBehaviour {
	style: ConversationStyle;
	/** The team's own instructions, in the delimited section after the rules (max 1500). */
	extraInstructions: string;
	focusTopics: ReadonlyArray<string>;
	avoidTopics: ReadonlyArray<string>;
	/** Undefined: the profile's own next steps. */
	contactRoute?: ContactRoute;
	/** An OpenRouter slug; undefined: the engine's model. */
	model?: string;
	creativity: Creativity;
	copy: Readonly<Record<string, BehaviourCopy>>;
}

export const DEFAULT_BEHAVIOUR: TurnBehaviour = {
	style: DEFAULT_STYLE,
	extraInstructions: "",
	focusTopics: [],
	avoidTopics: [],
	creativity: "balanced",
	copy: {},
};

export const EXTRA_INSTRUCTIONS_LIMIT = 1500;
const LINE_LIMIT = 600;
const TOPIC_LIMIT = 60;
const TOPICS_LIMIT = 12;

const Obj = z.record(z.unknown());
const pick = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown, fallback: T): T => {
	const r = schema.safeParse(raw);
	return r.success ? r.data : fallback;
};
const Line = z.string().trim().min(1).max(LINE_LIMIT);
const Topic = z.string().trim().min(1).max(TOPIC_LIMIT);

function topics(raw: unknown): ReadonlyArray<string> {
	const list = z.array(z.unknown()).safeParse(raw);
	if (!list.success) return [];
	return list.data
		.map((t) => Topic.safeParse(t))
		.flatMap((t) => (t.success ? [cleanNote(t.data, TOPIC_LIMIT)] : []))
		.filter((t) => t !== "")
		.slice(0, TOPICS_LIMIT);
}

function copyOf(raw: unknown): Readonly<Record<string, BehaviourCopy>> {
	const o = Obj.safeParse(raw);
	if (!o.success) return {};
	const out: Record<string, BehaviourCopy> = {};
	for (const [locale, value] of Object.entries(o.data)) {
		const v = Obj.safeParse(value);
		if (!v.success) continue;
		const unknown = Line.safeParse(v.data.unknown);
		const outOfScope = Line.safeParse(v.data.outOfScope);
		out[locale] = {
			...(unknown.success ? { unknown: unknown.data } : {}),
			...(outOfScope.success ? { outOfScope: cleanNote(outOfScope.data, LINE_LIMIT) } : {}),
		};
	}
	return out;
}

/**
 * A behaviour from what a settings provider returned (the CMS's `behaviour` group), field by
 * field: anything missing or unreadable is that field's default. Never throws. Unknown keys
 * (the copy a site renders itself, a version number) are ignored.
 */
export function readBehaviour(raw: unknown): TurnBehaviour {
	const o = Obj.safeParse(raw);
	if (!o.success) return DEFAULT_BEHAVIOUR;
	const r = o.data;
	const s = Obj.safeParse(r.style);
	const style = s.success ? s.data : {};
	const d = DEFAULT_STYLE;
	const route = z.enum(["phone", "contact", "booking"]).safeParse(r.contactRoute);
	const model = ModelIdSchema.safeParse(r.model);
	return {
		style: {
			warmth: pick(z.enum(["low", "medium", "high"]), style.warmth, d.warmth),
			length: pick(z.enum(["short", "medium", "long"]), style.length, d.length),
			formality: pick(z.enum(["informal", "formal"]), style.formality, d.formality),
			followUps: pick(z.enum(["never", "sometimes", "often"]), style.followUps, d.followUps),
		},
		extraInstructions: cleanNote(
			typeof r.extraInstructions === "string" ? r.extraInstructions : "",
			EXTRA_INSTRUCTIONS_LIMIT,
		),
		focusTopics: topics(r.focusTopics),
		avoidTopics: topics(r.avoidTopics),
		...(route.success ? { contactRoute: route.data } : {}),
		...(model.success ? { model: model.data } : {}),
		creativity: pick(z.enum(["precise", "balanced", "creative"]), r.creativity, "balanced"),
		copy: copyOf(r.copy),
	};
}

/** The section markers around the team's notes: never accepted inside the notes themselves. */
export const NOTES_MARKER = /={3,}|-{3,}|<{2,}|>{2,}|\[\/?(?:echipa|team|notes?|note)\]/gi;

/**
 * The team's free text, made safe to place inside its delimited section: no section marker (so
 * it can never close the section and speak as the rules), no control characters, at most two
 * blank lines in a row, trimmed to `limit`.
 */
export function cleanNote(text: string, limit: number): string {
	return (
		text
			.normalize("NFC")
			// biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point.
			.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁤]/g, "")
			.replace(NOTES_MARKER, " ")
			.replace(/\n{3,}/g, "\n\n")
			.trim()
			.slice(0, limit)
			.trim()
	);
}

/** True when the style is the default one: the prompt is then exactly the profile's own. */
export function isDefaultStyle(style: ConversationStyle): boolean {
	return (
		style.warmth === DEFAULT_STYLE.warmth &&
		style.length === DEFAULT_STYLE.length &&
		style.formality === DEFAULT_STYLE.formality &&
		style.followUps === DEFAULT_STYLE.followUps
	);
}
