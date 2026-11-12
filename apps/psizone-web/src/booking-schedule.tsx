import type { ServiceInfo } from "@psi/scheduling";
import { ServiceCards, SlotPicker, type SlotPickerLabels } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { PickerData, PickerView } from "./booking-picker";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { phones } from "./site-settings";

/** What the booking form draws of the schedule: the picker's view, and whether the visitor chose a call. */
export interface Schedule {
	view: PickerView;
	/** The visitor prefers to be called: no times are shown, the callback form stands. */
	callback: boolean;
	/** The service cards (the booking page); the chat and the contact page keep one service. */
	cards: boolean;
}

export function pickerLabels(locale: Locale): SlotPickerLabels {
	const o = at(locale);
	return {
		duration: (minutes) => m.pick_duration({ minutes: String(minutes) }, o),
		chooseDay: m.pick_choose_day({}, o),
		prevWeek: m.pick_prev_week({}, o),
		nextWeek: m.pick_next_week({}, o),
		today: m.pick_today({}, o),
		freeTimes: (count) =>
			count === 1 ? m.pick_free_one({}, o) : m.pick_free_many({ count: String(count) }, o),
		noTimes: m.pick_no_times({}, o),
		parts: {
			morning: m.pick_part_morning({}, o),
			afternoon: m.pick_part_afternoon({}, o),
			evening: m.pick_part_evening({}, o),
		},
		mode: m.pick_mode({}, o),
		modes: { onsite: m.pick_mode_onsite({}, o), online: m.pick_mode_online({}, o) },
		practitioner: m.pick_practitioner({}, o),
		anyone: m.pick_anyone({}, o),
		selected: (when, who, mode) => m.pick_selected({ when, who, mode: mode.toLowerCase() }, o),
		nothingSelected: m.pick_nothing({}, o),
		taken: m.pick_taken({}, o),
		emptyWeek: m.pick_empty_week({}, o),
		jumpToNext: (range) => m.pick_jump({ range }, o),
	};
}

/** The service's name in the visitor's language: the team's, else a readable fallback. */
export function serviceTitle(service: ServiceInfo, locale: Locale): string {
	if (service.name !== undefined) return service.name[locale];
	return service.slug === "evaluation"
		? m.guide_booking_service_evaluation({}, at(locale))
		: service.slug;
}

function modesText(service: ServiceInfo, locale: Locale): string {
	const o = at(locale);
	return service.modes
		.map((mode) => (mode === "online" ? m.pick_mode_online({}, o) : m.pick_mode_onsite({}, o)))
		.join(" · ");
}

/** The route every picker change posts the form to. */
export function pickerRoute(locale: Locale): string {
	return `${base(locale)}/programare/ore`;
}

/** An expression that posts the whole form to the picker route, with `query` choices on top. */
export function postPicker(locale: Locale, query: Readonly<Record<string, string>> = {}): string {
	const qs = new URLSearchParams(query).toString();
	return `@post('${pickerRoute(locale)}${qs === "" ? "" : `?${qs}`}', {contentType: 'form'})`;
}

function Unavailable({ locale }: { locale: Locale }): JSX.Element {
	return (
		<div class="space-y-3 rounded-lg border border-line p-5">
			<p class="text-body text-ink">{m.pick_unavailable({}, at(locale))}</p>
			<ul class="flex flex-wrap gap-x-5 gap-y-1">
				{phones().map((p) => (
					<li>
						<a class="font-mono text-title text-ink underline" href={`tel:${p.tel}`}>
							{p.display}
						</a>
					</li>
				))}
			</ul>
		</div>
	);
}

function Picker({
	locale,
	id,
	data,
	compact,
}: {
	locale: Locale;
	id: string;
	data: PickerData;
	compact: boolean;
}): JSX.Element {
	const { prevWeek, nextWeek, nextWithTimes } = data;
	return (
		<SlotPicker
			id={id}
			locale={locale}
			variant={compact ? "compact" : "full"}
			labels={pickerLabels(locale)}
			service={{
				name: serviceTitle(data.service, locale),
				durationMinutes: data.service.durationMinutes,
			}}
			timeZone={data.timeZone}
			today={data.today}
			week={data.week}
			slots={data.slots}
			day={data.day}
			{...(data.selected === undefined ? {} : { selected: data.selected })}
			mode={data.mode}
			modes={data.service.modes}
			who={data.who}
			practitioners={data.service.practitioners}
			taken={data.taken}
			{...(nextWithTimes === undefined ? {} : { nextWithTimes })}
			actions={{
				change: postPicker(locale),
				...(prevWeek === undefined ? {} : { prev: postPicker(locale, { week: prevWeek }) }),
				...(nextWeek === undefined ? {} : { next: postPicker(locale, { week: nextWeek }) }),
				...(nextWithTimes === undefined
					? {}
					: { jump: postPicker(locale, { week: nextWithTimes }) }),
			}}
		/>
	);
}

/**
 * The top of the booking form when scheduling is on: the service (cards on the booking page), the
 * picker, and the way to a call instead. When the store cannot be read, the callback form stands
 * with the centre's phones and no error text.
 */
export function ScheduleSection({
	locale,
	id,
	schedule,
	compact,
}: {
	locale: Locale;
	id: string;
	schedule: Schedule;
	compact: boolean;
}): JSX.Element {
	const o = at(locale);
	const { view } = schedule;
	if (view.kind === "unavailable") return <Unavailable locale={locale} />;
	const { data } = view;
	return (
		<div class="space-y-6">
			<input type="hidden" name="shown" value={data.service.slug} />
			<input type="hidden" name="cards" value={schedule.cards ? "1" : ""} />
			<input type="hidden" name="callback" value={schedule.callback ? "1" : ""} />
			{schedule.cards && data.services.length > 1 ? (
				<ServiceCards
					id={id}
					legend={m.pick_service({}, o)}
					selected={data.service.slug}
					duration={pickerLabels(locale).duration}
					change={postPicker(locale)}
					services={data.services.map((s) => ({
						slug: s.slug,
						name: serviceTitle(s, locale),
						durationMinutes: s.durationMinutes,
						modes: modesText(s, locale),
					}))}
				/>
			) : (
				<input type="hidden" name="service" value={data.service.slug} />
			)}
			{schedule.callback ? null : <Picker locale={locale} id={id} data={data} compact={compact} />}
			<button
				type="button"
				class="pz-slots__switch"
				data-on:click__prevent={postPicker(locale, { callback: schedule.callback ? "0" : "1" })}
			>
				{schedule.callback ? m.pick_back({}, o) : m.pick_callback({}, o)}
			</button>
		</div>
	);
}
