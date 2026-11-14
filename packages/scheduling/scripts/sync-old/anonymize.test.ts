import { describe, expect, it } from "vitest";
import { cloneExport, SENTINELS } from "../import-old/fixture";
import { runImport } from "../import-old/run";
import { MAPPING } from "../import-old/sentinels";
import { anonymizeExport, MIN_PDF, PLACEHOLDER } from "./anonymize";
import type { OldExport } from "./old-app";

type Row = Record<string, unknown>;

/** The fixture, with the real-looking identifiers the importer's own fixture leaves empty. */
function realistic(): OldExport {
	const data = cloneExport();
	const rows = (t: string): Row[] => data.tables[t] as Row[];
	const [first, second, third] = rows("clients");
	Object.assign(first ?? {}, {
		name: "Maria Ionescu",
		phone: "0723 456 789",
		email: "maria.ionescu@example.com",
		gender: "feminin",
		birth_date: "2016-09-14",
		occupation: "Profesoară de matematică",
		location: "Galați, str. Brăilei 12",
		referral_source: "Recomandat de doamna Elena Popa de la grădiniță",
		tutor_name: "Gheorghe Ionescu",
		tutor_phone: "0744 111 222",
		tutor_email: "gheorghe@example.com",
		tutor_occupation: "Șofer",
		notes: "Alergic la penicilină, mama a divorțat",
	});
	Object.assign(second ?? {}, {
		name: "Andrei Stoica",
		gender: "masculin",
		email: "andrei@example.com",
	});
	Object.assign(third ?? {}, { name: "Lupu Vasile", phone: "0733 999 000" });
	Object.assign(rows("appointments")[0] ?? {}, {
		notes: "sună mama pe 0711 222 333",
		therapist_notes: "Copilul a plâns la despărțire",
	});
	Object.assign(rows("client_subscriptions")[0] ?? {}, { notes: "A plătit Elena Popa cash" });
	Object.assign(rows("staff_schedule")[0] ?? {}, { notes: "Concediu medical Ana Dumitrescu" });
	Object.assign(rows("staff_blocks")[0] ?? {}, {
		reason: "Concediu Dumitrescu",
		notes: "Operație la genunchi",
	});
	Object.assign(rows("optimo_volunteers")[0] ?? {}, { name: "Cristian Voluntar Radu" });
	return data;
}

const strings = (v: unknown, into: string[] = []): string[] => {
	if (typeof v === "string") into.push(v);
	else if (Array.isArray(v)) for (const x of v) strings(x, into);
	else if (typeof v === "object" && v !== null) for (const x of Object.values(v)) strings(x, into);
	return into;
};

/** Every real identifier in the fixture: the values of the columns that name, reach or describe a person. */
function identifiers(data: OldExport): string[] {
	const pick = (table: string, columns: string[]): string[] =>
		(data.tables[table] as Row[]).flatMap((r) =>
			columns.map((c) => r[c]).filter((v): v is string => typeof v === "string" && v.trim() !== ""),
		);
	return [
		...pick("clients", [
			"name",
			"phone",
			"email",
			"occupation",
			"location",
			"referral_source",
			"tutor_name",
			"tutor_phone",
			"tutor_email",
			"tutor_occupation",
			"notes",
			"main_reason",
			"child_diagnosis",
		]),
		...pick("appointments", ["notes", "therapist_notes"]),
		...pick("client_subscriptions", ["notes"]),
		...pick("staff_schedule", ["notes"]),
		...pick("staff_blocks", ["reason", "notes"]),
		...pick("optimo_volunteers", ["name"]),
		...pick("client_files", ["file_name"]),
		...pick("avize", ["title", "file_name"]),
	];
}

