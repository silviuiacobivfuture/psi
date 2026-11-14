import { createHash } from "node:crypto";
import type { FileSource } from "../import-old/files";
import type { OldExport } from "./old-app";

/**
 * A dummy-identity copy of the old app's export, for local and dev: the TypeScript port of the anonymizer that made
 * the dev data (same words, same choices from the same hashes, so one client gets the same stand-in name here as in
 * the files already in dev).
 *
 * Kept as they are: ids, dates, times, durations, statuses, services, prices and payments, packages, roster,
 * therapists (staff), categories and every list/number field. Replaced: client names, phones, e-mails, birth day
 * (the year is kept, so ages stay right), occupation, location, guardian, every free-text note and feedback text,
 * volunteer names, client file names and bytes, avize (titles, names and bytes).
 *
 * Stricter than the first version, which left four free-text columns of the old app as they were:
 * package notes, roster notes, leave reasons and the clients' referral source (when it is a sentence) are replaced too.
 */

export const PLACEHOLDER = "[text de test — conținutul real nu este copiat în acest mediu]";

const FIRST_F = [
	"Ana",
	"Maria",
	"Ioana",
	"Elena",
	"Andreea",
	"Cristina",
	"Diana",
	"Raluca",
	"Bianca",
	"Larisa",
	"Irina",
	"Sofia",
	"Alexandra",
	"Teodora",
	"Ilinca",
	"Daria",
	"Carmen",
	"Oana",
];
const FIRST_M = [
	"Andrei",
	"Mihai",
	"Ion",
	"Alexandru",
	"Ștefan",
	"Radu",
	"Vlad",
	"Tudor",
	"Matei",
	"Luca",
	"David",
	"Gabriel",
	"Cosmin",
	"Bogdan",
	"Florin",
	"Victor",
	"Paul",
	"Sorin",
];
const LAST = [
	"Popescu",
	"Ionescu",
	"Stan",
	"Dumitru",
	"Stoica",
	"Gheorghe",
	"Matei",
	"Ciobanu",
	"Rusu",
	"Munteanu",
	"Constantin",
	"Lungu",
	"Marin",
	"Florea",
	"Toma",
	"Neagu",
	"Barbu",
	"Dobre",
	"Ene",
	"Preda",
	"Nistor",
	"Voicu",
	"Sârbu",
	"Moldovan",
];

/** The smallest valid PDF: every client file and notice becomes this, so no real byte is kept. */
export const MIN_PDF = new TextEncoder().encode(
	"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
		"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);

/** The same pick the first anonymizer made: the SHA-256 of the key, as a big number, modulo the list length. */
function pick<T>(list: ReadonlyArray<T>, key: string): T {
	const n = BigInt(`0x${createHash("sha256").update(key).digest("hex")}`);
	return list[Number(n % BigInt(list.length))] as T;
}

function person(key: string, gender?: unknown): string {
	const g = (typeof gender === "string" ? gender : "").toLowerCase();
	const pool = g.startsWith("m")
		? FIRST_M
		: g.startsWith("f")
			? FIRST_F
			: pick([FIRST_F, FIRST_M], `${key}g`);
	return `${pick(pool, `${key}f`)} ${pick(LAST, `${key}l`)}`;
}

const phone = (n: number): string => `07${String(n % 100_000_000).padStart(8, "0")}`;

/** Free text: replaced when there is any. */
const text = (v: unknown): unknown =>
	typeof v === "string" && v.trim() !== "" ? PLACEHOLDER : (v ?? null);

/** Free text hidden inside lists and objects (a program's own notes): replaced when longer than a label. */
function scrubLong(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(scrubLong);
	if (isRow(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubLong(x)]));
	return typeof v === "string" && [...v].length > 40 ? PLACEHOLDER : v;
}

const idOf = (row: Row): number => (typeof row.id === "number" ? row.id : Number(row.id));
const truthy = (v: unknown): boolean =>
	v !== null && v !== undefined && v !== "" && v !== 0 && v !== false;

