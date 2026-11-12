import type { StaffAvailability, StaffSchedulingClient } from "@psi/scheduling";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import type { ReactElement } from "react";
import { z } from "zod";
import { brandsFor } from "../../authz/access";
import { scopeFor } from "../../platform/access";
import { SECTIONS } from "../../platform/sections";
import { schedulingStaff, type Tenant, tenantOf } from "../../platform/services";
import { Shell, sayer } from "../shell";
import { BrandTabs, Flash, muted, param, type Say } from "./parts";
import { FILTER_STATUSES, RequestsTable } from "./SchedulingRequests";
import { SchedulingSetup } from "./SchedulingSetup";

/**
 * /admin/platform/scheduling — the scheduling store through its staff API (Convex): requests
 * (filter, confirm, decline, cancel with an administrative reason), and the setup (practitioners,
 * services, weekly hours, exceptions). Viewing needs `calendar_viewer`; changing needs
 * `calendar_manager`. Scheduling never reads the CMS: this page calls scheduling.
 */
const Tab = z.enum(["requests", "setup"]).catch("requests");
const Status = z.enum(FILTER_STATUSES).optional().catch(undefined);
type Available = Extract<StaffAvailability, { ok: true }>;

async function setupData(staff: StaffSchedulingClient, tenant: Tenant) {
	const catalog = await staff.catalog({ tenant });
	if (!catalog.ok) return null;
	const fromDate = new Date().toISOString().slice(0, 10);
	const availability = new Map<string, Available | null>();
	await Promise.all(
		catalog.practitioners.map(async (p) => {
			const a = await staff
				.availability({ tenant, practitioner: p.id, fromDate })
				.catch(() => null);
			availability.set(p.id, a?.ok ? a : null);
		}),
	);
	return { catalog, availability };
}

function Tabs({
	brand,
	tab,
	say,
}: {
	brand: string;
	tab: "requests" | "setup";
	say: Say;
}): ReactElement {
	const link = (t: "requests" | "setup", label: string) => (
		<a
			href={`/admin/platform/scheduling?brand=${brand}&tab=${t}`}
			style={{ fontWeight: tab === t ? 700 : 400 }}
		>
			{label}
		</a>
	);
	return (
		<p style={{ display: "flex", gap: "var(--base)" }}>
			{link("requests", say("schedRequests"))}
			{link("setup", say("schedSetup"))}
		</p>
	);
}

export async function SchedulingView(props: AdminViewServerProps): Promise<ReactElement> {
	const say = sayer(props);
	const { req } = props.initPageResult;
	if (!req.user) redirect("/admin/login?redirect=%2Fadmin%2Fplatform%2Fscheduling");
	const scope = await scopeFor(req, SECTIONS.scheduling.view, props.searchParams?.brand);
	const brands = scope.brands.filter((b) => tenantOf(b) !== null);
	const brand =
		scope.brand !== null && brands.includes(scope.brand) ? scope.brand : (brands[0] ?? null);
	const shell = (body: ReactElement) => (
		<Shell props={props} title={say("schedTitle")} intro={say("schedIntro")}>
			{body}
		</Shell>
	);
	if (brand === null) return shell(<p>{say("noBrand")}</p>);
	const tenant = tenantOf(brand);
	const staff = schedulingStaff();
	const tab = Tab.parse(param(props, "tab"));
	const status = Status.parse(param(props, "status") || undefined);
	const manager = (await brandsFor(req, SECTIONS.scheduling.act)).includes(brand);
	const head = (
		<>
			<BrandTabs
				path="/admin/platform/scheduling"
				brands={brands}
				brand={brand}
				extra={`&tab=${tab}`}
			/>
			<Flash props={props} say={say} />
			<Tabs brand={brand} tab={tab} say={say} />
			{manager ? null : <p style={muted}>{say("needManager")}</p>}
		</>
	);
	if (staff === null || tenant === null)
		return shell(
			<>
				{head}
				<p>{say("notConfigured")}</p>
			</>,
		);
	try {
		if (tab === "setup") {
			const data = await setupData(staff, tenant);
			return shell(
				<>
					{head}
					{data === null ? (
						<p>{say("notFound")}</p>
					) : (
						<SchedulingSetup
							brand={brand}
							catalog={data.catalog}
							availability={data.availability}
							manager={manager}
							say={say}
						/>
					)}
				</>,
			);
		}
		const now = Date.now();
		const r = await staff.requests({
			tenant,
			from: now - 7 * 86_400_000,
			to: now + 55 * 86_400_000,
			...(status === undefined ? {} : { statuses: [status] }),
		});
		return shell(
			<>
				{head}
				{r.ok ? (
					<RequestsTable
						brand={brand}
						rows={[...r.requests].sort((a, b) => a.start - b.start)}
						timeZone={r.timeZone}
						manager={manager}
						status={status ?? ""}
						say={say}
					/>
				) : (
					<p>{say("notFound")}</p>
				)}
			</>,
		);
	} catch {
		return shell(
			<>
				{head}
				<p>{say("unreachable")}</p>
			</>,
		);
	}
}
