import type { Audience } from "./catalog";

/**
 * The clinic's own customers, as the team keeps them to link to requests and appointments, and the
 * CSV the owner hands over to import them. Pure: reading, validating and de-duplicating a file
 * touches no store. Privacy (docs/plans/scheduling.md §6): a client is a name and ways to reach
 * them, who they are for, a guardian for a child, consent flags, and a short staff-only note that
 * is administrative (how they prefer to be called, a billing detail), never why they come: nothing
 * clinical is asked for, imported or shown to a visitor.
 */

export const NOTE_MAX = 500;
export const IMPORT_MAX_ROWS = 500;

export interface ContactPoint {
	name: string;
	phone?: string;
	email?: string;
}

export interface ClientInput {
	name: string;
	kind: Audience;
	phone?: string;
	email?: string;
	/** Required for a child or a teenager. */
	guardian?: ContactPoint;
	/** Staff only; administrative. */
	staffNotes?: string;
	consent: { contact: boolean; reminders: boolean };
}

/** A Romanian-style phone as digits: `+40 748 017 752`, `0040748017752` and `0748-017-752` are one number. */
export function phoneKey(raw: string): string | undefined {
	let digits = raw.replace(/[^\d+]/g, "");
	if (digits.startsWith("+40")) digits = `0${digits.slice(3)}`;
	else if (digits.startsWith("0040")) digits = `0${digits.slice(4)}`;
	else if (digits.startsWith("40") && digits.length === 11) digits = `0${digits.slice(2)}`;
	digits = digits.replace(/\D/g, "");
	return digits.length >= 9 && digits.length <= 15 ? digits : undefined;
}

export function emailKey(raw: string): string | undefined {
	const e = raw.trim().toLowerCase();
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : undefined;
}

/** A name compared without case, diacritics or spacing differences. */
export function nameKey(raw: string): string {
	return raw.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Rows of a CSV: commas or semicolons (Excel in Romanian writes `;`), quotes, doubled quotes, a BOM. */
export function parseCsv(text: string): string[][] {
	const src = text.replace(/^﻿/, "");
	const first = src.split(/\r?\n/, 1)[0] ?? "";
	const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < src.length; i += 1) {
		const c = src[i];
		if (quoted) {
			if (c === '"' && src[i + 1] === '"') {
				cell += '"';
				i += 1;
			} else if (c === '"') quoted = false;
			else cell += c;
		} else if (c === '"') quoted = true;
		else if (c === delimiter) {
			row.push(cell);
			cell = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && src[i + 1] === "\n") i += 1;
			row.push(cell);
			cell = "";
			if (row.some((x) => x.trim() !== "")) rows.push(row);
			row = [];
		} else cell += c;
	}
	row.push(cell);
	if (row.some((x) => x.trim() !== "")) rows.push(row);
	return rows;
}

/** The columns of the template, in order. */
export const TEMPLATE_COLUMNS = [
	"nume",
	"telefon",
	"email",
	"tip",
	"tutore_nume",
	"tutore_telefon",
	"tutore_email",
	"consimtamant_contact",
	"consimtamant_memento",
	"note_staff",
] as const;
export type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

export type RowProblem =
	| "name"
	| "kind"
	| "phone"
	| "email"
	| "contact"
	| "guardian"
	| "guardian_contact"
	| "consent"
	| "note_length"
	| "header";

export interface ImportProblem {
	/** The line in the file (the header is line 1). 0 for the header itself. */
	line: number;
	problem: RowProblem;
	column?: TemplateColumn;
}

const KINDS: Readonly<Record<string, Audience>> = {
	adult: "adult",
	adulta: "adult",
	copil: "child",
	child: "child",
	adolescent: "teen",
	teen: "teen",
	teenager: "teen",
};
const YES = new Set(["da", "yes", "true", "1", "x", "y", "d"]);
const NO = new Set(["nu", "no", "false", "0", "n", ""]);

function consentOf(raw: string): boolean | undefined {
	const v = nameKey(raw);
	return YES.has(v) ? true : NO.has(v) ? false : undefined;
}

export interface ReadClients {
	rows: Array<{ line: number; client: ClientInput }>;
	problems: ImportProblem[];
}

/**
 * Reads the owner's CSV (the template's header, any column order, unknown columns ignored). A bad
 * row is reported with its line and the reason and is not imported; good rows are returned. A
 * client needs a name and a phone or an e-mail; a child or teenager needs a guardian with a name
 * and a phone or an e-mail of their own.
 */
