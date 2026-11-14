import {
	AssistantCeilings,
	type AssistantCeilingsType,
	AssistantOrgDocument,
	type AssistantOrgDocumentType,
	AssistantPlatformDocument,
	type AssistantPlatformDocumentType,
	type AssistantSurfaceName,
} from "@psi/scheduling-sdk/contract";
import type { m } from "../paraglide/messages.js";

/** The message that names a setting. */
export type LabelKey = Extract<keyof typeof m, `as_f_${string}`>;

/** How a field is written in the form and read back. */
export type FieldKind =
	| "int"
	| "num"
	| "usd"
	| "bool"
	| "text"
	| "long"
	| "list"
	| "tone"
	| "language";
export type FieldGroup =
	| "access"
	| "model"
	| "limits"
	| "prompt"
	| "booking"
	| "handoff"
	| "memory"
	| "logging";

/** One setting of a surface: its path in the settings, its message, how it is written, where it shows. */
export interface SettingField {
	readonly path: string;
	readonly key: LabelKey;
	readonly kind: FieldKind;
	readonly group: FieldGroup;
	/**
	 * The one surface it governs, when it is not both. Staff only: paging and the read cache (the visitor's guide reads
	 * no records), the instructions (the visitor's voice, prompt, tone and language are the site's content, in the
	 * CMS), and keeping and summarising conversations (the sites keep none). Visitor only: booking in the site's chat.
	 */
	readonly only?: AssistantSurfaceName;
	/** The ceiling it is held to, for the hint beside it. */
	readonly ceiling?: keyof AssistantCeilingsType;
}

const f = (
	path: string,
	key: LabelKey,
	kind: FieldKind,
	group: FieldGroup,
	more: { only?: AssistantSurfaceName; ceiling?: keyof AssistantCeilingsType } = {},
): SettingField => ({ path, key, kind, group, ...more });

/** Every setting of a surface the screens edit, in the order shown. */
export const SETTING_FIELDS: ReadonlyArray<SettingField> = [
	f("enabled", "as_f_enabled", "bool", "access"),
	f("model.primary", "as_f_model_primary", "text", "model"),
	f("model.fallbacks", "as_f_model_fallbacks", "list", "model"),
	f("model.summary", "as_f_model_summary", "text", "model", { only: "staff" }),
	f("temperature", "as_f_temperature", "num", "model", { ceiling: "temperature" }),
	f("maxOutputTokens", "as_f_maxOutputTokens", "int", "model", { ceiling: "maxOutputTokens" }),
	f("maxToolCalls", "as_f_maxToolCalls", "int", "limits", { ceiling: "maxToolCalls" }),
	f("pageSize", "as_f_pageSize", "int", "limits", { ceiling: "pageSize", only: "staff" }),
	f("timeouts.idleMs", "as_f_timeouts_idleMs", "int", "limits"),
	f("timeouts.totalMs", "as_f_timeouts_totalMs", "int", "limits", { ceiling: "totalMs" }),
	f("ratePerMinute", "as_f_ratePerMinute", "int", "limits", { ceiling: "ratePerMinute" }),
	f("messages.perSession", "as_f_messages_perSession", "int", "limits"),
	f("messages.perDay", "as_f_messages_perDay", "int", "limits", { ceiling: "messagesPerDay" }),
	f("tokens.perRequest", "as_f_tokens_perRequest", "int", "limits", {
		ceiling: "tokensPerRequest",
	}),
	f("tokens.perDay", "as_f_tokens_perDay", "int", "limits"),
	f("tokens.perMonth", "as_f_tokens_perMonth", "int", "limits", { ceiling: "tokensPerMonth" }),
	f("budget.monthlyMicroUsd", "as_f_budget_monthlyMicroUsd", "usd", "limits", {
		ceiling: "budgetMonthlyMicroUsd",
	}),
	f("budget.hardStop", "as_f_budget_hardStop", "bool", "limits"),
	f("prompt.override", "as_f_prompt_override", "long", "prompt", { only: "staff" }),
	f("prompt.append", "as_f_prompt_append", "long", "prompt", { only: "staff" }),
	f("tone", "as_f_tone", "tone", "prompt", { only: "staff" }),
	f("language", "as_f_language", "language", "prompt", { only: "staff" }),
	f("booking.horizonDays", "as_f_booking_horizonDays", "int", "booking", { only: "visitor" }),
	f("booking.offerCallback", "as_f_booking_offerCallback", "bool", "booking", {
		only: "visitor",
	}),
	f("handoff.enabled", "as_f_handoff_enabled", "bool", "handoff"),
	f("handoff.afterRefusals", "as_f_handoff_afterRefusals", "int", "handoff"),
	f("handoff.contact", "as_f_handoff_contact", "text", "handoff"),
	f("memory.retentionDays", "as_f_memory_retentionDays", "int", "memory", {
		ceiling: "retentionDays",
		only: "staff",
	}),
	f("memory.historyMessages", "as_f_memory_historyMessages", "int", "memory"),
	f("memory.compactAfter", "as_f_memory_compactAfter", "int", "memory", { only: "staff" }),
	f("logging.redactPii", "as_f_logging_redactPii", "bool", "logging"),
	f("logging.keepTranscripts", "as_f_logging_keepTranscripts", "bool", "logging"),
	f("cacheTtlSeconds", "as_f_cacheTtlSeconds", "int", "memory", { only: "staff" }),
];

