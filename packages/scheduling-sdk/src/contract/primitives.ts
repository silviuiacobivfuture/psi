import { z } from "zod/v4";

/** An app (tenant) slug: `psizone`, `hemisync`. Also the OpenFGA `sched_app` id. */
export const AppId = z.string().regex(/^[a-z][a-z0-9-]{1,40}$/);
/** Every other id: opaque, URL-safe, also the OpenFGA object id. */
export const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/);
/** Instants are UTC milliseconds. */
export const Ms = z.number().int().nonnegative();
/** A local calendar date in the app's zone. */
export const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const Label = z.object({ ro: z.string().min(1).max(200), en: z.string().min(1).max(200) });
export const Locale = z.enum(["ro", "en"]);
export const Money = z.number().int().min(0).max(100_000_000);
export const Subject = z.string().min(1).max(200);

/** The reach of a permission: everything in the app, the practitioners one is assigned to, or one's own. */
export const SCOPES = ["all", "assigned", "own"] as const;
export const Scope = z.enum(SCOPES);
export type ScopeName = z.infer<typeof Scope>;

/** Field groups the permissions govern (appointments: core, money, clinical; clients: contact, guardian, money, clinical). A group the caller may not see is ABSENT. */
export const FIELD_GROUPS = ["core", "contact", "guardian", "money", "clinical"] as const;
export const FieldGroup = z.enum(FIELD_GROUPS);
export type FieldGroupName = z.infer<typeof FieldGroup>;

/** The OpenFGA object types this service owns. */
export const SCHED_TYPES = [
	"sched_app",
	"sched_role",
	"sched_client",
	"sched_calendar",
	"sched_appointment",
	"sched_room",
	"sched_device",
	"sched_package",
	"sched_record",
	"sched_file",
] as const;
export type SchedType = (typeof SCHED_TYPES)[number];

/** A page of a list: `nextCursor` is opaque and absent on the last page. */
export function page<T extends z.ZodType>(item: T) {
	return z.object({ items: z.array(item), nextCursor: z.string().optional() });
}
export const PageQuery = z.object({
	limit: z.coerce.number().int().min(1).max(500).optional(),
	cursor: z.string().max(200).optional(),
});
export const AppParam = z.object({ app: AppId });
export const IdParam = z.object({ app: AppId, id: Id });
export const Ok = z.object({ ok: z.literal(true) });
