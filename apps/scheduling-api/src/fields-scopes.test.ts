import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, NOW } from "./testing/world";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const as = (who: string, method: string, path: string, body?: unknown) =>
	w.call(who, method, `${A}${path}`, body);
const names = (items: unknown): string[] => (items as { name: string }[]).map((c) => c.name).sort();
const auditActions = async (): Promise<string[]> =>
	((await as("olga", "GET", "/audit?limit=500")).json.items as { action: string }[]).map(
		(e) => e.action,
	);

describe("a field group the caller may not see is ABSENT, never null or masked", () => {
	it("reception sees contact, guardian and money, and no clinical key at all", async () => {
		const c = (await as("rita", "GET", `/clients/${w.ids.c1}`)).json;
		expect(c).toHaveProperty("contact");
		expect(c).toHaveProperty("guardian");
		expect(c).toHaveProperty("money");
		expect(Object.keys(c)).not.toContain("clinical");
		expect(JSON.stringify(c)).not.toContain("synthetic-diagnosis");
	});

	it("a therapist sees contact, guardian and clinical of a client they treat, and no money", async () => {
		const c = (await as("dora", "GET", `/clients/${w.ids.c1}`)).json;
		expect(c.clinical).toEqual({
			diagnosis: "synthetic-diagnosis-one",
			notes: "synthetic-notes-one",
		});
		expect(Object.keys(c)).toEqual(expect.not.arrayContaining(["money"]));
		expect(c).toHaveProperty("contact");
	});

	it("an accountant sees contact and money, and no guardian or clinical key at all", async () => {
		const c = (await as("ana", "GET", `/clients/${w.ids.c1}`)).json;
		expect(Object.keys(c).sort()).toEqual(
			[
				"createdAt",
				"id",
				"contact",
				"money",
				"name",
				"status",
				"treating",
				"updatedAt",
				"birthYear",
			].sort(),
		);
	});

	it("the owner sees all four groups", async () => {
		const c = (await as("olga", "GET", `/clients/${w.ids.c1}`)).json;
		for (const g of ["contact", "guardian", "money", "clinical"]) expect(c).toHaveProperty(g);
	});

	it("the same holds in a list, per client", async () => {
		const items = (await as("rita", "GET", "/clients")).json.items as Record<string, unknown>[];
		expect(items).toHaveLength(2);
		for (const c of items) expect(Object.keys(c)).not.toContain("clinical");
	});

	it("a list never carries the clinical group, not even for the owner, and never audits a clinical read", async () => {
		const before = (await auditActions()).length;
		const items = (await as("olga", "GET", "/clients")).json.items as Record<string, unknown>[];
		expect(items).toHaveLength(2);
		for (const c of items) {
			expect(Object.keys(c)).not.toContain("clinical");
			expect(c).toHaveProperty("contact");
		}
		expect(JSON.stringify(items)).not.toContain("synthetic-diagnosis");
		expect((await auditActions()).length).toBe(before);
	});

	it("fields=identity is who the client is and nothing more: no group, for anyone", async () => {
		const items = (await as("olga", "GET", "/clients?fields=identity")).json.items as Record<
			string,
			unknown
		>[];
		expect(items).toHaveLength(2);
		for (const c of items) {
			expect(Object.keys(c).sort()).toEqual(
				["birthYear", "createdAt", "id", "name", "status", "treating", "updatedAt"].sort(),
			);
		}
		expect((await as("olga", "GET", "/clients?fields=everything")).status).toBe(400);
	});

	it("the clinical content is not in the store in clear: only a sealed envelope", async () => {
		const row = await w.store.c.clients.get("psizone", w.ids.c1);
		expect(JSON.stringify(row)).not.toContain("synthetic-diagnosis");
		expect(row?.clinicalSealed).toMatch(/^v1\./);
	});

	it("an appointment's money is absent for a therapist and present for reception", async () => {
		expect(Object.keys((await as("dora", "GET", `/appointments/${w.ids.a1}`)).json)).not.toContain(
			"money",
		);
		expect((await as("rita", "GET", `/appointments/${w.ids.a1}`)).json.money).toMatchObject({
			priceCents: 15000,
		});
	});

	it("a service's prices are absent unless the caller may see prices", async () => {
		await as("olga", "PUT", "/members/nina/overrides", { grant: [], deny: ["prices_view_all"] });
		expect(
			Object.keys(((await as("nina", "GET", "/services")).json.items as object[])[0] ?? {}),
		).not.toContain("prices");
		expect(
			((await as("rita", "GET", "/services")).json.items as { prices?: unknown }[])[0]?.prices,
		).toMatchObject({ currency: "RON" });
	});

	it("a package's payments are absent without the payments permission", async () => {
		await as("olga", "PUT", "/members/ana/overrides", { grant: [], deny: ["payments_view_all"] });
		expect(Object.keys((await as("ana", "GET", `/packages/${w.ids.pkg}`)).json)).not.toContain(
			"payments",
		);
		expect((await as("rita", "GET", `/packages/${w.ids.pkg}`)).json.payments).toHaveLength(1);
	});

	it("reminders hide the contact from a caller who may not see contact data", async () => {
		await as("olga", "PUT", "/members/rita/overrides", {
			grant: [],
			deny: ["clients_view_all_contact"],
		});
		const items = (
			await as(
				"rita",
				"GET",
				`/reminders?date=${new Date(NOW + 24 * HOUR).toISOString().slice(0, 10)}`,
			)
		).json.items as Record<string, unknown>[];
		expect(items.length).toBeGreaterThan(0);
		for (const i of items) expect(Object.keys(i)).not.toContain("contact");
	});

	it("writing a group the role cannot edit is refused, naming the group, and writes nothing", async () => {
		await as("olga", "PUT", "/members/dora/overrides", { grant: ["clients_edit_own"], deny: [] });
		const before = await w.fingerprint();
		const r = await as("dora", "PATCH", `/clients/${w.ids.c1}`, { money: { tariffCents: 1 } });
		expect(r.status).toBe(403);
		expect(r.json.error).toMatchObject({ code: "forbidden", detail: { group: "money" } });
		expect(await w.fingerprint()).toBe(before);
	});

	it("creating a client with a group the role cannot write is refused", async () => {
		const r = await as("rita", "POST", "/clients", {
			name: "X Client",
			clinical: { diagnosis: "no" },
		});
		expect(r.status).toBe(403);
		expect(r.json.error).toMatchObject({ detail: { group: "clinical" } });
	});
});

