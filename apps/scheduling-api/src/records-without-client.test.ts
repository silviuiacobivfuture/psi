import { RecordFull } from "@psi/scheduling-sdk/contract";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { objectLinks } from "./authz/rehydrate";
import { FIELDS } from "./ports/crypto";
import { newId } from "./store/ids";
import type { RecordRow } from "./store/types";
import { createWorld, ok, type Populated } from "./testing/populate";
import { NOW } from "./testing/world";

/**
 * A record that belongs to no client (an old-app report whose client was deleted there, imported with its visit). Only
 * the app-wide scope of its form's resource reaches it: the owner and the administrator hold it; a therapist's own
 * scope, a coordinator's assigned scope, reception, the accountant and the volunteer do not, even when the record hangs
 * on the therapist's own appointment. It is never listed on a client's page, and a refused caller leaves no audit trace.
 */
const A = "/v1/apps/psizone";
const SECRET = "synthetic-orphan-summary";
const Page = z.object({ items: z.array(RecordFull), nextCursor: z.string().nullable().optional() });
const NARROW = ["dora", "elena", "cora", "rita", "ana", "vera"] as const;

describe("records that belong to no client", () => {
	let w: Populated;
	let orphan: RecordRow;
	const reads = async (id: string): Promise<number> =>
		(await w.store.c.audit.list("psizone")).filter(
			(e) => e.action === "clinical.read" && JSON.stringify(e).includes(id),
		).length;

	beforeAll(async () => {
		w = await createWorld();
		// What the import writes: no client, its visit, the answers sealed for the app; then the tuples the reconcile
		// tool derives from the store (objectLinks), exactly as for an imported clinic.
		orphan = await w.store.c.records.insert({
			id: newId("x"),
			app: "psizone",
			formId: w.ids.form,
			formVersion: 1,
			appointmentId: w.ids.a1,
			authorSubject: "system:import",
			sealed: await w.deps.crypto.seal(
				"psizone",
				FIELDS.record,
				JSON.stringify({ summary: SECRET }),
			),
			createdAt: NOW,
			updatedAt: NOW,
		});
		await w.deps.authz.write({ writes: await objectLinks(w.store, "psizone"), deletes: [] });
	});

	it("gets an app link and no client link from the store's facts", () => {
		const facts = w.authz.tuples().filter((t) => t.object === `sched_record:${orphan.id}`);
		expect(facts).toEqual([
			{ user: "sched_app:psizone", relation: "app", object: `sched_record:${orphan.id}` },
		]);
	});

	it.each([
		"olga",
		"nina",
	])("is listed and read, decrypted and audited, for %s (app-wide)", async (who) => {
		const before = await reads(orphan.id);
		const listed = Page.parse(ok(await w.call(who, "GET", `${A}/records-without-client`), "list"));
		expect(listed.items.map((r) => r.id)).toEqual([orphan.id]);
		expect(listed.items[0]?.clientId).toBeUndefined();
		expect(listed.items[0]?.appointmentId).toBe(w.ids.a1);
		expect(listed.items[0]?.data).toEqual({ summary: SECRET });
		const one = RecordFull.parse(ok(await w.call(who, "GET", `${A}/records/${orphan.id}`), "get"));
		expect(one.clientId).toBeUndefined();
		expect(one.data).toEqual({ summary: SECRET });
		expect(await reads(orphan.id)).toBe(before + 2);
	});

	it("is never on a client's page, not even the client of the visit it hangs on", async () => {
		for (const client of [w.ids.c1, w.ids.c2]) {
			const page = ok(await w.call("olga", "GET", `${A}/clients/${client}/records`), "page");
			expect(JSON.stringify(page)).not.toContain(orphan.id);
			expect(JSON.stringify(page)).not.toContain(SECRET);
		}
		const c1 = Page.parse(
			ok(await w.call("olga", "GET", `${A}/clients/${w.ids.c1}/records`), "c1"),
		);
		expect(c1.items.map((r) => r.id)).toEqual([w.ids.record]);
	});

	it.each(NARROW)("is refused to %s, and nothing is read or leaked", async (who) => {
		const before = await reads(orphan.id);
		const list = await w.call(who, "GET", `${A}/records-without-client`);
		expect(list.status).toBe(403);
		expect(JSON.stringify(list.json)).not.toContain(SECRET);
		for (const [method, body] of [
			["GET", undefined],
			["PATCH", { data: { summary: "overwritten" } }],
			["DELETE", undefined],
		] as const) {
			const r = await w.call(who, method, `${A}/records/${orphan.id}`, body);
			expect([403, 404]).toContain(r.status);
			expect(JSON.stringify(r.json)).not.toContain(SECRET);
		}
		// Their own clients' pages do not carry it either.
		for (const client of [w.ids.c1, w.ids.c2]) {
			const page = await w.call(who, "GET", `${A}/clients/${client}/records`);
			expect(JSON.stringify(page.json)).not.toContain(orphan.id);
		}
		expect(await reads(orphan.id)).toBe(before);
		const kept = await w.store.c.records.get("psizone", orphan.id);
		expect(kept?.sealed).toBe(orphan.sealed);
	});

	it("is refused to a therapist even though it hangs on her own appointment", async () => {
		const appointment = await w.store.c.appointments.get("psizone", w.ids.a1);
		expect(appointment?.practitionerId).toBe(w.ids.dora);
		expect((await w.call("dora", "GET", `${A}/records/${orphan.id}`)).status).toBe(404);
		// Her own client's record she does read: the refusal is about the missing client, not about records.
		expect((await w.call("dora", "GET", `${A}/records/${w.ids.record}`)).status).toBe(200);
	});

	it("is written by the app-wide scope only, and a client's record is never in the list", async () => {
		const changed = ok(
			await w.call("olga", "PATCH", `${A}/records/${orphan.id}`, { data: { summary: "edited" } }),
			"patch",
		);
		expect(changed.clientId).toBeUndefined();
		const read = RecordFull.parse(
			ok(await w.call("nina", "GET", `${A}/records/${orphan.id}`), "read"),
		);
		expect(read.data).toEqual({ summary: "edited" });
		const listed = Page.parse(
			ok(await w.call("olga", "GET", `${A}/records-without-client`), "list"),
		);
		expect(listed.items.map((r) => r.id)).not.toContain(w.ids.record);
	});

	it("is deleted by the app-wide scope, its app link with it and no client link touched", async () => {
		const clientFacts = () => w.authz.tuples().filter((t) => t.relation === "client");
		const before = clientFacts();
		ok(await w.call("olga", "DELETE", `${A}/records/${orphan.id}`), "delete");
		expect(await w.store.c.records.get("psizone", orphan.id)).toBeUndefined();
		expect(w.authz.tuples().some((t) => t.object === `sched_record:${orphan.id}`)).toBe(false);
		expect(clientFacts()).toEqual(before);
		expect(w.authz.tuples().some((t) => t.user === "sched_client:undefined")).toBe(false);
		const listed = Page.parse(
			ok(await w.call("olga", "GET", `${A}/records-without-client`), "list"),
		);
		expect(listed.items).toEqual([]);
	});
});

describe("the store's `absent` filter", () => {
	it("answers only the rows without the field, and an empty app answers none", async () => {
		const w = await createWorld();
		expect(await w.store.c.records.list("psizone", { absent: "clientId" })).toEqual([]);
		const all = await w.store.c.records.list("psizone");
		expect(all.length).toBeGreaterThan(0);
		expect(all.every((r) => r.clientId !== undefined)).toBe(true);
		expect(await w.store.c.records.list("hemisync", { absent: "clientId" })).toEqual([]);
	});
});
