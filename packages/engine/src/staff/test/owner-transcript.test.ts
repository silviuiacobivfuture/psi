import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffEvent } from "../events";
import { collect, type Harness, romanianOwner, startEngine, textOf } from "./turn-harness";

let h: Harness | undefined;
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", ""));
afterEach(async () => {
	vi.unstubAllEnvs();
	await h?.close();
	h = undefined;
});

const chips = (events: ReadonlyArray<StaffEvent>): Array<string> =>
	events.flatMap((e) => (e.type === "tool" && e.phase !== "running" ? [e.label] : []));
const cards = (events: ReadonlyArray<StaffEvent>): Array<string> =>
	events.flatMap((e) =>
		e.type === "card" ? [`${e.card.kind}:${"title" in e.card ? e.card.title : ""}`] : [],
	);

describe("the owner's transcript: booking a person who is not a client", () => {
	it("a search that finds nobody says so in its chip and draws no empty card", async () => {
		h = await startEngine([
			{ kind: "tool", query: "", tool: "staffFindClient", input: { query: "Iulian Iacob" } },
			{ kind: "text", chunks: ["Nu am găsit niciun client cu acest nume."] },
		]);
		const events = await collect(
			h.engine.chat(romanianOwner(), { message: "programează-l pe Iulian Iacob" }),
		);
		expect(chips(events)).toEqual(["Niciun client găsit"]);
		expect(cards(events)).toEqual([]);
	});

	it("a search that finds some says how many", async () => {
		h = await startEngine([
			{ kind: "tool", query: "", tool: "staffFindClient", input: { query: "maria", limit: 5 } },
			{ kind: "text", chunks: ["Sunt două."] },
		]);
		const events = await collect(h.engine.chat(romanianOwner(), { message: "caută maria" }));
		expect(chips(events)).toEqual(["Am găsit clientul"]);
	});

	it("an empty result card appears once at most, and not when the words already say it", async () => {
		h = await startEngine([
			{ kind: "tool", query: "", tool: "staffAgenda", input: { from: "2026-12-01", days: 1 } },
			{ kind: "tool", query: "", tool: "staffAgenda", input: { from: "2026-12-02", days: 1 } },
			{ kind: "text", chunks: ["Mai multe zile libere."] },
		]);
		const events = await collect(
			h.engine.chat(romanianOwner(), { message: "ce am în decembrie?" }),
		);
		expect(cards(events).filter((c) => c.startsWith("agenda"))).toHaveLength(1);
		await h.close();
		h = await startEngine([
			{ kind: "tool", query: "", tool: "staffAgenda", input: { from: "2026-12-01", days: 1 } },
			{ kind: "text", chunks: ["Nu ai nicio programare în acea zi."] },
		]);
		const said = await collect(
			h.engine.chat(romanianOwner(), { message: "ce am pe 1 decembrie?" }),
		);
		expect(cards(said)).toEqual([]);
	});

	it("one card adds the client and books them, and confirming does both in order", async () => {
		const port = romanianOwner();
		h = await startEngine([
			{
				kind: "tool",
				query: "",
				tool: "staffCreateAppointment",
				input: {
					newClient: { name: "Iulian Iacob", phone: "0722 111 222", age: 9 },
					service: "Evaluare",
					date: "2026-11-16",
					time: "15:30",
					resources: ["Ana Pop", "Cabinet Terapie"],
				},
			},
			{ kind: "text", chunks: ["Am pregătit clientul și programarea; confirmă în card."] },
		]);
		const events = await collect(
			h.engine.chat(port, {
				message: "creează clientul Iulian Iacob și programează-l luni la 15:30",
			}),
		);
		const proposals = events.filter((e) => e.type === "card" && e.card.kind === "proposal");
		expect(proposals).toHaveLength(1);
		expect(port.writes()).toEqual([]);
		const card = proposals[0];
		if (card?.type !== "card" || card.card.kind !== "proposal") throw new Error("no proposal");
		expect(card.card.title).toBe("Client nou și programare");
		expect(card.card.lines.map((l) => l.label)).toEqual(
			expect.arrayContaining(["Client", "Telefon", "Anul nașterii", "Serviciu", "Când", "Unde"]),
		);
		const outcome = await h.engine.confirm(port, card.card.proposalId);
		expect(outcome.status).toBe("done");
		expect(port.writes().map((w) => w.method)).toEqual(["createClient", "createAppointment"]);
		const made = port.data.clients.find((c) => c.name === "Iulian Iacob");
		expect(made).toBeDefined();
		expect(port.callsTo("createAppointment")[0]?.args).toMatchObject({
			clientId: made?.id,
			startMin: 930,
		});
		expect(port.audits.flatMap((a) => a.subjects)).not.toContain("$new-client");
	});
});

