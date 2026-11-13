import { z } from "zod";
import { ACTIONS, CATALOGUE, RESOURCES, type Resource } from "../permissions/catalogue";
import { can, type EffectivePermissions, type ScopeFacts } from "../permissions/evaluate";
import { FIELD_KEY, formFieldSchema } from "./forms";

/**
 * What an app's owners build without code (docs/plans/clinic.md section 4): custom fields on
 * clients, appointments, packages and staff; views; actions. All of it is data, validated here
 * and versioned by the store. A definition can arrange what a person sees; it can never widen
 * what they are allowed: `visibleActions` asks `can` for every action, always.
 */

export const CUSTOM_ENTITIES = ["client", "appointment", "package", "staff"] as const;
export type CustomEntity = (typeof CUSTOM_ENTITIES)[number];

export const customFieldSchema = formFieldSchema.and(
	z.object({ entity: z.enum(CUSTOM_ENTITIES), order: z.number().int().nonnegative() }),
);
export type CustomField = z.infer<typeof customFieldSchema>;

/** Clinical-group values are always stored encrypted; every other group in the clear. */
export function customValueStorage(group: string): "encrypted" | "plain" {
	return group === "clinical" ? "encrypted" : "plain";
}

const labelSchema = z.object({ ro: z.string().min(1).max(200), en: z.string().min(1).max(200) });
const roleNames = z.array(z.string().min(1).max(60)).max(30);
const tokenName = z.string().regex(/^[a-z][a-z0-9-]{0,40}$/);

// Views ---------------------------------------------------------------------------------------

const calendarColumn = z.object({
	kind: z.enum(["practitioner", "device", "room", "group"]),
	/** The store's id of the person, device, room or activity. */
	ref: z.string().min(1).max(100),
	/** A design-token role for the column's colour, never a raw colour. */
	color: tokenName.optional(),
	hidden: z.boolean(),
});

export const VIEW_SURFACES = ["calendar", "list", "client_page"] as const;

export const viewDefinitionSchema = z.object({
	key: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
	title: labelSchema,
	/** A saved view per role; empty means everyone. */
	forRoles: roleNames,
	body: z.discriminatedUnion("surface", [
		z.object({ surface: z.literal("calendar"), columns: z.array(calendarColumn).min(1).max(60) }),
		z.object({
			surface: z.literal("list"),
			entity: z.enum(["client", "appointment", "package"]),
			columns: z.array(z.string().regex(FIELD_KEY)).min(1).max(40),
			filters: z
				.array(z.object({ field: z.string().regex(FIELD_KEY), equals: z.string().max(200) }))
				.max(20),
		}),
		z.object({
			surface: z.literal("client_page"),
			sections: z
				.array(
					z.object({
						key: tokenName,
						title: labelSchema,
						fields: z.array(z.string().regex(FIELD_KEY)).max(60),
					}),
				)
				.min(1)
				.max(20),
		}),
	]),
});
export type ViewDefinition = z.infer<typeof viewDefinitionSchema>;

// Actions (buttons) ---------------------------------------------------------------------------

export const ACTION_PLACEMENTS = [
	"calendar_appointment",
	"client_page",
	"package_page",
	"reminder_list",
	"roster_day",
] as const;

const resourceName = z.enum(RESOURCES);

export const actionDefinitionSchema = z
	.object({
		key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
		label: labelSchema,
		placement: z.enum(ACTION_PLACEMENTS),
		forRoles: roleNames,
		/** The permission the button needs. Hiding is arrangement; this is what actually decides. */
		requires: z.object({ resource: resourceName, action: z.enum(ACTIONS) }),
		/** One confirmation or none; there is no way to ask twice. */
		confirm: z.boolean(),
	})
	.superRefine((def, ctx) => {
		if (!CATALOGUE[def.requires.resource].actions.includes(def.requires.action)) {
			ctx.addIssue({ code: "custom", path: ["requires"], message: "not_in_catalogue" });
		}
	});
export type ActionDefinition = z.infer<typeof actionDefinitionSchema>;

/**
 * The buttons a person sees where they are: those placed there, for one of their roles (or for
 * everyone), whose required permission `can` grants for this very thing. A definition naming a
 * role the person does not have, or a permission they lack, shows nothing.
 */
export function visibleActions(
	defs: ReadonlyArray<ActionDefinition>,
	placement: (typeof ACTION_PLACEMENTS)[number],
	roleNames: ReadonlyArray<string>,
	perms: EffectivePermissions,
	facts: ScopeFacts,
): ReadonlyArray<ActionDefinition> {
	return defs.filter(
		(def) =>
			def.placement === placement &&
			(def.forRoles.length === 0 || def.forRoles.some((r) => roleNames.includes(r))) &&
			can(perms, def.requires.resource satisfies Resource, def.requires.action, facts).allowed,
	);
}

/** Parses stored JSON text for a definition; the failure names paths only, never content. */
export function parseDefinition<T>(
	schema: z.ZodType<T>,
	json: string,
): { ok: true; value: T } | { ok: false; paths: ReadonlyArray<string> } {
	let data: unknown;
	try {
		data = JSON.parse(json);
	} catch {
		return { ok: false, paths: ["(json)"] };
	}
	const parsed = schema.safeParse(data);
	return parsed.success
		? { ok: true, value: parsed.data }
		: { ok: false, paths: parsed.error.issues.map((i) => i.path.join(".") || "(root)") };
}
