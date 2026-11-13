import { coerceAnswer, type FormDefinition, validateResponse } from "../../src/clinic/forms";
import {
	ABA_SESSION_REPORT,
	PARENT_QUESTIONNAIRE,
	PSYCHOTHERAPY_REPORT,
	RACE_ME_UP_REPORT,
} from "../../src/clinic/templates";
import { practitionerLegacy } from "./mapping";
import type { ResponseRow } from "./rows";
import type { Row, TableName } from "./source";
import { type Ctx, fingerprintOf, reportExtraColumns, timestamp } from "./support";

/** The four feedback tables and the template each one is written onto. */
export const FEEDBACK_TABLES = [
	["session_feedback", ABA_SESSION_REPORT],
	["racemeup_feedback", RACE_ME_UP_REPORT],
	["psychotherapy_feedback", PSYCHOTHERAPY_REPORT],
	["parent_feedback", PARENT_QUESTIONNAIRE],
] as const satisfies ReadonlyArray<readonly [TableName, FormDefinition]>;

const META = ["id", "appointment_id", "client_id", "therapist_id", "created_at", "updated_at"];

/** The column names a template field may have had: its key, and the American spelling of British words. */
export function columnCandidates(key: string): string[] {
	const american = key.replace(/our/g, "or");
	return american === key ? [key] : [key, american];
}

/**
 * The feedback rows as encrypted responses on the seeded templates. A value that cannot be read as
 * its field's type, one a template does not accept, and a column nothing maps are BLOCKING: the
 * import refuses rather than drop a clinical word.
 */
export async function planResponses(
	ctx: Ctx,
	source: { [T in (typeof FEEDBACK_TABLES)[number][0]]: ReadonlyArray<Row<T>> },
	known: {
		clientIds: ReadonlySet<number>;
		appointmentIds: ReadonlySet<number>;
		practitionerIds: ReadonlySet<number>;
	},
): Promise<ResponseRow[]> {
	const out: ResponseRow[] = [];
	for (const [table, def] of FEEDBACK_TABLES) {
		const mapped = new Set<string>(META);
		for (const field of def.fields)
			for (const name of columnCandidates(field.key)) mapped.add(name);
		for (const row of source[table]) {
			const ref = `${table}:${row.id}`;
			reportExtraColumns(ctx, table, row.id, row, mapped);
			if (
				row.client_id === null ||
				row.client_id === undefined ||
				!known.clientIds.has(row.client_id)
			) {
				ctx.log.add("orphan_feedback_client", "skipped", ref);
				continue;
			}
			const values: Record<string, unknown> = {};
			let readable = true;
			for (const field of def.fields) {
				const name = columnCandidates(field.key).find(
					(n) => row[n] !== undefined && row[n] !== null,
				);
				if (name === undefined) continue;
				const answer = coerceAnswer(field.type, row[name]);
				if (!answer.ok) {
					ctx.log.add(`uncoercible_value:${table}.${field.key}`, "blocking", ref);
					readable = false;
				} else if (answer.value !== undefined) values[field.key] = answer.value;
			}
			if (!readable) continue;
			const checked = validateResponse(def, values);
			if (!checked.ok) {
				for (const p of checked.problems) {
					ctx.log.add(`invalid_value:${table}.${p.field}:${p.code}`, "blocking", ref);
				}
				continue;
			}
			const hasVisit =
				row.appointment_id !== null &&
				row.appointment_id !== undefined &&
				known.appointmentIds.has(row.appointment_id);
			if (row.appointment_id !== null && row.appointment_id !== undefined && !hasVisit) {
				ctx.log.add("orphan_feedback_appointment", "note", ref);
			}
			const hasPractitioner =
				row.therapist_id !== null &&
				row.therapist_id !== undefined &&
				known.practitionerIds.has(row.therapist_id);
			if (row.therapist_id !== null && row.therapist_id !== undefined && !hasPractitioner) {
				ctx.log.add("orphan_feedback_practitioner", "note", ref);
			}
			const created = timestamp(row.created_at) ?? ctx.exportedAt;
			out.push({
				legacyId: ref,
				fingerprint: await fingerprintOf(ctx, table, row),
				definitionKey: def.key,
				definitionVersion: def.version,
				clientLegacy: `clients:${row.client_id}`,
				visitLegacy: hasVisit ? `appointments:${row.appointment_id}` : undefined,
				practitionerLegacy: hasPractitioner ? practitionerLegacy(row.therapist_id ?? 0) : undefined,
				payload: await ctx.enc.encrypt(JSON.stringify(checked.values), "formResponses.payload"),
				createdAt: created,
				updatedAt: timestamp(row.updated_at) ?? created,
			});
		}
	}
	return out;
}
