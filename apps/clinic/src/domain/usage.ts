import type { Appointment, Package } from "../port/schema";

/** What was paid: the sum of the ledger. There is no other source. */
export function paidBani(pkg: Pick<Package, "payments">): number {
	return pkg.payments.reduce((sum, p) => sum + p.amountBani, 0);
}

/** A session is drawn from the package once it was attended or the client did not come. */
export function consumesSession(status: Appointment["status"]): boolean {
	return status === "attended" || status === "no-show";
}

export interface Usage {
	/** Sessions used, derived from the linked appointments. */
	used: number;
	/** Regular sessions used first, bonus after. */
	usedRegular: number;
	usedBonus: number;
	sessions: number;
	bonus: number;
	left: number;
	/** Sessions used beyond what the package holds; 0 when within it. */
	overBy: number;
	/** Linked appointments, oldest first, cancelled ones left out. */
	timeline: ReadonlyArray<Appointment>;
	next: Appointment | null;
}

/** "Used" is derived, never typed: the appointments linked to the package say how much of it is gone. */
export function packageUsage(
	pkg: Pick<Package, "id" | "sessions" | "bonus">,
	appointments: ReadonlyArray<Appointment>,
	today: string,
): Usage {
	const timeline = appointments
		.filter((a) => a.packageId === pkg.id && a.status !== "cancelled")
		.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
	const used = timeline.filter((a) => consumesSession(a.status)).length;
	const usedRegular = Math.min(used, pkg.sessions);
	const usedBonus = Math.min(used - usedRegular, pkg.bonus);
	const next =
		timeline.find(
			(a) => a.date >= today && (a.status === "confirmed" || a.status === "requested"),
		) ?? null;
	return {
		used,
		usedRegular,
		usedBonus,
		sessions: pkg.sessions,
		bonus: pkg.bonus,
		left: Math.max(0, pkg.sessions + pkg.bonus - used),
		overBy: Math.max(0, used - (pkg.sessions + pkg.bonus)),
		timeline,
		next,
	};
}
