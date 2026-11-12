import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { FromTheBlog } from "../sections/blog";
import { ExerciseList } from "../sections/exercises";
import { DocSections, seo } from "./doc";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Para, Pending } from "./shell";

/**
 * /descarcari: how to listen, then the free exercises the home already offers. The live page's
 * other titles, translated texts, apps and brochures wait for written permission (question 4).
 */
export function ExercisesPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const s = seo("ex", locale);
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", "exercises")}
			title={m.nav_exercises({}, o)}
			seoTitle={s.seoTitle}
			description={s.description}
		>
			<PageHero
				locale={locale}
				overline={m.exercises_overline({}, o)}
				title={m.ep_title({}, o)}
				lead={m.exercises_lead({}, o)}
			/>
			<Band overline={m.ep_how_overline({}, o)} title={m.ep_how_title({}, o)}>
				<Para>{m.exercises_headphones({}, o)}</Para>
				<Para>{m.tech_headphones({}, o)}</Para>
			</Band>
			<section class="hs-wash">
				<div class="mx-auto max-w-4xl px-6 py-20 md:px-14 md:py-28">
					<ExerciseList locale={locale} />
				</div>
			</section>
			<DocSections page="ex" locale={locale} wash={false} />
			<Band overline={m.ep_more_overline({}, o)} title={m.ep_more_title({}, o)}>
				<Pending locale={locale}>{m.ep_more_pending({}, o)}</Pending>
				<Para>{m.pg_start_text({}, o)}</Para>
			</Band>
			<FromTheBlog locale={locale} />
			<NextSteps
				links={[
					{ label: m.next_start({}, o), href: href(locale, "start"), primary: true },
					{ label: m.cta_programmes({}, o), href: href(locale, "programmes") },
					{ label: m.nav_club({}, o), href: href(locale, "club") },
				]}
			/>
		</PageShell>
	);
}
