import { parseMoney } from "./money";

/** A whole count as typed: empty is 0, anything that is not 0..999 digits is refused (never NaN). */
export function parseCount(input: string): number | null {
	const t = input.trim();
	if (t === "") return 0;
	return /^\d{1,3}$/.test(t) ? Number(t) : null;
}

/** An amount as typed for a price: empty is 0, partial input ("1,") reads as what it is so far. */
export function parseAmountOrZero(input: string): number | null {
	return input.trim() === "" ? 0 : parseMoney(input);
}

/** Any number that would reach the page is finite and whole, or it is 0. */
export function safeCount(n: number): number {
	return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}