export const FIELD_GROUPS: ReadonlyArray<FieldGroup> = [
	"access",
	"model",
	"limits",
	"prompt",
	"booking",
	"handoff",
	"memory",
	"logging",
];

export const fieldsOf = (surface: AssistantSurfaceName): ReadonlyArray<SettingField> =>
	SETTING_FIELDS.filter((x) => x.only === undefined || x.only === surface);

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/** The value at a dotted path of a settings object (or patch), when there is one. */
export function valueAt(source: unknown, path: string): unknown {
	let at: unknown = source;
	for (const part of path.split(".")) at = isPlain(at) ? at[part] : undefined;
	return at;
}

function setAt(target: Plain, path: string, value: unknown): void {
	const parts = path.split(".");
	let at = target;
	for (const part of parts.slice(0, -1)) {
		const next = at[part];
		const child: Plain = isPlain(next) ? next : {};
		at[part] = child;
		at = child;
	}
	at[parts.at(-1) ?? path] = value;
}

/** A value as the form shows it (money in dollars, lists comma separated, switches on/off). */
export function shown(kind: FieldKind, value: unknown): string {
	if (value === undefined || value === null) return "";
	if (kind === "usd" && typeof value === "number") return String(value / 1_000_000);
	if (kind === "bool") return value === true ? "on" : "off";
	if (Array.isArray(value)) return value.join(", ");
	return String(value);
}

/** What the form sent, back as a value; empty is "inherit" (absent). A value that cannot be read stays text, for the schema to refuse. */
function read(kind: FieldKind, raw: string): unknown {
	const text = raw.trim();
	if (text === "") return undefined;
	switch (kind) {
		case "int":
			return /^-?\d+$/.test(text) ? Number(text) : text;
		case "num":
			return Number.isFinite(Number(text)) ? Number(text) : text;
		case "usd":
			return Number.isFinite(Number(text)) ? Math.round(Number(text) * 1_000_000) : text;
		case "bool":
			return text === "on" ? true : text === "off" ? false : text;
		case "list":
			return text
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s !== "");
		case "text":
		case "long":
		case "tone":
		case "language":
			return raw.replace(/\r\n/g, "\n");
		default: {
			const never: never = kind;
			return never;
		}
	}
}

type Form = Readonly<Record<string, string>>;

/** One surface's patch from the fields named `<prefix>.<path>`: what is filled in, and nothing else. */
export function patchFromForm(form: Form, prefix: string, surface: AssistantSurfaceName): Plain {
	const patch: Plain = {};
	for (const field of fieldsOf(surface)) {
		const value = read(field.kind, form[`${prefix}.${field.path}`] ?? "");
		if (value !== undefined) setAt(patch, field.path, value);
	}
	return patch;
}

