import type { ControlResult, SiteStatus } from "@psi/cms-client";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import type { ReactElement } from "react";
import type { Brand } from "../../authz/types";
import { scopeFor } from "../../platform/access";
import { type Questions, questionsSince, today } from "../../platform/questions";
import { pendingReviews } from "../../platform/reviews";
import { SECTIONS } from "../../platform/sections";
import { controlFor, schedulingStaff, tenantOf } from "../../platform/services";
import { cell, Shell, sayer } from "../shell";
import {
	Badge,
	BRAND_NAMES,
	muted,
	problemWord,
	type Say,
	StatCard,
	stateWord,
	Table,
} from "./parts";

/**
 * /admin/platform — each brand's services at a glance, from each service's own status: the site's
 * signed `/__control/status`, the scheduling store's staff API, the review queue, and the guide's
 * question counters every site sends to the CMS. Brands the person may read only; a service that
 * is not configured says so.
 */
type Scheduling = { reachable: boolean | null; today: number | null };

interface BrandRow {
	brand: Brand;
	status: ControlResult<SiteStatus> | null;
	scheduling: Scheduling;
	pending: number;
	questions: Questions;
}

async function schedulingFor(brand: Brand): Promise<Scheduling> {
	const staff = schedulingStaff();
	const tenant = tenantOf(brand);
	if (staff === null || tenant === null) return { reachable: null, today: null };
	const start = new Date();
	start.setUTCHours(0, 0, 0, 0);
	try {
		// Requested today: the appointments themselves lie ahead (the store caps a span at 62 days).
		const r = await staff.requests({
			tenant,
			from: start.getTime(),
			to: start.getTime() + 62 * 86_400_000,
		});
		if (!r.ok) return { reachable: true, today: 0 };
		const count = r.requests.filter((q) => (q.submittedAt ?? 0) >= start.getTime()).length;
		return { reachable: true, today: count };
	} catch {
		return { reachable: false, today: null };
	}
}

function Row({
	name,
	state,
	detail,
}: {
	name: string;
	state: ReactElement;
	detail: string;
}): ReactElement {
	return (
		<tr>
			<td style={{ ...cell, width: "22%" }}>{name}</td>
			<td style={{ ...cell, width: "22%" }}>{state}</td>
			<td style={{ ...cell, ...muted }}>{detail}</td>
		</tr>
	);
}

function siteRow(say: Say, r: ControlResult<SiteStatus> | null): ReactElement {
	if (r === null) return <Badge state="not_configured" label={say("notConfigured")} />;
	if (!r.ok) {
		return (
			<Badge
				state={r.problem === "not_configured" ? "not_configured" : "error"}
				label={problemWord(say, r.problem)}
			/>
		);
	}
	return <Badge state="on" label={say("siteUp")} />;
}

function schedulingRow(say: Say, brand: Brand, s: Scheduling): ReactElement {
	if (s.reachable === null) {
		return (
			<Badge
				state="not_configured"
				label={tenantOf(brand) === null ? say("notApplicable") : say("notConfigured")}
			/>
		);
	}
	return s.reachable ? (
		<Badge state="on" label={say("siteUp")} />
	) : (
		<Badge state="error" label={say("unreachable")} />
	);
}

function BrandCard({ row, say }: { row: BrandRow; say: Say }): ReactElement {
	const s = row.status?.ok ? row.status.data : null;
	const chunks = s?.knowledge.indexes.reduce((n, i) => n + i.chunks, 0) ?? 0;
	const q = row.questions;
	return (
		<section className="psi-brand-card">
			<h2 style={{ margin: 0, fontFamily: "var(--psi-display)", fontWeight: 400 }}>
				{BRAND_NAMES[row.brand]}
			</h2>
			<div className="psi-cards">
				<StatCard
					label={say("todayQuestions")}
					value={String(q.asked)}
					note={`${q.unanswered} ${say("todayUnanswered")}`}
					href={`/admin/platform/ai?brand=${row.brand}`}
				/>
				<StatCard
					label={say("todayBookings")}
					value={row.scheduling.today === null ? "—" : String(row.scheduling.today)}
					{...(tenantOf(row.brand) === null
						? { note: say("notApplicable") }
						: { href: `/admin/platform/scheduling?brand=${row.brand}` })}
				/>
				<StatCard label={say("pendingReviews")} value={String(row.pending)} href="/admin/review" />
				<StatCard
					label={say("svcKnowledge")}
					value={String(chunks)}
					note={`${say("chunks")} · ${s?.knowledge.indexes.length ?? 0} ${say("indexes")}`}
				/>
			</div>
			<Table head={[say("colService"), say("colState"), say("colDetail")]}>
				<Row
					name={say("svcSite")}
					state={siteRow(say, row.status)}
					detail={
						s === null ? "" : `${say("since")} ${s.startedAt.slice(0, 16).replace("T", " ")} UTC`
					}
				/>
				{s === null ? null : (
					<>
						<Row
							name={say("svcGuide")}
							state={<Badge state={s.guide.state} label={stateWord(say, s.guide.state)} />}
							detail={`${s.guide.model ?? ""} · ${s.guide.hasKey ? say("keySet") : say("keyMissing")}`}
						/>
						<Row
							name={say("svcKnowledge")}
							state={<Badge state={s.knowledge.state} label={stateWord(say, s.knowledge.state)} />}
							detail={
								s.knowledge.embedder === null
									? ""
									: `${s.knowledge.embedder.kind} (${s.knowledge.embedder.model})`
							}
						/>
						<Row
							name={say("svcAccounts")}
							state={<Badge state={s.accounts.state} label={stateWord(say, s.accounts.state)} />}
							detail={s.accounts.storage ?? ""}
						/>
						<Row
							name={say("svcPush")}
							state={<Badge state={s.push.state} label={stateWord(say, s.push.state)} />}
							detail={s.push.reason ?? s.push.storage ?? ""}
						/>
					</>
				)}
				<Row
					name={say("svcScheduling")}
					state={schedulingRow(say, row.brand, row.scheduling)}
					detail=""
				/>
			</Table>
		</section>
	);
}

export async function OverviewView(props: AdminViewServerProps): Promise<ReactElement> {
	const say = sayer(props);
	const { req } = props.initPageResult;
	if (!req.user) redirect("/admin/login?redirect=%2Fadmin%2Fplatform");
	const scope = await scopeFor(req, SECTIONS.overview.view, props.searchParams?.brand);
	const none: Partial<Record<Brand, number>> = {};
	const noQuestions: Partial<Record<Brand, Questions>> = {};
	const [pending, questions] = await Promise.all([
		pendingReviews(req).catch(() => none),
		questionsSince(req, today()).catch(() => noQuestions),
	]);
	const rows: BrandRow[] = await Promise.all(
		scope.brands.map(async (brand) => ({
			brand,
			status: (await controlFor(brand)?.status(String(req.user?.id ?? ""))) ?? null,
			scheduling: await schedulingFor(brand),
			pending: pending[brand] ?? 0,
			questions: questions[brand] ?? { asked: 0, unanswered: 0 },
		})),
	);
	// The chosen brand first: the one the site's /admin link arrived with.
	rows.sort((a, b) => (a.brand === scope.brand ? -1 : b.brand === scope.brand ? 1 : 0));
	return (
		<Shell props={props} title={say("platformTitle")} intro={say("platformIntro")}>
			{rows.length === 0 ? (
				<p>{say("noBrand")}</p>
			) : (
				rows.map((row) => <BrandCard key={row.brand} row={row} say={say} />)
			)}
		</Shell>
	);
}
