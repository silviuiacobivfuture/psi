import { describe, expect, it } from "vitest";
import { convexEnv, convexTarget } from "../contract/adapters";

/**
 * The live change feed on a real Convex backend (skipped without one): a web request arriving is pushed to a subscriber
 * as a `request` event, once, and a resumed `since` finds it again; nothing is sent for another app's requests.
 */
const target = await convexTarget();
if (target === undefined)
	console.warn("feed.test: no Convex backend (CONVEX_URL, PSI_CONVEX_DATA)");

const until = async (ok: () => boolean, ms = 8_000): Promise<void> => {
	const end = Date.now() + ms;
	while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
};

describe.skipIf(target === undefined)("the Convex change feed", () => {
	it("pushes a callback request as one event, resumes from a cursor, and keeps apps apart", async () => {
		if (target === undefined) return;
		const env = convexEnv(target);
		try {
			const [mine, other] = [await env.newApp(), await env.newApp()];
			const seen: { kind: string; id: string; seq: number }[] = [];
			const errors: Error[] = [];
			const stop = await env.store.changes.subscribe(
				mine,
				Date.now() - 1_000,
				(events) => seen.push(...events),
				(e) => errors.push(e),
			);
			await env.store.visitor.callback(other, {
				contact: { name: "Other App", phone: "0712 345 678" },
				locale: "ro",
			});
			const { reference } = await env.store.visitor.callback(mine, {
				contact: { name: "Caller Test", phone: "0712 345 678" },
				locale: "ro",
			});
			await until(() => seen.some((e) => e.id === reference));
			expect(errors).toEqual([]);
			expect(seen.filter((e) => e.kind === "request")).toEqual([
				expect.objectContaining({ id: reference, kind: "request" }),
			]);
			// a second request does not repeat the first
			const second = await env.store.visitor.callback(mine, {
				contact: { name: "Caller Two", phone: "0712 345 679" },
				locale: "ro",
			});
			await until(() => seen.some((e) => e.id === second.reference));
			expect(seen.map((e) => e.id).sort()).toEqual([reference, second.reference].sort());
			stop();
			// a client that resumes with the first event's seq gets the second, and only it
			const first = seen.find((e) => e.id === reference);
			const resumed = await env.store.changes.since(mine, first?.seq ?? 0);
			expect(resumed.filter((e) => e.kind === "request").map((e) => e.id)).toEqual([
				second.reference,
			]);
		} finally {
			await env.cleanup();
		}
	}, 30_000);
});
