import { z } from "zod";

/**
 * The old app's export, parsed with zod before anything is mapped or written. Every column the
 * brief gave is read; extra columns are kept (passthrough) so a non-empty one that nothing maps can
 * be reported by NAME. Numbers may arrive as numbers or numeric text. A parse failure is reported
 * as table, old id, field path and code: never the value (zod's own messages echo it).
 */

const numeric = z.union([
	z.number().finite(),
	z
		.string()
		.trim()
		.regex(/^-?\d+(\.\d+)?$/)
		.transform(Number),
]);
const integer = numeric.pipe(z.number().int());
const text = z.string().nullish();
const flag = z
	.union([z.boolean(), z.number(), z.string()])
	.nullish()
	.transform((value): boolean | null => {
		if (value === null || value === undefined) return null;
		if (typeof value === "boolean") return value;
		if (typeof value === "number") return value !== 0;
		const t = value.trim().toLowerCase();
		if (["true", "t", "1", "da", "yes"].includes(t)) return true;
		if (["false", "f", "0", "nu", "no", ""].includes(t)) return false;
		return null;
	});
/** A list of numbers given as an array, as JSON text or as a Postgres `{1,2}` literal. */
const numberList = z
	.union([z.array(numeric), z.string()])
	.nullish()
	.transform((value, ctx): number[] | null => {
		if (value === null || value === undefined) return null;
		if (Array.isArray(value)) return value.map(Number);
		const t = value.trim();
		if (t === "") return [];
		const inner = t.startsWith("{") ? `[${t.slice(1, -1)}]` : t;
		try {
			const parsed: unknown = JSON.parse(inner);
			const list = z.array(numeric).parse(parsed);
			return list.map(Number);
		} catch {
			ctx.addIssue({ code: "custom", message: "not a list of numbers" });
			return z.NEVER;
		}
	});

export const therapistRow = z
	.object({
		id: integer,
		name: text,
		short_name: text,
		specialty: text,
		color: text,
		bg: text,
		days: numberList,
		start_hour: numeric.nullish(),
		end_hour: numeric.nullish(),
		is_active: flag,
		sort_order: numeric.nullish(),
		created_at: text,
	})
	.passthrough();

export const groupActivityRow = z
	.object({
		id: integer,
		name: text,
		short_name: text,
		color: text,
		bg: text,
		sort_order: numeric.nullish(),
		created_at: text,
	})
	.passthrough();

export const clientRow = z
	.object({
		id: integer,
		name: text,
		phone: text,
		email: text,
		therapist_id: integer.nullish(),
		notes: text,
		created_at: text,
		birth_date: text,
		occupation: text,
		referral_source: text,
		status: text,
		gender: text,
		main_reason: text,
		first_therapy: text,
		location: text,
		child_diagnosis: text,
		tutor_name: text,
		tutor_relationship: text,
		tutor_phone: text,
		tutor_email: text,
		tutor_occupation: text,
		is_archived: flag,
		archived_at: text,
	})
	.passthrough();

export const appointmentRow = z
	.object({
		id: integer,
		client_id: integer.nullish(),
		therapist_id: integer.nullish(),
		room_id: integer.nullish(),
		date: text,
		start_time: text,
		end_time: text,
		duration: numeric.nullish(),
		session_type: text,
		notes: text,
		status: text,
		created_at: text,
		created_by: text,
		reminder_sent: flag,
		client_confirmed: flag,
		price: z.union([z.number(), z.string()]).nullish(),
		paid: z.union([z.boolean(), z.number(), z.string()]).nullish(),
		payment_method: text,
		subscription_id: integer.nullish(),
		therapist_notes: text,
		amount_paid: z.union([z.number(), z.string()]).nullish(),
		session_credit_type: text,
		nfb_device_id: integer.nullish(),
		attended: z.union([z.boolean(), z.number(), z.string()]).nullish(),
	})
	.passthrough();

export const staffScheduleRow = z
	.object({
		id: integer,
		therapist_id: integer.nullish(),
		date: text,
		status: text,
		start_time: text,
		end_time: text,
		notes: text,
		created_at: text,
		updated_at: text,
	})
	.passthrough();

export const staffBlockRow = z
	.object({
		id: integer,
		therapist_id: integer.nullish(),
		date_start: text,
		date_end: text,
		reason: text,
		notes: text,
		created_at: text,
	})
	.passthrough();

export const subscriptionRow = z
	.object({
		id: integer,
		client_id: integer.nullish(),
		session_type: text,
		total_sessions: numeric.nullish(),
		bonus_sessions: numeric.nullish(),
		sessions_used: numeric.nullish(),
		bonus_used: numeric.nullish(),
		price: z.union([z.number(), z.string()]).nullish(),
		start_date: text,
		notes: text,
		created_at: text,
		amount_paid: z.union([z.number(), z.string()]).nullish(),
	})
	.passthrough();

/** The four feedback tables share their meta columns; the template fields are read by name later. */
export const feedbackRow = z
	.object({
		id: integer,
		appointment_id: integer.nullish(),
		client_id: integer.nullish(),
		therapist_id: integer.nullish(),
		created_at: text,
		updated_at: text,
	})
	.passthrough();

