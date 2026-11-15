import { afterEach, describe, expect, it, vi } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

/**
 * 2026-11-15 every page of the dev console answered a bare 500 with nothing in the pod's log: an error that is not a
 * refusal of the service was rethrown unsaid. It is still a 500, but it is told, with where and what.
 */
let c: Console;
afterEach(async () => {
	vi.restoreAllMocks();
	await c.close();
});

describe("an error that is not a refusal of the service", () => {
	it("is written to the log with the request's method and path (not its query), and the answer is still a failure", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const told = vi.spyOn(console, "error").mockImplementation(() => {});
		c.port.memberships = async () => {
			throw new TypeError("a response the console did not expect");
		};
		await expect(c.get("/calendar?date=2026-11-16&secret=1")).rejects.toThrow(
			"a response the console did not expect",
		);
		expect(told).toHaveBeenCalledTimes(1);
		const [line, error] = told.mock.calls[0] ?? [];
		expect(line).toBe("[clinic] GET /calendar failed:");
		expect(error).toBeInstanceOf(TypeError);
	});

	it("a refusal of the service is a page, not a log line", async () => {
		c = await startConsole(MEMBER);
		await c.signIn();
		const told = vi.spyOn(console, "error").mockImplementation(() => {});
		const res = await c.get("/clients/unknown-client-id");
		expect(res.status).toBeLessThan(500);
		expect(told).not.toHaveBeenCalled();
	});
});
