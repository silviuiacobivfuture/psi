import { PractitionerCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { DocSections, seo } from "./doc";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Para, Pending } from "./shell";

/** The licensor's own site (docs/brands/RESOURCES.md). */
const MONROE = "https://www.monroeinstitute.org/";

/**
 * /despre: who operates the site, the two trainers the documents name, and the Monroe lineage.
 * The operator is Nicoară Eniko Ritta Î.F., a business separate from Psizone (question 1); the
 * team of nine, the lead trainer and the lineage text wait for the owner.
 */
export function AboutPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const s = seo("about", locale);
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", "about")}
			title={m.nav_about({}, o)}
			seoTitle={s.seoTitle}
			description={s.description}
		>
			<PageHero
				locale={locale}
				overline={m.nav_about({}, o)}
				title={m.ab_title({}, o)}
				lead={m.footer_tagline({}, o)}
			/>
			<DocSections page="about" locale={locale} wash={false} photos={{ s02: "autumnSnow" }} />
			<Band overline={m.ab_operator_overline({}, o)} title={m.ab_operator_title({}, o)}>
				<Para>{m.ab_operator_text({}, o)}</Para>
				<p class="text-body-sm text-ink-faint">{m.ab_operator_ids({}, o)}</p>
			</Band>
			<Band overline={m.ab_trainers_overline({}, o)} title={m.ab_trainers_title({}, o)} wash>
				<div class="grid gap-5 sm:grid-cols-2">
					<PractitionerCard name={m.ab_ritta_name({}, o)} role={m.ab_ritta_role({}, o)} />
					<PractitionerCard name={m.ab_adrian_name({}, o)} role={m.ab_adrian_role({}, o)} />
				</div>
				<Pending locale={locale}>{m.ab_team_pending({}, o)}</Pending>
			</Band>
			<Band overline={m.hero_overline({}, o)} title={m.ab_monroe_title({}, o)}>
				<Para>{m.ab_monroe_text({}, o)}</Para>
				<p class="flex flex-wrap gap-6">
					<a class="pz-tap text-link text-body" href={MONROE} rel="noopener">
						{m.ab_monroe_link({}, o)}
					</a>
					<a class="pz-tap text-link text-body" href={href(locale, "trademarks")}>
						{m.lg_trademarks_title({}, o)}
					</a>
				</p>
				<a class="pz-tap text-link text-body" href={href(locale, "history")}>
					{m.nav_history({}, o)}
				</a>
			</Band>
			<NextSteps
				links={[
					{ label: m.next_history({}, o), href: href(locale, "history"), primary: true },
					{ label: m.cta_programmes({}, o), href: href(locale, "programmes") },
					{ label: m.nav_contact({}, o), href: href(locale, "contact") },
				]}
			/>
		</PageShell>
	);
}
