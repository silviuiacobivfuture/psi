import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backendReady } from "./admin";
import { actor, DAY, enc, HOUR, id, n } from "./api-harness";
import { clinicWorld } from "./clinic-world";
import { callMutation } from "./server";

/**
 * Feedback against the local backend, in throwaway `test-fb-…` apps (synthetic data): who can
 * write what, the rules each item must meet (every refusal its own case, asserting nothing was
 * written), what each field group shows, the reply thread, the status moves, and erasure.
 */
if (!backendReady) console.warn("feedback-backend.test: no local backend; see README");

const w = clinicWorld("fb");
const { a, b, ids, ref, state } = w;
const HASH = "a".repeat(64);
const note = { kind: "general", textEnc: enc, consentContact: false } as const;
const past = Date.now() - 30 * DAY;

describe.skipIf(!backendReady)("feedback", () => {
	let t = 0;
	const visit = async (
		over: Record<string, unknown> = {},
		client: string | undefined = ref("ion"),
	) => {
		t += 1;
		const start = past + t * DAY;
		return id(
			await a.mut("apiVisits:create", {
				column: { kind: "practitioner", id: state.practitioner },
				start,
				end: start + HOUR,
				sessionType: "ABA",
				...(client === undefined ? {} : { client }),
				...over,
			}),
		);
	};
	const write = (
		channel: string,
		args: Record<string, unknown>,
		e: { audit?: number; ok?: boolean; same?: boolean } = {},
	) => a.mut("apiFeedback:submit", { channel, ...args }, e);

	beforeAll(async () => {
		if (backendReady) await w.setup();
	});
	afterAll(async () => {
		if (backendReady) await w.teardown();
	});

	describe("writing it", () => {
		it("a client writes from their account: stored once, audited once, status new", async () => {
			ids.fromAccount = id(await write("account", { ...note, accountHash: HASH, rating: 4 }));
			const got = await a.qry("apiFeedback:get", {
				feedback: ref("fromAccount"),
				groups: ["core", "contact"],
			});
			expect(got.item).toMatchObject({
				kind: "general",
				channel: "account",
				status: "new",
				rating: 4,
				linkedAccount: true,
				version: 1,
			});
			expect(got.item).not.toHaveProperty("accountHash");
		});

		it("the chat may be anonymous; staff write about the app with their subject", async () => {
			await write("chat", { ...note, kind: "suggestion" });
			ids.fromStaff = id(await write("staff", { ...note, kind: "site_issue" }));
			const got = await a.qry("apiFeedback:get", {
				feedback: ref("fromStaff"),
				groups: ["contact"],
			});
			expect(got.item).toMatchObject({ staffSubject: actor.subject, channel: "staff" });
		});

		it("a rating of a visit that took place is stored with the client of the visit", async () => {
			ids.doneVisit = await visit();
			ids.rated = id(
				await write("account", {
					kind: "appointment_rating",
					rating: 5,
					visit: ref("doneVisit"),
					accountHash: HASH,
					consentContact: false,
				}),
			);
			const got = await a.qry("apiFeedback:get", { feedback: ref("rated"), groups: [] });
			expect(got.item).toMatchObject({ visit: ref("doneVisit"), client: ref("ion") });
		});

		it("contact details are stored only with consent, and then normalised", async () => {
			const out = id(
				await write("chat", {
					...note,
					consentContact: true,
					contact: { name: "Test Name", email: "A@X.ro", phone: "0700 000 001" },
				}),
			);
			const got = await a.qry("apiFeedback:get", { feedback: out, groups: ["contact"] });
			expect(got.item).toMatchObject({
				consentContact: true,
				contact: { name: "Test Name", email: "a@x.ro", phone: "+40700000001" },
			});
		});

		it.each([
			["no rating and no text", { kind: "general", consentContact: false }, "invalid"],
			["a rating of 0", { ...note, rating: 0 }, "invalid"],
			["a rating of 6", { ...note, rating: 6 }, "invalid"],
			["a fractional rating", { ...note, rating: 3.5 }, "invalid"],
			[
				"an appointment rating without a rating",
				{ ...note, kind: "appointment_rating", visit: "x" },
				"invalid",
			],
			[
				"an appointment rating without an appointment",
				{ ...note, kind: "appointment_rating", rating: 3 },
				"invalid",
			],
			["contact details without consent", { ...note, contact: { email: "a@x.ro" } }, "invalid"],
			[
				"a contact with a bad e-mail",
				{ ...note, consentContact: true, contact: { email: "nope" } },
				"invalid",
			],
			[
				"a text over the ciphertext limit",
				{ ...note, textEnc: { ...enc, data: "A".repeat(24_001) } },
				"too_long",
			],
			["a visit of no app", { ...note, visit: "nope" }, "unknown_visit"],
			["a client of no app", { ...note, client: "nope" }, "unknown_client"],
			[
				"a booking that does not exist",
				{ ...note, appointment: "ZZZZ-ZZZZ" },
				"unknown_appointment",
			],
		])("refuses %s and writes nothing", async (_label, extra, reason) => {
			const out = await write(
				"account",
				{ accountHash: HASH, ...extra },
				{ audit: 0, ok: false, same: true },
			);
			expect(out.reason).toBe(reason);
		});

		it("refuses an account item without the account hash, or with a malformed one, and writes nothing", async () => {
			expect((await write("account", note, { audit: 0, ok: false, same: true })).reason).toBe(
				"account_required",
			);
			expect(
				(
					await write(
						"account",
						{ ...note, accountHash: "short" },
						{ audit: 0, ok: false, same: true },
					)
				).reason,
			).toBe("account_required");
			expect(
				(
					await write(
						"chat",
						{ ...note, accountHash: "short" },
						{ audit: 0, ok: false, same: true },
					)
				).reason,
			).toBe("invalid");
		});

		it("refuses a staff item without a subject, writing nothing", async () => {
			const out = await a.sys(
				"apiFeedback:submit",
				{ channel: "staff", ...note },
				{ audit: 0, ok: false, same: true },
			);
			expect(out.reason).toBe("actor_required");
		});

		it("refuses staff an appointment rating", async () => {
			const out = await write(
				"staff",
				{ kind: "appointment_rating", rating: 3, visit: ref("doneVisit"), consentContact: false },
				{ audit: 0, ok: false, same: true },
			);
			expect(out.reason).toBe("invalid");
		});

		it("the e-mail link is not a channel here; a channel outside the list is rejected by the validator", async () => {
			const before = await a.counts();
			for (const channel of ["email_link", "sms"]) {
				await expect(
					callMutation("apiFeedback:submit", { tenant: a.TENANT, actor, channel, ...note }),
				).rejects.toThrow();
			}
			expect(await a.counts()).toEqual(before);
		});

		it("refuses a rating of a visit still to come, of an absent client, of a cancelled visit", async () => {
			const future = await visit({ start: Date.now() + 5 * DAY, end: Date.now() + 5 * DAY + HOUR });
			const absent = await visit();
			await a.mut("apiVisits:setAttendance", { visit: absent, attendance: "absent" });
			const cancelled = await visit();
			await a.mut("apiVisits:cancel", { visit: cancelled });
			for (const subject of [future, absent, cancelled]) {
				const out = await write(
					"account",
					{
						kind: "appointment_rating",
						rating: 5,
						visit: subject,
						accountHash: HASH,
						consentContact: false,
					},
					{ audit: 0, ok: false, same: true },
				);
				expect(out.reason, subject).toBe("not_eligible");
			}
		});

		it("refuses a second rating of the same visit, and a rating naming another client", async () => {
			const twice = await write(
				"account",
				{
					kind: "appointment_rating",
					rating: 1,
					visit: ref("doneVisit"),
					accountHash: HASH,
					consentContact: false,
				},
				{ audit: 0, ok: false, same: true },
			);
			expect(twice.reason).toBe("already_rated");
			const other = await write(
				"account",
				{
					kind: "appointment_rating",
					rating: 1,
					visit: await visit(),
					client: ref("ana"),
					accountHash: HASH,
					consentContact: false,
				},
				{ audit: 0, ok: false, same: true },
			);
			expect(other.reason).toBe("client_mismatch");
		});

		it("another app's visit and client are not found", async () => {
			const out = await b.mut(
				"apiFeedback:submit",
				{ channel: "chat", ...note, visit: ref("doneVisit") },
				{ audit: 0, ok: false, same: true },
			);
			expect(out.reason).toBe("unknown_visit");
		});
	});

	describe("reading it", () => {
		it("shows only the identity without a group, the rating and text with core, the author with contact", async () => {
			const asked = (groups: string[]) =>
				a.qry("apiFeedback:get", { feedback: ref("fromAccount"), groups });
			const none = (await asked([])).item as Record<string, unknown>;
			expect(none).toMatchObject({ kind: "general", status: "new" });
			for (const key of ["rating", "textEnc", "consentContact", "contact", "staffSubject"])
				expect(none).not.toHaveProperty(key);
			const core = (await asked(["core"])).item as Record<string, unknown>;
			expect(core).toMatchObject({ rating: 4, textEnc: enc });
			expect(core).not.toHaveProperty("consentContact");
			const contact = (await asked(["contact"])).item as Record<string, unknown>;
			expect(contact).toMatchObject({ consentContact: false });
			expect(contact).not.toHaveProperty("rating");
			expect(contact).not.toHaveProperty("textEnc");
		});

		it("lists newest first, by status, kind, rating range and dates, with a limit and a 'more'", async () => {
			const all = await a.qry("apiFeedback:list", { groups: ["core"] });
			const items = all.items as Array<{ createdAt: number; kind: string; rating?: number }>;
			expect(items.length).toBeGreaterThanOrEqual(5);
			expect(items.map((i) => i.createdAt)).toEqual(
				[...items.map((i) => i.createdAt)].sort((x, y) => y - x),
			);
			const ratings = (
				await a.qry("apiFeedback:list", { groups: ["core"], kind: "appointment_rating" })
			).items as Array<{ kind: string }>;
			expect(ratings.every((i) => i.kind === "appointment_rating")).toBe(true);
			const high = (await a.qry("apiFeedback:list", { groups: ["core"], minRating: 5 }))
				.items as Array<{ rating: number }>;
			expect(high.length).toBeGreaterThan(0);
			expect(high.every((i) => i.rating === 5)).toBe(true);
			const low = (await a.qry("apiFeedback:list", { groups: ["core"], maxRating: 4 }))
				.items as Array<{ rating: number }>;
			expect(low.every((i) => i.rating <= 4)).toBe(true);
			const one = await a.qry("apiFeedback:list", { groups: [], limit: 1 });
			expect((one.items as unknown[]).length).toBe(1);
			expect(one.more).toBe(true);
			const none = await a.qry("apiFeedback:list", { groups: [], to: 1 });
			expect(none).toMatchObject({ items: [], more: false });
			const news = (await a.qry("apiFeedback:list", { groups: [], statuses: ["closed"] }))
				.items as unknown[];
			expect(news).toEqual([]);
		});

		it("another app sees none of it", async () => {
			expect((await b.qry("apiFeedback:list", { groups: ["core", "contact"] })).items).toEqual([]);
			const out = await b.qry(
				"apiFeedback:get",
				{ feedback: ref("fromAccount"), groups: ["core"] },
				{ ok: false },
			);
			expect(out.reason).toBe("not_found");
		});
	});

	describe("answering and closing", () => {
		const reply = (
			e: { audit?: number; ok?: boolean; same?: boolean } = {},
			extra: Record<string, unknown> = {},
		) => a.mut("apiFeedback:reply", { feedback: ref("fromAccount"), textEnc: enc, ...extra }, e);
		const status = (
			event: string,
			e: { audit?: number; ok?: boolean; same?: boolean } = {},
			extra: Record<string, unknown> = {},
		) => a.mut("apiFeedback:setStatus", { feedback: ref("fromAccount"), event, ...extra }, e);

		it("reading marks it read once; reading again changes nothing and audits nothing", async () => {
			expect(await status("read")).toMatchObject({ changed: true, status: "read" });
			expect(await status("read", { audit: 0 })).toMatchObject({ changed: false, status: "read" });
		});

		it("a reply marks it answered, joins the thread, and says whether the author may be contacted", async () => {
			expect(await reply()).toMatchObject({ status: "answered", contactable: false });
			expect(await reply()).toMatchObject({ status: "answered" });
			const got = await a.qry("apiFeedback:get", {
				feedback: ref("fromAccount"),
				groups: ["core"],
			});
			const thread = got.replies as Array<{ by: string; at: number }>;
			expect(thread).toHaveLength(2);
			expect(thread[0]?.by).toBe(actor.subject);
			expect((thread[0]?.at ?? 0) <= (thread[1]?.at ?? 0)).toBe(true);
			expect(
				(await a.qry("apiFeedback:get", { feedback: ref("fromAccount"), groups: [] })).replies,
			).toEqual([]);
		});

		it("a consenting author is contactable", async () => {
			const consenting = id(
				await write("chat", { ...note, consentContact: true, contact: { email: "a@x.ro" } }),
			);
			const out = await a.mut("apiFeedback:reply", { feedback: consenting, textEnc: enc });
			expect(out.contactable).toBe(true);
		});

		it("refuses a stale version, a reply that is too long, a reply on another app's item: nothing written", async () => {
			expect(
				(await status("close", { audit: 0, ok: false, same: true }, { expectedVersion: 1 })).reason,
			).toBe("stale");
			expect(
				(
					await reply(
						{ audit: 0, ok: false, same: true },
						{ textEnc: { ...enc, data: "A".repeat(24_001) } },
					)
				).reason,
			).toBe("too_long");
			const other = await b.mut(
				"apiFeedback:reply",
				{ feedback: ref("fromAccount"), textEnc: enc },
				{ audit: 0, ok: false, same: true },
			);
			expect(other.reason).toBe("not_found");
			const gone = await a.mut(
				"apiFeedback:setStatus",
				{ feedback: "nope", event: "close" },
				{ audit: 0, ok: false, same: true },
			);
			expect(gone.reason).toBe("not_found");
		});

		it("closing is audited once; a reply and a second close are refused on a closed item", async () => {
			expect(await status("close")).toMatchObject({ changed: true, status: "closed" });
			expect((await reply({ audit: 0, ok: false, same: true })).reason).toBe("closed");
			expect((await status("close", { audit: 0, ok: false, same: true })).reason).toBe("closed");
		});

		it("reopens a closed item to read, and refuses reopening an open one", async () => {
			expect(await status("reopen")).toMatchObject({ changed: true, status: "read" });
			expect((await status("reopen", { audit: 0, ok: false, same: true })).reason).toBe(
				"not_closed",
			);
			expect(await reply()).toMatchObject({ status: "answered" });
		});

		it("filters the list by status", async () => {
			const answered = (await a.qry("apiFeedback:list", { groups: [], statuses: ["answered"] }))
				.items as Array<{ status: string }>;
			expect(answered.length).toBeGreaterThan(0);
			expect(answered.every((i) => i.status === "answered")).toBe(true);
		});
	});

	describe("erasing a client", () => {
		it("deletes what the client wrote about their visits and the replies to it, and audits it", async () => {
			const person = id(
				await a.mut("apiClients:create", {
					client: { ...w.person, name: "Test Leaver", phone: "0700 333 333" },
				}),
			);
			const gone = await visit({}, person);
			const item = id(
				await write("account", {
					kind: "appointment_rating",
					rating: 2,
					visit: gone,
					accountHash: HASH,
					textEnc: enc,
					consentContact: false,
				}),
			);
			await a.mut("apiFeedback:reply", { feedback: item, textEnc: enc });
			const before = await a.counts();
			await a.mut("staffClients:eraseClient", { client: person }, { audit: 2 });
			const after = await a.counts();
			expect(n(before, "feedback") - n(after, "feedback")).toBe(1);
			expect(n(before, "feedbackReplies") - n(after, "feedbackReplies")).toBe(1);
			const out = await a.qry(
				"apiFeedback:get",
				{ feedback: item, groups: ["core"] },
				{ ok: false },
			);
			expect(out.reason).toBe("not_found");
		});
	});
});
