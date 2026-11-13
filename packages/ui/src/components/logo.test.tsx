/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { readFileSync } from "node:fs";
import { RETIRED_SITES } from "@psi/content/retired";
import { MARKS, type MarkBrand } from "@psi/design/logos";
import { describe, expect, it } from "vitest";
import { Logo } from "./logo";

const BRANDS: MarkBrand[] = ["psizone", "eqsync", "hemisync", "blog"];
const NAMES: Readonly<Record<MarkBrand, string>> = {
	psizone: "Psizone",
	eqsync: "EQ-SYNC",
	hemisync: "Hemi-Sync România",
	blog: "Blog",
};
const BY = "de la Psizone";

function html(node: unknown): string {
	return String(node);
}
function brandsIn(markup: string): ReadonlyArray<string> {
	return [...markup.matchAll(/pz-logo__brand--(\w+)/g)].map((x) => x[1] ?? "");
}
function labelsIn(markup: string): ReadonlyArray<string> {
	return [...markup.matchAll(/aria-label="([^"]*)"/g)].map((x) => x[1] ?? "");
}

describe("Logo: which brands render", () => {
	it("auto renders every live brand, so the theme can show its own, and not a retired one", () => {
		const out = html(<Logo />);
		const shown = BRANDS.filter((b) => !(RETIRED_SITES as ReadonlyArray<string>).includes(b));
		expect(shown).not.toContain("eqsync");
		expect(brandsIn(out)).toEqual(shown);
		expect(out).toContain("pz-logo--auto");
		expect(labelsIn(out)).toEqual(shown.map((b) => NAMES[b]));
		expect(out).not.toContain("EQ-SYNC");
	});

	it("auto follows the switch: nothing retired shows every brand, a retired brand is left out", () => {
		expect(brandsIn(html(<Logo retired={[]} />))).toEqual(BRANDS);
		expect(brandsIn(html(<Logo retired={["blog", "eqsync"]} />))).toEqual(["psizone", "hemisync"]);
	});

	it.each(BRANDS)("brand=%s renders that brand alone, named for assistive tech", (brand) => {
		const out = html(<Logo brand={brand} />);
		expect(new Set(brandsIn(out))).toEqual(new Set([brand]));
		expect(labelsIn(out)).toEqual([NAMES[brand]]);
		expect(out).toContain(`pz-logo--${brand}`);
	});
});

describe("Logo: the marks", () => {
	it.each(
		BRANDS,
	)("%s draws its own vector mark: no raster, no gradient, hidden from the tree", (brand) => {
		const out = html(<Logo brand={brand} />);
		expect(out).toContain('viewBox="0 0 64 64"');
		expect(out).toContain('aria-hidden="true"');
		expect(out).not.toMatch(/<image|radialGradient|linearGradient|<filter|data:image/);
		expect(out).toContain('class="t2"');
	});

	it("the four marks are four different drawings", () => {
		const full = BRANDS.map((b) => MARKS[b].full);
		const compact = BRANDS.map((b) => MARKS[b].compact);
		expect(new Set(full).size).toBe(4);
		expect(new Set(compact).size).toBe(4);
	});

	it("every full mark wears Psizone's frame: the triple ring is byte-identical", () => {
		const ring = (b: MarkBrand): string =>
			MARKS[b].full.match(
				/<circle cx="32" cy="32" r="24.6"[^>]*\/><circle[^>]*\/><circle[^>]*\/>/,
			)?.[0] ?? "";
		expect(ring("psizone")).not.toBe("");
		for (const b of BRANDS) expect(ring(b)).toBe(ring("psizone"));
	});

	it("sizes below 48 draw the compact cut and 48 and up the full emblem", () => {
		for (const brand of BRANDS) {
			expect(html(<Logo brand={brand} size={47} />)).toContain(MARKS[brand].compact);
			expect(html(<Logo brand={brand} size={48} />)).toContain(MARKS[brand].full);
			expect(html(<Logo brand={brand} size={47} />)).not.toContain(MARKS[brand].full);
		}
	});

	it("the mark is as large as `size`", () => {
		expect(html(<Logo brand="eqsync" size={30} />)).toContain('width="30" height="30"');
	});

	it("the generated module equals the hand-written files", () => {
		for (const brand of BRANDS) {
			for (const cut of ["full", "compact"] as const) {
				const file = new URL(
					`../../../design/logos/marks/${brand}${cut === "compact" ? "-compact" : ""}.svg`,
					import.meta.url,
				);
				const source = readFileSync(file, "utf8").trim();
				expect(
					source
						.replace(/^<svg [^>]*>\n?/, "")
						.replace(/<\/svg>$/, "")
						.replace(/\n/g, ""),
				).toBe(MARKS[brand][cut]);
			}
		}
	});
});

describe("Logo: variants", () => {
	it("lockup carries each brand's wordmark", () => {
		expect(html(<Logo brand="psizone" />)).toContain("psizone</span>");
		expect(html(<Logo brand="eqsync" />)).toContain("EQ-SYNC");
		expect(html(<Logo brand="hemisync" />)).toContain("România");
		expect(html(<Logo brand="blog" />)).toContain("pz-logo__blog");
	});

	it.each(BRANDS)("variant=mark drops the wordmark of %s but keeps the mark", (brand) => {
		const out = html(<Logo brand={brand} variant="mark" endorsement={BY} />);
		expect(out).not.toMatch(/pz-logo__(word|eq|hs|blog|stack|by)/);
		expect(out).toContain("pz-logo__mark");
	});

	it("href makes it a link, none makes it a span", () => {
		expect(html(<Logo href="/x" />)).toMatch(/^<a class="[^"]*pz-logo[^"]*" href="\/x">/);
		expect(html(<Logo />)).toMatch(/^<span class="[^"]*pz-logo/);
	});

	it("an extra class lands on the root", () => {
		expect(html(<Logo class="mine" />)).toMatch(/^<span class="[^"]*\bmine\b/);
	});
});

describe("Logo: the endorsement", () => {
	it("is shown under the sister brands' wordmarks and never under Psizone's", () => {
		for (const brand of ["eqsync", "hemisync", "blog"] as const) {
			expect(html(<Logo brand={brand} endorsement={BY} />)).toContain(BY);
		}
		expect(html(<Logo brand="psizone" endorsement={BY} />)).not.toContain(BY);
	});

	it("is opt-in", () => {
		for (const brand of BRANDS) expect(html(<Logo brand={brand} />)).not.toContain("pz-logo__by");
	});

	it("signs with Psizone's own compact emblem, hidden from the tree", () => {
		const out = html(<Logo brand="eqsync" size={30} endorsement={BY} />);
		const by = out.slice(out.indexOf("pz-logo__by"));
		expect(by).toContain(MARKS.psizone.compact);
		expect(by).toContain('aria-hidden="true"');
	});

	it("escapes the text it is given", () => {
		expect(html(<Logo brand="eqsync" endorsement="<b>x</b>" />)).not.toContain("<b>x</b>");
	});

	it("auto puts it under every sister and none under Psizone", () => {
		// Every live sister: EQ-SYNC is retired, so Hemi-Sync and the Blog; with nothing retired, three.
		expect(html(<Logo endorsement={BY} />).split(BY).length - 1).toBe(2);
		expect(html(<Logo endorsement={BY} retired={[]} />).split(BY).length - 1).toBe(3);
	});
});
