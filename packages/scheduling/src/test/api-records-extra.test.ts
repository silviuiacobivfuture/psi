import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { actor, enc, harness, id, result } from "./api-harness";
import { callMutation, callQuery } from "./server";

/**
 * The staff API's additions (apiRecordsExtra): reads that write no audit event, a file pending until complete, leave
 * requests and their decision, the builder's definitions as the API takes them (a form is mirrored as a template that
 * records can be written against), the import runs. Each is refused without the key and then writes nothing; a write
 * appends exactly one audit event (a new form two: the template and the definition). Synthetic data, throwaway app.
 */
if (!backendReady) console.warn("api-records-extra.test: no local backend; see README");

const { TENANT, counts, mut, qry } = harness("extra");
const body = JSON.stringify({ kind: "session_report", fields: ["summary", "plan"] });
const name = { ro: "Raport", en: "Report" };

describe.skipIf(!backendReady)("apiRecordsExtra", () => {
	const ids: Record<string, string> = {};

	beforeAll(async () => {
		if (!backendReady) return;
		await runMutation(
			"clinicApps:ensureApp",
			{ slug: TENANT, name: "T", kind: "clinic", defaultLocale: "ro", currency: "RON" },
			z.unknown(),
		);
		const people = await runMutation(
			"importPeople:upsertPractitioners",
			{
				tenant: TENANT,
				rows: [
					{
						legacyId: "t:1",
						fingerprint: "a",
						slug: "t-one",
						displayName: "Test One",
						active: true,
					},
				],
			},
			z.array(z.object({ id: z.string() })),
		);
		ids.p1 = people[0]?.id ?? "";
		ids.c1 = id(
			result.parse(
				await callMutation("apiClients:create", {
					tenant: TENANT,
					actor,
					client: {
						name: "Test Client",
						kind: "adult",
						consent: { contact: true, reminders: false },
					},
				}),
			),
		);
	});
	afterAll(async () => {
		if (backendReady) await runMutation("seed:dropFixture", { tenant: TENANT }, z.unknown());
	});

	it("a form is a definition and a template; a replace is the next version of both", async () => {
		const first = await mut(
			"apiDefinitionsExtra:putDefinition",
			{ id: "my-report", kind: "forms", name, body },
			{ audit: 2 },
		);
		expect(first.version).toBe(1);
		const second = await mut(
			"apiDefinitionsExtra:putDefinition",
			{ id: "my-report", kind: "forms", name, body },
			{ audit: 2 },
		);
		expect(second.version).toBe(2);
		const listed = z
			.array(z.object({ id: z.string(), version: z.number(), body: z.string() }))
			.parse((await qry("apiDefinitionsExtra:listDefinitions", { id: "my-report" })).definitions);
		expect(listed).toEqual([expect.objectContaining({ id: "my-report", version: 2, body })]);
		// records are written against the template, at the version the definition has
		const rec = await mut("apiRecords:writeRecord", {
			definitionKey: "my-report",
			definitionVersion: 2,
			client: ids.c1,
			payload: enc,
		});
		expect(rec.ok).toBe(true);
	});

	it("a definition keeps one kind; a form key must be a template key; other kinds have no template", async () => {
		await mut(
			"apiDefinitionsExtra:putDefinition",
			{ id: "my-report", kind: "views", name, body: "{}" },
			{ ok: false, audit: 0 },
		);
		await mut(
			"apiDefinitionsExtra:putDefinition",
			{ id: "Bad_Key", kind: "forms", name, body },
			{ ok: false, audit: 0 },
		);
		const view = await mut("apiDefinitionsExtra:putDefinition", {
			id: "cal-default",
			kind: "views",
			name,
			body: "{}",
		});
		expect(view.version).toBe(1);
		await mut(
			"apiDefinitionsExtra:putDefinition",
			{ id: "x-kind", kind: "nonsense", name, body },
			{ ok: false, audit: 0 },
		);
	});

	it("a seeded template is listed as the API's own shape; removing a definition retires its template", async () => {
		const seeded = z
			.array(z.object({ id: z.string(), body: z.string() }))
			.parse((await qry("apiDefinitionsExtra:listDefinitions", {})).definitions);
		expect(seeded.find((d) => d.id === "aba-session-report")).toBeDefined();
		await mut("apiDefinitionsExtra:removeDefinition", { id: "cal-default" });
		await mut(
			"apiDefinitionsExtra:removeDefinition",
			{ id: "cal-default" },
			{ ok: false, audit: 0 },
		);
		await mut("apiDefinitionsExtra:removeDefinition", { id: "my-report" });
		const refused = await mut(
			"apiRecords:writeRecord",
			{ definitionKey: "my-report", definitionVersion: 2, client: ids.c1, payload: enc },
			{ ok: false, audit: 0 },
		);
		expect(refused.reason).toBe("unknown_form");
	});

	it("records are read without an audit event, by id and by client", async () => {
		await mut(
			"apiDefinitionsExtra:putDefinition",
			{ id: "other-report", kind: "forms", name, body },
			{ audit: 2 },
		);
		const made = await mut("apiRecords:writeRecord", {
			definitionKey: "other-report",
			definitionVersion: 1,
			client: ids.c1,
			payload: enc,
		});
		const one = await qry("apiRecordsExtra:recordById", { record: id(made) }, { audit: 0 });
		expect(one.record).toMatchObject({
			definitionKey: "other-report",
			client: ids.c1,
			payload: enc,
		});
		const list = z
			.array(z.object({ id: z.string() }))
			.parse((await qry("apiRecordsExtra:recordsList", { client: ids.c1 })).records);
		expect(list.map((r) => r.id)).toContain(id(made));
		// an id of another table is not a record
		expect(
			result.parse(
				await callQuery("apiRecordsExtra:recordById", { tenant: TENANT, record: ids.c1 }),
			).ok,
		).toBe(false);
	});

	it("a file is pending until it is complete, and its reads write nothing", async () => {
		const made = await mut("apiRecordsExtra:initFile", {
			client: ids.c1,
			fileName: "scan.pdf",
			storageKey: "a/b/c",
			sizeBytes: 10,
			contentType: "application/pdf",
		});
		const read = async () =>
			(
				(await qry("apiRecordsExtra:fileById", { file: id(made) }, { audit: 0 })) as {
					file: { status: string; completedAt?: number };
				}
			).file;
		expect((await read()).status).toBe("pending");
		await mut("apiRecordsExtra:completeFile", { file: id(made) });
		const done = await read();
		expect(done.status).toBe("ready");
		expect(done.completedAt).toBeGreaterThan(0);
		const all = z
			.array(z.object({ id: z.string() }))
			.parse((await qry("apiRecordsExtra:clientFiles", {})).files);
		expect(all.map((f) => f.id)).toContain(id(made));
	});

	it("leave is asked, then decided once", async () => {
		const person = { kind: "practitioner", id: ids.p1 };
		const made = await mut("apiLeaveExtra:createLeave", {
			person,
			from: "2026-12-01",
			to: "2026-12-03",
			kind: "co",
		});
		await mut(
			"apiLeaveExtra:createLeave",
			{ person, from: "2026-12-05", to: "2026-12-03", kind: "co" },
			{ ok: false, audit: 0 },
		);
		await mut(
			"apiLeaveExtra:createLeave",
			{ person: { kind: "staff", id: ids.c1 }, from: "2026-12-01", to: "2026-12-03", kind: "co" },
			{ ok: false, audit: 0 },
		);
		await mut("apiLeaveExtra:decideLeave", { leave: id(made), decision: "approved" });
		const again = await mut(
			"apiLeaveExtra:decideLeave",
			{ leave: id(made), decision: "rejected" },
			{ ok: false, audit: 0 },
		);
		expect(again.reason).toBe("not_allowed");
		const one = z
			.array(z.object({ status: z.string(), decidedBy: z.string().optional() }))
			.parse((await qry("apiLeaveExtra:leaves", { leave: id(made) })).leaves);
		expect(one).toEqual([{ ...one[0], status: "approved", decidedBy: actor.subject }]);
		await mut("apiLeaveExtra:removeLeave", { leave: id(made) });
		await mut("apiLeaveExtra:removeLeave", { leave: id(made) }, { ok: false, audit: 0 });
	});

	it("import runs are derived from the import's audit events and count what was imported", async () => {
		const runs = z
			.array(z.object({ counts: z.record(z.string(), z.number()) }))
			.parse((await qry("apiRecordsExtra:importRuns", {})).runs);
		expect(runs).toEqual([{ counts: { practitioners: 1 } }]);
	});

	it("every function refuses without the key and a wrong one, and writes nothing", async () => {
		const before = await counts();
		for (const [fn, kind, args] of [
			[
				"apiDefinitionsExtra:putDefinition",
				"mutation",
				{ actor, id: "zzz-form", kind: "forms", name, body },
			],
			[
				"apiRecordsExtra:initFile",
				"mutation",
				{ actor, client: ids.c1, fileName: "a", storageKey: "k", sizeBytes: 1, contentType: "x/y" },
			],
			[
				"apiLeaveExtra:createLeave",
				"mutation",
				{
					actor,
					person: { kind: "practitioner", id: ids.p1 },
					from: "2026-12-01",
					to: "2026-12-02",
					kind: "co",
				},
			],
			["apiRecordsExtra:recordsList", "query", {}],
			["apiRecordsExtra:importRuns", "query", {}],
		] as const) {
			const call = kind === "mutation" ? callMutation : callQuery;
			await expect(call(fn, { tenant: TENANT, ...args }, null)).rejects.toThrow();
			await expect(call(fn, { tenant: TENANT, ...args }, "x".repeat(40))).rejects.toThrow();
		}
		expect(await counts()).toEqual(before);
	});
});