/** Feedback columns that are dates or labels, not words a person wrote. */
const FEEDBACK_KEPT = new Set([
	"created_at",
	"updated_at",
	"date",
	"format",
	"presence",
	"session_number",
	"duration_min",
]);
const FEEDBACK_TABLES = [
	"session_feedback",
	"racemeup_feedback",
	"psychotherapy_feedback",
	"parent_feedback",
];

function anonymizeClient(c: Row): void {
	const i = idOf(c);
	c.name = person(`c${i}`, c.gender);
	if (truthy(c.phone)) c.phone = phone(10_000_000 + i);
	if (truthy(c.email)) c.email = `client${i}@exemplu.invalid`;
	if (truthy(c.birth_date)) c.birth_date = `${String(c.birth_date).slice(0, 4)}-01-01`;
	for (const k of ["notes", "main_reason", "child_diagnosis"]) c[k] = text(c[k]);
	for (const k of ["occupation", "tutor_occupation"]) if (truthy(c[k])) c[k] = "Ocupație de test";
	if (truthy(c.location)) c.location = "Localitate de test";
	if (truthy(c.tutor_name)) c.tutor_name = person(`t${i}`);
	if (truthy(c.tutor_phone)) c.tutor_phone = phone(20_000_000 + i);
	if (truthy(c.tutor_email)) c.tutor_email = `tutore${i}@exemplu.invalid`;
	c.referral_source = scrubLong(c.referral_source);
}

function anonymizeFeedback(r: Row): void {
	for (const [k, val] of Object.entries(r)) {
		if (Array.isArray(val) || isRow(val)) r[k] = scrubLong(val);
		else if (typeof val === "string" && !FEEDBACK_KEPT.has(k)) r[k] = text(val);
	}
}

/** Every file of the copy is the one placeholder document; the path says which bucket and row it stands for. */
function anonymizeFiles(t: Record<string, unknown[]>): Set<string> {
	const made = new Set<string>();
	for (const f of (t.client_files ?? []).filter(isRow)) {
		const path = String(f.file_path ?? "");
		const folder = path.includes("/") ? (path.split("/")[0] ?? "") : String(f.client_id);
		f.file_name = `document-${f.id}.pdf`;
		f.file_path = `${folder}/document-${f.id}.pdf`;
		f.file_type = "application/pdf";
		f.file_size = MIN_PDF.length;
		made.add(`client-files/${String(f.file_path)}`);
	}
	for (const f of (t.avize ?? []).filter(isRow)) {
		f.title = `Document ${f.id}`;
		f.file_name = `aviz-${f.id}.pdf`;
		f.file_path = `aviz-${f.id}.pdf`;
		f.file_type = "application/pdf";
		f.file_size = MIN_PDF.length;
		made.add(`avize/${String(f.file_path)}`);
	}
	return made;
}

export interface Anonymized {
	export: OldExport & { anonymized: true };
	/** The placeholder document for every file of the copy; nothing is read from the old app. */
	files: FileSource;
}

/** Returns a new export; the input is not changed. */
export function anonymizeExport(input: OldExport): Anonymized {
	const copy: OldExport = structuredClone(input);
	const t = copy.tables;
	const rows = (name: string): Row[] => (t[name] ?? []).filter(isRow);
	for (const c of rows("clients")) anonymizeClient(c);
	for (const a of rows("appointments")) {
		a.notes = text(a.notes);
		a.therapist_notes = text(a.therapist_notes);
	}
	for (const b of rows("staff_blocks")) {
		b.notes = text(b.notes);
		b.reason = text(b.reason);
	}
	for (const s of rows("staff_schedule")) s.notes = text(s.notes);
	for (const s of rows("client_subscriptions")) s.notes = text(s.notes);
	for (const v of rows("optimo_volunteers")) v.name = person(`v${idOf(v)}`);
	for (const table of FEEDBACK_TABLES) for (const r of rows(table)) anonymizeFeedback(r);
	const made = anonymizeFiles(t);
	return {
		export: { ...copy, anonymized: true },
		files: {
			async read(bucket, path) {
				return made.has(`${bucket}/${path}`) ? new Uint8Array(MIN_PDF) : undefined;
			},
		},
	};
}
