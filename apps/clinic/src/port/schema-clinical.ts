import {
	BLACKLIST_CATEGORIES,
	BLACKLIST_SEVERITIES,
	type FormDefinition,
	REASON_MAX,
} from "@psi/scheduling/clinic";
import { FILE_TYPES as CONTRACT_FILE_TYPES, NOTE_MAX_CHARS } from "@psi/scheduling-sdk/contract";
import { z } from "zod";
import { IsoDateSchema } from "./schema";

/**
 * What a client page keeps besides the client: notes, blacklist entries, records (filled forms) and files. The form
 * definitions, the blacklist's categories and severities and its limits are the engine's own, never restated here.
 */

export const NOTE_CATEGORIES = [
	"general",
	"administrative",
	"payment",
	"behaviour",
	"clinical",
] as const;
export const NoteCategorySchema = z.enum(NOTE_CATEGORIES);
export type NoteCategory = z.infer<typeof NoteCategorySchema>;

/** A note's longest text: the service's own bound, never a second number beside it. */
export const NOTE_MAX = NOTE_MAX_CHARS;

export const ClientNoteSchema = z.object({
	id: z.string(),
	clientId: z.string(),
	body: z.string(),
	category: NoteCategorySchema,
	pinned: z.boolean(),
	authorSubject: z.string(),
	authorName: z.string(),
	/** Local ISO date-time, seconds. */
	createdAt: z.string(),
	/** Set once the text was changed after it was written. */
	editedAt: z.string().nullable(),
});
export type ClientNote = z.infer<typeof ClientNoteSchema>;

export const NewNoteSchema = z.object({
	body: z.string().trim().min(1).max(NOTE_MAX),
	category: NoteCategorySchema.default("general"),
	pinned: z.boolean().default(false),
});
export type NewNote = z.input<typeof NewNoteSchema>;

export const NotePatchSchema = z
	.object({
		body: z.string().trim().min(1).max(NOTE_MAX),
		category: NoteCategorySchema,
		pinned: z.boolean(),
	})
	.partial();
export type NotePatch = z.infer<typeof NotePatchSchema>;

/** Who is acting, as the port needs to stamp and to decide "own". */
export interface Actor {
	subject: string;
	name: string;
}

export const BlacklistCategorySchema = z.enum(BLACKLIST_CATEGORIES);
export const BlacklistSeveritySchema = z.enum(BLACKLIST_SEVERITIES);

export const BlacklistEntrySchema = z.object({
	id: z.string(),
	clientId: z.string(),
	reason: z.string(),
	category: BlacklistCategorySchema,
	severity: BlacklistSeveritySchema,
	createdAt: z.string(),
	createdBy: z.string(),
	/** The last day it applies; null: until it is removed. */
	expiresOn: IsoDateSchema.nullable(),
	/** Set when it was removed by hand. */
	endedAt: z.string().nullable(),
	endedBy: z.string().nullable(),
	endReason: z.string().nullable(),
});
export type BlacklistEntry = z.infer<typeof BlacklistEntrySchema>;

export const NewBlacklistSchema = z.object({
	reason: z.string().trim().min(1).max(REASON_MAX),
	category: BlacklistCategorySchema,
	severity: BlacklistSeveritySchema,
	expiresOn: IsoDateSchema.nullable().default(null),
});
export type NewBlacklist = z.input<typeof NewBlacklistSchema>;

/** Whether an entry bites on `today`: not removed, not past its last day. */
export function blacklistActive(e: BlacklistEntry, today: string): boolean {
	return e.endedAt === null && (e.expiresOn === null || e.expiresOn >= today);
}

/** The reason a person gives for booking someone on the list anyway. */
export const OverrideInputSchema = z.object({ reason: z.string().trim().min(1).max(500) });

/** Draft until finalised: a finalised record is the clinical document. */
export const RECORD_STATUSES = ["draft", "final"] as const;
export const RecordStatusSchema = z.enum(RECORD_STATUSES);
export type RecordStatus = z.infer<typeof RecordStatusSchema>;

export const ClientRecordSchema = z.object({
	id: z.string(),
	clientId: z.string(),
	formKey: z.string(),
	formVersion: z.number().int().positive(),
	appointmentId: z.string().nullable(),
	status: RecordStatusSchema,
	authorName: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	data: z.record(z.unknown()),
});
export type ClientRecord = z.infer<typeof ClientRecordSchema>;

export const NewRecordSchema = z.object({
	formKey: z.string().min(1),
	appointmentId: z.string().nullable().default(null),
	status: RecordStatusSchema.default("draft"),
	data: z.record(z.unknown()),
});
export type NewRecord = z.input<typeof NewRecordSchema>;

export const RecordPatchSchema = z
	.object({
		appointmentId: z.string().nullable(),
		status: RecordStatusSchema,
		data: z.record(z.unknown()),
	})
	.partial();
export type RecordPatch = z.infer<typeof RecordPatchSchema>;

/** The most a file may weigh and what may be attached: the service's own contract, never restated here. */
export { FILE_MAX_BYTES } from "@psi/scheduling-sdk/contract";
export type { FormDefinition };
export const FILE_TYPES: ReadonlyArray<string> = CONTRACT_FILE_TYPES;

export const ClientFileSchema = z.object({
	id: z.string(),
	clientId: z.string(),
	name: z.string(),
	contentType: z.string(),
	size: z.number().int().positive(),
	uploadedByName: z.string(),
	createdAt: z.string(),
});
export type ClientFile = z.infer<typeof ClientFileSchema>;

/** The name a person may give a file: no path, not empty. */
export const FileNameSchema = z
	.string()
	.trim()
	.min(1)
	.max(200)
	.refine((n) => !/[\\/]/.test(n), "no path");

export interface NewFile {
	name: string;
	contentType: string;
	bytes: Uint8Array;
}

/**
 * The `conflict` message of a change that would leave a client with no phone or e-mail to book with (their own, or
 * their guardian's): the edit sheet says so in words.
 */
export const CONTACT_REQUIRED = "contact_required";
/** The contact fields a person may empty on their own. */
export const CLEARABLE_FIELDS = ["phone", "email"] as const;
export type ClearableField = (typeof CLEARABLE_FIELDS)[number];

/** A change of a client; `null` empties a field (a phone or an e-mail; a guardian only while there is none). */
export const ClientPatchSchema = z
	.object({
		name: z.string().trim().min(1).max(120),
		phone: z.string().trim().max(40).nullable(),
		guardian: z.string().trim().max(120).nullable(),
		email: z.string().trim().max(200).nullable(),
		note: z.string().max(20_000),
	})
	.partial();
export type ClientPatch = z.infer<typeof ClientPatchSchema>;

/** One row of the client list: the client and what a rich row shows, read in one go. */
export interface ClientSummary {
	clientId: string;
	next: { date: string; startMin: number } | null;
	/** Bani still owed on the client's packages; null when the person may not see money. */
	owedBani: number | null;
	blacklist: BlacklistEntry | null;
	pinnedNotes: number;
}

/** What the calendar and the editor need to flag about a client. */
export interface ClientFlag {
	blacklist: BlacklistEntry | null;
	/** The newest pinned note, text only when the person may read its category. */
	pinned: { body: string; category: NoteCategory } | null;
}
