/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Guide } from "@psi/guide";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { GuideLabels } from "./components/guide-labels";
import { streamGuideAnswer } from "./guide-stream";

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
						summary: "SLOTS",
					},
				},
			}),
		);
		const lines = (
			await (await app.request("/", { method: "POST" })).text()
		).split("\n");
		const last =
			lines.filter((l) => l.startsWith("data: elements ")).at(-1) ?? "";
		expect(last).toContain('<form id="booking">evaluation</form>');
		// The summary rides along, so the page can retire this form when a newer offer comes.
		expect(last).toContain('data-booking-summary="SLOTS"');
		const turns =
			lines.find((l) => l.startsWith('data: signals {"compassTurns"')) ?? "";
		expect(
			JSON.parse(turns.slice("data: signals ".length)).compassTurns.at(-1),
		).toEqual({
			role: "guide",
			text: "SLOTS",
		});
	});
});
