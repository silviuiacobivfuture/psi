import { ClientPatch } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ok, type Populated } from "./testing/populate";
import type { Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
type Contact = { phone?: string; email?: string; address?: string };
type Shown = { contact?: Contact; guardian?: { phone?: string; email?: string } };
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };

describe.each(factories)("emptying a client's phone or e-mail, on the $name store", (factory) => {
	let w: Populated;
	let n = 0;
	const as = (who: string | null, method: string, path: string, body?: unknown) =>
		w.call(who, method, `${A}${path}`, body);
	const patch = (who: string | null, id: string, body: unknown) =>
		as(who, "PATCH", `/clients/${id}`, body);
	const read = async (id: string): Promise<Shown> =>
		ok(await as("olga", "GET", `/clients/${id}`), "read") as Shown;
	const trail = async (id: string) =>
		(
			(await as("olga", "GET", "/audit?action=client.update")).json.items as {
				target: { id: string };
				detail?: Record<string, unknown>;
			}[]
		).filter((e) => e.target.id === id);
	/** An adult client of their own, with the contact given and no guardian. */
	async function client(contact: Contact, guardian?: Record<string, string>): Promise<string> {
		n += 1;
		const made = ok(
			await as("olga", "POST", "/clients", {
				name: `Clear Test ${n}`,
				contact,
				...(guardian === undefined ? {} : { guardian }),
			}),
			"create",
		);
		return String(made.id);
	}
	async function refused(run: () => Promise<Reply>, status: number, code?: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		if (code !== undefined) expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}

	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	it("empties the phone and keeps the e-mail and the address; the read shows no phone at all", async () => {
		const id = await client({
			phone: "0711 000 001",
			email: "a@example.test",
			address: "Str. A 1",
		});
		const out = ok(await patch("olga", id, { clear: ["phone"] }), "clear") as Shown;
		expect(out.contact).toEqual({ email: "a@example.test", address: "Str. A 1" });
		expect((await read(id)).contact).toEqual({ email: "a@example.test", address: "Str. A 1" });
	});

	it("empties the e-mail and keeps the phone", async () => {
		const id = await client({ phone: "0711 000 002", email: "b@example.test" });
		ok(await patch("olga", id, { clear: ["email"] }), "clear");
		expect((await read(id)).contact).toEqual({ phone: "0711 000 002" });
	});

	it("empties both when the guardian can still be reached, and the contact group is then absent", async () => {
		const id = await client(
			{ phone: "0711 000 003", email: "c@example.test" },
			{ name: "Părinte Ș", phone: "0722 000 003" },
		);
		ok(await patch("olga", id, { clear: ["phone", "email"] }), "clear");
		const after = await read(id);
		expect(after.contact?.phone).toBeUndefined();
		expect(after.contact?.email).toBeUndefined();
		expect(after.guardian?.phone).toBe("0722 000 003");
	});

	it("removes the guardian while the client's own phone remains, journalled under the guardian group", async () => {
		const id = await client({ phone: "0711 000 011" }, { name: "Tutore T", phone: "0722 000 011" });
		ok(await patch("olga", id, { clear: ["guardian"] }), "clear");
		const after = await read(id);
		expect(after.guardian).toBeUndefined();
		expect(after.contact).toEqual({ phone: "0711 000 011" });
		expect((await trail(id))[0]?.detail).toMatchObject({
			cleared: ["guardian"],
			groups: ["guardian"],
		});
	});

	it("refuses to remove the guardian who is the only way to reach the client, and to empty a phone left alone", async () => {
		const id = await client({}, { name: "Tutore U", email: "u@example.test" });
		const reply = await refused(() => patch("olga", id, { clear: ["guardian"] }), 409, "conflict");
		expect(err(reply).detail).toEqual({ reason: "contact_required" });
		expect((await read(id)).guardian).toMatchObject({ email: "u@example.test" });
		const mixed = await client(
			{ phone: "0711 000 012" },
			{ name: "Tutore V", phone: "0722 000 012" },
		);
		await refused(() => patch("olga", mixed, { clear: ["phone", "guardian"] }), 409, "conflict");
		await refused(
			() => patch("olga", mixed, { clear: ["guardian"], guardian: { name: "Alt" } }),
			400,
			"invalid",
		);
	});

	it("is journalled as a contact change naming the fields emptied, never their values", async () => {
		const id = await client({ phone: "0711 000 004", email: "d@example.test" });
		ok(await patch("olga", id, { clear: ["email"] }), "clear");
		const events = await trail(id);
		expect(events).toHaveLength(1);
		expect(events[0]?.detail).toMatchObject({ cleared: ["email"], groups: ["contact"] });
		expect(JSON.stringify(events[0])).not.toContain("d@example.test");
	});

	it("clears one field and changes another in one call", async () => {
		const id = await client({ phone: "0711 000 005", email: "e@example.test" });
		const out = ok(
			await patch("olga", id, { clear: ["email"], contact: { phone: "0711 999 005" } }),
			"both",
		) as Shown;
		expect(out.contact).toEqual({ phone: "0711 999 005" });
	});

	it("emptying a field that is already empty changes nothing and records nothing", async () => {
		const id = await client({ phone: "0711 000 006" });
		const before = await w.fingerprint();
		const reply = await patch("olga", id, { clear: ["email"] });
		expect(reply.status).toBe(200);
		expect(await w.fingerprint()).toBe(before);
		expect(await trail(id)).toEqual([]);
	});

	it("refuses to leave a client with no phone or e-mail of their own or their guardian's: nothing written", async () => {
		const only = await client({ phone: "0711 000 007" });
		const reply = await refused(() => patch("olga", only, { clear: ["phone"] }), 409, "conflict");
		expect(err(reply).detail).toEqual({ reason: "contact_required" });
		const both = await client({ phone: "0711 000 008", email: "h@example.test" });
		await refused(() => patch("olga", both, { clear: ["phone", "email"] }), 409, "conflict");
		expect((await read(both)).contact).toEqual({ phone: "0711 000 008", email: "h@example.test" });
	});

	it("refuses a field both given and emptied, an unknown field, a duplicate and an empty list: nothing written", async () => {
		const id = await client({ phone: "0711 000 009", email: "i@example.test" });
		await refused(
			() => patch("olga", id, { clear: ["phone"], contact: { phone: "0700 000 000" } }),
			400,
			"invalid",
		);
		for (const clear of [["address"], ["phone", "phone"], [], "phone", [null], ["name"]])
			await refused(() => patch("olga", id, { clear }), 400, "invalid");
	});

	it("refuses a caller without the contact group's edit permission, a client not there and no sign-in", async () => {
		const id = await client({ phone: "0711 000 010", email: "j@example.test" });
		ok(
			await as("olga", "PUT", "/members/nina/overrides", {
				grant: [],
				deny: ["clients_edit_all_contact"],
			}),
			"deny",
		);
		try {
			await refused(() => patch("nina", id, { clear: ["email"] }), 403, "forbidden");
		} finally {
			ok(await as("olga", "PUT", "/members/nina/overrides", { grant: [], deny: [] }), "undo");
		}
		await refused(() => patch("olga", "c-nope-0001", { clear: ["email"] }), 404, "not_found");
		await refused(() => patch(null, id, { clear: ["email"] }), 401);
		expect((await read(id)).contact).toEqual({ phone: "0711 000 010", email: "j@example.test" });
	});

	it("the contract takes phone, e-mail and guardian, each once", () => {
		expect(ClientPatch.safeParse({ clear: ["phone"] }).success).toBe(true);
		expect(ClientPatch.safeParse({ clear: ["email", "phone", "guardian"] }).success).toBe(true);
		for (const clear of [[], ["phone", "phone"], ["name"], ["phone", "email", "guardian", "phone"]])
			expect(ClientPatch.safeParse({ clear }).success, JSON.stringify(clear)).toBe(false);
	});
});
