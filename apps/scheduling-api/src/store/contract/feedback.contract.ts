import { beforeAll, describe, expect, it } from "vitest";
import { createFieldCrypto } from "../../ports/crypto";
import { withActor } from "../actor";
import type { FeedbackGroups } from "../ports";
import type { ContractSection } from "./env";
import { draft, HOUR, useWorld, type World } from "./visits.world";

const crypto = createFieldCrypto("ab".repeat(32));
const seal = (text: string): string => crypto.seal(text, "feedback:contract");
const open = (sealed: string | undefined): string | undefined =>
	sealed === undefined ? undefined : crypto.open(sealed, "feedback:contract");
const ALL: FeedbackGroups = ["core", "contact"];

/** Feedback and its one-time links on every adapter. A refusal is its own case and leaves everything as it was. */
export const feedbackContract: ContractSection = (env) => {
	const h = useWorld(env);
	let w: World;
	let past = 0;
	beforeAll(() => {
		w = h.world();
	});
	const fb = () => env().store.feedback;
	/** A finished appointment of its own: days in the past, confirmed, attended. */
	const finished = async (over: Record<string, unknown> = {}): Promise<string> => {
		past += 1;
		const start = Date.now() - (5 + past) * 24 * HOUR;
		return (await h.c().appointments.insert(draft(w, { start, clientId: w.c1, ...over }))).id;
	};
	const linkFor = async (visit?: string): Promise<string> =>
		(await fb().issueLink(w.app, { visit: visit ?? (await finished()) }, undefined)).token;
	const snapshot = async (): Promise<string> =>
		JSON.stringify(await fb().list(w.app, ALL, { limit: 200 }));
	const refused = async (reason: string, run: () => Promise<unknown>): Promise<void> => {
		const before = await snapshot();
		await expect(run()).rejects.toMatchObject({ name: "StoreRefused", reason });
		expect(await snapshot(), "a refusal wrote something").toBe(before);
	};
	const rate = async (
		over: { rating?: number; text?: string; consent?: boolean; contact?: boolean } = {},
	): Promise<string> => {
		const token = await linkFor();
		return (
			await fb().redeem(w.app, token, {
				rating: over.rating ?? 5,
				textSealed: seal(over.text ?? "wonderful"),
				consentContact: over.consent ?? true,
				...(over.contact === false
					? {}
					: { contact: { name: "Parent Test", email: "Parent@Example.test" } }),
			})
		).id;
	};

	describe("feedback links", () => {
		it("a link for a finished visit tells when the visit was and until when the link works", async () => {
			const visit = await finished();
			const issued = await fb().issueLink(w.app, { visit }, 48);
			expect(issued.expiresAt).toBeGreaterThan(Date.now() + 47 * HOUR);
			expect(issued.expiresAt).toBeLessThanOrEqual(Date.now() + 48 * HOUR + 5_000);
			const opened = await fb().inspectLink(w.app, issued.token);
			expect(opened.expiresAt).toBe(issued.expiresAt);
			expect(opened.start).toBeLessThan(Date.now());
		});
		it("redeeming stores the rating and the sealed text, normalised contact, and uses the link up", async () => {
			const id = await rate({ rating: 4, text: "Mulțumim — foarte bine 🙂" });
			const got = await fb().get(w.app, id, ALL);
			expect(got?.item).toMatchObject({
				kind: "appointment_rating",
				channel: "email_link",
				status: "new",
				rating: 4,
				consentContact: true,
				contact: { name: "Parent Test", email: "parent@example.test" },
				linkedAccount: false,
				version: 1,
			});
			expect(open(got?.item.textSealed)).toBe("Mulțumim — foarte bine 🙂");
		});
		it("a link works once: the second redeem is used, and nothing was stored", async () => {
			const token = await linkFor();
			await fb().redeem(w.app, token, { rating: 5, consentContact: false });
			await refused("used", () => fb().redeem(w.app, token, { rating: 1, consentContact: false }));
			await refused("used", () => fb().inspectLink(w.app, token));
		});
		it("a link that was altered, or is not one, is invalid_link", async () => {
			const token = await linkFor();
			const [body = "", sig = ""] = token.split(".");
			const flipped = `${sig.startsWith("A") ? "B" : "A"}${sig.slice(1)}`;
			await refused("invalid_link", () => fb().inspectLink(w.app, `${body}.${flipped}`));
			await refused("invalid_link", () => fb().inspectLink(w.app, "nonsense"));
			await refused("invalid_link", () => fb().inspectLink(w.app, `${token}.extra`));
			await refused("invalid_link", () =>
				fb().redeem(w.app, `${flipped}.${sig}`, { rating: 5, consentContact: false }),
			);
		});
		it("another app's link is wrong_app", async () => {
			const token = await linkFor();
			const other = await env().newApp();
			await expect(fb().inspectLink(other, token)).rejects.toMatchObject({ reason: "wrong_app" });
			await expect(
				fb().redeem(other, token, { rating: 5, consentContact: false }),
			).rejects.toMatchObject({ reason: "wrong_app" });
			expect((await fb().inspectLink(w.app, token)).start).toBeLessThan(Date.now());
		});
		it("a visit still to come is not_eligible, so is a cancelled one and one the client missed", async () => {
			const future = (await h.c().appointments.insert(draft(w, { start: h.next() }))).id;
			await refused("not_eligible", () => fb().issueLink(w.app, { visit: future }, undefined));
			const cancelled = await finished();
			const row = await h.c().appointments.get(w.app, cancelled);
			if (row === undefined) throw new Error("fixture");
			await h.c().appointments.replace({ ...row, status: "cancelled", cancelReason: "no" });
			await refused("not_eligible", () => fb().issueLink(w.app, { visit: cancelled }, undefined));
			const missed = await finished();
			const miss = await h.c().appointments.get(w.app, missed);
			if (miss === undefined) throw new Error("fixture");
			await h.c().appointments.replace({ ...miss, status: "no_show" });
			await refused("not_eligible", () => fb().issueLink(w.app, { visit: missed }, undefined));
		});
		it("a visit or booking that is not there is not_found; naming both or neither is invalid", async () => {
			await refused("not_found", () =>
				fb().issueLink(w.app, { visit: "nosuchvisit000000000000000" }, undefined),
			);
			await refused("not_found", () =>
				fb().issueLink(w.app, { appointment: "ABCD-EFGH" }, undefined),
			);
			await refused("invalid", () => fb().issueLink(w.app, {}, undefined));
			await refused("invalid", () =>
				fb().issueLink(w.app, { visit: "x00000000001", appointment: "ABCD-EFGH" }, undefined),
			);
		});
		it("a lifetime under an hour or over ninety days is invalid_ttl; the bounds themselves are kept", async () => {
			const visit = await finished();
			await refused("invalid_ttl", () => fb().issueLink(w.app, { visit }, 0));
			await refused("invalid_ttl", () => fb().issueLink(w.app, { visit }, 2161));
			expect((await fb().issueLink(w.app, { visit }, 1)).token.length).toBeGreaterThan(20);
			expect((await fb().issueLink(w.app, { visit }, 2160)).token.length).toBeGreaterThan(20);
		});
		it("a second rating of one visit is already_rated, and its link is not used up", async () => {
			const visit = await finished();
			await fb().redeem(w.app, await linkFor(visit), { rating: 5, consentContact: false });
			const again = await linkFor(visit);
			await refused("already_rated", () =>
				fb().redeem(w.app, again, { rating: 1, consentContact: false }),
			);
			expect((await fb().inspectLink(w.app, again)).start).toBeLessThan(Date.now());
		});
		it("a rating needs a rating, a rating in range, and consent for a contact", async () => {
			const token = await linkFor();
			await expect(fb().redeem(w.app, token, { consentContact: false })).rejects.toMatchObject({
				reason: "invalid",
				detail: { problems: expect.arrayContaining(["rating_required"]) },
			});
			await expect(
				fb().redeem(w.app, token, { rating: 6, consentContact: false }),
			).rejects.toMatchObject({
				reason: "invalid",
				detail: { problems: expect.arrayContaining(["rating_range"]) },
			});
			await expect(
				fb().redeem(w.app, token, { rating: 0, consentContact: false }),
			).rejects.toMatchObject({ reason: "invalid" });
			await expect(
				fb().redeem(w.app, token, {
					rating: 5,
					consentContact: false,
					contact: { name: "A Parent" },
				}),
			).rejects.toMatchObject({
				reason: "invalid",
				detail: { problems: expect.arrayContaining(["consent_required"]) },
			});
			await expect(
				fb().redeem(w.app, token, { rating: 5, consentContact: true, contact: { email: "nope" } }),
			).rejects.toMatchObject({ reason: "invalid", detail: { problems: ["contact"] } });
			expect(
				(await fb().redeem(w.app, token, { rating: 1, consentContact: false })).id.length,
			).toBeGreaterThan(2);
		});
		it("a text past the store's bound is too_long", async () => {
			const token = await linkFor();
			await refused("too_long", () =>
				fb().redeem(w.app, token, {
					rating: 5,
					textSealed: seal("t".repeat(20_000)),
					consentContact: false,
				}),
			);
		});
	});

	describe("staff reading feedback", () => {
		it("the groups decide what is shown: none shows the item, core the rating and text, contact who wrote it", async () => {
			const id = await rate({ rating: 3, text: "so-so" });
			const bare = (await fb().get(w.app, id, []))?.item;
			expect(bare).toMatchObject({ id, kind: "appointment_rating", status: "new" });
			expect(bare).not.toHaveProperty("rating");
			expect(bare).not.toHaveProperty("textSealed");
			expect(bare).not.toHaveProperty("contact");
			expect(bare).not.toHaveProperty("consentContact");
			const core = (await fb().get(w.app, id, ["core"]))?.item;
			expect(core).toMatchObject({ rating: 3 });
			expect(core).not.toHaveProperty("contact");
			const contact = (await fb().get(w.app, id, ["contact"]))?.item;
			expect(contact).toMatchObject({ consentContact: true, contact: { name: "Parent Test" } });
			expect(contact).not.toHaveProperty("rating");
			expect((await fb().get(w.app, id, []))?.replies).toEqual([]);
		});
		it("an item that is not there, or is another app's, is absent", async () => {
			const id = await rate();
			expect(await fb().get(w.app, "nosuchfeedback0000000000000", ALL)).toBeUndefined();
			expect(await fb().get(await env().newApp(), id, ALL)).toBeUndefined();
		});
		it("the list is newest first, filtered by status, kind, channel and rating, and cut to a limit", async () => {
			const low = await rate({ rating: 1 });
			const high = await rate({ rating: 5 });
			const all = await fb().list(w.app, ALL, { limit: 200 });
			expect(all.items.findIndex((i) => i.id === high)).toBeLessThan(
				all.items.findIndex((i) => i.id === low),
			);
			const lows = await fb().list(w.app, ALL, { maxRating: 1, limit: 200 });
			expect(lows.items.map((i) => i.id)).toContain(low);
			expect(lows.items.map((i) => i.id)).not.toContain(high);
			expect(
				(await fb().list(w.app, ALL, { minRating: 5, limit: 200 })).items.map((i) => i.id),
			).toContain(high);
			expect(
				(await fb().list(w.app, ALL, { statuses: ["closed"] })).items.map((i) => i.id),
			).not.toContain(low);
			expect((await fb().list(w.app, ALL, { kind: "complaint" })).items).toEqual([]);
			expect((await fb().list(w.app, ALL, { channel: "chat" })).items).toEqual([]);
			const one = await fb().list(w.app, ALL, { limit: 1 });
			expect(one.items).toHaveLength(1);
			expect(one.more).toBe(true);
			expect((await fb().list(await env().newApp(), ALL, {})).items).toEqual([]);
		});
	});

	describe("staff answering feedback", () => {
		it("a reply makes the item answered, is sealed, names who wrote it, and says whether the author may be contacted", async () => {
			const id = await rate({ consent: true });
			const done = await withActor("rita", () => fb().reply(w.app, id, seal("Thank you!")));
			expect(done).toMatchObject({ status: "answered", contactable: true });
			const got = await fb().get(w.app, id, ALL);
			expect(got?.item).toMatchObject({ status: "answered", version: 2 });
			expect(got?.replies).toHaveLength(1);
			expect(got?.replies[0]).toMatchObject({ id: done.replyId, by: "rita" });
			expect(open(got?.replies[0]?.textSealed)).toBe("Thank you!");
		});
		it("an author who did not agree to be contacted is not contactable", async () => {
			const id = await rate({ consent: false, contact: false });
			expect((await fb().reply(w.app, id, seal("Noted"))).contactable).toBe(false);
		});
		it("a thread keeps every reply in order", async () => {
			const id = await rate();
			await fb().reply(w.app, id, seal("one"));
			await fb().reply(w.app, id, seal("two"));
			const replies = (await fb().get(w.app, id, ALL))?.replies ?? [];
			expect(replies.map((r) => open(r.textSealed))).toEqual(["one", "two"]);
		});
		it("an item is read once, then closed, then reopened to read", async () => {
			const id = await rate();
			expect(await fb().setStatus(w.app, id, "read", undefined)).toEqual({
				status: "read",
				changed: true,
			});
			expect(await fb().setStatus(w.app, id, "read", undefined)).toEqual({
				status: "read",
				changed: false,
			});
			expect(await fb().setStatus(w.app, id, "close", undefined)).toEqual({
				status: "closed",
				changed: true,
			});
			expect(await fb().setStatus(w.app, id, "reopen", undefined)).toEqual({
				status: "read",
				changed: true,
			});
		});
		it("a closed item takes no reply and no second close; an open one cannot be reopened", async () => {
			const id = await rate();
			await refused("not_closed", () => fb().setStatus(w.app, id, "reopen", undefined));
			await fb().setStatus(w.app, id, "close", undefined);
			await refused("closed", () => fb().reply(w.app, id, seal("too late")));
			await refused("closed", () => fb().setStatus(w.app, id, "close", undefined));
		});
		it("a change from another version is stale", async () => {
			const id = await rate();
			await refused("stale", () => fb().setStatus(w.app, id, "read", 9));
			expect((await fb().setStatus(w.app, id, "read", 1)).changed).toBe(true);
		});
		it("an item that is not there, a reply past the bound: not_found, too_long", async () => {
			await refused("not_found", () => fb().reply(w.app, "nosuchfeedback0000000000000", seal("x")));
			await refused("not_found", () =>
				fb().setStatus(w.app, "nosuchfeedback0000000000000", "read", undefined),
			);
			const id = await rate();
			await refused("too_long", () => fb().reply(w.app, id, seal("t".repeat(20_000))));
		});
	});
};
