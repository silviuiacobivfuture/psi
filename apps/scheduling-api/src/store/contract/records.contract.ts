import { describe, expect, it } from "vitest";
import { createFieldCrypto } from "../../ports/crypto";
import { withActor } from "../actor";
import { StoreConflict, type StorePort } from "../types";
import type { ContractEnv, ContractSection } from "./env";

/**
 * The roster, leave, clinical records, files, builder definitions and import runs: the same behaviours on every
 * adapter. Who wrote a record or signed a file is the acting subject (`withActor`), as in a request. What the adapters may not share (Convex numbers the definition versions, assigns the ids, refuses an unknown
 * client) is not asserted here; the ids and versions used are the ones the store answered with.
 */
const crypto = createFieldCrypto("ab".repeat(32));
const NOW = Date.UTC(2026, 10, 13, 8, 0, 0);
const stamps = { createdAt: NOW, updatedAt: NOW };
const name = { ro: "Raport", en: "Report" };

async function person(store: StorePort, app: string, displayName: string): Promise<string> {
	return (
		await store.c.people.insert({
			id: "p0000000001",
			app,
			displayName,
			kind: "practitioner",
			active: true,
			external: false,
			...stamps,
		})
	).id;
}

async function client(store: StorePort, app: string): Promise<string> {
	return (
		await store.c.clients.insert({
			id: "c0000000001",
			app,
			name: "Client One",
			status: "active",
			treating: [],
			...stamps,
		})
	).id;
}

