import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StoreUnavailable } from "../types";
import { createRpc } from "./rpc";

/**
 * The store's transport: a query that meets a blip (no answer, an overloaded or restarting store, Convex saying the
 * failure is transient) is asked once more; a mutation never is (it may have been applied before its answer was
 * lost); a failure a retry cannot cure (a function's own error, a 4xx, a wrong shape) is not retried.
 */
type Answer = Response | "throw";
const ok = (value: unknown) =>
	new Response(JSON.stringify({ status: "success", value }), { status: 200 });
const fnError = (errorMessage: string, status = 200) =>
	new Response(JSON.stringify({ status: "error", errorMessage }), { status });

function rpcWith(answers: Answer[]) {
	const calls: string[] = [];
	const rpc = createRpc({
		url: "http://store.test",
		serverKey: "k".repeat(40),
		retryAfterMs: 0,
		fetch: async (url) => {
			calls.push(String(url));
			const next = answers.shift() ?? "throw";
			if (next === "throw") throw new TypeError("fetch failed");
			return next;
		},
	});
	return { rpc, calls };
}
const N = z.number();

describe("a query that meets a blip is asked once more", () => {
	it.each([
		["no answer", "throw" as const],
		["503", new Response("", { status: 503 })],
		["429", new Response("", { status: 429 })],
		[
			"a transient Convex error",
			fnError("Transient error while executing function, please try again"),
		],
	])("%s, then an answer: the answer, after two calls", async (_label, first) => {
		const { rpc, calls } = rpcWith([first, ok(7)]);
		expect(await rpc.query("apiCalendar:columnVisits", {}, N)).toBe(7);
		expect(calls).toHaveLength(2);
	});

	it("twice failing: StoreUnavailable, after exactly two calls (never a third)", async () => {
		const { rpc, calls } = rpcWith(["throw", "throw", ok(1)]);
		await expect(rpc.query("apiCalendar:columnVisits", {}, N)).rejects.toBeInstanceOf(
			StoreUnavailable,
		);
		expect(calls).toHaveLength(2);
	});
});

describe("what is not retried", () => {
	it("a mutation, whatever the failure: it may already have been applied", async () => {
		for (const first of ["throw" as const, new Response("", { status: 503 })]) {
			const { rpc, calls } = rpcWith([first, ok(1)]);
			await expect(rpc.mutation("apiVisits:create", {}, N)).rejects.toBeInstanceOf(
				StoreUnavailable,
			);
			expect(calls).toHaveLength(1);
		}
	});

	it.each([
		[
			"a function's own error (read limit)",
			fnError("Too many documents read in a single function execution"),
		],
		["a 4xx", new Response(JSON.stringify({ status: "error" }), { status: 400 })],
		["an answer of the wrong shape", ok("not a number")],
	])("%s: one call, StoreUnavailable, and never Convex's own message", async (_label, first) => {
		const { rpc, calls } = rpcWith([first, ok(1)]);
		const error = await rpc.query("apiClients:list", {}, N).then(
			() => undefined,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(StoreUnavailable);
		expect(String((error as Error).message)).not.toMatch(/Too many documents/);
		expect(calls).toHaveLength(1);
	});

	it("a first answer is never asked twice", async () => {
		const { rpc, calls } = rpcWith([ok(3)]);
		expect(await rpc.query("apiClients:list", {}, N)).toBe(3);
		expect(calls).toHaveLength(1);
	});
});
