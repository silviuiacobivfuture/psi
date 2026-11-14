import { describe, expect, it } from "vitest";
import { CATALOG_MAX, LIST_MAX, PER_CLIENT_MAX, within } from "../../convex/bounded";

/** A query that holds `n` rows and remembers how many it was asked for. */
const holding = (n: number) => {
	const asked: number[] = [];
	return {
		asked,
		query: {
			take: (k: number) => {
				asked.push(k);
				return Promise.resolve(Array.from({ length: Math.min(n, k) }, (_, i) => i));
			},
		},
	};
};

describe("a bounded read answers all of a list or refuses it, never part of it", () => {
	it("answers every row up to the bound, asking for one more than it", async () => {
		for (const n of [0, 1, 7, 10]) {
			const q = holding(n);
			expect(await within(q.query, 10)).toHaveLength(n);
			expect(q.asked).toEqual([11]);
		}
	});

	it("says there are too many at one past the bound", async () => {
		expect(await within(holding(11).query, 10)).toBeUndefined();
		expect(await within(holding(5_000).query, 10)).toBeUndefined();
	});

	it("every bound fits one Convex transaction (16,384 documents), with room for what else it reads", () => {
		for (const max of [LIST_MAX, CATALOG_MAX, PER_CLIENT_MAX]) expect(max + 1).toBeLessThan(16_384);
	});
});
