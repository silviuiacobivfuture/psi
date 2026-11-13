import { describe, expect, it } from "vitest";
import type { BookingOffer } from "../booking";
import { asking, say, sayKind, store, summary } from "./booking-fixture";

const submitted = (port: ReturnType<typeof store>) =>
	port.calls.filter((c) => c.method === "hold" || c.method === "submit");

async function booked(port: ReturnType<typeof store>, text: string, offer: BookingOffer) {
	return sayKind(port, text, offer.state, "booked");
}

describe("confirming the summary", () => {
	it.each([
		"da",
		"Da!",
		"  DA  ",
		"confirm",
		"Confirmă programarea",
		"trimite",
		"e ok",
		"da, confirm",
		"yes",
		"Yes!",
		"Confirm booking",
	])("%j is an explicit yes: the guide holds and submits once, with the details as summarised", async (text) => {
		const port = store();
		const card = await summary(port);
		const done = await booked(port, text, card);
		expect(done.booked).toMatchObject({
			reference: "REF00001",
			practitioner: "DEMO Fitter",
			mode: "onsite",
			timeZone: "Europe/Bucharest",
		});
		expect(done.booked?.cancelCode).toContain("cancel-code-REF00001");
		expect(done.state).toBeUndefined();
		const [hold, submit] = submitted(port);
		expect(hold).toMatchObject({
			method: "hold",
			tenant: "harbour",
			service: "bike-fitting",
			slotId: "tue10",
		});
		expect(submit).toMatchObject({
			method: "submit",
			reference: "REF00001",
			audience: "adult",
			contact: {
				name: "Ana Pop",
				age: 34,
				phone: "+40722123456",
				email: "ana@example.ro",
				details: "Mă simt anxioasă de câteva luni și nu dorm bine",
			},
		});
		expect(port.requested()).toEqual(["REF00001"]);
	});

	it("the hold comes right before the submit, after the recheck", async () => {
		const port = store();
		const card = await summary(port);
		const before = port.calls.length;
		await booked(port, "da", card);
		expect(port.calls.slice(before).map((c) => c.method)).toEqual(["findSlots", "hold", "submit"]);
	});

	it("the language of the yes is kept for the store and the card", async () => {
		const port = store();
		const card = await summary(port);
		const done = await booked(port, "yes", card);
		expect(done.lang).toBe("en");
		expect(submitted(port)[0]).toMatchObject({ locale: "en" });
	});

	it("a double yes (two requests with the same summary at once) submits once and both see the same code", async () => {
		const port = store();
		const card = await summary(port);
		const [a, b] = await Promise.all([say(port, "da", card.state), say(port, "da", card.state)]);
		expect(a?.booked?.reference).toBe(b?.booked?.reference);
		expect(a?.booked?.cancelCode).toBe(b?.booked?.cancelCode);
		expect(port.calls.filter((c) => c.method === "hold")).toHaveLength(1);
		expect(port.calls.filter((c) => c.method === "submit")).toHaveLength(1);
		expect(port.requested()).toHaveLength(1);
	});

	it("a second yes after the first finished is the same booking, not a second one", async () => {
		const port = store();
		const card = await summary(port);
		const first = await booked(port, "da", card);
		const second = await booked(port, "da", card);
		expect(second.booked?.reference).toBe(first.booked?.reference);
		expect(port.calls.filter((c) => c.method === "hold")).toHaveLength(1);
		expect(port.requested()).toHaveLength(1);
	});

	it("another conversation for the same time is its own: it finds the time taken, never a second booking of it", async () => {
		const port = store();
		const one = await summary(port);
		const two = await summary(port);
		await booked(port, "da", one);
		const done = await say(port, "da", two.state);
		expect(port.requested()).toHaveLength(1);
		expect(done?.kind).toBe("times");
		expect(done?.notice).toBe("taken");
	});
});

