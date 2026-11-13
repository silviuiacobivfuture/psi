import { BookingForm, GlassCard, type Schedule } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { bookingEnv } from "../booking-site";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { bookingHref, href } from "../routes";
import { Band, NextSteps, PageHero, type PageProps, PageShell } from "./shell";

/**
 * /programare: choose a session and a free time, then leave the details. Until the store has
 * Hemi-Sync's sessions, the callback form stands. The words are this site's own (messages/booking).
 */
export function BookingPage({
	locale,
	theme,
	origin,
	schedule,
	booking = {},
}: PageProps & {
	/** The calendar; absent when scheduling is off, which leaves the callback form. */
	schedule?: Schedule;
	/** The estate account's pre-fill and sign-in line. */
	booking?: Pick<Parameters<typeof BookingForm>[0], "values" | "account">;
}): JSX.Element {
	const o = at(locale);
	const other = locale === "ro" ? "en" : "ro";
	return (
		<PageShell
			locale={locale}
			theme={theme}
			origin={origin}
			otherHref={bookingHref(other)}
			title={m.bk_meta_title({}, o)}
			description={m.bk_description({}, o)}
		>
			<PageHero
				locale={locale}
				overline={m.bk_overline({}, o)}
				title={m.bk_title({}, o)}
				lead={m.bk_lead({}, o)}
				draft={false}
			/>
			<Band overline={m.bk_overline({}, o)} title={m.bk_details({}, o)}>
				<GlassCard solid class="p-6 md:p-8">
					<BookingForm
						env={bookingEnv(locale)}
						{...(schedule === undefined ? {} : { schedule })}
						{...booking}
					/>
				</GlassCard>
			</Band>
			<NextSteps
				links={[
					{ label: m.nav_programmes({}, o), href: href(locale, "programmes"), primary: true },
					{ label: m.nav_contact({}, o), href: href(locale, "contact") },
				]}
			/>
		</PageShell>
	);
}
