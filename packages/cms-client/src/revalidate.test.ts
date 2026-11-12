import { describe, expect, it } from "vitest";
import {
	handleRevalidate,
	type RevalidateEvent,
	SIGNATURE_HEADER,
	signRevalidation,
} from "./revalidate";

const SECRET = "r".repeat(32);
const NOW = Date.parse("2026-11-12T10:00:00Z");
const event: RevalidateEvent = {
	kind: "articles",
	event: "publish",
	id: "7",
	slug: "semne",
	brand: "psizone",
	sentAt: new Date(NOW).toISOString(),
};

function post(body: string, signature: string): Request {
	return new Request("http://blog.test/__cms/revalidate", {
		method: "POST",
		body,
		headers: { [SIGNATURE_HEADER]: signature },
	});
}

describe("the revalidation webhook", () => {
	it("runs the handler for a signed, fresh event", async () => {
		const seen: string[] = [];
		const { body, signature } = signRevalidation(event, SECRET);
		const r = await handleRevalidate(
			post(body, signature),
			SECRET,
			{ articles: (e) => void seen.push(e.id) },
			() => NOW,
		);
		expect(r.status).toBe(204);
		expect(seen).toEqual(["7"]);
	});
	it("refuses a wrong signature, a stale event and a missing secret", async () => {
		const { body, signature } = signRevalidation(event, SECRET);
		expect((await handleRevalidate(post(body, "sha256=00"), SECRET, {}, () => NOW)).status).toBe(
			401,
		);
		expect(
			(await handleRevalidate(post(body, signature), SECRET, {}, () => NOW + 6 * 60_000)).status,
		).toBe(400);
		expect((await handleRevalidate(post(body, signature), undefined, {})).status).toBe(503);
	});
	it("routes ai-settings events", async () => {
		const sites: string[] = [];
		const { body, signature } = signRevalidation(
			{ kind: "ai-settings", sites: ["blog", "eqsync"], sentAt: new Date(NOW).toISOString() },
			SECRET,
		);
		await handleRevalidate(
			post(body, signature),
			SECRET,
			{ "ai-settings": (e) => void sites.push(...e.sites) },
			() => NOW,
		);
		expect(sites).toEqual(["blog", "eqsync"]);
	});
});
