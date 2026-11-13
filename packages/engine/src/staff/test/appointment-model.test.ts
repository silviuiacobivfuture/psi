import { describe, expect, it } from "vitest";
import { AppointmentSchema } from "../model";
import { parsePortResult } from "../port";

const visit = {
	id: "qn761zq5rm66has8j3zwzpz8298j401k",
	version: "1794596959027",
	date: "2026-11-13",
	startMin: 660,
	durationMin: 80,
	resourceIds: ["pnx791by6ha342y4ms7j8hjt1s58j5q2r"],
	clientId: "kh7b237jf4hkzhvgs62rwc1gn58j40r8",
	clientName: "Gabriel Lungu",
	title: null,
	serviceId: "",
	status: "confirmed",
};

describe("an appointment the assistant reads", () => {
	it("may have no service (a visit imported from the old app)", () => {
		expect(AppointmentSchema.safeParse(visit).success).toBe(true);
		const day = parsePortResult(AppointmentSchema.array(), { ok: true, value: [visit] });
		expect(day).toEqual({ ok: true, value: [visit] });
	});

	it("keeps a service when it has one", () => {
		expect(AppointmentSchema.safeParse({ ...visit, serviceId: "svc-1" }).success).toBe(true);
	});

	it("still refuses a service name past its cap and a missing service field", () => {
		expect(AppointmentSchema.safeParse({ ...visit, serviceId: "x".repeat(121) }).success).toBe(
			false,
		);
		const { serviceId: _omitted, ...without } = visit;
		expect(AppointmentSchema.safeParse(without).success).toBe(false);
	});
});
