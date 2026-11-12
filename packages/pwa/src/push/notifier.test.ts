import { accountHashOf } from "@psi/scheduling";
import { describe, expect, it } from "vitest";
import { allowedPushEndpoint } from "./endpoints";
import { createNotifier, DAY_BEFORE_MINUTES } from "./notifier";
import { memoryPushStore, type NewSubscription } from "./store";
import type { PushTransport, SendResult } from "./transport";
import type { PushPayload, SubscriptionRecord } from "./types";

const NOW = Date.UTC(2026, 10, 12, 9, 0);

function recorder(
	answer: (s: SubscriptionRecord) => SendResult = () => ({ ok: true, status: 201 }),
) {
	const sent: Array<{ to: string; payload: PushPayload }> = [];
	const transport: PushTransport = {
		async send(to, payload) {
			sent.push({ to: to.endpoint, payload });
			return answer(to);
		},
	};
	return { sent, transport };
}

const sub = (n: number, over: Partial<NewSubscription> = {}): NewSubscription => ({
	endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
	p256dh: "p".repeat(87),
	auth: "a".repeat(22),
	site: "psizone",
	locale: "ro",
	topics: ["articles:psizone"],
	subject: null,
	...over,
});

describe("booking pushes", () => {
	it("reach only the booking's account, and say nothing but the kind and the account page", async () => {
		const store = memoryPushStore();
		await store.upsert(sub(1, { subject: "alice", topics: ["booking"], locale: "en" }), NOW);
		await store.upsert(sub(2, { subject: "bob", topics: ["booking"] }), NOW);
		await store.upsert(sub(3, { subject: "alice", topics: ["articles:psizone"] }), NOW);
		await store.linkBooking("PZ-7Q4K", "alice", NOW);
		const { sent, transport } = recorder();
		const n = createNotifier({ store, transport, now: () => NOW });

		const report = await n.notify({ kind: "booking.confirmed", reference: "PZ-7Q4K" });

		expect(report).toMatchObject({ recipients: 1, sent: 1 });
		expect(sent).toHaveLength(1);
		expect(sent[0]?.to).toContain("device-1");
		expect(sent[0]?.payload).toEqual({
			v: 1,
			kind: "booking.confirmed",
			locale: "en",
			url: "/en/cont",
			tag: "booking",
		});
		expect(JSON.stringify(sent[0]?.payload)).not.toContain("PZ-7Q4K");
	});

	it("finds the account by the scheduling store's hash, which is all Convex holds", async () => {
		const store = memoryPushStore();
		await store.upsert(sub(1, { subject: "alice", topics: ["booking"] }), NOW);
		await store.upsert(sub(2, { subject: "bob", topics: ["booking"] }), NOW);
		const { sent, transport } = recorder();
		const n = createNotifier({ store, transport, now: () => NOW });
		const report = await n.notify({ kind: "booking.cancelled", accountHash: accountHashOf("bob") });
		expect(report).toMatchObject({ recipients: 1, sent: 1 });
		expect(sent[0]?.to).toContain("device-2");
	});

	it("sends nothing when no account is linked to the booking", async () => {
		const store = memoryPushStore();
		await store.upsert(sub(1, { subject: "alice", topics: ["booking"] }), NOW);
		const { sent, transport } = recorder();
		const n = createNotifier({ store, transport, now: () => NOW });
		expect(await n.notify({ kind: "booking.cancelled", reference: "UNKNOWN" })).toMatchObject({
			skipped: "no-account",
		});
		expect(sent).toHaveLength(0);
	});

	it("never reaches an anonymous subscription, even one holding the booking topic", async () => {
		const store = memoryPushStore();
		await store.upsert(sub(1, { subject: null, topics: ["booking"] }), NOW);
		expect(await store.forTopic("booking", "alice")).toHaveLength(0);
		expect(await store.forTopic("booking")).toHaveLength(0);
	});

	it("plans the day-before reminder on confirm, sends it when due, and forgets it on cancel", async () => {
		const store = memoryPushStore();
		await store.upsert(sub(1, { subject: "alice", topics: ["booking"] }), NOW);
		await store.linkBooking("R1", "alice", NOW);
		await store.linkBooking("R2", "alice", NOW);
		const { sent, transport } = recorder();
		const n = createNotifier({ store, transport, now: () => NOW });
		const start = NOW + 3 * 86_400_000;
		await n.notify({ kind: "booking.confirmed", reference: "R1", start });
		await n.notify({ kind: "booking.confirmed", reference: "R2", start });
		await n.notify({ kind: "booking.cancelled", reference: "R2" });
		sent.length = 0;

		expect(await n.tick(start - DAY_BEFORE_MINUTES * 60_000 - 1)).toBe(0);
		expect(await n.tick(start - DAY_BEFORE_MINUTES * 60_000)).toBe(1);
		expect(sent.map((s) => s.payload.kind)).toEqual(["booking.reminder"]);
		expect(await n.tick(start)).toBe(0);
	});

	it("as scheduling's ReminderPort, keeps only the day-before lead and nothing in the past", async () => {
		const store = memoryPushStore();
		const n = createNotifier({ store, transport: recorder().transport, now: () => NOW });
		await n.reminders.schedule([
			{
				reference: "R",
				at: NOW + 1000,
				start: NOW + 86_400_000 + 1000,
				leadMinutes: DAY_BEFORE_MINUTES,
			},
			{ reference: "R", at: NOW + 2000, start: NOW + 2000 + 7_200_000, leadMinutes: 120 },
			{ reference: "P", at: NOW - 1, start: NOW + 86_400_000 - 1, leadMinutes: DAY_BEFORE_MINUTES },
		]);
		expect(await store.takeDueReminders(NOW + 10_000)).toEqual([
			{ reference: "R", at: NOW + 1000, leadMinutes: DAY_BEFORE_MINUTES },
		]);
	});

	it("checks the appointment is still confirmed at send time when asked to", async () => {
		const store = memoryPushStore();
		await store.upsert(sub(1, { subject: "alice", topics: ["booking"] }), NOW);
		await store.linkBooking("R", "alice", NOW);
		await store.planReminders([{ reference: "R", at: NOW, leadMinutes: DAY_BEFORE_MINUTES }]);
		const { sent, transport } = recorder();
		const n = createNotifier({
			store,
			transport,
			now: () => NOW,
			stillConfirmed: async () => false,
		});
		expect(await n.tick(NOW)).toBe(0);
		expect(sent).toHaveLength(0);
	});
});