describe("scope: own, assigned, all", () => {
	it("a therapist lists only the clients they treat", async () => {
		expect(names((await as("dora", "GET", "/clients")).json.items)).toEqual(["Client One"]);
		expect(names((await as("elena", "GET", "/clients")).json.items)).toEqual(["Client Two"]);
	});

	it("a therapist's list (read by id, not the whole list) keeps the standing asked, the search and the page", async () => {
		expect((await as("olga", "POST", `/clients/${w.ids.c1}/archive`)).status).toBe(200);
		expect(names((await as("dora", "GET", "/clients")).json.items)).toEqual([]);
		expect(names((await as("dora", "GET", "/clients?status=archived")).json.items)).toEqual([
			"Client One",
		]);
		expect(names((await as("dora", "GET", "/clients?status=archived&q=one")).json.items)).toEqual([
			"Client One",
		]);
		expect(names((await as("dora", "GET", "/clients?status=archived&q=two")).json.items)).toEqual(
			[],
		);
		const page = (await as("dora", "GET", "/clients?status=archived&limit=1")).json;
		expect(page.items).toHaveLength(1);
		expect(page.nextCursor).toBeUndefined();
		expect(names((await as("elena", "GET", "/clients?status=archived")).json.items)).toEqual([]);
	});

	it("a therapist asking for another therapist's client is told it is not there, and nothing about it", async () => {
		const r = await as("dora", "GET", `/clients/${w.ids.c2}`);
		expect(r.status).toBe(404);
		expect(JSON.stringify(r.json)).not.toContain("Client Two");
	});

	it("a coordinator sees the clients of the practitioners assigned to them, both here", async () => {
		expect(names((await as("cora", "GET", "/clients")).json.items)).toEqual([
			"Client One",
			"Client Two",
		]);
	});

	it("a coordinator sees them but cannot edit them", async () => {
		expect((await as("cora", "PATCH", `/clients/${w.ids.c1}`, { name: "Nope" })).status).toBe(404);
	});

	it("reception and the owner see every client", async () => {
		expect(names((await as("rita", "GET", "/clients")).json.items)).toEqual([
			"Client One",
			"Client Two",
		]);
	});

	it("a therapist's own scope with no clients yet is an empty list, not a refusal", async () => {
		await as("olga", "POST", "/people", {
			displayName: "Newbie",
			kind: "practitioner",
			subject: "newbie",
		});
		await as("olga", "PUT", "/members/newbie", {
			displayName: "Newbie",
			roles: [w.ids.roles.therapist],
			coordinates: [],
		});
		const r = await as("newbie", "GET", "/clients");
		expect(r.status).toBe(200);
		expect(r.json.items).toEqual([]);
	});

	it("the calendar shows a therapist only their own column; reception all of them", async () => {
		const range = `from=${NOW}&to=${NOW + 3 * 24 * HOUR}&columns=person`;
		const own = (await as("dora", "GET", `/calendar?${range}`)).json.columns as { name: string }[];
		expect(own.map((c) => c.name)).toEqual(["Dora Test"]);
		expect(((await as("rita", "GET", `/calendar?${range}`)).json.columns as unknown[]).length).toBe(
			3,
		);
	});

	it("a therapist lists their own appointments only", async () => {
		const items = (await as("dora", "GET", `/appointments?from=${NOW}&to=${NOW + 3 * 24 * HOUR}`))
			.json.items as { id: string }[];
		expect(items.map((i) => i.id)).toEqual([w.ids.a1]);
	});

	it("a therapist cannot edit or cancel another therapist's appointment", async () => {
		expect((await as("dora", "PATCH", `/appointments/${w.ids.a2}`, { note: "x" })).status).toBe(
			404,
		);
		expect(
			(await as("dora", "POST", `/appointments/${w.ids.a2}/cancel`, { reason: "nope" })).status,
		).toBe(404);
	});

	it("a therapist cannot reach a package of someone else's client; reception can", async () => {
		expect((await as("elena", "GET", `/packages/${w.ids.pkg}`)).status).toBe(404);
		expect((await as("rita", "GET", `/packages/${w.ids.pkg}`)).status).toBe(200);
	});

	it("own leave only: a therapist may ask for their own leave, not for a colleague's", async () => {
		expect(
			(
				await as("dora", "POST", "/leave", {
					personId: w.ids.elena,
					from: "2026-12-05",
					to: "2026-12-06",
					kind: "co",
				})
			).status,
		).toBe(404);
		expect(
			(
				await as("dora", "POST", "/leave", {
					personId: w.ids.dora,
					from: "2026-12-05",
					to: "2026-12-06",
					kind: "co",
				})
			).status,
		).toBe(200);
		expect(
			((await as("dora", "GET", "/leave")).json.items as { personId: string }[]).every(
				(l) => l.personId === w.ids.dora,
			),
		).toBe(true);
	});
});

