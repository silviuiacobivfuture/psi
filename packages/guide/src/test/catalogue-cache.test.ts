import type { SchedulingClient } from "@psi/scheduling";
import { describe, expect, it } from "vitest";
import { schedulingPort } from "../scheduling";

type Found = Awaited<ReturnType<SchedulingClient["services"]>>;

/** A client that only knows its services; every other call is a test failure. */
function stub(read: () => Found): SchedulingClient {
	const never = async (): Promise<never> => {
		throw new Error("not under test");
	};
	return {
		services: async () => read(),
		findSlots: never,
		hold: never,
		submit: never,
		release: never,
		cancel: never,
	};
}

const one: Found = {
	timeZone: "Europe/Bucharest",
	services: [{ slug: "evaluation", durationMinutes: 60, modes: ["onsite"], practitioners: [] }],
};

describe("the chat's view of the tenant's services", () => {
	it("reads the store once per period, so a change shows up within it and a busy chat does not hammer the store", async () => {
		let calls = 0;
		const port = schedulingPort(
			stub(() => {
				calls += 1;
				return one;
			}),
			50,
		);
		expect(await port.catalogue?.("psizone")).toEqual([{ slug: "evaluation" }]);
		await port.catalogue?.("psizone");
		expect(calls).toBe(1);
		await new Promise((r) => setTimeout(r, 70));
		await port.catalogue?.("psizone");
		expect(calls).toBe(2);
	});
	it("reads an unknown tenant as no services", async () => {
		expect(await schedulingPort(stub(() => undefined)).catalogue?.("nobody")).toEqual([]);
	});
});
