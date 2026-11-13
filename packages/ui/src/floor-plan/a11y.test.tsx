// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import tokens from "../../../design/tokens.json" with { type: "json" };
import { FLOOR_PLAN_JS } from "./client.generated";
import { data, doc, H, labels, rooms, TZ, t0 } from "./demo-fixture";
import { FloorPlan, type FloorPlanProps } from "./floor-plan";

const live = {
	data,
	at: t0 + 10.75 * H,
	now: t0 + 9 * H,
	viewer: { seeClients: true },
	heat: false,
	timeZone: TZ,
	newBookingHref: () => "/new",
};
const draw: FloorPlanProps = {
	id: "plan",
	doc,
	labels,
	locale: "ro",
	rooms,
	endpoint: "/floor",
	mode: "draw",
	selection: new Set(["a"]),
};
const liveProps: FloorPlanProps = {
	...draw,
	mode: "live",
	selection: undefined,
	live: { ...live, openRoomId: "psih-1" },
};
const heatProps: FloorPlanProps = { ...liveProps, live: { ...live, heat: true } };

async function mount(props: FloorPlanProps, theme: string): Promise<void> {
	document.documentElement.setAttribute("data-theme", theme);
	document.documentElement.setAttribute("lang", "ro");
	document.title = "Plan";
	// The inline client is not run here (it needs layout); only the markup is judged.
	document.body.innerHTML = `<main>${String(await FloorPlan(props)).replace(/<script[\s\S]*?<\/script>/g, "")}</main>`;
}

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function violations(): Promise<ReadonlyArray<string>> {
	const result = await axe.run(document.body, {
		runOnly: { type: "tag", values: WCAG },
		// happy-dom has no layout: contrast is judged from the tokens below, not here.
		rules: { "color-contrast": { enabled: false } },
	});
	return result.violations.map(
		(v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(" | ")}`,
	);
}

describe("axe WCAG 2.2 AA (structure), both modes, both themes", () => {
	for (const theme of ["psizone-light", "psizone-dark"]) {
		for (const [name, props] of [
			["draw", draw],
			["live", liveProps],
			["live heatmap", heatProps],
		] as const) {
			it(`${name} in ${theme}`, async () => {
				await mount(props, theme);
				expect(await violations()).toEqual([]);
			});
		}
	}
	it("the gate refuses a seeded violation (a button with no name)", async () => {
		await mount(liveProps, "psizone-light");
		document.body.insertAdjacentHTML("beforeend", '<button type="button"></button>');
		expect((await violations()).join()).toContain("button-name");
	});
});

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb;
const mix = (a: Rgb, b: Rgb, pa: number): Rgb =>
	a.map((v, i) => v * pa + (b[i] ?? 0) * (1 - pa)) as Rgb;
const lum = (c: Rgb): number => {
	const [r, g, b] = c.map((v) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	}) as Rgb;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: Rgb, b: Rgb): number => {
	const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
	return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
};

describe("colour contrast, from the theme tokens (AA: 4.5 for text, 3 for the marks and controls)", () => {
	const role = (theme: string, name: string): Rgb => {
		const t = tokens.color.tokens.find((x) => x.name === name);
		const v = (t?.value as Record<string, string> | undefined)?.[theme];
		if (!v?.startsWith("#")) throw new Error(`${name} in ${theme} is not a hex role`);
		return hex(v);
	};
	for (const theme of ["psizone-light", "psizone-dark"]) {
		const paper = role(theme, "surface-1");
		const fills: ReadonlyArray<[string, Rgb]> = [
			["room", mix(role(theme, "accent"), paper, 0.08)],
			["free", mix(role(theme, "success"), paper, 0.15)],
			["booked", mix(role(theme, "accent"), paper, 0.24)],
			["closed", mix(role(theme, "ink-faint"), paper, 0.14)],
			["conflict", mix(role(theme, "danger"), paper, 0.22)],
			...[0.16, 0.3, 0.44, 0.58].map((p, i): [string, Rgb] => [
				`heat ${i + 1}`,
				mix(role(theme, "accent"), paper, p),
			]),
		];
		it(`${theme}: ink and muted ink read on every fill`, () => {
			for (const [name, fill] of fills) {
				expect(ratio(role(theme, "ink"), fill), `ink on ${name}`).toBeGreaterThanOrEqual(4.5);
				// In the heatmap the secondary lines are drawn in full ink (see .has-heat .pz-fp__sub).
				if (!name.startsWith("heat"))
					expect(
						ratio(role(theme, "ink-muted"), fill),
						`muted ink on ${name}`,
					).toBeGreaterThanOrEqual(4.5);
			}
		});
		it(`${theme}: controls, walls and the primary button`, () => {
			expect(ratio(role(theme, "line-control"), paper)).toBeGreaterThanOrEqual(3);
			expect(ratio(role(theme, "on-accent"), role(theme, "accent"))).toBeGreaterThanOrEqual(4.5);
			expect(ratio(role(theme, "danger"), paper)).toBeGreaterThanOrEqual(4.5);
			expect(ratio(role(theme, "success"), paper)).toBeGreaterThanOrEqual(4.5);
			expect(ratio(role(theme, "warning"), paper)).toBeGreaterThanOrEqual(4.5);
			expect(ratio(role(theme, "focus"), paper)).toBeGreaterThanOrEqual(3);
		});
	}
});

describe("stylesheet rules", () => {
	const read = (f: string): string =>
		readFileSync(join(process.cwd(), "src/floor-plan", f), "utf8");
	const css = ["floor-plan-base.css", "floor-plan-scene.css", "floor-plan-responsive.css"]
		.map(read)
		.join("\n");
	it("every animation and transition lives inside prefers-reduced-motion: no-preference", () => {
		const head = "@media (prefers-reduced-motion: no-preference) {";
		const start = css.indexOf(head);
		expect(start).toBeGreaterThan(-1);
		let depth = 0;
		let end = start;
		for (let k = start + head.length - 1; k < css.length; k++) {
			if (css[k] === "{") depth++;
			if (css[k] === "}" && --depth === 0) {
				end = k + 1;
				break;
			}
		}
		const outside = css.slice(0, start) + css.slice(end);
		expect(css).toMatch(/prefers-reduced-motion: no-preference/);
		expect(outside).not.toMatch(/animation|transition/);
	});
	it("uses no raw colour: only token roles, mixes of them and keywords", () => {
		expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
	});
	it("the client script carries no user-facing word and does not close a script tag", () => {
		expect(FLOOR_PLAN_JS).not.toContain("</script");
		expect(FLOOR_PLAN_JS).not.toContain("ZodError");
		expect(FLOOR_PLAN_JS.length).toBeLessThan(40_000);
		for (const word of ["Salveaz", "Save plan", "Liber", "Ocupat"])
			expect(FLOOR_PLAN_JS).not.toContain(word);
	});
});

describe("the page script bundle", () => {
	it("is what the source builds to (run `pnpm --filter @psi/ui build:client` after a change)", async () => {
		const out = await build({
			entryPoints: [join(process.cwd(), "src/floor-plan/client/main.ts")],
			bundle: true,
			write: false,
			format: "iife",
			target: "es2020",
			minify: true,
			legalComments: "none",
			logLevel: "silent",
		});
		expect(out.outputFiles[0]?.text.trim()).toBe(FLOOR_PLAN_JS);
	});
});
