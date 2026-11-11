import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { Technology } from "../sections/technology";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Para, Pending } from "./shell";

/**
 * /tehnologia: the home's diagram and method line, then what the technology is not. History and
 * any research statement wait for their sources (docs/plans/hemisync-web.md §4, "brain mapping").
 */
export function TechnologyPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", "technology")}
			title={m.nav_technology({}, o)}
			description={m.tp_description({}, o)}
		>
			<PageHero
				locale={locale}
				overline={m.tech_overline({}, o)}
				title={m.nav_technology({}, o)}
				lead={m.hero_lead({}, o)}
			/>
			<Technology locale={locale} more={false} />
			<Band overline={m.tp_not_overline({}, o)} title={m.tp_not_title({}, o)} wash>
				<Para>{m.tp_not_text({}, o)}</Para>
				<Para>{m.focus_note({}, o)}</Para>
				<Pending locale={locale}>{m.tp_pending({}, o)}</Pending>
			</Band>
			<NextSteps
				links={[
					{ label: m.nav_exercises({}, o), href: href(locale, "exercises"), primary: true },
					{ label: m.nav_focus({}, o), href: href(locale, "focus") },
					{ label: m.nav_about({}, o), href: href(locale, "about") },
				]}
			/>
		</PageShell>
	);
}
