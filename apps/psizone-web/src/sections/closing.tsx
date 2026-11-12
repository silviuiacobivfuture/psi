import { Button, EstateRow } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { estateRow } from "../estate";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

export function Closing({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section id="programare" class="px-5 pb-24">
			<div class="gold-band mx-auto max-w-6xl rounded-xl">
				<div class="flex flex-col items-start gap-8 px-8 py-20 md:px-16 md:py-28">
					<h2 class="display max-w-3xl text-display-lg">{m.cta_title({}, o)}</h2>
					<p class="max-w-xl text-body-lg">{m.cta_text({}, o)}</p>
					<Button size="lg" arrow href={`${base(locale)}/contact`}>
						{m.cta_book({}, o)}
					</Button>
				</div>
			</div>
		</section>
	);
}

/** A proper name, the same in every language. */
const BRAND_NAME = "Psizone";

export function Footer({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	return (
		<footer class="border-t border-line">
			<div class="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-14 md:flex-row md:items-end md:justify-between">
				<div class="space-y-3">
					{/* The centre's own lockup (from psizone.ro) signs the page and leads home. */}
					<a class="brand-lockup" href={`${b}/`}>
						<span class="sr-only">{BRAND_NAME}</span>
					</a>
					<p class="max-w-sm text-body-sm text-ink-muted">{m.footer_tagline({}, o)}</p>
				</div>
				<nav class="flex flex-wrap gap-6 text-body-sm text-ink-muted" aria-label="Footer">
					<a class="hover:text-ink" href={`${b}/povestea`}>
						{m.nav_story({}, o)}
					</a>
					<a class="hover:text-ink" href={`${b}/confidentialitate`}>
						{m.footer_privacy({}, o)}
					</a>
					<a class="hover:text-ink" href={`${b}/politica-editoriala`}>
						{m.footer_editorial({}, o)}
					</a>
				</nav>
			</div>
			<EstateRow
				class="mx-auto max-w-6xl px-5 pb-6"
				label={m.estate_label({}, o)}
				links={estateRow(locale)}
			/>
			<p class="mx-auto max-w-6xl px-5 pb-10 text-body-sm text-ink-faint">
				{m.footer_rights({ year: String(new Date().getFullYear()) }, o)}
			</p>
		</footer>
	);
}
