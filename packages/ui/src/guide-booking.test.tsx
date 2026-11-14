/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Guide } from "@psi/guide";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { GuideLabels } from "./components/guide-labels";
import { parseAskSignals, streamGuideAnswer } from "./guide-stream";

const labels: GuideLabels = {
	thinking: "T",
	stages: { searching: "S", checking: "K" },
	footer: "F",
	contact: { label: "C", href: "/c" },
	reviewedBy: (name, date) => `R ${name} ${date}`,
	refusals: {
		crisis: <div class="crisis">112</div>,
		out_of_scope: "OOS",
		injection: "INJ",
		abuse: "ABUSE",
		rate_limited: "RATE",
		exchange_limit: "EXCH",
		no_content: "NC",
		unavailable: "U",
	},
	retry: "RETRY",
	dropped: "DROPPED",
	unanswered: "UNANSWERED",
};

describe("booking inside the conversation", () => {
	it("renders the app's booking step for an offer and remembers the summary turn", async () => {
		const offering: Guide = {
			brand: "psizone",
			model: "test",
			async *ask() {
				yield {
					type: "booking",
					offer: {
						kind: "times",
						service: "evaluation",
						status: "ok",
						timeZone: "Europe/Bucharest",
						slots: [],
					},
				};
				yield { type: "done" };
			},
		};
		const app = new Hono();
		app.post("/", (c) =>
			streamGuideAnswer(c, {
				guide: offering,
				locale: "ro",
				question: "Vreau o programare",
				target: "compass-answer",
				labels: {
					...labels,
					booking: {
						render: (offer) => <form id="booking">{offer.service}</form>,
						summary: () => "SLOTS",
					},
				},
			}),
		);
		const lines = (await (await app.request("/", { method: "POST" })).text()).split("\n");
		const last = lines.filter((l) => l.startsWith("data: elements ")).at(-1) ?? "";
		expect(last).toContain('<form id="booking">evaluation</form>');
		// The summary rides along, so the page can retire this form when a newer offer comes.
		expect(last).toContain('data-booking-summary="SLOTS"');
		const turns = lines.find((l) => l.startsWith('data: signals {"compassTurns"')) ?? "";
		expect(JSON.parse(turns.slice("data: signals ".length)).compassTurns.at(-1)).toEqual({
			role: "guide",
			text: "SLOTS",
		});
	});
	it("keeps the offer's booking state on the guide's turn and sends it with the next question", async () => {
		const state = {
			stage: "times" as const,
			criteria: { service: "evaluation", days: 14, partOfDay: "morning" as const },
			shown: [],
		};
		const asked: Array<unknown> = [];
		const guide: Guide = {
			brand: "psizone",
			model: "test",
			async *ask(input) {
				asked.push(input);
				yield {
					type: "booking",
					offer: { kind: "times", service: "evaluation", status: "none", slots: [], state },
				};
				yield { type: "done" };
			},
		};
		const withBooking = {
			...labels,
			booking: { render: () => <p>OFFER</p>, summary: () => "SUMMARY" },
		};
		const app = new Hono();
		app.post("/", async (c) =>
			streamGuideAnswer(c, {
				guide,
				locale: "ro",
				question: "next",
				target: "compass-answer",
				labels: withBooking,
				signals: parseAskSignals(await c.req.json()),
			}),
		);
		const first = await (await app.request("/", { method: "POST", body: "{}" })).text();
		const kept = first.split("\n").find((l) => l.startsWith('data: signals {"compassTurns"')) ?? "";
		const turns = JSON.parse(kept.slice("data: signals ".length)).compassTurns;
		expect(turns.at(-1)).toEqual({ role: "guide", text: "SUMMARY", booking: state });
		await (
			await app.request("/", { method: "POST", body: JSON.stringify({ compassTurns: turns }) })
		).text();
		expect(asked[0]).not.toHaveProperty("booking");
		expect(asked[1]).toMatchObject({
			booking: state,
			history: [
				{ role: "user", text: "next" },
				{ role: "guide", text: "SUMMARY" },
			],
		});
	});

	it("what a visitor types as booking details is not kept in the history the model reads", async () => {
		const state = {
			stage: "details" as const,
			criteria: { service: "evaluation", days: 14, partOfDay: "any" as const },
			shown: [],
			asked: "phone" as const,
		};
		const guide: Guide = {
			brand: "psizone",
			model: "test",
			async *ask() {
				yield {
					type: "booking",
					offer: { kind: "confirm", service: "evaluation", status: "ok", slots: [], state },
				};
				yield { type: "done" };
			},
		};
		const app = new Hono();
		app.post("/", async (c) =>
			streamGuideAnswer(c, {
				guide,
				locale: "ro",
				question: "0722 123 456",
				target: "compass-answer",
				labels: { ...labels, booking: { render: () => <p>OFFER</p>, summary: () => "SUMMARY" } },
				signals: parseAskSignals(await c.req.json()),
			}),
		);
		const body = JSON.stringify({
			compassTurns: [{ role: "guide", text: "Q", booking: state }],
		});
		const out = await (await app.request("/", { method: "POST", body })).text();
		const kept = out.split("\n").find((l) => l.startsWith('data: signals {"compassTurns"')) ?? "";
		const turns = JSON.parse(kept.slice("data: signals ".length)).compassTurns;
		expect(turns.at(-2)).toEqual({ role: "user", text: "…" });
		expect(JSON.stringify(turns)).not.toContain("0722");
	});

	it("a question asked outside the details step is kept as asked", async () => {
		const guide: Guide = {
			brand: "psizone",
			model: "test",
			async *ask() {
				yield {
					type: "booking",
					offer: { kind: "times", service: "evaluation", status: "none", slots: [] },
				};
				yield { type: "done" };
			},
		};
		const app = new Hono();
		app.post("/", (c) =>
			streamGuideAnswer(c, {
				guide,
				locale: "ro",
				question: "Vreau o programare",
				target: "compass-answer",
				labels: { ...labels, booking: { render: () => <p>OFFER</p>, summary: () => "SUMMARY" } },
			}),
		);
		const out = await (await app.request("/", { method: "POST" })).text();
		const kept = out.split("\n").find((l) => l.startsWith('data: signals {"compassTurns"')) ?? "";
		const turns = JSON.parse(kept.slice("data: signals ".length)).compassTurns;
		expect(turns.at(-2)).toEqual({ role: "user", text: "Vreau o programare" });
	});
});
