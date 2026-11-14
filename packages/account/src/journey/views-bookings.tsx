/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { Button, StatusBadge } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { JourneyKey, Say } from "./labels";
import type { FreeTime, OwnBooking } from "./ports";
import { JOURNEY_PAGES, Section, when } from "./views-shell";

const STATUS_KEY: Readonly<Record<string, JourneyKey>> = {
	requested: "account_status_requested",
	confirmed: "account_status_confirmed",
	cancelled: "account_status_cancelled",
	declined: "account_status_declined",
};

const open = (b: OwnBooking): boolean => b.status === "requested" || b.status === "confirmed";

/** The id a route names a booking by, kept safe for a path segment. */
export const bookingPath = (base: string, id: string, rest = ""): string =>
	`${base}${JOURNEY_PAGES.bookings}/${encodeURIComponent(id)}${rest}`;

function BookingRow({
	say,
	base,
	locale,
	b,
	upcoming,
}: {
	say: Say;
	base: string;
	locale: "ro" | "en";
	b: OwnBooking;
	upcoming: boolean;
}): JSX.Element {
	const facts = [
		say(b.mode === "online" ? "account_mode_online" : "account_mode_onsite"),
		...(b.practitionerName === undefined ? [] : [b.practitionerName]),
		`${say("account_bookings_reference")} ${b.reference}`,
	].join(" · ");
	return (
		<li class="flex flex-col gap-3 py-4" data-reference={b.reference} data-booking={b.id}>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0 flex-1">
					<p class="text-body text-ink">{when(locale, b.start)}</p>
					<p class="text-body-sm text-ink-muted break-words">{facts}</p>
				</div>
				<StatusBadge
					tone={
						b.status === "confirmed" ? "success" : b.status === "requested" ? "info" : "neutral"
					}
				>
					{say(STATUS_KEY[b.status] ?? "account_status_requested")}
				</StatusBadge>
			</div>
			{upcoming && b.canChange ? (
				<>
					<p class="text-body-sm text-ink-muted" data-change-until>
						{`${say("account_bookings_change_until")} ${when(locale, b.changeUntil)}.`}
					</p>
					<div class="flex flex-col gap-2 sm:flex-row">
						<Button href={bookingPath(base, b.id, "/muta")} size="sm" variant="outline" data-move>
							{say("account_bookings_move")}
						</Button>
						<form method="post" action={`${base}${JOURNEY_PAGES.bookings}/anuleaza`}>
							<input type="hidden" name="id" value={b.id} />
							<Button type="submit" size="sm" variant="ghost">
								{say("account_bookings_cancel")}
							</Button>
						</form>
					</div>
				</>
			) : upcoming ? (
				<p class="text-body-sm text-ink-muted" data-too-late>
					{say("account_bookings_too_late")}
				</p>
			) : null}
		</li>
	);
}

