import { AmbientField, BookingForm, type Schedule } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { bookingEnv } from "../booking-site";
import { at, base, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { Footer } from "../sections/closing";
import { Header } from "../sections/header";
import type { Theme } from "../theme";

/** The booking page: choose the service, then a free time, then leave the details. */
export function BookingPage({
	locale,
	theme,
	origin,
	schedule,
	booking = {},
}: {
	locale: Locale;
	theme: Theme;
	origin: string;
	/** The calendar; absent when scheduling is off, which leaves the callback form. */
	schedule?: Schedule;
	/** The estate account's pre-fill and sign-in line (see booking-account.ts). */
	booking?: Pick<Parameters<typeof BookingForm>[0], "values" | "account">;
}): JSX.Element {
	const o = at(locale);
	const other: Locale = locale === "ro" ? "en" : "ro";
	const otherHref = `${base(other)}/programare`;
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${m.book_meta_title({}, o)} — Psizone`}
			description={m.book_lead({}, o)}
			alternate={{ locale: other, href: `${origin}${otherHref}` }}
		>
			<Header locale={locale} otherHref={otherHref} theme={theme} />
			<main id="continut">
				<AmbientField intensity="low" class="-mt-20">
					<div class="mx-auto max-w-3xl px-5 pb-28 pt-48">
						<h1 class="display text-display-lg text-ink">{m.book_title({}, o)}</h1>
						<p class="mt-5 max-w-xl text-body-lg text-ink-muted">{m.book_lead({}, o)}</p>
						<div class="pz-edge mt-10 rounded-xl p-5 backdrop-blur-2xl sm:p-8">
							<BookingForm
								env={bookingEnv(locale)}
								{...(schedule === undefined ? {} : { schedule })}
								{...booking}
							/>
						</div>
					</div>
				</AmbientField>
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
