import { Banner } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { BookingPauses } from "../port/availability-port";

/** The pause list being read, and the error it ended in (none yet, or none at all). */
export interface PauseRead {
	/** The pauses; null when the list could not be read. */
	list: Promise<BookingPauses | null>;
	/** What the read failed with, once it has: the screen's own refusals are judged without it. */
	failure(): unknown;
}

/**
 * Starts reading the pause list now, so the page can ask for it beside its other chrome. Never fails the page: a pause
 * list that cannot be read shows no notice, and its refusal is not the screen's (see `failure`).
 */
export function readPauses(ctx: Ctx): PauseRead {
	let failure: unknown = null;
	const list = (async (): Promise<BookingPauses | null> => {
		try {
			return await ctx.port.bookingPauses(ctx.app);
		} catch (error) {
			failure = error;
			return null;
		}
	})();
	return { list, failure: () => failure };
}

/**
 * The console-wide notice while online booking is stopped: for the whole organisation or a part of it, whether staff
 * can still book from the console, and, for those who may change it, the way to Setări → Programări online.
 */
export function PauseBanner({
	ctx,
	list,
}: {
	ctx: Ctx;
	list: BookingPauses | null;
}): JSX.Element | null {
	if (list === null || !list.paused) return null;
	const o = at(ctx.locale);
	const active = list.items.filter((p) => p.state === "active");
	const whole = active.some((p) => p.scope.level === "organisation");
	const staff = active.some((p) => p.blockStaff);
	return (
		<div class="adm-lead" data-pause-banner data-staff-blocked={staff ? "true" : "false"}>
			<Banner tone="info" icon="alert">
				<strong>{whole ? m.av_banner_whole({}, o) : m.av_banner_part({}, o)}</strong>{" "}
				<span>{staff ? m.av_banner_staff_blocked({}, o) : m.av_banner_staff_free({}, o)}</span>{" "}
				{ctx.can.has("booking_pause_edit") ? (
					<a href="/settings/online">{m.av_banner_manage({}, o)}</a>
				) : null}
			</Banner>
		</div>
	);
}
