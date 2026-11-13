import { describe, expect, it } from "vitest";
import tokens from "../tokens.json";

const ADMIN = ["admin-light", "admin-dark"] as const;
type Theme = (typeof ADMIN)[number];

const all = [...tokens.color.tokens, ...tokens.color.adminTokens];
function role(name: string, theme: Theme): string {
	const t = all.find((x) => x.name === name);
	const v: unknown =
		t === undefined ? undefined : Object.entries(t.value).find(([id]) => id === theme)?.[1];
	if (typeof v !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(v))
		throw new Error(`${name} in ${theme} is not a solid #RRGGBB`);
	return v;
}
function luminance(hex: string): number {
	const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
	const [r = 0, g = 0, b = 0] = c.map((x) =>
		x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
	);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
	const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

const STATUSES = [
	"confirmed",
	"requested",
	"cancelled",
	"attended",
	"no-show",
	"leave",
	"medical-leave",
];
const COLUMNS = [1, 2, 3, 4, 5, 6];
const APPS = ["psizone", "hemisync"];

/** [foreground, ground, minimum]: WCAG 2.2 AA — text 4.5:1, non-text (markers, borders, focus) 3:1. */
const PAIRS: ReadonlyArray<readonly [string, string, number]> = [
	["ink", "bg", 4.5],
	["ink", "surface-1", 4.5],
	["ink", "surface-2", 4.5],
	["ink-muted", "surface-1", 4.5],
	["ink-muted", "surface-2", 4.5],
	["ink-faint", "surface-2", 4.5],
	["on-accent", "accent", 4.5],
	["on-accent", "accent-hover", 4.5],
	["accent", "surface-1", 4.5],
	["focus", "bg", 3],
	["focus", "surface-1", 3],
	["focus", "surface-2", 3],
	["line-control", "surface-1", 3],
	["line-control", "surface-2", 3],
	["success", "surface-1", 4.5],
	["warning", "surface-1", 4.5],
	["danger", "surface-1", 4.5],
	["info", "surface-1", 4.5],
	["danger", "surface-2", 4.5],
	...STATUSES.flatMap(
		(s): Array<readonly [string, string, number]> => [
			[`status-${s}`, `status-${s}-soft`, 4.5],
			[`status-${s}`, "surface-1", 4.5],
		],
	),
	...COLUMNS.flatMap(
		(n): Array<readonly [string, string, number]> => [
			["ink", `cal-${n}-soft`, 4.5],
			[`cal-${n}`, "surface-1", 3],
			[`cal-${n}`, "bg", 3],
		],
	),
	...APPS.flatMap(
		(a): Array<readonly [string, string, number]> => [
			[`on-app-${a}`, `app-${a}`, 4.5],
			[`app-${a}`, "surface-1", 4.5],
			[`app-${a}`, "bg", 4.5],
		],
	),
];

describe("admin themes: WCAG 2.2 AA for every role pair", () => {
	for (const theme of ADMIN) {
		for (const [fg, bg, min] of PAIRS) {
			it(`${theme}: ${fg} on ${bg} is at least ${min}:1`, () => {
				expect(contrast(role(fg, theme), role(bg, theme))).toBeGreaterThanOrEqual(min);
			});
		}
	}

	it("gives every admin role a value in both admin themes and none elsewhere", () => {
		for (const t of tokens.color.adminTokens) {
			expect(Object.keys(t.value).sort(), t.name).toEqual([...ADMIN].sort());
		}
	});

	it("refuses a pair below its minimum (the gate has been seen failing)", () => {
		expect(contrast("#777777", "#808080")).toBeLessThan(4.5);
	});
});