describe("a reply that stops before its end is never passed off as whole", () => {
	it("the token limit mid-sentence: the whole sentences stay, the stop is said, no refusal", async () => {
		h = await startEngine([
			{
				kind: "text",
				chunks: ["Iulian Iacob nu este client. ", "Vrei să-l"],
				finish: "length",
			},
		]);
		const events = await collect(
			h.engine.chat(romanianOwner(), { message: "programează-l pe Iulian" }),
		);
		expect(events.some((e) => e.type === "refusal")).toBe(false);
		expect(textOf(events)).toBe(
			"Iulian Iacob nu este client. (Răspunsul s-a întrerupt aici; scrie „continuă” ca să-l reiau.)",
		);
		expect(events.filter((e) => e.type === "done")).toHaveLength(1);
		expect(h.failures.join()).toContain("finished with reason length");
	});

	it("a stream that ends without a finish: same", async () => {
		h = await startEngine([
			{ kind: "text", chunks: ["Prima propoziție. A doua se oprește la"], finish: "other" },
		]);
		const events = await collect(h.engine.chat(romanianOwner(), { message: "salut" }));
		expect(textOf(events)).toContain("Prima propoziție.");
		expect(textOf(events)).not.toContain("A doua");
		expect(events.some((e) => e.type === "refusal")).toBe(false);
	});

	it("a model that only called tools and then stopped gets words, not a refusal", async () => {
		h = await startEngine([
			{ kind: "tool", query: "", tool: "staffFindClient", input: { query: "maria" } },
			{ kind: "text", chunks: [""], finish: "length" },
		]);
		const events = await collect(h.engine.chat(romanianOwner(), { message: "caută maria" }));
		expect(events.some((e) => e.type === "refusal")).toBe(false);
		expect(textOf(events)).toContain("Nu am ajuns la un rezultat");
	});

	it("the unbacked-claim guard takes out the false sentence only, and keeps the rest", async () => {
		h = await startEngine([
			{
				kind: "text",
				chunks: ["Mâine ai trei programări. Am pregătit mutarea, confirmă în card."],
			},
		]);
		const events = await collect(
			h.engine.chat(romanianOwner(), { message: "ce am mâine și mută-l" }),
		);
		const text = textOf(events);
		expect(text).toContain("Mâine ai trei programări.");
		expect(text).not.toContain("Am pregătit mutarea");
		expect(text).toContain("Nu am pregătit nicio modificare");
	});

	it("a denial of a change is not mistaken for a claim", async () => {
		h = await startEngine([{ kind: "text", chunks: ["Nu am pregătit nimic încă; spune-mi ora."] }]);
		const events = await collect(h.engine.chat(romanianOwner(), { message: "mută-l" }));
		expect(textOf(events)).toBe("Nu am pregătit nimic încă; spune-mi ora.");
	});

	it("a tool called again and again with the same input is stopped, not looped until the steps run out", async () => {
		const script = Array.from({ length: 6 }, () => ({
			kind: "tool" as const,
			query: "",
			tool: "staffFindClient",
			input: { query: "Iulian Iacob" },
		}));
		h = await startEngine([...script, { kind: "text", chunks: ["Nu am găsit pe nimeni."] }]);
		const port = romanianOwner();
		const events = await collect(h.engine.chat(port, { message: "caută Iulian Iacob" }));
		expect(port.callsTo("findClients").length).toBeLessThanOrEqual(2);
		expect(events.some((e) => e.type === "tool" && e.phase === "refused")).toBe(true);
	});
});
