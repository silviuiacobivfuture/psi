import { AmbientField, Button, Logo } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

export function Closing({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<section id="programare" class="px-5 pb-24">
			<AmbientField class="mx-auto max-w-6xl rounded-xl border border-line">
				<div class="flex flex-col items-start gap-8 px-8 py-20 md:px-16 md:py-28">
					<h2 class="display max-w-3xl text-display-lg text-ink">{m.cta_title({}, o)}</h2>
					<p class="max-w-xl text-body-lg text-ink-muted">{m.cta_text({}, o)}</p>
					<Button size="lg" arrow href={`${base(locale)}/contact`}>
						{m.cta_book({}, o)}
					</Button>
				</div>
			</AmbientField>
		</section>
	);
}

export function Footer({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	return (
		<footer class="border-t border-line">
			<div class="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-14 md:flex-row md:items-end md:justify-between">
				<div class="space-y-3">
					<Logo size={28} brand="psizone" href={`${b}/`} />
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
					<a class="hover:text-ink" href="https://www.hemi-sync.ro/">
						{m.footer_hemisync({}, o)}
					</a>
				</nav>
			</div>
			<p class="mx-auto max-w-6xl px-5 pb-10 text-body-sm text-ink-faint">
				{m.footer_rights({ year: String(new Date().getFullYear()) }, o)}
			</p>
		</footer>
	);
}
