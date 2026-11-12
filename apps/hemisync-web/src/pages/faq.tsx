import { faqPageJsonLd } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { FromTheBlog } from "../sections/blog";
import { FaqBlock, faqPlain, seo, text } from "./doc";
import { NextSteps, PageHero, type PageProps, PageShell, Pending } from "./shell";

/**
 * /intrebari-frecvente: 24 questions in five groups (content bundle, `faq_*`), written from the
 * live hemi-sync.ro answers and this site's own pages. The epilepsy, driving and headphone-volume
 * notes still wait for clinical review (the pending note under the safety group).
 */
export function FaqPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const s = seo("faq", locale);
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", "faq")}
			title={m.nav_faq({}, o)}
			seoTitle={s.seoTitle}
			description={s.description}
			jsonLd={[faqPageJsonLd(faqPlain("faq", locale))]}
		>
			<PageHero
				locale={locale}
				overline={m.nav_faq({}, o)}
				title={text("faq_h1", locale)}
				lead={m.hf_lead({}, o)}
			/>
			<div class="mx-auto max-w-7xl space-y-20 px-6 py-20 md:px-14 md:py-28">
				<FaqBlock
					page="faq"
					locale={locale}
					after={{ g04: <Pending locale={locale}>{m.hf_safety_pending({}, o)}</Pending> }}
				/>
			</div>
			<FromTheBlog locale={locale} />
			<NextSteps
				links={[
					{ label: m.nav_guide({}, o), href: `${base(locale)}/#ghid`, primary: true },
					{ label: m.next_start({}, o), href: href(locale, "start") },
					{ label: m.next_glossary({}, o), href: href(locale, "glossary") },
					{ label: m.nav_contact({}, o), href: href(locale, "contact") },
				]}
			/>
		</PageShell>
	);
}
