import { z } from "zod";
import { isLocalDate } from "../domain/time";
import { isFieldGroup } from "../permissions/catalogue";

/**
 * Forms and custom fields share one field model (the builder, docs/plans/clinic.md section 4):
 * a key, a label in both languages, a type, options, whether it is required, and the field group
 * that permissions govern. A form definition is versioned; a response keeps the version it was
 * written with, so changing a form never rewrites an old report.
 */
export const FIELD_TYPES = [
	"text",
	"longtext",
	"number",
	"money",
	"date",
	"choice",
	"multichoice",
	"yesno",
	"file",
	"rating",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const labelSchema = z.object({ ro: z.string().min(1).max(200), en: z.string().min(1).max(200) });

export const optionSchema = z.object({ value: z.string().min(1).max(100), label: labelSchema });

export const FIELD_KEY = /^[a-z][a-z0-9_]{0,47}$/;

const fieldGroupSchema = z.string().refine(isFieldGroup, "not a field group");

export const TEXT_MAX = 2_000;
export const LONGTEXT_MAX = 20_000;
export const DEFAULT_RATING = { min: 0, max: 10 } as const;

export const formFieldSchema = z
	.object({
		key: z.string().regex(FIELD_KEY),
		label: labelSchema,
		type: z.enum(FIELD_TYPES),
		/** Choices for `choice` and `multichoice`. Empty means any text (the app fills it in later). */
		options: z.array(optionSchema).max(100),
		required: z.boolean(),
		group: fieldGroupSchema,
		/** Bounds for `number`, `money` (bani) and `rating`. */
		min: z.number().finite().optional(),
		max: z.number().finite().optional(),
	})
	.superRefine((field, ctx) => {
		const chooses = field.type === "choice" || field.type === "multichoice";
		if (!chooses && field.options.length > 0) {
			ctx.addIssue({ code: "custom", path: ["options"], message: "options_on_non_choice" });
		}
		if (new Set(field.options.map((o) => o.value)).size !== field.options.length) {
			ctx.addIssue({ code: "custom", path: ["options"], message: "duplicate_option" });
		}
		if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
			ctx.addIssue({ code: "custom", path: ["min"], message: "min_above_max" });
		}
	});
export type FormField = z.infer<typeof formFieldSchema>;

export const FORM_KINDS = ["report", "questionnaire"] as const;

export const formDefinitionSchema = z
	.object({
		/** The template's stable key: `aba-session-report`. */
		key: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
		version: z.number().int().positive(),
		kind: z.enum(FORM_KINDS),
		title: labelSchema,
		fields: z.array(formFieldSchema).min(1).max(200),
	})
	.superRefine((def, ctx) => {
		if (new Set(def.fields.map((f) => f.key)).size !== def.fields.length) {
			ctx.addIssue({ code: "custom", path: ["fields"], message: "duplicate_field_key" });
		}
	});
export type FormDefinition = z.infer<typeof formDefinitionSchema>;

/** The value schema of one field. Bounds default sensibly; unknown choices are refused only where options exist. */
export function valueSchemaFor(field: FormField): z.ZodType<unknown> {
	const options = field.options.map((o) => o.value);
	const inOptions = (value: string): boolean => options.length === 0 || options.includes(value);
	switch (field.type) {
		case "text":
			return z.string().max(TEXT_MAX);
		case "longtext":
			return z.string().max(LONGTEXT_MAX);
		case "number":
			return z
				.number()
				.finite()
				.min(field.min ?? Number.NEGATIVE_INFINITY)
				.max(field.max ?? Number.POSITIVE_INFINITY);
		case "money":
			return z
				.number()
				.int()
				.min(field.min ?? 0)
				.max(field.max ?? Number.MAX_SAFE_INTEGER);
		case "date":
			return z.string().refine(isLocalDate, "not a date");
		case "choice":
			return z.string().max(200).refine(inOptions, "not an option");
		case "multichoice":
			return z.array(z.string().max(200).refine(inOptions, "not an option")).max(100);
		case "yesno":
			return z.boolean();
		case "file":
			return z.string().min(1).max(200);
		case "rating":
			return z
				.number()
				.int()
				.min(field.min ?? DEFAULT_RATING.min)
				.max(field.max ?? DEFAULT_RATING.max);
	}
}

