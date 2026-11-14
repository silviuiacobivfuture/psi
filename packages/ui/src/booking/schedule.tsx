/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { ServiceInfo } from "@psi/scheduling";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ServiceCards, SlotPicker } from "../components/slot-picker";
import type { PickerData, PickerView } from "./picker";
import type { BookingEnv } from "./types";

/** What the booking form draws of the schedule: the picker's view, and whether the visitor chose a call. */
export interface Schedule {
	view: PickerView;
	/** The visitor prefers to be called: no times are shown, the callback form stands. */
	callback: boolean;
	/** The service cards (the booking page); the chat and the contact page keep one service. */
	cards: boolean;
	/**
	 * The guide's offer, on the organisation's terms: the picker shows no time past `horizon` days from now, and with
	 * `noCallback` the way to a call instead is not offered. Both travel with the form (empty: the page's own).
	 */
	horizon: string;
	noCallback: boolean;
}

/** The service's name in the visitor's language: the team's, else the site's readable fallback. */
export function serviceTitle(service: ServiceInfo, env: BookingEnv): string {
	return service.name !== undefined
		? service.name[env.locale]
		: env.copy.serviceFallback(service.slug);
}

function modesText(service: ServiceInfo, env: BookingEnv): string {
	const { modeOnsite, modeOnline } = env.copy.picker;
	return service.modes.map((mode) => (mode === "online" ? modeOnline : modeOnsite)).join(" · ");
}

/** An expression that posts the whole form to the picker route, with `query` choices on top. */
export function postPicker(env: BookingEnv, query: Readonly<Record<string, string>> = {}): string {
	const qs = new URLSearchParams(query).toString();
	return `@post('${env.routes.slots}${qs === "" ? "" : `?${qs}`}', {contentType: 'form'})`;
}

function Phones({ env }: { env: BookingEnv }): JSX.Element | null {
	return env.phones.length === 0 ? null : (
		<ul class="flex flex-wrap gap-x-5 gap-y-1">
			{env.phones.map((p) => (
				<li>
					<a class="font-mono text-title text-ink underline" href={`tel:${p.tel}`}>
						{p.display}
					</a>
				</li>
			))}
		</ul>
	);
}

function Unavailable({ env }: { env: BookingEnv }): JSX.Element {
	return (
		<div class="space-y-3 rounded-lg border border-line p-5">
			<p class="text-body text-ink">{env.copy.picker.unavailable}</p>
			<Phones env={env} />
		</div>
	);
}

type PausedView = Extract<PickerView, { kind: "paused" }>;