/** "Programările mele": upcoming first (soonest first), then the rest, newest first; each allowed by OpenFGA. */
export function OwnBookingsBody({
	say,
	base,
	locale,
	rows,
	now,
	notice,
}: {
	say: Say;
	base: string;
	locale: "ro" | "en";
	rows: ReadonlyArray<OwnBooking> | null;
	now: number;
	notice?: "too_late" | "taken" | undefined;
}): JSX.Element {
	const upcoming = (rows ?? [])
		.filter((b) => b.end > now && open(b))
		.sort((a, b) => a.start - b.start);
	const past = (rows ?? []).filter((b) => !upcoming.includes(b)).sort((a, b) => b.start - a.start);
	return (
		<Section title={say("account_bookings_title")}>
			<p class="text-body text-ink-muted">{say("account_bookings_lead")}</p>
			{rows === null ? (
				<StatusBadge tone="warning">{say("account_unavailable_lead")}</StatusBadge>
			) : null}
			{notice === "too_late" ? (
				<StatusBadge tone="warning">{say("account_bookings_too_late")}</StatusBadge>
			) : null}
			{notice === "taken" ? (
				<StatusBadge tone="warning">{say("account_bookings_taken")}</StatusBadge>
			) : null}
			{rows !== null && rows.length === 0 ? (
				<p class="text-body text-ink-muted">{say("account_bookings_empty")}</p>
			) : null}
			{upcoming.length > 0 ? (
				<div>
					<h3 class="text-body-lg text-ink">{say("account_bookings_upcoming")}</h3>
					<ul class="flex flex-col divide-y divide-line" data-bookings="upcoming">
						{upcoming.map((b) => (
							<BookingRow say={say} base={base} locale={locale} b={b} upcoming />
						))}
					</ul>
				</div>
			) : null}
			{past.length > 0 ? (
				<div>
					<h3 class="text-body-lg text-ink">{say("account_bookings_past")}</h3>
					<ul class="flex flex-col divide-y divide-line" data-bookings="past">
						{past.map((b) => (
							<BookingRow say={say} base={base} locale={locale} b={b} upcoming={false} />
						))}
					</ul>
				</div>
			) : null}
		</Section>
	);
}

/** The day a time falls on, in the clinic's zone, for grouping the free times. */
function dayOf(locale: "ro" | "en", ms: number): string {
	return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		weekday: "long",
		day: "numeric",
		month: "long",
		timeZone: "Europe/Bucharest",
	}).format(new Date(ms));
}

function hourOf(locale: "ro" | "en", ms: number): string {
	return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		timeStyle: "short",
		timeZone: "Europe/Bucharest",
	}).format(new Date(ms));
}

/** Moving a booking: the free times of the same person and service, by day, one choice, one button. */
export function MoveBody({
	say,
	base,
	locale,
	booking,
	times,
	taken,
}: {
	say: Say;
	base: string;
	locale: "ro" | "en";
	booking: OwnBooking;
	times: ReadonlyArray<FreeTime>;
	taken: boolean;
}): JSX.Element {
	const mode = booking.mode ?? "onsite";
	const fitting = times.filter((t) => t.modes.includes(mode) && t.start !== booking.start);
	const days = new Map<string, FreeTime[]>();
	for (const t of fitting)
		days.set(dayOf(locale, t.start), [...(days.get(dayOf(locale, t.start)) ?? []), t]);
	return (
		<Section title={say("account_bookings_move_title")}>
			<p class="text-body text-ink">{when(locale, booking.start)}</p>
			<p class="text-body text-ink-muted">{say("account_bookings_move_lead")}</p>
			{taken ? <StatusBadge tone="warning">{say("account_bookings_taken")}</StatusBadge> : null}
			{fitting.length === 0 ? (
				<p class="text-body text-ink-muted" data-move-none>
					{say("account_bookings_move_none")}
				</p>
			) : (
				<form
					method="post"
					action={bookingPath(base, booking.id, "/muta")}
					class="flex flex-col gap-5"
					data-move-form
				>
					<input type="hidden" name="mode" value={mode} />
					{[...days.entries()].map(([day, list]) => (
						<fieldset class="flex min-w-0 flex-col gap-2">
							<legend class="mb-2 text-body text-ink">{day}</legend>
							<div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
								{list.map((t) => (
									<label class="flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-line text-body-sm text-ink has-checked:border-accent has-checked:bg-surface-2 has-focus-visible:outline-2 has-focus-visible:outline-offset-2">
										<input
											class="sr-only"
											type="radio"
											name="start"
											value={String(t.start)}
											required
										/>
										{hourOf(locale, t.start)}
									</label>
								))}
							</div>
						</fieldset>
					))}
					<div>
						<Button type="submit">{say("account_bookings_move_button")}</Button>
					</div>
				</form>
			)}
			<p>
				<a class="text-body-sm text-ink underline" href={`${base}${JOURNEY_PAGES.bookings}`}>
					{say("account_bookings_back")}
				</a>
			</p>
		</Section>
	);
}
