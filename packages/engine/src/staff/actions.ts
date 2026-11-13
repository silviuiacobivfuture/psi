import { z } from "zod";

/**
 * One thing the console's action registry lets the person do, as the assistant reads it. The
 * registry owns what exists and who may do it; the assistant only ever sees what the person's own
 * capabilities allow, discovers it with `staffListActions` and runs it with `staffRunAction`
 * (a write only after the person confirmed the card).
 */
export const ActionParamSchema = z.object({
	name: z.string().min(1).max(60),
	label: z.string().max(120),
	kind: z.enum(["text", "number", "date", "time", "id", "choice", "boolean"]),
	required: z.boolean(),
	choices: z.array(z.string().max(80)).max(40).optional(),
	description: z.string().max(200).optional(),
});
export type ActionParam = z.infer<typeof ActionParamSchema>;

export const ActionInfoSchema = z.object({
	id: z
		.string()
		.min(3)
		.max(80)
		.regex(/^[a-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$/),
	label: z.string().min(1).max(120),
	summary: z.string().max(300),
	/** The area it belongs to ("clients", "calendar"), for grouping. */
	group: z.string().max(40).optional(),
	kind: z.enum(["read", "write"]),
	destructive: z.boolean(),
	params: z.array(ActionParamSchema).max(20),
});
export type ActionInfo = z.infer<typeof ActionInfoSchema>;

/** What an action came to: a sentence in the person's language, data for the model, a place to go. */
export const ActionOutcomeSchema = z.object({
	summary: z.string().max(500),
	data: z.unknown().optional(),
	href: z.string().max(300).optional(),
});
export type ActionOutcome = z.infer<typeof ActionOutcomeSchema>;

const MARKS = /[̀-ͯ]/g;
const SMALL = new Set([
	"de",
	"la",
	"cu",
	"pe",
	"in",
	"un",
	"o",
	"si",
	"sa",
	"the",
	"a",
	"an",
	"to",
	"of",
	"for",
]);

function words(text: string): Array<string> {
	return text
		.normalize("NFD")
		.replace(MARKS, "")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length > 2 && !SMALL.has(w));
}

/** The first letters two words must share to count as the same word ("creeaza", "creare"). */
const STEM = 5;

/**
 * The actions a sentence is about: those whose label or summary shares a word (by its first
 * letters) with it, best match first. Used to tell the person "this exists", never to run one.
 */
export function matchActions(
	actions: ReadonlyArray<ActionInfo>,
	text: string,
): ReadonlyArray<ActionInfo> {
	const asked = words(text).map((w) => w.slice(0, STEM));
	if (asked.length === 0) return [];
	return actions
		.map((action) => {
			const own = new Set(
				words(`${action.label} ${action.summary} ${action.id}`).map((w) => w.slice(0, STEM)),
			);
			return { action, score: asked.filter((w) => own.has(w)).length };
		})
		.filter((m) => m.score > 0)
		.sort((a, b) => b.score - a.score)
		.map((m) => m.action);
}

/** The parameters a call lacks (required and not given), and those it names that the action does not have. */
export function checkParams(
	action: ActionInfo,
	given: Record<string, unknown>,
): { missing: Array<string>; unknown: Array<string> } {
	const known = new Set(action.params.map((p) => p.name));
	return {
		missing: action.params
			.filter((p) => p.required && (given[p.name] === undefined || given[p.name] === ""))
			.map((p) => p.name),
		unknown: Object.keys(given).filter((k) => !known.has(k)),
	};
}
