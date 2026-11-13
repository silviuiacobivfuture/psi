import { Banner, EmptyState, Icon, PageHeader, StatusPill } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import {
	addDays,
	dayShort,
	hhmm,
	IsoDay,
	range,
	todayIso,
	weekdayShort,
	weekStart,
} from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { statusLabel } from "../lib/status";
import { m } from "../paraglide/messages.js";
import type { Column, RosterEntry } from "../port/schema";

function Cell({ e, locale }: { e: RosterEntry | undefined; locale: Locale }): JSX.Element {
	const o = at(locale);
	if (e === undefined || e.kind === "free")
		return <span class="adm-muted">{m.roster_free({}, o)}</span>;
	if (e.kind === "leave")
		return (
			<StatusPill
				status="leave"
				label={`${m.roster_leave({}, o)} · ${statusLabel("leave", locale)}`}
			/>
		);
	if (e.kind === "medical")
		return (
			<StatusPill
				status="medical-leave"
				label={`${m.roster_medical({}, o)} · ${statusLabel("medical-leave", locale)}`}
			/>
		);
	return (
		<StatusPill
			status="confirmed"
			label={m.roster_hours({ from: hhmm(e.fromMin ?? 0), to: hhmm(e.toMin ?? 0) }, o)}
		/>
	);
}

export async function renderRoster(ctx: Ctx, dateParam: string | undefined): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const start = weekStart(IsoDay.catch(todayIso()).parse(dateParam));
	let people: ReadonlyArray<Column> = [];
	let entries: ReadonlyArray<RosterEntry> = [];
	let failed = false;
	try {
		({ people, entries } = await ctx.port.roster(ctx.app, start));
	} catch {
		failed = true;
	}
	const days = range(start, 7);
	return Page({
		ctx,
		current: "roster",
		title: m.roster_title({}, o),
		children: (
			<div class="adm-page">
				<PageHeader title={m.nav_roster({}, o)} />
				<div class="cal-bar">
					<a
						class="adm-iconbtn"
						href={`/roster?date=${addDays(start, -7)}`}
						aria-label={m.prev({}, o)}
					>
						<Icon name="chevron-left" />
					</a>
					<h2 class="cal-bar__title" style="justify-content:center">
						{m.roster_week(
							{ from: dayShort(ctx.locale, start), to: dayShort(ctx.locale, addDays(start, 6)) },
							o,
						)}
					</h2>
					<a
						class="adm-iconbtn"
						href={`/roster?date=${addDays(start, 7)}`}
						aria-label={m.next({}, o)}
					>
						<Icon name="chevron-right" />
					</a>
				</div>
				{failed ? (
					<Banner tone="error" icon="alert">
						<strong>{m.error_title({}, o)}</strong>
						<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
						<a class="adm-btn" href={`/roster?date=${start}`}>
							{m.retry({}, o)}
						</a>
					</Banner>
				) : people.length === 0 ? (
					<EmptyState
						icon="briefcase"
						title={m.roster_empty_title({}, o)}
						text={m.roster_empty_text({}, o)}
					/>
				) : (
					<section class="adm-scroll" tabindex={0} aria-label={m.roster_title({}, o)}>
						<table class="adm-table roster">
							<thead>
								<tr>
									<th scope="col">{m.roster_person({}, o)}</th>
									{days.map((d) => (
										<th key={d} scope="col" aria-current={d === todayIso() ? "date" : undefined}>
											{weekdayShort(ctx.locale, d)}{" "}
											{dayShort(ctx.locale, d).replace(/\D+/g, " ").trim()}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{people.map((p) => (
									<tr key={p.id}>
										<th scope="row">
											<span
												class="adm-dot"
												style={`display:inline-block;margin-right:8px;background:var(--cal-${p.colour})`}
											/>
											{p.name}
										</th>
										{days.map((d) => (
											<td key={d}>
												<Cell
													e={entries.find((e) => e.personId === p.id && e.date === d)}
													locale={ctx.locale}
												/>
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</section>
				)}
			</div>
		),
	});
}
