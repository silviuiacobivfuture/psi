import { figuresFor, snapshotFor } from "../domain/report";
import type { Report, ReportQuery } from "./report-schema";
import type { AppData } from "./seed";

/** The fake's statistics: the same figures a service would compute, from the synthetic rows. */
export function reportOf(d: AppData, today: string, q: ReportQuery): Report {
	const input = {
		today,
		appointments: d.appointments,
		clients: d.clients,
		services: d.services,
		columns: d.columns,
		packages: d.packages,
		requests: d.requests,
		roster: d.roster,
	};
	return {
		snapshot: snapshotFor(input),
		current: figuresFor(input, q.from, q.to, q.personId),
		previous:
			q.compare === undefined ? null : figuresFor(input, q.compare.from, q.compare.to, q.personId),
	};
}
