import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deniesCalendar } from "../booking-guard";
import { createEngine } from "../engine";
import type { Profile } from "../profile";
import {
	collect,
	FakeKnowledge,
	type FakeOpenRouter,
	shape,
	startFakeOpenRouter,
} from "../testing";
import {
	ANSWERS,
	asking,
	chosen,
	findOnly,
	SCOPE,
	say,
	sayKind,
	store,
	summary,
} from "./booking-fixture";
import { BIKES } from "./consumer-profiles";

const PROFILE: Profile = { ...BIKES, scheduling: SCOPE };

let fake: FakeOpenRouter | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await fake?.close();
	fake = undefined;
});

describe("the details step: one question at a time", () => {
	it("choosing a time moves to the details stage, keeps the time and asks the name first", async () => {
		const picked = await chosen();
		expect(picked.state?.stage).toBe("details");
		expect(picked.state?.asked).toBe("name");
		expect(picked.state?.key).toMatch(/^[0-9a-f-]{36}$/);
		expect(picked.state?.chosen).toMatchObject({ date: "2026-11-17", time: "10:00" });
		expect(picked.details).toMatchObject({
			values: {},
			missing: ["name", "age", "details", "phone", "email"],
			ask: "name",
			nudge: false,
			edit: false,
		});
	});

	it("asks name, age, what is going on, phone and e-mail in turn, then shows the summary", async () => {
		const port = store();
		let offer = await chosen(port);
		const order: string[] = [];
		for (const answer of ANSWERS) {
			order.push(offer.details?.ask ?? offer.kind);
			offer = await say(port, answer, offer.state).then((o) => {
				if (o === undefined) throw new Error(`${answer} left the booking`);
				return o;
			});
			expect(offer.chosen).toMatchObject({ date: "2026-11-17", time: "10:00" });
		}
		expect(order).toEqual(["name", "age", "details", "phone", "email"]);
		expect(offer.kind).toBe("summary");
		expect(offer.state?.asked).toBe("confirm");
		expect(offer.details?.values).toEqual({
			name: "Ana Pop",
			age: 34,
			details: "Mă simt anxioasă de câteva luni și nu dorm bine",
			phone: "+40722123456",
			email: "ana@example.ro",
			forWhom: "adult",
		});
		expect(offer.details?.missing).toEqual([]);
	});

	it("takes everything said in one message, in any order, and asks only what is left", async () => {
		const port = store();
		const picked = await chosen(port);
		const all = await sayKind(port, "x", picked.state, "confirm", {
			typed: "ana@example.ro, +40 722 123 456, mă numesc Ana Pop, am 34 de ani",
		});
		expect(all.details?.heard).toEqual(expect.arrayContaining(["email", "phone", "age", "name"]));
		expect(all.details?.ask).toBe("details");
		expect(all.state?.asked).toBe("details");
	});

	it("a volunteered description counts as the details, and a bare name before any lead does too", async () => {
		const port = store();
		const picked = await chosen(port);
		const told = await sayKind(port, "x", picked.state, "confirm", {
			typed: "Sunt Ana Pop și mă confrunt cu anxietate puternică de câteva luni",
		});
		expect(told.details?.values.name).toBe("Ana Pop");
		expect(told.details?.values.details).toContain("anxietate");
		expect(told.details?.ask).toBe("age");
	});

	it("a new valid answer replaces the old one when the visitor corrects it", async () => {
		const port = store();
		const named = await sayKind(port, "x", (await chosen(port)).state, "confirm", {
			typed: "Ana Pop",
		});
		const again = await sayKind(port, "x", named.state, "confirm", {
			typed: "Mă numesc Ioana Pop",
		});
		expect(again.details?.values.name).toBe("Ioana Pop");
	});

	it("the age answered for the child decides who the booking is for", async () => {
		const port = store();
		const ask = async (age: string) => {
			const picked = await chosen(port);
			const next = await sayKind(port, "x", asking(picked, "age"), "confirm", { typed: age });
			return next.details?.values;
		};
		expect((await ask("e pentru fiica mea de 7 ani"))?.forWhom).toBe("child");
		expect((await ask("15 ani"))?.forWhom).toBe("teen");
		expect((await ask("34"))?.forWhom).toBe("adult");
	});

	it("a single-audience site books that audience whatever the age", async () => {
		const port = store();
		const scope = { ...SCOPE, audiences: ["adult" as const] };
		const picked = await chosen(port, { scope });
		const next = await sayKind(port, "x", asking(picked, "age"), "confirm", {
			typed: "7",
			scope,
		});
		expect(next.details?.values).toMatchObject({ age: 7, forWhom: "adult" });
	});

	it("leaves a real question to the guide, whatever was asked, and answers nothing of the booking", async () => {
		const picked = await chosen();
		for (const asked of ["name", "age", "phone", "email"] as const) {
			for (const question of [
				"Cât durează o evaluare?",
				"How long does it take?",
				"Unde vă aflați?",
			]) {
				const state = asking(picked, asked);
				expect(await say(store(), question, state), `${asked}: ${question}`).toBeUndefined();
			}
		}
	});

	it("a wish in this stage still refines the booking, the details kept", async () => {
		const port = store();
		const named = await sayKind(port, "x", (await chosen(port)).state, "confirm", {
			typed: "Ana Pop",
		});
		const moved = await sayKind(port, "marți la 14", named.state, "confirm");
		expect(moved.chosen).toMatchObject({ date: "2026-11-17", time: "14:00" });
		expect(moved.details?.values.name).toBe("Ana Pop");
		expect(moved.state?.key).toBe(named.state?.key);
	});

	it("a time that lapsed is re-offered with the nearest ones, never confirmed, and the details are kept", async () => {
		const picked = await chosen(store());
		const named = await sayKind(store(), "Ana Pop", picked.state, "confirm");
		const gone = await say(store(["tue10"]), "34", named.state);
		expect(gone?.kind).toBe("times");
		expect(gone?.notice).toBe("taken");
		expect(gone?.slots.map((s) => s.slotId)).not.toContain(picked.chosen?.slotId);
		expect(gone?.state?.details).toMatchObject({ name: "Ana Pop" });
		expect(gone?.state?.key).toBe(named.state?.key);
	});

	it("takes no detail into the first offer of a booking", async () => {
		const first = await say(store(), "Vreau să programez o evaluare");
		expect(first?.state?.details).toBeUndefined();
		expect(first?.state?.chosen).toBeUndefined();
		expect(first?.state?.asked).toBeUndefined();
	});

	it("the English visitor is answered in English, and stays so for a bare answer", async () => {
		const port = store();
		const picked = await chosen(port);
		const english = await sayKind(port, "x", picked.state, "confirm", {
			typed: "My name is Ana Pop and I would like to book",
		});
		expect(english.lang).toBe("en");
		const bare = await sayKind(port, "x", english.state, "confirm", { typed: "34" });
		expect(bare.lang).toBe("en");
	});

	it("reads the typed text, not the redacted one, through the engine", async () => {
		const picked = await chosen();
		const engine = createEngine({
			profiles: [PROFILE],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model" },
			scheduling: store(),
		});
		const events = await collect(
			engine.guide("harbour-bikes").ask({
				question: "Iacob Silviu Iulian 0722 123 456",
				locale: "en",
				...(picked.state === undefined ? {} : { booking: picked.state }),
			}),
		);
		expect(shape(events)).toEqual(["booking", "done"]);
		const offer = events[0]?.type === "booking" ? events[0].offer : undefined;
		expect(offer?.details?.values).toMatchObject({
			name: "Iacob Silviu Iulian",
			phone: "+40722123456",
		});
	});
});

