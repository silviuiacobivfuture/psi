import { describe, expect, it } from "vitest";
import { type BookingScope, bookingTurn } from "../booking";
import { BUNDLED_LANGUAGES } from "../language/index";
import type { ServiceEntry } from "../scheduling/port";
import { MemorySchedulingStore } from "../testing";

/** Thursday 12 November 2026, 10:00 in Bucharest. */
const NOW = Date.parse("2026-11-12T08:00:00Z");
const slot = (id: string, date: string, time: string) => ({
	id,
	start: Date.parse(`${date}T${time}:00+02:00`),
	end: Date.parse(`${date}T${time}:00+02:00`) + 3_600_000,
	practitionerName: "DEMO Ana",
	modes: ["onsite" as const],
});

function port(entries: ReadonlyArray<ServiceEntry> | "fails"): MemorySchedulingStore {
	const store = new MemorySchedulingStore()
		.offer("clinic", "evaluation", [slot("e1", "2026-11-13", "09:00")])
		.offer("clinic", "neurofeedback", [slot("n1", "2026-11-16", "11:00")]);
	store.catalogue = async () => {
		if (entries === "fails") throw new Error("store down");
		return entries;
	};
	return store;
}

const TWO: ReadonlyArray<ServiceEntry> = [
	{ slug: "evaluation", name: { ro: "Evaluare inițială", en: "Initial assessment" } },
	{ slug: "neurofeedback", name: { ro: "Ședință de neurofeedback", en: "Neurofeedback session" } },
];

const ask = (store: MemorySchedulingStore, question: string, services: string[] = []) => {
	const booking: BookingScope = { port: store, scope: { tenant: "clinic", services } };
	return bookingTurn(booking, { question }, BUNDLED_LANGUAGES, NOW);
};

describe("the booking dialogue offers whatever the store has", () => {
	it("asks which service when there are several and the visitor did not say", async () => {
		const offer = await ask(port(TWO), "Vreau o programare");
		expect(offer).toMatchObject({
			kind: "services",
			choose: true,
			services: ["evaluation", "neurofeedback"],
		});
		expect(offer?.names?.neurofeedback?.ro).toBe("Ședință de neurofeedback");
	});
	it("matches the visitor's words to a service name in Romanian and in English", async () => {
		const ro = await ask(port(TWO), "Vreau o programare la neurofeedback");
		expect(ro).toMatchObject({ kind: "times", service: "neurofeedback", status: "ok" });
		const en = await ask(port(TWO), "Can you book me an initial assessment?");
		expect(en).toMatchObject({ kind: "times", service: "evaluation", status: "ok" });
		const full = await ask(port(TWO), "Aș vrea o programare pentru evaluare inițială");
		expect(full).toMatchObject({ service: "evaluation" });
	});
	it("lists the services on request, with names, without asking to choose", async () => {
		const offer = await ask(port(TWO), "Vreau o programare, ce servicii aveți?");
		expect(offer).toMatchObject({ kind: "services" });
		expect(offer?.choose).toBeUndefined();
	});
	it("goes straight to times when the store has one service, whatever the profile says", async () => {
		const offer = await ask(port([{ slug: "evaluation" }]), "Vreau o programare", [
			"neurofeedback",
		]);
		expect(offer).toMatchObject({ kind: "times", service: "evaluation", status: "ok" });
	});
	it("falls back to the callback form when the store has no service", async () => {
		const offer = await ask(port([]), "Vreau o programare");
		expect(offer).toMatchObject({ kind: "times", status: "unavailable", slots: [] });
	});
	it("keeps the profile's own list when the store cannot be read", async () => {
		const offer = await ask(port("fails"), "Vreau o programare", ["evaluation"]);
		expect(offer).toMatchObject({ kind: "times", service: "evaluation", status: "ok" });
	});
	it("does not mistake a name shared by two services for either", async () => {
		const shared: ReadonlyArray<ServiceEntry> = [
			{ slug: "evaluation", name: { ro: "Ședință de evaluare", en: "Assessment" } },
			{ slug: "neurofeedback", name: { ro: "Ședință de neurofeedback", en: "Neurofeedback" } },
		];
		const offer = await ask(port(shared), "Vreau o programare la o ședință");
		expect(offer).toMatchObject({ kind: "services", choose: true });
	});
});