export function readClients(text: string): ReadClients {
	const table = parseCsv(text);
	const header = (table[0] ?? []).map((h) => nameKey(h).replace(/ /g, "_"));
	const at = (name: TemplateColumn): number => header.indexOf(name);
	const problems: ImportProblem[] = [];
	if (at("nume") === -1 || (at("telefon") === -1 && at("email") === -1)) {
		return { rows: [], problems: [{ line: 0, problem: "header" }] };
	}
	const rows: ReadClients["rows"] = [];
	for (const [i, cells] of table.slice(1).entries()) {
		const line = i + 2;
		const cell = (c: TemplateColumn): string => (cells[at(c)] ?? "").trim();
		const bad = (problem: RowProblem, column?: TemplateColumn): void => {
			problems.push({ line, problem, ...(column === undefined ? {} : { column }) });
		};
		const before = problems.length;
		const name = cell("nume").replace(/\s+/g, " ");
		const kind = cell("tip") === "" ? "adult" : KINDS[nameKey(cell("tip"))];
		const phone = cell("telefon") === "" ? undefined : phoneKey(cell("telefon"));
		const email = cell("email") === "" ? undefined : emailKey(cell("email"));
		const contact = consentOf(cell("consimtamant_contact"));
		const reminders = consentOf(cell("consimtamant_memento"));
		if (name === "" || name.length > 80) bad("name", "nume");
		if (kind === undefined) bad("kind", "tip");
		if (cell("telefon") !== "" && phone === undefined) bad("phone", "telefon");
		if (cell("email") !== "" && email === undefined) bad("email", "email");
		if (contact === undefined || reminders === undefined) bad("consent");
		if (cell("note_staff").length > NOTE_MAX) bad("note_length", "note_staff");
		let guardian: ContactPoint | undefined;
		if (kind === "child" || kind === "teen") {
			const gName = cell("tutore_nume").replace(/\s+/g, " ");
			const gPhone = cell("tutore_telefon") === "" ? undefined : phoneKey(cell("tutore_telefon"));
			const gEmail = cell("tutore_email") === "" ? undefined : emailKey(cell("tutore_email"));
			if (gName === "") bad("guardian", "tutore_nume");
			else if (gPhone === undefined && gEmail === undefined) bad("guardian_contact");
			else
				guardian = {
					name: gName,
					...(gPhone === undefined ? {} : { phone: gPhone }),
					...(gEmail === undefined ? {} : { email: gEmail }),
				};
		} else if (cell("telefon") === "" && cell("email") === "" && kind === "adult") {
			bad("contact");
		}
		if (problems.length > before || kind === undefined) continue;
		rows.push({
			line,
			client: {
				name,
				kind,
				...(phone === undefined ? {} : { phone }),
				...(email === undefined ? {} : { email }),
				...(guardian === undefined ? {} : { guardian }),
				...(cell("note_staff") === "" ? {} : { staffNotes: cell("note_staff") }),
				consent: { contact: contact === true, reminders: reminders === true },
			},
		});
	}
	return { rows, problems };
}

/** The keys a client is recognised by: its own phone and e-mail, else its guardian's with the name. */
export function identityKeys(c: ClientInput): string[] {
	const own = [
		...(c.phone === undefined ? [] : [`p:${phoneKey(c.phone) ?? c.phone}`]),
		...(c.email === undefined ? [] : [`e:${emailKey(c.email) ?? c.email}`]),
	];
	if (own.length > 0) return own;
	const g = c.guardian;
	if (g === undefined) return [];
	return [
		...(g.phone === undefined ? [] : [`g:${phoneKey(g.phone) ?? g.phone}:${nameKey(c.name)}`]),
		...(g.email === undefined ? [] : [`g:${emailKey(g.email) ?? g.email}:${nameKey(c.name)}`]),
	];
}

export interface DuplicateReport {
	line: number;
	/** Where the other copy is: an earlier line of the same file, or a client already stored. */
	with: "file" | "store";
	by: "phone" | "email" | "guardian";
	/** The earlier line, for a duplicate inside the file. */
	otherLine?: number;
}

/** Duplicates inside one file: a later row sharing a key with an earlier one is the duplicate. */
export function duplicatesInFile(
	rows: ReadonlyArray<{ line: number; client: ClientInput }>,
): DuplicateReport[] {
	const seen = new Map<string, number>();
	const out: DuplicateReport[] = [];
	for (const r of rows) {
		for (const key of identityKeys(r.client)) {
			const earlier = seen.get(key);
			if (earlier !== undefined) {
				out.push({
					line: r.line,
					with: "file",
					by: key.startsWith("p:") ? "phone" : key.startsWith("e:") ? "email" : "guardian",
					otherLine: earlier,
				});
				break;
			}
		}
		for (const key of identityKeys(r.client)) if (!seen.has(key)) seen.set(key, r.line);
	}
	return out;
}

/** The template: a header and two example rows, one adult and one child. */
export function templateCsv(): string {
	return [
		TEMPLATE_COLUMNS.join(","),
		'"Ion Popescu","0748 017 752","ion@example.ro",adult,,,,da,da,"preferă apelul dimineața"',
		'"Maria Popescu",,,copil,"Ana Popescu","0752 466 792","ana@example.ro",da,nu,',
	].join("\n");
}