describe("the summary", () => {
	it("holds every detail and waits: no hold, no request yet", async () => {
		const port = store();
		const card = await summary(port);
		expect(card.chosen).toMatchObject({
			date: "2026-11-17",
			time: "10:00",
			practitioner: "DEMO Fitter",
		});
		expect(card.details?.values.email).toBe("ana@example.ro");
		expect(port.calls.filter((c) => c.method === "hold" || c.method === "submit")).toEqual([]);
	});

	it("text that is not an explicit yes shows the summary again and submits nothing", async () => {
		const port = store();
		const card = await summary(port);
		for (const text of [
			"ok",
			"poate",
			"nu",
			"mai vedem",
			"mulțumesc",
			"da, dar mai întâi o întrebare",
			"okay",
			"hmm",
			"👍",
			"daaa",
			"nu confirm",
		]) {
			const again = await say(port, text, card.state);
			expect(again?.kind, text).toBe("summary");
			expect(again?.details?.nudge, text).toBe(true);
		}
		expect(port.calls.filter((c) => c.method === "hold" || c.method === "submit")).toEqual([]);
	});

	it("a question beside the summary goes to the guide and keeps the summary state", async () => {
		const card = await summary();
		expect(await say(store(), "Cât costă o evaluare?", card.state)).toBeUndefined();
	});

	it("a correction typed under the summary changes the field and shows the summary again", async () => {
		const port = store();
		const card = await summary(port);
		const fixed = await sayKind(port, "x", card.state, "summary", { typed: "ana.pop@example.ro" });
		expect(fixed.details?.values.email).toBe("ana.pop@example.ro");
		expect(fixed.details?.values.name).toBe("Ana Pop");
	});

	it("an e-mail typo in a correction is named and the summary does not appear", async () => {
		const port = store();
		const card = await summary(port);
		const typo = await sayKind(port, "x", card.state, "confirm", { typed: "ana@gmial.com" });
		expect(typo.details?.problem).toEqual({
			field: "email",
			code: "typo",
			suggestion: "gmail.com",
		});
		expect(typo.details?.values.email).toBe("ana@example.ro");
	});

	it("Edit opens the form with everything filled, and a yes typed afterwards submits nothing", async () => {
		const port = store();
		const card = await summary(port);
		for (const text of ["Editează", "editează datele", "edit", "Edit details"]) {
			const edit = await sayKind(port, text, card.state, "confirm");
			expect(edit.details?.edit, text).toBe(true);
			expect(edit.details?.values.name, text).toBe("Ana Pop");
			expect(edit.state?.asked, text).toBeUndefined();
			const yes = await say(port, "da", edit.state);
			expect(yes?.kind, text).not.toBe("booked");
		}
		expect(port.calls.filter((c) => c.method === "hold" || c.method === "submit")).toEqual([]);
	});

	it("a store that cannot hold and submit never shows the summary: the form finishes the booking", async () => {
		const port = findOnly(store());
		let offer = await chosen(port);
		for (const answer of ANSWERS) offer = await sayKind(port, answer, offer.state, "confirm");
		expect(offer.details?.edit).toBe(true);
		expect(offer.details?.missing).toEqual([]);
	});
});

