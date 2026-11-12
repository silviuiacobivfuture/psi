import { describe, expect, it } from "vitest";
import { createNotifier } from "./notifier";
import { memoryPushStore, type NewSubscription } from "./store";
import type { PushTransport } from "./transport";
import type { PushPayload } from "./types";

const NOW = Date.UTC(2026, 10, 12, 9, 0);
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

describe("the control plane's push facts", () => {
	it("count one site's subscriptions by purpose, the signed-in and the failing", async () => {
		const store = memoryPushStore();
		await store.upsert(sub(1, { subject: "ana", topics: ["booking", "articles:psizone"] }), NOW);
		await store.upsert(sub(2), NOW);
		await store.upsert(sub(3, { site: "blog", topics: ["articles:eqsync"] }), NOW);
		await store.failed(sub(2).endpoint, NOW);
		await store.claim("article:42", NOW);
		expect(await store.stats("psizone")).toEqual({
			byTopic: { booking: 1, "articles:psizone": 2 },
			total: 2,
			signedIn: 1,
			failing: 1,
			announced: 1,
		});
		expect((await store.stats("blog")).total).toBe(1);
	});
	it("send a test only to the asking account's devices on this site", async () => {
		const store = memoryPushStore();
		await store.upsert(sub(1, { subject: "ana" }), NOW);
		await store.upsert(sub(2, { subject: "ana", site: "blog" }), NOW);
		await store.upsert(sub(3, { subject: "bob" }), NOW);
		const sent: Array<{ to: string; payload: PushPayload }> = [];
		const transport: PushTransport = {
			async send(to, payload) {
				sent.push({ to: to.endpoint, payload });
				return { ok: true, status: 201 };
			},
		};
		const n = createNotifier({ store, transport, now: () => NOW });
		expect(await n.testAccount("ana", "psizone")).toMatchObject({ recipients: 1, sent: 1 });
		expect(sent.map((s) => s.to)).toEqual([sub(1).endpoint]);
		expect(sent[0]?.payload.kind).toBe("test");
		expect(await n.testAccount("nobody", "psizone")).toMatchObject({
			sent: 0,
			skipped: "no-account",
		});
	});
});
