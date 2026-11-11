import { Button, Compass, type CompassGroup, Logo, ThemeToggle } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { HUBS } from "../content/hubs";
import { at, base, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { THEMES } from "../theme";

/**
 * No navbar: the brand sits quietly in the corner, and everything else is the compass at the foot
 * of the screen — go somewhere, or ask the guide.
 */
export function Header({ locale, otherHref }: { locale: Locale; otherHref: string }): JSX.Element {
	const o = at(locale);
	const b = base(locale);
	const hub = (id: string) => HUBS.find((h) => h.id === id);
	const hubItem = (id: string) => {
		const h = hub(id);
		return h ? [{ label: h.title(o), href: `${b}${h.path}`, hint: h.text(o) }] : [];
	};
	const groups: ReadonlyArray<CompassGroup> = [
		{
			label: m.group_children({}, o),
			items: [
				...hubItem("autism"),
				...hubItem("adhd"),
				...hubItem("sensory"),
				...hubItem("speech"),
			],
		},
		{ label: m.group_teens_adults({}, o), items: [...hubItem("teens"), ...hubItem("adults")] },
		{
			label: m.group_centre({}, o),
			items: [
				{ label: m.nav_home({}, o), href: `${b}/` },
				{ label: m.nav_how({}, o), href: `${b}/#metode` },
				{ label: m.nav_team({}, o), href: `${b}/echipa` },
				{ label: m.cta_book({}, o), href: `${b}/contact` },
			],
		},
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
					<Button size="sm" href={`${b}/contact`}>
						{m.cta_book({}, o)}
					</Button>
				}
				tools={
					<>
						<a
							class="pz-btn pz-btn--glass pz-btn--sm"
							href={otherHref}
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