describe("a site that books never says it cannot see its calendar", () => {
	it.each([
		"Nu am acces la calendarul cu orele libere, așa că nu pot confirma eu acest interval.",
		"Din păcate nu pot vedea calendarul.",
		"Nu am acces la orarul echipei.",
		"Nu pot verifica disponibilitatea.",
		"I don't have access to the calendar.",
		"I do not have access to our schedule or the free times.",
		"Sorry, I can't check availability.",
		"I have no access to the calendar.",
	])("blocks %j", (text) => {
		expect(deniesCalendar(text)).toBe(true);
	});

	it.each([
		"Programarea se face în conversație: alege o oră liberă.",
		"We have no access restrictions for the clinic.",
		"Nu am acces la dosarul tău medical.",
		"Calendarul de iarnă începe luni.",
	])("lets %j through", (text) => {
		expect(deniesCalendar(text)).toBe(false);
	});

	it("replaces such a model reply with the booking's own offer, on a site that schedules", async () => {
		const server = await startFakeOpenRouter([
			{
				kind: "text",
				chunks: ["I don't have access to the calendar, sorry. ", "Please use the contact page."],
			},
		]);
		fake = server;
		const engine = createEngine({
			profiles: [PROFILE],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
			scheduling: store(),
		});
		const events = await collect(
			engine.guide("harbour-bikes").ask({ question: "Tell me about the fitter", locale: "en" }),
		);
		const kinds = shape(events);
		expect(kinds).toContain("booking");
		expect(kinds.at(-1)).toBe("done");
		const replaced = events.filter((e) => e.type === "replace").at(-1);
		expect(replaced).toMatchObject({ type: "replace", text: "" });
		const offer = events.find((e) => e.type === "booking");
		expect(offer?.type === "booking" && offer.offer.status).toBe("ok");
		expect(offer?.type === "booking" && offer.offer.slots.length).toBeGreaterThan(0);
	});

	it("shows the chosen time again when the denial comes mid-booking", async () => {
		const picked = await chosen();
		const server = await startFakeOpenRouter([
			{ kind: "text", chunks: ["I have no access to the calendar."] },
		]);
		fake = server;
		const engine = createEngine({
			profiles: [PROFILE],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
			scheduling: store(),
		});
		const events = await collect(
			engine.guide("harbour-bikes").ask({
				question: "Tell me about the fitter",
				locale: "en",
				...(picked.state === undefined ? {} : { booking: picked.state }),
			}),
		);
		const offer = events.find((e) => e.type === "booking");
		expect(offer?.type === "booking" && offer.offer.kind).toBe("confirm");
		expect(offer?.type === "booking" && offer.offer.chosen?.time).toBe("10:00");
	});

	it("leaves the same reply alone on a site that does not schedule", async () => {
		const server = await startFakeOpenRouter([
			{ kind: "text", chunks: ["I don't have access to the calendar."] },
		]);
		fake = server;
		const engine = createEngine({
			profiles: [BIKES],
			knowledge: new FakeKnowledge([]),
			model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
		});
		const events = await collect(
			engine.guide("harbour-bikes").ask({ question: "Tell me about the fitter", locale: "en" }),
		);
		expect(shape(events)).not.toContain("booking");
	});
});
