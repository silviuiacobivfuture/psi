import { PractitionerCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Para, Pending } from "./shell";

/**
 * /despre: the founder's documented credentials and the company behind the site. The story itself
 * waits for the owner (the live text carries unsourced lines, docs/plans/eqsync-web.md §2 ⚑).
 */
export function AboutPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const facts = [m.ap_fact_1({}, o), m.ap_fact_2({}, o), m.ap_fact_3({}, o)];
	return (
		<PageShell
			{...props}
			page="about"
			title={m.ap_title({}, o)}
			description={m.ap_description({}, o)}
		>
			<PageHero
				locale={locale}
				overline={m.ap_overline({}, o)}
				title={m.ap_title({}, o)}
				lead={m.ap_lead({}, o)}
			/>
			<Band overline={m.ap_person_overline({}, o)} title={m.ap_person_name({}, o)}>
				<div class="grid gap-8 md:grid-cols-2">
					<PractitionerCard name={m.ap_person_name({}, o)} role={m.ap_person_role({}, o)} />
					<dl class="space-y-4">
						{facts.map((f, i) => (
							<div class="flex gap-4 border-b border-line pb-4">
								<dt class="text-data text-ink-faint">{String(i + 1).padStart(2, "0")}</dt>
								<dd class="text-body text-ink">{f}</dd>
							</div>
						))}
					</dl>
				</div>
				<Pending locale={locale}>{m.ap_story_pending({}, o)}</Pending>
			</Band>
			<Band overline={m.ap_company_overline({}, o)} title={m.ap_company_title({}, o)} tinted>
				<Para>{m.ap_company_text({}, o)}</Para>
				<small class="block text-data text-ink-faint">{m.footer_trader({}, o)}</small>
			</Band>
			<NextSteps
				locale={locale}
				links={[
					{ label: m.nav_method({}, o), href: href(locale, "method") },
					{ label: m.nav_contact({}, o), href: href(locale, "contact") },
				]}
			/>
		</PageShell>
	);
}
