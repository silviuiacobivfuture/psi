import {
	FEEDBACK_CHANNELS,
	FEEDBACK_KINDS,
	FEEDBACK_STATUSES,
	FEEDBACK_TEXT_MAX,
} from "@psi/scheduling/clinic";
import {
	FEEDBACK_CHANNELS as WIRE_CHANNELS,
	FEEDBACK_KINDS as WIRE_KINDS,
	FEEDBACK_STATUSES as WIRE_STATUSES,
	FEEDBACK_TEXT_MAX as WIRE_TEXT_MAX,
} from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ok, type Populated } from "./testing/populate";
import { HOUR, NOW, type Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };

it("the wire lists are the package's", () => {
	expect([...WIRE_KINDS]).toEqual([...FEEDBACK_KINDS]);
	expect([...WIRE_CHANNELS]).toEqual([...FEEDBACK_CHANNELS]);
	expect([...WIRE_STATUSES]).toEqual([...FEEDBACK_STATUSES]);
	expect(WIRE_TEXT_MAX).toBe(FEEDBACK_TEXT_MAX);
});

describe.each(factories)("feedback, on the $name store", (factory) => {
	let w: Populated;
	let days = 0;
	const as = (who: string | null, method: string, path: string, body?: unknown) =>
		w.call(who, method, `${A}${path}`, body);
	const key = (method: string, path: string, body?: unknown, caller = "psizone-web" as const) =>
		w.callKey(caller, method, `${A}${path}`, body);
	/** A finished appointment of its own, so a link can be issued for it. */
	async function finished(): Promise<string> {
		days += 1;
		const start = NOW - (20 + days) * 24 * HOUR;
		return String(
			ok(
				await as("olga", "POST", "/appointments", {
					practitionerId: w.ids.elena,
					clientId: w.ids.c2,
					start,
					end: start + HOUR,
				}),
				"visit",
			).id,
		);
	}
	const issue = async (visit?: string, who = "rita"): Promise<string> =>
		String(
			ok(await as(who, "POST", "/feedback/links", { visit: visit ?? (await finished()) }), "link")
				.token,
		);
	const submit = (token: string, over: Record<string, unknown> = {}) =>
		key("POST", "/feedback/by-link", {
			token,
			rating: 5,
			text: "synthetic praise",
			consentContact: true,
			contact: { name: "Parent Test", email: "parent@example.test" },
			...over,
		});
	const rated = async (over: Record<string, unknown> = {}): Promise<string> =>
		String(ok(await submit(await issue(), over), "rating").id);
	async function refused(run: () => Promise<Reply>, status: number, code?: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		if (code !== undefined) expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}
	/** A member with no role and exactly these relations. */
	async function only(subject: string, ...relations: string[]): Promise<void> {
		await as("olga", "PUT", `/members/${subject}`, {
			displayName: subject,
			roles: [],
			coordinates: [],
		});
		await as("olga", "PUT", `/members/${subject}/overrides`, { grant: relations, deny: [] });
	}

	beforeAll(async () => {
		w = await factory.create();
		await only("blank");
		await only("viewer", "feedback_view_all");
		await only("reader", "feedback_view_all", "feedback_view_all_core");
		await only("contacts", "feedback_view_all", "feedback_view_all_contact");
		await only("closer", "feedback_view_all", "feedback_close_all");
		await only("replier", "feedback_view_all", "feedback_reply_all");
		await only(
			"full-replier",
			"feedback_view_all",
			"feedback_reply_all",
			"feedback_reply_all_core",
		);
		// A whole world populated through the API, on Convex too: past the default 10 s on a loaded workstation.
	}, 120_000);
	afterAll(async () => {
		await factory.cleanup();
	}, 120_000);

	describe("a client's link", () => {
		it("takes a rating with text and contact, once, and the answer is the stored id", async () => {
			const token = await issue();
			const open = await key("GET", `/feedback/by-link?token=${encodeURIComponent(token)}`);
			expect(open.status).toBe(200);
			expect(open.json).toMatchObject({ start: expect.any(Number), expiresAt: expect.any(Number) });
			const r = await submit(token, { text: "Mulțumim 🙂 — super" });
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			const item = (await as("rita", "GET", `/feedback/${r.json.id}`)).json as {
				item: Record<string, unknown>;
			};
			expect(item.item).toMatchObject({
				kind: "appointment_rating",
				channel: "email_link",
				status: "new",
				rating: 5,
				text: "Mulțumim 🙂 — super",
				consentContact: true,
				contact: { name: "Parent Test", email: "parent@example.test" },
			});
		});
		it("the text is not in the store in plain", async () => {
			if (factory.name !== "memory") return;
			await rated({ text: "needle-in-the-haystack-text" });
			expect(await w.dump()).not.toContain("needle-in-the-haystack-text");
		});
		it("text of exactly 4000 characters is kept, 4001 is refused, and so is an empty one", async () => {
			const id = await rated({ text: "t".repeat(4000) });
			expect(
				((await as("rita", "GET", `/feedback/${id}`)).json.item as { text: string }).text,
			).toHaveLength(4000);
			{
				const token = await issue();
				await refused(() => submit(token, { text: "t".repeat(4001) }), 400, "invalid");
			}
			{
				const token = await issue();
				await refused(() => submit(token, { text: "  " }), 400, "invalid");
			}
		});
		it("a rating alone, without text or contact, is enough", async () => {
			expect(
				(
					await submit(await issue(), {
						text: undefined,
						contact: undefined,
						consentContact: false,
					})
				).status,
			).toBe(200);
		});
		it("a used link is used: the second try is a conflict that says so, and stores nothing", async () => {
			const token = await issue();
			await submit(token);
			const r = await refused(() => submit(token, { rating: 1 }), 409, "conflict");
			expect(err(r).detail).toMatchObject({ reason: "used" });
			await refused(
				() => key("GET", `/feedback/by-link?token=${encodeURIComponent(token)}`),
				409,
				"conflict",
			);
		});
		it("an expired link is a conflict that says so (memory only: Convex keeps real time)", async () => {
			if (factory.name !== "memory") return;
			// A world of its own: the clock moves forward and is never put back.
			const later = await factory.create();
			const start = NOW - 30 * 24 * HOUR;
			const visit = String(
				ok(
					await later.call("olga", "POST", `${A}/appointments`, {
						practitionerId: later.ids.elena,
						clientId: later.ids.c2,
						start,
						end: start + HOUR,
					}),
					"visit",
				).id,
			);
			const token = String(
				ok(await later.call("rita", "POST", `${A}/feedback/links`, { visit }), "link").token,
			);
			later.clock.now += 91 * 24 * HOUR;
			const before = await later.fingerprint();
			const r = await later.callKey("psizone-web", "POST", `${A}/feedback/by-link`, {
				token,
				rating: 5,
				consentContact: false,
			});
			expect(r.status).toBe(409);
			expect(err(r).detail).toMatchObject({ reason: "expired" });
			expect(await later.fingerprint()).toBe(before);
		});
		it("a link that was altered, or is not one, is not found, and says nothing more", async () => {
			const token = await issue();
			const [body = "", sig = ""] = token.split(".");
			const flipped = `${sig.startsWith("A") ? "B" : "A"}${sig.slice(1)}`;
			await refused(() => submit(`${body}.${flipped}`), 404, "not_found");
			await refused(() => submit("not-a-link-at-all-but-long-enough"), 404, "not_found");
			await refused(
				() => key("GET", "/feedback/by-link?token=not-a-link-at-all-but-long-enough"),
				404,
				"not_found",
			);
		});
		it("another app's link is not found, whatever key presents it", async () => {
			const token = await issue();
			await refused(
				() =>
					w.callKey("hemisync-web", "POST", "/v1/apps/hemisync/feedback/by-link", {
						token,
						rating: 5,
						consentContact: false,
					}),
				404,
				"not_found",
			);
		});
		it("a rating out of range, a contact without consent, a bad e-mail: refused whole", async () => {
			const token = await issue();
			for (const over of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: undefined }])
				await refused(() => submit(token, over), 400, "invalid");
			const noConsent = await refused(
				() => submit(token, { consentContact: false }),
				400,
				"invalid",
			);
			expect(err(noConsent).detail).toMatchObject({
				problems: expect.arrayContaining(["consent_required"]),
			});
			await refused(() => submit(token, { contact: { email: "nope" } }), 400, "invalid");
		});
		it("a second rating of the same visit is a conflict", async () => {
			const visit = await finished();
			await submit(await issue(visit));
			const again = await issue(visit);
			await refused(() => submit(again), 409, "conflict");
		});
		it("the link route needs a service key or a sign-in, and an app that exists", async () => {
			const token = await issue();
			await refused(
				() => as(null, "POST", "/feedback/by-link", { token, rating: 5, consentContact: false }),
				401,
				"unauthenticated",
			);
			await refused(
				() =>
					key("POST", "/feedback/by-link", { token: "short", rating: 5, consentContact: false }),
				400,
				"invalid",
			);
		});
	});

	describe("issuing a link", () => {
		it("a finished visit gets one; the audit says who", async () => {
			await issue(undefined, "olga");
			const actions = (
				(await as("olga", "GET", "/audit?limit=200")).json.items as { action: string }[]
			).map((e) => e.action);
			expect(actions).toContain("feedback.link");
		});
		it("a visit to come, one that is not there, naming both or neither, a lifetime out of bounds: refused whole", async () => {
			// A visit weeks ahead of the world's clock and of the real one alike (Convex's backend runs on the real clock, so
			// "tomorrow" in the world passes on the calendar).
			const start = Math.max(NOW, Date.now()) + 30 * 24 * HOUR;
			const toCome = String(
				ok(
					await as("olga", "POST", "/appointments", {
						practitionerId: w.ids.elena,
						clientId: w.ids.c2,
						start,
						end: start + HOUR,
					}),
					"visit to come",
				).id,
			);
			await refused(
				() => as("rita", "POST", "/feedback/links", { visit: toCome }),
				409,
				"conflict",
			);
			await refused(
				() => as("rita", "POST", "/feedback/links", { visit: "nosuchvisit0000000000" }),
				404,
				"not_found",
			);
			await refused(() => as("rita", "POST", "/feedback/links", {}), 400, "invalid");
			await refused(
				() => as("rita", "POST", "/feedback/links", { visit: w.ids.a1, appointment: "ABCD-EFGH" }),
				400,
				"invalid",
			);
			const visit = await finished();
			for (const ttlHours of [0, 2161])
				await refused(
					() => as("rita", "POST", "/feedback/links", { visit, ttlHours }),
					400,
					"invalid",
				);
			expect(
				(await as("rita", "POST", "/feedback/links", { visit: await finished(), ttlHours: 2160 }))
					.status,
			).toBe(200);
		});
		it("only a role that may reply issues a link", async () => {
			const visit = await finished();
			for (const who of ["blank", "viewer", "dora", "vera"])
				await refused(() => as(who, "POST", "/feedback/links", { visit }), 403, "forbidden");
		});
	});

	describe("reading", () => {
		it("reception reads everything: rating, text, who wrote it, the replies", async () => {
			const id = await rated();
			const got = (await as("rita", "GET", `/feedback/${id}`)).json as {
				item: Record<string, unknown>;
				replies: unknown[];
			};
			expect(got.item).toMatchObject({
				rating: 5,
				text: "synthetic praise",
				contact: { name: "Parent Test" },
			});
			expect(got.replies).toEqual([]);
		});
		it("without a field group, the group is absent from the item", async () => {
			const id = await rated();
			const item = async (who: string) =>
				(await as(who, "GET", `/feedback/${id}`)).json.item as Record<string, unknown>;
			const viewer = await item("viewer");
			expect(viewer).toMatchObject({ id, kind: "appointment_rating", status: "new" });
			for (const field of ["rating", "text", "contact", "consentContact"])
				expect(viewer).not.toHaveProperty(field);
			const reader = await item("reader");
			expect(reader).toMatchObject({ rating: 5, text: "synthetic praise" });
			expect(reader).not.toHaveProperty("contact");
			const contacts = await item("contacts");
			expect(contacts).toMatchObject({ consentContact: true, contact: { name: "Parent Test" } });
			expect(contacts).not.toHaveProperty("text");
		});
		it("the list narrows by status, kind, channel and rating, newest first, with a limit", async () => {
			const low = await rated({ rating: 1 });
			const high = await rated({ rating: 5 });
			const ids = async (q: string) =>
				((await as("rita", "GET", `/feedback${q}`)).json.items as { id: string }[]).map(
					(i) => i.id,
				);
			const all = await ids("?limit=200");
			expect(all.indexOf(high)).toBeLessThan(all.indexOf(low));
			expect(await ids("?maxRating=1&limit=200")).toContain(low);
			expect(await ids("?maxRating=1&limit=200")).not.toContain(high);
			expect(await ids("?status=closed&limit=200")).not.toContain(low);
			expect(await ids("?status=new&status=read&limit=200")).toContain(low);
			expect(await ids("?kind=complaint")).toEqual([]);
			expect(await ids("?channel=chat")).toEqual([]);
			expect((await as("rita", "GET", "/feedback?limit=1")).json).toMatchObject({ more: true });
			expect(await ids("?limit=1")).toHaveLength(1);
		});
		it("a bad filter is invalid", async () => {
			await refused(() => as("rita", "GET", "/feedback?status=lost"), 400, "invalid");
			await refused(() => as("rita", "GET", "/feedback?limit=0"), 400, "invalid");
			await refused(() => as("rita", "GET", "/feedback?minRating=9"), 400, "invalid");
		});
		it("a role with no feedback right sees none, and a stranger is told nothing", async () => {
			const id = await rated();
			for (const who of ["blank", "dora", "vera", "ana"]) {
				await refused(() => as(who, "GET", "/feedback"), 403, "forbidden");
				await refused(() => as(who, "GET", `/feedback/${id}`), 403, "forbidden");
			}
			await refused(() => as("mallory", "GET", "/feedback"), 404, "not_found");
			await refused(() => as(null, "GET", "/feedback"), 401, "unauthenticated");
			await refused(() => as("rita", "GET", "/feedback/nosuchfeedback0000000"), 404, "not_found");
		});
		it("another app's owner cannot read this app's item", async () => {
			const id = await rated();
			await refused(
				() => w.call("hugo", "GET", `/v1/apps/psizone/feedback/${id}`),
				404,
				"not_found",
			);
			await refused(
				() => w.call("hugo", "GET", `/v1/apps/hemisync/feedback/${id}`),
				404,
				"not_found",
			);
		});
	});

	describe("answering", () => {
		it("a reply is stored, names who wrote it, and the item is answered; contactable says whether the author agreed", async () => {
			const id = await rated({ consentContact: true });
			const r = await as("rita", "POST", `/feedback/${id}/replies`, { text: "Mulțumim mult!" });
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			expect(r.json).toMatchObject({
				status: "answered",
				contactable: true,
				reply: { by: "rita", text: "Mulțumim mult!" },
			});
			const got = (await as("rita", "GET", `/feedback/${id}`)).json as {
				item: { status: string };
				replies: { by: string; text: string }[];
			};
			expect(got.item.status).toBe("answered");
			expect(got.replies).toMatchObject([{ by: "rita", text: "Mulțumim mult!" }]);
			const quiet = await rated({ consentContact: false, contact: undefined });
			expect(
				(await as("rita", "POST", `/feedback/${quiet}/replies`, { text: "Noted" })).json,
			).toMatchObject({ contactable: false });
		});
		it("a reply of 4000 characters is kept; 4001, empty and blank are refused", async () => {
			const id = await rated();
			expect(
				(await as("rita", "POST", `/feedback/${id}/replies`, { text: "r".repeat(4000) })).status,
			).toBe(200);
			for (const text of ["r".repeat(4001), "", "   "])
				await refused(
					() => as("rita", "POST", `/feedback/${id}/replies`, { text }),
					400,
					"invalid",
				);
		});
		it("a reply to a closed item is a conflict; to an item that is not there, not found", async () => {
			const id = await rated();
			await as("rita", "POST", `/feedback/${id}/status`, { event: "close" });
			await refused(
				() => as("rita", "POST", `/feedback/${id}/replies`, { text: "late" }),
				409,
				"conflict",
			);
			await refused(
				() => as("rita", "POST", "/feedback/nosuchfeedback0000000/replies", { text: "x" }),
				404,
				"not_found",
			);
		});
		it("who may reply: reception does; the roles without the right, or without the text group, do not", async () => {
			const id = await rated();
			for (const who of ["blank", "viewer", "dora", "closer"])
				await refused(
					() => as(who, "POST", `/feedback/${id}/replies`, { text: "x" }),
					403,
					"forbidden",
				);
			// Reply right but not the text's group: the text is the core group.
			const noText = await refused(
				() => as("replier", "POST", `/feedback/${id}/replies`, { text: "x" }),
				403,
				"forbidden",
			);
			expect(err(noText).detail).toMatchObject({ group: "core" });
			expect(
				(await as("full-replier", "POST", `/feedback/${id}/replies`, { text: "fine" })).status,
			).toBe(200);
		});
		it("the reply and the link are sealed in the store", async () => {
			if (factory.name !== "memory") return;
			const id = await rated();
			await as("rita", "POST", `/feedback/${id}/replies`, { text: "reply-needle-text" });
			expect(await w.dump()).not.toContain("reply-needle-text");
		});
	});

	describe("status", () => {
		it("read, close and reopen move an item as the rules say", async () => {
			const id = await rated();
			const post = async (event: string, extra: Record<string, unknown> = {}) =>
				(await as("rita", "POST", `/feedback/${id}/status`, { event, ...extra })).json;
			expect(await post("read")).toEqual({ status: "read", changed: true });
			expect(await post("read")).toEqual({ status: "read", changed: false });
			expect(await post("close")).toEqual({ status: "closed", changed: true });
			expect(await post("reopen")).toEqual({ status: "read", changed: true });
		});
		it("the audit keeps who changed the status and who replied", async () => {
			const id = await rated();
			await as("rita", "POST", `/feedback/${id}/status`, { event: "read" });
			await as("rita", "POST", `/feedback/${id}/replies`, { text: "audited" });
			const actions = (
				(await as("olga", "GET", "/audit?limit=200")).json.items as { action: string }[]
			).map((e) => e.action);
			expect(actions).toContain("feedback.status");
			expect(actions).toContain("feedback.reply");
		});
		it("closing a closed item, reopening an open one, or from another version: a conflict", async () => {
			const id = await rated();
			await refused(
				() => as("rita", "POST", `/feedback/${id}/status`, { event: "reopen" }),
				409,
				"conflict",
			);
			await refused(
				() => as("rita", "POST", `/feedback/${id}/status`, { event: "read", expectedVersion: 9 }),
				409,
				"conflict",
			);
			await as("rita", "POST", `/feedback/${id}/status`, { event: "close" });
			await refused(
				() => as("rita", "POST", `/feedback/${id}/status`, { event: "close" }),
				409,
				"conflict",
			);
		});
		it("an event outside read, close and reopen, or an item that is not there", async () => {
			const id = await rated();
			await refused(
				() => as("rita", "POST", `/feedback/${id}/status`, { event: "delete" }),
				400,
				"invalid",
			);
			await refused(
				() => as("rita", "POST", "/feedback/nosuchfeedback0000000/status", { event: "read" }),
				404,
				"not_found",
			);
		});
		it("who may: a viewer marks read but cannot close; a closer closes; nobody else does anything", async () => {
			const id = await rated();
			expect((await as("viewer", "POST", `/feedback/${id}/status`, { event: "read" })).status).toBe(
				200,
			);
			await refused(
				() => as("viewer", "POST", `/feedback/${id}/status`, { event: "close" }),
				403,
				"forbidden",
			);
			await refused(
				() => as("viewer", "POST", `/feedback/${id}/status`, { event: "reopen" }),
				403,
				"forbidden",
			);
			expect(
				(await as("closer", "POST", `/feedback/${id}/status`, { event: "close" })).status,
			).toBe(200);
			for (const who of ["blank", "dora", "vera"])
				await refused(
					() => as(who, "POST", `/feedback/${id}/status`, { event: "read" }),
					403,
					"forbidden",
				);
		});
		it("looking at the app as someone else is read-only", async () => {
			const id = await rated();
			await refused(
				() =>
					w.call(
						"olga",
						"POST",
						`${A}/feedback/${id}/status`,
						{ event: "read" },
						{ headers: { "x-psi-view-as": "role:owner" } },
					),
				403,
				"forbidden",
			);
		});
	});
});
