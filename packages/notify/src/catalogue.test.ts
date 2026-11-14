import { describe, expect, it } from "vitest";
import { APP_KEYS, EVENT_IDS } from "./apps";
import {
	CATALOGUE,
	CHANNELS,
	DOMAIN_FIELDS,
	defaultChannels,
	entriesFor,
	kindInfo,
	kindsOf,
	messageStem,
	NOTIFY_KINDS,
	PAYLOADS,
	workflowId,
} from "./catalogue";
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
		expect(Object.keys(WORDS).length).toBe(CATALOGUE.length);
	});

	it("push is declared only with a purpose, and a client never gets in-app", () => {
		for (const entry of CATALOGUE) {
			expect(entry.channels.includes("push"), messageStem(entry)).toBe(entry.push !== undefined);
			if (entry.audience === "client") expect(entry.channels).not.toContain("in_app");
		}
	});

	it("defaults and locks are among the offered channels, and every entry is on by default somewhere", () => {
		for (const entry of CATALOGUE) {
			for (const c of entry.defaults ?? []) expect(entry.channels, messageStem(entry)).toContain(c);
			for (const c of entry.locked ?? []) {
				expect(entry.channels, messageStem(entry)).toContain(c);
				expect(defaultChannels(entry), messageStem(entry)).toContain(c);
			}
			expect(defaultChannels(entry).length, messageStem(entry)).toBeGreaterThan(0);
		}
	});

	it("only team audiences name a permission, and every team entry names one", () => {
		for (const entry of CATALOGUE) {
			const team =
				entry.audience === "team" || entry.audience === "reception" || entry.audience === "owners";
			expect(entry.needs !== undefined, messageStem(entry)).toBe(team);
		}
	});

	it("every entry belongs to a known kind, and each side's page offers channels for it", () => {
		for (const entry of CATALOGUE) expect(NOTIFY_KINDS).toContain(entry.kind);
		for (const side of ["client", "staff"] as const)
			for (const kind of kindsOf(side)) {
				const info = kindInfo(side, kind);
				expect(info.offered.length, `${side}/${kind}`).toBeGreaterThan(0);
				for (const c of [...info.defaults, ...info.locked])
					expect(info.offered, `${side}/${kind}`).toContain(c);
				for (const c of info.offered) expect(CHANNELS).toContain(c);
			}
	});

	it("a client's e-mail for an invitation or an appointment cannot be switched off", () => {
		expect(kindInfo("client", "account").locked).toContain("email");
		expect(kindInfo("client", "appointments").locked).toContain("email");
		expect(kindInfo("client", "reminders").locked).toEqual([]);
	});

	it("every payload names the object it is about, so two objects never share a key", () => {
		for (const event of EVENT_IDS) {
			const shape = Object.keys(PAYLOADS[event].shape);
			expect(
				DOMAIN_FIELDS.some((f) => shape.includes(f)),
				event,
			).toBe(true);
		}
	});

	for (const event of EVENT_IDS) {
		for (const [field, schema] of Object.entries(PAYLOADS[event].shape)) {
			if (schema.isOptional()) continue;
			it(`${event} refuses a payload without ${field}`, () => {
				expect(PAYLOADS[event].safeParse(withoutKey(SAMPLES[event], field)).success).toBe(false);
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
		expect(
			PAYLOADS["feedback.negative"].safeParse({ ...SAMPLES["feedback.negative"], rating: 6 })
				.success,
		).toBe(false);
		expect(
			PAYLOADS["digest.owner_daily"].safeParse({
				...SAMPLES["digest.owner_daily"],
				occupancyPercent: 101,
			}).success,
		).toBe(false);
		expect(
			PAYLOADS["digest.reception_daily"].safeParse({
				...SAMPLES["digest.reception_daily"],
				lines: Array.from({ length: 61 }, () => ({
					at: "2026-12-01T08:00:00.000Z",
					text: "x",
				})),
			}).success,
		).toBe(false);
		expect(
			PAYLOADS["security.action"].safeParse({ ...SAMPLES["security.action"], action: "nuke" })
				.success,
		).toBe(false);
	});
});
