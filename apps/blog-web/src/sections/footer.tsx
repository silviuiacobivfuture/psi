import { Logo } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { BRANDS, SITES } from "../brands";
import { EDITORIAL_POLICY } from "../content/editorial-policy";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { routes } from "../routes";

export function Footer({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<footer class="mt-24 border-t border-line-strong">
			<div class="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
				<div class="space-y-4">
					<p class="bl-wordmark text-ink">{m.masthead_title({}, o)}</p>
					<p class="max-w-sm text-body-sm text-ink-muted">{m.footer_tagline({}, o)}</p>
					<p class="flex flex-wrap gap-x-6 gap-y-2 text-body-sm text-ink-muted">
						<a
							class="underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-glow-1"
							href={routes.article(locale, EDITORIAL_POLICY.slug)}
						>
							{m.footer_policy({}, o)}
						</a>
						<a
							class="underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-glow-1"
							href={routes.rss(locale)}
						>
							{m.footer_rss({}, o)}
						</a>
					</p>
				</div>
				<nav class="flex flex-wrap items-center gap-7" aria-label={m.footer_sites({}, o)}>
					{BRANDS.map((b) => (
						<Logo size={24} brand={b} href={SITES[b]} class="opacity-80 hover:opacity-100" />
					))}
				</nav>
			</div>
			<p class="mx-auto max-w-[1200px] px-4 pb-10 font-mono text-[12px] text-ink-muted sm:px-6">
				{m.footer_rights({ year: String(new Date().getFullYear()) }, o)}
			</p>
		</footer>
	);
}
