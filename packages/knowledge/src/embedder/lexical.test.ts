import { describe, expect, it } from "vitest";
import { createLexicalEmbedder, LEXICAL_DIMENSION, lexicalTokens, lexicalVector } from "./lexical";

function cosine(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
	return a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
}

describe("the lexical fallback embedder", () => {
	it("is deterministic: same text, same vector, across calls and instances", async () => {
		const text = "Sună-ne la telefon: 0748 017 752.";
		const [a] = await createLexicalEmbedder().embed([text]);
		const [b] = await createLexicalEmbedder().embed([text]);
		expect(a).toEqual(b);
		expect(lexicalVector(text)).toEqual(a);
	});

	it("pins a known vector so the hash never drifts silently", () => {
		const v = lexicalVector("telefon", 16);
		const nonZero = v.map((x, i) => [i, Math.round(x * 1e6) / 1e6]).filter(([, x]) => x !== 0);
		expect(nonZero).toMatchSnapshot();
	});

	it("gives unit-length vectors of the fixed dimension, and zero for stop words only", async () => {
		const [v, empty] = await createLexicalEmbedder().embed(["Programare pentru copii", "și de la"]);
		expect(v).toHaveLength(LEXICAL_DIMENSION);
		expect(Math.sqrt(cosine(v ?? [], v ?? []))).toBeCloseTo(1, 6);
		expect(empty?.every((x) => x === 0)).toBe(true);
	});

	it("folds case and diacritics (ș and ş, ț and ţ, decomposed or not)", () => {
		expect(lexicalTokens(`Ședință ŞEDINŢĂ ${"ședință".normalize("NFD")}`)).toEqual([
			"sedinta",
			"sedinta",
			"sedinta",
		]);
	});

	it("scores word overlap: inflected forms match, unrelated text does not", () => {
		const q = lexicalVector("telefonul");
		const near = lexicalVector("Ne poți suna la telefon.");
		const far = lexicalVector("Integrare senzorială pentru copii.");
		expect(cosine(q, near)).toBeGreaterThan(0.2);
		expect(cosine(q, near)).toBeGreaterThan(cosine(q, far) + 0.15);
	});

	it("names its vector space by dimension and refuses silly dimensions", () => {
		expect(createLexicalEmbedder(256).space).toBe("lex1_256");
		expect(() => createLexicalEmbedder(3)).toThrow();
	});
});
