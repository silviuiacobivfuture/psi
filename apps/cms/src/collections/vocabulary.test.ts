import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { BRANDS, SLUG, TOPIC_LABELS, TOPICS, TOPICS_AWAITING_MIGRATION } from "./vocabulary";

/** The quoted members of `export const <name> = [ … ] as const` in an @psi/content source file. */
async function blogList(file: string, name: string): Promise<string[]> {
	const src = await readFile(
		new URL(`../../../../packages/content/src/${file}`, import.meta.url),
		"utf8",
	);
	const block = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(src)?.[1];
	if (block === undefined) throw new Error(`${name} not found in packages/content/src/${file}`);
	return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("the blog's vocabulary", () => {
	it("has the blog's brands", async () => {
		expect([...BRANDS]).toEqual(await blogList("brands.ts", "BRANDS"));
	});
	it("has the blog's topics", async () => {
		expect([...TOPICS, ...TOPICS_AWAITING_MIGRATION]).toEqual(
			await blogList("schema.ts", "TOPICS"),
		);
	});
	it("labels every topic in both languages and awaits none", () => {
		expect(TOPICS_AWAITING_MIGRATION).toHaveLength(0);
		for (const t of TOPICS) {
			expect(TOPIC_LABELS[t].ro.trim()).not.toBe("");
			expect(TOPIC_LABELS[t].en.trim()).not.toBe("");
		}
		expect(Object.keys(TOPIC_LABELS)).toEqual([...TOPICS]);
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
