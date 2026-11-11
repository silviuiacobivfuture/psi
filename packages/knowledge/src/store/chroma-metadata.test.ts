import { describe, expect, it } from "vitest";
import { decodeChromaMetadata, encodeChromaMetadata } from "./chroma-metadata";
import type { ChunkMetadata } from "./metadata";

const chunk: ChunkMetadata = {
	entryId: "psizone-ro-sedinta",
	brand: "psizone",
	locale: "ro",
	kind: "clinical",
	status: "published",
	title: "Ședință de evaluare — „țară” și școală",
	url: "/copii/adhd",
	reviewedBy: "Dr. Ștefan Țărnă",
	reviewedAt: "2026-10-01",
	chunk: 2,
	text: "Îngrijire, încredere: ă â î ș ț Ă Â Î Ș Ț.",
};

describe("the Chroma metadata codec", () => {
	it("round-trips a chunk, diacritics included, as plain strings Chroma accepts", () => {
		const stored = encodeChromaMetadata(chunk);
		expect(Object.values(stored).every((v) => typeof v === "string")).toBe(true);
		expect(stored.entryId).toBe(chunk.entryId);
		expect(decodeChromaMetadata(stored)).toEqual(chunk);
	});

	it("keeps null review fields null (Chroma would drop a null value)", () => {
		const unreviewed = {
			...chunk,
			kind: "operational" as const,
			reviewedBy: null,
			reviewedAt: null,
		};
		expect(decodeChromaMetadata(encodeChromaMetadata(unreviewed))).toEqual(unreviewed);
	});

	it("refuses a row without a record", () => {
		expect(decodeChromaMetadata({ entryId: "a", brand: "psizone", locale: "ro" })).toBeNull();
	});

	it("refuses a row that is not an object", () => {
		expect(decodeChromaMetadata(null)).toBeNull();
		expect(decodeChromaMetadata("record")).toBeNull();
	});

	it("refuses a record that is not JSON", () => {
		expect(decodeChromaMetadata({ ...encodeChromaMetadata(chunk), record: "{nope" })).toBeNull();
	});

	it("refuses a record that is not a chunk", () => {
		const stored = encodeChromaMetadata({ entryId: "a", brand: "psizone", locale: "ro" });
		expect(decodeChromaMetadata(stored)).toBeNull();
	});

	it("refuses a row whose copied entryId disagrees with its record", () => {
		expect(decodeChromaMetadata({ ...encodeChromaMetadata(chunk), entryId: "other" })).toBeNull();
	});

	it("refuses a row whose copied brand disagrees with its record", () => {
		expect(decodeChromaMetadata({ ...encodeChromaMetadata(chunk), brand: "hemisync" })).toBeNull();
	});

	it("refuses a row whose copied locale disagrees with its record", () => {
		expect(decodeChromaMetadata({ ...encodeChromaMetadata(chunk), locale: "en" })).toBeNull();
	});
});
