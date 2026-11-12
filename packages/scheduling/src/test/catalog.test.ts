import type { Infer } from "convex/values";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { decisionReasonValidator } from "../../convex/validators";
import {
	SERVICE_LIMITS,
	type ServiceSpec,
	serviceProblem,
} from "../domain/catalog";
import {
	DECISION_REASONS,
	type DecisionReason,
	keepsReason,
} from "../domain/lifecycle";
import { DecisionReasonSchema } from "../results";

const SOUND: ServiceSpec = {
	durationMinutes: 60,
	bufferMinutes: 15,
	stepMinutes: 75,
	minNoticeMinutes: 720,
	horizonDays: 28,
	holdMinutes: 10,
	modes: ["onsite"],
};

describe("the bounds a service stays within", () => {
	it("accepts a sound service and both ends of every range", () => {
		expect(serviceProblem(SOUND)).toBeUndefined();
		for (const [key, range] of Object.entries(SERVICE_LIMITS)) {
			expect(serviceProblem({ ...SOUND, [key]: range.min })).toBeUndefined();
			expect(serviceProblem({ ...SOUND, [key]: range.max })).toBeUndefined();
		}
	});

	it("refuses a value outside its range, a fraction, and a service without a mode", () => {
		expect(serviceProblem({ ...SOUND, durationMinutes: 4 })).toBe(
			"durationMinutes out of range",
		);
		expect(serviceProblem({ ...SOUND, durationMinutes: 481 })).toBe(
			"durationMinutes out of range",
		);
		expect(serviceProblem({ ...SOUND, bufferMinutes: -1 })).toBe(
			"bufferMinutes out of range",
		);
		expect(serviceProblem({ ...SOUND, bufferMinutes: 241 })).toBe(
			"bufferMinutes out of range",
		);
		expect(serviceProblem({ ...SOUND, horizonDays: 0 })).toBe(
			"horizonDays out of range",
		);
		expect(
			serviceProblem({ ...SOUND, minNoticeMinutes: 60 * 24 * 30 + 1 }),
		).toBe("minNoticeMinutes out of range");
		expect(serviceProblem({ ...SOUND, durationMinutes: 59.5 })).toBe(
			"durationMinutes out of range",
		);
		expect(serviceProblem({ ...SOUND, horizonDays: Number.NaN })).toBe(
			"horizonDays out of range",
		);
		expect(serviceProblem({ ...SOUND, modes: [] })).toBe(
			"a service needs a mode",
		);
	});

	it("keeps the longest block within what the calendar's overlap reads assume (720 min)", () => {
		expect(
			SERVICE_LIMITS.durationMinutes.max + SERVICE_LIMITS.bufferMinutes.max,
		).toBe(720);
	});
});

describe("the reasons a decision may carry", () => {
	it("are one closed list in the domain, the Convex validator and the zod schema", () => {
		expectTypeOf<
			Infer<typeof decisionReasonValidator>
		>().toEqualTypeOf<DecisionReason>();
		expect(DecisionReasonSchema.options).toEqual([...DECISION_REASONS]);
		expect(DecisionReasonSchema.safeParse("administrative").success).toBe(true);
		expect(DecisionReasonSchema.safeParse("anxiety").success).toBe(false);
		expect(DecisionReasonSchema.safeParse("").success).toBe(false);
	});

	it("are kept on a decline or a cancel, never on a confirm", () => {
		expect(keepsReason("decline")).toBe(true);
		expect(keepsReason("cancel")).toBe(true);
		expect(keepsReason("confirm")).toBe(false);
	});
});
