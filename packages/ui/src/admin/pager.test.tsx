/** @jsxRuntime automatic @jsxImportSource hono/jsx */
// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import tokens from "../../../design/tokens.json" with { type: "json" };
import { Pager, type PagerProps, pageCount, pageWindow } from "./pager";

const labels: PagerProps["labels"] = {
	nav: "Pages",
	first: "First page",
	prev: "Previous page",
	next: "Next page",
	last: "Last page",
	page: (n) => `Page ${n}`,
	range: (from, to, total) => `${from}–${to} of ${total}`,
	size: "Per page",
	apply: "Apply",
};
const props = (over: Partial<PagerProps> = {}): PagerProps => ({
	id: "pg",
	page: 1,
	size: 50,
	total: 216,
	sizes: [25, 50, 100],
	href: (page, size) => `/clients?page=${page}&size=${size}&q=a%27b`,
	action: "/clients",
	params: { q: "a'b", sort: "name" },
	labels,
	...over,
});
const html = (over: Partial<PagerProps> = {}): string => String(<Pager {...props(over)} />);
const mount = (over: Partial<PagerProps> = {}): HTMLElement => {
	document.body.innerHTML = html(over);
	const nav = document.getElementById("pg");
	if (nav === null) throw new Error("no pager");
	return nav;
};

