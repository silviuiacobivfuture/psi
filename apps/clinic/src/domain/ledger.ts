export type LedgerState = "unpaid" | "partial" | "paid" | "overpaid";

export interface Ledger {
	totalBani: number;
	paidBani: number;
	/** Positive: still owed. Zero: settled. Negative: paid beyond the price (a credit). */
	remainingBani: number;
	state: LedgerState;
}

/** A package's money: the one function the page, its live update and its save all use. */
export function ledger(totalBani: number, paidBani: number): Ledger {
	const remainingBani = totalBani - paidBani;
	const state: LedgerState =
		paidBani === 0 && totalBani > 0
			? "unpaid"
			: remainingBani > 0
				? "partial"
				: remainingBani === 0
					? "paid"
					: "overpaid";
	return { totalBani, paidBani, remainingBani, state };
}

/** Sessions left to use: bonus sessions count; never below zero. */
export function sessionsLeft(sessions: number, bonus: number, used: number): number {
	return Math.max(0, sessions + bonus - used);
}
