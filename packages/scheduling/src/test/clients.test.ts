import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { SchedulingConfig } from "../config";
import {
	duplicatesInFile,
	emailKey,
	nameKey,
	parseCsv,
	phoneKey,
	readClients,
	templateCsv,
} from "../domain/clients";
import { createStaffSchedulingClient } from "../staff-client";

describe("reading the owner's CSV", () => {
	it("writes one phone one way, whatever the spacing, prefix or punctuation", () => {
		for (const raw of [
			"0748 017 752",
			"+40 748 017 752",
			"0040748017752",
			"0748-017-752",
			"40748017752",
		]) {
			expect(phoneKey(raw)).toBe("0748017752");
		}
		expect(phoneKey("12")).toBeUndefined();
		expect(phoneKey("abc")).toBeUndefined();
		expect(emailKey(" Ion@Example.RO ")).toBe("ion@example.ro");
		expect(emailKey("not an email")).toBeUndefined();
		expect(nameKey("  Ștefan   ȚURCANU ")).toBe("stefan turcanu");
	});
	it("parses commas and Excel's semicolons, quotes, doubled quotes, a BOM and CRLF", () => {
		expect(parseCsv('﻿a;b;c\r\n"x;1";"he said ""hi""";z\r\n')).toEqual([
			["a", "b", "c"],
			["x;1", 'he said "hi"', "z"],
		]);
		expect(parseCsv("a,b\n1,2\n\n3,4")).toEqual([
			["a", "b"],
			["1", "2"],
			["3", "4"],
		]);
	});
	it("reads the template: an adult, and a child with a guardian", () => {
		const { rows, problems } = readClients(templateCsv());
		expect(problems).toEqual([]);
		expect(rows).toHaveLength(2);
		expect(rows[0]?.client).toMatchObject({
			name: "Ion Popescu",
			kind: "adult",
			phone: "0748017752",
			email: "ion@example.ro",
			consent: { contact: true, reminders: true },
			staffNotes: "preferă apelul dimineața",
		});
		expect(rows[1]?.client).toMatchObject({
			name: "Maria Popescu",
			kind: "child",
			guardian: { name: "Ana Popescu", phone: "0752466792", email: "ana@example.ro" },
			consent: { contact: true, reminders: false },
		});
	});
	it("reports each bad row with its line and reason, imports the good ones, and refuses a file with no header", () => {
		const csv = [
			"nume,telefon,email,tip,tutore_nume,tutore_telefon,tutore_email,consimtamant_contact,consimtamant_memento,note_staff",
			",0748017752,,adult,,,,da,da,",
			"Ana,123,,adult,,,,da,da,",
			"Bob,,bob@x,adult,,,,da,da,",
			"Cip,,,adult,,,,da,da,",
			"Dan,0748017752,,copil,,,,da,da,",
			"Eva,0748017752,,copil,Mama,,,da,da,",
			"Fan,0748017752,,adult,,,,poate,da,",
			`Gus,0748017752,,adult,,,,da,da,${"x".repeat(501)}`,
			"Hai,0748017752,,martian,,,,da,da,",
			"Ioan,0748017752,,adolescent,Tata,0752466792,,nu,nu,",
		].join("\n");
		const { rows, problems } = readClients(csv);
		expect(problems.map((p) => [p.line, p.problem])).toEqual([
			[2, "name"],
			[3, "phone"],
			[4, "email"],
			[5, "contact"],
			[6, "guardian"],
			[7, "guardian_contact"],
			[8, "consent"],
			[9, "note_length"],
			[10, "kind"],
		]);
		expect(rows.map((r) => r.client.name)).toEqual(["Ioan"]);
		expect(readClients("telefon\n0748017752")).toEqual({
			rows: [],
			problems: [{ line: 0, problem: "header" }],
		});
		expect(readClients("")).toEqual({ rows: [], problems: [{ line: 0, problem: "header" }] });
	});
	it("finds duplicates inside the file by phone, e-mail, or a guardian's contact with the same child", () => {
		const csv = [
			"nume,telefon,email,tip,tutore_nume,tutore_telefon,consimtamant_contact,consimtamant_memento",
			"Ion,0748017752,,adult,,,da,da",
			"Ion P,+40748017752,,adult,,,da,da",
			"Ana,,ana@x.ro,adult,,,da,da",
			"Ana 2,,ANA@x.ro,adult,,,da,da",
			"Mia,,,copil,Mama,0752466792,da,da",
			"Mia,,,copil,Mama,0752 466 792,da,da",
			"Leo,,,copil,Mama,0752466792,da,da",
		].join("\n");
		const { rows } = readClients(csv);
		expect(duplicatesInFile(rows).map((d) => [d.line, d.by, d.otherLine])).toEqual([
			[3, "phone", 2],
			[5, "email", 4],
			[7, "guardian", 6],
		]);
	});
});

