import { describe, expect, it } from "vitest";
import type { ReminderItem } from "../port/port";
import { emailHref, reminderText, whatsappHref, whatsappNumber } from "./reminders";

const item: ReminderItem = {
	appointment: {
		id: "a1",
		date: "2026-11-16",
		startMin: 570,
		durationMin: 50,
		columnId: "p1",
		clientId: "c1",
		title: null,
		serviceId: "s1",
		status: "confirmed",
		note: "",
		packageId: null,
	},
	client: {
		id: "c1",
		name: "Ștefan Exemplu 01",
		guardian: null,
		phone: "0700 000 001",
		email: "client.01@example.test",
		status: "current",
		note: "",
		practitionerId: "p1",
	},
	column: { id: "p1", kind: "person", name: "Terapeut Alfa", colour: 1 },
	sent: false,
};

describe("whatsappNumber", () => {
	it.each([
		["0700 000 001", "40700000001"],
		["+40 700 000 001", "40700000001"],
		["0040700000001", "40700000001"],
		["12345", null],
		["", null],
	])("%j → %j", (phone, out) => expect(whatsappNumber(phone)).toBe(out));
});

describe("the reminder links", () => {
	it("is a plain wa.me link with the text prefilled, in the viewer's language", () => {
		const href = whatsappHref(item, "psizone", "ro");
		expect(href).toMatch(/^https:\/\/wa\.me\/40700000001\?text=/);
		const text = decodeURIComponent((href ?? "").split("text=")[1] ?? "");
		expect(text).toBe(reminderText(item, "psizone", "ro"));
		expect(text).toContain("Ștefan Exemplu 01");
		expect(text).toContain("09:30");
		expect(text).toContain("General Alexandru Cernat 126");
		expect(reminderText(item, "psizone", "en")).toContain("Hello!");
	});
	it("has no WhatsApp link without a usable phone, and no e-mail link without an address", () => {
		const bare = {
			...item,
			client: { ...item.client, phone: null, email: null },
		};
		expect(whatsappHref(bare, "psizone", "ro")).toBeNull();
		expect(emailHref(bare, "psizone", "ro")).toBeNull();
	});
	it("builds a mailto with subject and body", () => {
		expect(emailHref(item, "psizone", "en")).toMatch(
			/^mailto:client\.01@example\.test\?subject=.*&body=/,
		);
	});
});
