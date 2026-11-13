import { describe, expect, it } from "vitest";
import { APP_KEYS, EVENT_IDS } from "./apps";
import { CATALOGUE, entriesFor, messageStem, PAYLOADS, workflowId } from "./catalogue";
import { SAMPLES } from "./testing/samples";
import { WORDS } from "./words";

function withoutKey(sample: Record<string, unknown>, key: string): Record<string, unknown> {
	const { [key]: _removed, ...rest } = sample;
	return rest;
}

describe("catalogue", () => {
	it("every event has a payload schema, a sample that satisfies it and at least one audience", () => {
		for (const event of EVENT_IDS) {
			expect(PAYLOADS[event].safeParse(SAMPLES[event]).success, event).toBe(true);
			expect(entriesFor(event).length, event).toBeGreaterThan(0);
		}
	});

	it("every entry has its three texts, and workflow ids are unique across apps", () => {
		const ids = new Set<string>();
		for (const entry of CATALOGUE) {
			expect(Object.keys(WORDS)).toContain(messageStem(entry));
			for (const app of APP_KEYS) ids.add(workflowId(app, entry.event, entry.audience));
		}
		expect(ids.size).toBe(CATALOGUE.length * APP_KEYS.length);
	});

	it("push is declared only with a purpose, and a client never gets in-app", () => {
		for (const entry of CATALOGUE) {
			expect(entry.channels.includes("push"), messageStem(entry)).toBe(entry.push !== undefined);
			if (entry.audience === "client") expect(entry.channels).not.toContain("in_app");
		}
	});

	const APPOINTMENT = ["appointmentId", "clientName", "serviceName", "startsAt"];
	const REQUIRED: Readonly<Record<(typeof EVENT_IDS)[number], ReadonlyArray<string>>> = {
		"request.new": ["requestId", "name", "kind"],
		"appointment.requested": APPOINTMENT,
		"appointment.confirmed": APPOINTMENT,
		"appointment.moved": [...APPOINTMENT, "previousStartsAt"],
		"appointment.cancelled": APPOINTMENT,
		"reminder.day_before": [...APPOINTMENT, "confirmUrl", "cancelUrl"],
		"reminder.confirmed": APPOINTMENT,
		"reminder.declined": APPOINTMENT,
		"package.running_low": ["packageId", "clientId", "clientName", "remaining"],
		"leave.requested": ["leaveId", "personName", "from", "to"],
		"leave.approved": ["leaveId", "from", "to"],
		"leave.declined": ["leaveId", "from", "to"],
		"payment.recorded": ["paymentId", "serviceName", "amount"],
		"assistant.action_done": ["actionId", "summary"],
	};
	for (const [event, fields] of Object.entries(REQUIRED)) {
		for (const field of fields) {
			it(`${event} refuses a payload without ${field}`, () => {
				expect(
					PAYLOADS[event as keyof typeof PAYLOADS].safeParse(
						withoutKey(SAMPLES[event as keyof typeof SAMPLES], field),
					).success,
				).toBe(false);
			});
		}
	}

	it("refuses malformed values: a date that is not a date, a link that is not a URL, an empty id, a negative count", () => {
		expect(
			PAYLOADS["appointment.confirmed"].safeParse({
				...SAMPLES["appointment.confirmed"],
				startsAt: "tomorrow",
			}).success,
		).toBe(false);
		expect(
			PAYLOADS["reminder.day_before"].safeParse({
				...SAMPLES["reminder.day_before"],
				confirmUrl: "not a url",
			}).success,
		).toBe(false);
		expect(
			PAYLOADS["request.new"].safeParse({ ...SAMPLES["request.new"], requestId: "" }).success,
		).toBe(false);
		expect(
			PAYLOADS["package.running_low"].safeParse({
				...SAMPLES["package.running_low"],
				remaining: -1,
			}).success,
		).toBe(false);
		expect(
			PAYLOADS["request.new"].safeParse({ ...SAMPLES["request.new"], kind: "fax" }).success,
		).toBe(false);
		expect(
			PAYLOADS["leave.requested"].safeParse({ ...SAMPLES["leave.requested"], from: "2026-13-40" })
				.success,
		).toBe(false);
		expect(
			PAYLOADS["assistant.action_done"].safeParse({
				...SAMPLES["assistant.action_done"],
				openPath: "//evil",
			}).success,
		).toBe(false);
		expect(
			PAYLOADS["assistant.action_done"].safeParse({
				...SAMPLES["assistant.action_done"],
				openPath: "/clients/1?tab=x",
			}).success,
		).toBe(true);
	});
});
