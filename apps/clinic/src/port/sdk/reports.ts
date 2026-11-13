import { PortError } from "../port";
import type { Report, ReportQuery } from "../report-schema";
import type { AppSlug } from "../schema";
import type { SdkContext } from "./context";

/**
 * Statistics. The scheduling service's reports routes are being added by another change; this is the ONE place that maps
 * the port's `report` onto them. Until the contract names the route, the call refuses `unavailable`: the screen shows
 * its error state, never invented numbers.
 */
export function reportsGroup(_sdk: SdkContext) {
	return {
		report: (_app: AppSlug, _query: ReportQuery): Promise<Report> =>
			Promise.reject(new PortError("unavailable", "the service does not serve reports yet")),
	};
}
