import { toMinor } from "../../src/clinic/money";
import { isLocalDate } from "../../src/domain/time";
import { practitionerLegacy } from "./mapping";
import type { ClientRow } from "./rows";
import type { Row } from "./source";
import {
	type Ctx,
	clean,
	cleanNote,
	day,
	fingerprintOf,
	fold,
	reportExtraColumns,
	timestamp,
} from "./support";

const COLUMNS = new Set([
	"id",
	"name",
	"phone",
	"email",
	"therapist_id",
	"notes",
	"created_at",
	"birth_date",
	"occupation",
	"referral_source",
	"status",
	"gender",
	"main_reason",
	"first_therapy",
	"location",
	"child_diagnosis",
	"tutor_name",
	"tutor_relationship",
	"tutor_phone",
	"tutor_email",
	"tutor_occupation",
	"is_archived",
	"archived_at",
]);

const YEAR_MS = 365.25 * 86_400_000;

/** `Activ`, `Finalizat`, `În pauză` (any case, with or without diacritics). */
export function clientStatus(
	raw: string | null | undefined,
): "active" | "paused" | "finished" | undefined {
	const t = fold(raw);
	if (t === "activ") return "active";
	if (t === "finalizat") return "finished";
	if (t === "in pauza") return "paused";
	return undefined;
}

/** The audience the booking flow knows: under 13 a child, under 18 a teen, else an adult. */
function audienceOf(
	birth: string | undefined,
	hasGuardian: boolean,
	at: number,
): "child" | "teen" | "adult" {
	if (birth === undefined || !isLocalDate(birth)) return hasGuardian ? "child" : "adult";
	const age = (at - Date.parse(`${birth}T00:00:00Z`)) / YEAR_MS;
	return age < 13 ? "child" : age < 18 ? "teen" : "adult";
}

/** Names that are really groups ("ATELIER …", "GRUP …"): imported, and flagged for the owner. */
export const GROUP_LIKE = /^(atelier|grup)/;

export interface ClientsOut {
	rows: ClientRow[];
	/** Old client ids that were imported. */
	ids: Set<number>;
	/** Normalised names, for duplicate counting (never printed). */
	names: Array<{ id: number; key: string }>;
}

export async function planClients(
	ctx: Ctx,
	clients: ReadonlyArray<Row<"clients">>,
	practitionerIds: ReadonlySet<number>,
): Promise<ClientsOut> {
	const out: ClientsOut = { rows: [], ids: new Set(), names: [] };
	for (const c of clients) {
		const ref = `clients:${c.id}`;
		reportExtraColumns(ctx, "clients", c.id, c, COLUMNS);
		const name = clean(c.name);
		if (name === undefined) {
			ctx.log.add("client_without_name", "skipped", ref);
			continue;
		}
		if (GROUP_LIKE.test(fold(name))) ctx.log.add("group_like_client", "note", ref);
		const status = clientStatus(c.status);
		if (status === undefined) ctx.log.add("unknown_client_status", "note", ref);
		const birthRaw = clean(c.birth_date);
		const birthDate = day(c.birth_date);
		if (birthRaw !== undefined && birthDate === undefined)
			ctx.log.add("bad_birth_date", "note", ref);
		const hasTutor = [
			c.tutor_name,
			c.tutor_phone,
			c.tutor_email,
			c.tutor_relationship,
			c.tutor_occupation,
		].some((v) => clean(v) !== undefined);
		const guardian = hasTutor
			? {
					name: clean(c.tutor_name) ?? clean(c.tutor_relationship) ?? "-",
					phone: clean(c.tutor_phone),
					email: clean(c.tutor_email),
					relationship: clean(c.tutor_relationship),
					occupation: clean(c.tutor_occupation),
				}
			: undefined;
		let archivedAt: number | undefined;
		if (c.is_archived === true) {
			archivedAt = timestamp(c.archived_at) ?? ctx.exportedAt;
		}
		let treatingLegacy: string | undefined;
		if (c.therapist_id !== null && c.therapist_id !== undefined) {
			if (practitionerIds.has(c.therapist_id)) treatingLegacy = practitionerLegacy(c.therapist_id);
			else ctx.log.add("orphan_client_practitioner", "note", ref);
		}
		const enc = async (value: string | null | undefined, field: string) => {
			const note = cleanNote(value);
			return note === undefined ? undefined : ctx.enc.encrypt(note, `clients.${field}`);
		};
		out.rows.push({
			legacyId: ref,
			fingerprint: await fingerprintOf(ctx, "clients", c),
			name,
			kind: audienceOf(birthDate, guardian !== undefined, ctx.exportedAt),
			phone: clean(c.phone),
			email: clean(c.email),
			guardian,
			consent: { contact: true, reminders: false },
			status: status ?? "active",
			archivedAt,
			gender: clean(c.gender),
			birthDate,
			occupation: clean(c.occupation),
			referralSource: clean(c.referral_source),
			location: clean(c.location),
			firstTherapy: clean(c.first_therapy),
			mainReasonEnc: await enc(c.main_reason, "mainReasonEnc"),
			diagnosisEnc: await enc(c.child_diagnosis, "diagnosisEnc"),
			healthNotesEnc: await enc(c.notes, "healthNotesEnc"),
			createdAt: timestamp(c.created_at) ?? ctx.exportedAt,
			treatingLegacy,
		});
		out.ids.add(c.id);
		out.names.push({
			id: c.id,
			key: fold(name)
				.replace(/[^a-z0-9]+/g, " ")
				.trim(),
		});
	}
	return out;
}

/** Prices and amounts: bani from a number or numeric text; a non-empty value that is no amount is flagged. */
export function money(
	ctx: Ctx,
	value: number | string | null | undefined,
	ref: string,
): number | undefined {
	if (value === null || value === undefined || value === "") return undefined;
	const minor = toMinor(value);
	if (minor === undefined) ctx.log.add("bad_money", "note", ref);
	return minor;
}
