import { AmbientField } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { BookingForm, type SlotDay } from "../booking";
import { at, base, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { Footer } from "../sections/closing";
import { Header } from "../sections/header";
import { openingHours, phones, socialLinks } from "../site-settings";
import type { Theme } from "../theme";
import { ContactExtras } from "./contact-extras";

export function ContactPage({
	locale,
	theme,
	origin,
	slots = [],
	booking = {},
}: {
	locale: Locale;
	theme: Theme;
	origin: string;
	/** Free evaluation times when scheduling is on; none keeps the callback form. */
	slots?: ReadonlyArray<SlotDay>;
	/** The estate account's pre-fill and sign-in line (see booking-account.ts). */
	booking?: Pick<Parameters<typeof BookingForm>[0], "values" | "account">;
}): JSX.Element {
	const o = at(locale);
	const other: Locale = locale === "ro" ? "en" : "ro";
	const otherHref = `${base(other)}/contact`;
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${m.cta_book({}, o)} — Psizone`}
			description={m.contact_lead({}, o)}
			alternate={{ locale: other, href: `${origin}${otherHref}` }}
		>
			<Header locale={locale} otherHref={otherHref} theme={theme} />
			<main id="continut">
				<AmbientField intensity="low" class="-mt-20">
					<div class="mx-auto grid max-w-6xl gap-16 px-5 pb-28 pt-44 lg:grid-cols-[1fr_1.1fr]">
						<div>
							<h1 class="display text-display-lg text-ink">{m.contact_title({}, o)}</h1>
							<p class="mt-6 max-w-md text-body-lg text-ink-muted">{m.contact_lead({}, o)}</p>
							<p class="mt-12 text-overline uppercase tracking-[0.14em] text-ink-muted">
								{m.contact_direct({}, o)}
							</p>
							<ul class="mt-4 space-y-2">
								{phones().map((p) => (
									<li>
										<a
											class="font-mono text-title text-ink hover:text-glow-1"
											href={`tel:${p.tel}`}
										>
											{p.display}
										</a>
										{p.label === null ? null : (
											<span class="ml-3 text-body-sm text-ink-muted">{p.label[locale]}</span>
										)}
									</li>
								))}
							</ul>
							<ContactExtras locale={locale} hours={openingHours()} social={socialLinks()} />
							<p class="mt-12 max-w-sm text-body-sm text-ink-faint">{m.contact_privacy({}, o)}</p>
						</div>
						<div class="pz-edge rounded-xl p-6 backdrop-blur-2xl md:p-10">
							<BookingForm locale={locale} slots={slots} {...booking} />
						</div>
					</div>
				</AmbientField>
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}
