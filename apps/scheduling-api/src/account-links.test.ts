import { accountClientId } from "@psi/notify";
import { accountHashOf } from "@psi/scheduling";
import { AccountLinkSuggestion } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { createNovuNotify } from "./ports/novu-notify";
import { asSite, bookAs } from "./testing/booking";
import { linkableClient, suggestionFor } from "./testing/links";
import type { Populated } from "./testing/populate";
import { HOUR, NOW, type Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
const Listed = z.object({ items: z.array(AccountLinkSuggestion) });
const err = (r: Reply) => r.json.error as { code: string; detail?: Record<string, unknown> };

describe.each(factories)("linking online accounts to clients, on the $name store", (factory) => {
	let w: Populated;
	let n = 0;
	const visitor = (): string => {
		n += 1;
		return `visitor-link-${factory.name}-${n}`;
	};
	const listed = async (who = "olga") =>
		Listed.parse((await w.call(who, "GET", `${A}/account-links`)).json).items;
	const linkOf = (clientId: string) => w.store.keyed.get("psizone", "link", `c/${clientId}`);
	/** A session the clinic booked for the client, days ahead. */
	const session = async (clientId: string, days: number): Promise<string> => {
		const start = NOW + days * 24 * HOUR;
		const made = await w.call("olga", "POST", `${A}/appointments`, {
			practitionerId: w.ids.elena,
			clientId,
			start,
			end: start + HOUR,
		});
		if (made.status !== 200) throw new Error(`session ${made.status}`);
		return String(made.json.id);
	};
	/** Everything the account sees in Programările mele: its own requests and the clinic's sessions of its clients. */
	const mineOf = async (subject: string) =>
		(await asSite(w, "GET", "/me/appointments", undefined, subject)).json.items as {
			id: string;
			canMove: boolean;
		}[];
	async function refused(run: () => Promise<Reply>, status: number, code: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}

	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	it("a signed-in booking with a client's e-mail the sign-in does not vouch for asks the team, and links nothing", async () => {
		const who = visitor();
		const s = await suggestionFor(w, who);
		expect(await linkOf(s.clientId)).toBeUndefined();
		const mine = (await listed()).find((x) => x.id === s.id);
		expect(mine).toMatchObject({ id: accountHashOf(who), via: "email" });
		expect(mine?.candidates).toEqual([
			{ clientId: s.clientId, name: expect.stringMatching(/^Link Client/) },
		]);
		expect(mine?.reference).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
		expect(JSON.stringify(mine)).not.toContain(s.email);
	});

	it("an e-mail the site vouches for, of exactly one client, links at once: their sessions show, their notices reach the account", async () => {
		const who = visitor();
		const client = await linkableClient(w);
		const id = await session(client.clientId, 6);
		await bookAs(w, who, 0, { email: client.email }, { "x-psi-verified-email": client.email });
		expect(await linkOf(client.clientId)).toBeDefined();
		expect((await listed()).some((x) => x.id === accountHashOf(who))).toBe(false);
		// The clinic's session shows beside the account's own request, and it is moved by the clinic.
		expect((await mineOf(who)).find((r) => r.id === id)).toMatchObject({ canMove: false });
		const trail = (await w.call("olga", "GET", `${A}/audit?action=client.account_link`)).json
			.items as { target: { id: string } }[];
		expect(trail.some((e) => e.target.id === client.clientId)).toBe(true);
		const told: { clientId?: unknown }[] = [];
		await createNovuNotify({
			store: w.store,
			clock: () => NOW,
			log: () => undefined,
			notifier: {
				notify(_app, _event, _payload, to) {
					for (const r of to) told.push(r as { clientId?: unknown });
					return Promise.resolve({ status: "queued", jobs: to.length });
				},
				drain: () => Promise.resolve(0),
				start: () => () => undefined,
				upsertSubscriber: () => Promise.resolve(),
				setTeam: () => Promise.resolve(),
				pending: () => Promise.resolve(0),
			},
		}).notify({
			app: "psizone",
			event: "appointment.confirmed",
			payload: { appointmentId: id, start: NOW + 6 * 24 * HOUR },
			to: { kind: "client", clientId: client.clientId },
			idempotencyKey: "k-linked",
		});
		expect(told.map((r) => r.clientId)).toContain(accountClientId(accountHashOf(who)));
	});

	it("a vouched e-mail two clients share (a guardian's children) is the team's to decide: both are candidates", async () => {
		const who = visitor();
		const a = await linkableClient(w, "Sibling");
		const b = await w.call("olga", "POST", `${A}/clients`, {
			name: "Sibling Two",
			guardian: { name: "Parent", email: a.email },
		});
		await bookAs(w, who, 0, { email: a.email }, { "x-psi-verified-email": a.email });
		expect(await linkOf(a.clientId)).toBeUndefined();
		const mine = (await listed()).find((x) => x.id === accountHashOf(who));
		expect(mine?.candidates.map((c) => c.clientId).sort()).toEqual(
			[a.clientId, String(b.json.id)].sort(),
		);
	});

	it("a phone alone is the team's to decide, however it was given", async () => {
		const who = visitor();
		const client = await linkableClient(w);
		await bookAs(w, who, 0, { email: "someone-else@example.test", phone: client.phone });
		expect((await listed()).find((x) => x.id === accountHashOf(who))).toMatchObject({
			via: "phone",
			candidates: [{ clientId: client.clientId }],
		});
	});

	it("a vouched e-mail without the visitor named is no vouching; an anonymous booking asks nothing", async () => {
		const client = await linkableClient(w);
		const before = (await listed()).length;
		const slots = (
			await asSite(
				w,
				"GET",
				`/book/slots?service=evaluation&from=${NOW}&to=${NOW + 10 * 24 * HOUR}&limit=5`,
			)
		).json.slots as { practitioner: string; start: number }[];
		const slot = slots[0];
		const held = await asSite(w, "POST", "/book/holds", {
			service: "evaluation",
			practitioner: slot?.practitioner,
			start: slot?.start,
			mode: "onsite",
			locale: "ro",
			channel: "form",
		});
		const sent = await asSite(
			w,
			"POST",
			`/book/holds/${String(held.json.reference)}/submit`,
			{
				holdToken: String(held.json.holdToken),
				contact: {
					name: "Anonymous",
					email: client.email,
					phone: "0799 000 002",
					age: 30,
					details: "A synthetic booking, long enough to be one.",
				},
			},
			undefined,
			{ "x-psi-verified-email": client.email },
		);
		expect(sent.status).toBe(200);
		expect(await linkOf(client.clientId)).toBeUndefined();
		expect((await listed()).length).toBe(before);
	});

	it("the team confirms one candidate: linked, the suggestion gone, the account sees that client's sessions", async () => {
		const who = visitor();
		const s = await suggestionFor(w, who);
		const id = await session(s.clientId, 7);
		const ok = await w.call("olga", "POST", `${A}/account-links/${s.id}/confirm`, {
			clientId: s.clientId,
		});
		expect(ok.status, JSON.stringify(ok.json)).toBe(200);
		expect((await listed()).some((x) => x.id === s.id)).toBe(false);
		expect((await mineOf(who)).map((r) => r.id)).toContain(id);
		const trail = (await w.call("olga", "GET", `${A}/audit?action=client.account_link`)).json
			.items as { target: { id: string }; actor: { subject: string } }[];
		expect(trail.find((e) => e.target.id === s.clientId)?.actor.subject).toBe("olga");
	});

	it("refuses a client that is not a candidate, a suggestion that is not there, and a client another account took: nothing written", async () => {
		const s = await suggestionFor(w, visitor());
		const other = await linkableClient(w);
		await refused(
			() =>
				w.call("olga", "POST", `${A}/account-links/${s.id}/confirm`, { clientId: other.clientId }),
			404,
			"not_found",
		);
		await refused(
			() =>
				w.call("olga", "POST", `${A}/account-links/${"0".repeat(64)}/confirm`, {
					clientId: s.clientId,
				}),
			404,
			"not_found",
		);
		// Meanwhile a vouched booking of another account takes the client.
		await bookAs(w, visitor(), 0, { email: s.email }, { "x-psi-verified-email": s.email });
		const taken = await refused(
			() => w.call("olga", "POST", `${A}/account-links/${s.id}/confirm`, { clientId: s.clientId }),
			409,
			"conflict",
		);
		expect(err(taken).detail).toEqual({ reason: "linked_elsewhere" });
	});

	it("the team says it is none of them: gone, and the same booking again asks nothing", async () => {
		const who = visitor();
		const s = await suggestionFor(w, who);
		const ok = await w.call("olga", "POST", `${A}/account-links/${s.id}/dismiss`);
		expect(ok.status, JSON.stringify(ok.json)).toBe(200);
		expect((await listed()).some((x) => x.id === s.id)).toBe(false);
		await bookAs(w, who, 0, { email: s.email });
		expect((await listed()).some((x) => x.id === s.id)).toBe(false);
		expect(await linkOf(s.clientId)).toBeUndefined();
	});

	it("a client already linked to another account is never suggested", async () => {
		const client = await linkableClient(w);
		await bookAs(
			w,
			visitor(),
			0,
			{ email: client.email },
			{ "x-psi-verified-email": client.email },
		);
		const later = visitor();
		await bookAs(w, later, 0, { email: client.email });
		expect((await listed()).some((x) => x.id === accountHashOf(later))).toBe(false);
	});

	it("refuses a role that may not invite clients, no sign-in and a stranger: nothing written", async () => {
		const s = await suggestionFor(w, visitor());
		await refused(() => w.call("vera", "GET", `${A}/account-links`), 403, "forbidden");
		await refused(
			() => w.call("vera", "POST", `${A}/account-links/${s.id}/dismiss`),
			403,
			"forbidden",
		);
		await refused(
			() => w.call(null, "POST", `${A}/account-links/${s.id}/dismiss`),
			401,
			"unauthenticated",
		);
		await refused(
			() =>
				w.call("mallory", "POST", `${A}/account-links/${s.id}/confirm`, { clientId: s.clientId }),
			404,
			"not_found",
		);
	});
});
