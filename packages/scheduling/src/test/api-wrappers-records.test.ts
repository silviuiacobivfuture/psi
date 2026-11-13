import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, dumpTable, runMutation } from "./admin";
import { actor, DAY, enc, HOUR, harness, id, n, result } from "./api-harness";
import { callMutation, callQuery } from "./server";

/**
 * Server-keyed clinic wrappers, part 2 (records and files, roles and access, the builder, the audit log, per-app isolation, the change feed). Records are ciphertext in and out and every read is audited. Synthetic data, in a throwaway `test-api2-…` app.
 */
if (!backendReady) console.warn("api-wrappers-records.test: no local backend; see README");

const { TENANT, counts, mut, qry } = harness("api2");

describe.skipIf(!backendReady)("the server-keyed clinic wrappers, part 2", () => {
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
						legacyId: "therapists:1",
						fingerprint: "a",
						slug: "t-one",
						displayName: "Test Therapist One",
						active: true,
					},
					{
						legacyId: "therapists:2",
						fingerprint: "b",
						slug: "t-two",
						displayName: "Test Therapist Two",
						active: true,
					},
				],
			},
			z.array(z.object({ id: z.string() })),
		);
		ids.p1 = people[0]?.id ?? "";
		ids.p2 = people[1]?.id ?? "";
		const client = {
			name: "Test Client A",
			kind: "adult",
			phone: "0700 000 001",
			consent: { contact: true, reminders: false },
		};
		for (const [key, name] of [
			["c1", "Test Client A"],
			["c2", "Test Client B"],
		] as const) {
			const made = result.parse(
				await callMutation("apiClients:create", {
					tenant: TENANT,
					actor,
					client: { ...client, name },
				}),
			);
			ids[key] = id(made);
		}
		ids.v1 = id(
			result.parse(
				await callMutation("apiVisits:create", {
					tenant: TENANT,
					actor,
					column: { kind: "practitioner", id: ids.p1 },
					client: ids.c1,
					start: Date.now() + 3 * DAY,
					end: Date.now() + 3 * DAY + HOUR,
					sessionType: "ABA",
				}),
			),
		);
	});
	afterAll(async () => {
		if (backendReady) await runMutation("seed:dropFixture", { tenant: TENANT }, z.unknown());
	});

	it("records and files: ciphertext in, ciphertext out, every read audited", async () => {
		const start = Date.now() + 9 * DAY;
		ids.vr = id(
			await mut("apiVisits:create", {
				column: { kind: "practitioner", id: ids.p2 },
				client: ids.c2,
				start,
				end: start + HOUR,
				sessionType: "ABA",
			}),
		);
		const base = {
			definitionKey: "aba-session-report",
			definitionVersion: 1,
			client: ids.c2,
			payload: enc,
		};
		ids.rec = id(
			await mut("apiRecords:writeRecord", { ...base, visit: ids.vr, practitioner: ids.p2 }),
		);
		await mut(
			"apiRecords:writeRecord",
			{ ...base, definitionKey: "nope" },
			{ audit: 0, ok: false },
		);
		await mut("apiRecords:updateRecord", {
			record: ids.rec,
			payload: { ...enc, data: "bmV3" },
			expectedVersion: 1,
		});
		await mut(
			"apiRecords:updateRecord",
			{ record: ids.rec, payload: enc, expectedVersion: 1 },
			{ audit: 0, ok: false },
		);
		const read = await mut("apiRecords:readRecord", { record: ids.rec }, { audit: 1 });
		expect(JSON.stringify(read)).toContain('"data":"bmV3"');
		const list = await mut("apiRecords:recordsOfClient", { client: ids.c2 }, { audit: 1 });
		expect((list.records as unknown[]).length).toBe(1);
		expect(dumpTable("formResponses")).not.toContain("SENTINEL");
		await mut("apiRecords:deleteRecord", { record: ids.rec });
		ids.file = id(
			await mut("apiRecords:addFile", {
				kind: "client_file",
				client: ids.c2,
				fileName: "report.pdf",
				storageKey: `${TENANT}/client_file/x/${"a".repeat(64)}`,
				sha256: "a".repeat(64),
				sizeBytes: 4,
				contentType: "application/pdf",
				encryption: { keyVersion: 1, iv: "aXY=" },
			}),
		);
		await mut(
			"apiRecords:addFile",
			{
				kind: "client_file",
				fileName: "x",
				storageKey: "k",
				sha256: "a".repeat(64),
				sizeBytes: 1,
				contentType: "x",
				encryption: { keyVersion: 1, iv: "i" },
			},
			{ audit: 0, ok: false },
		);
		await mut("apiRecords:addFile", {
			kind: "notice",
			title: "Test notice",
			fileName: "n.txt",
			storageKey: `${TENANT}/notice/y/${"b".repeat(64)}`,
			sha256: "b".repeat(64),
			sizeBytes: 1,
			contentType: "text/plain",
			encryption: { keyVersion: 1, iv: "aXY=" },
		});
		expect(((await qry("apiRecords:files", { client: ids.c2 })).files as unknown[]).length).toBe(1);
		expect(((await qry("apiRecords:files", { kind: "notice" })).files as unknown[]).length).toBe(1);
		const outbox = n(await counts(), "storageOutbox");
		expect(await mut("apiRecords:removeFile", { file: ids.file })).toMatchObject({
			storageKey: `${TENANT}/client_file/x/${"a".repeat(64)}`,
		});
		expect(n(await counts(), "storageOutbox")).toBe(outbox + 1);
	});

	it("roles, members, overrides, coordinators", async () => {
		const perms = ["clients_view_all", "clients_view_all_contact"];
		ids.role = id(
			await mut("apiAccess:createRole", { name: "Auditor", description: "d", permissions: perms }),
		);
		await mut(
			"apiAccess:createRole",
			{ name: "Auditor", description: "d", permissions: perms },
			{ audit: 0, ok: false },
		);
		await mut(
			"apiAccess:createRole",
			{ name: "Bad", description: "d", permissions: ["not_a_key"] },
			{ audit: 0, ok: false },
		);
		await mut("apiAccess:updateRole", {
			role: ids.role,
			permissions: [...perms, "clients_view_all_money"],
		});
		await mut(
			"apiAccess:updateRole",
			{ role: ids.role, permissions: ["nope"] },
			{ audit: 0, ok: false },
		);
		await mut("apiAccess:assignRole", { subject: "sub-1", role: ids.role });
		await mut("apiAccess:assignRole", { subject: "sub-1", role: ids.role }, { audit: 0 });
		await mut("apiAccess:setOverride", {
			subject: "sub-1",
			permission: "clients_view_all_money",
			effect: "deny",
		});
		await mut(
			"apiAccess:setOverride",
			{ subject: "sub-1", permission: "bogus", effect: "deny" },
			{ audit: 0, ok: false },
		);
		await mut("apiAccess:setCoordinator", {
			subject: "sub-1",
			practitioner: ids.p1,
			assigned: true,
		});
		await mut(
			"apiAccess:setCoordinator",
			{ subject: "sub-1", practitioner: ids.p1, assigned: true },
			{ audit: 0 },
		);
		const mine = await qry("apiAccess:forSubject", { subject: "sub-1" });
		expect(mine).toMatchObject({
			overrides: [{ permission: "clients_view_all_money", effect: "deny" }],
			assignedPractitioners: [ids.p1],
		});
		expect(JSON.stringify(mine.roles)).toContain("clients_view_all_money");
		expect(((await qry("apiAccess:roles", {})).roles as unknown[]).length).toBe(8);
		await mut("apiAccess:deleteRole", { role: ids.role }, { audit: 0, ok: false });
		await mut("apiAccess:setCoordinator", {
			subject: "sub-1",
			practitioner: ids.p1,
			assigned: false,
		});
		await mut("apiAccess:removeOverride", {
			subject: "sub-1",
			permission: "clients_view_all_money",
		});
		await mut(
			"apiAccess:removeOverride",
			{ subject: "sub-1", permission: "clients_view_all_money" },
			{ audit: 0, ok: false },
		);
		await mut("apiAccess:unassignRole", { subject: "sub-1", role: ids.role });
		await mut("apiAccess:deleteRole", { role: ids.role });
	});

	it("the builder: forms, custom fields and values, views and actions", async () => {
		const label = { ro: "a", en: "a" };
		const form = JSON.stringify({
			key: "custom-form",
			version: 1,
			kind: "report",
			title: label,
			fields: [{ key: "a", label, type: "text", options: [], required: false, group: "clinical" }],
		});
		const v1 = await mut("apiBuilder:defineForm", { definition: form });
		expect(v1.version).toBe(1);
		const v2 = await mut("apiBuilder:defineForm", { definition: form });
		expect(v2.version).toBe(2);
		await mut("apiBuilder:defineForm", { definition: "{not json" }, { audit: 0, ok: false });
		await mut("apiBuilder:retireForm", { form: id(v1) });
		await mut("apiBuilder:retireForm", { form: id(v1) }, { audit: 0 });
		expect(((await qry("apiBuilder:forms", {})).forms as unknown[]).length).toBe(6);
		const field = (key: string, group: string) =>
			JSON.stringify({
				key,
				label,
				type: "text",
				options: [],
				required: false,
				group,
				entity: "client",
				order: 1,
			});
		ids.f1 = id(await mut("apiBuilder:setCustomField", { definition: field("school", "contact") }));
		await mut("apiBuilder:setCustomField", { definition: field("secret", "clinical") });
		await mut("apiBuilder:setCustomField", { definition: "{}" }, { audit: 0, ok: false });
		await mut("apiBuilder:setValue", {
			entity: "client",
			entityId: ids.c1,
			fieldKey: "school",
			plain: JSON.stringify("Test school"),
		});
		await mut("apiBuilder:setValue", {
			entity: "client",
			entityId: ids.c1,
			fieldKey: "school",
			plain: JSON.stringify("Other"),
		});
		await mut(
			"apiBuilder:setValue",
			{ entity: "client", entityId: ids.c1, fieldKey: "school", enc },
			{ audit: 0, ok: false },
		);
		await mut(
			"apiBuilder:setValue",
			{ entity: "client", entityId: ids.c1, fieldKey: "secret", plain: JSON.stringify("clear") },
			{ audit: 0, ok: false },
		);
		await mut("apiBuilder:setValue", {
			entity: "client",
			entityId: ids.c1,
			fieldKey: "secret",
			enc,
		});
		await mut(
			"apiBuilder:setValue",
			{ entity: "client", entityId: "nope", fieldKey: "school", plain: '"x"' },
			{ audit: 0, ok: false },
		);
		await mut(
			"apiBuilder:setValue",
			{ entity: "client", entityId: ids.c1, fieldKey: "school", plain: "42" },
			{ audit: 0, ok: false },
		);
		const vals = await qry("apiBuilder:values", { entity: "client", entityId: ids.c1 });
		expect((vals.values as unknown[]).length).toBe(2);
		expect(dumpTable("customValues")).not.toContain("clear");
		const view = JSON.stringify({
			key: "week",
			title: label,
			forRoles: [],
			body: {
				surface: "calendar",
				columns: [{ kind: "practitioner", ref: ids.p1, hidden: false }],
			},
		});
		const d1 = await mut("apiBuilder:setDefinition", { kind: "view", json: view });
		const d2 = await mut("apiBuilder:setDefinition", { kind: "view", json: view });
		expect(d2.version).toBe(2);
		await mut("apiBuilder:setDefinition", {
			kind: "action",
			json: JSON.stringify({
				key: "send_it",
				label,
				placement: "client_page",
				forRoles: [],
				requires: { resource: "reminders", action: "send" },
				confirm: true,
			}),
		});
		await mut(
			"apiBuilder:setDefinition",
			{
				kind: "action",
				json: JSON.stringify({
					key: "bad",
					label,
					placement: "client_page",
					forRoles: [],
					requires: { resource: "reminders", action: "delete" },
					confirm: true,
				}),
			},
			{ audit: 0, ok: false },
		);
		expect(((await qry("apiBuilder:definitions", {})).definitions as unknown[]).length).toBe(2);
		await mut("apiBuilder:deactivateDefinition", { definition: id(d2) });
		expect(id(d1)).not.toBe(id(d2));
		await mut("apiBuilder:removeCustomField", { field: ids.f1 });
	});

	it("the audit log: append and list", async () => {
		await mut("apiAudit:append", {
			action: "client.update",
			entity: "client",
			entityId: ids.c1,
			fields: ["name"],
		});
		await mut(
			"apiAudit:append",
			{ action: "client.update", entity: "client", entityId: ids.c1, fields: ["Test Client A"] },
			{ audit: 0, ok: false },
		);
		const page = await qry("apiAudit:list", { limit: 5 });
		expect((page.events as unknown[]).length).toBe(5);
		const one = await qry("apiAudit:list", { entity: "client", entityId: ids.c1 });
		expect((one.events as Array<{ entityId: string }>).every((e) => e.entityId === ids.c1)).toBe(
			true,
		);
		expect(dumpTable("auditEvents")).not.toContain("Test Client A");
	});

	it("is per app: nothing of another app is reachable by id", async () => {
		const other = `${TENANT}-other`;
		const out = result.parse(
			await callMutation("apiClients:standing", {
				tenant: other,
				actor,
				client: ids.c1,
				action: "archive",
			}),
		);
		expect(out).toMatchObject({ ok: false, reason: "not_found" });
		expect(
			result.parse(await callQuery("apiVisits:get", { tenant: other, visit: ids.v1 })),
		).toMatchObject({ ok: false });
		expect(
			result.parse(await callQuery("apiMoney:forClient", { tenant: other, client: ids.c1 })),
		).toMatchObject({ ok: false });
	});

	it("the change feed saw it all, with no content", async () => {
		const feed = z.object({
			changes: z.array(z.object({ kind: z.string() })),
			cursor: z.number(),
			hasMore: z.boolean(),
		});
		let cursor = 0;
		const kinds = new Set<string>();
		for (let i = 0; i < 20; i += 1) {
			const page = feed.parse(
				await callQuery("changes:since", { tenant: TENANT, cursor, limit: 200 }),
			);
			for (const c of page.changes) kinds.add(c.kind);
			cursor = page.cursor;
			if (!page.hasMore) break;
		}
		for (const k of [
			"client",
			"visit",
			"record",
			"file",
			"role",
			"member",
			"override",
			"builder",
			"form",
		]) {
			expect(kinds.has(k), `change kind ${k}`).toBe(true);
		}
		expect(dumpTable("changeLog")).not.toContain("Test Client");
	});
});
