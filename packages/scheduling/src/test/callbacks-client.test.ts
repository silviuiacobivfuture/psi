import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallbackInput } from "../callbacks-client";
import { clientOn } from "../client";
import { callbackRetentionAction, DEFAULT_RETENTION } from "../domain/retention";
import { staffClientOn } from "../staff-client";
import { createTransport, SchedulingUnavailable } from "../transport";

/**
 * The client against a fake network (the one seam below it): what is sent to the store, and what
 * is not sent at all. Only the transport's `fetch` is replaced; the Convex client, the argument
 * encoding and the answer parsing are the real ones.
 */

interface Sent {
	path: string;
	args: Record<string, unknown>;
}

function network(answer: unknown): { sent: Sent[]; fetch: typeof fetch } {
	const sent: Sent[] = [];
	return {
		sent,
		fetch: async (_url, init) => {
			const body = JSON.parse(String(init?.body));
			sent.push({ path: body.path, args: body.args[0] });
			return new Response(JSON.stringify({ status: "success", value: answer }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		},
	};
}

const KEY = "k".repeat(40);
const transport = () =>
	createTransport({ url: "http://127.0.0.1:3210", serverKey: KEY, timeoutMs: 1000 });

const input = (over: Partial<CallbackInput> = {}): CallbackInput => ({
	tenant: "psizone",
	contact: { name: "  DEMO Name  ", email: "", phone: " 0700 000 000 " },
	audience: "child",
	when: "any",
	locale: "ro",
	channel: "form",
	page: "/contact",
	consent: true,
	...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("requestCallback", () => {
	it("sends one create with the cleaned contact, the key and every field, and returns the id", async () => {
		const net = network({ ok: true, id: "abc123" });
		vi.stubGlobal("fetch", net.fetch);
		const result = await clientOn(transport()).requestCallback(
			input({ service: "race", preferredStart: 1_800_000_000_000 }),
		);
		expect(result).toEqual({ ok: true, id: "abc123" });
		expect(net.sent).toEqual([
			{
				path: "callbacks:create",
				args: {
					key: KEY,
					tenant: "psizone",
					contact: { name: "DEMO Name", phone: "0700 000 000" },
					audience: "child",
					when: "any",
					service: "race",
					preferredStart: 1_800_000_000_000,
					locale: "ro",
					channel: "form",
					page: "/contact",
					consent: true,
				},
			},
		]);
	});

	it("without consent nothing is sent", async () => {
		const net = network({ ok: true, id: "x" });
		vi.stubGlobal("fetch", net.fetch);
		expect(await clientOn(transport()).requestCallback(input({ consent: false }))).toEqual({
			ok: false,
			reason: "no_consent",
		});
		expect(net.sent).toEqual([]);
	});

	it.each([
		["no way to reach them", { contact: { name: "DEMO Name" } }],
		["a name of one letter", { contact: { name: "D", phone: "0700 000 000" } }],
		["a malformed e-mail", { contact: { name: "DEMO Name", email: "not-mail" } }],
		["a malformed phone", { contact: { name: "DEMO Name", phone: "abc" } }],
		["a page that is not a path", { page: "https://evil.example/x" }],
		["a tenant that is not a slug", { tenant: "Psi Zone" }],
		["a negative time", { preferredStart: -1 }],
	] satisfies ReadonlyArray<
		readonly [string, Partial<CallbackInput>]
	>)("%s is invalid and nothing is sent", async (_why, over) => {
		const net = network({ ok: true, id: "x" });
		vi.stubGlobal("fetch", net.fetch);
		expect(await clientOn(transport()).requestCallback(input(over))).toEqual({
			ok: false,
			reason: "invalid",
		});
		expect(net.sent).toEqual([]);
	});

	it("passes the store's refusal on, and fails loudly on an answer of the wrong shape", async () => {
		vi.stubGlobal("fetch", network({ ok: false, reason: "unknown_tenant" }).fetch);
		expect(await clientOn(transport()).requestCallback(input())).toEqual({
			ok: false,
			reason: "unknown_tenant",
		});
		vi.stubGlobal("fetch", network({ ok: "yes" }).fetch);
		await expect(clientOn(transport()).requestCallback(input())).rejects.toBeInstanceOf(
			SchedulingUnavailable,
		);
	});

	it("an unreachable store throws SchedulingUnavailable without the visitor's data in it", async () => {
		vi.stubGlobal("fetch", async () => {
			throw new TypeError("fetch failed");
		});
		const error = await clientOn(transport())
			.requestCallback(input())
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(SchedulingUnavailable);
		expect(String((error as Error).message)).not.toMatch(/DEMO|0700/);
	});
});

describe("the staff half", () => {
	it("lists with the key and parses rows; marks handled with the actor", async () => {
		const row = {
			id: "r1",
			status: "new",
			createdAt: 1,
			audience: "adult",
			when: "morning",
			locale: "en",
			channel: "guide",
			page: "/contact",
		};
		let net = network({ ok: true, timeZone: "Europe/Bucharest", callbacks: [row] });
		vi.stubGlobal("fetch", net.fetch);
		const staff = staffClientOn(transport());
		expect(await staff.callbacks({ tenant: "psizone", status: "new" })).toEqual({
			ok: true,
			timeZone: "Europe/Bucharest",
			callbacks: [row],
		});
		expect(net.sent).toEqual([
			{ path: "callbacks:list", args: { key: KEY, tenant: "psizone", status: "new" } },
		]);
		net = network({ ok: true });
		vi.stubGlobal("fetch", net.fetch);
		await staff.markCallbackHandled({ tenant: "psizone", id: "r1", actor: { subject: "s" } });
		expect(net.sent).toEqual([
			{
				path: "callbacks:markHandled",
				args: { key: KEY, tenant: "psizone", id: "r1", actor: { subject: "s" } },
			},
		]);
	});
});

describe("callback retention", () => {
	const DAY = 86_400_000;
	const NOW = Date.parse("2026-11-16T08:00:00Z");
	const base = { createdAt: NOW - 100 * DAY, handledAt: undefined, hasContact: true } as const;

	it("keeps a new request however old (within the record limit), keeping its contact", () => {
		expect(callbackRetentionAction({ ...base, status: "new" }, NOW)).toBe("keep");
		expect(
			callbackRetentionAction({ ...base, status: "new", createdAt: NOW - 364 * DAY }, NOW),
		).toBe("keep");
	});

	it("erases a handled request's contact exactly contactDays after it was handled", () => {
		const handled = (ago: number) =>
			callbackRetentionAction({ ...base, status: "handled", handledAt: NOW - ago * DAY }, NOW);
		expect(handled(DEFAULT_RETENTION.contactDays - 1)).toBe("keep");
		expect(handled(DEFAULT_RETENTION.contactDays)).toBe("erase_contact");
		expect(handled(DEFAULT_RETENTION.contactDays + 1)).toBe("erase_contact");
	});

	it("a handled request without a contact is kept until the record limit, then deleted", () => {
		const bare = {
			...base,
			status: "handled" as const,
			handledAt: NOW - 40 * DAY,
			hasContact: false,
		};
		expect(callbackRetentionAction(bare, NOW)).toBe("keep");
		expect(
			callbackRetentionAction(
				{ ...bare, createdAt: NOW - DEFAULT_RETENTION.recordDays * DAY },
				NOW,
			),
		).toBe("delete");
	});

	it("deletes any request at recordDays after it was made, handled or not", () => {
		const old = { ...base, createdAt: NOW - DEFAULT_RETENTION.recordDays * DAY };
		expect(callbackRetentionAction({ ...old, status: "new" }, NOW)).toBe("delete");
		expect(callbackRetentionAction({ ...old, status: "handled", handledAt: NOW - DAY }, NOW)).toBe(
			"delete",
		);
		expect(
			callbackRetentionAction({ ...old, createdAt: old.createdAt + 1, status: "new" }, NOW),
		).toBe("keep");
	});

	it("a handled request with no handled time counts from its creation", () => {
		expect(
			callbackRetentionAction({ ...base, status: "handled", createdAt: NOW - 31 * DAY }, NOW),
		).toBe("erase_contact");
	});
});
