import type { Access } from "payload";
import { brandsFor } from "./access";
import { BRANDS } from "./types";

/**
 * Read access for server-written rows that carry a plain `brand` text (the editorial log, the
 * reading counters): signed in, and only the brands this person may read.
 */
export const readByBrandField: Access = async ({ req }) => {
	const brands = await brandsFor(req, "read");
	if (brands.length === 0) return false;
	if (brands.length === BRANDS.length) return true;
	return { brand: { in: brands } };
};
