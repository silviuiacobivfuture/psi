import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { backendReady, runMutation } from "./admin";
import { callMutation, callQuery } from "./server";

/**
 * The estate's assistant document against the local backend (`PSI_CONVEX_PORT`, `PSI_CONVEX_DATA`, README): a test
 * names a throwaway estate (`*test-…`) and reads back what it wrote there, the backend's own estate document untouched;
 * any other estate name is refused, nothing written.
 */
if (!backendReady) console.warn("platform-estate-backend.test: no local backend; see README");

const ESTATE = `*test-pe-${Date.now().toString(36)}`;
const Ok = z.object({ ok: z.literal(true) }).passthrough();
const Read = z
	.object({
		ok: z.literal(true),
		found: z.literal(true),
		revision: z.number(),
		body: z.string(),
	})
	.passthrough();
const own = async () =>
	JSON.stringify(await callQuery("apiAssistant:getPlatform", { kind: "assistant_platform" }));

describe.skipIf(!backendReady)("the estate's assistant document", () => {
	afterAll(async () => {
		if (!backendReady) return;
		await runMutation("seed:dropFixture", { tenant: ESTATE }, z.unknown());
	});

	it("a throwaway estate's document is written and read back, the estate's own untouched", async () => {
		const before = await own();
		const body = JSON.stringify({ revision: 1 });
		Ok.parse(
			await callMutation("apiAssistant:putPlatform", {
				actor: { subject: "root" },
				kind: "assistant_platform",
				expected: 0,
				body,
				estate: ESTATE,
			}),
		);
		const read = Read.parse(
			await callQuery("apiAssistant:getPlatform", { kind: "assistant_platform", estate: ESTATE }),
		);
		expect(read).toMatchObject({ revision: 1, body });
		expect(await own()).toBe(before);
	});

	it.each([
		"*",
		"estate",
		"test-x",
		"*evil",
		"*test-",
		"*test-UPPER",
	])("an estate that is not a throwaway one (%s) is refused, nothing written", async (estate) => {
		const before = await own();
		const put = await callMutation("apiAssistant:putPlatform", {
			actor: { subject: "root" },
			kind: "assistant_platform",
			expected: 0,
			body: "{}",
			estate,
		});
		expect(put).toEqual({ ok: false, reason: "invalid" });
		expect(
			await callQuery("apiAssistant:getPlatform", { kind: "assistant_platform", estate }),
		).toEqual({ ok: false, reason: "invalid" });
		expect(await own()).toBe(before);
	});
});
