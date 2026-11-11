import { Button, NavBar, ThemeToggle } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { THEMES } from "../theme";

export function Header({ locale, otherHref }: { locale: Locale; otherHref: string }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	return (
		<header class="sticky top-3 z-40 px-3 md:top-4">
			<a href="#continut" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4">
				{m.skip_to_content({}, o)}
			</a>
			<div class="mx-auto max-w-6xl">
				<NavBar
					label={m.nav_label({}, o)}
					homeHref={`${b}/`}
					links={[
						{ label: m.nav_children({}, o), href: `${b}/#pentru-cine` },
						{ label: m.nav_teens({}, o), href: `${b}/#pentru-cine` },
						{ label: m.nav_adults({}, o), href: `${b}/#pentru-cine` },
						{ label: m.nav_methods({}, o), href: `${b}/#metode` },
						{ label: m.nav_team({}, o), href: `${b}/#echipa` },
					]}
					actions={
						<>
							<a
								class="pz-btn pz-btn--ghost pz-btn--sm"
								href={otherHref}
								aria-label={m.lang_switch_label({}, o)}
							>
								{m.lang_switch({}, o)}
							</a>
							<ThemeToggle themes={THEMES} label={m.theme_toggle({}, o)} />
							<Button size="sm" href={`${b}/#programare`}>
								{m.cta_book({}, o)}
							</Button>
						</>
					}
				/>
			</div>
		</header>
	);
}