describe("pageCount and pageWindow", () => {
	it("counts one page for an empty list, an exact multiple, and a partial last page", () => {
		expect([pageCount(0, 25), pageCount(1, 25), pageCount(50, 25), pageCount(51, 25)]).toEqual([
			1, 1, 2, 3,
		]);
	});
	it("shows every page up to seven, then the ends, the neighbours and gaps", () => {
		expect(pageWindow(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
		expect(pageWindow(1, 20)).toEqual([1, 2, 3, null, 20]);
		expect(pageWindow(10, 20)).toEqual([1, null, 8, 9, 10, 11, 12, null, 20]);
		expect(pageWindow(20, 20)).toEqual([1, null, 18, 19, 20]);
		// A gap of exactly one page shows the page instead of "…".
		expect(pageWindow(5, 20)).toEqual([1, 2, 3, 4, 5, 6, 7, null, 20]);
	});
});

describe("Pager", () => {
	it("says the range shown, marks the current page once, and links every other page", () => {
		const nav = mount({ page: 2 });
		expect(nav.querySelector("[data-range]")?.textContent).toBe("51–100 of 216");
		const current = nav.querySelectorAll('[aria-current="page"]');
		expect(current).toHaveLength(1);
		expect(current[0]?.textContent).toBe("2");
		expect(nav.querySelector('a[rel="next"]')?.getAttribute("href")).toBe(
			"/clients?page=3&size=50&q=a%27b",
		);
		expect(nav.querySelector('a[rel="prev"]')?.getAttribute("href")).toContain("page=1");
		expect(nav.querySelector('[aria-label="Page 5"]')?.getAttribute("href")).toContain("page=5");
		expect(nav.textContent).toContain("2 / 5");
	});

	it("disables first and previous on the first page, next and last on the last (a partial page)", () => {
		const first = mount({ page: 1 });
		expect(first.querySelectorAll('[aria-disabled="true"]')).toHaveLength(2);
		expect(first.querySelector('a[rel="prev"]')).toBeNull();
		const last = mount({ page: 5 });
		expect(last.querySelector("[data-range]")?.textContent).toBe("201–216 of 216");
		expect(last.querySelector('a[rel="next"]')).toBeNull();
		expect(last.querySelectorAll('[aria-disabled="true"]')).toHaveLength(2);
	});

	it("clamps a page past the end to the last, and below one to the first", () => {
		expect(mount({ page: 99 }).querySelector('[aria-current="page"]')?.textContent).toBe("5");
		expect(mount({ page: 0 }).querySelector('[aria-current="page"]')?.textContent).toBe("1");
	});

	it("shows no page links for one page or none, and the range 0–0 for an empty list", () => {
		const one = mount({ total: 50 });
		expect(one.querySelector(".adm-pager__pages")).toBeNull();
		expect(one.querySelector("[data-range]")?.textContent).toBe("1–50 of 50");
		expect(mount({ total: 0 }).querySelector("[data-range]")?.textContent).toBe("0–0 of 0");
	});

	it("offers the sizes, the current one selected, and carries the list's parameters and first row", () => {
		const nav = mount({ page: 3, size: 25 });
		const form = nav.querySelector("form");
		expect(form?.getAttribute("method")).toBe("get");
		expect(form?.getAttribute("action")).toBe("/clients");
		const options = [...nav.querySelectorAll("option")].map((o) => [o.value, o.selected]);
		expect(options).toEqual([
			["25", true],
			["50", false],
			["100", false],
		]);
		const hidden = Object.fromEntries(
			[...nav.querySelectorAll('input[type="hidden"]')].map((i) => [
				i.getAttribute("name"),
				i.getAttribute("value"),
			]),
		);
		expect(hidden).toEqual({ q: "a'b", sort: "name", from: "50" });
	});

	it("without `live` is plain links and a form; with it, each link and the form fetch in place", () => {
		expect(html()).not.toContain("data-on:");
		const live = mount({ live: true, page: 2 });
		const next = live.querySelector('a[rel="next"]');
		expect(next?.getAttribute("data-on:click__prevent")).toBe(
			"@get('/clients?page=3&size=50&q=a%27b')",
		);
		// The current page is not fetched again.
		expect(
			live.querySelector('[aria-current="page"]')?.getAttribute("data-on:click__prevent"),
		).toBeNull();
		expect(live.querySelector("form")?.getAttribute("data-on:change")).toBe(
			"@get('/clients', {contentType: 'form'})",
		);
	});

	it("never lets a quote in an address break out of the Datastar expression", () => {
		const live = mount({ live: true, href: (p) => `/x?q=it's&page=${p}` });
		expect(live.querySelector('a[rel="next"]')?.getAttribute("data-on:click__prevent")).toBe(
			"@get('/x?q=it%27s&page=2')",
		);
	});
});

const THEMES = ["admin-light", "admin-dark"] as const;
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function violations(markup: string, theme: string): Promise<ReadonlyArray<string>> {
	document.documentElement.setAttribute("data-theme", theme);
	document.documentElement.setAttribute("lang", "en");
	document.title = "Pager";
	document.body.innerHTML = `<main>${markup}</main>`;
	const result = await axe.run(document.body, {
		runOnly: { type: "tag", values: WCAG },
		// happy-dom has no layout: contrast is judged from the tokens below.
		rules: { "color-contrast": { enabled: false } },
	});
	return result.violations.map((v) => v.id);
}

describe("axe WCAG 2.2 AA (structure), both console themes", () => {
	for (const theme of THEMES)
		for (const [name, over] of [
			["the first page", { page: 1 }],
			["a middle page, live", { page: 3, live: true }],
			["the last page", { page: 5 }],
			["one page", { total: 10 }],
			["an empty list", { total: 0 }],
		] as const)
			it(`${name} in ${theme}`, async () => {
				expect(await violations(html(over), theme)).toEqual([]);
			});
	it("the gate refuses a seeded violation (a select with no label)", async () => {
		const seeded = `${html()}<select name="x"><option>1</option></select>`;
		expect((await violations(seeded, "admin-light")).join()).toContain("select-name");
	});
});

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb;
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

describe("colour contrast of the pager's roles, from the theme tokens (AA 4.5 for text)", () => {
	const role = (theme: string, name: string): Rgb => {
		const t = tokens.color.tokens.find((x) => x.name === name);
		const v = (t?.value as Record<string, string> | undefined)?.[theme];
		if (!v?.startsWith("#")) throw new Error(`${name} in ${theme} is not a hex role`);
		return hex(v);
	};
	for (const theme of THEMES)
		it(theme, () => {
			// The numbers and the current page on the page and the hover surface; the range on the page.
			for (const [ink, ground] of [
				["ink", "bg"],
				["ink", "surface-1"],
				["ink", "surface-2"],
				["ink-muted", "bg"],
				["ink-muted", "surface-1"],
			] as const)
				expect(
					ratio(role(theme, ink), role(theme, ground)),
					`${ink} on ${ground}`,
				).toBeGreaterThanOrEqual(4.5);
		});
	it("the pager's stylesheet uses token roles only, never a raw colour", () => {
		const css = readFileSync(join(import.meta.dirname, "admin-pager.css"), "utf8");
		expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
	});
});
