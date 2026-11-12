import { describe, expect, it } from "vitest";
import { APPOINTMENT_STATUSES, busyFrom, firstConflict, isBlocking } from "../domain/conflicts";
import { contactProblem } from "../domain/contact";
import { type AppointmentEvent, isFinal, transition } from "../domain/lifecycle";
import { remindersFor } from "../domain/reminders";
import { retentionAction } from "../domain/retention";
import { canonicalCode, makeReference, makeToken, REFERENCE_ALPHABET } from "../domain/tokens";

const NOW = Date.parse("2026-11-16T08:00:00Z");
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

describe("the hold, request and appointment state machine", () => {
	const live = { status: "held" as const, holdExpiresAt: NOW + 10 * MIN };
	const lapsed = { status: "held" as const, holdExpiresAt: NOW - 1 };

	it("a live hold submits to a request; a lapsed one is refused as hold_expired", () => {
		expect(transition(live, { type: "submit" }, NOW)).toEqual({ ok: true, next: "requested" });
		expect(transition(lapsed, { type: "submit" }, NOW)).toEqual({
			ok: false,
			reason: "hold_expired",
		});
		expect(transition(live, { type: "submit" }, NOW + 10 * MIN)).toEqual({
			ok: false,
			reason: "hold_expired",
		});
	});

	it("a hold expires only once it has lapsed", () => {
		expect(transition(live, { type: "expire" }, NOW)).toEqual({ ok: false, reason: "not_allowed" });
		expect(transition(lapsed, { type: "expire" }, NOW)).toEqual({ ok: true, next: "expired" });
	});

	it("the team confirms or declines a request; either side cancels", () => {
		const requested = { status: "requested" as const };
		expect(transition(requested, { type: "confirm" }, NOW)).toEqual({
			ok: true,
			next: "confirmed",
		});
		expect(transition(requested, { type: "decline" }, NOW)).toEqual({ ok: true, next: "declined" });
		expect(transition({ status: "confirmed" }, { type: "cancel" }, NOW)).toEqual({
			ok: true,
			next: "cancelled",
		});
		expect(transition({ status: "confirmed" }, { type: "confirm" }, NOW)).toEqual({
			ok: false,
			reason: "not_allowed",
		});
		expect(transition(live, { type: "confirm" }, NOW)).toEqual({
			ok: false,
			reason: "not_allowed",
		});
	});

	it("final states accept nothing", () => {
		const events: AppointmentEvent["type"][] = [
			"submit",
			"release",
			"confirm",
			"decline",
			"cancel",
			"expire",
			"reschedule",
		];
		for (const status of APPOINTMENT_STATUSES) {
			if (!isFinal(status)) continue;
			for (const type of events) {
				expect(transition({ status }, { type }, NOW)).toEqual({ ok: false, reason: "not_allowed" });
			}
		}
		expect(APPOINTMENT_STATUSES.filter(isFinal)).toEqual(["cancelled", "declined", "expired"]);
	});
});

describe("what blocks a calendar", () => {
	const span = { start: NOW, blockedUntil: NOW + 60 * MIN };

	it("a hold blocks until the instant it lapses, without waiting for the sweep", () => {
		const hold = { ...span, status: "held" as const, holdExpiresAt: NOW + 5 * MIN };
		expect(isBlocking(hold, NOW + 5 * MIN - 1)).toBe(true);
		expect(isBlocking(hold, NOW + 5 * MIN)).toBe(false);
		expect(isBlocking({ ...span, status: "requested" }, NOW + DAY)).toBe(true);
		expect(isBlocking({ ...span, status: "cancelled" }, NOW)).toBe(false);
		expect(busyFrom([hold, { ...span, status: "expired" }], NOW)).toEqual([
			{ start: NOW, until: NOW + 60 * MIN },
		]);
	});

	it("finds the first overlapping blocker; touching spans do not overlap", () => {
		const booked = [{ ...span, status: "confirmed" as const }];
		expect(
			firstConflict({ start: NOW + 60 * MIN, until: NOW + 90 * MIN }, booked, NOW),
		).toBeUndefined();
		expect(firstConflict({ start: NOW + 59 * MIN, until: NOW + 90 * MIN }, booked, NOW)).toBe(
			booked[0],
		);
	});
});

describe("reminders, retention, codes and contact", () => {
	it("reminds only confirmed appointments, and never in the past", () => {
		const start = NOW + 3 * 60 * MIN;
		expect(remindersFor({ reference: "R", start, status: "requested" }, NOW)).toEqual([]);
		const due = remindersFor({ reference: "R", start, status: "confirmed" }, NOW);
		expect(due.map((r) => r.leadMinutes)).toEqual([120]);
	});

	it("erases the contact a month after the appointment, deletes the record after a year, a hold the next day", () => {
		const end = NOW;
		const base = {
			status: "confirmed" as const,
			end,
			updatedAt: end,
			hasContact: true,
			submitted: true,
		};
		expect(retentionAction(base, end + 29 * DAY)).toBe("keep");
		expect(retentionAction(base, end + 30 * DAY)).toBe("erase_contact");
		expect(retentionAction({ ...base, hasContact: false }, end + 364 * DAY)).toBe("keep");
		expect(retentionAction(base, end + 365 * DAY)).toBe("delete");
		const hold = {
			status: "expired" as const,
			end,
			updatedAt: end,
			hasContact: false,
			submitted: false,
		};
		expect(retentionAction(hold, end + DAY - 1)).toBe("keep");
		expect(retentionAction(hold, end + DAY)).toBe("delete");
		expect(retentionAction({ ...hold, status: "held" }, end + 30 * DAY)).toBe("keep");
	});

	it("makes readable references and secret codes, and reads them back as typed", () => {
		const reference = makeReference();
		expect(reference).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
		for (const char of reference.replace("-", "")) expect(REFERENCE_ALPHABET).toContain(char);
		const code = makeToken();
		expect(code).toMatch(/^([0-9A-Z]{4}-){3}[0-9A-Z]{4}$/);
		expect(canonicalCode(code.toLowerCase().replace(/-/g, " "), 16)).toBe(code);
		expect(canonicalCode("ABCD-EFGH", 16)).toBeUndefined();
		expect(canonicalCode("abcd efgO", 8)).toBe("ABCD-EFG0");
		expect(canonicalCode("ABCD-EFGU", 8)).toBeUndefined();
	});

	it("accepts only a name and one way to call back", () => {
		expect(contactProblem({ name: "Ana", phone: "0748 017 752" })).toBeUndefined();
		expect(contactProblem({ name: "Ana", email: "ana@example.com" })).toBeUndefined();
		expect(contactProblem({ name: "Ana" })).toBe("contact");
		expect(contactProblem({ name: "A", phone: "0748017752" })).toBe("name");
		expect(contactProblem({ name: "Ana", email: "not-an-email" })).toBe("email");
	});
});