export const clientFileRow = z
	.object({
		id: integer,
		client_id: integer.nullish(),
		file_name: text,
		file_path: text,
		file_size: numeric.nullish(),
		file_type: text,
		uploaded_by: text,
		created_at: text,
	})
	.passthrough();

export const avizRow = z
	.object({
		id: integer,
		title: text,
		file_name: text,
		file_path: text,
		file_size: numeric.nullish(),
		file_type: text,
		uploaded_by: text,
		created_at: text,
		updated_at: text,
	})
	.passthrough();

export const volunteerRow = z
	.object({ id: integer, name: text, active: flag, created_at: text })
	.passthrough();

export const TABLES = {
	therapists: therapistRow,
	group_activities: groupActivityRow,
	clients: clientRow,
	appointments: appointmentRow,
	staff_schedule: staffScheduleRow,
	staff_blocks: staffBlockRow,
	client_subscriptions: subscriptionRow,
	session_feedback: feedbackRow,
	racemeup_feedback: feedbackRow,
	psychotherapy_feedback: feedbackRow,
	parent_feedback: feedbackRow,
	client_files: clientFileRow,
	avize: avizRow,
	optimo_volunteers: volunteerRow,
} as const;
export type TableName = keyof typeof TABLES;

/** Tables that must be empty (the brief: accepted if empty, failing loudly if not). */
export const MUST_BE_EMPTY = ["nfb_feedback", "psychotherapy_intake", "client_therapies"] as const;

/** Tables the export must contain. */
export const REQUIRED: ReadonlyArray<TableName> = ["therapists", "clients", "appointments"];

export const exportEnvelope = z.object({
	exported_at: z.string().min(1),
	tables: z.record(z.string(), z.array(z.unknown())),
});

export type Row<T extends TableName> = z.infer<(typeof TABLES)[T]>;

export interface ParseProblem {
	table: string;
	/** The old id when the row has a readable one; otherwise its position. */
	id: string;
	/** `path:code` pairs, never values. */
	issues: ReadonlyArray<string>;
}

export interface ParsedExport {
	exportedAt: number;
	/** Rows per table in the export, as exported. */
	sourceCounts: Readonly<Record<string, number>>;
	rows: { [T in TableName]: Array<Row<T>> };
	problems: ParseProblem[];
	/** Tables in the export that nothing maps, with their row counts. */
	unmappedTables: Array<{ table: string; rows: number }>;
	/** Tables that must be empty and are not, with their row counts. */
	nonEmptyForbidden: Array<{ table: string; rows: number }>;
	/** Required tables that are missing from the export. */
	missing: TableName[];
}

const idProbe = z.object({ id: z.union([z.number(), z.string().regex(/^\d+$/)]) });

function idOf(raw: unknown, index: number): string {
	const probed = idProbe.safeParse(raw);
	return probed.success ? String(probed.data.id) : `#${index}`;
}

/** Parses the whole export; nothing here writes. `ignore` names tables the owner chose to leave out. */
export function parseExport(
	input: unknown,
	ignore: ReadonlyArray<string> = [],
): ParsedExport | { fatal: string } {
	const envelope = exportEnvelope.safeParse(input);
	if (!envelope.success) return { fatal: "the export is not { exported_at, tables }" };
	const exportedAt = Date.parse(envelope.data.exported_at);
	if (Number.isNaN(exportedAt)) return { fatal: "exported_at is not a date" };
	const problems: ParseProblem[] = [];
	const read = <T extends TableName>(name: T): Array<Row<T>> => {
		const out: Array<Row<T>> = [];
		(envelope.data.tables[name] ?? []).forEach((raw, index) => {
			const parsed: z.SafeParseReturnType<unknown, Row<T>> = TABLES[name].safeParse(raw);
			if (parsed.success) out.push(parsed.data);
			else {
				problems.push({
					table: name,
					id: idOf(raw, index),
					issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(row)"}:${i.code}`),
				});
			}
		});
		return out;
	};
	const known = new Set<string>([...Object.keys(TABLES), ...MUST_BE_EMPTY, ...ignore]);
	return {
		exportedAt,
		sourceCounts: Object.fromEntries(
			Object.entries(envelope.data.tables).map(([t, list]) => [t, list.length]),
		),
		rows: {
			therapists: read("therapists"),
			group_activities: read("group_activities"),
			clients: read("clients"),
			appointments: read("appointments"),
			staff_schedule: read("staff_schedule"),
			staff_blocks: read("staff_blocks"),
			client_subscriptions: read("client_subscriptions"),
			session_feedback: read("session_feedback"),
			racemeup_feedback: read("racemeup_feedback"),
			psychotherapy_feedback: read("psychotherapy_feedback"),
			parent_feedback: read("parent_feedback"),
			client_files: read("client_files"),
			avize: read("avize"),
			optimo_volunteers: read("optimo_volunteers"),
		},
		problems,
		unmappedTables: Object.entries(envelope.data.tables)
			.filter(([t, list]) => !known.has(t) && list.length > 0)
			.map(([table, list]) => ({ table, rows: list.length })),
		nonEmptyForbidden: MUST_BE_EMPTY.flatMap((table) => {
			const n = envelope.data.tables[table]?.length ?? 0;
			return n > 0 ? [{ table, rows: n }] : [];
		}),
		missing: REQUIRED.filter((t) => envelope.data.tables[t] === undefined),
	};
}