describe("the anonymizer leaves no real identifier", () => {
	const data = realistic();
	const before = JSON.stringify(data);
	const out = anonymizeExport(data);
	const text = JSON.stringify(out.export);

	it("none of the real names, phones, e-mails, places, notes or file names survives anywhere in the export", () => {
		const real = identifiers(data);
		expect(real.length).toBeGreaterThan(30);
		for (const value of real) expect(text, `"${value}" survived`).not.toContain(value);
		for (const sentinel of Object.values(SENTINELS)) expect(text).not.toContain(sentinel);
		for (const fragment of [
			"Test Client",
			"Test Guardian",
			"0700 000",
			"Test notice",
			"Test Volunteer",
			"mama",
			"genunchi",
			"penicilină",
			"Dumitrescu",
		])
			expect(text).not.toContain(fragment);
	});

	it("does not change the input", () => {
		expect(JSON.stringify(data)).toBe(before);
	});

	it("birth day goes, the year stays (so ages stay right); a missing one stays missing", () => {
		const clients = out.export.tables.clients as Row[];
		expect(clients[0]?.birth_date).toBe("2016-01-01");
		expect(clients[1]?.birth_date).toBeNull();
	});

	it("names are the same as the first anonymizer made for the same client (same hash, same lists)", () => {
		const named = (n: number, gender: unknown): string => {
			const probe = anonymizeExport({
				exported_at: "2026-01-01T00:00:00Z",
				tables: { clients: [{ id: n, gender, name: "x" }] },
			});
			return String((probe.export.tables.clients as Row[])[0]?.name);
		};
		// Reference values from the Python anonymizer (python3 anonymize.py), keys c<id>.
		expect(named(1, "feminin")).toBe("Bianca Gheorghe");
		expect(named(2, "masculin")).toBe("Bogdan Voicu");
		expect(named(3, null)).toBe("Cosmin Gheorghe");
		expect(named(218, "")).toBe("Sorin Neagu");
	});

	it("contacts are dummy values that cannot reach anyone", () => {
		const c = (out.export.tables.clients as Row[])[0];
		expect(c?.email).toBe("client1@exemplu.invalid");
		expect(c?.tutor_email).toBe("tutore1@exemplu.invalid");
		expect(c?.phone).toBe("0710000001");
		expect(c?.tutor_phone).toBe("0720000001");
		expect(c?.notes).toBe(PLACEHOLDER);
		expect(c?.location).toBe("Localitate de test");
	});

	it("keeps ids, dates, services, money, status and the staff exactly as they were", () => {
		const keep = [
			"therapists",
			"group_activities",
			"staff_schedule",
			"client_subscriptions",
			"appointments",
			"staff_blocks",
		];
		const clean = (r: Row): Row => {
			const { notes: _n, therapist_notes: _t, reason: _r, ...rest } = r;
			return rest;
		};
		for (const table of keep) {
			expect((out.export.tables[table] as Row[]).map(clean)).toEqual(
				(data.tables[table] as Row[]).map(clean),
			);
		}
		const kept = ["id", "status", "gender", "created_at", "is_archived", "therapist_id"];
		for (const [i, c] of (out.export.tables.clients as Row[]).entries())
			for (const k of kept)
				expect(c[k], `clients[${i}].${k}`).toEqual((data.tables.clients as Row[])[i]?.[k] ?? c[k]);
		expect(out.export.exported_at).toBe(data.exported_at);
		expect(out.export.anonymized).toBe(true);
	});

	it("every feedback text is the stand-in, the labels and dates are kept", () => {
		for (const table of [
			"session_feedback",
			"racemeup_feedback",
			"psychotherapy_feedback",
			"parent_feedback",
		]) {
			for (const row of out.export.tables[table] as Row[]) {
				for (const [k, v] of Object.entries(row)) {
					if (
						typeof v !== "string" ||
						[
							"created_at",
							"updated_at",
							"date",
							"format",
							"presence",
							"session_number",
							"duration_min",
						].includes(k)
					)
						continue;
					expect(v === "" || v === PLACEHOLDER, `${table}.${k}`).toBe(true);
				}
			}
		}
	});

	it("client files and notices become the one placeholder document: names, paths, sizes and bytes", async () => {
		const files = out.export.tables.client_files as Row[];
		const avize = out.export.tables.avize as Row[];
		expect(files[0]).toMatchObject({
			file_name: "document-1.pdf",
			file_path: "1/document-1.pdf",
			file_type: "application/pdf",
			file_size: MIN_PDF.length,
		});
		expect(avize[0]).toMatchObject({
			title: "Document 1",
			file_name: "aviz-1.pdf",
			file_path: "aviz-1.pdf",
		});
		expect(await out.files.read("client-files", "1/document-1.pdf")).toEqual(MIN_PDF);
		expect(await out.files.read("avize", "aviz-1.pdf")).toEqual(MIN_PDF);
		// The real paths are not served: the real bytes cannot come out of the anonymized source.
		expect(await out.files.read("client-files", "1/report.pdf")).toBeUndefined();
		expect(await out.files.read("avize", "notice.txt")).toBeUndefined();
		expect(strings(out.export)).not.toContain(SENTINELS.fileBytes);
	});

	it("is deterministic: the same export gives the same copy", () => {
		expect(JSON.stringify(anonymizeExport(realistic()).export)).toBe(text);
	});

	it("an export with no rows, or rows without the columns, is handled", () => {
		const empty = anonymizeExport({ exported_at: "2026-01-01T00:00:00Z", tables: {} });
		expect(empty.export.tables).toEqual({});
		const bare = anonymizeExport({
			exported_at: "2026-01-01T00:00:00Z",
			tables: { clients: [{ id: 5 }], optimo_volunteers: [{ id: 2 }] },
		});
		expect((bare.export.tables.clients as Row[])[0]?.name).toEqual(expect.any(String));
	});
});

describe("the anonymized export is still importable", () => {
	it("maps to the same counts and gains no blocking anomaly", async () => {
		const base = {
			mapping: MAPPING,
			ignoreTables: [] as string[],
			allowSkips: true,
			connect: undefined,
		};
		const out = anonymizeExport(realistic());
		const real = await runImport({ ...base, exported: realistic(), files: undefined });
		const anon = await runImport({ ...base, exported: out.export, files: out.files });
		const counts = (r: typeof real) =>
			r.tables
				.filter((t) => !["client_files", "avize"].includes(t.table))
				.map((t) => [t.table, t.planned]);
		expect(counts(anon)).toEqual(counts(real));
		expect(anon.anomalies.filter((a) => a.severity === "blocking")).toEqual([]);
		// The only blocking anomalies of the original are its files (this test gives it no file source).
		expect(real.anomalies.filter((a) => a.severity === "blocking").map((a) => a.code)).toEqual([
			"files_dir_required",
		]);
	});
});
