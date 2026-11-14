import { Banner } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { BookingPauses } from "../port/availability-port";

/**
 * The console-wide notice while online booking is stopped: for the whole organisation or a part of it, whether staff
 * can still book from the console, and, for those who may change it, the way to Setări → Programări online. Never fails
 * the page: a pause list that cannot be read shows no notice.
 */
export async function PauseBanner({ ctx }: { ctx: Ctx }): Promise<JSX.Element | null> {
	let list: BookingPauses;
	try {
		list = await ctx.port.bookingPauses(ctx.app);
	} catch {
		return null;
	}
	if (!list.paused) return null;
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