const slug = (s: string): string =>
	s
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/^(\d)/, "s-$1")
		.slice(0, 40);

const list = (raw: string | undefined): Array<string> =>
	(raw ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s !== "");

/** The skills of the form: `skill.<n>.*`, a row without a name (the empty "new" row) or marked for removal skipped. */
function skillsFromForm(form: Form): Array<Plain> {
	const rows = new Set(
		Object.keys(form).flatMap((k) => {
			const n = /^skill\.(\d{1,2})\./.exec(k)?.[1];
			return n === undefined ? [] : [Number(n)];
		}),
	);
	return [...rows]
		.sort((a, b) => a - b)
		.flatMap((n) => {
			const at = (k: string): string => form[`skill.${n}.${k}`] ?? "";
			const name = at("name").trim();
			if (name === "" || at("remove") === "on") return [];
			const tools = list(at("tools"));
			const surfaces = (["staff", "visitor"] as const).filter((s) => at(`surface.${s}`) === "on");
			return [
				{
					id: at("id").trim() === "" ? slug(name) || `skill-${n}` : at("id").trim(),
					name,
					description: at("description").trim(),
					triggers: list(at("triggers")),
					instructions: at("instructions").replace(/\r\n/g, "\n"),
					...(tools.length === 0 ? {} : { tools }),
					surfaces: surfaces.length === 0 ? ["staff"] : surfaces,
					enabled: at("enabled") === "on",
				},
			];
		});
}

const ROLE_FIELDS = [
	["enabled", "bool"],
	["model", "text"],
	["maxToolCalls", "int"],
	["messagesPerDay", "int"],
	["tokensPerRequest", "int"],
] as const;
export const ROLE_FIELD_NAMES = ROLE_FIELDS.map(([name]) => name);

/** Whose overrides a form row holds: a role's (`role.<id>.<field>`) or a person's (`person.<subject>.<field>`). */
export type OverrideOf = "role" | "person";

/** The overrides of the rows named: empty fields left to the organisation's settings; a row with none set is absent. */
function overridesFromForm(
	form: Form,
	of: OverrideOf,
	ids: ReadonlyArray<string>,
): Record<string, Plain> {
	const out: Record<string, Plain> = {};
	for (const id of ids) {
		const o: Plain = {};
		for (const [name, kind] of ROLE_FIELDS) {
			const value = read(kind, form[`${of}.${id}.${name}`] ?? "");
			if (value !== undefined) o[name] = value;
		}
		if (Object.keys(o).length > 0) out[id] = o;
	}
	return out;
}

/** The overrides held, as the form shows them. */
function formOfOverrides(
	of: OverrideOf,
	held: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
	ids: ReadonlyArray<string>,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const id of ids)
		for (const [name, kind] of ROLE_FIELDS) {
			const value = held[id]?.[name];
			if (value !== undefined) out[`${of}.${id}.${name}`] = shown(kind, value);
		}
	return out;
}

/**
 * The organisation's document as the settings form would post it: every value the tier holds under its field name.
 * A change sent as a few fields (the assistant's) is laid over this, so what it does not name stays as it was.
 */
export function formOfDoc(
	doc: AssistantOrgDocumentType | undefined,
	roleIds: ReadonlyArray<string>,
): Record<string, string> {
	const out: Record<string, string> = {};
	if (doc === undefined) return out;
	for (const surface of ["staff", "visitor"] as const)
		for (const field of fieldsOf(surface)) {
			const value = valueAt(doc[surface], field.path);
			if (value !== undefined) out[`${surface}.${field.path}`] = shown(field.kind, value);
		}
	doc.skills.forEach((s, n) => {
		const at = (k: string, v: string): void => {
			out[`skill.${n}.${k}`] = v;
		};
		at("id", s.id);
		at("name", s.name);
		at("description", s.description);
		at("triggers", s.triggers.join(", "));
		at("instructions", s.instructions);
		if (s.tools !== undefined) at("tools", s.tools.join(", "));
		for (const surface of s.surfaces) at(`surface.${surface}`, "on");
		if (s.enabled) at("enabled", "on");
	});
	return { ...out, ...formOfOverrides("role", doc.roles, roleIds) };
}