describe("when the time is gone between the summary and the yes", () => {
	it("found taken at the recheck: nothing is held, the nearest times are offered and every detail is kept", async () => {
		const port = store();
		const card = await summary(port);
		const gone = store(["tue10"]);
		gone.calls.length = 0;
		const offer = await say(gone, "da", card.state);
		expect(offer?.kind).toBe("times");
		expect(offer?.notice).toBe("taken");
		expect(offer?.slots.length).toBeGreaterThan(0);
		expect(offer?.state?.details).toMatchObject({
			name: "Ana Pop",
			age: 34,
			phone: "+40722123456",
		});
		expect(offer?.state?.key).toBe(card.state?.key);
		expect(offer?.details?.values.email).toBe("ana@example.ro");
		expect(submitted(gone)).toEqual([]);
	});

	it("taken at the hold: the same, and nothing is requested", async () => {
		const port = store();
		const card = await summary(port);
		port.holdRefusal = "slot_taken";
		const offer = await say(port, "da", card.state);
		expect(offer?.kind).toBe("times");
		expect(offer?.notice).toBe("taken");
		expect(port.calls.filter((c) => c.method === "submit")).toEqual([]);
		expect(port.requested()).toEqual([]);
	});

	it("choosing another time then goes straight back to the summary, with nothing asked twice", async () => {
		const port = store();
		const card = await summary(port);
		port.holdRefusal = "slot_taken";
		const offer = await say(port, "da", card.state);
		port.holdRefusal = undefined;
		const again = await sayKind(port, "marți la 14", offer?.state, "summary");
		expect(again.chosen).toMatchObject({ time: "14:00" });
		expect(again.details?.values.name).toBe("Ana Pop");
		const done = await booked(port, "da", again);
		expect(done.booked?.reference).toBeDefined();
	});
});

describe("when the store is down", () => {
	it("at the recheck: says so, sends nothing, and keeps the summary for another try", async () => {
		const port = store();
		const card = await summary(port);
		port.failing = true;
		const offer = await say(port, "da", card.state);
		expect(offer?.kind).toBe("submit_failed");
		expect(offer?.state?.asked).toBe("confirm");
		expect(offer?.state?.details).toMatchObject({ name: "Ana Pop" });
		expect(port.requested()).toEqual([]);
		port.failing = false;
		const retry = await sayKind(port, "da", offer?.state, "booked");
		expect(retry.booked).toBeDefined();
	});

	it("after the hold: the hold is given back and nothing is requested", async () => {
		const port = store();
		const card = await summary(port);
		port.submitFailing = true;
		const offer = await say(port, "da", card.state);
		expect(offer?.kind).toBe("submit_failed");
		expect(port.calls.map((c) => c.method)).toContain("release");
		expect(port.heldReferences()).toEqual([]);
		expect(port.requested()).toEqual([]);
	});
});

describe("never without an explicit yes and valid details", () => {
	it("a yes while a question is open is an answer, not a confirmation", async () => {
		const port = store();
		const card = await summary(port);
		const open = asking(card, "phone");
		const next = await say(port, "da", open);
		expect(next?.kind).not.toBe("booked");
		expect(submitted(port)).toEqual([]);
	});

	it("a yes on a state with a detail missing or tampered with is re-asked, never submitted", async () => {
		const port = store();
		const card = await summary(port);
		const { phone: _phone, ...rest } = card.state?.details ?? {};
		const next = await say(port, "da", { ...asking(card, "confirm"), details: rest });
		expect(next?.kind).toBe("confirm");
		expect(next?.details?.ask).toBe("phone");
		expect(submitted(port)).toEqual([]);
	});

	it("a yes from a state without a conversation key submits nothing", async () => {
		const port = store();
		const card = await summary(port);
		const { key: _key, ...state } = asking(card, "confirm");
		const next = await say(port, "da", state);
		expect(next?.kind).toBe("submit_failed");
		expect(submitted(port)).toEqual([]);
	});

	it("an explicit refusal submits nothing", async () => {
		const port = store();
		const card = await summary(port);
		for (const text of ["nu", "nu vreau", "no", "anulează", "stop"]) {
			const next = await say(port, text, card.state);
			expect(next?.kind, text).not.toBe("booked");
		}
		expect(submitted(port)).toEqual([]);
	});
});
