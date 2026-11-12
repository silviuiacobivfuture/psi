import { Button, EstateRow, Logo, SoundWaves } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { estateRow } from "../estate";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";

export function Closing({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section id="incepe" class="scroll-mt-28 px-5 pb-24">
			<div class="eq-closing relative mx-auto max-w-6xl overflow-hidden rounded-lg border border-line">
				<div class="relative flex flex-col items-start gap-8 px-8 pb-44 pt-20 md:px-16 md:pt-28">
					<h2 class="display eq-h2 eq-h2--xl max-w-3xl text-ink">{m.closing_title({}, o)}</h2>
					<p class="max-w-xl text-body text-ink-muted">{m.closing_text({}, o)}</p>
					<Button size="lg" arrow href={`${base(locale)}/inregistrare`}>
						{m.cta_free({}, o)}
					</Button>
				</div>
				<SoundWaves class="absolute inset-x-0 bottom-4" height={120} />
			</div>
		</section>
	);
}

export function Footer({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	return (
		<footer class="border-t border-line">
			<div class="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-12">
				<div class="space-y-4 md:col-span-5">
					<Logo size={30} brand="eqsync" href={`${b}/`} />
					<p class="max-w-sm text-body-sm text-ink-muted">{m.footer_tagline({}, o)}</p>
					<p class="max-w-sm text-data text-ink-faint">{m.footer_disclaimer({}, o)}</p>
				</div>
				<nav class="eq-footer-links md:col-span-3" aria-label={m.footer_nav_label({}, o)}>
					<a href={`${b}/#metoda`}>{m.nav_method({}, o)}</a>
					<a href={`${b}/#program`}>{m.nav_program({}, o)}</a>
					<a href={`${b}/#protocoale`}>{m.nav_protocols({}, o)}</a>
					<a href={href(locale, "science")}>{m.c_nav_science({}, o)}</a>
					<a href={href(locale, "listen")}>{m.c_nav_listen({}, o)}</a>
					<a href={href(locale, "who")}>{m.c_nav_who({}, o)}</a>
					<a href={href(locale, "glossary")}>{m.c_nav_glossary({}, o)}</a>
					<a href={href(locale, "faq")}>{m.nav_faq({}, o)}</a>
					<a href={href(locale, "safety")}>{m.nav_safety({}, o)}</a>
				</nav>
				<nav class="eq-footer-links md:col-span-4" aria-label={m.footer_legal_label({}, o)}>
					<a href={`${b}/termeni`}>{m.footer_terms({}, o)}</a>
					<a href={`${b}/confidentialitate`}>{m.footer_privacy({}, o)}</a>
					<a href={`${b}/retragere`}>{m.footer_withdrawal({}, o)}</a>
					<a href="https://anpc.ro/" rel="noopener">
						{m.footer_anpc({}, o)}
					</a>
					<a href="https://ec.europa.eu/consumers/odr" rel="noopener">
						{m.footer_odr({}, o)}
					</a>
				</nav>
			</div>
			<EstateRow
				class="mx-auto max-w-6xl border-t border-line px-5 py-6"
				label={m.estate_label({}, o)}
				links={estateRow(locale)}
			/>
			<div class="mx-auto flex max-w-6xl flex-col gap-2 border-t border-line px-5 py-8 text-data text-ink-faint md:flex-row md:justify-between">
				<span>{m.footer_trader({}, o)}</span>
				<span>{m.footer_rights({ year: String(new Date().getFullYear()) }, o)}</span>
			</div>
		</footer>
	);
}
