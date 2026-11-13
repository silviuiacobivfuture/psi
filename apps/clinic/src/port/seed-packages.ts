import { addDays } from "../lib/dates";
import {
	type Appointment,
	appointmentDefaults,
	type Client,
	type Column,
	type Package,
	type Payment,
	type Service,
} from "./schema";

const RECEPTION = "Recepție Exemplu";

function payment(id: string, date: string, amountBani: number, method: Payment["method"]): Payment {
	return { id, date, amountBani, method, recordedBy: RECEPTION };
}

/** The sessions each seeded package has already drawn, and how many of those were no-shows. */
const HISTORY: ReadonlyArray<{ used: number; noShows: number }> = [
	{ used: 6, noShows: 1 },
	{ used: 4, noShows: 0 },
	{ used: 10, noShows: 2 },
	{ used: 1, noShows: 0 },
	{ used: 3, noShows: 0 },
	{ used: 5, noShows: 1 },
];

/**
 * Six synthetic packages with a ledger and a history of linked past sessions (weekly, before the
 * calendar's own window), and the client's upcoming sessions linked too. Pushes the history into
 * `appointments`; draws no random numbers, so the rest of the seed is unchanged.
 */
export function seedPackages(
	live: ReadonlyArray<Client>,
	services: ReadonlyArray<Service>,
	columns: ReadonlyArray<Column>,
	appointments: Appointment[],
	today: string,
): Package[] {
	const person = columns.find((c) => c.kind === "person");
	const service = services[0];
	const packages: Package[] = live.slice(0, 6).map((c, i) => {
		const ten = i % 2 === 0;
		const paid = i % 4 === 0 ? 135000 : i % 4 === 1 ? 35000 : 0;
		return {
			id: `k${i + 1}`,
			clientId: c.id,
			name: ten ? "Abonament 10 ședințe" : "Abonament 5 ședințe",
			sessions: ten ? 10 : 5,
			bonus: i % 3 === 0 ? 1 : 0,
			totalBani: ten ? 135000 : 70000,
			note: "",
			payments:
				paid === 135000
					? [
							payment(`p${i + 1}a`, addDays(today, -40), 90000, "cash"),
							payment(`p${i + 1}b`, addDays(today, -21), 45000, "card"),
						]
					: paid === 0
						? []
						: [payment(`p${i + 1}a`, addDays(today, -35), paid, "transfer")],
		};
	});
	for (const [i, pkg] of packages.entries()) {
		const h = HISTORY[i];
		if (h === undefined || person === undefined || service === undefined) continue;
		for (let k = 0; k < h.used; k++) {
			appointments.push({
				id: `h${i + 1}-${k + 1}`,
				date: addDays(today, -7 * (h.used - k) - 3),
				startMin: 10 * 60,
				durationMin: service.durationMin,
				columnId: person.id,
				clientId: pkg.clientId,
				title: null,
				serviceId: service.id,
				status: k < h.noShows ? "no-show" : "attended",
				note: "",
				...appointmentDefaults(),
				packageId: pkg.id,
			});
		}
		let used = h.used;
		const capacity = pkg.sessions + pkg.bonus;
		for (const a of appointments) {
			if (
				a.clientId !== pkg.clientId ||
				a.packageId !== null ||
				a.title !== null ||
				a.status === "cancelled"
			)
				continue;
			const consumes = a.status === "attended" || a.status === "no-show";
			if (consumes && used >= capacity) continue;
			if (consumes) used += 1;
			a.packageId = pkg.id;
		}
	}
	return packages;
}
