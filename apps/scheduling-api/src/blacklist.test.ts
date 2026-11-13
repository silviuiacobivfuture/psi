import { BLACKLIST_CATEGORIES, BLACKLIST_SEVERITIES } from "@psi/scheduling/clinic";
import {
	BLACKLIST_CATEGORIES as WIRE_CATEGORIES,
	BLACKLIST_SEVERITIES as WIRE_SEVERITIES,
} from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ok, type Populated } from "./testing/populate";
import { HOUR, NOW, type Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };

it("the wire lists of categories and severities are the package's", () => {
	expect([...WIRE_CATEGORIES]).toEqual([...BLACKLIST_CATEGORIES]);
	expect([...WIRE_SEVERITIES]).toEqual([...BLACKLIST_SEVERITIES]);
});

describe.each(factories)("the blacklist, on the $name store", (factory) => {
	let w: Populated;
	let serial = 0;
	const as = (who: string | null, method: string, path: string, body?: unknown) =>
		w.call(who, method, `${A}${path}`, body);
	/** A phone of its own for every entry and every visitor, so cases never meet. */
	const phone = (): string => `+4074${String(++serial).padStart(7, "0")}`;
	const flag = async (over: Record<string, unknown> = {}, who = "olga"): Promise<Reply> =>
		as(who, "POST", "/blacklist", {
			phone: phone(),
			reason: "synthetic reason",
			category: "other",
			severity: "warn",
			...over,
		});
	const flagged = async (over: Record<string, unknown> = {}): Promise<string> =>
		String(ok(await flag(over), "flag").id);
	/** A client the blacklist names (by record), ready to be booked. */
	async function flaggedClient(severity: string): Promise<string> {
		const client = String(
			ok(
				await as("olga", "POST", "/clients", { name: `Flagged ${severity} ${++serial}` }),
				"client",
			).id,
		);
		await flagged({ phone: undefined, client, severity });
		return client;
	}
	let hour = 0;
	const book = (who: string, client: string, extra: Record<string, unknown> = {}) =>
		as(who, "POST", "/appointments", {
			practitionerId: w.ids.dora,
			clientId: client,
			start: NOW + (200 + 3 * ++hour) * HOUR,
			end: NOW + (201 + 3 * hour) * HOUR,
			...extra,
		});
	const key = (method: string, path: string, body?: unknown) =>
		w.callKey("psizone-web", method, `${A}${path}`, body);
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
		await as("olga", "PUT", "/members/blank", { displayName: "Blank", roles: [], coordinates: [] });
		// Staff authority only: may override block_online, not block_all.
		await as("olga", "PUT", "/members/steady", {
			displayName: "Steady",
			roles: [w.ids.roles.reception ?? ""],
			coordinates: [],
		});
		await as("olga", "PUT", "/members/steady/overrides", {
			grant: ["blacklist_override_all"],
			deny: [],
		});
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	describe("entries", () => {
		it("an owner flags a phone at every severity; the answer is the entry with who made it", async () => {
			for (const severity of BLACKLIST_SEVERITIES) {
				const r = await flag({
					severity,
					phone: "0744 111 222".replace(/\d$/, String(++serial % 10)),
					name: "Someone",
				});
				expect(r.status, JSON.stringify(r.json)).toBe(200);
				expect(r.json).toMatchObject({
					severity,
					active: true,
					createdBy: "olga",
					version: 1,
					name: "Someone",
				});
			}
		});
		it("every category is accepted", async () => {
			for (const category of BLACKLIST_CATEGORIES)
				expect((await flag({ category })).status, category).toBe(200);
		});
		it("an entry is read back, listed, and changed; the reason is staff text", async () => {
			const id = await flagged({ reason: "late three times" });
			expect((await as("rita", "GET", `/blacklist/${id}`)).json).toMatchObject({
				id,
				reason: "late three times",
			});
			const listed = (await as("rita", "GET", "/blacklist")).json.items as { id: string }[];
			expect(listed.map((e) => e.id)).toContain(id);
			const changed = await as("olga", "PATCH", `/blacklist/${id}`, {
				severity: "block_online",
				reason: "worse",
			});
			expect(changed.json).toMatchObject({
				changed: true,
				entry: { id, severity: "block_online", reason: "worse", version: 2 },
			});
			const same = await as("olga", "PATCH", `/blacklist/${id}`, { reason: "worse" });
			expect(same.json).toMatchObject({ changed: false });
		});
		it("an entry switched off leaves the list, shows with includeInactive, and comes back", async () => {
			const id = await flagged();
			await as("olga", "PATCH", `/blacklist/${id}`, { active: false });
			const ids = async (q = "") =>
				((await as("olga", "GET", `/blacklist${q}`)).json.items as { id: string }[]).map(
					(e) => e.id,
				);
			expect(await ids()).not.toContain(id);
			expect(await ids("?includeInactive=true")).toContain(id);
			await as("olga", "PATCH", `/blacklist/${id}`, { active: true });
			expect(await ids()).toContain(id);
		});
		it("an identifier is taken off with clear, and an entry is deleted", async () => {
			const id = await flagged({ email: "both@example.test" });
			const r = await as("olga", "PATCH", `/blacklist/${id}`, { clear: ["email"] });
			expect((r.json.entry as { email?: string }).email).toBeUndefined();
			expect((await as("olga", "DELETE", `/blacklist/${id}`)).json).toEqual({ ok: true });
			expect((await as("olga", "GET", `/blacklist/${id}`)).status).toBe(404);
		});
		it("the check answers a hit with how it matched, and null for nobody", async () => {
			const p = phone();
			const id = await flagged({ phone: p, severity: "block_online" });
			const hit = await as("rita", "GET", `/blacklist/check?phone=${encodeURIComponent(p)}`);
			expect(hit.json).toMatchObject({
				hit: { entry: id, severity: "block_online", matchedBy: "phone" },
			});
			expect(
				(await as("rita", "GET", `/blacklist/check?phone=${encodeURIComponent(phone())}`)).json,
			).toEqual({ hit: null });
		});
		it("the entry is audited with who changed it", async () => {
			const id = await flagged();
			await as("olga", "PATCH", `/blacklist/${id}`, { reason: "audited" });
			await as("olga", "DELETE", `/blacklist/${id}`);
			const actions = (
				(await as("olga", "GET", "/audit?limit=200")).json.items as { action: string }[]
			).map((e) => e.action);
			for (const action of ["blacklist.create", "blacklist.update", "blacklist.delete"])
				expect(actions, action).toContain(action);
		});
	});

	describe("who may", () => {
		it("reception views and flags at warn level, and nothing more", async () => {
			expect((await as("rita", "GET", "/blacklist")).status).toBe(200);
			expect((await flag({}, "rita")).status).toBe(200);
			const id = await flagged();
			await refused(() => flag({ severity: "block_online" }, "rita"), 403, "forbidden");
			await refused(() => flag({ severity: "block_all" }, "rita"), 403, "forbidden");
			await refused(
				() => as("rita", "PATCH", `/blacklist/${id}`, { reason: "x" }),
				403,
				"forbidden",
			);
			await refused(() => as("rita", "DELETE", `/blacklist/${id}`), 403, "forbidden");
		});
		it("a role with no blacklist right sees and does nothing", async () => {
			const id = await flagged();
			for (const who of ["dora", "blank", "vera"]) {
				await refused(() => as(who, "GET", "/blacklist"), 403, "forbidden");
				await refused(() => as(who, "GET", `/blacklist/${id}`), 403, "forbidden");
				await refused(
					() => as(who, "GET", "/blacklist/check?phone=%2B40744000001"),
					403,
					"forbidden",
				);
				await refused(() => as(who, "GET", "/blacklist/events"), 403, "forbidden");
				await refused(() => flag({}, who), 403, "forbidden");
				await refused(
					() => as(who, "PATCH", `/blacklist/${id}`, { reason: "x" }),
					403,
					"forbidden",
				);
				await refused(() => as(who, "DELETE", `/blacklist/${id}`), 403, "forbidden");
			}
		});
		it("create at any severity alone, without the warn right, still flags", async () => {
			await as("olga", "PUT", "/members/onlycreate", {
				displayName: "Only",
				roles: [],
				coordinates: [],
			});
			await as("olga", "PUT", "/members/onlycreate/overrides", {
				grant: ["blacklist_create_all"],
				deny: [],
			});
			expect((await flag({ severity: "block_all" }, "onlycreate")).status).toBe(200);
		});
		it("a stranger to the app and no sign-in", async () => {
			await refused(() => as("mallory", "GET", "/blacklist"), 404, "not_found");
			await refused(() => flag({}, "mallory"), 404, "not_found");
			await refused(() => as(null, "GET", "/blacklist"), 401, "unauthenticated");
			await refused(() => flag({}, null as unknown as string), 401, "unauthenticated");
		});
		it("another app's owner cannot see this app's entries", async () => {
			const id = await flagged();
			await refused(
				() => w.call("hugo", "GET", `/v1/apps/psizone/blacklist/${id}`),
				404,
				"not_found",
			);
			expect((await w.call("hugo", "GET", "/v1/apps/hemisync/blacklist")).json.items).toEqual([]);
		});
		it("looking at the app as someone else is read-only", async () => {
			await refused(
				() =>
					w.call(
						"olga",
						"POST",
						`${A}/blacklist`,
						{ phone: phone(), reason: "x", category: "other", severity: "warn" },
						{ headers: { "x-psi-view-as": "role:owner" } },
					),
				403,
				"forbidden",
			);
		});
	});

	describe("what is refused is refused whole", () => {
		it("a name alone, no identifier", async () => {
			const r = await refused(
				() => flag({ phone: undefined, name: "Only A Name" }),
				400,
				"invalid",
			);
			expect(err(r).detail).toMatchObject({ reason: "invalid" });
		});
		it("a phone or an e-mail that is not one names the field", async () => {
			const phoneRefused = await refused(() => flag({ phone: "not a phone" }), 400, "invalid");
			expect(err(phoneRefused).detail).toMatchObject({ problems: ["phone"] });
			const mailRefused = await refused(
				() => flag({ phone: undefined, email: "nope" }),
				400,
				"invalid",
			);
			expect(err(mailRefused).detail).toMatchObject({ problems: ["email"] });
		});
		it("a reason empty, blank or past 2000 characters; a severity or category outside the lists", async () => {
			await refused(() => flag({ reason: "" }), 400, "invalid");
			await refused(() => flag({ reason: "   " }), 400, "invalid");
			await refused(() => flag({ reason: "r".repeat(2001) }), 400, "invalid");
			await refused(() => flag({ severity: "block_everything" }), 400, "invalid");
			await refused(() => flag({ category: "rude" }), 400, "invalid");
		});
		it("an expiry in the past, a client that is not there, a phone already flagged", async () => {
			await refused(() => flag({ expiresAt: NOW - 1000 }), 400, "invalid");
			await refused(
				() => flag({ phone: undefined, client: "nosuchclient0000000000" }),
				400,
				"invalid",
			);
			const p = phone();
			const id = await flagged({ phone: p });
			const twin = await refused(() => flag({ phone: p }), 409, "conflict");
			expect(err(twin).detail).toMatchObject({ reason: "exists", id });
		});
		it("an update of an entry that is not there, from another version, onto another's phone, or taking the last identifier", async () => {
			await refused(
				() => as("olga", "PATCH", "/blacklist/nosuchentry0000000", { reason: "x" }),
				404,
				"not_found",
			);
			await refused(() => as("olga", "DELETE", "/blacklist/nosuchentry0000000"), 404, "not_found");
			const id = await flagged();
			await refused(
				() => as("olga", "PATCH", `/blacklist/${id}`, { reason: "x", expectedVersion: 7 }),
				409,
				"conflict",
			);
			const other = phone();
			await flagged({ phone: other });
			await refused(
				() => as("olga", "PATCH", `/blacklist/${id}`, { phone: other }),
				409,
				"conflict",
			);
			await refused(
				() => as("olga", "PATCH", `/blacklist/${id}`, { clear: ["phone"] }),
				400,
				"invalid",
			);
		});
		it("an unknown field on the way in is left out, never stored", async () => {
			const r = await flag({ createdBy: "someone-else", version: 9, active: false });
			expect(r.json).toMatchObject({ createdBy: "olga", version: 1, active: true });
		});
	});

	describe("booking a client the blacklist names", () => {
		it("a client nobody flagged books as before", async () => {
			expect((await book("rita", w.ids.c1)).status).toBe(200);
		});
		it("a warning stops the booking and names the entry, and nothing is written", async () => {
			const client = await flaggedClient("warn");
			const r = await refused(() => book("rita", client), 409, "conflict");
			expect(err(r).detail).toMatchObject({
				reason: "warning",
				blacklist: { severity: "warn", needs: "ack", reason: "synthetic reason" },
			});
		});
		it("reception acknowledges a warning with a reason; the override and its reason are recorded", async () => {
			const client = await flaggedClient("warn");
			const r = await book("rita", client, { override: { reason: "parent called to explain" } });
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			const events = (await as("olga", "GET", "/blacklist/events")).json.items as {
				kind: string;
				actor?: string;
				authority?: string;
				overrideReason?: string;
				subject?: string;
			}[];
			expect(events.find((e) => e.subject === r.json.id)).toMatchObject({
				kind: "overridden",
				actor: "rita",
				authority: "ack",
				overrideReason: "parent called to explain",
			});
		});
		it("a blank reason is not an override", async () => {
			const client = await flaggedClient("warn");
			await refused(() => book("rita", client, { override: { reason: "  " } }), 400, "invalid");
		});
		it("reception cannot override a block, whatever the body claims about its authority", async () => {
			const client = await flaggedClient("block_online");
			const r = await refused(
				() => book("rita", client, { override: { reason: "please", authority: "admin" } }),
				409,
				"conflict",
			);
			expect(err(r).detail).toMatchObject({ reason: "blocked", blacklist: { needs: "staff" } });
		});
		it("a role with the override right books a block_online client, but not a block_all one", async () => {
			const soft = await flaggedClient("block_online");
			expect((await book("steady", soft, { override: { reason: "agreed" } })).status).toBe(200);
			const hard = await flaggedClient("block_all");
			const r = await refused(
				() => book("steady", hard, { override: { reason: "agreed" } }),
				409,
				"conflict",
			);
			expect(err(r).detail).toMatchObject({ reason: "blocked", blacklist: { needs: "admin" } });
		});
		it("the owner's elevated override books a block_all client, with the authority recorded", async () => {
			const hard = await flaggedClient("block_all");
			const r = await book("olga", hard, { override: { reason: "owner decision" } });
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			const events = (await as("olga", "GET", "/blacklist/events")).json.items as {
				subject?: string;
				authority?: string;
			}[];
			expect(events.find((e) => e.subject === r.json.id)?.authority).toBe("admin");
		});
		it("moving a flagged client's appointment is gated, and the override moves it", async () => {
			const client = await flaggedClient("block_online");
			const made = await book("olga", client, { override: { reason: "agreed" } });
			const id = String(made.json.id);
			const later = {
				start: (made.json.start as number) + 5 * HOUR,
				end: (made.json.end as number) + 5 * HOUR,
			};
			const stop = await refused(
				() => as("rita", "PATCH", `/appointments/${id}`, later),
				409,
				"conflict",
			);
			expect(err(stop).detail).toMatchObject({ reason: "blocked" });
			const moved = await as("olga", "PATCH", `/appointments/${id}`, {
				...later,
				override: { reason: "agreed" },
			});
			expect(moved.status, JSON.stringify(moved.json)).toBe(200);
			expect(moved.json).toMatchObject(later);
		});
		it("an appointment's own fields are not touched by the override on the way in", async () => {
			const r = await book("olga", w.ids.c2, { override: { reason: "nobody asked" } });
			expect(r.status).toBe(200);
			expect(r.json).not.toHaveProperty("override");
		});
	});

	describe("the public paths turn a flagged visitor away, neutrally", () => {
		const events = async () =>
			(await as("olga", "GET", "/blacklist/events")).json.items as {
				channel: string;
				kind: string;
				entry: string;
			}[];
		it("a callback request from a flagged phone is refused with one neutral word and stores no request", async () => {
			const p = phone();
			const id = await flagged({ phone: p, severity: "block_online", reason: "never to be shown" });
			const before = JSON.stringify(
				(await as("olga", "GET", `/requests?from=0&to=${NOW * 2}`)).json,
			);
			const r = await key("POST", "/book/callback-requests", {
				contact: { name: "Visitor Test", phone: p.replace("+40", "0") },
				locale: "ro",
			});
			expect(r.status).toBe(409);
			expect(err(r).code).toBe("unavailable_online");
			expect(JSON.stringify(r.json)).not.toContain("never to be shown");
			expect(JSON.stringify((await as("olga", "GET", `/requests?from=0&to=${NOW * 2}`)).json)).toBe(
				before,
			);
			expect(await events()).toContainEqual(
				expect.objectContaining({ kind: "online_refused", channel: "callback", entry: id }),
			);
		});
		it("a callback from a phone that is only warned about goes through", async () => {
			const p = phone();
			await flagged({ phone: p, severity: "warn" });
			const r = await key("POST", "/book/callback-requests", {
				contact: { name: "Visitor Test", phone: p.replace("+40", "0") },
				locale: "ro",
			});
			expect(r.status, JSON.stringify(r.json)).toBe(200);
		});
		it("a booking request from a flagged e-mail is refused when the contact is given, and the hold is let go", async () => {
			await flagged({
				phone: undefined,
				email: "flagged.visitor@example.test",
				severity: "block_all",
			});
			const slots = (
				await key(
					"GET",
					`/book/slots?service=evaluation&from=${NOW}&to=${NOW + 10 * 24 * HOUR}&limit=3`,
				)
			).json.slots as { practitioner: string; start: number }[];
			const slot = slots[0];
			if (slot === undefined) throw new Error("no slot offered");
			const held = (
				await key("POST", "/book/holds", {
					service: "evaluation",
					practitioner: slot.practitioner,
					start: slot.start,
					mode: "onsite",
					locale: "ro",
					channel: "form",
				})
			).json as { reference: string; holdToken: string };
			const r = await key("POST", `/book/holds/${held.reference}/submit`, {
				holdToken: held.holdToken,
				contact: { name: "Visitor Test", email: "flagged.visitor@example.test" },
			});
			expect(r.status, JSON.stringify(r.json)).toBe(409);
			expect(err(r).code).toBe("unavailable_online");
			const again = await key("POST", `/book/holds/${held.reference}/submit`, {
				holdToken: held.holdToken,
				contact: { name: "Visitor Test", email: "other@example.test" },
			});
			expect(again.status, "the hold was let go").toBeGreaterThanOrEqual(400);
		});
		it("an unflagged visitor books as before", async () => {
			expect(
				(
					await key("POST", "/book/callback-requests", {
						contact: { name: "Fine", phone: phone() },
						locale: "ro",
					})
				).status,
			).toBe(200);
		});
	});
});
