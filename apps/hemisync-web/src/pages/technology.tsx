import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { FromTheBlog } from "../sections/blog";
import { Technology } from "../sections/technology";
import { DocSections, head, Toc } from "./doc";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Para } from "./shell";

/**
 * /tehnologia: the home's diagram, then the long form: what Hemi-Sync® is, how a binaural beat
 * works, why headphones, the history in brief and an honest word on evidence (content bundle,
 * `tech_*`), then what the technology is not.
 */
export function TechnologyPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const h = head("tech", locale);
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", "technology")}
			title={h.h1}
			seoTitle={h.seoTitle}
			description={h.description}
		>
			<PageHero locale={locale} overline={h.overline} title={h.h1} lead={h.lead}>
				<Toc page="tech" locale={locale} />
			</PageHero>
			<Technology locale={locale} more={false} />
			<DocSections page="tech" locale={locale} />
			<Band overline={m.tp_not_overline({}, o)} title={m.tp_not_title({}, o)}>
				<Para>{m.tp_not_text({}, o)}</Para>
				<Para>{m.focus_note({}, o)}</Para>
			</Band>
			<FromTheBlog locale={locale} />
			<NextSteps
				links={[
					{ label: m.next_start({}, o), href: href(locale, "start"), primary: true },
					{ label: m.next_history({}, o), href: href(locale, "history") },
					{ label: m.nav_focus({}, o), href: href(locale, "focus") },
					{ label: m.next_glossary({}, o), href: href(locale, "glossary") },
				]}
			/>
		</PageShell>
	);
}
