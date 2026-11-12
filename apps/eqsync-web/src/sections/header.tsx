import { Button, Compass, type CompassGroup, Logo, ThemeToggle } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { accountGroups } from "../account";
import { estateGroup } from "../estate";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { SitePwaTools } from "../pwa/site";
import { href } from "../routes";
import { THEMES } from "../theme";

/**
 * No navbar: the brand sits quietly in the corner, and everything else is the compass at the foot
 * of the screen — go to a part of the page, or ask the guide.
 */
export function Header({ locale, otherHref }: { locale: Locale; otherHref: string }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	const groups: ReadonlyArray<CompassGroup> = [
		{
			label: m.group_program({}, o),
			items: [
				{ label: m.nav_method({}, o), href: href(locale, "method"), hint: m.hint_method({}, o) },
				{ label: m.nav_sample({}, o), href: `${b}/#asculta`, hint: m.hint_sample({}, o) },
				{ label: m.nav_program({}, o), href: `${b}/#program`, hint: m.hint_program({}, o) },
				{
					label: m.nav_protocols({}, o),
					href: href(locale, "protocols"),
					hint: m.hint_protocols({}, o),
				},
				{ label: m.cta_free({}, o), href: href(locale, "signup"), hint: m.hint_start({}, o) },
			],
		},
		{
			label: m.group_more({}, o),
			items: [
				{ label: m.nav_faq({}, o), href: href(locale, "faq"), hint: m.hint_faq({}, o) },
				{ label: m.nav_about({}, o), href: href(locale, "about"), hint: m.hint_about({}, o) },
				{ label: m.nav_safety({}, o), href: href(locale, "safety"), hint: m.hint_safety({}, o) },
				{ label: m.nav_contact({}, o), href: href(locale, "contact"), hint: m.hint_contact({}, o) },
				{ label: m.nav_guide({}, o), href: `${b}/#ghid`, hint: m.hint_guide({}, o) },
			],
		},
		...accountGroups(locale),
		estateGroup(locale),
	];
	return (
		<>
			<a href="#continut" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4">
				{m.skip_to_content({}, o)}
			</a>
			<header class="pointer-events-none absolute inset-x-0 top-0 z-40">
				<div class="mx-auto flex max-w-6xl items-center px-5 py-6">
					<span class="pointer-events-auto">
						<Logo size={30} href={`${b}/`} />
					</span>
				</div>
			</header>
			<Compass
				label={m.compass_label({}, o)}
				placeholder={m.compass_placeholder({}, o)}
				toggleLabel={m.compass_toggle({}, o)}
				askHint={m.compass_ask({}, o)}
				groups={groups}
				guideAction={`${b}/ghid?target=compass-answer`}
				answerId="compass-answer"
				action={
					<Button size="sm" class="eq-compass-cta" href={`${b}/#incepe`}>
						{m.cta_free({}, o)}
					</Button>
				}
				tools={
					<>
						<a
							class="pz-btn pz-btn--glass pz-btn--sm"
							href={otherHref}
							hreflang={locale === "ro" ? "en" : "ro"}
							aria-label={m.lang_switch_label({}, o)}
						>
							{m.lang_switch({}, o)}
						</a>
						<ThemeToggle themes={THEMES} label={m.theme_toggle({}, o)} />
						<SitePwaTools locale={locale} />
					</>
				}
			/>
		</>
	);
}
