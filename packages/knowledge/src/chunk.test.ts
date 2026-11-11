import { describe, expect, it } from "vitest";
import { approxTokens, CHUNK_MAX_TOKENS, chunkMarkdown } from "./chunk";

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function withinLimit(chunks: ReadonlyArray<string>): boolean {
	return chunks.every((c) => approxTokens(c) <= CHUNK_MAX_TOKENS);
}

describe("chunkMarkdown", () => {
	it("returns nothing for an empty or blank body", async () => {
		expect(await chunkMarkdown("")).toEqual([]);
		expect(await chunkMarkdown("   \n\n\t  ")).toEqual([]);
	});

	it("keeps a short body as exactly one chunk", async () => {
		const body = "## Telefon\n\nSună-ne la 0748 017 752.";
		expect(await chunkMarkdown(body)).toEqual([body]);
	});

	it("splits many sections into several chunks, each within the limit, keeping every section", async () => {
		const sections = Array.from(
			{ length: 12 },
			(_, i) => `## Secțiunea ${i}\n\n${`Propoziția numărul ${i} despre program. `.repeat(40)}`,
		);
		const chunks = await chunkMarkdown(sections.join("\n\n"));
		expect(chunks.length).toBeGreaterThan(1);
		expect(withinLimit(chunks)).toBe(true);
		for (let i = 0; i < 12; i++) {
			expect(chunks.some((c) => c.includes(`Secțiunea ${i}`))).toBe(true);
		}
	});

	it("overlaps neighbouring chunks of one long paragraph", async () => {
		const words = Array.from({ length: 1200 }, (_, i) => `w${i}`).join(" ");
		const chunks = await chunkMarkdown(words);
		expect(chunks.length).toBeGreaterThan(2);
		const [first, second] = chunks;
		const lastOfFirst = first?.split(" ").at(-1) ?? "";
		expect(lastOfFirst).not.toBe("");
		expect(second?.split(" ")).toContain(lastOfFirst);
	});

	it("bounds a very long body with no separators at all", async () => {
		const chunks = await chunkMarkdown("x".repeat(40_000));
		expect(chunks.length).toBeGreaterThan(5);
		expect(withinLimit(chunks)).toBe(true);
	});

	it("keeps Romanian diacritics intact and normalises decomposed ones to NFC", async () => {
		const decomposed = "ședință".normalize("NFD"); // ș, ă written as base letter + combining mark
		const body = `## Ședință\n\nÎntrebări și răspunsuri: țară, înțelegere, ședință. ${decomposed}`;
		const [chunk] = await chunkMarkdown(body);
		expect(chunk).toContain("Întrebări și răspunsuri: țară, înțelegere, ședință.");
		expect(decomposed).not.toBe(decomposed.normalize("NFC"));
		expect(chunk).not.toContain(decomposed);
		expect(chunk?.normalize("NFC")).toBe(chunk);
	});

	it("never leaves half a surrogate pair when splitting emoji and astral characters", async () => {
		for (const body of ["😀".repeat(3000), `a${"𝔘😀".repeat(1501)}`]) {
			const chunks = await chunkMarkdown(body);
			expect(chunks.length).toBeGreaterThan(1);
			expect(chunks.some((c) => LONE_SURROGATE.test(c))).toBe(false);
			expect(withinLimit(chunks)).toBe(true);
		}
	});
});