export const recordsContract: ContractSection = (env) => {
	const e = (): ContractEnv => env();

	describe("roster", () => {
		it("a day is made, read back by its id, listed by date and person, changed and removed", async () => {
			const { store } = e();
			const app = await e().newApp();
			const p = await person(store, app, "Dora");
			const q = await store.c.people.insert({
				id: "p0000000002",
				app,
				displayName: "Elena",
				kind: "practitioner",
				active: true,
				external: false,
				...stamps,
			});
			const day = await store.c.roster.insert({
				id: `${p}_2026-11-16`,
				app,
				personId: p,
				date: "2026-11-16",
				kind: "work",
				start: 540,
				end: 1020,
				...stamps,
			});
			expect(day).toMatchObject({
				personId: p,
				date: "2026-11-16",
				kind: "work",
				start: 540,
				end: 1020,
			});
			expect(day.id).toBe(`${p}_2026-11-16`);
			expect(await store.c.roster.get(app, day.id)).toMatchObject({ kind: "work", start: 540 });
			await store.c.roster.insert({
				id: `${q.id}_2026-11-16`,
				app,
				personId: q.id,
				date: "2026-11-16",
				kind: "leave_co",
				...stamps,
			});
			expect(await store.c.roster.list(app)).toHaveLength(2);
			expect(await store.c.roster.list(app, { eq: { personId: p } })).toHaveLength(1);
			expect(await store.c.roster.list(app, { eq: { date: "2026-11-17" } })).toHaveLength(0);
			const other = await store.c.roster.get(app, `${q.id}_2026-11-16`);
			expect(other).toMatchObject({ kind: "leave_co" });
			expect(Object.keys(other ?? {})).not.toContain("start");
			expect(
				await store.c.roster.replace({
					...day,
					kind: "free",
					start: undefined,
					end: undefined,
				} as never),
			).toBe(true);
			expect(await store.c.roster.get(app, day.id)).toMatchObject({ kind: "free" });
			expect(await store.c.roster.remove(app, day.id)).toBe(true);
			expect(await store.c.roster.get(app, day.id)).toBeUndefined();
			expect(await store.c.roster.remove(app, day.id)).toBe(false);
		});

		it("a day that exists is a conflict; an unknown one is not there; another app sees none of it", async () => {
			const { store } = e();
			const app = await e().newApp();
			const p = await person(store, app, "Dora");
			const row = {
				id: `${p}_2026-11-18`,
				app,
				personId: p,
				date: "2026-11-18",
				kind: "free" as const,
				...stamps,
			};
			await store.c.roster.insert(row);
			await expect(store.c.roster.insert(row)).rejects.toBeInstanceOf(StoreConflict);
			expect(
				await store.c.roster.replace({ ...row, id: `${p}_2026-12-01`, date: "2026-12-01" }),
			).toBe(false);
			expect(await store.c.roster.get(app, "nonsense")).toBeUndefined();
			const elsewhere = await e().newApp();
			expect(await store.c.roster.list(elsewhere)).toEqual([]);
			expect(await store.c.roster.get(elsewhere, row.id)).toBeUndefined();
		});
	});

	describe("leave", () => {
		it("a request is made pending, decided once, listed and removed", async () => {
			const { store } = e();
			const app = await e().newApp();
			const p = await person(store, app, "Dora");
			const leave = await store.c.leave.insert({
				id: "l0000000001",
				app,
				personId: p,
				from: "2026-12-01",
				to: "2026-12-03",
				kind: "co",
				status: "pending",
				...stamps,
			});
			expect(leave).toMatchObject({ personId: p, from: "2026-12-01", status: "pending" });
			expect(await store.c.leave.get(app, leave.id)).toMatchObject({ kind: "co" });
			expect(await store.c.leave.list(app, { eq: { personId: p } })).toHaveLength(1);
			expect(await store.c.leave.replace({ ...leave, status: "approved", decidedBy: "olga" })).toBe(
				true,
			);
			expect(await store.c.leave.get(app, leave.id)).toMatchObject({ status: "approved" });
			expect(await store.c.leave.list(app, { eq: { status: "pending" } })).toEqual([]);
			expect(await store.c.leave.remove(app, leave.id)).toBe(true);
			expect(await store.c.leave.get(app, leave.id)).toBeUndefined();
			expect(await store.c.leave.remove(app, leave.id)).toBe(false);
			expect(await store.c.leave.replace(leave)).toBe(false);
		});
	});

	describe("definitions", () => {
		const form = (app: string, id: string, fields: string[]) => ({
			id,
			app,
			kind: "forms" as const,
			version: 1,
			name,
			body: { kind: "session_report", fields },
			...stamps,
		});

		it("a definition is made at version 1, read by id and by kind, replaced as the next version, removed", async () => {
			const { store } = e();
			const app = await e().newApp();
			const made = await store.c.definitions.insert(form(app, "my-report", ["summary", "plan"]));
			expect(made.version).toBe(1);
			expect(await store.c.definitions.get(app, "my-report")).toMatchObject({
				kind: "forms",
				name,
				body: { kind: "session_report", fields: ["summary", "plan"] },
			});
			const view = await store.c.definitions.insert({
				id: "cal-default",
				app,
				kind: "views",
				version: 1,
				name,
				body: { columns: ["person"], nested: { a: [1, 2, { b: null }] } },
				...stamps,
			});
			expect(view.body).toEqual({ columns: ["person"], nested: { a: [1, 2, { b: null }] } });
			expect(await store.c.definitions.list(app, { eq: { kind: "views" } })).toHaveLength(1);
			expect(
				(await store.c.definitions.list(app, { eq: { kind: "forms" } })).map((d) => d.id),
			).toContain("my-report");
			expect(
				await store.c.definitions.replace({
					...made,
					version: 2,
					body: { kind: "questionnaire", fields: ["a"] },
				}),
			).toBe(true);
			expect(await store.c.definitions.get(app, "my-report")).toMatchObject({
				version: 2,
				body: { kind: "questionnaire", fields: ["a"] },
			});
			expect(await store.c.definitions.remove(app, "cal-default")).toBe(true);
			expect(await store.c.definitions.get(app, "cal-default")).toBeUndefined();
			expect(await store.c.definitions.remove(app, "cal-default")).toBe(false);
			expect(await store.c.definitions.replace({ ...view, id: "nothing-here" })).toBe(false);
		});

		it("an id that exists is a conflict, and a definition belongs to its app", async () => {
			const { store } = e();
			const app = await e().newApp();
			await store.c.definitions.insert(form(app, "one-form", ["a"]));
			await expect(store.c.definitions.insert(form(app, "one-form", ["a"]))).rejects.toBeInstanceOf(
				StoreConflict,
			);
			const elsewhere = await e().newApp();
			expect(await store.c.definitions.get(elsewhere, "one-form")).toBeUndefined();
		});
	});

	describe("records", () => {
		it("a record is sealed, stored, listed by client and form, changed, read back opened, and removed", async () => {
			const { store } = e();
			const app = await e().newApp();
			const c = await client(store, app);
			const f = await store.c.definitions.insert({
				id: "session-report",
				app,
				kind: "forms",
				version: 1,
				name,
				body: { kind: "session_report", fields: ["summary"] },
				...stamps,
			});
			const context = `${app}:client:${c}:record`;
			const sealed = crypto.seal(JSON.stringify({ summary: "synthetic" }), context);
			const rec = await withActor("dora", () =>
				store.c.records.insert({
					id: "x0000000001",
					app,
					clientId: c,
					formId: f.id,
					formVersion: f.version,
					authorSubject: "dora",
					sealed,
					...stamps,
				}),
			);
			expect(rec).toMatchObject({
				clientId: c,
				formId: f.id,
				formVersion: f.version,
				authorSubject: "dora",
			});
			const read = await store.c.records.get(app, rec.id);
			expect(crypto.open(read?.sealed ?? "", context)).toBe('{"summary":"synthetic"}');
			expect(JSON.stringify(read)).not.toContain("synthetic-plain");
			expect(await store.c.records.list(app, { eq: { clientId: c } })).toHaveLength(1);
			expect(await store.c.records.list(app, { eq: { formId: f.id } })).toHaveLength(1);
			expect(await store.c.records.list(app, { eq: { formId: "other-form" } })).toHaveLength(0);
			const changed = crypto.seal(JSON.stringify({ summary: "changed" }), context);
			expect(await store.c.records.replace({ ...rec, sealed: changed })).toBe(true);
			expect(crypto.open((await store.c.records.get(app, rec.id))?.sealed ?? "", context)).toBe(
				'{"summary":"changed"}',
			);
			const elsewhere = await e().newApp();
			expect(await store.c.records.get(elsewhere, rec.id)).toBeUndefined();
			expect(await store.c.records.list(elsewhere)).toEqual([]);
			expect(await store.c.records.remove(elsewhere, rec.id)).toBe(false);
			expect(await store.c.records.remove(app, rec.id)).toBe(true);
			expect(await store.c.records.get(app, rec.id)).toBeUndefined();
			expect(await store.c.records.remove(app, rec.id)).toBe(false);
			expect(await store.c.records.replace(rec)).toBe(false);
		});
	});

	describe("files", () => {
		it("a file is pending until completed; listed by client; removed", async () => {
			const { store } = e();
			const app = await e().newApp();
			const c = await client(store, app);
			const file = await withActor("dora", () =>
				store.c.files.insert({
					id: "f0000000001",
					app,
					clientId: c,
					name: "scan.pdf",
					contentType: "application/pdf",
					size: 1234,
					status: "pending",
					uploadedBy: "dora",
					objectKey: `${app}/${c}/key-one`,
					...stamps,
				}),
			);
			expect(file).toMatchObject({
				clientId: c,
				name: "scan.pdf",
				size: 1234,
				status: "pending",
				objectKey: `${app}/${c}/key-one`,
			});
			expect(await store.c.files.get(app, file.id)).toMatchObject({
				status: "pending",
				uploadedBy: "dora",
			});
			expect(await store.c.files.replace({ ...file, status: "ready" })).toBe(true);
			expect(await store.c.files.get(app, file.id)).toMatchObject({ status: "ready" });
			expect(await store.c.files.list(app, { eq: { clientId: c } })).toHaveLength(1);
			expect(await store.c.files.list(app, { eq: { status: "pending" } })).toHaveLength(0);
			expect(await store.c.files.list(app)).toHaveLength(1);
			const elsewhere = await e().newApp();
			expect(await store.c.files.get(elsewhere, file.id)).toBeUndefined();
			expect(await store.c.files.remove(elsewhere, file.id)).toBe(false);
			expect(await store.c.files.remove(app, file.id)).toBe(true);
			expect(await store.c.files.get(app, file.id)).toBeUndefined();
			expect(await store.c.files.remove(app, file.id)).toBe(false);
			expect(await store.c.files.replace(file)).toBe(false);
		});
	});

	describe("imports", () => {
		it("a new app has no import runs", async () => {
			const { store } = e();
			const app = await e().newApp();
			expect(await store.c.imports.list(app)).toEqual([]);
			expect(await store.c.imports.get(app, "imp-1")).toBeUndefined();
		});
	});
};
