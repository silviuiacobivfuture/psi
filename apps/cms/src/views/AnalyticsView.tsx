import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import type { ReactElement } from "react";
import { z } from "zod";
import { buildReport, type Report, Row } from "../analytics/report";
import { cell, Shell, sayer } from "./shell";

/**
 * /admin/analytics — reading and the guide over the last 30 days, from the daily counters, in the
 * brands this person may read. Headlines are stat tiles; rankings are one-series bars beside
 * their numbers (the table IS the accessible view); the marks use Payload's theme tokens, so
 * dark mode follows the admin's.
 */
const DAYS = 30;
const Page = z.object({ docs: z.array(Row) });
const INK = "var(--theme-elevation-800)";
const TRACK = "var(--theme-elevation-100)";

async function load(props: AdminViewServerProps): Promise<Report> {
	const { req } = props.initPageResult;
	const since = new Date(Date.now() - DAYS * 86_400_000).toISOString().slice(0, 10);
	const page = Page.parse(
		await req.payload.find({
			collection: "analytics-daily",
			where: { day: { greater_than_equal: since } },
			pagination: false,
			depth: 0,
			overrideAccess: false,
			user: req.user,
			req,
		}),
	);
	return buildReport(page.docs, since);
}

const pct = (r: number | null): string => (r === null ? "—" : `${Math.round(r * 100)}%`);

function Tile({ label, value }: { label: string; value: string }): ReactElement {
	return (
		<div
			style={{
				border: `1px solid ${TRACK}`,
				borderRadius: 8,
				padding: "var(--base)",
				minWidth: 160,
			}}
		>
			<div style={{ fontSize: "0.85em", color: "var(--theme-elevation-600)" }}>{label}</div>
			<div style={{ fontSize: "2em", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
				{value}
			</div>
		</div>
	);
}

/** A thin horizontal bar, rounded at its data end, anchored at zero. */
function Bar({ value, max, title }: { value: number; max: number; title: string }): ReactElement {
	const w = max === 0 ? 0 : Math.max(2, (value / max) * 100);
	return (
		<div
			title={title}
			style={{ background: TRACK, borderRadius: 4, height: 8, width: "100%", minWidth: 120 }}
		>
			<div style={{ background: INK, borderRadius: "0 4px 4px 0", height: 8, width: `${w}%` }} />
		</div>
	);
}

function Ranked({
	title,
	rows,
	unit,
}: {
	title: string;
	rows: ReadonlyArray<{ label: string; value: number; extra?: string }>;
	unit: string;
}): ReactElement {
	const max = Math.max(0, ...rows.map((r) => r.value));
	return (
		<section style={{ marginTop: "calc(var(--base) * 2)" }}>
			<h3>{title}</h3>
			<table style={{ width: "100%", borderCollapse: "collapse" }}>
				<tbody>
					{rows.map((r) => (
						<tr key={r.label}>
							<td style={{ ...cell, width: "40%" }}>{r.label}</td>
							<td style={{ ...cell, width: "40%", verticalAlign: "middle" }}>
								<Bar value={r.value} max={max} title={`${r.label}: ${r.value} ${unit}`} />
							</td>
							<td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
								{r.value}
							</td>
							{r.extra !== undefined ? (
								<td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
									{r.extra}
								</td>
							) : null}
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}

export async function AnalyticsView(props: AdminViewServerProps): Promise<ReactElement> {
	const say = sayer(props);
	// Payload renders a custom view for anyone: this one is for signed-in people only.
	if (!props.initPageResult.req.user) redirect("/admin/login?redirect=%2Fadmin%2Fanalytics");
	const r = await load(props).catch((err: unknown) => {
		props.initPageResult.req.payload.logger.error({ err: String(err) }, "analytics view failed");
		return buildReport([], "");
	});
	const views = say("views").toLowerCase();
	return (
		<Shell props={props} title={say("analyticsTitle")} intro={say("analyticsIntro")}>
			<p style={{ color: "var(--theme-elevation-600)" }}>{say("period")}</p>
			<div
				style={{ display: "flex", flexWrap: "wrap", gap: "var(--base)", marginTop: "var(--base)" }}
			>
				<Tile label={say("views")} value={String(r.totalViews)} />
				<Tile
					label={say("readThrough")}
					value={pct(
						r.totalViews === 0
							? null
							: r.articles.reduce((n, a) => n + a.depth[100], 0) / r.totalViews,
					)}
				/>
				<Tile label={say("guideAsked")} value={String(r.guide.asked)} />
				<Tile label={say("guideUnanswered")} value={String(r.guide.unanswered)} />
			</div>
			{r.totalViews === 0 ? (
				<p style={{ marginTop: "var(--base)" }}>{say("analyticsEmpty")}</p>
			) : null}
			<section style={{ marginTop: "calc(var(--base) * 2)" }}>
				<h3>{say("byArticle")}</h3>
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr>
							<th style={cell}>{say("colTitle")}</th>
							<th style={cell}>{say("colBrand")}</th>
							<th style={{ ...cell, textAlign: "right" }}>{say("views")}</th>
							<th style={cell}>{say("depth")} (25 · 50 · 75 · 100)</th>
							<th style={{ ...cell, textAlign: "right" }}>{say("readThrough")}</th>
						</tr>
					</thead>
					<tbody>
						{r.articles.map((a) => (
							<tr key={`${a.brand}/${a.slug}`}>
								<td style={cell}>{a.slug}</td>
								<td style={cell}>{a.brand}</td>
								<td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
									{a.views}
								</td>
								<td style={{ ...cell, fontVariantNumeric: "tabular-nums" }}>
									{a.depth[25]} · {a.depth[50]} · {a.depth[75]} · {a.depth[100]}
								</td>
								<td style={{ ...cell, textAlign: "right" }}>
									<span title={`${a.depth[100]} / ${a.views}`}>{pct(a.readThrough)}</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
			<Ranked
				title={say("byBrand")}
				unit={views}
				rows={r.brands.map((b) => ({ label: b.brand, value: b.views, extra: pct(b.readThrough) }))}
			/>
			<Ranked
				title={say("topTopics")}
				unit={views}
				rows={r.topics
					.slice(0, 10)
					.map((t) => ({ label: t.topic || say("noData"), value: t.views }))}
			/>
			<Ranked
				title={say("perDay")}
				unit={views}
				rows={r.days.map((d) => ({ label: d.day, value: d.views }))}
			/>
			<section style={{ marginTop: "calc(var(--base) * 2)" }}>
				<h3>{say("guide")}</h3>
				<p>
					{say("guideAsked")}: {r.guide.asked} · {say("guideUnanswered")}: {r.guide.unanswered} (
					{pct(r.guide.asked === 0 ? null : r.guide.unanswered / r.guide.asked)})
				</p>
				<p>
					{say("guideUptake")}: {say("guideOpened")} {r.guide.opened} · {say("guideNudgeShown")}{" "}
					{r.guide.nudgeShown} · {say("guideNudgeClicked")} {r.guide.nudgeClicked} (
					{pct(r.guide.nudgeShown === 0 ? null : r.guide.nudgeClicked / r.guide.nudgeShown)})
				</p>
				<p style={{ color: "var(--theme-elevation-600)" }}>{say("guideNote")}</p>
			</section>
		</Shell>
	);
}