describe("clinical data is read only by the permitted, and every read is audited", () => {
	it("a record's content opens for the treating therapist and not for reception", async () => {
		expect((await as("dora", "GET", `/records/${w.ids.record}`)).json.data).toEqual({
			summary: "synthetic-session-summary",
		});
		// Reception holds no record permission at all: refused outright, as on any route.
		const rita = await as("rita", "GET", `/records/${w.ids.record}`);
		expect(rita.status).toBe(403);
	});

	it("a record is governed by its form's resource: the holder of another record resource is refused", async () => {
		// The populated form is a custom one, so report_custom governs it; report_aba does not.
		await as("olga", "PUT", "/members/ana/overrides", { grant: ["report_aba_view_all"], deny: [] });
		expect((await as("ana", "GET", `/records/${w.ids.record}`)).status).toBe(404);
		await as("olga", "PUT", "/members/ana/overrides", {
			grant: ["report_custom_view_all"],
			deny: [],
		});
		const r = await as("ana", "GET", `/records/${w.ids.record}`);
		expect(r.status).toBe(200);
		expect(r.json.data).toEqual({ summary: "synthetic-session-summary" });
	});

	it("every clinical read lands in the audit log, with who and what, and never the content", async () => {
		await as("dora", "GET", `/records/${w.ids.record}`);
		await as("dora", "GET", `/clients/${w.ids.c1}`);
		const events = (
			(await as("olga", "GET", "/audit?action=clinical.read")).json.items as {
				actor: { subject: string };
				target: { type: string; id: string };
			}[]
		).filter((e) => e.actor.subject === "dora");
		expect(events.map((e) => `${e.target.type}:${e.target.id}`).sort()).toEqual(
			[`client:${w.ids.c1}`, `record:${w.ids.record}`].sort(),
		);
		expect(JSON.stringify(events)).not.toContain("synthetic");
	});

	it("a read without clinical access is not audited as clinical", async () => {
		await as("rita", "GET", `/clients/${w.ids.c1}`);
		expect(
			(
				(await as("olga", "GET", "/audit?action=clinical.read")).json.items as {
					actor: { subject: string };
				}[]
			).some((e) => e.actor.subject === "rita"),
		).toBe(false);
	});

	it("a record's content cannot be opened under another record's context", () => {
		const sealed = w.deps.crypto.seal("secret", "psizone:record:a");
		expect(() => w.deps.crypto.open(sealed, "psizone:record:b")).toThrow();
	});
});

