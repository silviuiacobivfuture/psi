import { type BookingDeps, registerBookingSlots, scheduleOf } from "@psi/ui";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { bookingAccount } from "./booking-account";
import { bookingDeps } from "./booking-store";
import type { Locale } from "./i18n";
import { BookingPage } from "./pages/booking";
import { themeFrom } from "./theme";

/**
 * The booking page (service cards, the picker, then the details) and the route every picker
 * change posts to (the shared one, @psi/ui's). The answer is the whole form again, from the
 * store's current times, with what the visitor typed kept.
 */
export function registerBookingRoutes(
	app: Hono,
	locale: Locale,
	prefix: string,
	deps: BookingDeps = bookingDeps,
): void {
	app.get(`${prefix}/programare`, async (c) => {
		const origin = new URL(c.req.url).origin;
		const who = await bookingAccount(c, locale, `${prefix}/programare`);
		const asked = c.req.query("serviciu") ?? "";
		const schedule = await scheduleOf(deps.picker, { service: asked, cards: "1" });
		c.header("cache-control", "private, no-store");
		return c.html(
			<BookingPage
				locale={locale}
				theme={themeFrom(getCookie(c, "theme"))}
				origin={origin}
				{...(schedule === undefined ? {} : { schedule })}
				booking={{
					values: who.prefill,
					...(who.form === undefined ? {} : { account: who.form }),
				}}
			/>,
		);
	});
	registerBookingSlots(app, deps, locale);
}