/** The per-person overrides held, as the people's form would post them. */
export const formOfPeople = (
	doc: AssistantOrgDocumentType | undefined,
	subjects: ReadonlyArray<string>,
): Record<string, string> =>
	doc === undefined ? {} : formOfOverrides("person", doc.people, subjects);

export type Parsed<T> = { ok: true; doc: T } | { ok: false; fields: ReadonlyArray<string> };

/**
 * The organisation's document from the settings form, edited from `revision`: both surfaces, the skills and the role
 * overrides; the per-person overrides (set through the service, not this screen) are kept as they were.
 */
export function orgDocFromForm(
	form: Form,
	held: AssistantOrgDocumentType | undefined,
	revision: number,
	roleIds: ReadonlyArray<string>,
): Parsed<AssistantOrgDocumentType> {
	const parsed = AssistantOrgDocument.safeParse({
		revision,
		staff: patchFromForm(form, "staff", "staff"),
		visitor: patchFromForm(form, "visitor", "visitor"),
		skills: skillsFromForm(form),
		roles: overridesFromForm(form, "role", roleIds),
		people: held?.people ?? {},
	});
	return parsed.success
		? { ok: true, doc: parsed.data }
		: { ok: false, fields: parsed.error.issues.map((i) => i.path.join(".")) };
}

/**
 * The organisation's document with the per-person overrides of the people's form, edited from `revision`: the rows of
 * `subjects` as the form has them, everyone else's (someone no longer on the team) and every other part kept.
 */
export function peopleDocFromForm(
	form: Form,
	held: AssistantOrgDocumentType | undefined,
	revision: number,
	subjects: ReadonlyArray<string>,
): Parsed<AssistantOrgDocumentType> {
	const kept = Object.fromEntries(
		Object.entries(held?.people ?? {}).filter(([subject]) => !subjects.includes(subject)),
	);
	const parsed = AssistantOrgDocument.safeParse({
		staff: {},
		visitor: {},
		skills: [],
		roles: {},
		...held,
		revision,
		people: { ...kept, ...overridesFromForm(form, "person", subjects) },
	});
	return parsed.success
		? { ok: true, doc: parsed.data }
		: { ok: false, fields: parsed.error.issues.map((i) => i.path.join(".")) };
}

/** The platform's document from its form: each surface's defaults (a patch) and its ceilings (all required). */
export function platformDocFromForm(
	form: Form,
	revision: number,
): Parsed<AssistantPlatformDocumentType> {
	const ceilings = (surface: AssistantSurfaceName): Plain => {
		const out: Plain = {};
		for (const key of Object.keys(AssistantCeilings.shape)) {
			const kind: FieldKind =
				key === "models"
					? "list"
					: key === "forceRedaction"
						? "bool"
						: key === "budgetMonthlyMicroUsd"
							? "usd"
							: key === "temperature"
								? "num"
								: "int";
			const value = read(kind, form[`ceilings.${surface}.${key}`] ?? "");
			if (value !== undefined) out[key] = value;
		}
		return out;
	};
	const parsed = AssistantPlatformDocument.safeParse({
		revision,
		defaults: {
			staff: patchFromForm(form, "defaults.staff", "staff"),
			visitor: patchFromForm(form, "defaults.visitor", "visitor"),
		},
		ceilings: { staff: ceilings("staff"), visitor: ceilings("visitor") },
	});
	return parsed.success
		? { ok: true, doc: parsed.data }
		: { ok: false, fields: parsed.error.issues.map((i) => i.path.join(".")) };
}

/** A ceiling as the form shows it. */
export function ceilingShown(key: keyof AssistantCeilingsType, c: AssistantCeilingsType): string {
	const value = c[key];
	if (key === "budgetMonthlyMicroUsd" && typeof value === "number")
		return String(value / 1_000_000);
	if (typeof value === "boolean") return value ? "on" : "off";
	if (Array.isArray(value)) return value.join(", ");
	return String(value);
}
