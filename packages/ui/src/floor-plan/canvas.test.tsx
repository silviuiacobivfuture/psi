// @vitest-environment happy-dom
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { data, doc, H, labels, rooms, TZ, t0 } from "./demo-fixture";
import { FloorPlan, type FloorPlanProps } from "./floor-plan";
import { FLOOR_PLAN_LABELS } from "./labels-dictionary";

const live = {
	data,
	at: t0 + 10.75 * H,
	now: t0 + 9 * H,
	viewer: { seeClients: true },
	heat: false,
	timeZone: TZ,
	newBookingHref: () => "/new",
};
const base: FloorPlanProps = {
	id: "plan",
	doc,
	labels,
	locale: "ro",
	rooms,
	endpoint: "/floor",
	mode: "live",
	live,
	modeLinks: { draw: "/draw", live: "/floor" },
};

const html = async (p: FloorPlanProps): Promise<string> => String(await FloorPlan(p));
const parse = (markup: string): Document => {
	document.body.innerHTML = markup.replace(/<script[\s\S]*?<\/script>/g, "");
	return document;
};

describe("the plan as a canvas", () => {
	it("keeps the plan a block in a page unless asked: no overlay, no panel head, no full-screen button", async () => {
		const d = parse(await html(base));
		expect(d.querySelector(".pz-fp--canvas")).toBeNull();
		expect(d.querySelector(".pz-fp__overlay")).toBeNull();
		expect(d.querySelector(".pz-fp__panel-head")).toBeNull();
		expect(d.querySelector("[data-fp-cmd=fullscreen]")).toBeNull();
	});

	it("floats the mode switch, the floors and the time strip in one overlay, with a full-screen and a panel button", async () => {
		const d = parse(await html({ ...base, canvas: true }));
		const overlay = d.querySelector(".pz-fp__overlay");
		expect(overlay).not.toBeNull();
		for (const sel of [".pz-fp__modes", ".pz-fp__floorbar", ".pz-fp__strip"])
			expect(overlay?.querySelector(sel), sel).not.toBeNull();
		const full = d.querySelector("[data-fp-cmd=fullscreen]");
		expect(full?.getAttribute("aria-label")).toBe("Ecran complet");
		expect(full?.getAttribute("aria-pressed")).toBe("false");
		const panel = d.querySelector(".pz-fp__btn--panel");
		const side = d.querySelector(".pz-fp__side");
		expect(panel?.getAttribute("aria-controls")).toBe(side?.id);
		expect(d.querySelector("[data-fp-root]")?.getAttribute("data-panel")).toBe("closed");
		// The legend and the rooms live in the panel, and the panel can be closed from inside it.
		expect(side?.querySelector(".pz-fp__legend")).not.toBeNull();
		expect(side?.querySelector(".pz-fp__panel-head [data-fp-cmd=panel]")).not.toBeNull();
		// The page's own title stays for assistive technology, and the client has the words to swap.
		expect(d.querySelector(".pz-fp__title")?.textContent).toBe("Planul clinicii");
		expect(d.querySelector("[data-hint=exitFullscreen]")?.textContent).toBe(
			"Ieși din ecranul complet",
		);
	});

	it("draw mode is a canvas too: the tools float, and there is no 'draw on a bigger screen' note", async () => {
		const d = parse(
			await html({ ...base, mode: "draw", live: undefined, selection: new Set(), canvas: true }),
		);
		expect(d.querySelector(".pz-fp__overlay .pz-fp__bar")).not.toBeNull();
		expect(d.querySelector(".pz-fp__phone-note")).toBeNull();
		const block = parse(
			await html({ ...base, mode: "draw", live: undefined, selection: new Set() }),
		);
		expect(block.querySelector(".pz-fp__phone-note")).not.toBeNull();
	});

	it("carries an extra link beside the modes, and only on a canvas", async () => {
		const extra = <a href="/settings">Setări</a>;
		expect(
			parse(await html({ ...base, canvas: true, extra })).querySelector(
				".pz-fp__head a[href='/settings']",
			),
		).not.toBeNull();
		expect(parse(await html({ ...base, extra })).querySelector("a[href='/settings']")).toBeNull();
	});

	it("says the new words in both languages", () => {
		for (const locale of ["ro", "en"] as const) {
			const l = FLOOR_PLAN_LABELS[locale];
			for (const k of ["fullscreen", "exitFullscreen", "closePanel"] as const)
				expect(l[k].length, `${locale} ${k}`).toBeGreaterThan(3);
		}
		expect(FLOOR_PLAN_LABELS.ro.fullscreen).toBe("Ecran complet");
	});

	it("passes axe with the buttons, the panel and the overlay", async () => {
		parse(await html({ ...base, canvas: true }));
		document.documentElement.setAttribute("lang", "ro");
		document.title = "Plan";
		const result = await axe.run(document.body, {
			runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
			rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
		});
		expect(
			result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
		).toEqual([]);
	});
});
