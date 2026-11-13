import type { Permission } from "../../permissions/catalogue";

/**
 * The permission each report needs, so the API checks the right key and the reports cannot drift
 * from the catalogue: everything is `reports` + `view` + a field group. Revenue is the only report
 * with money in it and the only one that needs the `money` group; the rest are counts and rates.
 * The API checks this BEFORE calling the query; the queries themselves only read.
 */
export const REPORTS = {
	appointments: "core",
	utilisation: "core",
	rates: "core",
	clients: "core",
	packages: "core",
	funnel: "core",
	ratings: "core",
	blacklistHits: "core",
	revenue: "money",
} as const satisfies Record<string, "core" | "money">;
export type ReportName = keyof typeof REPORTS;

export function permissionOf(report: ReportName): Permission {
	return { resource: "reports", action: "view", scope: "all", fieldGroup: REPORTS[report] };
}
