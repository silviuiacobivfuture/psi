import { countingScope, guideSignal } from "@psi/site-control";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { collector, guideCounts } from "./index";

describe("the Blog's invitation counters", () => {
	it("land in the same collector as the questions: one number per metric, day and locale", async () => {
		const app = new Hono();
		app.use("*", countingScope());
		app.post("/ghid/signal", guideSignal({ reporter: guideCounts, locale: "ro" }));
		const before = collector.pending().length;
		for (const e of ["open", "open", "nudge", "nudge_click"]) {
			await app.request("/ghid/signal", {
				method: "POST",
				headers: { "user-agent": "Mozilla/5.0 Chrome/140" },
				body: JSON.stringify({ e }),
			});
		}
		const mine = collector
			.pending()
			.filter((c) => c.metric.startsWith("guide_") && c.brand === "blog");
		const byMetric = Object.fromEntries(mine.map((c) => [c.metric, c.count]));
		expect(byMetric).toMatchObject({
			guide_opened: 2,
			guide_nudge_shown: 1,
			guide_nudge_clicked: 1,
		});
		expect(mine.every((c) => c.slug === "" && c.topic === null && c.locale === "ro")).toBe(true);
		expect(collector.pending().length).toBeGreaterThan(before);
	});
});
