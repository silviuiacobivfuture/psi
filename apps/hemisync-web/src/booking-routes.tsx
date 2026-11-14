import { type BookingDeps, registerBookingSlots, registerBookingSubmit, scheduleOf } from "@psi/ui";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { bookingAccount } from "./account";
import { bookingDeps } from "./booking-store";
import type { Locale } from "./i18n";
import { BookingPage } from "./pages/booking";
import { bookingHref } from "./routes";
import { themeFrom } from "./theme";

/**
 * Hemi-Sync's booking: the page (sessions, then a free time, then the details), the picker's
 * route and the form's POST routes, in one locale. The page is the shared flow (@psi/ui) in this
 * site's words, theme and tenant; never answered from the cache, because it reads the store.
 */
export function registerBooking(app: Hono, locale: Locale, deps: BookingDeps = bookingDeps): void {
	app.get(bookingHref(locale), async (c) => {
		const who = await bookingAccount(c, locale, bookingHref(locale));
		const asked = c.req.query("serviciu") ?? "";
		const schedule = await scheduleOf(deps.picker, { service: asked, cards: "1" });
		c.header("cache-control", "private, no-store");
		return c.html(
			<BookingPage
				locale={locale}
				theme={themeFrom(getCookie(c, "theme"))}
				origin={new URL(c.req.url).origin}
				{...(schedule === undefined ? {} : { schedule })}
				booking={{
					values: who.prefill,
					...(who.form === undefined ? {} : { account: who.form }),
				}}
			/>,
		);
	});
	registerBookingSlots(app, deps, locale);
	registerBookingSubmit(app, deps, locale);
}
