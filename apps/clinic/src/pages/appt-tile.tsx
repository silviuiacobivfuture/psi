import { StatusPill } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { hhmm } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { statusLabel } from "../lib/status";
import { m } from "../paraglide/messages.js";
import type { Appointment, Client } from "../port/schema";

export type TileVariant = "wash" | "glass" | "ink";

/** First letters of the first two words, whatever the script. */
export function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter((w) => w !== "")
		.slice(0, 2)
		.map((w) => Array.from(w)[0] ?? "")
		.join("")
		.toLocaleUpperCase();
}

export interface TileProps {
	appt: Appointment;
	client: Client | undefined;
	serviceName: string;
	colour: number;
	locale: Locale;
	dayStart: number;
	variant?: TileVariant;
	/** Placed on the time grid (absolute) or flowing (the design sheet). */
	placed?: boolean;
	/** For a group: how many people are in it (stacked monograms). */
	people?: number;
}

/**
 * An appointment as psi draws it: a tinted surface washed in its column's colour, a round monogram
 * ringed in that colour (stacked for a group), time in tabular numerals, the service as a quiet label,
 * the status as a glyph-and-word pill in the corner. Cancelled is hatched and muted; requested is dashed
 * and breathes (never under reduced motion).
 */
export function AppointmentTile({
	appt,
	client,
	serviceName,
	colour,
	locale,
	dayStart,
	variant = "wash",
	placed = true,
	people = 3,
}: TileProps): JSX.Element {
	const short = appt.durationMin < 60;
	const name = appt.title ?? client?.name ?? m.unnamed_group({}, at(locale));
	const group = appt.title !== null;
	const style = `--c:var(--cal-${colour});${placed ? `--start:${appt.startMin};--dur:${appt.durationMin};--day-start:${dayStart}` : ""}`;
	return (
		<a
			class={`cal__appt cal__appt--${variant}${placed ? "" : " cal__appt--flow"}${short ? " cal__appt--short" : ""}`}
			data-status={appt.status}
			href={`/calendar?view=day&date=${appt.date}&appt=${appt.id}`}
			{...(placed ? { "data-on:click__prevent": `@get('/calendar/appointment/${appt.id}')` } : {})}
			style={style}
		>
			{group ? (
				<span class="cal__stack" aria-hidden="true">
					{Array.from({ length: Math.min(people, 3) }, (_, i) => (
						<span key={i} class="cal__mono" />
					))}
				</span>
			) : (
				<span class="cal__mono" aria-hidden="true">
					{initials(name)}
				</span>
			)}
			<span class="cal__body">
				<strong>{name}</strong>
				<span class="cal__meta">
					<time>
						{hhmm(appt.startMin)}–{hhmm(appt.startMin + appt.durationMin)}
					</time>
					<StatusPill status={appt.status} label={statusLabel(appt.status, locale)} compact />
				</span>
				{short ? null : <span class="cal__svc">{serviceName}</span>}
			</span>
		</a>
	);
}
