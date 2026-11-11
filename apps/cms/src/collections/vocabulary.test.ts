import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { BRANDS, SLUG, TOPICS } from "./vocabulary";

/** The quoted members of `export const <name> = [ … ] as const` in a blog-web source file. */
async function blogList(file: string, name: string): Promise<string[]> {
	const src = await readFile(new URL(`../../../blog-web/src/${file}`, import.meta.url), "utf8");
	const block = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(src)?.[1];
	if (block === undefined) throw new Error(`${name} not found in blog-web/src/${file}`);
	return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("the blog's vocabulary", () => {
	it("has the blog's brands", async () => {
		expect([...BRANDS]).toEqual(await blogList("brands.ts", "BRANDS"));
	});
	it("has the blog's topics", async () => {
		expect([...TOPICS]).toEqual(await blogList("content/schema.ts", "TOPICS"));
	});
	it.each([
		["a", true],
		["primele-semne-de-autism", true],
		["Upper", false],
		["double--dash", false],
		["-lead", false],
		["", false],
	])("slug %j valid: %s", (slug, ok) => {
		expect(SLUG.test(slug)).toBe(ok);
	});
});