describe("article pushes", () => {
	const article = {
		kind: "article.published" as const,
		brand: "psizone" as const,
		id: "41",
		url: {
			ro: "https://blog.psizone.ro/articole/somn",
			en: "https://blog.psizone.ro/en/articles/somn",
		},
		headline: { ro: "Somnul la copii", en: "Children's sleep" },
	};

	it("reach the brand's subscribers on any site, in each one's language, once per article", async () => {
		const store = memoryPushStore();
		await store.upsert(sub(1, { locale: "ro" }), NOW);
		await store.upsert(sub(2, { locale: "en", site: "blog" }), NOW);
		await store.upsert(sub(3, { topics: ["articles:eqsync"] }), NOW);
		const { sent, transport } = recorder();
		const n = createNotifier({ store, transport, now: () => NOW });

		expect(await n.notify(article)).toMatchObject({ recipients: 2, sent: 2 });
		expect(sent.map((s) => [s.payload.locale, s.payload.url, s.payload.headline]).sort()).toEqual([
			["en", article.url.en, "Children's sleep"],
			["ro", article.url.ro, "Somnul la copii"],
		]);
		expect(await n.notify(article)).toMatchObject({ skipped: "already-sent", sent: 0 });
	});

	it("drops a subscription the push service says is gone, and one that keeps failing", async () => {
		const store = memoryPushStore();
		await store.upsert(sub(1), NOW);
		await store.upsert(sub(2), NOW);
		const { transport } = recorder((s) =>
			s.endpoint.endsWith("1")
				? { ok: false, gone: true, status: 410 }
				: { ok: false, gone: false, status: 500 },
		);
		const n = createNotifier({ store, transport, now: () => NOW, onWarn: () => {} });
		const report = await n.notify({ ...article, id: "a" });
		expect(report).toMatchObject({ removed: 1, failed: 1 });
		expect(await store.byEndpoint(sub(1).endpoint)).toBeNull();
		for (const id of ["b", "c", "d", "e"]) await n.notify({ ...article, id });
		expect(await store.byEndpoint(sub(2).endpoint)).toBeNull();
	});
});

describe("allowedPushEndpoint", () => {
	it.each([
		"https://fcm.googleapis.com/fcm/send/abc",
		"https://updates.push.services.mozilla.com/wpush/v2/abc",
		"https://web.push.apple.com/QGx",
		"https://wns2-db5p.notify.windows.com/w/?token=x",
	])("accepts the browsers' push services: %s", (url) => {
		expect(allowedPushEndpoint(url)).toBe(true);
	});

	it.each([
		"http://fcm.googleapis.com/fcm/send/abc",
		"https://fcm.googleapis.com:8443/x",
		"https://fcm.googleapis.com.evil.test/x",
		"https://push.services.mozilla.com.evil.test/x",
		"https://account-db-rw.account.svc:5432/",
		"https://169.254.169.254/latest/meta-data",
		"https://user:pw@fcm.googleapis.com/x",
		"not a url",
	])("refuses anything else: %s", (url) => {
		expect(allowedPushEndpoint(url)).toBe(false);
	});
});
