import { Button, DawnLandscape, EstateRow, Logo } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { estateRow } from "../estate";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** The bookend: the same dawn, smaller, with one invitation. */
export function Closing({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	return (
		<section aria-labelledby="final-cta">
			<DawnLandscape id="closing-dawn" class="hs-dawn--short">
				<div class="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pb-56 pt-24 text-center md:pt-24">
					<h2 id="final-cta" class="display text-display-lg text-ink">
						{m.cta_title_1({}, o)} <em>{m.cta_title_2({}, o)}</em>
					</h2>
					<p class="mt-6 max-w-lg text-body-lg text-ink">{m.cta_text({}, o)}</p>
					<div class="mt-10 flex flex-wrap items-center justify-center gap-5">
						<Button size="lg" arrow href={`${b}/#programe`}>
							{m.cta_programmes({}, o)}
						</Button>
						<a class="pz-tap text-link text-body" href={`${b}/#exercitii`}>
							{m.cta_exercises({}, o)}
						</a>
					</div>
				</div>
			</DawnLandscape>
		</section>
	);
}

export function Footer({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	const ro = locale === "ro";
	const explore = [
		{ label: m.nav_programmes({}, o), href: `${b}/#programe` },
		{ label: m.nav_exercises({}, o), href: `${b}/#exercitii` },
		{ label: m.nav_focus({}, o), href: `${b}/#focus` },
		{ label: m.nav_club({}, o), href: `${b}/#club` },
	];
	const legal = [
		{ label: m.footer_terms({}, o), href: ro ? "/termeni-si-conditii" : "/en/legal/terms" },
		{
			label: m.footer_privacy({}, o),
			href: ro ? "/politica-de-confidentialitate" : "/en/legal/privacy",
		},
		{ label: m.footer_cookies({}, o), href: ro ? "/despre-cookie-uri" : "/en/legal/cookies" },
		{ label: m.footer_anpc({}, o), href: "https://anpc.ro" },
		{ label: m.footer_odr({}, o), href: "https://ec.europa.eu/consumers/odr" },
	];
	return (
		<footer class="mt-8">
			<div class="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:grid-cols-[2fr_1fr_1fr] md:px-14">
				<div class="space-y-4">
					<Logo size={30} brand="hemisync" href={`${b}/`} />
					<p class="max-w-sm text-body-sm text-ink-muted">{m.footer_tagline({}, o)}</p>
				</div>
				<nav aria-label={m.footer_explore({}, o)} class="space-y-3">
					<p class="hs-overline">{m.footer_explore({}, o)}</p>
					<ul class="space-y-2 text-body-sm">
						{explore.map((l) => (
							<li>
								<a class="pz-tap text-ink-muted hover:text-ink" href={l.href}>
									{l.label}
								</a>
							</li>
						))}
					</ul>
				</nav>
				<nav aria-label={m.footer_legal({}, o)} class="space-y-3">
					<p class="hs-overline">{m.footer_legal({}, o)}</p>
					<ul class="space-y-2 text-body-sm">
						{legal.map((l) => (
							<li>
								<a class="pz-tap text-ink-muted hover:text-ink" href={l.href}>
									{l.label}
								</a>
							</li>
						))}
					</ul>
				</nav>
			</div>
			<EstateRow
				class="mx-auto max-w-7xl border-t border-line px-6 py-6 md:px-14"
				label={m.estate_label({}, o)}
				links={estateRow(locale)}
			/>
			<div class="mx-auto flex max-w-7xl flex-col gap-2 border-t border-line px-6 py-8 text-body-sm text-ink-faint md:flex-row md:justify-between md:px-14">
				<p>{m.footer_rights({ year: String(new Date().getFullYear()) }, o)}</p>
				<p class="max-w-2xl md:text-right">{m.footer_trademarks({}, o)}</p>
			</div>
		</footer>
	);
}