describe("mutations are audited, and nothing moves a client by itself", () => {
	it("each mutation writes one audit event naming the actor, the action and the target", async () => {
		const before = (await auditActions()).length;
		const r = await as("rita", "PATCH", `/clients/${w.ids.c1}`, { name: "Client One B" });
		expect(r.status).toBe(200);
		const events = (await as("olga", "GET", "/audit?action=client.update")).json.items as {
			actor: { subject: string; kind: string };
			target: { id: string };
		}[];
		expect(events[0]).toMatchObject({
			actor: { subject: "rita", kind: "person" },
			target: { id: w.ids.c1 },
		});
		expect((await auditActions()).length).toBe(before + 1);
	});

	it("changing who treats a client is explicit: it needs a reason and the audit keeps from, to and why", async () => {
		expect(
			(await as("olga", "PUT", `/clients/${w.ids.c1}/treating`, { treating: [w.ids.elena] }))
				.status,
		).toBe(400);
		await as("olga", "PUT", `/clients/${w.ids.c1}/treating`, {
			treating: [w.ids.elena],
			reason: "dora is on leave",
		});
		const event = (
			(await as("olga", "GET", "/audit?action=client.assign")).json.items as {
				detail: Record<string, unknown>;
			}[]
		)[0];
		expect(event?.detail).toEqual({
			from: [w.ids.dora],
			to: [w.ids.elena],
			reason: "dora is on leave",
		});
		// and the scope follows at once: Dora no longer sees the client, Elena does
		expect((await as("dora", "GET", `/clients/${w.ids.c1}`)).status).toBe(404);
		expect((await as("elena", "GET", `/clients/${w.ids.c1}`)).status).toBe(200);
	});

	it("editing a client, an appointment or a payment never changes who treats them", async () => {
		await as("olga", "PATCH", `/clients/${w.ids.c1}`, { name: "Renamed" });
		await as("olga", "PATCH", `/appointments/${w.ids.a1}`, { note: "x" });
		await as("olga", "POST", `/packages/${w.ids.pkg}/payments`, {
			amountCents: 100,
			method: "cash",
		});
		expect((await as("olga", "GET", `/clients/${w.ids.c1}`)).json.treating).toEqual([w.ids.dora]);
	});

	it("the fingerprint is sensitive: a successful write changes it", async () => {
		const before = await w.fingerprint();
		await as("olga", "POST", "/rooms", { name: "Another", kind: "x" });
		expect(await w.fingerprint()).not.toBe(before);
	});
});