export type ResponseProblem = { field: string; code: "required" | "invalid" | "unknown_field" };

export type ResponseCheck =
	| { ok: true; values: Readonly<Record<string, unknown>> }
	| { ok: false; problems: ReadonlyArray<ResponseProblem> };

/**
 * Checks a response against the definition version it is written with. Problems name the field
 * and a code, never the value (a response holds clinical text).
 */
export function validateResponse(
	def: FormDefinition,
	input: Readonly<Record<string, unknown>>,
): ResponseCheck {
	const problems: ResponseProblem[] = [];
	const values: Record<string, unknown> = {};
	const known = new Set(def.fields.map((f) => f.key));
	for (const key of Object.keys(input)) {
		if (!known.has(key)) problems.push({ field: key, code: "unknown_field" });
	}
	for (const field of def.fields) {
		const raw = input[field.key];
		if (raw === undefined || raw === null) {
			if (field.required) problems.push({ field: field.key, code: "required" });
			continue;
		}
		const parsed = valueSchemaFor(field).safeParse(raw);
		if (parsed.success) values[field.key] = parsed.data;
		else problems.push({ field: field.key, code: "invalid" });
	}
	return problems.length === 0 ? { ok: true, values } : { ok: false, problems };
}

/**
 * Reads a loose source value (a database column from an older app) as the field's type:
 * `undefined` for an empty one, `{ok:false}` when it cannot be read as that type. Lenient on
 * form (a number given as text, a list given as JSON or as one string), strict on meaning.
 */
export function coerceAnswer(
	type: FieldType,
	raw: unknown,
): { ok: true; value: unknown } | { ok: false } {
	const none = { ok: true, value: undefined } as const;
	if (raw === null || raw === undefined) return none;
	switch (type) {
		case "text":
		case "longtext":
		case "file": {
			if (typeof raw === "string") return raw.trim() === "" ? none : { ok: true, value: raw };
			if (typeof raw === "number" || typeof raw === "boolean")
				return { ok: true, value: String(raw) };
			return { ok: false };
		}
		case "choice": {
			if (typeof raw === "string") return raw.trim() === "" ? none : { ok: true, value: raw };
			if (typeof raw === "number") return { ok: true, value: String(raw) };
			if (typeof raw === "boolean") return { ok: true, value: raw ? "yes" : "no" };
			return { ok: false };
		}
		case "number":
		case "money":
		case "rating": {
			if (typeof raw === "string" && raw.trim() === "") return none;
			const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
			if (!Number.isFinite(n) || typeof raw === "boolean" || typeof raw === "object")
				return { ok: false };
			return { ok: true, value: type === "number" ? n : Math.round(n) };
		}
		case "date": {
			if (typeof raw !== "string") return { ok: false };
			if (raw.trim() === "") return none;
			const day = raw.trim().slice(0, 10);
			return isLocalDate(day) ? { ok: true, value: day } : { ok: false };
		}
		case "yesno": {
			if (typeof raw === "boolean") return { ok: true, value: raw };
			if (raw === 1 || raw === 0) return { ok: true, value: raw === 1 };
			if (typeof raw !== "string") return { ok: false };
			const t = raw.trim().toLowerCase();
			if (t === "") return none;
			if (["da", "yes", "true", "1"].includes(t)) return { ok: true, value: true };
			if (["nu", "no", "false", "0"].includes(t)) return { ok: true, value: false };
			return { ok: false };
		}
		case "multichoice": {
			let list: unknown = raw;
			if (typeof raw === "string") {
				const t = raw.trim();
				if (t === "") return none;
				if (t.startsWith("[")) {
					try {
						list = JSON.parse(t);
					} catch {
						return { ok: false };
					}
				} else list = [t];
			}
			if (!Array.isArray(list)) return { ok: false };
			const items: string[] = [];
			for (const item of list) {
				if (typeof item === "string") {
					if (item.trim() !== "") items.push(item);
				} else if (typeof item === "number") items.push(String(item));
				else return { ok: false };
			}
			return items.length === 0 ? none : { ok: true, value: items };
		}
	}
}
