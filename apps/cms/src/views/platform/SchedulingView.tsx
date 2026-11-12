import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import type { ReactElement } from "react";
import { z } from "zod";
import { brandsFor } from "../../authz/access";
import type { Brand } from "../../authz/types";
import { Calendar } from "../../components/scheduling/Calendar";
import { SchedulingStudio } from "../../components/scheduling/SchedulingStudio";
import { scopeFor } from "../../platform/access";
import { isReady, type SetupState } from "../../platform/scheduling-model";
import { loadSetup } from "../../platform/scheduling-setup";
import { SECTIONS } from "../../platform/sections";
import { schedulingStaff, tenantOf } from "../../platform/services";
import { Shell, sayer } from "../shell";
import { BrandTabs, Flash, muted, param, type Say } from "./parts";
import { FILTER_STATUSES, RequestsTable } from "./SchedulingRequests";

/**
 * /admin/platform/scheduling — the scheduling store through its staff API (Convex): requests
 * (filter, confirm, decline, cancel with an administrative reason), and the setup studio
 * (practitioners, services, weekly hours, days off, and what visitors will see). Viewing needs
 * `calendar_viewer`; changing needs `calendar_manager`. Scheduling never reads the CMS: this page
 * calls scheduling. A tenant with nothing set up opens on the setup, and says what is missing.
 */
const Tab = z.enum(["calendar", "requests", "setup"]).optional().catch(undefined);
const Status = z.enum(FILTER_STATUSES).optional().catch(undefined);

function Tabs({
	brand,
	tab,
	say,
}: {
	brand: string;
	tab: "calendar" | "requests" | "setup";
	say: Say;
}): ReactElement {
	const link = (t: "calendar" | "requests" | "setup", label: string) => (
		<a
			href={`/admin/platform/scheduling?brand=${brand}&tab=${t}`}
			aria-current={tab === t ? "page" : undefined}
			style={{ fontWeight: tab === t ? 700 : 400 }}
		>
			{label}
		</a>
	);
	return (
		<p style={{ display: "flex", gap: "var(--base)" }}>
			{link("calendar", say("scTabCalendar"))}
			{link("requests", say("schedRequests"))}
			{link("setup", say("schedSetup"))}
		</p>
	);
}

/** The setup, or null when the store cannot be read (the page then says it does not answer). */
async function setupOf(
	brand: Brand,
	tenant: string,
	staff: NonNullable<ReturnType<typeof schedulingStaff>>,
): Promise<SetupState | null> {
	try {
		return await loadSetup(staff, brand, tenant);
	} catch {
		return null;
	}
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
	const status = Status.parse(param(props, "status") || undefined);
	const manager = (await brandsFor(req, SECTIONS.scheduling.act)).includes(brand);
	if (staff === null || tenant === null) {
		return shell(
			<>
				<BrandTabs path="/admin/platform/scheduling" brands={brands} brand={brand} />
				<p>{say("notConfigured")}</p>
			</>,
		);
	}
	const setup = await setupOf(brand, tenant, staff);
	// A tenant with nothing set up opens on the setup: that is the one thing to do.
	const tab =
		Tab.parse(param(props, "tab")) ?? (setup !== null && !isReady(setup) ? "setup" : "calendar");
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
	if (setup === null) {
		return shell(
			<>
				{head}
				<p>{say("unreachable")}</p>
			</>,
		);
	}
	if (tab === "calendar") {
		return shell(
			<>
				{head}
				<Calendar key={brand} initial={setup} canEdit={manager} />
			</>,
		);
	}
	if (tab === "setup") {
		return shell(
			<>
				{head}
				<SchedulingStudio key={brand} initial={setup} canEdit={manager} />
			</>,
		);
	}
	try {
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
				{isReady(setup) ? null : (
					<p className="psi-note psi-note--lock">
						{say("scEmpty")}.{" "}
						<a href={`/admin/platform/scheduling?brand=${brand}&tab=setup`}>{say("scEmptyLink")}</a>
					</p>
				)}
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
					<p>{say("noRequests")}</p>
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
