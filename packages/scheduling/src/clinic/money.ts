export const PAYMENT_METHODS = ["cash", "card", "transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Money is whole bani (1/100 RON) everywhere, never a float. Reads a number or a numeric string
 * (a decimal comma is accepted) and returns bani, or undefined when it is not a finite,
 * non-negative amount.
 */
export function toMinor(raw: number | string | null | undefined): number | undefined {
	if (raw === null || raw === undefined) return undefined;
	const value = typeof raw === "number" ? raw : Number(raw.trim().replace(",", "."));
	if (!Number.isFinite(value) || value < 0 || raw === "") return undefined;
	return Math.round(value * 100);
}

/** A payment-ledger line: positive is money in, negative a refund. Never zero. */
export interface LedgerLine {
	amountMinor: number;
}

/** What has been paid and what is left of a price, from the ledger alone (no stored counter). */
export function moneyOf(
	priceMinor: number,
	ledger: ReadonlyArray<LedgerLine>,
): { paidMinor: number; remainingMinor: number; overpaidMinor: number } {
	const paidMinor = ledger.reduce((sum, line) => sum + line.amountMinor, 0);
	return {
		paidMinor,
		remainingMinor: Math.max(0, priceMinor - paidMinor),
		overpaidMinor: Math.max(0, paidMinor - priceMinor),
	};
}
