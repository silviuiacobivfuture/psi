import { describe, expect, it } from "vitest";
import type { DetailField } from "../booking-state";
import { asking, chosen, SCOPE, say, sayKind, store, summary } from "./booking-fixture";

const FIELDS: ReadonlyArray<DetailField> = ["name", "age", "details", "phone", "email"];
const EDITS = ["Editează", "editează", "Edit details", "edit"];
const YESES = ["confirm", "trimite", "yes please", "Confirmă programarea", "da", "Confirm booking"];

describe("the words of the buttons are never a field's value", () => {
	it.each(
		FIELDS,
	)("while %s is asked, Edit opens the form with what is known and stores nothing", async (field) => {
		const port = store();
		const picked = await chosen(port);
		for (const text of EDITS) {
			const next = await sayKind(port, text, asking(picked, field), "confirm");
			expect(next.details?.edit, text).toBe(true);
			expect(next.details?.values, text).toEqual({});
		}
	});

	it.each(
		FIELDS,
	)("while %s is asked, a yes is not a value and asks the same thing again", async (field) => {
		const port = store();
		const picked = await chosen(port);
		for (const text of YESES) {
			const next = await sayKind(port, text, asking(picked, field), "confirm");
			expect(next.details?.values, text).toEqual({});
			expect(next.details?.ask, text).toBe(field);
			expect(next.details?.nudge, text).toBe(true);
		}
		expect(port.calls.filter((c) => c.method === "hold" || c.method === "submit")).toEqual([]);
	});

	it("an old summary's Confirm pressed after Edit neither submits nor restarts the booking", async () => {
		const port = store();
		const card = await summary(port);
		const edit = await sayKind(port, "Editează", card.state, "confirm");
		for (const text of ["Confirmă programarea", "Confirm booking"]) {
			const again = await say(port, text, edit.state);
			expect(again?.kind, text).not.toBe("booked");
			expect(again?.kind, text).not.toBe("times");
			expect(again?.details?.values.name, text).toBe("Ana Pop");
		}
		expect(port.calls.filter((c) => c.method === "hold" || c.method === "submit")).toEqual([]);
	});

	it("a Confirm with no booking state books nothing", async () => {
		const port = store();
		await say(port, "Confirmă programarea");
		expect(port.calls.filter((c) => c.method === "hold" || c.method === "submit")).toEqual([]);
	});
});

describe("what is volunteered is slotted by what it is", () => {
	it("every field given with its label lands in its own field, and the details are still asked", async () => {
		const port = store();
		const picked = await chosen(port);
		const next = await sayKind(port, "x", picked.state, "confirm", {
			typed:
				"numele meu este Ana Pop, telefonul 0722 123 456, emailul meu este ana@example.ro, vârsta 34",
		});
		expect(next.details?.values).toEqual({
			name: "Ana Pop",
			phone: "+40722123456",
			email: "ana@example.ro",
			age: 34,
			forWhom: "adult",
		});
		expect(next.details?.ask).toBe("details");
	});

	it("an age asked for is taken even when more is said, and the rest does not restart a booking", async () => {
		const port = store();
		const picked = await chosen(port);
		const next = await sayKind(port, "x", asking(picked, "age"), "confirm", {
			typed: "am 34 de ani și aș vrea o programare cât mai repede",
		});
		expect(next.details?.values.age).toBe(34);
		expect(next.chosen).toMatchObject({ time: "10:00" });
	});

	it("a duration in a story is not an age", async () => {
		const port = store();
		const picked = await chosen(port);
		const next = await sayKind(port, "x", picked.state, "confirm", {
			typed: "Ana Pop, nu dorm bine de 2 ani",
		});
		expect(next.details?.values.age).toBeUndefined();
		expect(next.details?.ask).toBe("name");
	});

	it("a volunteered description is the clause about the trouble, without the name or the lead", async () => {
		const port = store();
		const picked = await chosen(port);
		const next = await sayKind(port, "x", picked.state, "confirm", {
			typed: "Sunt Ana Pop și mă confrunt cu anxietate puternică de câteva luni",
		});
		expect(next.details?.values.name).toBe("Ana Pop");
		expect(next.details?.values.details).toBe("mă confrunt cu anxietate puternică de câteva luni");
	});

	it("a wish to book is not a description", async () => {
		const port = store();
		const picked = await chosen(port);
		const next = await sayKind(port, "x", picked.state, "confirm", {
			typed: "Ana Pop, aș vrea să mă programez foarte repede posibil",
		});
		expect(next.state?.details?.details).toBeUndefined();
	});

	it("asking to book again mid-booking searches again and keeps every detail given", async () => {
		const port = store();
		const named = await sayKind(port, "x", (await chosen(port)).state, "confirm", {
			typed: "Ana Pop",
		});
		const again = await say(port, "Vreau să mă programez mai târziu", named.state);
		expect(again?.kind).toBe("times");
		expect(again?.state?.details).toMatchObject({ name: "Ana Pop" });
	});
});

describe("who the booking is for is decided at the submit, from the age", () => {
	it("a state that says child for an adult's age books an adult", async () => {
		const port = store();
		const card = await summary(port);
		const forged = {
			...card.state,
			details: { ...card.state?.details, forWhom: "child" as const },
		};
		const done = await say(port, "da", forged as typeof card.state);
		expect(done?.kind).toBe("booked");
		expect(port.calls.find((c) => c.method === "submit")).toMatchObject({ audience: "adult" });
	});

	it("an adult-only site submits adult whatever the age", async () => {
		const scope = { ...SCOPE, audiences: ["adult" as const] };
		const port = store();
		const picked = await chosen(port, { scope });
		let offer = await sayKind(port, "Ana Pop", picked.state, "confirm", { scope });
		for (const answer of [
			"7",
			"Mă simt anxios de câteva luni și nu dorm",
			"0722 123 456",
			"ana@example.ro",
		]) {
			const next = await say(port, answer, offer.state, { scope });
			if (next === undefined) throw new Error(answer);
			offer = next;
		}
		const done = await say(port, "da", offer.state, { scope });
		expect(done?.kind).toBe("booked");
		expect(port.calls.find((c) => c.method === "submit")).toMatchObject({ audience: "adult" });
	});

	it("a site that serves children books the age's band", async () => {
		const port = store();
		let offer = await chosen(port);
		for (const answer of [
			"Ana Pop",
			"9",
			"Fiul meu nu vrea să meargă la școală",
			"0722 123 456",
			"ana@example.ro",
		]) {
			const next = await say(port, answer, offer.state);
			if (next === undefined) throw new Error(answer);
			offer = next;
		}
		await say(port, "da", offer.state);
		expect(port.calls.find((c) => c.method === "submit")).toMatchObject({ audience: "child" });
	});
});
