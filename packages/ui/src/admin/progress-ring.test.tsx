/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import { ProgressRing, ringArcs } from "./progress-ring";

const C = 2 * Math.PI * 42;

describe("ringArcs", () => {
	it("shares the circle between the segments, leaving a hairline between neighbours", () => {
		const arcs = ringArcs([
			{ tone: "used", value: 3 },
			{ tone: "left", value: 6 },
			{ tone: "bonus-left", value: 1 },
		]);
		expect(arcs.map((a) => a.tone)).toEqual(["used", "left", "bonus-left"]);
		expect(arcs[0]?.dash).toBeCloseTo(C * 0.3 - 2.4, 5);
		expect(arcs[1]?.offset).toBeCloseTo(-C * 0.3, 5);
	});
	it("skips empty segments; a lone segment is the whole circle with no gap", () => {
		const arcs = ringArcs([
			{ tone: "used", value: 0 },
			{ tone: "left", value: 4 },
		]);
		expect(arcs).toHaveLength(1);
		expect(arcs[0]?.dash).toBeCloseTo(C, 5);
	});
	it("draws nothing for an empty package", () => {
		expect(ringArcs([])).toEqual([]);
		expect(ringArcs([{ tone: "used", value: 0 }])).toEqual([]);
	});
	it("never yields a non-finite length", () => {
		for (const a of ringArcs([
			{ tone: "used", value: 1 },
			{ tone: "left", value: 1e9 },
		]))
			expect(Number.isFinite(a.dash) && Number.isFinite(a.offset)).toBe(true);
	});
});

describe("ProgressRing", () => {
	it("is one image with a spoken label; the figures are not read twice", () => {
		const html = (
			<ProgressRing
				segments={[{ tone: "used", value: 3 }]}
				label="7 of 10 sessions left"
				primary="7"
				secondary="of 10"
			/>
		).toString();
		expect(html).toContain('role="img"');
		expect(html).toContain('aria-label="7 of 10 sessions left"');
		expect(html).toContain('class="adm-ring__center" aria-hidden="true"');
		expect(html).toContain("adm-ring__seg--used");
	});
	it("renders the track alone for an empty package and no secondary line when none is given", () => {
		const html = (<ProgressRing segments={[]} label="none" primary="0" />).toString();
		expect(html).not.toContain("adm-ring__seg");
		expect(html).not.toContain("adm-ring__secondary");
		expect(html).not.toMatch(/NaN|undefined|Infinity/);
	});
});