const PKG = resolve(import.meta.dirname, "../..");
const KEY_FILE = resolve(PKG, "../../.data/convex/secrets/server-key");
const URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const reachable = await fetch(`${URL}/version`, { signal: AbortSignal.timeout(2_000) })
	.then((r) => r.ok)
	.catch(() => false);
const ready = reachable && existsSync(KEY_FILE) && existsSync(join(dirname(KEY_FILE), "admin-key"));
const TENANT = `test-clients-${Date.now().toString(36)}`;
const actor = { subject: "cms:test-clients" };
const config = (): SchedulingConfig => ({
	url: URL,
	serverKey: ready ? readFileSync(KEY_FILE, "utf8").trim() : "",
	timeoutMs: 10_000,
});

describe.skipIf(!ready)("importing clients into the local Convex", () => {
	const staff = createStaffSchedulingClient(config());
	const rows = readClients(templateCsv()).rows;

	afterAll(() => {
		execFileSync(
			join(PKG, "scripts/convex.sh"),
			["run", "seed:dropFixture", JSON.stringify({ tenant: TENANT })],
			{ cwd: PKG, stdio: ["ignore", "pipe", "pipe"] },
		);
	});

	it("a dry run reports and writes nothing", async () => {
		const r = await staff.importClients({ tenant: TENANT, rows, commit: false, actor });
		expect(r).toEqual({ ok: true, committed: false, total: 2, created: 2, duplicates: [] });
		expect(await staff.clients({ tenant: TENANT, prefix: "" })).toEqual({ ok: true, clients: [] });
	});
	it("a commit stores them, and the same file again creates nothing and names every duplicate", async () => {
		expect(await staff.importClients({ tenant: TENANT, rows, commit: true, actor })).toMatchObject({
			committed: true,
			created: 2,
		});
		const again = await staff.importClients({ tenant: TENANT, rows, commit: true, actor });
		expect(again).toMatchObject({ ok: true, created: 0 });
		expect(again.ok && again.duplicates.map((d) => [d.line, d.with, d.by])).toEqual([
			[2, "store", "phone"],
			[3, "store", "guardian"],
		]);
		const list = await staff.clients({ tenant: TENANT, prefix: "" });
		expect(list.clients.map((c) => c.name).sort()).toEqual(["Ion Popescu", "Maria Popescu"]);
		expect(list.clients.find((c) => c.name === "Maria Popescu")?.guardian?.name).toBe(
			"Ana Popescu",
		);
		expect((await staff.clients({ tenant: TENANT, prefix: "Ma" })).clients).toHaveLength(1);
	});
	it("refuses a row that is not sound, writing nothing, and a duplicate added by hand", async () => {
		const bad = {
			line: 2,
			client: { name: "X", kind: "child" as const, consent: { contact: true, reminders: true } },
		};
		expect(await staff.importClients({ tenant: TENANT, rows: [bad], commit: true, actor })).toEqual(
			{ ok: false, reason: "invalid" },
		);
		expect(await staff.importClients({ tenant: "Bad Tenant", rows, commit: true, actor })).toEqual({
			ok: false,
			reason: "invalid",
		});
		const ion = rows[0]?.client;
		if (ion === undefined) throw new Error("no row");
		expect(await staff.createClient({ tenant: TENANT, client: ion, actor })).toEqual({
			ok: false,
			reason: "duplicate",
		});
		const made = await staff.createClient({
			tenant: TENANT,
			client: { ...ion, name: "Nou", phone: "0700111222", email: undefined },
			actor,
		});
		expect(made.ok).toBe(true);
		expect((await staff.clients({ tenant: TENANT, prefix: "" })).clients).toHaveLength(3);
	});
	it("erases a client and frees their keys, and refuses another tenant's", async () => {
		const list = await staff.clients({ tenant: TENANT, prefix: "Nou" });
		const id = list.clients[0]?.id ?? "";
		expect(await staff.eraseClient({ tenant: "test-clients-other", client: id, actor })).toEqual({
			ok: false,
			reason: "not_found",
		});
		expect(await staff.eraseClient({ tenant: TENANT, client: id, actor })).toEqual({
			ok: true,
			unlinked: 0,
		});
		expect(await staff.eraseClient({ tenant: TENANT, client: id, actor })).toEqual({
			ok: false,
			reason: "not_found",
		});
		const again = await staff.createClient({
			tenant: TENANT,
			client: {
				name: "Nou",
				kind: "adult",
				phone: "0700111222",
				consent: { contact: false, reminders: false },
			},
			actor,
		});
		expect(again.ok).toBe(true);
	});
});
