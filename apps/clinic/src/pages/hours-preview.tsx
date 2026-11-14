import { Banner, Icon } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { addDays, dayLong, hhmm, range } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { AvailabilityPreview, BookableService } from "../port/availability-port";
import { wallOf } from "../port/sdk/time";

/** What the preview shows: the week asked, and the service's free times then (or why there are none to show). */
export type PreviewState =
	| { kind: "none" }
	| { kind: "shown"; preview: AvailabilityPreview }
	| { kind: "failed" };

const href = (person: string, service: string, week: string): string =>
	`/settings/hours?person=${encodeURIComponent(person)}&service=${encodeURIComponent(service)}&week=${week}#preview`;

/**
 * The week as the public site offers it: the same free times, computed by the service's own slot code. Each day stacks
 * on a phone; the service's length is shown, and its step and buffer are the service's (set in Setări → Servicii).
 */
export function Preview({
	locale,
	person,
	services,
	service,
	week,
	state,
}: {
	locale: Locale;
	person: string;
	services: ReadonlyArray<BookableService>;
	service: string;
	week: string;
	state: PreviewState;
}): JSX.Element {
	const o = at(locale);
	const chosen = services.find((s) => s.slug === service);
	const days = range(week, 7);
	return (
		<section class="adm-card adm-stack" id="preview" aria-labelledby="av-preview">
			<h2 class="adm-h2" id="av-preview">
				{m.av_preview_title({}, o)}
			</h2>
			<p class="adm-muted">{m.av_preview_lead({}, o)}</p>
			<form method="get" action="/settings/hours" class="av-dates">
				<input type="hidden" name="person" value={person} />
				<label class="adm-field">
					<span>{m.av_preview_service({}, o)}</span>
					<select class="adm-input" name="service">
						{services.map((s) => (
							<option key={s.slug} value={s.slug} selected={s.slug === service}>
								{s.name}
							</option>
						))}
					</select>
				</label>
				<label class="adm-field">
					<span>{m.av_preview_week({}, o)}</span>
					<input class="adm-input" type="date" name="week" value={week} />
				</label>
				<div class="av-dates__go">
					<button class="adm-btn" type="submit">
						{m.av_preview_show({}, o)}
					</button>
				</div>
			</form>
			{chosen === undefined ? null : (
				<p class="av-note" data-preview-service={chosen.slug}>
					{m.av_preview_duration({ minutes: String(chosen.durationMin) }, o)}{" "}
					{m.av_preview_service_rules({}, o)}{" "}
					<a href="/settings/services">{m.av_preview_services_link({}, o)}</a>
				</p>
			)}
			{state.kind === "failed" ? (
				<Banner tone="error" icon="alert">
					{m.av_preview_failed({}, o)}
				</Banner>
			) : null}
			{state.kind === "shown" && state.preview.paused ? (
				<Banner tone="info" icon="alert">
					<span data-preview-paused>{m.av_preview_paused({}, o)}</span>{" "}
					<a href="/settings/online">{m.av_banner_manage({}, o)}</a>
				</Banner>
			) : null}
			{state.kind === "shown" ? (
				<ol class="av-week" data-preview>
					{days.map((date) => {
						const slots = state.preview.slots.filter(
							(s) => wallOf(s.start, state.preview.timeZone).date === date,
						);
						return (
							<li key={date} class="av-week__day" data-preview-day={date}>
								<strong>{dayLong(locale, date)}</strong>
								{slots.length === 0 ? (
									<span class="adm-muted">{m.av_preview_none({}, o)}</span>
								) : (
									<ul class="av-slots">
										{slots.map((s) => (
											<li key={String(s.start)} class="av-slot" data-slot={String(s.start)}>
												{hhmm(wallOf(s.start, state.preview.timeZone).minutes)}
												{s.modes.length === 1 ? (
													<span class="adm-sr">
														{s.modes[0] === "online"
															? m.av_mode_online({}, o)
															: m.av_mode_onsite({}, o)}
													</span>
												) : null}
											</li>
										))}
									</ul>
								)}
							</li>
						);
					})}
				</ol>
			) : null}
			{service === "" ? null : (
				<nav class="adm-row av-weeknav" aria-label={m.av_preview_weeks({}, o)}>
					<a class="adm-btn adm-btn--ghost" href={href(person, service, addDays(week, -7))}>
						<Icon name="chevron-left" />
						<span>{m.av_preview_prev({}, o)}</span>
					</a>
					<a class="adm-btn adm-btn--ghost" href={href(person, service, addDays(week, 7))}>
						<span>{m.av_preview_next({}, o)}</span>
						<Icon name="chevron-right" />
					</a>
				</nav>
			)}
		</section>
	);
}
