import { Button, Compass, type CompassGroup, ThemeToggle } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { THEMES } from "../theme";
import { programmeHref } from "./programmes";

/**
 * No navbar: the brand sits quietly in the sky of the dawn frame (see Hero), and everything else
 * is the compass at the foot of the screen — go somewhere, or ask the guide.
 */
export function Header({ locale, otherHref }: { locale: Locale; otherHref: string }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	const groups: ReadonlyArray<CompassGroup> = [
		{
			label: m.group_programmes({}, o),
			items: [
				{
					label: m.gateway_title({}, o),
					href: programmeHref(locale, "gateway-voyage"),
					hint: m.gateway_text({}, o),
				},
				{
					label: m.synccreation_title({}, o),
					href: programmeHref(locale, "sync-creation"),
					hint: m.synccreation_text({}, o),
				},
				{
					label: m.lucid_title({}, o),
					href: programmeHref(locale, "lucid-dreaming"),
					hint: m.lucid_text({}, o),
				},
				{ label: m.programmes_all({}, o), href: `${b}/#programe` },
			],
		},
		{
			label: m.group_free({}, o),
			items: [
				{ label: m.nav_exercises({}, o), href: `${b}/#exercitii`, hint: m.exercises_lead({}, o) },
				{ label: m.nav_club({}, o), href: `${b}/#club`, hint: m.club_hint({}, o) },
			],
		},
		{
			label: m.group_explore({}, o),
			items: [
				{ label: m.nav_technology({}, o), href: `${b}/#tehnologia`, hint: m.tech_hint({}, o) },
				{ label: m.nav_focus({}, o), href: `${b}/#focus`, hint: m.focus_hint({}, o) },
				{ label: m.nav_guide({}, o), href: `${b}/#ghid` },
			],
		},
	];
	return (
		<>
			<a
				href="#continut"
				class="sr-only focus:not-sr-only focus:absolute focus:left-8 focus:top-8 focus:z-50 focus:rounded-pill focus:bg-surface-1 focus:px-4 focus:py-2"
			>
				{m.skip_to_content({}, o)}
			</a>
			<Compass
				label={m.compass_label({}, o)}
				placeholder={m.compass_placeholder({}, o)}
				toggleLabel={m.compass_toggle({}, o)}
				askHint={m.compass_ask({}, o)}
				groups={groups}
				guideAction={`${b}/ghid?target=compass-answer`}
				answerId="compass-answer"
				action={
					<Button size="sm" href={`${b}/#programe`}>
						{m.cta_programmes({}, o)}
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
					</>
				}
			/>
		</>
	);
}