/** When booking opens again, in the visitor's language and the clinic's zone. */
function untilText(env: BookingEnv, until: number, timeZone: string): string {
	return new Intl.DateTimeFormat(env.locale === "ro" ? "ro-RO" : "en-GB", {
		timeZone,
		weekday: "long",
		day: "numeric",
		month: "long",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(until));
}

/**
 * Online booking is paused: the clinic's own words stand where the times would, with the phones, and the way the visitor
 * can still reach the team (the callback form below, while the pause keeps it open). The service cards stay when it is
 * one service that is paused, so another can be chosen.
 */
function Paused({
	env,
	id,
	view,
	schedule,
}: {
	env: BookingEnv;
	id: string;
	view: PausedView;
	schedule: Schedule;
}): JSX.Element {
	const words = env.copy.picker.paused;
	const { pause, service } = view;
	const cards = schedule.cards && view.services.length > 1 && service !== undefined;
	return (
		<div class="space-y-6">
			{service === undefined ? null : <input type="hidden" name="shown" value={service.slug} />}
			<input type="hidden" name="cards" value={schedule.cards ? "1" : ""} />
			{cards ? (
				<ServiceCards
					id={id}
					legend={env.copy.picker.service}
					selected={service.slug}
					duration={env.copy.picker.slots.duration}
					change={postPicker(env)}
					services={view.services.map((s) => ({
						slug: s.slug,
						name: serviceTitle(s, env),
						durationMinutes: s.durationMinutes,
						modes: modesText(s, env),
					}))}
				/>
			) : service === undefined ? null : (
				<input type="hidden" name="service" value={service.slug} />
			)}
			<section
				class="space-y-3 rounded-lg border border-line p-5"
				role="status"
				aria-labelledby={`${id}-paused`}
				data-booking-paused={pause.level}
			>
				<h3 id={`${id}-paused`} class="text-title text-ink">
					{words.title}
				</h3>
				<p class="text-body text-ink">{pause.message[env.locale]}</p>
				{pause.until === undefined ? null : (
					<p class="text-body-sm text-ink-muted">
						{words.until(untilText(env, pause.until, view.timeZone))}
					</p>
				)}
				<Phones env={env} />
				<p class="text-body-sm text-ink-muted">
					{pause.callbacksOpen ? words.callback : words.call}
				</p>
			</section>
		</div>
	);
}

function Picker({
	env,
	id,
	data,
	compact,
}: {
	env: BookingEnv;
	id: string;
	data: PickerData;
	compact: boolean;
}): JSX.Element {
	const { prevWeek, nextWeek, nextWithTimes } = data;
	return (
		<SlotPicker
			id={id}
			locale={env.locale}
			variant={compact ? "compact" : "full"}
			labels={env.copy.picker.slots}
			service={{
				name: serviceTitle(data.service, env),
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
				change: postPicker(env),
				...(prevWeek === undefined ? {} : { prev: postPicker(env, { week: prevWeek }) }),
				...(nextWeek === undefined ? {} : { next: postPicker(env, { week: nextWeek }) }),
				...(nextWithTimes === undefined ? {} : { jump: postPicker(env, { week: nextWithTimes }) }),
			}}
		/>
	);
}

/**
 * The top of the booking form when scheduling is on: the service (cards on the booking page), the
 * picker, and the way to a call instead. When the store cannot be read, or has no services for the
 * site, the callback form stands with the site's phones (when it has any) and no error text.
 */
export function ScheduleSection({
	env,
	id,
	schedule,
	compact,
}: {
	env: BookingEnv;
	id: string;
	schedule: Schedule;
	compact: boolean;
}): JSX.Element {
	const { view } = schedule;
	if (view.kind === "unavailable") return <Unavailable env={env} />;
	if (view.kind === "paused") return <Paused env={env} id={id} view={view} schedule={schedule} />;
	const { data } = view;
	return (
		<div class="space-y-6">
			<input type="hidden" name="shown" value={data.service.slug} />
			<input type="hidden" name="cards" value={schedule.cards ? "1" : ""} />
			<input type="hidden" name="callback" value={schedule.callback ? "1" : ""} />
			<input type="hidden" name="horizon" value={schedule.horizon} />
			<input type="hidden" name="nocall" value={schedule.noCallback ? "1" : ""} />
			{schedule.cards && data.services.length > 1 ? (
				<ServiceCards
					id={id}
					legend={env.copy.picker.service}
					selected={data.service.slug}
					duration={env.copy.picker.slots.duration}
					change={postPicker(env)}
					services={data.services.map((s) => ({
						slug: s.slug,
						name: serviceTitle(s, env),
						durationMinutes: s.durationMinutes,
						modes: modesText(s, env),
					}))}
				/>
			) : (
				<input type="hidden" name="service" value={data.service.slug} />
			)}
			{schedule.callback ? null : <Picker env={env} id={id} data={data} compact={compact} />}
			{schedule.noCallback ? null : (
				<button
					type="button"
					class="pz-slots__switch"
					data-on:click__prevent={postPicker(env, {
						callback: schedule.callback ? "0" : "1",
					})}
				>
					{schedule.callback ? env.copy.picker.back : env.copy.picker.callback}
				</button>
			)}
		</div>
	);
}
